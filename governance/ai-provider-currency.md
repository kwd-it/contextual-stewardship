# AI provider and model currency

ContextualWP calls OpenAI, Anthropic and Mistral directly for its optional AI-assisted features. Neither the Housebuilder Pack nor the Console makes AI calls today. Keeping the plugin's provider, model and API assumptions current is an explicit stewardship responsibility, checked in every cycle.

## What to check

For each provider the plugin supports, and for any provider a product later adds:

- **Model status** of every ID in the plugin's catalogue (visible, supported, legacy, fallback and smart-selection tiers): current, deprecated with a date, or retired.
- **API surface**: endpoint paths, required version headers, request and response shapes the plugin depends on (for example the OpenAI Responses versus Chat Completions split, or the position of text in an Anthropic response).
- **Vendor-announced changes** that affect the plugin's assumptions: new model generations, pricing tier changes, authentication changes, rate limit changes.
- **WordPress platform AI** (AI Client, Connectors, Abilities API) maturity, because the plugin's own `docs/AI-MIGRATION-PLAN.md` conditions a future migration on it.

## Where to check

Current facts come from authoritative, dated sources, never from the steward's training knowledge:

- the provider's official deprecations page and model documentation;
- the provider's official SDK or API changelog;
- WordPress core release notes and the Make WordPress Core blog.

Record the source URL and the date checked in the assessment. If two sources disagree, say so and prefer the vendor's own page.

## Rules for acting

A newer model existing is never by itself a reason to change anything.

**AUTONOMOUS**, under the normal conditions in `authority-model.md`:

- Removing an ID from a fallback or legacy-accepted list after the vendor has retired it, where the plugin would otherwise send requests to a model that no longer exists.
- Replacing a model ID that the vendor has retired, or has scheduled for retirement within 90 days, with the vendor's documented successor **in the same tier**, when all of these hold: the request and response contract the plugin relies on is unchanged for the successor; previously saved IDs remain accepted so existing sites keep working; the plugin's tests are updated; and the change and its source are recorded in the changelog. The steward verifies the successor's exact API ID against the vendor's documentation, not from a secondary source.
- Documentation corrections where the README names a model the code no longer uses.

**PROPOSE FIRST**:

- Changing the default model for any provider.
- Adding a new model generation to the visible catalogue, or changing smart-selection tier mappings for models that are not retiring.
- Any change to how a response is parsed or a request is built, including moving between API surfaces.
- Adding or removing a provider.
- Starting any phase of the WordPress AI Client migration described in the plugin's migration plan.
- Replacing a retiring model when the successor behaves differently in a way that matters to the product (for example a model whose responses include reasoning blocks before text, which the plugin's current parsing would not handle).

**HUMAN AUTHORITY**: anything involving provider accounts, API keys, spending limits or the reference implementation's configured provider and model.

## Behavioural compatibility, not just availability

Before recommending any model change, the steward considers: response shape; whether the model supports the parameters the plugin sends; token limits against the plugin's smart-selection thresholds; latency against the plugin's request timeout; cost tier; and whether editor-facing behaviour (ACF AskAI, global chat) would noticeably change. These go in the proposal.

## Cadence

Every stewardship cycle checks model status. The plugin's own code comments ask for the model mapping to be reviewed every three to six months; stewardship supersedes that by checking each cycle and acting on retirement dates with at least 90 days of lead time.
