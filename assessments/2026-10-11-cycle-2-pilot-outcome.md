# Stewardship cycle 2 outcome: 2026-10-11 (controlled pilot)

Outcome record for the second stewardship cycle, run as a controlled pilot narrowed by its fire payload to a single AUTONOMOUS item. No general assessment was performed in this cycle, by design; the [cycle 1 outcome](2026-10-10-cycle-1-outcome.md) and the [initial assessment](2026-10-10-initial-assessment.md) remain current. Facts below were verified on 2026-10-11 in the Routine's cloud environment.

## Scope

One item only: make the ContextualWP PHPUnit suite pass on a case-sensitive Linux filesystem — the eight `Class "ContextualWP\Helpers\Utilities" not found` errors observed in the Routine environment on 2026-10-10 and recorded in `governance/routine.md` as the first AUTONOMOUS item to carry through once cloud review worked. The payload narrowed the run; it did not broaden authority, and nothing in it required ignoring.

## Capability gates

Both gates in `governance/routine.md` held: `tooling/codex/setup.sh` exited 0 in this run (13 seconds, proxy network secret, no credential visible), and the recorded cloud verification of 2026-10-11 stands. The run therefore operated in AUTONOMOUS-to-PR mode.

## What was done

| Item | Authority | Outcome |
|---|---|---|
| ContextualWP Linux test autoload | AUTONOMOUS | [contextualwp #3](https://github.com/kwd-it/contextualwp/pull/3) opened against `main`, awaiting owner merge. |

Root cause: a test-bootstrap defect, not a runtime defect. `composer.json` maps PSR-4 `ContextualWP\` to `includes/`, but the helpers live in lower-case, hyphenated files, so Composer resolves `ContextualWP\Helpers\Utilities` only where the filesystem ignores case. Runtime loads every helper by explicit `require_once` and is unaffected on any platform. The fix adds one explicit `require` of `includes/helpers/utilities.php` to `tests/bootstrap.php`, matching the bootstrap's existing convention, plus a one-line changelog entry. No file renames, no `composer.json` change, no runtime, interface, dependency, platform or provider change.

Validation on PHP 8.3 (Linux): the eight errors reproduced exactly before the fix; after it, `vendor/bin/phpunit` reports 116 tests, 260 assertions, 0 errors, 0 failures, with the 7 data-provider deprecations and 9 skips pre-existing. `php -l`, `composer validate` and `composer dump-autoload` were clean.

Codex review of the actual diff through `tooling/codex/review.mjs`: **no material findings** (exit 0, 44 seconds). The reviewer independently re-ran the eight previously failing tests (8 tests, 14 assertions, passing) and confirmed the change masks nothing and remains AUTONOMOUS.

## Consequence for the Routine

Once contextualwp #3 is merged, the ContextualWP suite is runnable in the Routine environment, so the "validated" condition in `governance/routine.md` can be met for ContextualWP in later cycles. Until it merges, that limitation stands.

## Boundaries observed

The pull request is not merged; merge and release remain with the product owner. Nothing was deployed, no version was bumped, no tag or release was made, and the reference implementation was untouched. The Housebuilder Pack and the Console were not modified. Governance files were not changed.

## Carried forward

Unchanged from cycle 1: PROPOSE FIRST items F-2(b) and F-3(b) await owner decision; AUTONOMOUS items F-6(a), F-8, F-12(a) and F-13 remain deferred to later cycles; the Mistral `reasoning_effort` watch item stands.
