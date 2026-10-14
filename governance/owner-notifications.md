# Owner notifications

How the product owner learns that stewardship work needs a decision, without checking GitHub or Claude by hand. Established 2026-10-14 (D-015); simplified the same day alongside the autonomous merge policy (D-016) so that automatically completed maintenance is reported, not asked about.

## Why GitHub did not notify by itself

The Routine acts on GitHub with the product owner's own account. GitHub never notifies a user about their own activity, so a pull request the Routine opens produces no notification for the owner, and the owner cannot be requested as a reviewer of it. GitHub does email the actor who triggered a failed Actions run, which is why the first scheduled cycle produced an email about a transient CI failure (fixed by the Routine in the same run) and nothing about the three reviewed pull requests it opened. Using a separate bot account would need a new credential, so the mechanism below uses the repository's built-in Actions token instead.

## Mechanism

One GitHub Actions workflow in this repository, `.github/workflows/owner-approvals.yml`, runs `tooling/approvals/owner-approvals.mjs` with the built-in `GITHUB_TOKEN` (`contents: read`, `issues: write`; no secrets, no other permissions). Each run:

1. reads the open and recently merged pull requests of the four ecosystem repositories and the open issues of this repository through the REST API; GitHub is the only source, so the summary reflects the current state, not an earlier assessment;
2. rewrites the body of the single summary issue, **Pending owner decisions (automated summary)**, labelled `type:approvals` (editing an issue body sends no notification);
3. posts one comment on that issue, mentioning `@kwdit`, only when something that needs the owner appears that has not been notified before. The set of notified items and the time of the last notification are stored in an HTML comment in the issue body and repeated in each notification comment, and the run reads both, so a failed write in either place can neither suppress nor duplicate a notification. An item stays remembered while it is open in any state, so a pull request that drops out of the action set for a moment (a re-run of its checks, say) and returns is not notified again. Items that disappear (merged, decided, closed) update the body silently.

The comment is from `github-actions[bot]`, a different actor, so GitHub delivers it as a mention. Notifications reach the owner through whatever GitHub notification settings they hold; see "Owner configuration".

### What the owner sees

The notification is short and in plain English, for example:

```
@kwdit Contextual: 2 decisions needed

Completed automatically since the last notification:
- Contextual Console: Cleaned up documentation and test fixtures (#3; merged 2026-10-14)

Your decisions:
- ContextualWP: merge "Run the test suite on GitHub Actions"? (#4; reviewed, 2 checks passed) (new)
- ContextualWP: Approve the proposed OpenAI model change? (#5; proposal)

Everything else is being handled.
```

Every item links to its pull request or issue. The wording comes from an `Owner summary:` line that the steward writes in each pull request description and in the "Owner summary" field of proposal and decision issues (`development-workflow.md`); without one, the title is used with its technical prefix removed. The issue body carries the same lists plus two informational sections, "Being handled automatically" and "Completed automatically (last 30 days)".

### Rules

| Section | Contents | Rule |
|---|---|---|
| Your decisions | Open pull requests; issues in this repository | A pull request that is not a draft, has no review requesting changes, whose every check run and commit status on the head (all pages) completed with conclusion success (pending, failed, skipped or neutral outcomes keep it waiting), which GitHub reports mergeable with merge state `clean`, whose description records a completed Codex review ("Codex review" followed on the same line by "no material findings" or "material findings resolved", and any `Reviewed head:` line matches the head commit), and which is **not** marked for automatic merge. Issues with `status:proposed` or `status:needs-decision` (`proposal-lifecycle.md`). |
| Needs your intervention | Issues and pull requests | Issues with `status:blocked`. Pull requests that would otherwise be ready but whose description does not record a completed Codex review (a safe-stewardship-mode pull request, say). Pull requests marked for automatic merge that are still open and mergeable more than 24 hours after they were opened, because the automatic merge evidently did not happen. |
| Being handled automatically | Open pull requests | Pull requests whose description carries a `Merge: automatic` or `Merge: steward` line and are within the 24-hour window, and any pull request that is a draft, has checks pending or failing, has conflicts, is behind or blocked, or has a review requesting changes. Information only; never notified, because the steward resolves these itself. |
| Completed automatically | Merged pull requests | Pull requests merged in the last 30 days whose description carries a `Merge: automatic` or `Merge: steward` line. Listed in the body for the record, and in a notification comment only for merges since the previous notification. A merge by itself never triggers a notification. |

A pull request is notified again when its head commit changes, or when a completed review is recorded for a head that was notified as unreviewed, because what the owner would merge has changed. CI failures, pending checks, conflicts and automatic merges never notify. If a run finds nothing new for the owner, it posts nothing.

### Triggers

A new workflow file only becomes dispatchable once it exists on `main`; a dispatch against a branch that is the only place the file exists returned 404 on 2026-10-14. Changes to an existing workflow can be run from a branch with `--ref`.

- **Schedule:** every six hours (`23 */6 * * *` UTC). A run that finds nothing new changes nothing visible except the "last checked" time in the issue body.
- **End of a Routine cycle:** the Routine dispatches the workflow after its handback (see `governance/routine.md`, "Output") so the owner hears within minutes of a cycle finishing. If the dispatch fails, the schedule covers it.
- **Manual:** `gh workflow run owner-approvals.yml -R kwd-it/contextual-stewardship` or the "Run workflow" button, for testing. Locally, `GITHUB_TOKEN=$(gh auth token) node tooling/approvals/owner-approvals.mjs --dry-run` prints the body and the comment that would be posted and writes nothing. `node --test tooling/approvals/owner-approvals.test.mjs` covers the classification, wording and duplicate rules.

## Authority

The workflow reads and writes nothing except the summary issue, its label and its comments. It grants no merge, release, deployment or review authority to anyone, and it does not act on product repositories. Merging is done by the owner, or by the steward only under D-016 through `tooling/merge/autonomous-merge.mjs`; this workflow only reports.

## Owner configuration

GitHub account settings decide how a mention reaches the owner; the workflow cannot change them. The relevant options on the owner's Notification settings page (github.com/settings/notifications, read on 2026-10-14) are:

- **Participating, @mentions and custom → Notify me: Email.** This delivers the summary issue's mention by email. It was already on.
- **Actions → Notify me: Email (Failed workflows only).** This is what emailed the first scheduled cycle's transient CI failure, because GitHub notifies the actor who triggered a run. Turning this email off removes that noise; the summary issue carries anything that genuinely needs the owner. Leave it on if a failed run of the approvals workflow itself should still arrive by email: notifications for a scheduled workflow go to the user who created the workflow (GitHub documentation, "Notifications for workflow runs", read 2026-10-14).
- **Verifying delivery.** With the setting above on Email only (no "on GitHub"), a mention never appears in the web inbox or the REST `notifications` feed; only the email proves delivery. What GitHub does expose is the issue timeline, which records a `mentioned` and a `subscribed` event for the owner when the comment is posted (seen for the first notification on 2026-10-14 at 04:54:07 UTC, comment on issue #6).
- **Customize email updates → Your own updates** is deliberately left off. Turning it on would email the owner about every pull request the Routine opens with their account, but also about everything they do themselves; it was rejected as the mechanism for that reason.
