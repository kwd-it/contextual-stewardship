# Decision log

Durable decisions about the ecosystem's governance, workflow, compatibility policy and product direction. One or two lines each. Newest at the bottom. Transient task decisions do not belong here; they stay in the issue or pull request that made them.

| ID | Date | Decision | Decided by | Reference |
|---|---|---|---|---|
| D-001 | 2026-10-10 | This repository is the governance and stewardship layer for ContextualWP, the Housebuilder Pack and Contextual Console. Product code, commands and conventions stay in the product repositories. | Product owner (task brief) | Initial brief |
| D-002 | 2026-10-10 | Stewardship authority is split into AUTONOMOUS, PROPOSE FIRST and HUMAN AUTHORITY as defined in `governance/authority-model.md`. Production changes to the reference implementation are always human-controlled. | Product owner (task brief); detail drafted by the steward | `governance/authority-model.md` |
| D-003 | 2026-10-10 | Until a product repository's own instructions say otherwise, AUTONOMOUS work lands as a pushed task branch and pull request; merging, version bumps, tags and releases stay with the product owner. | Steward default, confirmed by D-006 | `governance/authority-model.md` |
| D-004 | 2026-10-10 | Proposals and transient work are tracked as GitHub issues on this repository with the labels in `governance/proposal-lifecycle.md`; durable facts live in files. | Steward, per brief | `governance/proposal-lifecycle.md` |
| D-005 | 2026-10-10 | No recurring stewardship schedule (Claude Routine) is created yet. | Product owner (task brief) | Initial brief |
| D-006 | 2026-10-10 | Autonomous landing policy confirmed (resolves P-001). AUTONOMOUS work is implemented, validated, Codex-reviewed, committed and pushed to a dedicated task branch with a pull request against the default branch; the product owner merges. No autonomous merge-to-default-branch authority is granted. Reconsider only after approximately three to five successful real stewardship cycles have provided evidence about quality and reliability. | Product owner | `governance/authority-model.md` |
| D-007 | 2026-10-10 | This repository is licensed under Creative Commons Attribution 4.0 International (CC BY 4.0) (resolves P-002). The licence applies to this stewardship and documentation repository only and does not change the licences of the product repositories. | Product owner | `LICENSE`, `README.md` |
| D-008 | 2026-10-10 | ContextualWP is licensed under GPL-3.0 (resolves P-003). Its existing `LICENSE` file is authoritative; `composer.json` and the plugin header are corrected to the SPDX expression `GPL-3.0-only`, which matches the existing text without broadening it. Licensing terms are otherwise unchanged. | Product owner | https://github.com/kwd-it/contextualwp/pull/1 |
| D-009 | 2026-10-10 | Minimum supported PHP for ContextualWP and the Housebuilder Pack is 8.3 (resolves P-004): PHP 8.2 is too close to the end of its security support and 8.3 aligns with Contextual Console. ContextualWP declares a `Requires PHP` header. No version bump or release as part of the change. | Product owner | https://github.com/kwd-it/contextualwp/pull/1, https://github.com/kwd-it/contextualwp-housebuilder-pack/pull/1 |
| D-010 | 2026-10-10 | Each product repository carries a minimal `CLAUDE.md` and `AGENTS.md` with repository-local instructions, review priorities and the landing rule of D-006, referencing this repository for ecosystem governance instead of copying it (resolves P-005). | Product owner | https://github.com/kwd-it/contextualwp/pull/1, https://github.com/kwd-it/contextualwp-housebuilder-pack/pull/1, https://github.com/kwd-it/contextual-console/pull/1 |

## Pending decisions

Decisions that only the product owner can make. Each becomes a row above once taken.

None at present. P-001 to P-005, raised 2026-10-10, were decided on 2026-10-10 and are recorded as D-006 to D-010.
