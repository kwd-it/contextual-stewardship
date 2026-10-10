# Cross-project stewardship

The three products form one system. A change is not complete because the repository it was made in still works; it is complete when every product that plausibly depends on the changed behaviour has been considered and, where affected, validated or changed.

## Dependencies to check

`ecosystem/compatibility.md` records the interfaces and the current version matrix. Before any change, the steward identifies which of these it could touch:

| If this changes... | ...check these consumers |
|---|---|
| ContextualWP REST routes, response shapes, hooks, the sector pack registry or `CONTEXTUALWP_VERSION` behaviour | Housebuilder Pack (registers via the pack API and extends five core filters); Console (reads plugin endpoints over HTTP) |
| Housebuilder Pack `/plots` response fields, status vocabulary, completeness enums, pagination parameters or capability | Console (ingests the feed and raises issues from specific fields) |
| Console ingest adapters, pagination handling or auth header handling | Both plugins, since the Console must still read what they serve |
| Any minimum version (WordPress, PHP, ContextualWP core, Pack) | All three, plus the compatibility matrix |

## Working rules

1. **Name the affected products in the proposal or task branch description**, including "none" with the reason. "I did not think about the Console" is not a reason.
2. **Additive before breaking.** Prefer adding fields, parameters or hooks over changing or removing them. A removal or shape change on any interface in `compatibility.md` is PROPOSE FIRST and needs a compatibility plan for every consumer.
3. **Coordinate linked work.** When two repositories must change, open both task branches, cross-reference them, and state the order in which they must be released. The consumer must tolerate both the old and the new producer during the window between releases.
4. **Validate the integration, not just the units.** Each repository's unit tests use stubs, not a real WordPress or a real plugin endpoint. For any interface change, add proportionate integration evidence: the producer's actual JSON against the consumer's parser, a run against a local WordPress with the real plugins, or at minimum a fixture captured from a non-client test site. Never commit a fixture captured from a client site.
5. **Update the matrix.** Any change to a minimum version, an interface or a release updates `ecosystem/compatibility.md` in the same stewardship cycle.
6. **Version requirements are declared, not assumed.** When a consumer starts depending on a new producer field, the consumer's documentation and, where the product supports it, its code state the minimum producer version.

## Known weak points

Recorded here so future cycles check them rather than rediscover them:

- Core registers an incompatible sector pack anyway and only labels it in admin; the Pack performs its own check and shows notices. Neither blocks activation.
- The Pack declares a minimum core version but no maximum; core declares no WordPress minimum at all.
- The Console has no code-level check of plugin or Pack versions; its requirements live only in documentation.
- Plot status values and completeness enums are an implicit contract shared by all three repositories with no single authoritative definition.
