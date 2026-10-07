# GSC Direct Read Production Acceptance

2026-10-07 JST — **BLOCKED: Google Search Console API is disabled**.
Starting main: `6d0c6271b170487b72827a2e35e69ad619b53be9`.
Production at bootstrap: `dpl_6SKAV1oeAqPsaPdASwHGu4XpjkGB`, READY.

## Verified current truth

- Source `gsc-direct-read`: NOT_CONFIGURED; no observation; 0 persisted daily rows.
- Production has no GOOGLE_READONLY_SERVICE_ACCOUNT_JSON; existing GA4_SERVICE_ACCOUNT_JSON is the configured fallback.
- Existing authorized identity: `the-rev-intelligence-readonly@indigo-coder-510207-v3.iam.gserviceaccount.com`.
- Direct probe using the existing identity and webmasters.readonly obtained OAuth, then Google returned HTTP 403 `SERVICE_DISABLED` for project `803789724795`. Property permission has **not** been determined; this is not property_not_authorized evidence.
- Google Cloud API page in Cloud Browser returned Site Unavailable. No permission or credential was changed.
- RPC executes, but all four periods have 0 days / UNKNOWN / NULL. This is read-model availability, not completed data acceptance.
- GA4 remains ACTIVE / last_error NULL. Source metadata preserves CONTROL_CAPTURE_ACTIVE. Existing Control Capture contract passes; reserve_click remains booking-page intent and today remains partial.

## Necessary existing-path corrections

- Keep syncDirectGscToCompanyOs; persist only actual date rows. Google's date-only query omits days without data, so absent days are not manufactured ZERO rows. Validate provider counts/dates/position. Empty final reports fail closed and cannot make the source ACTIVE.
- Request the existing 56-day final window, ending at Pacific date minus three days. Record requested range/missing days, actual row count, and last actual final date. A returned verified zero row can be ZERO; missing dates reduce read-model coverage.
- Route the existing GSC Cron through `/api/cron/company-os-gsc/`, with a rewrite to the existing authenticated mode. Preserve CRON_SECRET authentication, the same schedule, GA4 Cron, and disabled automatic deployments.
- Japanese presentation recomputes percent change, CTR percentage-point change, and position improvement direction. Partial windows and zero denominators cannot become fabricated comparisons.
- Morning Meeting and Company State Builder prompts use the existing Direct RPC and Japanese comparison rules. Schedules and unrelated sections remain unchanged. Runtime activation still waits for acceptance.

Google contract: https://developers.google.com/webmaster-tools/v1/searchanalytics/query

## Resume order

1. Enable Google Search Console API for Google Cloud project 803789724795. Re-run the existing read-only probe.
2. If and only if property_not_authorized is then established, inspect the domain property's Users and permissions and add the known service account as Full through an authorized account.
3. Validate date/clicks/impressions/ctr/position from the real API. Complete candidate CI, exactly one explicit Preview, Preview acceptance, merge, exact latest-main Production, READY and existing Cron Run.
4. Verify actual Supabase rows, source ACTIVE / last_error NULL, final date/range, four RPC periods and Japanese comparisons. Keep insufficient periods incomplete.
5. Verify GA4 and Control Capture health and all existing gates. Record production PASS only after real sync/read-model acceptance. No GBP work, no Treatment.

No Preview, merge or Production deployment has been performed for this blocked candidate. No synthetic search metrics or manually promoted ACTIVE source state were written.
