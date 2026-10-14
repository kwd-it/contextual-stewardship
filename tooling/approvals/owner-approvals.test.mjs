// Classification, notification planning and wording of the owner approvals summary.
// Run: node --test tooling/approvals/owner-approvals.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPullRequest, classifyIssue, plan, plainTitle, ownerSummary, markedState, renderComment, completedLine } from './owner-approvals.mjs';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const REVIEWED = 'Summary.\n\nCodex review of the actual diff: no material findings (exit 0).\n';

function detail(overrides = {}) {
  return {
    number: 4, html_url: 'https://github.com/kwd-it/contextualwp/pull/4', title: 'chore(ci): run the PHPUnit suite on GitHub Actions',
    body: REVIEWED, draft: false, mergeable: true, mergeable_state: 'clean', created_at: '2026-10-14T09:00:00Z',
    head: { sha: '0e625c10ef593c11f6a0a3802f4419be1abc4622' },
    ...overrides,
  };
}
const passed = { runs: [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'success' }], now: NOW };

test('a reviewed, green, unmarked pull request is a merge decision in plain English', () => {
  const item = classifyPullRequest('kwd-it/contextualwp', detail(), passed);
  assert.equal(item.category, 'decision');
  assert.equal(item.line, 'ContextualWP: merge "Run the PHPUnit suite on GitHub Actions"? ([#4](https://github.com/kwd-it/contextualwp/pull/4); reviewed, 2 checks passed)');
});

test('an owner summary line replaces the technical title', () => {
  const item = classifyPullRequest('kwd-it/contextualwp', detail({ body: `${REVIEWED}\nOwner summary: Approve automated testing infrastructure.\n` }), passed);
  assert.match(item.line, /merge "Approve automated testing infrastructure"\?/);
});

test('a pull request marked for automatic merge is handled, not notified, within the grace period', () => {
  const item = classifyPullRequest('kwd-it/contextual-console', detail({ body: `${REVIEWED}\nMerge: automatic under D-016 once checks pass.\n` }), passed);
  assert.equal(item.category, 'automation');
  assert.equal(item.kind, 'merging');
  const stuck = classifyPullRequest('kwd-it/contextual-console', detail({ body: `${REVIEWED}\nMerge: automatic under D-016.\n`, created_at: '2026-10-12T09:00:00Z' }), passed);
  assert.equal(stuck.category, 'intervention');
  assert.match(stuck.line, /has not happened after 24 hours/);
  const steward = classifyPullRequest('kwd-it/contextual-console', detail({ body: `${REVIEWED}\nMerge: steward (task-authorised 2026-10-14).\n` }), passed);
  assert.equal(steward.category, 'automation');
});

test('failing, pending, draft or conflicting pull requests wait for automation whatever their marks', () => {
  for (const extra of [{ runs: [{ status: 'in_progress' }] }, { runs: [{ status: 'completed', conclusion: 'failure' }] }]) {
    const item = classifyPullRequest('kwd-it/contextualwp', detail({ body: `${REVIEWED}\nMerge: automatic.` }), { ...extra, now: NOW });
    assert.equal(item.category, 'automation');
    assert.equal(item.kind, 'waiting');
  }
  assert.equal(classifyPullRequest('kwd-it/contextualwp', detail({ draft: true }), passed).kind, 'waiting');
  assert.equal(classifyPullRequest('kwd-it/contextualwp', detail({ mergeable: false, mergeable_state: 'dirty' }), passed).kind, 'waiting');
});

test('an unreviewed but mergeable pull request needs intervention', () => {
  const item = classifyPullRequest('kwd-it/contextualwp', detail({ body: 'Codex review outstanding.' }), passed);
  assert.equal(item.category, 'intervention');
  assert.match(item.key, /:unreviewed$/);
});

test('a reviewed head that no longer matches the head commit is not presented as reviewed', () => {
  const stale = classifyPullRequest('kwd-it/contextualwp', detail({ body: `${REVIEWED}Reviewed head: deadbeef0000000\n` }), passed);
  assert.equal(stale.category, 'intervention');
  assert.match(stale.line, /changed since its review/);
  assert.match(stale.key, /:unreviewed$/);
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

test('proposal and blocked issues classify with plain wording', () => {
  const proposal = classifyIssue({ number: 5, html_url: 'u5', title: 'Proposal F-2(b): move the OpenAI nano tier off gpt-5.4-nano', body: 'Owner summary: Approve the proposed OpenAI model change.', labels: [{ name: 'status:proposed' }, { name: 'repo:contextualwp' }] });
  assert.equal(proposal.category, 'decision');
  assert.equal(proposal.line, 'ContextualWP: Approve the proposed OpenAI model change? ([#5](u5); proposal)');
  const blocked = classifyIssue({ number: 7, html_url: 'u7', title: 'Maintenance: tidy docblocks', body: '', labels: [{ name: 'status:blocked' }] });
  assert.equal(blocked.category, 'intervention');
  assert.match(blocked.line, /^Stewardship: Tidy docblocks \(\[#7\]\(u7\); blocked/);
  assert.equal(classifyIssue({ number: 8, html_url: 'u8', title: 'x', body: '', labels: [{ name: 'status:approved' }] }), null);
});

test('plan notifies only new action items and forgets closed ones', () => {
  const items = { decision: [{ key: 'a' }, { key: 'b' }], intervention: [], automation: [{ key: 'c' }] };
  const first = plan(items, []);
  assert.deepEqual([...first.newKeys], ['a', 'b']);
  const second = plan(items, first.notifiedKeys);
  assert.equal(second.newKeys.size, 0);
  // b merged (gone), c becomes a decision (new), a unchanged
  const third = plan({ decision: [{ key: 'a' }, { key: 'c' }], intervention: [], automation: [] }, second.notifiedKeys);
  assert.deepEqual([...third.newKeys], ['c']);
  assert.deepEqual(third.notifiedKeys, ['a', 'c']);
  // an automatic merge removes its item without producing anything to notify
  const fourth = plan({ decision: [{ key: 'a' }], intervention: [], automation: [] }, third.notifiedKeys);
  assert.equal(fourth.newKeys.size, 0);
  assert.deepEqual(fourth.notifiedKeys, ['a']);
});

test('a temporarily waiting item is not notified again when it returns', () => {
  const ready = { decision: [{ key: 'pr:x@1:reviewed' }], intervention: [], automation: [] };
  const p1 = plan(ready, []);
  const waiting = { decision: [], intervention: [], automation: [{ key: 'pr:x@1:reviewed' }] };
  const p2 = plan(waiting, p1.notifiedKeys);
  assert.equal(p2.newKeys.size, 0);
  const p3 = plan(ready, p2.notifiedKeys);
  assert.equal(p3.newKeys.size, 0);
});

test('state markers parse both the old array form and the new object form', () => {
  assert.deepEqual(markedState('<!-- owner-approvals:notified ["a","b"] -->'), { keys: ['a', 'b'], at: null });
  assert.deepEqual(markedState('<!-- owner-approvals:notified {"keys":["a"],"at":"2026-10-14T04:54:06Z"} -->\nrest'), { keys: ['a'], at: '2026-10-14T04:54:06Z' });
  assert.deepEqual(markedState('nothing'), { keys: [], at: null });
});

test('titles lose their technical prefixes', () => {
  assert.equal(plainTitle('chore(docs): neutralise client-identifying values'), 'Neutralise client-identifying values');
  assert.equal(plainTitle('Proposal F-3(b): parse Anthropic responses by first text block'), 'Parse Anthropic responses by first text block');
  assert.equal(ownerSummary('Owner summary: Cleaned up documentation and test fixtures.', 'ignored'), 'Cleaned up documentation and test fixtures');
  assert.equal(ownerSummary('### Problem\n\nx\n\n### Owner summary\n\nApprove the proposed OpenAI model change.\n\n### Value', 'ignored'), 'Approve the proposed OpenAI model change');
});

test('the notification reads as a short plain-English message', () => {
  const items = {
    decision: [{ key: 'k1', line: 'ContextualWP: merge "Run the tests on GitHub Actions"? ([#4](u4); reviewed, 2 checks passed)' }, { key: 'k2', line: 'ContextualWP: Approve the proposed OpenAI model change? ([#5](u5); proposal)' }],
    intervention: [], automation: [],
  };
  const completed = [{ line: completedLine('kwd-it/contextual-console', { number: 3, html_url: 'u3', title: 'chore(docs): neutralise values', body: 'Owner summary: Cleaned up documentation and test fixtures.\nMerge: automatic', merged_at: '2026-10-14T06:00:00Z' }) }];
  const text = renderComment(items, new Set(['k1']), completed);
  assert.match(text, /^<!-- owner-approvals:notified \{"keys":\["k1"\]\} -->\n@kwdit Contextual: 2 decisions needed\n\nCompleted automatically since the last notification:\n- Contextual Console: Cleaned up documentation and test fixtures \(\[#3\]\(u3\); merged 2026-10-14\)\n\nYour decisions:\n- ContextualWP: merge "Run the tests on GitHub Actions"\? \(\[#4\]\(u4\); reviewed, 2 checks passed\) \*\*\(new\)\*\*\n- ContextualWP: Approve the proposed OpenAI model change\? \(\[#5\]\(u5\); proposal\)\n\nEverything else is being handled\.$/);
  assert.doesNotMatch(text, /Needs your intervention/);
});
