# Repository instructions

This is the public governance and stewardship repository for the Contextual ecosystem. It contains documentation, plus `tooling/codex/`: verbatim copies of the canonical Codex review runner and universal Codex instructions that the cloud Routine runs (see `tooling/codex/README.md`), and `tooling/approvals/` with the owner-approvals workflow script (see `governance/owner-notifications.md`). Start with `STEWARDSHIP.md`.

- This repository is public. Never commit credentials, hostnames, server details, client data or private operational details, and never reference the reference implementation beyond "a UK housebuilder website".
- There is no staging branch. Work on a task branch, validate (Markdown renders, links resolve, no private values), run the Codex review, then merge to `main` and push. Deleting the task branch after merge is fine here because nothing is promoted further.
- Governance changes (anything under `governance/`, `STEWARDSHIP.md`, or the authority rows of `decisions/README.md`) are PROPOSE FIRST unless they correct an error of fact. Adding verified facts to `ecosystem/` or a new dated file under `assessments/` is AUTONOMOUS.
- Never duplicate product repository commands, architecture or conventions here; link to them.
- `tooling/codex/review.mjs` and `tooling/codex/AGENTS.md` are copies of canonical files and are never edited here: refresh them from the workflow repository and update the commit reference in `tooling/codex/README.md` in the same commit. Secrets never appear in this repository; the Routine's `OPENAI_API_KEY` lives only in its environment secret.
- Dates are absolute (YYYY-MM-DD). Verified facts state where they were verified.
