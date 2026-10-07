# THE REV. GA4 / GTM Current Truth

Updated: 2026-10-07

## Current Measurement Gate status — PARTIAL / BLOCKED

The 2026-09-25 collection acceptance below is historical evidence. It does not
establish a fresh six-page acceptance for 2026-10-07.

On 2026-10-07, a real production Cron invocation returned HTTP 200 and synced
13 daily rows for 2026-09-25 through 2026-10-07. The source registry became
ACTIVE with `last_error = NULL` through that successful runtime sync.

The corrected UNKNOWN/ZERO and period-unique-user writer is in PR #173 and is
not deployed. Preview creation was rejected by Vercel's free daily deployment
limit. No merge or Measurement Gate PASS has been recorded. Baseline remains
blocked. See [dated execution evidence](MEASUREMENT_GATE_2026-10-07.md).

Current production still uses the earlier writer. The migrated morning RPC
marks today partial, ends complete-day windows at yesterday, labels daily user
sums as user-days, and returns UNKNOWN for period unique users until verified
window metadata is written by the new writer. Booking completion remains
UNKNOWN. Do not interpret the old writer's unverified event zeros as established
collection evidence.

## Production identifiers

- Site: https://therev-lab.com/
- GTM container: `GTM-WFD7R8BT`
- GA4 Measurement ID: `G-Q6ZSSJMEZ2`

The Measurement ID is public configuration, not a secret.

## Verified production state

The site loads `GTM-WFD7R8BT` successfully on the audited public pages.

The Google tag for `G-Q6ZSSJMEZ2` was published in GTM on 2026-09-25.

Production acceptance after publish:

- GTM loaded: 6 / 6 audited pages
- `G-Q6ZSSJMEZ2` observed: 6 / 6
- GA4 collect observed: 6 / 6
- `page_view`: exactly 1 per audited page
- duplicate `page_view`: 0 / 6

Audited pages:
TOP, Blog index, Price, Trainer, Solution, Blog article.

Current base measurement path:

```
therev-lab.com
  ↓ PASS
GTM-WFD7R8BT
  ↓ PASS
Google tag / G-Q6ZSSJMEZ2
  ↓ PASS
GA4 page_view collection
```

## GTM base tag

Published Google tag inside `GTM-WFD7R8BT`:

- Tag type: Google tag
- Tag ID: `G-Q6ZSSJMEZ2`
- Trigger: Initialization - All Pages or All Pages, using the existing container's standard page initialization convention
- Publish the container only after Preview / Tag Assistant shows a single base-tag fire per page

Do not add a second direct `gtag.js` implementation to the website while this GTM route is being restored.

## Initial event forwarding

The production site already pushes these operationally useful events into `dataLayer`:

- `reserve_click` — primary booking intent
- `line_click` — contact intent
- `price_click` — pricing consideration
- `recovery_click` — recovery interest
- `review_click` — social proof interest
- `trainer_click` — trainer trust interest
- `article_click`
- `article_cta_click`
- `related_article_click`
- `instagram_click`
- `article_view`

Initial GA4 forwarding should prioritize:
`reserve_click`, `line_click`, `price_click`, and `article_cta_click`.

Do not send names, email addresses, phone numbers, form answers, medical information,
health information, member identifiers, or free-text user input.

## Acceptance status

- PASS — `G-Q6ZSSJMEZ2` observed on production
- PASS — GA4 collection requests observed on all six audited pages
- PASS — one `page_view` per audited page
- PASS — duplicate `page_view` not observed
- PENDING — GA4 Realtime UI / Data API read-side confirmation
- PENDING — Admin Analytics connected to the same GA4 property
