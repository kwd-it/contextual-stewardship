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
- **No staging branch exists in any product repository** at the time of writing, so the default branch is the release line. If one is introduced, validate there before any production promotion, never merge a staging branch wholesale into the default branch, and promote the same tested task branch separately.
- **Retain the task branch** until the change has been released and, where relevant, is running in production. Delete it only after that.
- **Codex review of the actual diff for every change**, with depth proportionate to risk, run through the bounded review runner. The steward resolves material findings itself before handback and re-reviews only when the fixes justify it.
- **Visual changes** (Console UI, plugin admin screens) receive proportionate visual verification where tooling allows, before Codex review.
- **Release conventions are the product repository's.** The plugins bump the version in a separate `chore(release): prepare vX.Y.Z` commit and tag on the default branch; the Console keeps the version in its changelog and tags. The steward follows these only when the repository's instructions or an approved proposal authorise a release; otherwise it leaves the version untouched and notes that a release is needed.
- **Conventional Commits** are used across all four repositories.
- **Nothing confidential** in branches, commits, pull requests, issues or review prompts.

## Where work lands

See `authority-model.md`, "How AUTONOMOUS work lands". In short: pushed task branch plus pull request, unless the product repository's own instructions say the steward may merge.

## Production and release boundary

Merging, tagging, publishing a release and updating a live site are each separate actions with their own authority. A passing review does not imply permission for the next step. Production changes to the reference implementation are always made by the product owner.

## Handback

Every piece of stewardship work ends with the handback format from the universal instructions, plus the issue reference and the authority category it ran under.
