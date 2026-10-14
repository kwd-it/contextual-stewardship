# Owner notifications

How the product owner learns that autonomous work is waiting for a decision, without checking GitHub or Claude by hand. Established 2026-10-14 (D-015).

## Why GitHub did not notify by itself

The Routine acts on GitHub with the product owner's own account. GitHub never notifies a user about their own activity, so a pull request the Routine opens produces no notification for the owner, and the owner cannot be requested as a reviewer of it. GitHub does email the actor who triggered a failed Actions run, which is why the first scheduled cycle produced an email about a transient CI failure (fixed by the Routine in the same run) and nothing about the three reviewed pull requests it opened. Using a separate bot account would need a new credential, so the mechanism below uses the repository's built-in Actions token instead.

## Mechanism

One GitHub Actions workflow in this repository, `.github/workflows/owner-approvals.yml`, runs `tooling/approvals/owner-approvals.mjs` with the built-in `GITHUB_TOKEN` (`contents: read`, `issues: write`; no secrets, no other permissions). Each run:

1. reads the open pull requests of the four ecosystem repositories and the open issues of this repository through the REST API; GitHub is the only source, so the summary reflects the current state, not an earlier assessment;
2. rewrites the body of the single summary issue, **Pending owner decisions (automated summary)**, labelled `type:approvals`, grouped by the action the owner needs to take (editing an issue body sends no notification);
3. posts one comment on that issue, mentioning `@kwdit`, only when an action item appears that has not been notified before. The set of notified items is stored in an HTML comment in the issue body and repeated in each notification comment, and the run reads both, so a failed write in either place can neither suppress nor duplicate a notification. An item stays remembered while it is open in any state, so a pull request that drops out of the action set for a moment (a re-run of its checks, say) and returns is not notified again. Items that disappear (merged, decided, closed) update the body silently.

The comment is from `github-actions[bot]`, a different actor, so GitHub delivers it as a mention. Notifications reach the owner through whatever GitHub notification settings they hold; see "Owner configuration".

### Groups and rules

| Group | Contents | Rule |
|---|---|---|
| Ready to merge | Open pull requests | Not a draft; no review requesting changes; every check run and commit status on the head (all pages) completed successfully, none pending or failing; GitHub reports the head mergeable with merge state `clean`; the description records a completed Codex review with the words "Codex review" followed on the same line by "no material findings" or "material findings resolved". A pull request with no checks configured is reported as such. |
| Product decision required | Issues in this repository | `status:proposed` or `status:needs-decision` (`governance/proposal-lifecycle.md`). |
| Human intervention required | Issues and pull requests | Issues with `status:blocked`; pull requests that would otherwise be ready but whose description does not record a completed Codex review in those words (for example a safe-stewardship-mode pull request that says the review is outstanding). |
| Waiting on automation | Open pull requests | Any pull request that is a draft, has checks pending or failing, has conflicts, is behind or blocked, or has a review requesting changes, whatever its review state. Listed in the body for information only; never notified, because the steward resolves these itself. |

A pull request is notified again when its head commit changes, or when a completed review is recorded for a head that was notified as unreviewed, because what the owner would merge has changed. CI failures, pending checks and conflicts never notify.

### Triggers

A new or changed workflow file only becomes dispatchable once it is on `main`; GitHub returns 404 for a dispatch against a branch that is the only place the file exists.

- **Schedule:** every six hours (`23 */6 * * *` UTC). A run that finds nothing new changes nothing visible except the "last checked" time in the issue body.
- **End of a Routine cycle:** the Routine dispatches the workflow after its handback (see `governance/routine.md`, "Output") so the owner hears within minutes of a cycle finishing. If the dispatch fails, the schedule covers it.
- **Manual:** `gh workflow run owner-approvals.yml -R kwd-it/contextual-stewardship` or the "Run workflow" button, for testing. Locally, `GITHUB_TOKEN=$(gh auth token) node tooling/approvals/owner-approvals.mjs --dry-run` prints the body and the comment that would be posted and writes nothing.

## Authority

The workflow reads and writes nothing except the summary issue, its label and its comments. It grants no merge, release, deployment or review authority to anyone, and it does not act on product repositories. The owner still merges, decides and releases by hand.

## Owner configuration

GitHub account settings decide how a mention reaches the owner; the workflow cannot change them. The relevant options on the owner's Notification settings page (github.com/settings/notifications, read on 2026-10-14) are:

- **Participating, @mentions and custom → Notify me: Email.** This delivers the summary issue's mention by email. It was already on.
- **Actions → Notify me: Email (Failed workflows only).** This is what emailed the first scheduled cycle's transient CI failure, because GitHub notifies the actor who triggered a run. Turning this email off removes that noise; the summary issue carries anything that genuinely needs the owner. Leave it on if a failed run of the approvals workflow itself should still arrive by email: notifications for a scheduled workflow go to the user who created the workflow (GitHub documentation, "Notifications for workflow runs", read 2026-10-14).
- **Verifying delivery.** With the setting above on Email only (no "on GitHub"), a mention never appears in the web inbox or the REST `notifications` feed; only the email proves delivery. What GitHub does expose is the issue timeline, which records a `mentioned` and a `subscribed` event for the owner when the comment is posted (seen for the first notification on 2026-10-14 at 04:54:07 UTC, comment on issue #6).
- **Customize email updates → Your own updates** is deliberately left off. Turning it on would email the owner about every pull request the Routine opens with their account, but also about everything they do themselves; it was rejected as the mechanism for that reason.
