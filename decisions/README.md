# Decision log

Durable decisions about the ecosystem's governance, workflow, compatibility policy and product direction. One or two lines each. Newest at the bottom. Transient task decisions do not belong here; they stay in the issue or pull request that made them.

| ID | Date | Decision | Decided by | Reference |
|---|---|---|---|---|
| D-001 | 2026-10-10 | This repository is the governance and stewardship layer for ContextualWP, the Housebuilder Pack and Contextual Console. Product code, commands and conventions stay in the product repositories. | Product owner (task brief) | Initial brief |
| D-002 | 2026-10-10 | Stewardship authority is split into AUTONOMOUS, PROPOSE FIRST and HUMAN AUTHORITY as defined in `governance/authority-model.md`. Production changes to the reference implementation are always human-controlled. | Product owner (task brief); detail drafted by the steward | `governance/authority-model.md` |
| D-003 | 2026-10-10 | Until a product repository's own instructions say otherwise, AUTONOMOUS work lands as a pushed task branch and pull request; merging, version bumps, tags and releases stay with the product owner. | Steward default, pending confirmation | `governance/authority-model.md`; see pending P-001 |
| D-004 | 2026-10-10 | Proposals and transient work are tracked as GitHub issues on this repository with the labels in `governance/proposal-lifecycle.md`; durable facts live in files. | Steward, per brief | `governance/proposal-lifecycle.md` |
| D-005 | 2026-10-10 | No recurring stewardship schedule (Claude Routine) is created yet. | Product owner (task brief) | Initial brief |

## Pending decisions

Decisions that only the product owner can make. Each becomes a row above once taken.

| ID | Raised | Decision needed | Steward recommendation |
|---|---|---|---|
| P-001 | 2026-10-10 | Should AUTONOMOUS changes be allowed to merge to a product repository's default branch without a pull request review, and if so in which repositories? | Keep D-003 (pull request, owner merges) for at least the first few cycles, then revisit once the volume and quality of autonomous work is visible. |
| P-002 | 2026-10-10 | Which licence, if any, should this documentation repository carry? | Creative Commons Attribution 4.0 (CC BY 4.0) for a governance and documentation repository: it permits reuse with attribution, is the common choice for documentation, and avoids implying that the differing product licences (GPL-3.0 or MIT for ContextualWP, GPL-2.0-or-later for the Pack, MIT for the Console) apply here. If any code or templates are ever added, MIT for those files. Nothing is added until the owner decides. |
| P-003 | 2026-10-10 | ContextualWP's `LICENSE` file is GPL-3.0 but its `composer.json` declares MIT. Which is intended? | Decide the intended licence; the fix is a one-line change in whichever file is wrong. GPL-compatible licensing is conventional for WordPress plugins distributed publicly. |
| P-004 | 2026-10-10 | Should the minimum PHP version for ContextualWP and the Housebuilder Pack be raised from 8.1 (end of life since 2025-12-31)? | Raise both to PHP 8.2 as a minimum now (security support to 2026-12-31) or go straight to 8.3 (security support to 2027-12-31), aligned with the Console's existing ^8.3. Declare `Requires PHP` in the ContextualWP header at the same time. |
| P-005 | 2026-10-10 | Should the steward add `CLAUDE.md` and `AGENTS.md` to each product repository so that per-repository permissions and review priorities are explicit? | Yes, minimal files that record what this repository's overview currently infers (branches, test commands, release convention, merge permission). This is the cleanest way to grant or withhold merge rights per repository. |
