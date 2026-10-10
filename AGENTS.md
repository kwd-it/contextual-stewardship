# Review context

This repository holds the governance that controls what an AI steward may do across three production product repositories. A mistake here changes agent behaviour in all of them. There is no code to run.

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
- claims presented as verified facts without a source, date or location.
