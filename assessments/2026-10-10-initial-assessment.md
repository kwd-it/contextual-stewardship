# Ecosystem assessment: 2026-10-10 (initial)

Read-only assessment performed while establishing this repository. Nothing below has been implemented. External facts were verified on 2026-10-10 against the sources named; repository facts were verified by reading the code and running each plugin's test suite locally.

## Versions at time of assessment

| Product | Default branch head | Latest tag | Last commit | Local tests |
|---|---|---|---|---|
| ContextualWP | `main` @ e14e89c | v1.3.5 | 2026-06-22 | PHPUnit 10.0 on PHP 8.3: 108 tests, 206 assertions, 0 failures, 9 skipped, 7 deprecations |
| Housebuilder Pack | `main` @ 0285cad | v0.4.8 | 2026-06-25 | PHPUnit 10.5 on PHP 8.3: 82 tests, 169 assertions, 0 failures |
| Contextual Console | `master` @ 1d6200d | v1.2.1 | 2026-06-25 | Not run (Pest suite present; not executed in this read-only pass) |

All three repositories are public on GitHub with no open issues or pull requests. None has CI.

## Summary

The ecosystem is functionally healthy: the plugins' test suites pass, the three products' interfaces are consistent with each other at their current versions, and the codebases are small, coherent and recently documented. The material risks are currency and drift after three and a half months without commits: two of the three Mistral models the plugin offers have been retired by the vendor, several OpenAI IDs it ships are scheduled for shutdown, both plugins still declare an end-of-life PHP minimum, WordPress has moved two major versions with platform AI features the plugin's own migration plan is waiting for, and client-identifying values have crept into two public repositories against their own policies. Nothing found is known to be an emergency for the reference implementation, whose configured provider is deliberately not recorded here, but the Mistral and PHP items would bite any new adopter today.

## Findings

### F-1. Two of three Mistral catalogue models are retired

Priority: high. Authority: AUTONOMOUS under the retired-model rule in `governance/ai-provider-currency.md`; presented here for confirmation because the rule is new. Repository: contextualwp.

- Verified: `includes/helpers/smart-model-selector.php` maps Mistral tiers to `mistral-small-2506`, `mistral-medium-2508`, `mistral-large-2512`. Mistral's models page (docs.mistral.ai/models, checked 2026-10-10) lists `mistral-small-2506` as retired on 2026-07-31 (successor Mistral Small 4) and `mistral-medium-2508` as retired on 2026-08-31 (successor Mistral Medium 3.5). `mistral-large-2512` remains current. Smart selection routes short and medium prompts to the two retired IDs, so a Mistral-configured site fails on most requests.
- Recommendation: replace the small and medium tier IDs with the vendor's successors after confirming their exact API IDs from Mistral's model cards, keep the retired IDs in the legacy-accepted list so saved settings survive, update tests and README, add a changelog entry. Patch release.
- Value: restores Mistral as a working provider; removes a silent failure for any adopter.
- Scope: small, one file plus tests and docs.
- Risk: low; the successors use the same Chat Completions contract. Verify IDs against the vendor, not secondary sources.

### F-2. OpenAI IDs with announced shutdowns remain in the catalogue and fallback list

Priority: high (dated). Authority: fallback cleanup AUTONOMOUS; catalogue refresh and nano-tier replacement PROPOSE FIRST. Repository: contextualwp.

- Verified: OpenAI's deprecations page (developers.openai.com/api/docs/deprecations, checked 2026-10-10) lists `gpt-5-2025-08-07`, `gpt-5-mini-2025-08-07` and `gpt-5-nano-2025-08-07` for shutdown on 2026-12-11 (replacements `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`), `gpt-5.2-chat-latest` shut down on 2026-08-10, and `gpt-5.4-nano` for shutdown on 2027-04-01 (replacement `gpt-6-luna`). The plugin's legacy-accepted list contains `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.2`; its fallback list is `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5-mini`, `gpt-5-nano`; its nano tier is `gpt-5.4-nano`. No shutdown is listed for `gpt-5.5` (the default) or `gpt-5.4-mini`.
- Recommendation: (a) remove `gpt-5-mini` and `gpt-5-nano` from the fallback list and mark the 2025 `gpt-5` IDs as retiring in the legacy handling now; their shutdown is within the 90-day window the currency policy sets for autonomous removal (AUTONOMOUS); (b) propose a catalogue refresh that moves the nano tier off `gpt-5.4-nano` before 2027-04-01 and evaluates the `gpt-5.6` generation for the visible catalogue and default, with behaviour and cost considered (PROPOSE FIRST because it changes defaults).
- Value: avoids fallback requests to dead models in December and a dead nano tier in April; keeps the default current on the owner's terms.
- Scope: (a) small; (b) small to medium including a README refresh.
- Risk: (a) negligible; (b) changes which model editors get by default, so owner approval and a changelog note are needed.

### F-3. Anthropic catalogue: one legacy ID retiring, nano tier at its earliest retirement window, parsing constraint on any successor

Priority: medium. Authority: legacy-ID handling AUTONOMOUS; any tier or parsing change PROPOSE FIRST. Repository: contextualwp.

- Verified against Anthropic's model deprecations page (https://platform.claude.com/docs/en/about-claude/model-deprecations, checked 2026-10-10): `claude-sonnet-4-5-20250929`, which the plugin accepts as the legacy ID `claude-sonnet-4-5`, was deprecated on 2026-09-30 and retires on 2026-11-30 with `claude-sonnet-5-5` as the recommended replacement. The three tier IDs are Active with tentative earliest retirement dates of 2027-04-16 (`claude-opus-4-7`), 2027-02-17 (`claude-sonnet-4-6`) and 2026-10-15 (`claude-haiku-4-5`); legacy `claude-opus-4-5` is Active until not sooner than 2026-11-24. The `anthropic-version: 2023-06-01` header is still the one the documentation uses. Per Anthropic's thinking documentation (https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost), thinking on current models is adaptive, a response may begin with a thinking block, and the documentation warns against logic that assumes a fixed first block; the plugin reads the reply from `content[0].text`, so a straight swap to any Claude 5 model would break parsing on turns where the model thinks.
- Recommendation: (a) mark `claude-sonnet-4-5` as retiring in the legacy handling now, within the 90-day window (AUTONOMOUS); (b) propose, ahead of any deprecation notice for `claude-haiku-4-5`, a change to the Anthropic response parsing that selects the first `text` block regardless of position, with tests, so that a future nano-tier successor is a configuration change rather than an emergency (PROPOSE FIRST); (c) no tier changes now.
- Value: no request path to a retired model; the plugin is ready for a Haiku deprecation notice, which Anthropic gives with at least 60 days of notice.
- Scope: (a) trivial; (b) small, one parsing function plus tests.
- Risk: (a) none; (b) low, and behaviour-preserving for current models, but it changes provider request handling and so stays PROPOSE FIRST under the currency policy.

### F-4. PHP 8.1 minimum is end of life

Priority: medium. Authority: HUMAN AUTHORITY decision on the supported platform (pending decision P-004), then PROPOSE FIRST implementation. Repositories: contextualwp, contextualwp-housebuilder-pack.

- Verified: both plugins declare `php >= 8.1` in `composer.json`; the Pack also declares `Requires PHP: 8.1` in its header. php.net/supported-versions (checked 2026-10-10): 8.1 security support ended 2025-12-31; 8.2 is security-only to 2026-12-31; 8.3 to 2027-12-31; 8.4 is in active support. The Console already requires `^8.3`.
- Recommendation: decide the new minimum (8.2 now, or 8.3 to align with the Console), then update composer constraints, headers and READMEs together, and declare `Requires PHP` in the ContextualWP header where none exists today.
- Value: no end-of-life runtime in the supported matrix; a consistent platform story across the ecosystem.
- Scope: small, both plugins, one minor release each.
- Risk: sites on PHP 8.1 would be blocked from updating; that is the point, but it needs the owner's call.

### F-5. WordPress platform drift: no core minimum, stale "tested up to", migration plan conditions now partly met

Priority: medium. Authority: PROPOSE FIRST, except where noted. Repositories: contextualwp, contextualwp-housebuilder-pack.

- Verified: ContextualWP's header declares no `Requires at least`, `Requires PHP` or `Tested up to`. The Pack declares `Tested up to: 6.8`. WordPress 7.0 shipped on 2026-05-20 and its release post names the AI Client, a Connectors hub and the Abilities API (https://wordpress.org/news/2026/05/armstrong/); WordPress 7.1 shipped on 2026-08-19 (https://wordpress.org/news/2026/08/mary-lou/); both checked 2026-10-10. Detailed Abilities API changes in 7.1 were read from secondary coverage and should be confirmed from the core field guide before the Phase 2 spike relies on them. The plugin's `docs/AI-MIGRATION-PLAN.md` conditions its Phase 2 on exactly these platform features existing.
- Recommendation: (a) test both plugins against WordPress 7.1 on a non-client site and update `Tested up to` (AUTONOMOUS only once the test has actually been run; it is not a documentation-only edit); (b) propose declaring `Requires at least` and `Requires PHP` in the ContextualWP header (PROPOSE FIRST because WordPress enforces them at install); (c) propose a bounded Phase 2 evaluation spike of the WordPress AI Client against the plugin's five migration conditions, producing a report rather than code (PROPOSE FIRST).
- Value: accurate compatibility signals for adopters; an informed decision on the plugin's AI transport future instead of an open-ended plan.
- Scope: (a) small plus a test environment; (b) trivial once decided; (c) medium, report only.
- Risk: (a) and (b) low; (c) none beyond effort, provided it stays a spike.

### F-6. Client-identifying values in public repositories

Priority: medium. Authority: mixed, see below. Repositories: contextualwp-housebuilder-pack, contextual-console.

- Verified: the Pack's `tests/PlotDatasetMapperCompletenessTest.php` (line 275, commit 41dd567, on `origin/main`) uses the client's name as a test development title, against the repository's own "fixture policy (non-negotiable)" in `DEVNOTES.md`. The Console's `README.md`, `docs/DEPLOYMENT.md`, `.env.example`, `.cursor/skills/`, `CHANGELOG.md` and several tests reference the client brand, including a real production hostname in the README and deployment guide and a brand-named environment variable that the production configuration reads by name. ContextualWP has no such references. The values remain in Git history regardless of any fix.
- Recommendation: (a) neutralise the Pack test title and the Console documentation hostnames and test fixtures to example values (AUTONOMOUS: behaviour-preserving, equivalent substitutes); (b) renaming the brand-named environment variable requires a coordinated production configuration change, so propose it with a backwards-compatible alias first (PROPOSE FIRST for the code; the production step is HUMAN AUTHORITY); (c) whether to rewrite public Git history to remove the hostname is a HUMAN AUTHORITY decision; the recommendation is not to, since the value is a public website address rather than a credential.
- Value: the repositories honour their own privacy policy; lower risk of future private details following the same path.
- Scope: (a) small across two repositories; (b) small but production-coupled.
- Risk: (a) none to behaviour; (b) a missed alias would break production ingest, which is why it is not autonomous.

### F-7. ContextualWP licence metadata is inconsistent

Priority: medium for legal clarity, trivial effort. Authority: HUMAN AUTHORITY (pending decision P-003). Repository: contextualwp.

- Verified: `LICENSE` is the GPL-3.0 text; `composer.json` declares `"license": "MIT"`. The Pack is consistently GPL-2.0-or-later and the Console consistently MIT.
- Recommendation: the owner decides the intended licence; the steward then corrects the wrong file.
- Value: removes legal ambiguity for adopters and informs the licence choice for this repository.

### F-8. No continuous integration anywhere; tests are stub-based

Priority: medium. Authority: AUTONOMOUS. Repositories: all three.

- Verified: no `.github/workflows` in any repository. Local test runs pass for both plugins. All three suites use stubs or in-memory SQLite; none exercises a real WordPress or a real plugin endpoint, so cross-project interface regressions are not caught by tests.
- Recommendation: add a GitHub Actions workflow per repository that installs dependencies and runs the existing test command on pull requests and default-branch pushes, across the repository's declared PHP range. Nothing else in the first pass. Integration testing across products is a separate proposal once F-9 is decided.
- Value: every pull request, including the steward's own, gets an independent pass or fail; this is the prerequisite for any autonomous landing policy.
- Scope: small, one workflow file each.
- Risk: low; a failing matrix entry on an unsupported PHP version would surface F-4 rather than break anything.

### F-9. Cross-project compatibility is documented in prose only

Priority: medium. Authority: PROPOSE FIRST. Repositories: contextualwp-housebuilder-pack, contextual-console, plus the matrix in this repository.

- Verified: see `ecosystem/compatibility.md`. The Console needs Pack 0.4.6 or later for completeness fields but checks nothing in code; core registers incompatible packs and only labels them; the Pack has a minimum but no maximum core version; the plot status vocabulary and completeness enum are defined separately in each repository.
- Recommendation: propose a lightweight contract: the Pack's `/plots` response carries `pack_version` (and optionally a `schema_version`) at the top level; the Console records it per run, surfaces it on the source page, and raises a `source_incompatible` warning when it is below the minimum the Console supports. Additive on both sides; release the Pack first.
- Value: version mismatches become visible in the Console within a day instead of surfacing as puzzling `unknown` statuses or missing warnings.
- Scope: small on each side, two coordinated releases.
- Risk: low; additive fields. Needs the integration evidence described in `governance/cross-project-stewardship.md`.

### F-10. Public endpoint rate limiting is ineffective on common hosting

Priority: medium. Authority: PROPOSE FIRST (changes behaviour of a public endpoint and touches request trust). Repository: contextualwp.

- Verified: `includes/helpers/utilities.php` implements rate limiting with `wp_cache_*`, which does not persist between requests without a persistent object cache, so on default hosting the limit on `mcp/v1/manifest` and `mcp/v1/site_diagnostics` never triggers. The client IP is taken from `X-Forwarded-For` or `Client-IP` before `REMOTE_ADDR`, so it is caller-controlled. The manifest advertises a per-hour limit that is never enforced. The public path of `mcp/v1/get_context` is not rate limited.
- Recommendation: propose a transient-backed fallback when no persistent object cache is present, a documented trusted-proxy setting for forwarded headers, and either enforcing or removing the advertised per-hour figure. Decide separately whether public `get_context` should be limited.
- Value: the documented protection on a public endpoint actually exists; the manifest is honest.
- Scope: small to medium, one minor release.
- Risk: medium; a wrong proxy assumption could rate-limit legitimate traffic behind a CDN, which is why the trusted-proxy behaviour needs the owner's input.

### F-11. Console configuration caching is blocked by runtime environment reads

Priority: low to medium. Authority: PROPOSE FIRST. Repository: contextual-console.

- Verified: `app/Core/Services/HttpJsonSourceFetcher.php` resolves source auth header values with `env()` at runtime, so the deployment guide forbids `php artisan config:cache`, a standard Laravel production optimisation. The repository's own roadmap lists redesigning this.
- Recommendation: propose moving source credentials behind a config-backed lookup populated from environment variables at config load, so `config:cache` becomes safe, with a documented migration for existing sources.
- Value: standard production performance posture; one less footgun in the deployment procedure.
- Scope: small; one minor release plus a deployment note.
- Risk: low if the existing environment variable names remain valid.

### F-12. Documentation and metadata drift

Priority: low. Authority: AUTONOMOUS for code comments and metadata; PROPOSE FIRST for the contributor-instruction document. Repositories: all three.

- Verified: ContextualWP `docs/DEVNOTES.md` describes a ChatGPT-plus-Cursor workflow and manual testing and never mentions the PHPUnit suite that exists; `includes/endpoints/generate-context.php` line 324 carries a stale "add more providers here (e.g. anthropic)" comment although Anthropic is implemented. The Pack's `src/Compatibility.php` docblocks still call the version check a placeholder to be verified against core 1.1+. The Console's `composer.json` still carries the Laravel skeleton name and description, and `tools/` is an empty undocumented directory.
- Recommendation: (a) correct the stale code comment, the Pack docblocks and the Console `composer.json` metadata, and remove or document the empty directory (AUTONOMOUS); (b) propose updating `docs/DEVNOTES.md`, which is ContextualWP's contributor-instruction document and therefore excluded from autonomous change, ideally together with pending decision P-005 (PROPOSE FIRST).
- Value: a future steward or contributor is not misled.
- Scope: trivial. Risk: none.

### F-13. Test and dependency housekeeping

Priority: low. Authority: AUTONOMOUS. Repositories: contextualwp, contextualwp-housebuilder-pack, contextual-console.

- Verified: ContextualWP's `tests/SmartModelSelectorComplexityTest.php` uses non-static data providers, producing 7 PHPUnit deprecations that become errors on PHPUnit 11; its `composer.json` pins `phpunit/phpunit` to exactly `10.0` while the Pack uses `^10.5`; its `composer.lock` is ignored by Git while the Pack commits it. The Console's lock has Laravel 13.4.0; Laravel 13 is current (released 2026-03-17, bug fixes to Q3 2027), so only routine minor updates apply. The Pack's relationship, interpretation, schema extension and structural detection services have no unit coverage.
- Recommendation: make the data providers static, align the PHPUnit constraint, run routine dependency updates within constraints with tests passing, and add targeted tests for the Pack's untested services where a stub-based test is meaningful. Leave the lock-file policy difference alone unless it causes a problem.
- Value: forward compatibility and a safer base for autonomous work.
- Scope: small. Risk: none to behaviour.

### F-14. Product opportunity already on the Console roadmap: source administration

Priority: low. Authority: PROPOSE FIRST. Repository: contextual-console.

- Verified: monitored sources are created and edited only through a database client or `tinker` (`docs/OPERATIONS.md`), and the handover document lists a source admin UI as future work. Everything else in the Console has an admin UI.
- Recommendation: when the owner wants Console feature work, this is the highest-leverage item visible from the design: an admin-only sources form covering the fields in `ecosystem/compatibility.md`, Interface 4, with the credential still supplied by environment variable name. No other product opportunity is proposed from this assessment; the products' own roadmaps already capture the rest.
- Value: onboarding a second site becomes an operator task rather than a developer task.
- Scope: medium. Risk: low; admin-only.

## Areas with nothing to report

- **Housebuilder Pack AI usage**: none; nothing to keep current.
- **Console AI usage**: none; nothing to keep current.
- **Laravel and front-end dependency currency**: Laravel 13, Vite 8 and Tailwind 4 are current major lines; only routine updates (F-13).
- **Security beyond F-10 and F-6**: capability checks on every non-public route are present and appropriate; API keys are not exposed in responses; the Console's admin routes are middleware-protected and its dev routes are environment-gated. No further evidenced concern.
- **Performance**: endpoints are cached with documented TTL filters; the Console's synchronous daily ingest is proportionate to one source. No evidenced concern.
- **Cross-project compatibility at current versions**: Console 1.2.1 against Pack 0.4.8 against core 1.3.5 is consistent field for field.
- **Open issues and pull requests**: none anywhere.
- **Local housekeeping noted for the owner only**: the Pack clone has a fully merged, never-pushed local branch (`fix/development-intro-media-detection`) that can be deleted locally. Not a repository action.

## Areas checked

Ecosystem health; cross-project compatibility; dependencies, runtime and platform currency; AI provider, model and API currency; testing and CI; documentation drift; security and performance; technical debt; workflow and product opportunities; public repository privacy.

## Suggested order

1. Owner decisions: P-002 (this repository's licence), P-003 (ContextualWP licence), P-004 (PHP minimum), P-001 (autonomous landing), P-005 (per-repository instruction files).
2. Autonomous first batch, as pull requests where the repository permits (see the landing rules in `governance/authority-model.md`): F-1, F-2(a), F-3(a), F-6(a), F-8, F-12(a), F-13. More than three items are listed, so the steward takes the dated ones first (F-1, F-2(a), F-3(a)) and defers the rest to following cycles.
3. Proposals for approval: F-2(b), F-3(b), F-5(b) and (c), F-9, F-10, F-11, F-12(b), then F-14 when feature work is wanted.
