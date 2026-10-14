#!/usr/bin/env node
// Autonomous merge of documentation and test-only maintenance pull requests (D-016).
//
// Evaluates one pull request against every condition of the policy in
// governance/authority-model.md ("Autonomous merge of documentation and test-only
// maintenance") and merges it only when all of them hold. Anything unknown or
// ambiguous is ineligible. The evaluation is a pure function (`evaluate`) so it can
// be tested without GitHub; the CLI fetches the inputs through the REST API.
//
// Usage:
//   node tooling/merge/autonomous-merge.mjs <owner/repo> <number> --reviewed <sha> [--dry-run]
//
//   --reviewed <sha>   the head commit the completed Codex review covered (full SHA or
//                      a prefix of at least 7 characters); may be omitted when the pull
//                      request description carries a "Reviewed head: <sha>" line
//   --dry-run          evaluate and report, merge nothing
//   --via-gh           send every request through the authenticated `gh api` command
//                      (the default when GITHUB_TOKEN is absent); `gh` honours the
//                      HTTPS proxy of environments such as the Routine's, which Node's
//                      fetch does not
//
// Exit codes: 0 merged (or already merged); 2 not eligible (reasons printed);
//             1 error.
//
// Environment: GITHUB_TOKEN, or an authenticated `gh`.

import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN || '';
const VIA_GH = process.argv.includes('--via-gh') || !TOKEN;

// Repositories where merging the default branch cannot trigger a production
// deployment, verified as recorded in governance/authority-model.md. The merge method
// follows each repository's history convention. A repository absent from this list is
// ineligible whatever its pull request contains.
export const REPOSITORIES = {
  'kwd-it/contextualwp': { defaultBranch: 'main', mergeMethod: 'merge' },
  'kwd-it/contextualwp-housebuilder-pack': { defaultBranch: 'main', mergeMethod: 'rebase' },
  'kwd-it/contextual-console': { defaultBranch: 'master', mergeMethod: 'rebase' },
};

export const LIMITS = { files: 20, lines: 400 };
export const REVIEW_RECORDED = /codex review[^\n]*?(no material findings|material findings resolved)/i;
export const REVIEWED_HEAD = /^reviewed head:\s*([0-9a-f]{7,40})\b/im;
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

// Paths that are never low-risk maintenance, checked before the allow list: CI and
// deployment configuration, governance, policy and AI instruction files, dependency
// manifests, runtime configuration, contract-defining documents and anything that
// carries a version.
const DENY = [
  /^\.github\//, /^\.cursor\//, /^\.claude\//, /^\.codex\//, /^\.agents?\//, /^governance\//,
  /(^|\/)(CLAUDE|AGENTS|DEVNOTES|GEMINI|SECURITY|CONTRIBUTING|CODE_OF_CONDUCT|CODEOWNERS|COMPATIBILITY|PACK-SPEC|SKILL|copilot-instructions)(\.md)?$/i,
  /(^|\/)(LICENSE|LICENCE|COPYING|NOTICE|FUNDING)(\.|$)/i, /(^|\/)\.?[a-z]*rules$/i,
  /(^|\/)(composer|package|package-lock)\.json$/, /(^|\/)composer\.lock$/, /(^|\/)(yarn|pnpm)-lock/,
  /(^|\/)phpunit(\.dist)?\.xml(\.dist)?$/, /(^|\/)\.env/, /(^|\/)Dockerfile/, /(^|\/)readme\.txt$/i,
  /(^|\/)(config|database|routes|app|src|includes|admin|resources|public|bootstrap)\//,
];
// Everything a change may touch: Markdown anywhere, text files under docs/, and files
// under tests/. The deny list above wins.
const ALLOW = [/\.md$/i, /^docs\/.*\.(md|txt)$/i, /^tests\//];

const ASSERTION = /(\$this->assert\w*\(|\bassert\w*\(|\bexpect\(|->to[A-Z]\w*\(|->not->|->assert\w*\()/;
const TEST_DECLARATION = /(public function test\w*\(|#\[Test\]|@test\b|\bit\(\s*['"]|\btest\(\s*['"])/;
const WEAKENING = /(markTestSkipped|markTestIncomplete|->skip\(|->todo\(|->only\(|@group\s+skip|xit\(|xtest\(|@skip)/;
// Headings a maintenance change may add to or remove from a changelog: "Unreleased"
// and the Keep a Changelog category headings. Anything else (a version, a date, a
// restructuring) is a release or an editorial decision and is left to the owner.
const PERMITTED_CHANGELOG_HEADING = /^(\[?unreleased\]?|added|changed|deprecated|removed|fixed|security)\s*$/i;
const CHANGELOG = /(^|\/)(changelog|changes|history|releases?)\.md$/i;

function pathReasons(path) {
  if (DENY.some((re) => re.test(path))) return [`${path}: not maintenance (denied path)`];
  if (!ALLOW.some((re) => re.test(path))) return [`${path}: outside the documentation and tests allow list`];
  return [];
}

// The "before" and "after" views of a unified diff (GitHub's patch field, which has
// hunk headers but no file headers): context lines appear in both, removed lines only
// in before, added lines only in after. Hunks are separated by an empty line so that
// a heading cannot be assembled across hunks.
export function hunkViews(patch) {
  const before = [];
  const after = [];
  for (const line of (patch || '').split('\n')) {
    if (line.startsWith('@@')) { before.push(''); after.push(''); continue; }
    if (line.startsWith('\\')) continue;
    const text = line.slice(1);
    if (line.startsWith('+')) after.push(text);
    else if (line.startsWith('-')) before.push(text);
    else { before.push(text); after.push(text); }
  }
  return { before, after };
}

// Headings that differ between two views, as a multiset difference over level and
// text, so a heading whose text changed above an unchanged Setext underline, whose
// underline was removed, or whose level changed is reported. Returns the texts.
export function changedHeadings(beforeLines, afterLines) {
  const count = (list) => list.reduce((m, h) => m.set(h, (m.get(h) || 0) + 1), new Map());
  const b = count(headingsIn(beforeLines));
  const a = count(headingsIn(afterLines));
  const changed = [];
  for (const [h, n] of a) if (n > (b.get(h) || 0)) changed.push(h);
  for (const [h, n] of b) if (n > (a.get(h) || 0)) changed.push(h);
  return changed.map((h) => h.replace(/^\d+:/, ''));
}

// Headings in a list of lines as "<level>:<text>": ATX ("## Title") and Setext
// ("Title" underlined by === for level 1 or --- for level 2).
export function headingsIn(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const atx = lines[i].match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (atx) { out.push(`${atx[1].length}:${atx[2]}`); continue; }
    const underline = lines[i].match(/^\s{0,3}(=+|-+)\s*$/);
    if (underline && i > 0 && lines[i - 1].trim() !== '' && !/^\s{0,3}[-*+]\s/.test(lines[i - 1]) && !/^\s{0,3}#{1,6}\s/.test(lines[i - 1])) out.push(`${underline[1][0] === '=' ? 1 : 2}:${lines[i - 1].trim()}`);
  }
  return out;
}

// `objects` maps paths to {type, size} from the Git trees of the head commit (for the
// path as it is after the change) and the base commit (for removed and renamed-from
// paths). Types: 'file' (mode 100644), 'executable', 'symlink', 'submodule', 'tree'.
export function checkFile(file, objects = {}) {
  const path = file.filename;
  const reasons = pathReasons(path);
  const previous = file.previous_filename;
  if (previous) {
    reasons.push(...pathReasons(previous).map((r) => `renamed from ${r}`));
    if (/^tests\//.test(previous) && !/^tests\//.test(path)) reasons.push(`${previous}: moved out of tests/`);
  }
  if (file.status === 'removed' && /^tests\//.test(path)) reasons.push(`${path}: test file removed`);

  const headObject = file.status === 'removed' ? null : objects[`head:${path}`];
  const baseObject = file.status === 'added' ? null : objects[`base:${previous || path}`];
  for (const [label, object, needed] of [['head', headObject, file.status !== 'removed'], ['base', baseObject, file.status !== 'added']]) {
    if (!needed) continue;
    if (!object) reasons.push(`${label === 'head' ? path : previous || path}: object type unknown at ${label}`);
    else if (object.type !== 'file') reasons.push(`${label === 'head' ? path : previous || path}: is ${object.type === 'executable' ? 'an executable' : `a ${object.type}`}, not an ordinary file`);
  }

  // Diff content is required. GitHub omits the patch for binary and oversized files;
  // the only accepted exception is an empty text file, established from the tree.
  const counted = (file.additions || 0) + (file.deletions || 0);
  const hasPatch = typeof file.patch === 'string' && file.patch !== '';
  if (!hasPatch) {
    const relevant = file.status === 'removed' ? baseObject : headObject;
    const emptyText = counted === 0 && relevant && relevant.type === 'file' && relevant.size === 0 && (file.status !== 'modified' || (baseObject?.size === 0 && headObject?.size === 0));
    if (!emptyText) reasons.push(`${path}: no diff content available`);
  }
  const patch = hasPatch ? file.patch : '';
  const lines = patch.split('\n').filter((l) => !l.startsWith('@@') && !l.startsWith('\\'));
  const added = lines.filter((l) => l.startsWith('+')).map((l) => l.slice(1));
  const removed = lines.filter((l) => l.startsWith('-')).map((l) => l.slice(1));
  if (/^tests\//.test(path)) {
    if (added.some((l) => WEAKENING.test(l))) reasons.push(`${path}: adds a skip, todo or only marker`);
    const removedAssertions = removed.filter((l) => ASSERTION.test(l)).length;
    const addedAssertions = added.filter((l) => ASSERTION.test(l)).length;
    if (removedAssertions > addedAssertions) reasons.push(`${path}: removes assertions (${removedAssertions} removed, ${addedAssertions} added)`);
    const removedTests = removed.filter((l) => TEST_DECLARATION.test(l)).length;
    const addedTests = added.filter((l) => TEST_DECLARATION.test(l)).length;
    if (removedTests > addedTests) reasons.push(`${path}: removes tests (${removedTests} removed, ${addedTests} added)`);
  }
  if (CHANGELOG.test(path) || (previous && CHANGELOG.test(previous))) {
    const { before, after } = hunkViews(patch);
    if (changedHeadings(before, after).some((h) => !PERMITTED_CHANGELOG_HEADING.test(h))) reasons.push(`${path}: changes a heading other than Unreleased or a Keep a Changelog category`);
    if (previous && previous !== path) reasons.push(`${path}: renames a changelog`);
  }
  return reasons;
}

// Pure evaluation. `input` carries everything read from GitHub:
//   repo, pr (REST pull request object), files (REST files list), objects (see
//   checkFile), reviews, checkRuns, statuses, reviewedSha (from --reviewed or the
//   description), treesComplete (false when either tree listing was truncated).
export function evaluate(input) {
  const { repo, pr, files, objects = {}, reviews = [], checkRuns = [], statuses = [], reviewedSha, treesComplete = true } = input;
  const reasons = [];
  const policy = REPOSITORIES[repo];

  if (!policy) reasons.push(`${repo}: not a repository where unattended merge is permitted`);
  if (pr.state !== 'open') reasons.push(`pull request is ${pr.state}`);
  if (pr.merged) reasons.push('already merged');
  if (pr.draft) reasons.push('draft');
  if (policy && pr.base?.ref !== policy.defaultBranch) reasons.push(`base is ${pr.base?.ref}, not ${policy.defaultBranch}`);
  if (!pr.head?.repo || pr.head.repo.full_name !== pr.base?.repo?.full_name) reasons.push('head branch is not in this repository (fork)');
  if (!TRUSTED_ASSOCIATIONS.has(pr.author_association)) reasons.push(`author association ${pr.author_association} is not trusted`);
  if (/^chore\(release\)/i.test(pr.title || '')) reasons.push('release commit');

  const body = pr.body || '';
  if (!REVIEW_RECORDED.test(body)) reasons.push('description does not record a completed Codex review');
  const headSha = pr.head?.sha || '';
  if (!reviewedSha) reasons.push('no reviewed head supplied or recorded');
  else if (!/^[0-9a-f]{7,40}$/i.test(reviewedSha)) reasons.push(`reviewed head ${reviewedSha} is not a commit SHA`);
  else if (!headSha.toLowerCase().startsWith(reviewedSha.toLowerCase())) reasons.push(`head ${headSha.slice(0, 7)} differs from the reviewed head ${reviewedSha.slice(0, 7)}`);

  if (pr.mergeable !== true) reasons.push(`mergeable is ${pr.mergeable === null ? 'not yet computed' : pr.mergeable}`);
  if (pr.mergeable_state !== 'clean') reasons.push(`merge state is ${pr.mergeable_state}`);

  const latestByUser = new Map();
  for (const r of reviews) if (r.user && r.state !== 'COMMENTED') latestByUser.set(r.user.login, r.state);
  if ([...latestByUser.values()].includes('CHANGES_REQUESTED')) reasons.push('a review requests changes');

  // Every check must have completed with success; skipped, neutral, pending, failed
  // and unknown outcomes are all ineligible.
  if (checkRuns.some((r) => r.status !== 'completed') || statuses.some((s) => s.state === 'pending')) reasons.push('checks pending');
  const notSuccessful = [...checkRuns.filter((r) => r.status === 'completed' && r.conclusion !== 'success'), ...statuses.filter((s) => s.state !== 'pending' && s.state !== 'success')];
  if (notSuccessful.length > 0) reasons.push(`checks not all successful (${notSuccessful.map((c) => c.conclusion || c.state).join(', ')})`);

  if (!treesComplete) reasons.push('repository tree listing was truncated; object types cannot be established');
  if (!Array.isArray(files) || files.length === 0) reasons.push('no files');
  else {
    if (files.length > LIMITS.files) reasons.push(`${files.length} files changed (limit ${LIMITS.files})`);
    const lines = files.reduce((n, f) => n + (f.additions || 0) + (f.deletions || 0), 0);
    if (lines > LIMITS.lines) reasons.push(`${lines} lines changed (limit ${LIMITS.lines})`);
    for (const f of files) reasons.push(...checkFile(f, objects));
  }

  return { eligible: reasons.length === 0, reasons, mergeMethod: policy?.mergeMethod, headSha, checks: checkRuns.length + statuses.length };
}

export function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const reviewedIndex = argv.indexOf('--reviewed');
  const reviewed = reviewedIndex >= 0 ? argv[reviewedIndex + 1] : undefined;
  const positional = argv.filter((a, i) => !a.startsWith('--') && !(reviewedIndex >= 0 && i === reviewedIndex + 1));
  const [repo, numberArg] = positional;
  return { repo, number: Number(numberArg), dryRun, reviewed };
}

// One REST call through `gh api --include`, parsed into the same shape as the fetch
// transport. `gh` exits 1 on an HTTP error but still prints the response.
function ghApi(path, method, body) {
  const args = ['api', '--include', '-X', method, '-H', 'X-GitHub-Api-Version: 2022-11-28', path.replace(/^\//, '')];
  if (body !== undefined) args.push('--input', '-');
  const r = spawnSync(process.platform === 'win32' ? 'gh.exe' : 'gh', args, { input: body === undefined ? undefined : JSON.stringify(body), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`gh api failed to start: ${r.error.message}`);
  const out = r.stdout || '';
  const sep = out.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
  const idx = out.indexOf(sep);
  const head = idx >= 0 ? out.slice(0, idx) : out;
  const text = idx >= 0 ? out.slice(idx + sep.length) : '';
  const status = Number((head.match(/^HTTP\/[\d.]+\s+(\d{3})/m) || [])[1]);
  if (!status) throw new Error(`gh api ${method} ${path}: no HTTP status in the response (${(r.stderr || '').trim().slice(0, 200)})`);
  let data = null;
  try { data = text.trim() ? JSON.parse(text) : null; } catch { data = text; }
  return { status, ok: status >= 200 && status < 300, data };
}

async function api(path, { method = 'GET', body } = {}) {
  if (VIA_GH) return ghApi(path, method, body);
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'contextual-stewardship-autonomous-merge' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function listAll(path, field) {
  const sep = path.includes('?') ? '&' : '?';
  const out = [];
  for (let page = 1; page <= 20; page += 1) {
    const { ok, status, data } = await api(`${path}${sep}per_page=100&page=${page}`);
    if (!ok) throw new Error(`GET ${path} -> HTTP ${status}`);
    const chunk = field ? data?.[field] ?? [] : data;
    out.push(...chunk);
    if (chunk.length < 100) break;
    if (field && out.length >= (data?.total_count ?? 0)) break;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPullRequest(repo, number) {
  let pr;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { ok, status, data } = await api(`/repos/${repo}/pulls/${number}`);
    if (!ok) throw new Error(`GET pull request -> HTTP ${status}`);
    pr = data;
    if (pr.mergeable !== null) break;
    await sleep(2000);
  }
  return pr;
}

const MODES = { '100644': 'file', '100755': 'executable', '120000': 'symlink', '160000': 'submodule', '040000': 'tree' };

// Object type and size of every path in a commit's tree, from the Git trees API,
// which reports the Git mode (the contents API follows symlinks and cannot be used).
async function fetchTree(repo, sha, prefix) {
  const { ok, status, data } = await api(`/repos/${repo}/git/trees/${sha}?recursive=1`);
  if (!ok) throw new Error(`GET tree ${sha.slice(0, 7)} -> HTTP ${status}`);
  const objects = {};
  for (const entry of data.tree || []) objects[`${prefix}:${entry.path}`] = { type: MODES[entry.mode] || `mode ${entry.mode}`, size: entry.size ?? null };
  return { objects, complete: data.truncated !== true };
}

async function main(argv) {
  const { repo, number, dryRun, reviewed: reviewedArg } = parseArgs(argv);
  if (!repo || !Number.isInteger(number)) throw new Error('usage: autonomous-merge.mjs <owner/repo> <number> --reviewed <sha> [--dry-run]');
  if (VIA_GH) {
    const auth = spawnSync(process.platform === 'win32' ? 'gh.exe' : 'gh', ['auth', 'status'], { encoding: 'utf8' });
    if (auth.status !== 0) throw new Error('GITHUB_TOKEN is absent and gh is not authenticated');
  }

  const pr = await fetchPullRequest(repo, number);
  if (pr.merged) { console.log(`${repo}#${number} is already merged (${pr.merge_commit_sha?.slice(0, 7)}); nothing to do`); return 0; }
  const files = await listAll(`/repos/${repo}/pulls/${number}/files`);
  const reviews = await listAll(`/repos/${repo}/pulls/${number}/reviews`);
  const sha = pr.head.sha;
  const head = await fetchTree(repo, sha, 'head');
  const base = await fetchTree(repo, pr.base.sha, 'base');
  const objects = { ...head.objects, ...base.objects };
  const checkRuns = await listAll(`/repos/${repo}/commits/${sha}/check-runs`, 'check_runs');
  const statuses = await listAll(`/repos/${repo}/commits/${sha}/status`, 'statuses');
  const reviewedSha = reviewedArg || (pr.body || '').match(REVIEWED_HEAD)?.[1];

  const result = evaluate({ repo, pr, files, objects, reviews, checkRuns, statuses, reviewedSha, treesComplete: head.complete && base.complete });
  console.log(`${repo}#${number} "${pr.title}" head ${sha.slice(0, 7)}: ${result.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'} for autonomous merge`);
  for (const r of result.reasons) console.log(`  - ${r}`);
  if (!result.eligible) return 2;
  console.log(`  files: ${files.map((f) => f.filename).join(', ')}`);
  console.log(`  checks: ${result.checks === 0 ? 'none configured' : `${result.checks} passed`}; merge method ${result.mergeMethod}`);
  if (dryRun) { console.log('  dry run: not merging'); return 0; }

  // `sha` makes GitHub refuse the merge if the head moved since evaluation.
  const merge = await api(`/repos/${repo}/pulls/${number}/merge`, { method: 'PUT', body: { sha, merge_method: result.mergeMethod } });
  if (!merge.ok) {
    const msg = typeof merge.data === 'object' ? merge.data?.message : merge.data;
    throw new Error(`merge refused: HTTP ${merge.status} ${msg || ''}`.trim());
  }
  console.log(`  merged: ${merge.data.sha?.slice(0, 7)} (${merge.data.message})`);
  const comment = [
    `Merged automatically under the autonomous merge policy for documentation and test-only maintenance (D-016 in kwd-it/contextual-stewardship).`,
    '',
    `- Reviewed head: ${sha}`,
    `- Checks: ${result.checks === 0 ? 'none configured; validated locally as described above' : `${result.checks} passed`}`,
    `- Files: ${files.map((f) => `\`${f.filename}\``).join(', ')}`,
    `- Merge: ${result.mergeMethod}, commit ${merge.data.sha}`,
  ].join('\n');
  const c = await api(`/repos/${repo}/issues/${number}/comments`, { method: 'POST', body: { body: comment } });
  if (!c.ok) console.log(`  warning: merged but the audit comment failed (HTTP ${c.status})`);
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((err) => { console.error(err.message || err); process.exit(1); });
}
