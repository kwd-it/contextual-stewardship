# Ecosystem overview

Verified against the repositories on 2026-10-10. Anything marked *assumption* was not verified in code.

## Roles

**ContextualWP** (WordPress plugin, PHP, v1.3.6) is the foundation. It exposes a site's structure and content as machine-readable context: an MCP-style manifest, paginated context listing and retrieval, a schema endpoint with an interpretation layer, and editor-safe ACF field metadata. It also hosts the sector pack registry that lets other plugins extend that context without forking core. Its AI-assisted admin tools (provider settings, `/generate_context`, global chat, ACF AskAI) are optional and secondary; they are the only place in the ecosystem that calls AI providers.

**ContextualWP Housebuilder Pack** (WordPress plugin, PHP, v0.4.8) is the first sector pack and the public reference for how packs work. It registers with core, infers housebuilder structure (developments, plots, house types) from a site's existing post types and taxonomies without registering any of its own, adds relationship hints and interpretation blocks to core's endpoints, and serves a single authenticated plots feed with asset-completeness signals.

**Contextual Console** (Laravel 13 application, PHP, v1.2.1) is the operator-facing monitor. It pulls plot datasets from HTTP JSON sources (in practice the Pack's plots feed), snapshots them daily, detects changes and inconsistencies, raises issues with severities and statuses, and emails a daily summary. It is a single installation with many monitored sources and admin/operator users; it is not multi-tenant.

## Data flow

```
WordPress site
  ContextualWP core ──registers/extends──▶ Housebuilder Pack
        │ /wp-json/mcp/v1/*                      │ /wp-json/contextualwp-housebuilder/v1/plots
        │ /wp-json/contextualwp/v1/*             │
        ▼                                        ▼
  (agents, tools, consoles)              Contextual Console  ──▶  dashboard, issues, daily email
                                         (HTTP GET, Application Password, daily schedule)
```

The Console is pull-only. Nothing in WordPress pushes to it, and it exposes no API.

## Reference implementation

One UK housebuilder website runs all three in production. It is the source of most real-world findings in the Console's and Pack's changelogs. The steward refers to it only at this level and never records its infrastructure, credentials or data.

## Repository conventions (pointers, not copies)

| | ContextualWP | Housebuilder Pack | Contextual Console |
|---|---|---|---|
| Default branch | `main` | `main` | `master` |
| Staging branch | none | none | none |
| Instruction files | `CLAUDE.md`, `AGENTS.md`; conventions in `docs/DEVNOTES.md` | `CLAUDE.md`, `AGENTS.md`; conventions in `DEVNOTES.md` and `.github/` templates | `CLAUDE.md`, `AGENTS.md`, reconciled with the Cursor rules in `.cursor/skills/` and `docs/contextual-console-handover.md` |
| Branch prefixes | `docs/ feat/ fix/ refactor/ test/ chore/` | Conventional (`feat/ fix/ chore/`) | `feature/ fix/ chore/` |
| Release | `chore(release): prepare vX.Y.Z` commit on branch, merge, tag on `main` | same pattern, linear history | separate release commit, tag; version in `CHANGELOG.md` only |
| Tests | PHPUnit 10, stub bootstrap | PHPUnit 10.5, stub bootstrap | Pest 4, SQLite in memory, `composer test` |
| CI | none | none | none |
| Licence | GPL-3.0-only (`LICENSE` authoritative; `composer.json` corrected from MIT in pull request #1; D-008) | GPL-2.0-or-later throughout | MIT throughout |
| Steward may merge to default branch | not granted (D-006) | not granted (D-006) | not granted (D-006); committing and pushing to a task branch is authorised by its `CLAUDE.md` |

The Console's Cursor rules remain its expressed conventions; its `CLAUDE.md` points back to them and records the landing rule as the authorisation they require.

The pull requests implementing D-008 to D-010 ([contextualwp #1](https://github.com/kwd-it/contextualwp/pull/1), [contextualwp-housebuilder-pack #1](https://github.com/kwd-it/contextualwp-housebuilder-pack/pull/1), [contextual-console #1](https://github.com/kwd-it/contextual-console/pull/1)) were merged on 2026-10-10 under the product owner's explicit authorisation for those pull requests. ContextualWP released them, together with the first autonomous maintenance batch, as v1.3.6 on 2026-10-10. The Housebuilder Pack and Console changes are not yet released; their latest tags are still v0.4.8 and v1.2.1.

## Development history

All three repositories were developed intensively between March and June 2026 with roughly monthly plugin releases and frequent Console releases, then went quiet after 2026-06-25. There are no open issues or pull requests in any of them. Commit history is linear in the Pack and Console; ContextualWP has a few older merge commits.
