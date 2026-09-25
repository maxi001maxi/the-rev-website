# THE REV. GA4 / GTM Current Truth

Updated: 2026-09-25

## Production identifiers

- Site: https://therev-lab.com/
- GTM container: `GTM-WFD7R8BT`
- GA4 Measurement ID: `G-Q6ZSSJMEZ2`

The Measurement ID is public configuration, not a secret.

## Verified production state

The site loads `GTM-WFD7R8BT` successfully on the audited public pages.

However, the currently published GTM container does not expose or load
`G-Q6ZSSJMEZ2`, and the audited pages do not issue GA4 collection requests.

Therefore the current break is:

```
therev-lab.com
  ↓ PASS
GTM-WFD7R8BT
  ↓ MISSING
Google tag / G-Q6ZSSJMEZ2
  ↓
GA4
```

## Required GTM base tag

Create or repair one Google tag inside `GTM-WFD7R8BT`:

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

## Acceptance gate

PASS only when all are true:

1. `G-Q6ZSSJMEZ2` is observed on production.
2. GA4 collection requests are observed from the audited pages.
3. GA4 Realtime receives `page_view`.
4. No duplicate page_view collection occurs.
5. The same GA4 property is used by Admin Analytics.
