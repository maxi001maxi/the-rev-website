# THE REV. Website Insights — Phase E1 Measurement Audit & Event Design v1.0

Date: 2026-09-19  
Status: DESIGN LOCK / IMPLEMENTATION NOT STARTED  
Scope: therev-lab.com public site + Editorial Console analytics foundation

## 1. Purpose

Phase E1 defines what THE REV. should measure before building the Analytics UI.

The goal is not a vanity dashboard. The measurement system must answer:

1. Where did the visitor come from?
2. Which page or article did they land on?
3. What did they actually engage with?
4. Did they move into consideration?
5. Did they show contact or booking intent?
6. Where did the journey stop?
7. Did a site/marketing change improve the next-step rate?

Primary business funnel:

```
Acquisition
→ Landing
→ Self relevance / trust
→ Service or content interest
→ Price / trial consideration
→ LINE or booking intent
→ Confirmed trial booking
→ Trial attended
→ Membership
```

Important: the website can currently observe only through **booking intent**. A click to the external GYM'S booking page is not a confirmed booking.

---

## 2. Current implementation audit

### 2.1 Tag foundation

Confirmed in repository:

- Google Tag Manager container: `GTM-WFD7R8BT`
- GTM code is embedded in public pages.
- `assets/js/main.js` listens to clicks on `a[data-track]`.
- Each tracked click pushes to `window.dataLayer`:
  - `event`
  - `placement`
  - `link_url`
  - `link_text`
  - `page_path`
  - any additional `data-*` fields, automatically converted to snake_case
- The implementation explicitly avoids sending form input, health information, or personal information.

Not verified in E1:

- Whether the GTM container currently contains an active GA4 Configuration / Google Tag.
- Which GA4 property / web stream is connected.
- Whether custom dataLayer events are currently forwarded from GTM to GA4.
- Whether GA4 Enhanced Measurement is enabled.
- Whether Search Console is associated with the GA4 property.

Windsor.ai connector audit at E1:

- Connected: Instagram
- Not connected: Google Analytics 4
- Not connected: Google Search Console

Therefore **no live GA4/Search Console numbers are treated as verified in E1**.

### 2.2 Existing custom events on main

Current event names found in the site/build system:

| Event | Meaning | E1 decision |
|---|---|---|
| `reserve_click` | click to external GYM'S reservation flow | KEEP — primary booking-intent event |
| `line_click` | click to official LINE | KEEP — secondary high-intent event |
| `instagram_click` | click to Instagram | KEEP — outbound social event |
| `price_click` | click into price information | KEEP — consideration event |
| `recovery_click` | click into Recovery detail | KEEP — service-interest event |
| `review_click` | click to Google reviews | KEEP — proof-interest event |
| `trainer_click` | click to Trainer detail | KEEP — trust-interest event |
| `article_click` | blog-index → article click | KEEP |
| `article_cta_click` | article-bottom CTA click | KEEP, but normalize conversion mapping |
| `related_article_click` | related-article click | KEEP, enrich parameters |

Provisional M1 branch adds:

- `approach_click` — Hero → How We Work anchor

Decision: KEEP when M1 is finalized. Do not merge E1 into M1; only record the schema here.

---

## 3. Audit findings / gaps

### P0 — Must fix before Analytics dashboard is trusted

#### A. GA4 collection itself is not verified

GTM being present is not proof that GA4 data is being collected correctly. E2 must verify the GA4 property, stream, Google Tag, and every custom-event trigger.

#### B. Booking click is not booking conversion

`reserve_click` means “the visitor opened GYM'S”. It must never be displayed as:
- reservation completed
- trial booked
- conversion completed

Dashboard label:
**予約画面クリック / Booking Intent**

Confirmed trial bookings require booking-system data or another authoritative source.

#### C. Blog booking intent can be undercounted

Article secondary CTAs use `article_cta_click` even when the destination is GYM'S.

For the canonical booking-intent KPI, every click whose destination is the external booking flow must also be classifiable as `reserve_click` or carry a normalized `destination_type=reserve`.

E2 implementation choice:
- preferred: retain `article_cta_click` for content analysis and additionally emit `reserve_click` for reservation destinations
- dashboard counts `reserve_click` only for canonical booking intent

#### D. No visibility funnel

Current implementation primarily measures clicks. It cannot tell whether a user:
- reached Starting Point
- reached How We Work
- reached Voice
- reached Trial/Pricing
- reached FAQ/Access

Add generic `section_view` instead of creating dozens of one-off event names.

#### E. No experiment/version dimension

Marketing Optimization M1/M2/M3 cannot be evaluated reliably if events do not identify the site/experiment version.

Add common parameter:
`site_version`

Examples:
- `pre_m1`
- `m1_provisional`
- `m1_final`
- `m2_trial`

### P1 — Important

#### F. FAQ intent is invisible

Opening a FAQ often reveals a purchase barrier. Add `faq_open`.

Never send the answer text. Send a stable `faq_id` and optionally a short controlled `faq_topic`.

#### G. Related-article event lacks enough context

`related_article_click` should include:
- `source_article_slug`
- `target_article_slug`

#### H. Footer duplicates are hard to distinguish

Some pages contain multiple LINE / Instagram links with the same `placement` such as `home_footer`.

Add `component` or `element_id` so the dashboard can distinguish:
- footer_contact
- footer_legal
- drawer_social
- fixed_cta

#### I. Internal navigation is mostly invisible

Header/drawer navigation to Price, FAQ, Access, Blog etc. is not consistently tracked.

Do not track every decorative link. Add `nav_click` only for meaningful site navigation, with:
- `nav_location`
- `target_section` or `target_page`

### P2 — Useful later

- `scroll_depth` 25/50/75/90 can be added if section-view data is insufficient.
- Access/map interaction can be added if a meaningful directions/map CTA exists.
- Phone click is not currently applicable because no `tel:` link was found.

---

## 4. Canonical event architecture v1

### 4.1 Primary funnel events

| Stage | Event | Priority | Meaning |
|---|---|---:|---|
| Landing | GA4 `page_view` | P0 | page loaded |
| Self relevance / trust | `section_view` | P0 | key content section reached |
| Exploration | existing interest click events | P0 | service/proof/price/trainer/article interest |
| Contact intent | `line_click` | P0 | official LINE opened |
| Booking intent | `reserve_click` | P0 | external booking flow opened |
| Confirmed booking | future authoritative event | Future | actual GYM'S booking completed |
| Trial attended | future Management/booking data | Future | attended trial |
| Membership | future Management data | Future | membership conversion |

### 4.2 New events approved in E1

#### `section_view`

Fire once per page view per section when the section meaningfully enters the viewport.

Required:
- `section_id`
- `page_path`
- `page_type`
- `site_version`

Initial home section ids:
- `trust`
- `starting_point` (after M1)
- `approach` (after M1)
- `service`
- `voice`
- `trainer`
- `recovery`
- `trial`
- `pricing`
- `faq`
- `access`
- `final_cta`

Do not fire repeatedly while scrolling back and forth.

#### `faq_open`

Required:
- `faq_id`
- `faq_topic`
- `page_path`
- `site_version`

Example topics:
- beginner
- intensity
- sales_pressure
- pricing
- recovery
- booking

#### `nav_click`

Required:
- `nav_location`: header / drawer / footer / in_page
- `target_type`: page / section
- `target_id`
- `page_path`
- `site_version`

Use only for decision-relevant navigation.

---

## 5. Common event parameters

All custom events should converge on this schema.

| Parameter | Required | Example | Rule |
|---|---:|---|---|
| `event_version` | yes | `e1_v1` | schema version |
| `site_version` | yes | `m1_final` | marketing/site version |
| `page_path` | yes | `/price.html` | pathname only; never full query string |
| `page_type` | yes | `home` | normalized page family |
| `placement` | clicks | `home_hero` | current placement convention |
| `component` | recommended | `hero_primary_cta` | stable UI component id |
| `destination_type` | outbound/CTA | `reserve` | reserve / line / instagram / internal |
| `article_slug` | article events | `personal-training-frequency` | stable content id |
| `cta_type` | article CTA | `personal-training` | existing article dimension |
| `link_url` | clicks | controlled | no personal data |
| `link_text` | clicks | controlled | static controlled text only |

Normalized `page_type`:

- home
- price
- trainer
- recovery
- blog_index
- blog_article
- legal
- privacy
- terms
- not_found

---

## 6. KPI registry v1

### North-star website proxy

**Booking Intent Sessions**

Definition:
sessions containing >= 1 `reserve_click`

Never label this “bookings”.

### Core KPIs

#### 1. Booking Intent Rate
sessions with `reserve_click` / total sessions

Break down by:
- landing page
- source / medium
- device category
- page type
- site_version

#### 2. LINE Intent Rate
sessions with `line_click` / total sessions

#### 3. Consideration Rate
sessions containing any of:
- `price_click`
- `trainer_click`
- `recovery_click`
- `review_click`
- `article_cta_click`

divided by sessions.

#### 4. Home → Pricing Reach
sessions with `section_view(section_id=pricing)` / home sessions

#### 5. Home → Booking Intent
home sessions with `reserve_click` / home sessions

#### 6. Article → Next Action Rate
article sessions with any meaningful CTA / article sessions

Meaningful CTA:
- article_cta_click
- reserve_click
- line_click
- price_click / recovery_click where applicable

#### 7. Article → Booking Intent
article sessions with `reserve_click` / article sessions

#### 8. Search CTR
Search Console clicks / impressions

This is a Search Console metric and must not be confused with website CTA CTR.

#### 9. Organic Landing → Booking Intent
organic-search sessions with `reserve_click` / organic-search sessions

#### 10. M1 impact
Compare `pre_m1` vs `m1_final` for:
- booking intent rate
- price consideration rate
- approach reach/click rate
- trainer interest rate
- section progression

Use comparable date windows and annotate major campaigns/holidays before attributing causality.

---

## 7. M1 measurement contract

When M1 is finalized:

### Existing / provisional
- `approach_click`
  - placement: `home_hero`
  - destination_type: `internal`
  - target_id: `approach`

### Required section views
- starting_point
- approach
- service
- voice
- trainer
- trial
- pricing
- faq
- access

This allows the M1 hypothesis to be tested as:

```
Home page view
→ Starting Point reached
→ How We Work reached
→ Service reached
→ Pricing/Trial reached
→ reserve_click / line_click
```

Without section views, M1 can only measure a small subset of the intended behavior.

---

## 8. Privacy / data governance guardrails

Do not send to GA4 / GTM:

- name
- email
- phone
- LINE user id
- booking member id
- health condition
- injury / medical information
- body-composition values
- free-form form answers
- URL/query parameters that can contain identifiers

The current code already uses `window.location.pathname` rather than the full current URL for `page_path`, which should be retained.

The current public privacy policy includes service-quality improvement / analysis as a use purpose, but E1 found no explicit repository implementation for analytics consent mode and no specific public-site disclosure for cookies / Google Analytics / analytics providers. Before production analytics is expanded, this should be reviewed and the public privacy disclosure updated if required.

This document does not make a legal determination; privacy/cookie requirements should receive appropriate legal review.

---

## 9. GA4 configuration decisions for E2

Once GA4 is connected and verified:

### Candidate key events

Primary:
- `reserve_click` — label in dashboard as Booking Intent

Secondary:
- `line_click`

Do **not** mark these as:
- purchase
- booking completed
- membership conversion

until authoritative downstream data is joined.

### Custom dimensions likely required

Event-scoped:
- placement
- component
- page_type
- site_version
- section_id
- article_slug
- cta_type
- faq_topic
- destination_type

Keep the number small. High-cardinality free text is prohibited.

---

## 10. E1 acceptance result

### PASS
- GTM container code exists.
- A generic dataLayer click architecture exists.
- Core CTA locations already contain extensive `data-track` coverage.
- Blog content has article-level slug metadata.
- Existing architecture can be extended without a tracking rewrite.

### GAPS RECORDED
- GA4 property/stream/tag not verified.
- Search Console not connected for data access.
- GA4 and Search Console not connected to Windsor.ai.
- no section-view funnel.
- no FAQ-open measurement.
- no site_version / experiment dimension.
- blog reservation CTA normalization needed.
- confirmed booking is not measurable from current website events.
- analytics/privacy disclosure and consent mode require review before expansion.

## 11. Phase status

**Phase E1 — COMPLETE**

Next implementation phase:
**Phase E2 — GA4 / Search Console connection, GTM verification, and live event acceptance.**
