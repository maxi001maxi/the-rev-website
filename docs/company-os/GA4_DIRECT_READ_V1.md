# GA4 Direct Read-Side v1

Purpose: decouple THE REV. Morning Meeting GA4 reads from GSC Wizard.

## Architecture

therev-lab.com -> GTM-WFD7R8BT -> GA4 G-Q6ZSSJMEZ2 / property 552679302

Read side:
Google Analytics Data API (service account, analytics.readonly)
-> Vercel cron `/api/integrations/editorial-status?mode=company_os_ga4_cron`
-> Supabase company_os_ga4_daily_metrics
-> company_os_get_ga4_morning_metrics()
-> Company State Builder / Morning Meeting

Admin Analytics also reads Google Analytics Data API directly again.

GSC remains a separate source and may still use GSC Wizard until its own direct read path is replaced.

## Required Vercel secrets

- GA4_PROPERTY_ID=552679302
- GA4_SERVICE_ACCOUNT_JSON=<service account JSON or base64>
- existing CRON_SECRET
- existing SUPABASE_URL
- existing SUPABASE_SERVICE_ROLE_KEY

The service account must have Viewer access to GA4 property 552679302 and Google Analytics Data API access.

## Semantics

- Today's row is partial and must not be compared as a complete day.
- 7-day and 28-day trend windows use completed days ending yesterday.
- reserve_click is booking intent, not a confirmed booking.
- UNKNOWN is never coerced to zero.
- GA4 collection state and GA4 read-side state are separate.


## Vercel Hobby constraint

The project is already at the 12-serverless-function Hobby limit. The GA4 cron therefore reuses the existing `api/integrations/editorial-status.mjs` function with a dedicated `mode=company_os_ga4_cron` route instead of adding a 13th function.

## Credential deployment status

- 2026-10-06: `GA4_SERVICE_ACCOUNT_JSON` configured for Production in Vercel.
- A fresh Production deployment is required after secret registration so the runtime can load it.

## Credential format note

`GA4_SERVICE_ACCOUNT_JSON` is stored in Vercel as base64-encoded JSON. `parseServiceAccount()` accepts either raw JSON or base64-encoded JSON, which avoids multiline private-key corruption in shell/CLI entry.

## Measurement Gate contract (2026-10-07)

- Sync begins at verified base instrumentation start `2026-09-25` (Tokyo property timezone). API success fills empty completed days with zero for base metrics only.
- P0 events before their earliest verified GA4 observation are NULL/UNKNOWN. First observed dates persist as `event_verified_from`; a missing/unverified event is never fabricated as zero.
- Incomplete, thresholded, sampled, malformed or truncated reports fail closed before any upsert.
- Today's daily row has `data_status=DELAYED`; RPC explicitly marks `partial=true`.
- Admin 7/28-day ranges and Company OS trend windows end yesterday.
- Period `active_users` comes from a separate GA4 period query, stored in successful source metadata. `daily_active_users_sum` is explicitly user-days and must never be interpreted as unique users.
- Historical windows before 2026-09-25 remain UNKNOWN/DELAYED. Do not fabricate a full 28-day baseline from 13 instrumented days.
- Source ACTIVE / last_error NULL is written only after a successful read AND daily upsert. Failures preserve last successful observation and period evidence; RPC exposes ERROR/STALE.
- Confirmed booking remains a separate authoritative Gym's booking record; `reservation_start` and `reservation_complete` remain UNKNOWN in GA4 until a verified integration exists.
- Preview read-only acceptance: `node scripts/ga4-preview-acceptance.mjs` with server-side Preview envs. No private credentials are emitted and no rows are mutated.
- Contract tests: `node scripts/test-ga4-measurement-gate.mjs`, `npm run test:ga4-direct`, `npm run test:phase-e`.
