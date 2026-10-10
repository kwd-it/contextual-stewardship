# Cross-project interfaces and compatibility

Verified against the repositories on 2026-10-10. Update this file in the same cycle as any release or interface change.

## Version matrix

| Consumer | Requires | Declared where | Enforced how |
|---|---|---|---|
| Housebuilder Pack 0.4.8 | ContextualWP core >= 1.3.3 | `CONTEXTUALWP_HOUSEBUILDER_PACK_MIN_CONTEXTUALWP_VERSION`, `requires_contextualwp` in registration, README | Pack checks `CONTEXTUALWP_VERSION` and shows an admin notice; core marks the pack "Incompatible" in admin. Neither blocks activation. If `CONTEXTUALWP_VERSION` is undefined the Pack treats core as compatible. |
| Housebuilder Pack 0.4.8 | WordPress >= 6.4, PHP >= 8.1 in 0.4.8; PHP >= 8.3 on `main` since [pull request #1](https://github.com/kwd-it/contextualwp-housebuilder-pack/pull/1) merged on 2026-10-10 (D-009), not yet released; tested up to WordPress 6.8 | Plugin header, `composer.json` | WordPress enforces the header minimums. No `Requires Plugins` header. |
| ContextualWP 1.3.5 | PHP >= 8.1 in 1.3.5; PHP >= 8.3 on `main` since [pull request #1](https://github.com/kwd-it/contextualwp/pull/1) merged on 2026-10-10 (D-009), not yet released | `composer.json` in 1.3.5; on `main` also the `Requires PHP: 8.3` plugin header | Not enforced at install in 1.3.5; WordPress enforces `Requires PHP` from the first release that carries the header. **No WordPress minimum is declared anywhere.** |
| Contextual Console 1.2.1 | Housebuilder Pack >= 0.4.6 for asset-completeness fields | README, `CHANGELOG.md`, handover doc | **Not enforced in code.** Missing fields are treated as `unknown` and are non-actionable. No ContextualWP core requirement is stated. |
| Contextual Console 1.2.1 | PHP ^8.3, Laravel ^13.0 (lock: 13.4.0) | `composer.json` | Composer. In 1.2.1 the committed `composer.lock` resolves Symfony 8.0 packages that require PHP >= 8.4, so the declared and effective minimums differ. Fixed on `master` by [pull request #2](https://github.com/kwd-it/contextual-console/pull/2), merged on 2026-10-10 and not yet released: the lock resolves Symfony 7.4 LTS and `config.platform.php` pins resolution to 8.3.0, keeping PHP 8.3 as the minimum (owner decision, 2026-10-10). The suite passes under PHP 8.3.13 and 8.4.20 (verified 2026-10-10 by running it). |

Maximum versions are declared nowhere. A core major release would not be detected by the Pack or the Console.

## Interface 1: ContextualWP sector pack contract (core <-> Pack)

Documented in core's `docs/PACK-SPEC.md`; implemented in `includes/SectorPacks/`.

- Registration: `contextualwp_register_sector_pack( array $meta ): bool` during the `contextualwp_sector_packs_init` action (fired on `plugins_loaded` priority 20). Required keys `slug`, `name`, `version`; optional `description`, `author`, `requires_contextualwp` (minimum only), `settings_url`.
- Core filters the Pack hooks: `contextualwp_manifest_schema_relationships`, `contextualwp_schema`, `contextualwp_manifest_schema`, `contextualwp_schema_interpretation`, `contextualwp_acf_schema_field_groups`.
- Convention: a pack adds its own top-level key to `interpretation` (the Pack uses `housebuilder_pack`) and never overwrites `interpretation.contextualwp`.
- Packs must not depend on core internals beyond documented hooks, and core must behave identically with no packs active.

Compatibility risk: any change to these hook names, their argument shapes, the registration keys or the `plugins_loaded` timing affects the Pack.

## Interface 2: Housebuilder plots feed (Pack -> Console)

`GET /wp-json/contextualwp-housebuilder/v1/plots`, capability `edit_posts` by default (filter `contextualwp_housebuilder_rest_plots_capability`), published plot-like posts only. Query: `page`, `per_page` (default and maximum 500), legacy `limit`.

Row fields and how the Console uses them:

| Field | Console use |
|---|---|
| `id` | Required, must be unique per source; drives change detection |
| `status` | Expected values `available`, `coming_soon`, `reserved`, `sold`; other values raise `invalid_value` |
| `price` | Required when status is `available`; numeric, >= 0 |
| `development`, `url` | Development label, with URL fallback |
| `last_modified_by` | Display only (display name, never user identifiers) |
| `has_floor_plan`, `floor_plan_required`, `floor_plan_completeness_status` | Warning raised only when `floor_plan_required === true` and status is `missing` |
| `has_intro_video`, `has_intro_image`, `intro_media_type`, `intro_media_completeness_status` | Stored, not raised as issues since Console 1.2.1 |
| `title`, `bedrooms`, `house_type`, `last_updated`, `wp_id` | Stored and displayed |

Completeness status enum: `present`, `missing`, `unknown`. `unknown` is never actionable.

Compatibility risk: the status vocabulary and the completeness enum are defined independently in each repository. Renaming a field, changing an enum value, or changing pagination defaults affects the Console's ingest, issue detection and daily summaries.

## Interface 3: ContextualWP core endpoints (core -> Console and other tools)

The Console can also ingest core's `GET /wp-json/mcp/v1/list_contexts` through its `contextualwp_list_contexts` adapter (maps `post_id`/`ID`/`context_id` to `id`, `acf.price` to `price`, `plot_status`/`availability` to `status`), with `http_json_items_key` to unwrap a wrapped list and `page`/`per_page` pagination. This path is documented but the primary production path is Interface 2.

Core routes and permissions as of 1.3.5:

| Route | Method | Permission |
|---|---|---|
| `mcp/v1/manifest` | GET | public, rate limited |
| `mcp/v1/list_contexts` | GET | `read` capability |
| `mcp/v1/get_context` | GET | logged in, or public when the post is public |
| `mcp/v1/site_diagnostics` | GET | `manage_options`, rate limited |
| `contextualwp/v1/schema` | GET | `manage_options` |
| `contextualwp/v1/acf_schema` | GET | `edit_posts` |
| `contextualwp/v1/generate_context` | POST | `edit_posts` |

Authentication from the Console is WordPress Application Passwords over HTTP Basic, with the header value supplied from an environment variable named per source.

## Interface 4: Console ingest configuration (operator -> Console)

Per-source settings stored in the Console database: `endpoint_url`, `auth_header_name`, `auth_token_env_key`, `http_json_items_key`, `http_plot_payload_adapter`, `http_pagination_mode`, `http_page_param`, `http_per_page_param`, `http_per_page`. There is no admin UI for these; they are set with a database client or `tinker`. Renaming any of them, or the environment variable a production source names, is a production-affecting change.

## Release coupling

When a change spans interfaces, release producer first in an additive way, then the consumer, then (if ever) remove the old shape. Record the order in the proposal and update the matrix above on each release.
