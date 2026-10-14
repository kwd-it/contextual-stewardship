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
//
// Exit codes: 0 merged (or already merged); 2 not eligible (reasons printed);
//             1 error.
//
// Environment: GITHUB_TOKEN (required unless --dry-run).

import { pathToFileURL } from 'node:url';

const API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN || '';

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
const PERMITTED_CHANGELOG_HEADING = /^#{1,6}\s*(\[?unreleased\]?|added|changed|deprecated|removed|fixed|security)\s*$/i;

function pathReasons(path) {
  if (DENY.some((re) => re.test(path))) return [`${path}: not maintenance (denied path)`];
  if (!ALLOW.some((re) => re.test(path))) return [`${path}: outside the documentation and tests allow list`];
  return [];
}

// `types` maps each non-removed path to its Git object type as GitHub reports it
// ('file', 'symlink', 'submodule', 'dir'); anything but 'file' is ineligible, and a
// path with no recorded type is treated as unknown.
export function checkFile(file, types = {}) {
  const path = file.filename;
  const reasons = pathReasons(path);
  if (file.previous_filename) {
    reasons.push(...pathReasons(file.previous_filename).map((r) => `renamed from ${r}`));
    if (/^tests\//.test(file.previous_filename) && !/^tests\//.test(path)) reasons.push(`${file.previous_filename}: moved out of tests/`);
  }
  if (file.status === 'removed' && /^tests\//.test(path)) reasons.push(`${path}: test file removed`);
  if (file.status !== 'removed') {
    const type = types[path];
    if (type !== 'file') reasons.push(`${path}: ${type ? `is a ${type}` : 'file type unknown'}, not an ordinary file`);
  }
  const changes = (file.additions || 0) + (file.deletions || 0) + (file.changes || 0);
  if (typeof file.patch !== 'string' || (file.patch === '' && file.status !== 'removed')) {
    if (file.status !== 'removed' || changes > 0) reasons.push(`${path}: no diff content available`);
  }
  const patch = typeof file.patch === 'string' ? file.patch : '';
  const added = patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  const removed = patch.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
  if (/^tests\//.test(path)) {
    if (added.some((l) => WEAKENING.test(l))) reasons.push(`${path}: adds a skip, todo or only marker`);
    const removedAssertions = removed.filter((l) => ASSERTION.test(l)).length;
    const addedAssertions = added.filter((l) => ASSERTION.test(l)).length;
    if (removedAssertions > addedAssertions) reasons.push(`${path}: removes assertions (${removedAssertions} removed, ${addedAssertions} added)`);
    const removedTests = removed.filter((l) => TEST_DECLARATION.test(l)).length;
    const addedTests = added.filter((l) => TEST_DECLARATION.test(l)).length;
    if (removedTests > addedTests) reasons.push(`${path}: removes tests (${removedTests} removed, ${addedTests} added)`);
  }
  if (/changelog\.md$/i.test(path)) {
    const headings = [...added, ...removed].map((l) => l.slice(1).trim()).filter((l) => /^#{1,6}\s/.test(l));
    if (headings.some((h) => !PERMITTED_CHANGELOG_HEADING.test(h))) reasons.push(`${path}: changes a heading other than Unreleased or a Keep a Changelog category`);
  }
  return reasons;
}

// Pure evaluation. `input` carries everything read from GitHub:
//   repo, pr (REST pull request object), files (REST files list), types (path -> Git
//   object type at the head), reviews, checkRuns, statuses, reviewedSha (from
//   --reviewed or the description).
export function evaluate(input) {
  const { repo, pr, files, types = {}, reviews = [], checkRuns = [], statuses = [], reviewedSha } = input;
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

  if (!Array.isArray(files) || files.length === 0) reasons.push('no files');
  else {
    if (files.length > LIMITS.files) reasons.push(`${files.length} files changed (limit ${LIMITS.files})`);
    const lines = files.reduce((n, f) => n + (f.additions || 0) + (f.deletions || 0), 0);
    if (lines > LIMITS.lines) reasons.push(`${lines} lines changed (limit ${LIMITS.lines})`);
    for (const f of files) reasons.push(...checkFile(f, types));
  }

  return { eligible: reasons.length === 0, reasons, mergeMethod: policy?.mergeMethod, headSha, checks: checkRuns.length + statuses.length };
}

async function api(path, { method = 'GET', body } = {}) {
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

// Git object type of each non-removed path at the head commit, from the contents API.
async function fetchTypes(repo, files, sha) {
  const types = {};
  for (const f of files) {
    if (f.status === 'removed') continue;
    const { ok, data } = await api(`/repos/${repo}/contents/${f.filename.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`);
    if (ok && data && !Array.isArray(data) && typeof data.type === 'string') types[f.filename] = data.type;
  }
  return types;
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const reviewedIndex = argv.indexOf('--reviewed');
  const reviewedArg = reviewedIndex >= 0 ? argv[reviewedIndex + 1] : undefined;
  const positional = argv.filter((a, i) => !a.startsWith('--') && i !== reviewedIndex + 1);
  const [repo, numberArg] = positional;
  const number = Number(numberArg);
  if (!repo || !Number.isInteger(number)) throw new Error('usage: autonomous-merge.mjs <owner/repo> <number> --reviewed <sha> [--dry-run]');
  if (!TOKEN && !dryRun) throw new Error('GITHUB_TOKEN is required');

  const pr = await fetchPullRequest(repo, number);
  if (pr.merged) { console.log(`${repo}#${number} is already merged (${pr.merge_commit_sha?.slice(0, 7)}); nothing to do`); return 0; }
  const files = await listAll(`/repos/${repo}/pulls/${number}/files`);
  const reviews = await listAll(`/repos/${repo}/pulls/${number}/reviews`);
  const sha = pr.head.sha;
  const types = await fetchTypes(repo, files, sha);
  const checkRuns = await listAll(`/repos/${repo}/commits/${sha}/check-runs`, 'check_runs');
  const statuses = await listAll(`/repos/${repo}/commits/${sha}/status`, 'statuses');
  const reviewedSha = reviewedArg || (pr.body || '').match(REVIEWED_HEAD)?.[1];

  const result = evaluate({ repo, pr, files, types, reviews, checkRuns, statuses, reviewedSha });
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
