# THE REV. Execution Phase 0 — Measurement Gate

Updated: 2026-10-07 06:29 UTC. Decision: `DEC-20261007-MARKETINGEXP001`.

**Measurement Gate: PASS. Baseline readiness: YES. Baseline and REV-EXP-2026-001 have not started.**

This acceptance supersedes the earlier PARTIAL / BLOCKED result. The Vercel deployment quota cleared. No application development, positioning/copy changes, pricing changes or marketing experiment was added during this retry. Preview credential encoding was repaired using the existing authorized service account; its identity and permissions were unchanged.

## Release and writer acceptance

| Check | Actual evidence |
| --- | --- |
| PR | #173, merged only after Preview acceptance |
| Requested historical head | `10bab88730b567065f3ef733b15526ddabdaeab7` |
| Actual accepted head | `b0625392f431a1eefd254d8242c72e38747d260b`; the added commit inherits the explicit Vercel release policy |
| Latest main before merge | `4fe4f6e3f38c9ef31d36d365f3490d0a9cbe6bca`; merge-tree clean |
| Preview | `dpl_3CNEGaSMbpKNNg1TjQLVY5a8E6G6`, READY, exact accepted head |
| Preview new writer | Real GA4 OAuth/read and Supabase upsert, PASS, 13 rows, 2026-09-25..2026-10-07, observed 06:16:30.315 UTC |
| Merge / runtime SHA | `f260ddb9f00b57b59322dff97409f10f99a385a5`; parent is the latest main above |
| Production | `dpl_Csfd5qQvPyGb3vqVj1Q95DWEtrfa`, READY, exact merge SHA, aliases assigned |
| Production Cron | HTTP 200, `lt2rb-1791354409440-93bc027d5ffd`, 06:26:49.440 UTC |
| Production writer result | `[ga4-sync] PASS rows=13 range=2026-09-25..2026-10-07` |
| Persisted observation | 2026-10-07 06:26:51.055 UTC, all 13 distinct daily rows |

The Production request detail shows `vercel-cron/1.0`, `mode=company_os_ga4_cron`, the correct Function Invocation and deployment ID, actual OAuth/report calls, daily-metrics upsert and source-registry PATCH. ACTIVE / last_error NULL was established by this genuine runtime sync, not a manual source-status update.

Initial Preview `dpl_2C6RGYwpNqUwPCcrztnDGevbBLGj` failed because its service-account value was malformed. Repairing the Preview environment required one new deployment snapshot. Deployment count before Production was 19 in the rolling 24-hour window. Git automatic deployments remain disabled. Documentation-only evidence updates do not require another deployment; the runtime SHA above remains authoritative.

## GTM, GA4 collect and P0 forwarding

Public identifiers: GTM `GTM-WFD7R8BT`, measurement `G-Q6ZSSJMEZ2`, GA4 property `552679302`.

Fresh six-page network audit before merge: Actions run `37412678044`, production-audit job `112660252230`, artifact `11464138253`, completed 06:21:46.507 UTC. Every page returned 200, loaded GTM, sent GA4 collect and sent exactly one page_view; duplicates were zero.

| Page | GTM | GA4 collect | page_view | duplicate |
| --- | --- | --- | --- | --- |
| TOP `/` | PASS | PASS | 1 | 0 |
| Blog index `/blog/` | PASS | PASS | 1 | 0 |
| Price `/price.html` | PASS | PASS | 1 | 0 |
| Trainer `/trainer.html` | PASS | PASS | 1 | 0 |
| Solution `/solution.html` | PASS | PASS | 1 | 0 |
| Article `/blog/training-how-hard-to-push/` | PASS | PASS | 1 | 0 |

Post-merge audit run `37581412197`, production-audit job `112661701044`, completed 06:26:41 UTC, also returned 6/6 collect, six single page_views and zero duplicates. After Production READY, the independent rerun in run `37412678044`, job `112662486263`, artifact `11465051770` completed 06:29:27 UTC: all six pages returned 200, GTM/collect 6/6, page_view exactly one each, duplicates zero.

Live P0 acceptance used actual browser clicks. At 06:22:44 UTC the GA4 Realtime Data API returned no rows for the four P0 names. After one canonical booking link, one LINE CTA, one tracked pricing CTA and one article CTA click, the 06:24:56 UTC report returned exactly one event each for `reserve_click`, `line_click`, `price_click`, `article_cta_click`. The untracked header pricing link was navigation only. The article's pricing destination produced article_cta_click, not a second canonical price_click. Aggregate realtime evidence establishes forwarding; it does not identify an individual visitor.

The published container contains the expected single measurement ID and the existing P0 forwarding configuration. No new tag or measurement implementation was published. Test traffic is included in today's partial data; exclude the acceptance interval from a future clean baseline when relevant.

The workflow's unrelated admin-preview-smoke job points at an old fixed branch URL. Its failure is not acceptance evidence for PR #173; actual Preview and Cron boundaries were tested independently.

## Application-side Cron authentication

Unauthenticated Preview request `t5fmt-1791354069739-5f668b4e7de9` returned 401. Its Vercel request detail shows Firewall **Allowed**, Function Invocation `/api/integrations/editorial-status/`, `mode=company_os_ga4_cron`, the accepted Preview deployment ID, and **no outgoing API requests**. This isolates the application CRON_SECRET rejection from Deployment Protection. The connector classified the app's 401 as deployment authentication, so the underlying Function Invocation details were used as evidence.

## Persisted metric and Morning RPC contract

- 13 daily rows, 2026-09-25..2026-10-07, genuine Production observation 06:26:51.055 UTC.
- Before first verified P0 observation on 2026-09-27, P0 values for 9/25 and 9/26 are NULL, not zero. Later successful complete reports can establish zero.
- Today persists `data_status=DELAYED`; Morning RPC returns `today_partial.partial=true`. Today is never part of a completed-day comparison window.
- Yesterday 2026-10-06 is the completed-day window end. Persisted prior complete dates have `data_status=VALUE`.
- Recent seven completed days 9/30..10/6: sessions 94, new users 58, page views 154, period-unique active users **64**. Daily active_users sum **70** is separately labeled user-days.
- Recent 28 days and previous seven days lack full coverage: DELAYED, complete-period totals NULL, available counts confined to partial_values, unique users UNKNOWN/NULL. Previous 28-day window is UNKNOWN. Missing history is not filled with zero.
- `company_os_get_ga4_morning_metrics('2026-10-07')` verified after Production sync: source_status VALUE, correct freshness, all semantics above, no dependency on the GSC Wizard.
- `ga4-direct-read`: ACTIVE; last_error NULL; metadata contains real completed-window reports and event_verified_from. No manual ACTIVE update.

## Gym's classification and booking scope

Rechecked the public booking redirect, three trial menu options and personal-training date-selection screen; all four website UTM parameters remain in the URL. No reservation or customer information was submitted.

Tenant API/webhook/export and completion analytics remain unverified. Preserve the previous **UNRESOLVED_C_STYLE_FALLBACK** classification; this is not a claim that the vendor has no integration capability. As required by the continuation instruction, unavailable `reservation_start` and `reservation_complete` remain **NULL / UNKNOWN** in metadata and Morning RPC. `reserve_click` means only external booking-page open intent.

Authoritative confirmed bookings are Gym's internal booking ledger, reconciled through an authorized export or user-confirmed aggregate. No booking baseline or conversion rate may be inferred from clicks. Measurement Gate PASS permits a website baseline with explicit booking UNKNOWN; it does not assert a booking integration PASS.

## Company OS and next phase

The final SYSTEM_VERIFIED timeline milestone `b38990af-883e-45cc-9b90-bb15dc2df2cd` and evidence_refs on `DEC-20261007-MARKETINGEXP001` record Measurement Gate PASS / Baseline readiness YES. The earlier BLOCKED milestone remains historical evidence. Baseline collection/fixation, Phase 4 copy edits, new marketing activity and REV-EXP-2026-001 have not started.

Relevant local contract tests, GA4 direct-read tests, Phase E, syntax/whitespace and build checks passed. No additional application changes were necessary for this acceptance retry.
