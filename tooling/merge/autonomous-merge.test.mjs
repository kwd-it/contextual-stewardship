// Positive and negative cases for the autonomous merge policy (D-016).
// Run: node --test tooling/merge/autonomous-merge.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, checkFile, headingsIn, parseArgs } from './autonomous-merge.mjs';

const SHA = 'a65c96f825aedb7e6c250cd30927d811c686b801';

function pr(overrides = {}) {
  return {
    state: 'open', merged: false, draft: false, title: 'chore(tests): neutralise fixture titles',
    body: 'Summary.\n\nCodex review of the actual diff: no material findings (exit 0).\n',
    author_association: 'MEMBER', mergeable: true, mergeable_state: 'clean',
    head: { sha: SHA, repo: { full_name: 'kwd-it/contextualwp-housebuilder-pack' } },
    base: { ref: 'main', repo: { full_name: 'kwd-it/contextualwp-housebuilder-pack' } },
    ...overrides,
  };
}

function file(filename, patch, extra = {}) {
  const added = patch.split('\n').filter((l) => l.startsWith('+')).length;
  const removed = patch.split('\n').filter((l) => l.startsWith('-')).length;
  return { filename, status: 'modified', additions: added, deletions: removed, patch, ...extra };
}

// Ordinary, non-empty files at head and base unless a test says otherwise.
function objectsOf(files, override = {}) {
  const objects = {};
  for (const f of files) {
    if (f.status !== 'removed') objects[`head:${f.filename}`] = { type: 'file', size: 10 };
    if (f.status !== 'added') objects[`base:${f.previous_filename || f.filename}`] = { type: 'file', size: 10 };
  }
  return { ...objects, ...override };
}

const fixtureTest = file('tests/ExampleTest.php',
  "-\t\t$this->seed('Old Name');\n+\t\t$this->seed('Example Homes');\n-\t\t$this->assertSame('Old Name', $x);\n+\t\t$this->assertSame('Example Homes', $x);");
const changelog = file('CHANGELOG.md', '+- Neutralised two fixture titles. Assertions unchanged.');

function input(overrides = {}) {
  const files = overrides.files || [fixtureTest, changelog];
  return { repo: 'kwd-it/contextualwp-housebuilder-pack', pr: pr(), files, objects: objectsOf(files), reviews: [], checkRuns: [], statuses: [], reviewedSha: 'a65c96f', ...overrides };
}

function consoleInput(files) {
  return input({ repo: 'kwd-it/contextual-console', pr: pr({ base: { ref: 'master', repo: { full_name: 'kwd-it/contextual-console' } }, head: { sha: SHA, repo: { full_name: 'kwd-it/contextual-console' } } }), files });
}

test('safe test-fixture change with changelog entry qualifies', () => {
  const r = evaluate(input());
  assert.deepEqual(r.reasons, []);
  assert.equal(r.eligible, true);
  assert.equal(r.mergeMethod, 'rebase');
});

test('documentation-only change qualifies, including docs/ and README', () => {
  const r = evaluate(consoleInput([file('README.md', '-old\n+new'), file('docs/OPERATIONS.md', '+note'), changelog]));
  assert.deepEqual(r.reasons, []);
  assert.equal(r.eligible, true);
});

test('Unreleased and Keep a Changelog category headings are fine; any other heading change is not', () => {
  assert.equal(evaluate(input({ files: [file('CHANGELOG.md', '+## [Unreleased]\n+- note')] })).eligible, true);
  assert.equal(evaluate(input({ files: [file('docs/CHANGELOG.md', '+### Changed\n+- note\n+### Fixed\n+- fix')] })).eligible, true);
  for (const patch of ['+## [1.4.0] - 2026-10-14', '+## Release 1.2.3', '+## v0.4.9', '-## Unreleased\n+## 0.4.9', '+### Notes', '+## 2026-10-14', '+1.4.0 - 2026-10-14\n+---', '+Release 1.4.0\n+=====']) {
    const r = evaluate(input({ files: [file('CHANGELOG.md', patch)] }));
    assert.equal(r.eligible, false, patch);
    assert.match(r.reasons.join(), /changes a heading other than Unreleased or a Keep a Changelog category/);
  }
});

test('successful checks qualify; pending, failing, skipped or neutral checks do not', () => {
  const ok = evaluate(input({ checkRuns: [{ status: 'completed', conclusion: 'success' }], statuses: [{ state: 'success' }] }));
  assert.equal(ok.eligible, true);
  assert.match(evaluate(input({ checkRuns: [{ status: 'in_progress', conclusion: null }] })).reasons.join(), /checks pending/);
  assert.match(evaluate(input({ checkRuns: [{ status: 'completed', conclusion: 'failure' }] })).reasons.join(), /not all successful \(failure\)/);
  assert.match(evaluate(input({ checkRuns: [{ status: 'completed', conclusion: 'skipped' }] })).reasons.join(), /not all successful \(skipped\)/);
  assert.match(evaluate(input({ checkRuns: [{ status: 'completed', conclusion: 'neutral' }] })).reasons.join(), /not all successful \(neutral\)/);
  assert.match(evaluate(input({ statuses: [{ state: 'error' }] })).reasons.join(), /not all successful \(error\)/);
});

test('CI workflow changes cannot qualify', () => {
  const r = evaluate(input({ files: [file('.github/workflows/tests.yml', '+name: Tests'), file('docs/CHANGELOG.md', '+- CI')] }));
  assert.equal(r.eligible, false);
  assert.match(r.reasons.join(), /\.github\/workflows\/tests\.yml: not maintenance/);
});

test('Composer and other dependency changes cannot qualify', () => {
  for (const name of ['composer.json', 'composer.lock', 'package.json', 'package-lock.json']) {
    const r = evaluate(input({ files: [file(name, '-"a": "1"\n+"a": "2"')] }));
    assert.equal(r.eligible, false, name);
    assert.match(r.reasons.join(), new RegExp(`${name.replace(/\./g, '\\.')}: not maintenance`));
  }
});

test('runtime code and configuration changes cannot qualify', () => {
  for (const name of ['includes/helpers/utilities.php', 'src/Services/PlotsRestService.php', 'app/Core/Models/Run.php', 'contextwp.php', 'config/app.php', 'routes/web.php', 'resources/views/x.blade.php', 'phpunit.xml', '.env.example', 'Dockerfile', 'docs/diagram.png']) {
    const r = evaluate(input({ files: [file(name, '+x')] }));
    assert.equal(r.eligible, false, name);
  }
});

test('governance, policy, licence, contract and AI instruction documents cannot qualify', () => {
  for (const name of ['CLAUDE.md', 'AGENTS.md', 'DEVNOTES.md', 'docs/DEVNOTES.md', '.cursor/skills/x/SKILL.md', '.agents/skills/example/SKILL.md', '.github/PULL_REQUEST_TEMPLATE.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'LICENSE', 'LICENSE.md', 'governance/authority-model.md', 'docs/COMPATIBILITY.md', 'docs/PACK-SPEC.md', '.cursorrules', 'GEMINI.md', '.github/copilot-instructions.md', 'CODEOWNERS']) {
    const r = evaluate(input({ files: [file(name, '+x')] }));
    assert.equal(r.eligible, false, name);
    assert.match(r.reasons.join(), /denied path/, name);
  }
});

test('version-carrying files and release commits cannot qualify', () => {
  assert.equal(evaluate(input({ files: [file('readme.txt', '-Stable tag: 1\n+Stable tag: 2')] })).eligible, false);
  assert.equal(evaluate(input({ pr: pr({ title: 'chore(release): prepare v1.4.0' }) })).eligible, false);
});

test('weakened tests cannot qualify', () => {
  const removedAssertion = file('tests/ExampleTest.php', "-\t\t$this->assertSame(1, $x);\n+\t\t$y = 1;");
  assert.match(evaluate(input({ files: [removedAssertion] })).reasons.join(), /removes assertions/);
  const skipped = file('tests/ExampleTest.php', "+\t\t$this->markTestSkipped('later');");
  assert.match(evaluate(input({ files: [skipped] })).reasons.join(), /skip, todo or only/);
  const removedTest = file('tests/ExampleTest.php', '-\tpublic function testThing(): void\n-\t{\n-\t}');
  assert.match(evaluate(input({ files: [removedTest] })).reasons.join(), /removes tests/);
  const deleted = file('tests/ExampleTest.php', '', { status: 'removed' });
  assert.match(evaluate(input({ files: [deleted] })).reasons.join(), /test file removed/);
  const pestOnly = file('tests/Feature/XTest.php', "+it('works', fn () => expect(1)->toBe(1))->only();");
  assert.match(evaluate(input({ files: [pestOnly] })).reasons.join(), /skip, todo or only/);
});

test('renames are judged on both paths and may not move tests out of tests/', () => {
  const runtimeToDocs = file('docs/old.md', '', { status: 'renamed', previous_filename: 'contextwp.php', additions: 0, deletions: 0 });
  assert.match(evaluate(input({ files: [runtimeToDocs] })).reasons.join(), /renamed from contextwp\.php: outside/);
  const testToDocs = file('docs/ExampleTest.md', '', { status: 'renamed', previous_filename: 'tests/ExampleTest.php', additions: 0, deletions: 0 });
  assert.match(evaluate(input({ files: [testToDocs] })).reasons.join(), /moved out of tests\//);
  const instructionToDocs = file('docs/notes.md', '', { status: 'renamed', previous_filename: 'CLAUDE.md', additions: 0, deletions: 0 });
  assert.match(evaluate(input({ files: [instructionToDocs] })).reasons.join(), /renamed from CLAUDE\.md: not maintenance/);
  assert.match(checkFile({ filename: 'docs/old.md', previous_filename: 'CLAUDE.md', status: 'renamed', patch: '' }, {}).join(), /denied path/);
  const renamedChangelog = file('docs/history.md', '-## Unreleased\n+## 1.4.0', { status: 'renamed', previous_filename: 'CHANGELOG.md' });
  const r = evaluate(input({ files: [renamedChangelog] }));
  assert.match(r.reasons.join(), /changes a heading other than Unreleased/);
  assert.match(r.reasons.join(), /renames a changelog/);
});

test('Setext and ATX headings are both recognised', () => {
  assert.deepEqual(headingsIn(['## Unreleased', 'Release 1.4.0', '---', '- a list item', '---', 'text']), ['Unreleased', 'Release 1.4.0']);
  assert.deepEqual(headingsIn(['Title', '===', '', '### Fixed ###']), ['Title', 'Fixed']);
});

test('the CLI reads the reviewed head from the description when --reviewed is omitted', () => {
  assert.deepEqual(parseArgs(['kwd-it/contextualwp', '4', '--dry-run']), { repo: 'kwd-it/contextualwp', number: 4, dryRun: true, reviewed: undefined });
  assert.deepEqual(parseArgs(['kwd-it/contextualwp', '4', '--reviewed', '0e625c1']), { repo: 'kwd-it/contextualwp', number: 4, dryRun: false, reviewed: '0e625c1' });
  assert.deepEqual(parseArgs(['--reviewed', 'a65c96f', 'kwd-it/contextualwp', '2']).repo, 'kwd-it/contextualwp');
});

test('missing diff content and non-file Git objects fail closed', () => {
  const noPatch = { filename: 'tests/ExampleTest.php', status: 'modified', additions: 0, deletions: 20 };
  assert.match(evaluate(input({ files: [noPatch] })).reasons.join(), /no diff content available/);
  const files = [fixtureTest, changelog];
  assert.match(evaluate(input({ files, objects: objectsOf(files, { 'head:tests/ExampleTest.php': { type: 'submodule' } }) })).reasons.join(), /is a submodule/);
  assert.match(evaluate(input({ files, objects: objectsOf(files, { 'head:CHANGELOG.md': { type: 'symlink' } }) })).reasons.join(), /is a symlink/);
  assert.match(evaluate(input({ files, objects: objectsOf(files, { 'head:CHANGELOG.md': { type: 'executable', size: 5 } }) })).reasons.join(), /is an executable/);
  assert.match(evaluate(input({ files, objects: {} })).reasons.join(), /object type unknown at head/);
  assert.match(evaluate(input({ files, treesComplete: false })).reasons.join(), /truncated/);
  // removals need evidence too: the removed object must have been an ordinary file with a diff
  const removedWithPatch = file('docs/obsolete.md', '-gone', { status: 'removed' });
  assert.equal(evaluate(input({ files: [removedWithPatch] })).eligible, true);
  const removedBinary = { filename: 'docs/old.png', status: 'removed', additions: 0, deletions: 0 };
  assert.match(evaluate(input({ files: [removedBinary], objects: { 'base:docs/old.png': { type: 'file', size: 2048 } } })).reasons.join(), /no diff content available/);
  const removedSymlinkMd = { filename: 'docs/link.md', status: 'removed', additions: 0, deletions: 1, patch: '-../README.md' };
  assert.match(evaluate(input({ files: [removedSymlinkMd], objects: { 'base:docs/link.md': { type: 'symlink', size: 12 } } })).reasons.join(), /is a symlink/);
  const removedEmptyPatch = { filename: 'docs/old.md', status: 'removed', additions: 0, deletions: 3, patch: '' };
  assert.match(evaluate(input({ files: [removedEmptyPatch], objects: { 'base:docs/old.md': { type: 'file', size: 30 } } })).reasons.join(), /no diff content available/);
  // the one accepted exception: an empty text file, established from the tree
  const emptyAdded = { filename: 'docs/empty.md', status: 'added', additions: 0, deletions: 0 };
  assert.equal(evaluate(input({ files: [emptyAdded], objects: { 'head:docs/empty.md': { type: 'file', size: 0 } } })).eligible, true);
  const emptyRemoved = { filename: 'docs/empty.md', status: 'removed', additions: 0, deletions: 0 };
  assert.equal(evaluate(input({ files: [emptyRemoved], objects: { 'base:docs/empty.md': { type: 'file', size: 0 } } })).eligible, true);
});

test('unreviewed, changed-head, draft, conflicting or closed pull requests cannot qualify', () => {
  assert.match(evaluate(input({ pr: pr({ body: 'Codex review outstanding.' }) })).reasons.join(), /does not record a completed Codex review/);
  assert.match(evaluate(input({ reviewedSha: 'deadbee' })).reasons.join(), /differs from the reviewed head/);
  assert.match(evaluate(input({ reviewedSha: undefined })).reasons.join(), /no reviewed head/);
  assert.match(evaluate(input({ reviewedSha: 'abc' })).reasons.join(), /not a commit SHA/);
  assert.match(evaluate(input({ pr: pr({ draft: true }) })).reasons.join(), /draft/);
  assert.match(evaluate(input({ pr: pr({ mergeable: false, mergeable_state: 'dirty' }) })).reasons.join(), /merge state is dirty/);
  assert.match(evaluate(input({ pr: pr({ mergeable: null, mergeable_state: 'unknown' }) })).reasons.join(), /not yet computed/);
  assert.match(evaluate(input({ pr: pr({ state: 'closed' }) })).reasons.join(), /is closed/);
  assert.match(evaluate(input({ pr: pr({ merged: true }) })).reasons.join(), /already merged/);
  assert.match(evaluate(input({ reviews: [{ user: { login: 'x' }, state: 'CHANGES_REQUESTED' }] })).reasons.join(), /requests changes/);
});

test('untrusted external pull requests cannot qualify', () => {
  const fork = evaluate(input({ pr: pr({ head: { sha: SHA, repo: { full_name: 'someone/contextualwp-housebuilder-pack' } }, author_association: 'CONTRIBUTOR' }) }));
  assert.match(fork.reasons.join(), /fork/);
  assert.match(fork.reasons.join(), /not trusted/);
  const noRepo = evaluate(input({ pr: pr({ head: { sha: SHA, repo: null } }) }));
  assert.match(noRepo.reasons.join(), /fork/);
  const wrongBase = evaluate(input({ pr: pr({ base: { ref: 'release/1.x', repo: { full_name: 'kwd-it/contextualwp-housebuilder-pack' } } }) }));
  assert.match(wrongBase.reasons.join(), /base is release\/1\.x/);
});

test('repositories without verified deployment safety are excluded', () => {
  const r = evaluate(input({ repo: 'kwd-it/contextual-stewardship', pr: pr({ head: { sha: SHA, repo: { full_name: 'kwd-it/contextual-stewardship' } }, base: { ref: 'main', repo: { full_name: 'kwd-it/contextual-stewardship' } } }) }));
  assert.equal(r.eligible, false);
  assert.match(r.reasons.join(), /not a repository where unattended merge is permitted/);
  assert.equal(r.mergeMethod, undefined);
});

test('size limits bound the category', () => {
  const many = Array.from({ length: 21 }, (_, i) => file(`docs/${i}.md`, '+x'));
  assert.match(evaluate(input({ files: many })).reasons.join(), /21 files changed/);
  const big = file('docs/big.md', Array.from({ length: 401 }, () => '+line').join('\n'));
  assert.match(evaluate(input({ files: [big] })).reasons.join(), /401 lines changed/);
});
