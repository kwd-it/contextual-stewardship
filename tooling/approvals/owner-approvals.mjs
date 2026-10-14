#!/usr/bin/env node
// Owner approvals summary for the Contextual ecosystem.
//
// Reads the current open pull requests and issues of the ecosystem repositories
// through the GitHub REST API, maintains one summary issue in the stewardship
// repository, and comments on that issue (mentioning the product owner) only when
// an action item appears that has not been notified before.
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

import { createHash } from 'node:crypto';

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
const STATE_MARK = 'owner-approvals:notified';
const BOT_LOGIN = 'github-actions[bot]';

// A pull request description must record a completed Codex review in these words
// (governance/owner-notifications.md). "Codex review outstanding" does not count.
const REVIEW_RECORDED = /codex review[^\n]*?(no material findings|material findings resolved)/i;

const DECISION_LABELS = ['status:proposed', 'status:needs-decision'];
const INTERVENTION_LABELS = ['status:blocked'];
const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']);

async function api(path, { method = 'GET', body } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'contextual-stewardship-owner-approvals',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 404) return { status: 404, data: null };
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

// Paginated read of an endpoint that returns an array.
async function list(path) {
  const sep = path.includes('?') ? '&' : '?';
  const out = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await api(`${path}${sep}per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

// Paginated read of an endpoint that wraps its array in an object with total_count
// (check runs and combined commit statuses).
async function listNested(path, field) {
  const sep = path.includes('?') ? '&' : '?';
  const out = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await api(`${path}${sep}per_page=100&page=${page}`);
    const chunk = data?.[field] ?? [];
    out.push(...chunk);
    if (chunk.length < 100 || out.length >= (data?.total_count ?? 0)) break;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (sha) => sha.slice(0, 7);

async function pullRequestDetail(repo, number) {
  // GitHub computes mergeability lazily; the first read can return null.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data } = await api(`/repos/${repo}/pulls/${number}`);
    if (data && data.mergeable !== null) return data;
    await sleep(2000);
  }
  return (await api(`/repos/${repo}/pulls/${number}`)).data;
}

async function classifyPullRequest(repo, pr) {
  const detail = await pullRequestDetail(repo, pr.number);
  const sha = detail.head.sha;
  const reasons = [];

  if (detail.draft) reasons.push('draft');

  const reviews = await list(`/repos/${repo}/pulls/${pr.number}/reviews`);
  const latestByUser = new Map();
  for (const r of reviews) if (r.user && r.state !== 'COMMENTED') latestByUser.set(r.user.login, r.state);
  if ([...latestByUser.values()].includes('CHANGES_REQUESTED')) reasons.push('changes requested');

  const runs = await listNested(`/repos/${repo}/commits/${sha}/check-runs`, 'check_runs');
  const statuses = await listNested(`/repos/${repo}/commits/${sha}/status`, 'statuses');
  const pending = runs.some((r) => r.status !== 'completed') || statuses.some((s) => s.state === 'pending');
  const failing = runs.some((r) => FAILED_CONCLUSIONS.has(r.conclusion)) || statuses.some((s) => s.state === 'failure' || s.state === 'error');
  if (pending) reasons.push('checks pending');
  if (failing) reasons.push('checks failing');
  const checkCount = runs.length + statuses.length;
  const checkSummary = checkCount === 0 ? 'no checks configured' : pending ? 'checks pending' : failing ? 'checks failing' : `${checkCount} check${checkCount === 1 ? '' : 's'} passed`;

  if (detail.mergeable === false || detail.mergeable_state === 'dirty') reasons.push('merge conflicts');
  else if (detail.mergeable === null || detail.mergeable_state === 'unknown') reasons.push('mergeability not yet computed');
  else if (detail.mergeable_state === 'blocked') reasons.push('blocked by branch rules');
  else if (detail.mergeable_state === 'behind') reasons.push('behind the base branch');
  else if (detail.mergeable_state === 'unstable') { if (!failing) reasons.push('checks failing'); }
  else if (detail.mergeable_state !== 'clean') reasons.push(`merge state ${detail.mergeable_state}`);

  const codexRecorded = REVIEW_RECORDED.test(detail.body || '');

  // Waiting rules come first: a pull request that is not mergeable yet is the steward's
  // to fix whatever its review state. Only a mergeable pull request without a recorded
  // completed review needs a human.
  let category;
  if (reasons.length > 0) category = 'waiting';
  else if (!codexRecorded) category = 'intervention';
  else category = 'ready';

  const name = `${repo}#${pr.number}`;
  const note = category === 'waiting'
    ? reasons.join(', ')
    : `${checkSummary}, head ${short(sha)}${codexRecorded ? '' : '; completed Codex review not recorded in the description'}`;
  return {
    category,
    key: `pr:${detail.html_url}@${sha}:${codexRecorded ? 'reviewed' : 'unreviewed'}`,
    line: `[${name}](${detail.html_url}) ${detail.title.trim()} (${note})`,
  };
}

function classifyIssue(issue) {
  const labels = issue.labels.map((l) => l.name);
  const status = labels.find((l) => l.startsWith('status:')) || '';
  let category = null;
  if (DECISION_LABELS.includes(status)) category = 'decision';
  else if (INTERVENTION_LABELS.includes(status)) category = 'intervention';
  if (!category) return null;
  return {
    category,
    key: `issue:${issue.html_url}:${status}`,
    line: `[#${issue.number}](${issue.html_url}) ${issue.title.trim()} (\`${status}\`)`,
  };
}

async function gather() {
  const items = { ready: [], decision: [], intervention: [], waiting: [] };
  for (const repo of ECOSYSTEM_REPOS) {
    const prs = await list(`/repos/${repo}/pulls?state=open`);
    for (const pr of prs) {
      const item = await classifyPullRequest(repo, pr);
      items[item.category].push(item);
    }
  }
  const issues = await list(`/repos/${SUMMARY_REPO}/issues?state=open`);
  for (const issue of issues) {
    if (issue.pull_request) continue;
    if (issue.labels.some((l) => l.name === SUMMARY_LABEL)) continue;
    const item = classifyIssue(issue);
    if (item) items[item.category].push(item);
  }
  return items;
}

const SECTIONS = [
  ['ready', 'Ready to merge', 'validated and Codex-reviewed; the product owner merges'],
  ['decision', 'Product decision required', 'approve, narrow or decline in the issue'],
  ['intervention', 'Human intervention required', 'blocked or unreviewed work that automation cannot move'],
];

function renderSection(title, hint, list, newKeys) {
  const lines = [`### ${title}`, '', `_${hint}_`, ''];
  if (list.length === 0) lines.push('- none');
  for (const item of list) lines.push(`- ${item.line}${newKeys && newKeys.has(item.key) ? ' **(new)**' : ''}`);
  return lines.join('\n');
}

function renderBody(items, notifiedKeys, checkedAt) {
  const parts = [
    `<!-- ${STATE_MARK} ${JSON.stringify(notifiedKeys)} -->`,
    'Maintained automatically by the `owner-approvals` workflow from the current state of the four ecosystem repositories; edits here are overwritten. A comment is posted only when a new action item appears. How it works: [governance/owner-notifications.md](https://github.com/kwd-it/contextual-stewardship/blob/main/governance/owner-notifications.md).',
    '',
    `Last checked: ${checkedAt}.`,
    '',
  ];
  for (const [k, title, hint] of SECTIONS) parts.push(renderSection(title, hint, items[k]), '');
  parts.push('### Waiting on automation (no action needed)', '', '_pull requests that are not ready yet; the steward resolves these itself_', '');
  if (items.waiting.length === 0) parts.push('- none');
  for (const item of items.waiting) parts.push(`- ${item.line}`);
  return parts.join('\n');
}

function renderComment(items, newKeys) {
  const total = items.ready.length + items.decision.length + items.intervention.length;
  const parts = [
    `<!-- ${STATE_MARK} ${JSON.stringify([...newKeys].sort())} -->`,
    `@${OWNER_LOGIN} ${newKeys.size} new item${newKeys.size === 1 ? '' : 's'} need${newKeys.size === 1 ? 's' : ''} your decision (${total} outstanding in total).`,
    '',
  ];
  for (const [k, title, hint] of SECTIONS) parts.push(renderSection(title, hint, items[k], newKeys), '');
  return parts.join('\n').trimEnd();
}

function markedKeys(text) {
  const m = (text || '').match(new RegExp(`<!-- ${STATE_MARK} (\\[.*?\\]) -->`, 's'));
  if (!m) return [];
  try { return JSON.parse(m[1]); } catch { return []; }
}

// Everything notified so far: the set stored in the issue body plus the set marked in
// every notification comment. A failed body update after a posted comment therefore
// never causes a second notification, and a failed comment never suppresses one.
async function notifiedSoFar(issue) {
  const keys = new Set(markedKeys(issue.body));
  const comments = await list(`/repos/${SUMMARY_REPO}/issues/${issue.number}/comments`);
  for (const c of comments) if (c.user?.login === BOT_LOGIN) for (const k of markedKeys(c.body)) keys.add(k);
  return keys;
}

async function ensureLabel() {
  const { status } = await api(`/repos/${SUMMARY_REPO}/labels/${encodeURIComponent(SUMMARY_LABEL)}`);
  if (status === 404) {
    await api(`/repos/${SUMMARY_REPO}/labels`, { method: 'POST', body: { name: SUMMARY_LABEL, color: 'D4C5F9', description: 'Automated summary of pending owner decisions' } });
  }
}

async function findSummaryIssue() {
  const issues = await list(`/repos/${SUMMARY_REPO}/issues?state=open&labels=${encodeURIComponent(SUMMARY_LABEL)}`);
  return issues.find((i) => !i.pull_request) || null;
}

async function main() {
  if (!TOKEN && !DRY_RUN) throw new Error('GITHUB_TOKEN is required');
  const items = await gather();
  const actionKeys = [...items.ready, ...items.decision, ...items.intervention].map((i) => i.key).sort();
  const openKeys = new Set([...actionKeys, ...items.waiting.map((i) => i.key)]);
  const checkedAt = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

  const existing = await findSummaryIssue();
  const priorSet = existing ? await notifiedSoFar(existing) : new Set();
  const newKeys = new Set(actionKeys.filter((k) => !priorSet.has(k)));
  // Keys stay remembered while their item is still open in any state, so an item that
  // leaves the action set temporarily (a CI re-run, say) is not notified twice.
  const notifiedKeys = [...new Set([...priorSet, ...newKeys])].filter((k) => openKeys.has(k)).sort();
  const body = renderBody(items, notifiedKeys, checkedAt);
  const comment = newKeys.size > 0 ? renderComment(items, newKeys) : null;

  const fingerprint = createHash('sha256').update(JSON.stringify(actionKeys)).digest('hex').slice(0, 12);
  console.log(`Action items: ${actionKeys.length} (ready ${items.ready.length}, decision ${items.decision.length}, intervention ${items.intervention.length}; waiting ${items.waiting.length}); fingerprint ${fingerprint}`);
  console.log(existing ? `Summary issue: #${existing.number} (${priorSet.size} previously notified items)` : 'Summary issue: none yet');
  console.log(comment ? `Notification: ${newKeys.size} new item(s)` : 'Notification: none (no new action items)');

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
    const { data } = await api(`/repos/${SUMMARY_REPO}/issues`, { method: 'POST', body: { title: SUMMARY_TITLE, body: renderBody(items, [], checkedAt), labels: [SUMMARY_LABEL] } });
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

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
