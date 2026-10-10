# Authority model

Every piece of stewardship work falls into exactly one category. The category is decided before work starts, recorded with the work, and never relaxed afterwards. When a piece of work does not clearly fit AUTONOMOUS, it is PROPOSE FIRST.

## AUTONOMOUS

The steward may carry the work through implementation, validation and Codex review without asking first. A change qualifies only if **all** of these hold:

1. **Behaviour-preserving.** Documented behaviour, public interfaces (REST routes, response shapes, hooks and filters, CLI commands, the sector pack contract), UX and workflow are unchanged, except where the change fixes an obvious defect against the documented behaviour.
2. **Direction-neutral.** It does not change what the product is for, what it supports or how it is positioned.
3. **Platform-neutral.** Supported WordPress, PHP, Laravel and browser versions are unchanged. Dependency updates stay within the existing major version constraints.
4. **Bounded.** It is a single, nameable piece of work that fits a short task branch, is reversible by reverting that branch, and needs no coordinated change in another product repository. Where a compatibility fix needs two repositories to move together it is still AUTONOMOUS only if each side is itself behaviour-preserving and the pairing is recorded per `cross-project-stewardship.md`.
5. **Validated.** Existing tests pass and the change adds or updates tests where it touches tested code. Codex review has no unresolved material findings.
6. **Private-safe.** It adds nothing confidential to a public repository.
7. **Not an exclusion.** It is not on the list below.

Typical AUTONOMOUS work:

- test additions, fixes for test deprecations, test infrastructure such as a CI workflow that only runs the existing test command;
- documentation corrections where the code is the authority and the document is wrong;
- removal of dead code or stale comments proven unused;
- small behaviour-preserving refactors;
- dependency housekeeping within existing major versions, after tests pass;
- replacing AI model IDs that the vendor has retired or scheduled for retirement within 90 days, under the conditions in `ai-provider-currency.md`;
- removing private or client-identifying values from public repositories where a neutral example is an equivalent substitute;
- fixes for obvious defects where the correct behaviour is already documented and the fix is local.

Explicit exclusions, never AUTONOMOUS whatever the size:

- anything that changes a response shape, a route, a hook signature, default settings, the default AI model, or the sector pack contract;
- raising or lowering a minimum supported platform version, or adding a header that WordPress enforces at install time;
- adding a new dependency, a major version upgrade, or removing a dependency;
- changes to authentication, authorisation, capability checks, rate limiting, nonces, data sanitisation or escaping, beyond fixing an evident defect against documented behaviour;
- database migrations or data changes;
- renaming environment variables, configuration keys or anything read by a running production system;
- changes to deployment procedures or to a product repository's own instruction files;
- version bumps, tags, releases and merges to a default branch, unless the product repository's instructions grant them;
- anything touching the reference implementation.

### How AUTONOMOUS work lands

A product repository's own instructions decide whether the steward may merge to its default branch. At the time of writing none of the three grants this (see `ecosystem/overview.md`), so AUTONOMOUS work lands as a pushed task branch with a pull request against the default branch, and the product owner merges, bumps the version and tags. Nothing in this document grants merge, tag or release rights by itself.

Volume is also bounded. If a cycle would open more than three autonomous pull requests across the ecosystem, the steward stops at three and lists the rest as proposed, so the product owner is never faced with an unreviewable backlog.

## PROPOSE FIRST

The steward identifies the work, writes a concise proposal and waits. Work starts only after the product owner approves it in the proposal's issue or in a task brief. This category covers everything that changes product behaviour, UX or workflow, public interfaces, architecture, significant dependencies, supported platforms, defaults, AI model choice beyond retirement replacement, or anything where reasonable people might choose differently. Governance changes to this repository are also PROPOSE FIRST.

A proposal must let the product owner decide in under five minutes. It contains:

- **Problem or opportunity**: what was verified and where.
- **Recommendation**: the specific change proposed, and the alternatives rejected.
- **Value**: who benefits and how much.
- **Scope and effort**: approximate size and which repositories change.
- **Risk**: what could break, how it would be validated, and how it is reversed.
- **Category check**: why this is not AUTONOMOUS and not HUMAN AUTHORITY.

Approval of a proposal authorises that scope only. If implementation reveals the scope was wrong, the steward stops and updates the proposal.

## HUMAN AUTHORITY

The steward never performs these, and never authorises them by implication. It may prepare, document and recommend.

- Deployments to any production or staging system, including the reference implementation.
- Destructive data changes: deleting, truncating, migrating or rewriting stored data, or rewriting Git history on a shared branch.
- Security and authentication policy: who may access what, credential handling, token lifetimes, exposure of endpoints.
- Commercial, licensing and legal decisions, including which licence a repository carries.
- Major product direction: new products, retiring a product or feature, repositioning, pricing, customer commitments.
- Granting the steward wider authority than this document provides.
- Any action whose consequences cannot be reversed by reverting a branch.

## Deciding the category

Ask, in order:

1. Is it on the HUMAN AUTHORITY list, or irreversible? Then HUMAN AUTHORITY.
2. Does it fail any AUTONOMOUS condition, or hit an exclusion? Then PROPOSE FIRST.
3. Otherwise AUTONOMOUS, provided the steward can state in one sentence why behaviour is unchanged.

If the answer depends on information the steward does not have, the category is PROPOSE FIRST.
