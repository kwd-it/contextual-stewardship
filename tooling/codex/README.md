# Codex review tooling for the cloud Routine

The Contextual Product Steward Routine runs in a cloud environment that cannot reach the product owner's private workflow repository, where the canonical review runner and the universal Codex instructions live. This directory carries verbatim copies so the Routine can run the same bounded review the universal instructions require. It is tooling for the steward, not product code, and it is the only non-documentation content in this repository.

| File | Purpose | Canonical source |
|---|---|---|
| `review.mjs` | Bounded, read-only Codex review runner: stdin closed, stall and overall time limits, one review per workspace, classified exit codes | `codex/review.mjs` in the workflow repository |
| `AGENTS.md` | Universal Codex reviewer instructions, linked to `$CODEX_HOME/AGENTS.md` by `setup.sh` | `codex/AGENTS.md` in the workflow repository |
| `setup.sh` | Installs `@openai/codex` if absent, links `AGENTS.md`, proves that requests to `api.openai.com` are authenticated, logs Codex in, and reports whether a review can run | This repository |

Copied from the workflow repository at commit `bf9fd0f` on 2026-10-11. The two copies are byte-for-byte identical to that commit and carry no local edits. When the canonical files change, a session on the product owner's machine refreshes the copies and this commit reference in one commit; the Routine never edits them.

## Use in a run

```bash
bash /home/user/contextual-stewardship/tooling/codex/setup.sh   # exit 0 = review available, 3 = unavailable
cd /home/user/<repository>                                         # the workspace being reviewed
node /home/user/contextual-stewardship/tooling/codex/review.mjs <prompt-file>
```

`review.mjs` keeps the exit-code and retry rules of the universal Claude instructions: 0 completed, 1 failed, 2 usage error or a review already running, 3 stalled or timed out, 4 authentication, usage-limit or quota failure (never retried).

## Credential

The dedicated OpenAI API key is a **network secret** of the Routine's cloud environment, scoped to `api.openai.com`: the platform proxy adds it to requests for that host and the key never enters the VM, the repository, logs or transcripts. Codex still needs a local API-key login before it will send requests, so `setup.sh` first proves with one request that the proxy supplies authentication (it sends a fixed, non-secret placeholder as the bearer value and expects HTTP 200; without the secret the same request returns 401) and then logs Codex in with that placeholder. The placeholder is `proxy-managed-placeholder`; it is not a credential and is useless outside this environment. Verified end to end on 2026-10-11.

`OPENAI_API_KEY` in the environment remains supported as a fallback; `setup.sh` passes it to `codex login --with-api-key` on stdin after confirming it is accepted. Personal ChatGPT credentials are never used in the cloud.
