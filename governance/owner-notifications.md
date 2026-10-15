# Owner notifications

How the product owner learns that stewardship work needs a decision, without checking GitHub or Claude by hand. Established 2026-10-14 (D-015); simplified the same day alongside the autonomous merge policy (D-016); narrowed on 2026-10-15 (D-017) so that the owner is emailed only when something genuinely needs their decision or action, and each email says plainly what, why, and what happens if they do nothing.

The principle: the steward makes routine technical decisions and does the work. The owner is contacted only for a decision or authorisation that is theirs, never for completed work, recoverable problems or ideas deliberately parked for later.

## Why GitHub did not notify by itself

The Routine acts on GitHub with the product owner's own account. GitHub never notifies a user about their own activity, so a pull request the Routine opens produces no notification for the owner, and the owner cannot be requested as a reviewer of it. GitHub does email the actor who triggered a failed Actions run, which is why the first scheduled cycle produced an email about a transient CI failure (fixed by the Routine in the same run) and nothing about the three reviewed pull requests it opened. Using a separate bot account would need a new credential, so the mechanism below uses the repository's built-in Actions token instead.

## Mechanism

One GitHub Actions workflow in this repository, `.github/workflows/owner-approvals.yml`, runs `tooling/approvals/owner-approvals.mjs` with the built-in `GITHUB_TOKEN` (`contents: read`, `issues: write`; no secrets, no other permissions). Each run:

1. reads the open and recently merged pull requests of the four ecosystem repositories and the open issues of this repository through the REST API; GitHub is the only source, so the summary reflects the current state, not an earlier assessment;
2. rewrites the body of the single summary issue, **Pending owner decisions (automated summary)**, labelled `type:approvals` (editing an issue body sends no notification);
3. posts one comment on that issue, mentioning `@kwdit`, only when a decision or a blocker that only the owner can clear appears that has not been notified before. The set of notified items and the creation time of the last notification comment are stored in an HTML comment in the issue body, and each notification comment repeats its own items; the run reads the body plus any comment newer than that time, so a failed write in either place can neither suppress nor duplicate a notification, and an item the body has forgotten (closed, decided or deferred) is not revived from an older comment. An item stays remembered while it is open in any state, so a pull request that drops out of the action set for a moment (a re-run of its checks, say) and returns is not notified again. Items that disappear (merged, decided, deferred, closed) update the body silently.

The comment is from `github-actions[bot]`, a different actor, so GitHub delivers it as a mention. Notifications reach the owner through whatever GitHub notification settings they hold; see "Owner configuration". There is one summary issue and one notification path; nothing else emails the owner on the steward's behalf.

### What the owner sees

The notification lists only what is new, each item explained in plain English, for example:

```
@kwdit Contextual: 1 decision needed

ContextualWP: Approve an OpenAI compatibility improvement?
- Why: An existing model is approaching retirement.
- Recommendation: Approve the tested replacement.
- Urgency: Before 2027-01-01.
- If you do nothing: The existing model remains supported until 2027-04-01.
- Action: Approve, narrow, defer or decline in the proposal (link)

Everything else is being handled.
```

When earlier notified items are still waiting, one closing line says how many and links to the summary issue. Completed work, commit hashes, branch names and internal classifications never appear in a notification.

The wording comes from one-line fields the steward writes, as `Name: text` lines in a pull request description or as fields of the proposal and decision issue forms (`development-workflow.md`):

| Field | Shown as | When absent |
|---|---|---|
| `Owner summary` | The question (a pull request reads `merge "<summary>"?`) | The title without its technical prefix |
| `Why it matters` | Why | A generic reason for the kind of item (only you can merge it, approve it, decide it or clear it) |
| `Owner recommendation` | Recommendation | Pull request: merge, since it is reviewed and green. Issue: "Set out in the issue" |
| `Urgency` | Urgency, with a date where one applies | "Can wait"; for a blocker, "The blocked work is paused until you act" |
| `If nothing is done` | If you do nothing | A default for the kind of item (the pull request stays open; nothing is implemented; the blocked work stays paused) |

The steward writes every field for each item that will reach the owner (a `Merge: owner` pull request, a proposal, a decision, a human-only blocker), leaving `Urgency` empty only when the item can wait; the fallbacks exist so that a missing field never produces an incomplete notification. Fields are kept short: one clear recommendation rather than every technical option. Detail belongs in the linked issue or pull request. The issue body carries the full lists plus three informational sections: "Deferred", "Being handled automatically" and "Completed automatically (last 30 days)", which is the record of automatic merges.

### Rules

| Section | Contents | Rule | Notifies? |
|---|---|---|---|
| Your decisions | Open pull requests; issues in this repository | A pull request that is not a draft, has no review requesting changes, whose every check run and commit status on the head (all pages) completed with conclusion success (pending, failed, skipped or neutral outcomes keep it waiting), which GitHub reports mergeable with merge state `clean`, whose description records a completed Codex review ("Codex review" followed on the same line by "no material findings" or "material findings resolved", and any `Reviewed head:` line matches the head commit), and which is **not** marked for automatic merge. Issues with `status:proposed` or `status:needs-decision` (`proposal-lifecycle.md`). | Yes |
| Needs your intervention | Issues in this repository | Issues with `status:blocked` that are also labelled `authority:human`: a blocker only the owner can clear, such as a credential, account, spend or access problem. | Yes, without delay |
| Deferred | Issues in this repository | Issues with `status:deferred`: ideas and optional improvements deliberately parked until a recorded revisit trigger is met. | No |
| Being handled automatically | Open pull requests; issues in this repository | Pull requests marked `Merge: automatic` or `Merge: steward` (however long they wait: the Routine retries each cycle and changes the line to `Merge: owner` when it cannot merge, which makes the pull request an owner decision); pull requests whose Codex review is not yet recorded or no longer matches the head; any pull request that is a draft, has checks pending or failing, has conflicts, is behind or blocked, or has a review requesting changes. Issues with `status:blocked` not labelled `authority:human`. | No |
| Completed automatically | Merged pull requests | Pull requests merged in the last 30 days whose description carries a `Merge: automatic` or `Merge: steward` line. The record of routine work. | No |

**What counts as new.** An item is identified by its pull request or issue, its issue status, and its owner summary; not by the head commit. A new commit, a re-run of the checks, a review recorded again or a status update does not notify again. What the owner is asked changes materially only when the question does, so the steward rewrites the `Owner summary` when, and only when, the decision changes (a widened scope, say), and that notifies again. A deferred issue moved back to `status:proposed` notifies again. If a run finds nothing new for the owner, it posts nothing.

**Batching.** The Routine dispatches the workflow at the end of each cycle, and that run notifies everything new in one comment. A scheduled run that finds a new decision does not notify it at once; it records the item as seen in the issue body and notifies it on the next run that still finds it (the end-of-cycle dispatch, or the next scheduled run six hours later if no dispatch comes). Decisions that appear in the middle of a cycle therefore arrive with the rest of the cycle's decisions, and something that vanishes within a run never reaches the owner. A new human-only blocker is never held, and whenever a comment is posted it carries every new item.

### Triggers

A new workflow file only becomes dispatchable once it exists on `main`; a dispatch against a branch that is the only place the file exists returned 404 on 2026-10-14. Changes to an existing workflow can be run from a branch with `--ref`.

- **Schedule:** every six hours (`23 */6 * * *` UTC), for reliability. A run that finds nothing new changes nothing visible except the "last checked" time in the issue body.
- **End of a Routine cycle:** the Routine dispatches the workflow after its handback (see `governance/routine.md`, "Output") so the owner hears once, within minutes of a cycle finishing. If the dispatch fails, the schedule covers it.
- **Manual:** `gh workflow run owner-approvals.yml -R kwd-it/contextual-stewardship` or the "Run workflow" button; a manual run notifies without holding, like the end-of-cycle dispatch. Locally, `GITHUB_TOKEN=$(gh auth token) node tooling/approvals/owner-approvals.mjs --dry-run` prints the body and the comment that would be posted and writes nothing (add `GITHUB_EVENT_NAME=schedule` to see a scheduled run's decision). `node --test tooling/approvals/owner-approvals.test.mjs` covers the classification, wording, batching and duplicate rules.

## Authority

The workflow reads and writes nothing except the summary issue, its label and its comments. It grants no merge, release, deployment or review authority to anyone, and it does not act on product repositories. Merging is done by the owner, or by the steward only under D-016 through `tooling/merge/autonomous-merge.mjs`; this workflow only reports.

## Owner configuration

GitHub account settings decide how a mention reaches the owner; the workflow cannot change them. The relevant options on the owner's Notification settings page (github.com/settings/notifications, read on 2026-10-14) are:

- **Participating, @mentions and custom → Notify me: Email.** This delivers the summary issue's mention by email. It was already on.
- **Actions → Notify me: Email (Failed workflows only).** This is what emailed the first scheduled cycle's transient CI failure, because GitHub notifies the actor who triggered a run. Turning this email off removes that noise; the summary issue carries anything that genuinely needs the owner. Leave it on if a failed run of the approvals workflow itself should still arrive by email: notifications for a scheduled workflow go to the user who created the workflow (GitHub documentation, "Notifications for workflow runs", read 2026-10-14).
- **Verifying delivery.** With the setting above on Email only (no "on GitHub"), a mention never appears in the web inbox or the REST `notifications` feed; only the email proves delivery. What GitHub does expose is the issue timeline, which records a `mentioned` and a `subscribed` event for the owner when the comment is posted (seen for the first notification on 2026-10-14 at 04:54:07 UTC, comment on issue #6).
- **Customize email updates → Your own updates** is deliberately left off. Turning it on would email the owner about every pull request the Routine opens with their account, but also about everything they do themselves; it was rejected as the mechanism for that reason.
