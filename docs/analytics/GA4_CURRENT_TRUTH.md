# THE REV. GA4 / GTM Current Truth

Updated: 2026-10-07

## Current Measurement Gate status — PASS

Updated acceptance: 2026-10-07 06:29 UTC. **Baseline readiness: YES**; Baseline and REV-EXP-2026-001 have not started.

PR #173 passed Preview acceptance and was merged as `f260ddb9f00b57b59322dff97409f10f99a385a5`. Production `dpl_Csfd5qQvPyGb3vqVj1Q95DWEtrfa` is READY on that runtime SHA. Its genuine Cron returned HTTP 200 and synced 13 rows (9/25..10/7); latest persisted observation is 2026-10-07 06:26:51.055 UTC. `ga4-direct-read` is ACTIVE / last_error NULL through that sync.

Fresh 2026-10-07 six-page audits confirm GTM and GA4 collect on all pages, exactly one page_view per page and zero duplicates. Actual browser P0 clicks were received by GA4 Realtime as reserve_click, line_click, price_click and article_cta_click, one each. Preview Function Invocation details independently confirm application-side unauthenticated Cron rejection (401).

The new writer persists unobserved early events as NULL, today as DELAYED/partial, and complete-day windows through yesterday. Recent seven complete days have 64 period-unique active users; the daily sum of 70 is separately labeled user-days. Incomplete historical windows remain DELAYED/UNKNOWN and do not become complete zero-filled periods. Morning metrics RPC verified these semantics after the Production sync.

Gym's remains UNRESOLVED_C_STYLE_FALLBACK: public menu/date flow and UTM retention rechecked, tenant integration capabilities unverified. reservation_start / reservation_complete remain NULL / UNKNOWN. Website baseline readiness does not establish a booking-conversion baseline. See [dated execution evidence](MEASUREMENT_GATE_2026-10-07.md).

The prior quota-blocked result and the 2026-09-25 acceptance below are historical. Final Company OS timeline evidence supersedes the blocked execution status.

## Production identifiers

- Site: https://therev-lab.com/
- GTM container: `GTM-WFD7R8BT`
- GA4 Measurement ID: `G-Q6ZSSJMEZ2`

The Measurement ID is public configuration, not a secret.

## Verified production state

The site loads `GTM-WFD7R8BT` successfully on the audited public pages.

The Google tag for `G-Q6ZSSJMEZ2` was published in GTM on 2026-09-25.

Historical production acceptance after the 2026-09-25 publish (fresh 2026-10-07 acceptance is above):

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
- PASS — GA4 Realtime Data API received the four tested P0 events; direct-read Production sync succeeded
- Admin Analytics UI was not separately re-audited in this continuation; Production direct-read and Morning metrics RPC use property `552679302`.
