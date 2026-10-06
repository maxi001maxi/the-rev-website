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
