# THE REV. GTM → GA4 implementation specification

Updated: 2026-09-25

## Fixed identifiers

- Production site: `https://therev-lab.com/`
- GTM container: `GTM-WFD7R8BT`
- GA4 Measurement ID: `G-Q6ZSSJMEZ2`

This document defines the minimal GTM configuration needed to restore GA4 collection without adding a second direct `gtag.js` implementation to the website.

## 1. Base Google tag

Create exactly one active base tag in `GTM-WFD7R8BT`.

- Tag type: **Google tag**
- Tag ID: `G-Q6ZSSJMEZ2`
- Trigger: **All Pages**
- User-provided data: **OFF / not configured**
- Advertising personalization or Ads destinations: **do not enable as part of this task**

The base tag should be the only GA4 base configuration for this Measurement ID.

Expected result:
- normal page load sends one `page_view`
- no duplicate `page_view`

## 2. Existing website event source

The site already pushes controlled events into `window.dataLayer`.

High-priority business events:

| dataLayer event | Business meaning | Initial GA4 priority |
|---|---|---|
| `reserve_click` | Booking Intent / reservation page opened | P0 |
| `line_click` | LINE contact intent | P0 |
| `price_click` | Price consideration | P0 |
| `article_cta_click` | Article next action | P0 |
| `map_click` | Access / map intent | P1 |
| `recovery_click` | Recovery interest | P1 |
| `trainer_click` | Trainer interest | P1 |
| `review_click` | Review / proof interest | P1 |
| `section_view` | Key home section reached | P1 |
| `faq_open` | FAQ barrier/interest | P1 |
| `article_view` | Blog article viewed | P1 |
| `article_click` | Blog index → article | P2 |
| `related_article_click` | Related content continuation | P2 |
| `instagram_click` | Instagram outbound | P2 |

Only `reserve_click` should be considered the primary website intent event initially.
It is **not** a confirmed reservation.

## 3. GTM variables

Use Data Layer Variable Version 2.

Create only the variables needed by the event parameter map.

- `DLV - event_version` → `event_version`
- `DLV - site_version` → `site_version`
- `DLV - page_path` → `page_path`
- `DLV - page_type` → `page_type`
- `DLV - placement` → `placement`
- `DLV - component` → `component`
- `DLV - destination_type` → `destination_type`
- `DLV - article_slug` → `article_slug`
- `DLV - cta_type` → `cta_type`
- `DLV - section_id` → `section_id`
- `DLV - faq_id` → `faq_id`
- `DLV - faq_topic` → `faq_topic`

Do not create variables for:
- name
- email
- phone
- member id
- LINE user id
- health condition
- injury/medical information
- body-composition values
- free-text form answers

## 4. Initial custom-event trigger

Create one Custom Event trigger for the approved website events.

Recommended name:
`CE - THE REV Website Insights`

Regex:

```
^(reserve_click|line_click|price_click|article_cta_click|map_click|recovery_click|trainer_click|review_click|section_view|faq_open|article_view|article_click|related_article_click|instagram_click)$
```

Use regex matching on the custom event name.

## 5. GA4 event forwarding tag

Create one GA4 event forwarding tag.

Recommended name:
`GA4 - Website Insights - {{Event}}`

- Destination / Measurement ID: `G-Q6ZSSJMEZ2`
- Event name: built-in `{{Event}}`
- Trigger: `CE - THE REV Website Insights`

Map these controlled event parameters when available:

- `event_version` → `{{DLV - event_version}}`
- `site_version` → `{{DLV - site_version}}`
- `page_path` → `{{DLV - page_path}}`
- `page_type` → `{{DLV - page_type}}`
- `placement` → `{{DLV - placement}}`
- `component` → `{{DLV - component}}`
- `destination_type` → `{{DLV - destination_type}}`
- `article_slug` → `{{DLV - article_slug}}`
- `cta_type` → `{{DLV - cta_type}}`
- `section_id` → `{{DLV - section_id}}`
- `faq_id` → `{{DLV - faq_id}}`
- `faq_topic` → `{{DLV - faq_topic}}`

Do not map `link_text` or arbitrary free text into GA4 at the first release. The controlled dimensions above are sufficient for the Admin dashboard and reduce accidental high-cardinality / PII risk.

## 6. Preview acceptance before Publish

In GTM Preview / Tag Assistant, verify:

1. Google tag fires exactly once on page initialization.
2. `reserve_click` dataLayer event fires the GA4 forwarding tag exactly once.
3. `line_click` fires exactly once.
4. `price_click` fires exactly once.
5. `section_view` and `faq_open` appear when the relevant interaction occurs.
6. No form field value or personal/health information appears in event parameters.
7. There is no second GA4 base tag using `G-Q6ZSSJMEZ2`.

## 7. Publish acceptance

After GTM Publish, the repository's automated production audit must show:

- `expectedMeasurementIdPresent: true`
- `expectedMeasurementIdObserved: true`
- production pages with GA4 collection > 0

Then verify in GA4 Realtime:

- `page_view`
- `reserve_click`
- `line_click`

The GA4 UI message saying data collection is inactive can lag behind realtime collection. Realtime network/Realtime report is the immediate acceptance source.

## 8. Key event policy

After live receipt is confirmed:

- mark `reserve_click` as a key event if desired
- label it in THE REV. Admin as **予約画面クリック / Booking Intent**
- never label it **予約完了**

A confirmed booking requires authoritative booking-system data.
