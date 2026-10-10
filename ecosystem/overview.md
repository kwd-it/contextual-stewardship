# Ecosystem overview

Verified against the repositories on 2026-10-10. Anything marked *assumption* was not verified in code.

## Roles

**ContextualWP** (WordPress plugin, PHP, v1.3.5) is the foundation. It exposes a site's structure and content as machine-readable context: an MCP-style manifest, paginated context listing and retrieval, a schema endpoint with an interpretation layer, and editor-safe ACF field metadata. It also hosts the sector pack registry that lets other plugins extend that context without forking core. Its AI-assisted admin tools (provider settings, `/generate_context`, global chat, ACF AskAI) are optional and secondary; they are the only place in the ecosystem that calls AI providers.

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
| Instruction files | none; conventions in `docs/DEVNOTES.md` | none; conventions in `DEVNOTES.md` and `.github/` templates | none for Claude or Codex; rules in `.cursor/skills/` and `docs/contextual-console-handover.md` |
| Branch prefixes | `docs/ feat/ fix/ refactor/ test/ chore/` | Conventional (`feat/ fix/ chore/`) | `feature/ fix/ chore/` |
| Release | `chore(release): prepare vX.Y.Z` commit on branch, merge, tag on `main` | same pattern, linear history | separate release commit, tag; version in `CHANGELOG.md` only |
| Tests | PHPUnit 10, stub bootstrap | PHPUnit 10.5, stub bootstrap | Pest 4, SQLite in memory, `composer test` |
| CI | none | none | none |
| Licence | `LICENSE` is GPL-3.0; `composer.json` says MIT (inconsistent) | GPL-2.0-or-later throughout | MIT throughout |
| Steward may merge to default branch | not granted | not granted | not granted; in-repo rules say do not commit, tag or bump unless asked |

The Console's in-repository rules were written for a different assistant but are the repository's expressed conventions and are followed as such until a `CLAUDE.md` exists there.

## Development history

All three repositories were developed intensively between March and June 2026 with roughly monthly plugin releases and frequent Console releases, then went quiet after 2026-06-25. There are no open issues or pull requests in any of them. Commit history is linear in the Pack and Console; ContextualWP has a few older merge commits.
