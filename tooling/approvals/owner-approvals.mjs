#!/usr/bin/env node
// Owner approvals summary for the Contextual ecosystem.
//
// Reads the current open pull requests and issues of the ecosystem repositories
// through the GitHub REST API, maintains one summary issue in the stewardship
// repository, and comments on that issue (mentioning the product owner) only when
// a decision or a human-only blocker appears that has not been notified before.
//
// Behaviour and rationale: governance/owner-notifications.md.
//
// Environment:
//   GITHUB_TOKEN      required unless --dry-run (the workflow passes the built-in token)
//   SUMMARY_REPO      repository that holds the summary issue (default kwd-it/contextual-stewardship)
//   ECOSYSTEM_REPOS   comma-separated repositories whose pull requests are scanned
//   OWNER_LOGIN       GitHub login mentioned in notifications (default kwdit)
//   GITHUB_EVENT_NAME set by Actions; on 'schedule' runs a new decision waits for a
//                     second sighting so that a stewardship cycle sends one notification
//
// Flags:
//   --dry-run         read everything, print the body and the comment that would be
//                     posted, write nothing

import { createHash } from 'node:crypto';
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
const SCHEDULED = process.env.GITHUB_EVENT_NAME === 'schedule';
export const STATE_MARK = 'owner-approvals:notified';
const BOT_LOGIN = 'github-actions[bot]';
const DAY = 24 * 60 * 60 * 1000;
export const COMPLETED_WINDOW_DAYS = 30;

// A pull request description must record a completed Codex review in these words
// (governance/owner-notifications.md). "Codex review outstanding" does not count.
export const REVIEW_RECORDED = /codex review[^\n]*?(no material findings|material findings resolved)/i;
// A pull request the steward will merge itself (governance/authority-model.md, D-016,
// or a task-authorised merge) carries this line in its description.
export const AUTOMATION_MARK = /^merge:\s*(automatic|steward)\b/im;
// The head commit the recorded review covered; a head that no longer matches it has
// not been reviewed.
export const REVIEWED_HEAD = /^reviewed head:\s*([0-9a-f]{7,40})\b/im;
// One-line plain-English fields the steward writes for the owner: a `Name: text` line
// in a pull request description, or a `### Name` field of an issue form.
export const OWNER_FIELDS = {
  summary: 'Owner summary',
  why: 'Why it matters',
  recommendation: 'Owner recommendation',
  urgency: 'Urgency',
  ifNothing: 'If nothing is done',
};

const DECISION_LABELS = ['status:proposed', 'status:needs-decision'];
const DEFERRED_LABEL = 'status:deferred';
// A blocked issue needs the owner only when it is also marked as human authority;
// anything else that is blocked is the steward's to clear.
const BLOCKED_LABEL = 'status:blocked';
const HUMAN_LABEL = 'authority:human';

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

export function ownerField(body, name) {
  const re = new RegExp(`^(?:${name}:|#{2,4}[ \\t]*${name}[ \\t]*\\r?\\n+)[ \\t]*(.+?)[ \\t]*$`, 'im');
  const value = (body || '').match(re)?.[1]?.trim();
  return value && value !== '_No response_' ? value : null;
}

export function ownerSummary(body, title) {
  return (ownerField(body, OWNER_FIELDS.summary) || plainTitle(title)).replace(/[.?!]+$/, '');
}

const product = (repo) => PRODUCTS[repo] || repo;
const asQuestion = (s) => `${s}?`;
const sentence = (s) => (s && !/[.?!]$/.test(s) ? `${s}.` : s);

// What the owner is asked changes materially when its summary changes; a new commit, a
// re-run of the checks or a review recorded again does not.
function summaryHash(summary) {
  return createHash('sha256').update(summary.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 8);
}

// The plain-English notice for one item: the question, why it matters, the steward's
// recommendation, urgency, what happens without an answer, and where to act. Fields
// the steward wrote win; otherwise the defaults for that kind of item apply.
function notice(body, title, url, defaults) {
  const get = (k) => ownerField(body, OWNER_FIELDS[k]) || defaults[k] || null;
  return { title, why: get('why'), recommendation: get('recommendation'), urgency: get('urgency'), ifNothing: get('ifNothing'), action: `[${defaults.action}](${url})` };
}

// Classify one pull request from its REST detail, reviews, check runs and statuses.
// `now` is injectable for tests. Returns {category, kind, key, line}.
export function classifyPullRequest(repo, detail, { reviews = [], runs = [], statuses = [], now = Date.now() } = {}) {
  const sha = detail.head.sha;
  const reasons = [];
  if (detail.draft) reasons.push('draft');

  const latestByUser = new Map();
  for (const r of reviews) if (r.user && r.state !== 'COMMENTED') latestByUser.set(r.user.login, r.state);
  if ([...latestByUser.values()].includes('CHANGES_REQUESTED')) reasons.push('changes requested');

  // Only a completed check with conclusion success counts as passed; skipped, neutral,
  // failed and unknown outcomes all keep the pull request waiting.
  const pending = runs.some((r) => r.status !== 'completed') || statuses.some((s) => s.state === 'pending');
  const failing = runs.some((r) => r.status === 'completed' && r.conclusion !== 'success') || statuses.some((s) => s.state !== 'pending' && s.state !== 'success');
  if (pending) reasons.push('checks pending');
  if (failing) reasons.push('checks not all successful');
  const checkCount = runs.length + statuses.length;
  const checkSummary = checkCount === 0 ? 'no automated checks' : pending ? 'checks pending' : failing ? 'checks not all successful' : `${checkCount} check${checkCount === 1 ? '' : 's'} passed`;

  if (detail.mergeable === false || detail.mergeable_state === 'dirty') reasons.push('merge conflicts');
  else if (detail.mergeable === null || detail.mergeable_state === 'unknown') reasons.push('mergeability not yet computed');
  else if (detail.mergeable_state === 'blocked') reasons.push('blocked by branch rules');
  else if (detail.mergeable_state === 'behind') reasons.push('behind the base branch');
  else if (detail.mergeable_state === 'unstable') { if (!failing) reasons.push('checks failing'); }
  else if (detail.mergeable_state !== 'clean') reasons.push(`merge state ${detail.mergeable_state}`);

  const body = detail.body || '';
  const reviewedHead = body.match(REVIEWED_HEAD)?.[1];
  const codexRecorded = REVIEW_RECORDED.test(body) && (!reviewedHead || sha.toLowerCase().startsWith(reviewedHead.toLowerCase()));
  const automatic = AUTOMATION_MARK.test(body);
  const ageHours = (now - Date.parse(detail.created_at || now)) / 3600000;
  const ref = `[#${detail.number}](${detail.html_url})`;
  const summary = ownerSummary(body, detail.title);
  const name = product(repo);

  // Only a reviewed, green pull request for the owner to merge needs the owner.
  // Everything else is the steward's to finish: checks pending or failing, conflicts, a
  // review still to run or to repeat after a new commit, and an automatic merge still
  // to happen (the Routine retries it each cycle, or hands it to the owner by changing
  // the `Merge:` line). The key ignores the head commit, so a new commit alone never
  // notifies again.
  const key = `pr:${detail.html_url}:${summaryHash(summary)}`;
  if (reasons.length > 0) {
    return { category: 'automation', kind: 'waiting', key, line: `${name}: ${summary} (${ref}; ${reasons.join(', ')})` };
  }
  if (automatic) {
    const late = ageHours > 24 ? '; the steward retries next cycle' : '';
    return { category: 'automation', kind: 'merging', key, line: `${name}: ${summary} (${ref}; being merged automatically, ${checkSummary}${late})` };
  }
  if (!codexRecorded) {
    const why = reviewedHead && !sha.toLowerCase().startsWith(reviewedHead.toLowerCase()) ? 'changed since its review; the steward reviews it again' : 'awaiting its independent review by the steward';
    return { category: 'automation', kind: 'unreviewed', key, line: `${name}: ${summary} (${ref}; ${why})` };
  }
  const title = `${name}: ${asQuestion(`merge "${summary}"`)}`;
  return {
    category: 'decision', kind: 'merge', key,
    line: `${title} (${ref}; reviewed, ${checkSummary})`,
    notice: notice(body, title, detail.html_url, {
      why: 'Changes of this kind reach the product only when you merge them',
      recommendation: 'Merge it: it has been independently reviewed and every automated check passed',
      urgency: 'Can wait',
      ifNothing: 'Nothing changes; the pull request stays open until you merge or close it',
      action: 'Review and merge the pull request',
    }),
  };
}

const ISSUE_DEFAULTS = {
  'status:proposed': { why: 'It would change the product, so it needs your approval first', recommendation: 'Set out in the proposal', urgency: 'Can wait', ifNothing: 'Nothing is implemented; the proposal stays open', action: 'Approve, narrow, defer or decline in the proposal' },
  'status:needs-decision': { why: 'Only you can make this decision', recommendation: 'Set out in the issue', urgency: 'Can wait', ifNothing: 'The steward does not act on it; it is raised again in each assessment', action: 'Decide in the issue' },
  [BLOCKED_LABEL]: { why: 'Only you can clear this blocker', recommendation: 'Set out in the issue', urgency: 'The blocked work is paused until you act', ifNothing: 'The blocked work stays paused', action: 'See what is needed in the issue' },
};

export function classifyIssue(issue) {
  const labels = issue.labels.map((l) => l.name);
  const status = labels.find((l) => l.startsWith('status:')) || '';
  let category = null;
  if (DECISION_LABELS.includes(status)) category = 'decision';
  else if (status === BLOCKED_LABEL) category = labels.includes(HUMAN_LABEL) ? 'intervention' : 'automation';
  else if (status === DEFERRED_LABEL) category = 'deferred';
  if (!category) return null;
  const name = labels.map((l) => LABEL_PRODUCTS[l]).find(Boolean) || 'Stewardship';
  const summary = ownerSummary(issue.body, issue.title);
  const ref = `[#${issue.number}](${issue.html_url})`;
  const key = `issue:${issue.html_url}:${status}:${summaryHash(summary)}`;
  if (category === 'deferred') return { category, kind: 'deferred', key, line: `${name}: ${summary} (${ref}; deferred until its revisit trigger is met)` };
  if (category === 'automation') return { category, kind: 'blocked', key, line: `${name}: ${summary} (${ref}; blocked, the steward is clearing it)` };
  const what = status === BLOCKED_LABEL ? 'blocked' : status === 'status:needs-decision' ? 'decision needed' : 'proposal';
  const title = category === 'decision' ? `${name}: ${asQuestion(summary)}` : `${name}: ${summary}`;
  const line = category === 'decision' ? `${title} (${ref}; ${what})` : `${title} (${ref}; ${what}, see the latest comment)`;
  return { category, kind: what, key, line, notice: notice(issue.body, title, issue.html_url, ISSUE_DEFAULTS[status]) };
}

export function completedLine(repo, detail) {
  const when = (detail.merged_at || '').slice(0, 10);
  return `${product(repo)}: ${ownerSummary(detail.body, detail.title)} ([#${detail.number}](${detail.html_url}); merged ${when})`;
}

export function markedState(text) {
  const empty = { keys: [], at: null, seen: [] };
  const m = (text || '').match(new RegExp(`<!-- ${STATE_MARK} (\\{.*?\\}|\\[.*?\\]) -->`, 's'));
  if (!m) return empty;
  try {
    const v = JSON.parse(m[1]);
    if (Array.isArray(v)) return { ...empty, keys: v };
    return { keys: Array.isArray(v.keys) ? v.keys : [], at: v.at || null, seen: Array.isArray(v.seen) ? v.seen : [] };
  } catch { return empty; }
}

// Decide what to notify. `items` has decision, intervention, automation and deferred
// lists; `priorKeys` is everything notified so far. Keys stay remembered while their
// item is open in any state, so an item that leaves the action set temporarily is not
// notified twice.
//
// With `hold` (scheduled runs), a new decision is notified only once a previous run has
// already seen it (`seenKeys`), so a decision that appears in the middle of a
// stewardship cycle goes out with the rest of that cycle's decisions when the Routine
// dispatches the workflow at the end, or with the next scheduled run if it does not. A
// new human-only blocker is never held. Whenever a comment is posted, every new item
// goes into it.
export function plan(items, priorKeys, { seenKeys = [], hold = false } = {}) {
  const actionKeys = [...items.decision, ...items.intervention].map((i) => i.key).sort();
  const openKeys = new Set([...actionKeys, ...items.automation.map((i) => i.key), ...(items.deferred || []).map((i) => i.key)]);
  const priorSet = new Set(priorKeys);
  const seenSet = new Set(seenKeys);
  const candidates = actionKeys.filter((k) => !priorSet.has(k));
  const due = !hold
    || items.intervention.some((i) => !priorSet.has(i.key))
    || items.decision.some((i) => !priorSet.has(i.key) && seenSet.has(i.key));
  const newKeys = new Set(due ? candidates : []);
  const notifiedKeys = [...new Set([...priorSet, ...newKeys])].filter((k) => openKeys.has(k)).sort();
  return { actionKeys, newKeys, notifiedKeys, held: candidates.length - newKeys.size };
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
    'Maintained automatically by the `owner-approvals` workflow from the current state of the four ecosystem repositories; edits here are overwritten. A comment is posted only when a new decision, or a blocker only the owner can clear, appears. How it works: [governance/owner-notifications.md](https://github.com/kwd-it/contextual-stewardship/blob/main/governance/owner-notifications.md).',
    '',
    `Last checked: ${checkedAt}.`,
    '',
    section('Your decisions', items.decision.map((i) => i.line), { hint: 'merge, approve, narrow, defer or decline; nothing happens until you do' }), '',
    section('Needs your intervention', items.intervention.map((i) => i.line), { hint: 'only you can clear these' }), '',
    section('Deferred (tracked, no action needed)', (items.deferred || []).map((i) => i.line)), '',
    section('Being handled automatically (no action needed)', items.automation.map((i) => i.line)), '',
    section(`Completed automatically (last ${COMPLETED_WINDOW_DAYS} days)`, completed.map((c) => c.line)),
  ];
  return parts.join('\n');
}

// The notification: each new item explained in plain English, then one line for
// anything still waiting from earlier notifications. Completed work is never listed.
export function renderComment(items, newKeys, summaryUrl) {
  const fresh = [...items.intervention, ...items.decision].filter((i) => newKeys.has(i.key));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const decisions = fresh.filter((i) => i.category === 'decision').length;
  const blockers = fresh.length - decisions;
  const counts = [decisions && `${plural(decisions, 'decision', 'decisions')} needed`, blockers && `${plural(blockers, 'blocker needs', 'blockers need')} you`].filter(Boolean);
  const parts = [
    `<!-- ${STATE_MARK} ${JSON.stringify({ keys: [...newKeys].sort() })} -->`,
    `@${OWNER_LOGIN} Contextual: ${counts.join(', ')}`,
  ];
  for (const { notice: n } of fresh) {
    parts.push('', `**${n.title}**`);
    if (n.why) parts.push(`- Why: ${sentence(n.why)}`);
    if (n.recommendation) parts.push(`- Recommendation: ${sentence(n.recommendation)}`);
    if (n.urgency) parts.push(`- Urgency: ${sentence(n.urgency)}`);
    if (n.ifNothing) parts.push(`- If you do nothing: ${sentence(n.ifNothing)}`);
    parts.push(`- Action: ${n.action}`);
  }
  parts.push('');
  const earlier = items.decision.length + items.intervention.length - fresh.length;
  if (earlier > 0) parts.push(`Still waiting from earlier: ${plural(earlier, 'item', 'items')}, listed in the [summary](${summaryUrl}).`);
  parts.push('Everything else is being handled.');
  return parts.join('\n');
}

// ---------------------------------------------------------------- GitHub reads and writes

async function gather(now) {
  const items = { decision: [], intervention: [], automation: [], deferred: [] };
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
// any notification comment posted after the body last recorded one (`at` is the
// creation time of the last comment the body accounts for). A failed body update after
// a posted comment therefore never causes a second notification, a failed comment
// never suppresses one, and keys the body has since forgotten (an item that was
// closed, decided or deferred) are not revived from older comments, so a decision that
// returns is notified again. The action items seen by the previous run are kept in the
// body only; losing them merely holds a new decision for one more scheduled run.
export function notifiedState(bodyText, comments) {
  const body = markedState(bodyText);
  const keys = new Set(body.keys);
  const since = body.at ? Date.parse(body.at) : -Infinity;
  let at = body.at;
  for (const c of comments) {
    if (c.user?.login !== BOT_LOGIN || !(Date.parse(c.created_at) > since)) continue;
    for (const k of markedState(c.body).keys) keys.add(k);
    if (!at || Date.parse(c.created_at) > Date.parse(at)) at = c.created_at;
  }
  return { keys, at, seen: body.seen };
}

async function notifiedSoFar(issue) {
  return notifiedState(issue.body, await list(`/repos/${SUMMARY_REPO}/issues/${issue.number}/comments`));
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
  const prior = existing ? await notifiedSoFar(existing) : { keys: new Set(), at: null, seen: [] };
  const { actionKeys, newKeys, notifiedKeys, held } = plan(items, prior.keys, { seenKeys: prior.seen, hold: SCHEDULED });
  // `at` is the creation time of the last notification comment the body accounts for
  // (see notifiedState); a new comment's own time replaces it once it is posted.
  const bodyAt = (at) => renderBody(items, completed, { keys: notifiedKeys, at, seen: actionKeys }, checkedAt);
  let body = bodyAt(newKeys.size > 0 ? new Date(now).toISOString() : prior.at);
  const summaryUrl = existing?.html_url || `https://github.com/${SUMMARY_REPO}/issues?q=label%3A${encodeURIComponent(SUMMARY_LABEL)}`;
  const comment = newKeys.size > 0 ? renderComment(items, newKeys, summaryUrl) : null;

  console.log(`Needs the owner: ${actionKeys.length} (decisions ${items.decision.length}, intervention ${items.intervention.length}); deferred ${items.deferred.length}; handled automatically ${items.automation.length}; completed automatically ${completed.length}`);
  console.log(existing ? `Summary issue: #${existing.number} (${prior.keys.size} previously notified items)` : 'Summary issue: none yet');
  console.log(comment ? `Notification: ${newKeys.size} new item(s)` : held > 0 ? `Notification: none yet (${held} new decision(s) held for a second sighting)` : 'Notification: none (nothing new needs the owner)');

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
    const { data } = await api(`/repos/${SUMMARY_REPO}/issues`, { method: 'POST', body: { title: SUMMARY_TITLE, body: renderBody(items, completed, { keys: [], at: null, seen: [] }, checkedAt), labels: [SUMMARY_LABEL] } });
    issueNumber = data.number;
    console.log(`Created summary issue #${issueNumber}`);
  }
  // Comment first, then record the state: see notifiedState for why either order of
  // failure is safe.
  if (comment) {
    const { data } = await api(`/repos/${SUMMARY_REPO}/issues/${issueNumber}/comments`, { method: 'POST', body: { body: comment } });
    console.log(`Posted notification: ${data.html_url}`);
    body = bodyAt(data.created_at);
  }
  if (!existing || existing.body !== body) await api(`/repos/${SUMMARY_REPO}/issues/${issueNumber}`, { method: 'PATCH', body: { body } });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => { console.error(err.message || err); process.exit(1); });
}
