// Classification, notification planning and wording of the owner approvals summary.
// Run: node --test tooling/approvals/owner-approvals.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPullRequest, classifyIssue, plan, plainTitle, ownerSummary, ownerField, markedState, notifiedState, renderComment, renderBody } from './owner-approvals.mjs';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const REVIEWED = 'Summary.\n\nCodex review of the actual diff: no material findings (exit 0).\n';
const SUMMARY_URL = 'https://github.com/kwd-it/contextual-stewardship/issues/6';

function detail(overrides = {}) {
  return {
    number: 4, html_url: 'https://github.com/kwd-it/contextualwp/pull/4', title: 'chore(ci): run the PHPUnit suite on GitHub Actions',
    body: REVIEWED, draft: false, mergeable: true, mergeable_state: 'clean', created_at: '2026-10-14T09:00:00Z',
    head: { sha: '0e625c10ef593c11f6a0a3802f4419be1abc4622' },
    ...overrides,
  };
}
const passed = { runs: [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'success' }], now: NOW };
const issue = (number, status, body = '', extra = []) => ({
  number, html_url: `https://github.com/kwd-it/contextual-stewardship/issues/${number}`, title: `Proposal: item ${number}`, body,
  labels: [{ name: status }, { name: 'repo:contextualwp' }, ...extra.map((name) => ({ name }))],
});
const empty = () => ({ decision: [], intervention: [], automation: [], deferred: [] });
function sort(list) {
  const items = empty();
  for (const i of list) if (i) items[i.category].push(i);
  return items;
}
// One run of the workflow against the given items and state, as main() does it.
function run(list, state, { scheduled = false } = {}) {
  const items = sort(list);
  const p = plan(items, state.keys, { seenKeys: state.seen, hold: scheduled });
  const comment = p.newKeys.size > 0 ? renderComment(items, p.newKeys, SUMMARY_URL) : null;
  return { comment, state: { keys: p.notifiedKeys, seen: p.actionKeys } };
}
const START = { keys: [], seen: [] };

// ------------------------------------------------------------ classification

test('a reviewed, green, unmarked pull request is a merge decision in plain English', () => {
  const item = classifyPullRequest('kwd-it/contextualwp', detail(), passed);
  assert.equal(item.category, 'decision');
  assert.equal(item.line, 'ContextualWP: merge "Run the PHPUnit suite on GitHub Actions"? ([#4](https://github.com/kwd-it/contextualwp/pull/4); reviewed, 2 checks passed)');
  assert.equal(item.notice.action, '[Review and merge the pull request](https://github.com/kwd-it/contextualwp/pull/4)');
});

test('an owner summary line replaces the technical title', () => {
  const item = classifyPullRequest('kwd-it/contextualwp', detail({ body: `${REVIEWED}\nOwner summary: Approve automated testing infrastructure.\n` }), passed);
  assert.match(item.line, /merge "Approve automated testing infrastructure"\?/);
});

test('an owner-merge pull request becomes a decision only when it is ready', () => {
  const body = `${REVIEWED}\nMerge: owner.\n`;
  for (const extra of [{ runs: [{ status: 'in_progress' }] }, { runs: [{ status: 'completed', conclusion: 'failure' }] }]) {
    assert.equal(classifyPullRequest('kwd-it/contextualwp', detail({ body }), { ...extra, now: NOW }).category, 'automation');
  }
  assert.equal(classifyPullRequest('kwd-it/contextualwp', detail({ body, draft: true }), passed).category, 'automation');
  assert.equal(classifyPullRequest('kwd-it/contextualwp', detail({ body, mergeable: false, mergeable_state: 'dirty' }), passed).category, 'automation');
  assert.equal(classifyPullRequest('kwd-it/contextualwp', detail({ body }), passed).category, 'decision');
});

test('a pull request eligible for automatic merge is never an owner item, however long it waits', () => {
  for (const created_at of ['2026-10-14T09:00:00Z', '2026-10-01T09:00:00Z']) {
    const item = classifyPullRequest('kwd-it/contextual-console', detail({ body: `${REVIEWED}\nMerge: automatic under D-016 once checks pass.\n`, created_at }), passed);
    assert.equal(item.category, 'automation');
    assert.equal(item.kind, 'merging');
  }
  const steward = classifyPullRequest('kwd-it/contextual-console', detail({ body: `${REVIEWED}\nMerge: steward (task-authorised 2026-10-14).\n` }), passed);
  assert.equal(steward.category, 'automation');
});

test('a pull request whose review is outstanding or stale is the steward\'s to finish', () => {
  const unreviewed = classifyPullRequest('kwd-it/contextualwp', detail({ body: 'Codex review outstanding.' }), passed);
  assert.equal(unreviewed.category, 'automation');
  const stale = classifyPullRequest('kwd-it/contextualwp', detail({ body: `${REVIEWED}Reviewed head: deadbeef0000000\n` }), passed);
  assert.equal(stale.category, 'automation');
  assert.match(stale.line, /changed since its review/);
  const matching = classifyPullRequest('kwd-it/contextualwp', detail({ body: `${REVIEWED}Reviewed head: 0e625c1\n` }), passed);
  assert.equal(matching.category, 'decision');
});

test('skipped or neutral checks keep a pull request waiting', () => {
  for (const conclusion of ['skipped', 'neutral', 'cancelled']) {
    const item = classifyPullRequest('kwd-it/contextualwp', detail(), { runs: [{ status: 'completed', conclusion }], now: NOW });
    assert.equal(item.kind, 'waiting', conclusion);
    assert.match(item.line, /checks not all successful/);
  }
});

test('issues: proposals and decisions ask, deferred ones are tracked, only human blockers intervene', () => {
  const proposal = classifyIssue(issue(5, 'status:proposed', 'Owner summary: Approve the proposed OpenAI model change.'));
  assert.equal(proposal.category, 'decision');
  assert.equal(proposal.line, 'ContextualWP: Approve the proposed OpenAI model change? ([#5](https://github.com/kwd-it/contextual-stewardship/issues/5); proposal)');
  assert.equal(classifyIssue(issue(9, 'status:needs-decision', '', ['authority:human'])).category, 'decision');
  const deferred = classifyIssue(issue(5, 'status:deferred', 'Owner summary: Decide whether to refresh the OpenAI catalogue.'));
  assert.equal(deferred.category, 'deferred');
  assert.equal(deferred.notice, undefined);
  const human = classifyIssue(issue(7, 'status:blocked', 'Owner summary: Renew the review credential.', ['authority:human']));
  assert.equal(human.category, 'intervention');
  assert.match(human.line, /^ContextualWP: Renew the review credential \(\[#7\]/);
  const recoverable = classifyIssue(issue(8, 'status:blocked', '', ['authority:autonomous']));
  assert.equal(recoverable.category, 'automation');
  assert.equal(classifyIssue(issue(10, 'status:approved')), null);
});

// ------------------------------------------------------------ notification behaviour

const ready = (n, summary = `Change ${n}`) => classifyPullRequest('kwd-it/contextualwp', detail({ number: n, html_url: `https://github.com/kwd-it/contextualwp/pull/${n}`, body: `${REVIEWED}Owner summary: ${summary}\nMerge: owner.\n` }), passed);
const failing = (n, summary = `Change ${n}`) => classifyPullRequest('kwd-it/contextualwp', detail({ number: n, html_url: `https://github.com/kwd-it/contextualwp/pull/${n}`, body: `${REVIEWED}Owner summary: ${summary}\nMerge: owner.\n` }), { runs: [{ status: 'completed', conclusion: 'failure' }], now: NOW });

test('a genuinely actionable proposal produces one clear notification', () => {
  const body = '### Owner summary\n\nApprove an OpenAI compatibility improvement\n\n### Why it matters\n\nAn existing model is approaching retirement.\n\n### Owner recommendation\n\nApprove the tested replacement.\n\n### Urgency\n\nBefore 2027-01-01.\n\n### If nothing is done\n\nThe existing model remains supported until 2027-04-01.\n';
  const first = run([classifyIssue(issue(11, 'status:proposed', body))], START);
  assert.equal(first.comment, [
    '<!-- owner-approvals:notified {"keys":["issue:https://github.com/kwd-it/contextual-stewardship/issues/11:status:proposed:' + first.state.keys[0].split(':').pop() + '"]} -->',
    '@kwdit Contextual: 1 decision needed',
    '',
    '**ContextualWP: Approve an OpenAI compatibility improvement?**',
    '- Why: An existing model is approaching retirement.',
    '- Recommendation: Approve the tested replacement.',
    '- Urgency: Before 2027-01-01.',
    '- If you do nothing: The existing model remains supported until 2027-04-01.',
    '- Action: [Approve, narrow, defer or decline in the proposal](https://github.com/kwd-it/contextual-stewardship/issues/11)',
    '',
    'Everything else is being handled.',
  ].join('\n'));
  assert.doesNotMatch(first.comment.split('\n').slice(1).join('\n'), /\b[0-9a-f]{7,40}\b/, 'no hashes in the visible text');
  assert.equal(run([classifyIssue(issue(11, 'status:proposed', body))], first.state).comment, null);
});

test('every part of the notice is filled even when the steward wrote no extra fields', () => {
  const { comment } = run([ready(12, 'The approved nano-tier replacement')], START);
  assert.match(comment, /\*\*ContextualWP: merge "The approved nano-tier replacement"\?\*\*\n- Why: Changes of this kind reach the product only when you merge them\.\n- Recommendation: Merge it: it has been independently reviewed and every automated check passed\.\n- Urgency: Can wait\.\n- If you do nothing: Nothing changes; the pull request stays open until you merge or close it\.\n- Action: \[Review and merge the pull request\]\(https:\/\/github\.com\/kwd-it\/contextualwp\/pull\/12\)/);
  assert.doesNotMatch(comment, /0e625c1|head|branch|status:/);
  const bare = run([classifyIssue(issue(27, 'status:proposed'))], START).comment;
  for (const part of ['Why', 'Recommendation', 'Urgency', 'If you do nothing', 'Action']) assert.match(bare, new RegExp(`^- ${part}: \\S`, 'm'), part);
});

test('a deferred proposal produces no notification but stays in the summary', () => {
  const deferred = classifyIssue(issue(5, 'status:deferred', 'Owner summary: Decide whether to refresh the OpenAI catalogue'));
  const r = run([deferred], START);
  assert.equal(r.comment, null);
  const body = renderBody(sort([deferred]), [], { keys: r.state.keys, at: null, seen: r.state.seen }, 'now');
  assert.match(body, /### Deferred \(tracked, no action needed\)\n\n- ContextualWP: Decide whether to refresh the OpenAI catalogue \(\[#5\]/);
});

test('automatic-merge, completed, failing and recoverable work never notifies', () => {
  const auto = classifyPullRequest('kwd-it/contextual-console', detail({ body: `${REVIEWED}\nMerge: automatic under D-016 once checks pass.\n` }), passed);
  const recoverable = classifyIssue(issue(8, 'status:blocked', 'Owner summary: Fix the Linux autoload path', ['authority:autonomous']));
  const unreviewed = classifyPullRequest('kwd-it/contextualwp', detail({ number: 13, body: 'Codex review outstanding.' }), passed);
  assert.equal(run([auto, failing(14), recoverable, unreviewed], START).comment, null);
  // completed work is not an item at all: the notification never mentions it
  const { comment } = run([ready(15)], START);
  assert.doesNotMatch(comment, /Completed|merged/);
});

test('a temporary CI failure on a notified pull request does not notify again', () => {
  const r1 = run([ready(16)], START);
  assert.ok(r1.comment);
  const r2 = run([failing(16)], r1.state);
  assert.equal(r2.comment, null);
  const r3 = run([ready(16)], r2.state);
  assert.equal(r3.comment, null);
});

test('a new commit alone does not notify again; a materially changed decision does', () => {
  const r1 = run([ready(17, 'The nano-tier replacement')], START);
  const recommit = classifyPullRequest('kwd-it/contextualwp', detail({ number: 17, html_url: 'https://github.com/kwd-it/contextualwp/pull/17', head: { sha: 'abcdef1234567890abcdef1234567890abcdef12' }, body: `${REVIEWED}Owner summary: The nano-tier replacement\n` }), passed);
  assert.equal(run([recommit], r1.state).comment, null);
  const changed = run([ready(17, 'The nano-tier replacement and a new default model')], r1.state);
  assert.match(changed.comment, /new default model/);
  // a deferred proposal reopened for a decision is notified
  const deferred = run([classifyIssue(issue(5, 'status:deferred', 'Owner summary: Refresh the catalogue'))], START);
  assert.match(run([classifyIssue(issue(5, 'status:proposed', 'Owner summary: Refresh the catalogue'))], deferred.state).comment, /Refresh the catalogue\?/);
});

test('a genuine human-only blocker notifies, even on a scheduled run', () => {
  const blocker = classifyIssue(issue(18, 'status:blocked', 'Owner summary: Renew the Codex review key\n', ['authority:human']));
  const { comment } = run([blocker], START, { scheduled: true });
  assert.match(comment, /@kwdit Contextual: 1 blocker needs you\n\n\*\*ContextualWP: Renew the Codex review key\*\*\n- Why: Only you can clear this blocker\.\n- Recommendation: Set out in the issue\.\n- Urgency: The blocked work is paused until you act\.\n- If you do nothing: The blocked work stays paused\.\n- Action: \[See what is needed in the issue\]/);
});

test('several new decisions are combined into one notification', () => {
  const { comment } = run([ready(19), ready(20), classifyIssue(issue(21, 'status:proposed', 'Owner summary: Approve X'))], START);
  assert.match(comment, /^<!--[^\n]*-->\n@kwdit Contextual: 3 decisions needed\n/);
  assert.equal((comment.match(/^- Action:/gm) || []).length, 3);
});

test('repeated scheduled runs never notify the same work twice, and a mid-cycle decision waits for the batch', () => {
  // Scheduled run during a cycle: one decision appears and is held.
  const s1 = run([ready(22)], START, { scheduled: true });
  assert.equal(s1.comment, null);
  // End-of-cycle dispatch: it and a second decision go out together.
  const d = run([ready(22), ready(23)], s1.state);
  assert.match(d.comment, /2 decisions needed/);
  // Later scheduled runs with nothing changed send nothing.
  let state = d.state;
  for (let i = 0; i < 4; i += 1) {
    const s = run([ready(22), ready(23)], state, { scheduled: true });
    assert.equal(s.comment, null);
    state = s.state;
  }
  // Without a dispatch, the next scheduled run sends a held decision.
  const s2 = run([ready(24)], START, { scheduled: true });
  assert.equal(s2.comment, null);
  assert.match(run([ready(24)], s2.state, { scheduled: true }).comment, /1 decision needed/);
});

test('a notification lists only new items and points to the summary for the rest', () => {
  const r1 = run([ready(25)], START);
  const r2 = run([ready(25), ready(26)], r1.state);
  assert.match(r2.comment, /pull\/26/);
  assert.doesNotMatch(r2.comment, /pull\/25/);
  assert.match(r2.comment, /Still waiting from earlier: 1 item, listed in the \[summary\]\(https:\/\/github\.com\/kwd-it\/contextual-stewardship\/issues\/6\)\./);
});

test('no pending actions means no notification', () => {
  assert.equal(run([], START).comment, null);
  assert.equal(run([], START, { scheduled: true }).comment, null);
});

test('plan forgets closed items and remembers ones that are still open', () => {
  const items = { decision: [{ key: 'a' }, { key: 'b' }], intervention: [], automation: [{ key: 'c' }], deferred: [] };
  const first = plan(items, []);
  assert.deepEqual([...first.newKeys], ['a', 'b']);
  const second = plan(items, first.notifiedKeys);
  assert.equal(second.newKeys.size, 0);
  const third = plan({ decision: [{ key: 'a' }, { key: 'c' }], intervention: [], automation: [], deferred: [] }, second.notifiedKeys);
  assert.deepEqual([...third.newKeys], ['c']);
  assert.deepEqual(third.notifiedKeys, ['a', 'c']);
});

// The stored state across real runs: the body marker plus the comments on the issue,
// as main() and notifiedState() handle them, including a body update that fails.
function liveRun(list, issueState, { scheduled = false, bodyWriteFails = false, at } = {}) {
  const prior = notifiedState(issueState.body, issueState.comments);
  const items = sort(list);
  const p = plan(items, prior.keys, { seenKeys: prior.seen, hold: scheduled });
  const comments = [...issueState.comments];
  let bodyAt = prior.at;
  if (p.newKeys.size > 0) {
    const text = renderComment(items, p.newKeys, SUMMARY_URL);
    comments.push({ user: { login: 'github-actions[bot]' }, created_at: at, body: text });
    bodyAt = at;
  }
  const body = bodyWriteFails ? issueState.body : renderBody(items, [], { keys: p.notifiedKeys, at: bodyAt, seen: p.actionKeys }, 'now');
  return { notified: p.newKeys.size > 0, state: { body, comments } };
}

test('a decision that was notified, deferred and later proposed again is notified again', () => {
  const proposal = () => classifyIssue(issue(5, 'status:proposed', 'Owner summary: Refresh the catalogue'));
  const r1 = liveRun([proposal()], { body: '', comments: [] }, { at: '2026-10-14T10:00:00Z' });
  assert.equal(r1.notified, true);
  const r2 = liveRun([classifyIssue(issue(5, 'status:deferred', 'Owner summary: Refresh the catalogue'))], r1.state, { at: '2026-10-15T10:00:00Z' });
  assert.equal(r2.notified, false);
  const r3 = liveRun([proposal()], r2.state, { at: '2026-11-01T10:00:00Z' });
  assert.equal(r3.notified, true);
  assert.equal(liveRun([proposal()], r3.state, { at: '2026-11-01T16:00:00Z' }).notified, false);
});

test('a failed body update after a posted comment does not notify twice', () => {
  const r1 = liveRun([ready(28)], { body: '', comments: [] }, { at: '2026-10-14T10:00:00Z', bodyWriteFails: true });
  assert.equal(r1.notified, true);
  assert.equal(r1.state.body, '');
  const r2 = liveRun([ready(28)], r1.state, { at: '2026-10-14T16:00:00Z' });
  assert.equal(r2.notified, false);
  assert.equal(liveRun([ready(28)], r2.state, { at: '2026-10-14T22:00:00Z' }).notified, false);
});

test('the summary issue state as it stands on 2026-10-15 carries over without notifying', () => {
  const body = '<!-- owner-approvals:notified {"keys":["issue:https://github.com/kwd-it/contextual-stewardship/issues/5:status:proposed"],"at":"2026-10-14T10:37:53Z"} -->';
  const comments = [
    { user: { login: 'github-actions[bot]' }, created_at: '2026-10-14T04:54:06Z', body: '<!-- owner-approvals:notified ["issue:https://github.com/kwd-it/contextual-stewardship/issues/5:status:proposed"] -->' },
    { user: { login: 'github-actions[bot]' }, created_at: '2026-10-14T10:37:53Z', body: '<!-- owner-approvals:notified {"keys":["pr:https://github.com/kwd-it/contextualwp/pull/7@8e8c8e0:reviewed"]} -->' },
  ];
  const r = liveRun([classifyIssue(issue(5, 'status:deferred', 'Owner summary: Decide whether to trial gpt-6.1-sol'))], { body, comments });
  assert.equal(r.notified, false);
});

// ------------------------------------------------------------ parsing

test('state markers parse the array form, the object form and the seen set', () => {
  assert.deepEqual(markedState('<!-- owner-approvals:notified ["a","b"] -->'), { keys: ['a', 'b'], at: null, seen: [] });
  assert.deepEqual(markedState('<!-- owner-approvals:notified {"keys":["a"],"at":"2026-10-14T04:54:06Z"} -->\nrest'), { keys: ['a'], at: '2026-10-14T04:54:06Z', seen: [] });
  assert.deepEqual(markedState('<!-- owner-approvals:notified {"keys":[],"at":null,"seen":["x"]} -->'), { keys: [], at: null, seen: ['x'] });
  assert.deepEqual(markedState('nothing'), { keys: [], at: null, seen: [] });
});

test('titles lose their technical prefixes and owner fields parse from lines or form headings', () => {
  assert.equal(plainTitle('chore(docs): neutralise client-identifying values'), 'Neutralise client-identifying values');
  assert.equal(plainTitle('Proposal F-3(b): parse Anthropic responses by first text block'), 'Parse Anthropic responses by first text block');
  assert.equal(ownerSummary('Owner summary: Cleaned up documentation and test fixtures.', 'ignored'), 'Cleaned up documentation and test fixtures');
  assert.equal(ownerSummary('### Problem\n\nx\n\n### Owner summary\n\nApprove the proposed OpenAI model change.\n\n### Value', 'ignored'), 'Approve the proposed OpenAI model change');
  assert.equal(ownerField('### Urgency\n\n_No response_\n', 'Urgency'), null);
  assert.equal(ownerField('x\nIf nothing is done: Nothing breaks.\n', 'If nothing is done'), 'Nothing breaks.');
});
