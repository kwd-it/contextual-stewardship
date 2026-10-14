#!/usr/bin/env node
// Owner approvals summary for the Contextual ecosystem.
//
// Reads the current open pull requests and issues of the ecosystem repositories
// through the GitHub REST API, maintains one summary issue in the stewardship
// repository, and comments on that issue (mentioning the product owner) only when
// something that needs the owner appears that has not been notified before.
//
// Behaviour and rationale: governance/owner-notifications.md.
//
// Environment:
//   GITHUB_TOKEN      required unless --dry-run (the workflow passes the built-in token)
//   SUMMARY_REPO      repository that holds the summary issue (default kwd-it/contextual-stewardship)
//   ECOSYSTEM_REPOS   comma-separated repositories whose pull requests are scanned
//   OWNER_LOGIN       GitHub login mentioned in notifications (default kwdit)
//
// Flags:
//   --dry-run         read everything, print the body and the comment that would be
//                     posted, write nothing

import { pathToFileURL } from 'node:url';

const API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN || '';
const SUMMARY_REPO = process.env.SUMMARY_REPO || 'kwd-it/contextual-stewardship';
const ECOSYSTEM_REPOS = (process.env.ECOSYSTEM_REPOS ||
  'kwd-it/contextual-stewardship,kwd-it/contextualwp,kwd-it/contextualwp-housebuilder-pack,kwd-it/contextual-console')
  .split(',').map((s) => s.trim()).filter(Boolean);
const OWNER_LOGIN = process.env.OWNER_LOGIN || 'kwdit';
const SUMMARY_LABEL = 'type:approvals';
const SUMMARY_TITLE = 'Pending owner decisions (automated summary)';
const DRY_RUN = process.argv.includes('--dry-run');
export const STATE_MARK = 'owner-approvals:notified';
const BOT_LOGIN = 'github-actions[bot]';
const DAY = 24 * 60 * 60 * 1000;
export const COMPLETED_WINDOW_DAYS = 30;
export const AUTOMATION_GRACE_HOURS = 24;

// A pull request description must record a completed Codex review in these words
// (governance/owner-notifications.md). "Codex review outstanding" does not count.
export const REVIEW_RECORDED = /codex review[^\n]*?(no material findings|material findings resolved)/i;
// A pull request the steward will merge itself (governance/authority-model.md, D-016,
// or a task-authorised merge) carries this line in its description.
export const AUTOMATION_MARK = /^merge:\s*(automatic|steward)\b/im;
// A one-sentence plain-English summary the steward writes for the owner.
const OWNER_SUMMARY = /^(?:owner summary:|#{2,4}[ \t]*owner summary[ \t]*\r?\n+)[ \t]*(.+?)[ \t]*$/im;

const DECISION_LABELS = ['status:proposed', 'status:needs-decision'];
const INTERVENTION_LABELS = ['status:blocked'];
const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']);

const PRODUCTS = {
  'kwd-it/contextualwp': 'ContextualWP',
  'kwd-it/contextualwp-housebuilder-pack': 'Housebuilder Pack',
  'kwd-it/contextual-console': 'Contextual Console',
  'kwd-it/contextual-stewardship': 'Stewardship',
};
const LABEL_PRODUCTS = { 'repo:contextualwp': 'ContextualWP', 'repo:housebuilder-pack': 'Housebuilder Pack', 'repo:console': 'Contextual Console', 'repo:stewardship': 'Stewardship' };

// ---------------------------------------------------------------- GitHub access

async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'contextual-stewardship-owner-approvals' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 404) return { status: 404, data: null };
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

// Paginated read of an endpoint that returns an array, or (with `field`) one that wraps
// its array in an object with total_count.
async function list(path, field) {
  const sep = path.includes('?') ? '&' : '?';
  const out = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await api(`${path}${sep}per_page=100&page=${page}`);
    const chunk = field ? data?.[field] ?? [] : Array.isArray(data) ? data : [];
    out.push(...chunk);
    if (chunk.length < 100) break;
    if (field && out.length >= (data?.total_count ?? 0)) break;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pullRequestDetail(repo, number) {
  // GitHub computes mergeability lazily; the first read can return null.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data } = await api(`/repos/${repo}/pulls/${number}`);
    if (data && data.mergeable !== null) return data;
    await sleep(2000);
  }
  return (await api(`/repos/${repo}/pulls/${number}`)).data;
}

// ---------------------------------------------------------------- pure logic

export function plainTitle(title) {
  let t = (title || '').trim();
  t = t.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '');          // conventional-commit prefix
  t = t.replace(/^(proposal|decision|maintenance)\b[^:]*:\s*/i, ''); // issue-template prefix
  return t ? t[0].toUpperCase() + t.slice(1) : '(untitled)';
}

export function ownerSummary(body, title) {
  const m = (body || '').match(OWNER_SUMMARY);
  return m ? m[1].replace(/[.?!]+$/, '') : plainTitle(title).replace(/[.?!]+$/, '');
}

const short = (sha) => (sha || '').slice(0, 7);
const product = (repo) => PRODUCTS[repo] || repo;
const asQuestion = (s) => `${s}?`;

// Classify one pull request from its REST detail, reviews, check runs and statuses.
// `now` is injectable for tests. Returns {category, kind, key, line}.
export function classifyPullRequest(repo, detail, { reviews = [], runs = [], statuses = [], now = Date.now() } = {}) {
  const sha = detail.head.sha;
  const reasons = [];
  if (detail.draft) reasons.push('draft');

  const latestByUser = new Map();
  for (const r of reviews) if (r.user && r.state !== 'COMMENTED') latestByUser.set(r.user.login, r.state);
  if ([...latestByUser.values()].includes('CHANGES_REQUESTED')) reasons.push('changes requested');

  const pending = runs.some((r) => r.status !== 'completed') || statuses.some((s) => s.state === 'pending');
  const failing = runs.some((r) => FAILED_CONCLUSIONS.has(r.conclusion)) || statuses.some((s) => s.state === 'failure' || s.state === 'error');
  if (pending) reasons.push('checks pending');
  if (failing) reasons.push('checks failing');
  const checkCount = runs.length + statuses.length;
  const checkSummary = checkCount === 0 ? 'no automated checks' : pending ? 'checks pending' : failing ? 'checks failing' : `${checkCount} check${checkCount === 1 ? '' : 's'} passed`;

  if (detail.mergeable === false || detail.mergeable_state === 'dirty') reasons.push('merge conflicts');
  else if (detail.mergeable === null || detail.mergeable_state === 'unknown') reasons.push('mergeability not yet computed');
  else if (detail.mergeable_state === 'blocked') reasons.push('blocked by branch rules');
  else if (detail.mergeable_state === 'behind') reasons.push('behind the base branch');
  else if (detail.mergeable_state === 'unstable') { if (!failing) reasons.push('checks failing'); }
  else if (detail.mergeable_state !== 'clean') reasons.push(`merge state ${detail.mergeable_state}`);

  const body = detail.body || '';
  const codexRecorded = REVIEW_RECORDED.test(body);
  const automatic = AUTOMATION_MARK.test(body);
  const ageHours = (now - Date.parse(detail.created_at || now)) / 3600000;
  const ref = `[#${detail.number}](${detail.html_url})`;
  const summary = ownerSummary(body, detail.title);
  const name = product(repo);

  // Waiting rules come first: a pull request that is not mergeable yet is the steward's
  // to fix whatever its review state.
  if (reasons.length > 0) {
    return { category: 'automation', kind: 'waiting', key: keyFor(detail, codexRecorded), line: `${name}: ${summary} (${ref}; ${reasons.join(', ')})` };
  }
  if (automatic && ageHours <= AUTOMATION_GRACE_HOURS) {
    return { category: 'automation', kind: 'merging', key: keyFor(detail, codexRecorded), line: `${name}: ${summary} (${ref}; being merged automatically, ${checkSummary})` };
  }
  if (automatic) {
    return { category: 'intervention', kind: 'stuck', key: keyFor(detail, codexRecorded), line: `${name}: automatic merge of "${summary}" has not happened after ${AUTOMATION_GRACE_HOURS} hours (${ref})` };
  }
  if (!codexRecorded) {
    return { category: 'intervention', kind: 'unreviewed', key: keyFor(detail, codexRecorded), line: `${name}: "${summary}" needs an independent review before it can be merged (${ref}; ${checkSummary}, head ${short(sha)})` };
  }
  return { category: 'decision', kind: 'merge', key: keyFor(detail, codexRecorded), line: `${name}: ${asQuestion(`merge "${summary}"`)} (${ref}; reviewed, ${checkSummary})` };
}

function keyFor(detail, codexRecorded) {
  return `pr:${detail.html_url}@${detail.head.sha}:${codexRecorded ? 'reviewed' : 'unreviewed'}`;
}

export function classifyIssue(issue) {
  const labels = issue.labels.map((l) => l.name);
  const status = labels.find((l) => l.startsWith('status:')) || '';
  let category = null;
  if (DECISION_LABELS.includes(status)) category = 'decision';
  else if (INTERVENTION_LABELS.includes(status)) category = 'intervention';
  if (!category) return null;
  const name = labels.map((l) => LABEL_PRODUCTS[l]).find(Boolean) || 'Stewardship';
  const summary = ownerSummary(issue.body, issue.title);
  const ref = `[#${issue.number}](${issue.html_url})`;
  const what = status === 'status:blocked' ? 'blocked' : status === 'status:needs-decision' ? 'decision needed' : 'proposal';
  const line = category === 'decision' ? `${name}: ${asQuestion(summary)} (${ref}; ${what})` : `${name}: ${summary} (${ref}; ${what}, see the latest comment)`;
  return { category, kind: what, key: `issue:${issue.html_url}:${status}`, line };
}

export function completedLine(repo, detail) {
  const when = (detail.merged_at || '').slice(0, 10);
  return `${product(repo)}: ${ownerSummary(detail.body, detail.title)} ([#${detail.number}](${detail.html_url}); merged ${when})`;
}

export function markedState(text) {
  const m = (text || '').match(new RegExp(`<!-- ${STATE_MARK} (\\{.*?\\}|\\[.*?\\]) -->`, 's'));
  if (!m) return { keys: [], at: null };
  try {
    const v = JSON.parse(m[1]);
    if (Array.isArray(v)) return { keys: v, at: null };
    return { keys: Array.isArray(v.keys) ? v.keys : [], at: v.at || null };
  } catch { return { keys: [], at: null }; }
}

// Decide what to notify. `items` has decision, intervention, automation lists;
// `priorKeys` is everything notified so far. Keys stay remembered while their item is
// open in any state, so an item that leaves the action set temporarily is not
// notified twice.
export function plan(items, priorKeys) {
  const actionKeys = [...items.decision, ...items.intervention].map((i) => i.key).sort();
  const openKeys = new Set([...actionKeys, ...items.automation.map((i) => i.key)]);
  const priorSet = new Set(priorKeys);
  const newKeys = new Set(actionKeys.filter((k) => !priorSet.has(k)));
  const notifiedKeys = [...new Set([...priorSet, ...newKeys])].filter((k) => openKeys.has(k)).sort();
  return { actionKeys, newKeys, notifiedKeys };
}

function section(title, lines, { hint, newKeys, items } = {}) {
  const out = [`### ${title}`, ''];
  if (hint) out.push(`_${hint}_`, '');
  if (lines.length === 0) out.push('- none');
  for (let i = 0; i < lines.length; i += 1) out.push(`- ${lines[i]}${newKeys && items && newKeys.has(items[i].key) ? ' **(new)**' : ''}`);
  return out.join('\n');
}

export function renderBody(items, completed, state, checkedAt) {
  const parts = [
    `<!-- ${STATE_MARK} ${JSON.stringify(state)} -->`,
    'Maintained automatically by the `owner-approvals` workflow from the current state of the four ecosystem repositories; edits here are overwritten. A comment is posted only when something new needs the owner. How it works: [governance/owner-notifications.md](https://github.com/kwd-it/contextual-stewardship/blob/main/governance/owner-notifications.md).',
    '',
    `Last checked: ${checkedAt}.`,
    '',
    section('Your decisions', items.decision.map((i) => i.line), { hint: 'merge, approve, narrow or decline; nothing happens until you do' }), '',
    section('Needs your intervention', items.intervention.map((i) => i.line), { hint: 'automation cannot move these' }), '',
    section('Being handled automatically (no action needed)', items.automation.map((i) => i.line)), '',
    section(`Completed automatically (last ${COMPLETED_WINDOW_DAYS} days)`, completed.map((c) => c.line)),
  ];
  return parts.join('\n');
}

export function renderComment(items, newKeys, completedSinceLast) {
  const count = items.decision.length + items.intervention.length;
  const parts = [
    `<!-- ${STATE_MARK} ${JSON.stringify({ keys: [...newKeys].sort() })} -->`,
    `@${OWNER_LOGIN} Contextual: ${count} ${count === 1 ? 'decision' : 'decisions'} needed`,
    '',
  ];
  if (completedSinceLast.length > 0) {
    parts.push('Completed automatically since the last notification:');
    for (const c of completedSinceLast) parts.push(`- ${c.line}`);
    parts.push('');
  }
  if (items.decision.length > 0) {
    parts.push('Your decisions:');
    for (const i of items.decision) parts.push(`- ${i.line}${newKeys.has(i.key) ? ' **(new)**' : ''}`);
    parts.push('');
  }
  if (items.intervention.length > 0) {
    parts.push('Needs your intervention:');
    for (const i of items.intervention) parts.push(`- ${i.line}${newKeys.has(i.key) ? ' **(new)**' : ''}`);
    parts.push('');
  }
  parts.push('Everything else is being handled.');
  return parts.join('\n');
}

// ---------------------------------------------------------------- GitHub reads and writes

async function gather(now) {
  const items = { decision: [], intervention: [], automation: [] };
  const completed = [];
  const since = now - COMPLETED_WINDOW_DAYS * DAY;
  for (const repo of ECOSYSTEM_REPOS) {
    for (const pr of await list(`/repos/${repo}/pulls?state=open`)) {
      const detail = await pullRequestDetail(repo, pr.number);
      const reviews = await list(`/repos/${repo}/pulls/${pr.number}/reviews`);
      const runs = await list(`/repos/${repo}/commits/${detail.head.sha}/check-runs`, 'check_runs');
      const statuses = await list(`/repos/${repo}/commits/${detail.head.sha}/status`, 'statuses');
      const item = classifyPullRequest(repo, detail, { reviews, runs, statuses, now });
      items[item.category].push(item);
    }
    const { data: closed } = await api(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`);
    for (const pr of closed || []) {
      if (!pr.merged_at || Date.parse(pr.merged_at) < since) continue;
      if (!AUTOMATION_MARK.test(pr.body || '')) continue;
      completed.push({ repo, mergedAt: pr.merged_at, line: completedLine(repo, pr) });
    }
  }
  for (const issue of await list(`/repos/${SUMMARY_REPO}/issues?state=open`)) {
    if (issue.pull_request) continue;
    if (issue.labels.some((l) => l.name === SUMMARY_LABEL)) continue;
    const item = classifyIssue(issue);
    if (item) items[item.category].push(item);
  }
  completed.sort((a, b) => (a.mergedAt < b.mergedAt ? 1 : -1));
  return { items, completed };
}

// Everything notified so far: the set stored in the issue body plus the sets marked in
// every notification comment. A failed body update after a posted comment therefore
// never causes a second notification, and a failed comment never suppresses one.
async function notifiedSoFar(issue) {
  const body = markedState(issue.body);
  const keys = new Set(body.keys);
  let at = body.at;
  for (const c of await list(`/repos/${SUMMARY_REPO}/issues/${issue.number}/comments`)) {
    if (c.user?.login !== BOT_LOGIN) continue;
    for (const k of markedState(c.body).keys) keys.add(k);
    if (!at || c.created_at > at) at = c.created_at;
  }
  return { keys, at };
}

async function ensureLabel() {
  const { status } = await api(`/repos/${SUMMARY_REPO}/labels/${encodeURIComponent(SUMMARY_LABEL)}`);
  if (status === 404) await api(`/repos/${SUMMARY_REPO}/labels`, { method: 'POST', body: { name: SUMMARY_LABEL, color: 'D4C5F9', description: 'Automated summary of pending owner decisions' } });
}

async function findSummaryIssue() {
  const issues = await list(`/repos/${SUMMARY_REPO}/issues?state=open&labels=${encodeURIComponent(SUMMARY_LABEL)}`);
  return issues.find((i) => !i.pull_request) || null;
}

async function main() {
  if (!TOKEN && !DRY_RUN) throw new Error('GITHUB_TOKEN is required');
  const now = Date.now();
  const { items, completed } = await gather(now);
  const checkedAt = new Date(now).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

  const existing = await findSummaryIssue();
  const prior = existing ? await notifiedSoFar(existing) : { keys: new Set(), at: null };
  const { actionKeys, newKeys, notifiedKeys } = plan(items, prior.keys);
  const completedSinceLast = completed.filter((c) => !prior.at || c.mergedAt > prior.at);
  const notifiedAt = newKeys.size > 0 ? new Date(now).toISOString() : prior.at;
  const body = renderBody(items, completed, { keys: notifiedKeys, at: notifiedAt }, checkedAt);
  const comment = newKeys.size > 0 ? renderComment(items, newKeys, completedSinceLast) : null;

  console.log(`Needs the owner: ${actionKeys.length} (decisions ${items.decision.length}, intervention ${items.intervention.length}); handled automatically ${items.automation.length}; completed automatically ${completed.length}`);
  console.log(existing ? `Summary issue: #${existing.number} (${prior.keys.size} previously notified items)` : 'Summary issue: none yet');
  console.log(comment ? `Notification: ${newKeys.size} new item(s)` : 'Notification: none (nothing new needs the owner)');

  if (DRY_RUN) {
    console.log('\n--- body ---\n' + body);
    if (comment) console.log('\n--- comment ---\n' + comment);
    return;
  }

  await ensureLabel();
  let issueNumber;
  if (existing) {
    issueNumber = existing.number;
  } else {
    // Created with an empty notified set so that, if the comment below fails, the next
    // run still notifies.
    const { data } = await api(`/repos/${SUMMARY_REPO}/issues`, { method: 'POST', body: { title: SUMMARY_TITLE, body: renderBody(items, completed, { keys: [], at: null }, checkedAt), labels: [SUMMARY_LABEL] } });
    issueNumber = data.number;
    console.log(`Created summary issue #${issueNumber}`);
  }
  // Comment first, then record the state: see notifiedSoFar for why either order of
  // failure is safe.
  if (comment) {
    const { data } = await api(`/repos/${SUMMARY_REPO}/issues/${issueNumber}/comments`, { method: 'POST', body: { body: comment } });
    console.log(`Posted notification: ${data.html_url}`);
  }
  if (!existing || existing.body !== body) await api(`/repos/${SUMMARY_REPO}/issues/${issueNumber}`, { method: 'PATCH', body: { body } });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => { console.error(err.message || err); process.exit(1); });
}
