# Proposal and decision lifecycle

Transient work is tracked in GitHub issues on this repository. Durable outcomes are recorded in files. Nothing is tracked twice.

## Where things live

| What | Where |
|---|---|
| A proposal, a maintenance item, something blocked or awaiting a decision | A GitHub issue in `kwd-it/contextual-stewardship` |
| The implementation of an approved item | A task branch and pull request in the affected product repository, linked from the issue |
| A durable decision (authority, workflow, product direction, licence, compatibility policy) | `decisions/README.md` |
| A point-in-time health assessment | `assessments/YYYY-MM-DD-*.md` |
| Current interfaces and version compatibility | `ecosystem/compatibility.md` |

Issues are the queue. Files are the memory. A fresh session reads the files, then the open issues, and knows where things stand.

## Issue states

State is carried by labels so it can be filtered. One `status:` label per issue.

| Label | Meaning | Who moves it on |
|---|---|---|
| `status:proposed` | Written by the steward, awaiting the product owner | Product owner |
| `status:needs-decision` | Blocked on a specific product, legal or authority decision named in the issue | Product owner |
| `status:approved` | Product owner has approved the stated scope; the steward may implement | Steward |
| `status:in-progress` | A task branch exists | Steward |
| `status:blocked` | Cannot proceed; the blocker is named in the latest comment | Whoever clears the blocker |
| `status:done` | Implemented, reviewed and landed as the authority allows; closed with links | Steward closes |
| `status:declined` | Product owner declined; reason recorded; closed | Product owner, or steward on instruction |
| `status:stale` | Closed by the steward for inactivity, not a decision; may be reopened at any time | Steward |

Other labels: `authority:autonomous`, `authority:propose-first`, `authority:human`; `repo:contextualwp`, `repo:housebuilder-pack`, `repo:console`, `repo:stewardship`; `type:maintenance`, `type:proposal`, `type:decision`.

## Lifecycle

1. **Steward identifies work** during a cycle and classifies it.
2. **AUTONOMOUS work** that fits within the cycle does not need an issue first. The steward does it, and the pull request in the product repository is the record. If it spans repositories or cannot finish in the cycle, it gets an issue with `authority:autonomous`.
3. **PROPOSE FIRST work** gets an issue using the proposal template, labelled `status:proposed`. The steward does nothing further until the label changes.
4. **Product owner decides** by changing the label to `status:approved` or `status:declined`, or by commenting with a narrower scope. An approval in a task brief counts equally; the steward then updates the label.
5. **Steward implements** approved work per `development-workflow.md`, moves the issue to `status:in-progress`, links the branch and pull request, and on completion to `status:done` with the handback summary as the closing comment.
6. **Decisions** that will matter beyond the issue are copied into `decisions/README.md` in one or two lines with the date and the issue link.
7. **HUMAN AUTHORITY items** the steward notices (for example a licence inconsistency) get an issue labelled `authority:human` and `status:needs-decision`, stating exactly what decision is needed and the steward's recommendation. The steward never resolves them itself.

## Keeping it light

- No milestones, projects or boards unless the product owner asks.
- One issue per decision or piece of work. Do not open issues for things recorded in an assessment unless they need tracking beyond the assessment.
- Close rather than accumulate. A `status:proposed` issue untouched for six months is raised in the next assessment and, if still unanswered a cycle later, closed as `status:stale`. Stale is an administrative closure and is never recorded as a decision. Issues labelled `status:needs-decision` are never closed for inactivity; they are re-raised in every assessment until the owner decides.
- Never put anything in an issue that could not appear in this public repository.
