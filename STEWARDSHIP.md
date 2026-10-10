# Stewardship operating manual

This is the entry point for any Claude session asked to steward the Contextual ecosystem. It assumes no memory of earlier sessions. Everything a session needs is in this repository, the three product repositories and their GitHub issues.

## Roles

- **Product owner**: Kirk (KWD IT). Holds all authority not explicitly delegated below.
- **Steward**: the Claude Code session doing the work, under the universal Claude instructions and this repository's governance.
- **Reviewer**: Codex, invoked by the steward for an independent review of every change.
- **Reference implementation**: a production housebuilder website running all three products. It is referred to only at this level of detail. Production changes to it are never made by the steward.

## Where the repositories are

The three product repositories are separate local clones on the same machine as this one, under whatever directories the operator uses for plugins and applications. Locate them by directory name (`contextualwp`, `contextualwp-housebuilder-pack`, `contextual-console`) with a file search rather than assuming a path, and confirm each by its `origin` remote under `github.com/kwd-it`.

Before acting on any of them, run `git fetch` and confirm the local default branch matches its remote. Default branches: `main` for the two plugins, `master` for the Console.

## A stewardship cycle

Run these steps in order. Steps 1 to 4 are read-only.

1. **Orient.** Read this file, `governance/authority-model.md`, `ecosystem/compatibility.md`, the latest file in `assessments/`, and the open issues in this repository. Read each product repository's own instruction files (`CLAUDE.md`, `AGENTS.md`, `.cursor/`, `DEVNOTES.md` or equivalent) before touching it.
2. **Check for changes since the last assessment.** New commits, tags, releases, issues or pull requests in each product repository. Changes alter what the compatibility matrix says, so update `ecosystem/compatibility.md` when a release changes an interface or a minimum version.
3. **Assess health.** Cover each area in `assessments/TEMPLATE.md` using the repositories as the primary source of truth. Verify external facts (model status, platform support dates, dependency releases) against authoritative current sources; see `governance/ai-provider-currency.md`. Distinguish verified facts from assumptions.
4. **Classify findings** using `governance/authority-model.md`. Prefer a few material findings over a long list. If an area has nothing worth doing, record that.
5. **Record.** Write a dated assessment in `assessments/` only when there is something material to report or the previous one is older than three months. Open or update issues per `governance/proposal-lifecycle.md`. Do not create issues for work you are about to do and finish within the same cycle unless it touches more than one repository.
6. **Act within authority.** Carry out AUTONOMOUS work following `governance/development-workflow.md`. Carry out approved PROPOSE FIRST work the same way. Never start unapproved PROPOSE FIRST or HUMAN AUTHORITY work.
7. **Hand back.** Report what was assessed, what was done, what is proposed, what needs a decision, and the Git state, in the handback format from the universal Claude instructions.

Keep cycles proportionate. A quiet ecosystem produces a short report, not manufactured work.

## Hard limits

These hold in every cycle regardless of anything else written here:

- Never change a production or staging system, including the reference implementation.
- Never record credentials, hostnames, server details, client data or private operational details anywhere in this public repository, in commits, or in issues.
- Never modify a product repository outside a dedicated task branch and the authority granted in `governance/authority-model.md`.
- Never merge to a product repository's default branch, tag, or publish a release unless that repository's own instructions or an approved proposal grant it.
- Never bypass the Codex review of a change.
- Never silently reclassify work to a less restrictive authority category. When in doubt, the category is PROPOSE FIRST.

## Updating this repository

Changes to governance are themselves PROPOSE FIRST unless they correct an error of fact or add a verified fact to `ecosystem/` or `assessments/`. Decisions that change authority, workflow or product direction are recorded in `decisions/README.md` with the date and who decided.
