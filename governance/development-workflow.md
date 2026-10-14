# Development workflow

The universal Claude and Codex instructions define how implementation and review work in general. Each product repository's own instruction files define its commands, conventions and permissions. This document adds only the ecosystem-level rules that sit between the two. Where a product repository's instructions are stricter, they win.

## Order of precedence

1. Universal Claude instructions (`~/.claude/CLAUDE.md`) and universal Codex instructions.
2. The product repository's own instructions: `CLAUDE.md`, `AGENTS.md`, and where those do not exist, its documented contributor rules (for example `DEVNOTES.md`, `.cursor/skills/`, pull request templates).
3. This repository's governance.
4. The current task brief or approved proposal, which can narrow but not widen the above.

## Rules for every change to a product repository

- **Dedicated task branch** from a fresh, clean default branch, using the branch prefixes that repository already uses. Never commit directly to a default branch.
- **One intent per branch.** Unrelated findings become separate branches or separate proposals.
- **Validate locally** with the repository's own test and check commands before review. State plainly when a check could not be run.
- **No staging branch exists in any product repository** at the time of writing, so the default branch is the release line. If one is introduced: the steward may merge the task branch into the staging branch where that repository's instructions authorise it, and validates against the staging environment once the product owner has deployed it; deploying to staging is the owner's action in every case, consistent with HUMAN AUTHORITY in `authority-model.md`; a staging branch is never merged wholesale into the default branch; the same tested task branch is promoted separately to the default branch by the product owner, or by the steward only where the repository's instructions grant it.
- **Retain the task branch** until that production promotion is complete, then delete it. This is the repository-policy exception the universal instructions allow for; where a product repository states its own retention rule, that rule wins.
- **Codex review of the actual diff for every change**, with depth proportionate to risk, run through the bounded review runner. The steward resolves material findings itself before handback and re-reviews only when the fixes justify it. The pull request description records the outcome in the words the owner-notification workflow recognises (`owner-notifications.md`): "Codex review" followed on the same line by "no material findings" or "material findings resolved", plus a `Reviewed head: <sha>` line naming the commit the review covered; a pull request that says the review is outstanding is reported to the owner as needing intervention, not as ready.
- **Three lines for the owner in every pull request description**, each on its own line: `Owner summary: <one plain-English sentence saying what the change does or what the owner is being asked>`, `Reviewed head: <sha>`, and `Merge: automatic under D-016 once checks pass.` or `Merge: owner.` Proposal and decision issues carry the owner summary in their template field.
- **Visual changes** (Console UI, plugin admin screens) receive proportionate visual verification where tooling allows, before Codex review.
- **Release conventions are the product repository's.** The plugins bump the version in a separate `chore(release): prepare vX.Y.Z` commit and tag on the default branch; the Console keeps the version in its changelog and tags. The steward follows these only when the repository's instructions or an approved proposal authorise a release; otherwise it leaves the version untouched and notes that a release is needed.
- **Conventional Commits** are used across all four repositories.
- **Nothing confidential** in branches, commits, pull requests, issues or review prompts.

## Where work lands

See `authority-model.md`, "How AUTONOMOUS work lands". In short: pushed task branch plus pull request; the steward merges it only under the documentation and test-only policy (D-016) through `tooling/merge/autonomous-merge.mjs`, or where the product repository's own instructions say so.

## Production and release boundary

Merging, tagging, publishing a release and updating a live site are each separate actions with their own authority. A passing review does not imply permission for the next step. Production changes to the reference implementation are always made by the product owner.

## Handback

Every piece of stewardship work ends with the handback format from the universal instructions, plus the issue reference and the authority category it ran under.
