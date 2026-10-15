# Review context

This repository holds the governance that controls what an AI steward may do across three production product repositories. A mistake here changes agent behaviour in all of them. The only code is `tooling/codex/`, which the cloud Routine uses to run its Codex reviews, `tooling/approvals/` with `.github/workflows/owner-approvals.yml`, which maintains the owner's summary issue (`governance/owner-notifications.md`), and `tooling/merge/autonomous-merge.mjs`, which is the only path by which the steward may merge a product pull request (D-016).

Review priorities specific to this repository:

- autonomous authority that is broader than the stated principle (low-risk, behaviour-preserving maintenance only), or that could be read as permitting merges, releases, deployments or production changes;
- ambiguous production or release permissions;
- contradictions with the universal Claude and Codex instructions or with a product repository's own instructions;
- governance that would route trivial work through the product owner unnecessarily;
- governance that would let the steward make material product decisions without a recorded proposal;
- missing cross-project compatibility safeguards for the interfaces in `ecosystem/compatibility.md`;
- any private, client-identifying or infrastructure detail, since the repository is public;
- duplicated product-repository instructions, or unnecessary process;
- an unclear or inconsistent proposal and decision lifecycle;
- claims presented as verified facts without a source, date or location;
- any edit to `tooling/codex/review.mjs` or `tooling/codex/AGENTS.md` other than a verbatim refresh from the canonical workflow repository with its commit reference updated, and any change to `tooling/codex/setup.sh` that could print, log or persist a credential outside Codex's own login, or weaken the bounded-review behaviour;
- any change to the owner-approvals workflow or script that widens its token permissions beyond `contents: read` and `issues: write`, adds a secret, writes anywhere other than the summary issue, reports a pull request as ready while a check is pending or failing or the Codex review is unrecorded, could notify more than once for unchanged work, or notifies the owner about anything that does not need their decision or action (completed or automatically merged work, recoverable problems, deferred issues);
- any change to `tooling/merge/autonomous-merge.mjs` that lets a pull request through which touches anything outside Markdown, `docs/` and `tests/`, that weakens the deny list, the head-equals-reviewed-commit check, the fork, draft, check, mergeability or review-record checks, that adds a repository to the eligible list without recorded deployment-safety verification, or that merges without pinning the head SHA; and any governance wording that could be read as widening D-016 beyond documentation and test-only maintenance.
