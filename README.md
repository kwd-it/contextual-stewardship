# Contextual stewardship

Governance, decision history and AI-assisted stewardship for the **Contextual** product ecosystem:

| Product | Repository | What it is |
|---|---|---|
| ContextualWP | [kwd-it/contextualwp](https://github.com/kwd-it/contextualwp) | WordPress plugin: a structured site-context layer exposed through MCP-compatible REST endpoints, with optional AI-assisted admin tools |
| ContextualWP Housebuilder Pack | [kwd-it/contextualwp-housebuilder-pack](https://github.com/kwd-it/contextualwp-housebuilder-pack) | The first ContextualWP sector pack: housebuilder relationship hints, schema interpretation and an authenticated plots feed |
| Contextual Console | [kwd-it/contextual-console](https://github.com/kwd-it/contextual-console) | Laravel application that monitors plot datasets exposed by the plugins, records changes and raises issues |

The ecosystem is in production use. A UK housebuilder website runs all three components together and serves as the reference implementation.

## Why this repository exists

The three product repositories each hold their own code, commands and conventions. Nothing held the ecosystem together: which versions work with which, who may change what, how proposals are decided, and what has already been decided. This repository is that layer. It lets an AI steward (Claude Code, reviewed by Codex) keep the ecosystem healthy over time without the product owner having to spot and brief every piece of work.

## What lives here

| Path | Purpose |
|---|---|
| [STEWARDSHIP.md](STEWARDSHIP.md) | **Start here.** How a stewardship session runs, end to end |
| [governance/authority-model.md](governance/authority-model.md) | What the steward may do alone, what needs a proposal, what stays with the product owner |
| [governance/development-workflow.md](governance/development-workflow.md) | The ecosystem-level workflow rules that sit above each product repository's own instructions |
| [governance/cross-project-stewardship.md](governance/cross-project-stewardship.md) | Handling changes that touch more than one product |
| [governance/ai-provider-currency.md](governance/ai-provider-currency.md) | Keeping AI provider, model and API assumptions current without blind upgrades |
| [governance/proposal-lifecycle.md](governance/proposal-lifecycle.md) | How proposed, approved, blocked and completed work is tracked |
| [ecosystem/overview.md](ecosystem/overview.md) | Product roles, data flow and development conventions |
| [ecosystem/compatibility.md](ecosystem/compatibility.md) | Cross-project interfaces and the version compatibility matrix |
| [assessments/](assessments/) | Dated health assessments of the ecosystem |
| [decisions/](decisions/) | Durable decision log |

## What does not live here

Product code, architecture notes, build and test commands, implementation conventions and deployment steps belong in the product repositories. This repository points at them and never duplicates them. Credentials, server details, client infrastructure and any other confidential operational information are never recorded here: the repository is public.

## Status

Established on 2026-10-10 with the first ecosystem assessment. No automated stewardship schedule exists yet.

## Licence

No licence has been applied yet. The product repositories use different licences and the choice for this documentation repository is recorded as a pending decision in [decisions/README.md](decisions/README.md). Until a licence is added, the content is all rights reserved by default.
