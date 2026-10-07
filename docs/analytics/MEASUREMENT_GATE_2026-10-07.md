# Measurement Gate execution evidence — 2026-10-07

Overall: **PARTIAL / BLOCKED**. Baseline: **NO**.
Decision: `DEC-20261007-MARKETINGEXP001`. No marketing experiment started.

## Repository and deployment

- Starting main: `df476898de10d8f7988671ed6b8697ce2125d9d1`.
- Branch: `fix/measurement-gate-ga4-production`.
- Implementation commit: `b8b4c8a59767ef636b6577fb6417f7914fc0a5b7`.
- PR: https://github.com/maxi001maxi/the-rev-website/pull/173 (open, unmerged).
- Preview: no deployment ID. API rejected creation with HTTP 402,
  `api-deployments-free-per-day`, daily free limit 100, retry after 86400 seconds.
  Git integration also reported Vercel build-rate-limit failure. Neither is a
  passing Preview or a failed application build.
- Current production: `dpl_423PewdYNUu2e3kVQpEBcApESce8`, READY, commit
  `0d431925518da06b4a0afe7285eceec432c90546`. It does not contain this PR.
- Required next order: refresh main, reconcile this branch without adding
  unrelated changes, Preview acceptance, merge, production acceptance. Do not
  merge this PR on the basis of local tests or the old production Cron alone.

## Gate A — fresh acceptance incomplete

The published GTM container contains one Google base tag for `G-Q6ZSSJMEZ2`
and an event-forwarding tag whose trigger includes the four P0 events. Actual
GA4 Data API reports contain `reserve_click`, `line_click`, `price_click`, and
`article_cta_click` events. This establishes collection in the observed range,
not exactly one page_view on each of the six current pages or one forwarding
request per test click.

The local network audit could not load the production pages through the
execution environment's TLS/proxy path (`ERR_CERT_AUTHORITY_INVALID`). No TLS
validation was disabled. All six live page_view/no-duplicate checks and live
P0 forwarding acceptance remain pending. The older 2026-09-25 six-page PASS
must not be carried forward as a new PASS.

The PR requires a real `https://cl.gyms.jp/` destination before a
`reserve_click` is canonical. A mislabeled internal link cannot count as an
external booking-page open. No public copy, prices or Editorial behavior changed.

## Gate B — real runtime sync passed; corrected writer pending

- Property `552679302`, container `GTM-WFD7R8BT`, measurement `G-Q6ZSSJMEZ2`.
- Existing credential parsed; OAuth with `analytics.readonly` and real Data API
  reports succeeded. No new key was issued. GA4 property access UI showed the
  service account with Viewer access. Both Preview and Production environment
  targets have the GA4, Cron and Supabase configuration; no secrets were logged.
- Historical 403 is no longer reproducible. The prior failure's precise cause
  cannot be determined from its persisted generic error. Current Viewer access,
  successful OAuth and successful same-property production reports are evidence
  of resolution, not proof of a historical cause or a permission change here.
- Production Cron request at `2026-10-07T04:53:54.233Z`, request ID
  `pfsq8-1791348834233-860997d4b7e2`, HTTP 200, user agent `vercel-cron/1.0`.
  The runtime log shows the rewrite to `/api/integrations/editorial-status/`
  with `mode=company_os_ga4_cron`, OAuth, two GA4 reports, daily-metric write
  and source-registry write. Source observation: `2026-10-07T04:53:54.694Z`.
- Actual database: 13 rows, min `2026-09-25`, max `2026-10-07`.
  Registry `ga4-direct-read`: ACTIVE, last_error NULL. It was updated by the
  successful production read/sync, not a manual health-status update.
- Requests without Cron credentials were rejected with HTTP 401 in Vercel
  logs. The fetch connector reported deployment authentication required, so
  this is rejection evidence at the deployment boundary; it does not isolate
  the application's CRON_SECRET check. That check remains intact in code and
  requires a direct runtime acceptance on an accessible production origin.
- Migration `20261007045422_ga4_measurement_gate_contract.sql` applied to the
  real database. The RPC executed successfully: today.partial=true;
  recent seven completed days `2026-09-30..2026-10-06`, sessions 94;
  daily active-users sum 70 explicitly labeled user-days; unique users NULL /
  UNKNOWN because the old production writer lacks window metadata.
- The new writer was tested against real GA4 reports locally: 13 normalized
  days; seven-day period unique active users 64 from a separate dimensionless
  report. This value has not been written by a deployed new writer and is not
  asserted as the current RPC value. Incomplete earlier/28-day windows remain
  UNKNOWN. Positive P0 events were first observed on 2026-09-27; earlier
  unverified event days stay NULL in the new writer.
- Today in the old persisted row still has data_status VALUE. The RPC marks it
  partial; the new writer will persist DELAYED. Historical unverified event
  zeros and missing unique-user metadata remain blockers until that writer is
  deployed and successfully resynced. Raw source ACTIVE does not mean the
  Measurement Gate passed.

## Gate C — public flow audited; tenant integration capability UNKNOWN

The public THE REV. Gym's booking page was opened with website UTMs. It
redirected to the trial page while retaining all four UTM parameters. Selecting
the personal-training trial displayed the date-selection calendar and retained
the same UTM URL. No customer details were entered and no booking was submitted.

This browser had no observed signed-in Gym's management session. No tenant
API, webhook, export, callback, custom GTM/GA4 configuration, completion screen
or completion-time UTM retention was verified. General vendor marketing claims
do not prove these capabilities for THE REV.'s tenant.

- reservation_start: **UNKNOWN** as an analytics event. Opening the external
  page or displaying the calendar is not a verified reservation_start event.
- reservation_complete: **UNKNOWN**, never zero.
- Integration classification: **unresolved**. Use the C-style operational
  fallback until an authoritative integration is verified; this is not a claim
  that Gym's has no API or export capability.
- Authoritative confirmed-booking source design: Gym's internal booking ledger,
  reconciled through an authorized export or user-confirmed aggregate. Do not
  derive bookings from GA4 clicks. Any future analytics feed must use anonymous
  event IDs or internal server-side matching; no PII or form responses in GA4.

Gate C is not PASS until the actual tenant's integration options are audited
and this fallback or a supported integration is confirmed.

## Gate D and validation

Local PASS: Measurement Gate contract tests; GA4 direct-read static tests;
Phase E analytics tests; JavaScript syntax checks; git diff whitespace check;
`npm run vercel-build`. The repository has no configured lint script.

The deployed old runtime's sync is PASS. Preview acceptance, merge, new
production deployment/runtime, fresh six-page collection and final booking
classification are pending. Company Timeline records BLOCKED, not PASS; the
active Decision receives no Measurement Gate PASS evidence refs.
