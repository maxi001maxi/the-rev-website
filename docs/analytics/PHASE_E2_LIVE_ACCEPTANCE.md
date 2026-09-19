# THE REV. Website Insights — Phase E2 Live Acceptance

Date: 2026-09-19  
Status: PARTIAL PASS / EXTERNAL AUTH + GTM CONFIG PENDING  
Branch: `claude/phase-e2-live-analytics-v1`

## 1. What was implemented

E2 extends the E1 measurement contract without changing the visible design.

### Runtime tracking
- common parameters added to custom events:
  - `event_version`
  - `site_version`
  - `page_path`
  - `page_type`
  - `placement`
  - `destination_type`
- new `section_view`
- new `faq_open`
- Blog reservation CTAs can also emit canonical `reserve_click`
- FAQ buttons now have stable `faq_id` / `faq_topic`
- personal information, health information and form input remain excluded

### Acceptance automation
- `.github/qa/analytics-qa.mjs`
- `.github/workflows/analytics-e2-acceptance.yml`

The workflow performs:
1. branch-local E2 runtime test via localhost
2. current production GTM / GA4 network audit against `https://therev-lab.com`

## 2. Local E2 runtime acceptance

Run: `35434117008`

Result: PASS

Observed dataLayer events:
- `gtm.js`
- `gtm.dom`
- `gtm.load`
- `section_view`
- `faq_open`
- `reserve_click`

Confirmed:
- HTTP 200
- GTM loader requested
- E2 runtime events present
- no outbound booking navigation required for test

## 3. Production GTM / GA4 audit

Run: `35434117008`

Target: `https://therev-lab.com`

Observed:
- HTTP 200
- GTM script request: yes
- GTM container response size: ~332 KB
- Google Tag (`gtag/js`) request: none observed
- GA4 Measurement ID visible in public GTM container response: none
- GA4 `g/collect` request: none
- production dataLayer `reserve_click`: present

Interpretation:
- the website is loading GTM correctly
- website-side `dataLayer` events are firing
- **GA4 forwarding/collection is not currently active through the deployed GTM container**, based on live network behavior

This is stronger than merely checking whether a GTM snippet exists.

## 4. Windsor.ai connection state

At the time of E2 audit:

Connected:
- Instagram

Not yet connected:
- Google Analytics 4
- Google Search Console

Both are OAuth connectors and require the account owner to authorize them once.

Until GA4 is connected, E2 cannot verify:
- GA4 property
- web data stream
- Measurement ID
- historical traffic
- event names actually stored in GA4

Until Search Console is connected, E2 cannot verify:
- Search Console property
- indexed search traffic
- queries / pages / CTR / position

## 5. GTM configuration still required

After the real GA4 Measurement ID is resolved, GTM needs:

1. Google Tag / GA4 base configuration
   - Measurement ID: pending GA4 connection
   - Trigger: All Pages

2. Custom event forwarding
   - custom-event trigger for approved event names
   - GA4 event name should match the dataLayer event
   - map controlled parameters from the E1 registry

Initial event set:
- reserve_click
- line_click
- price_click
- recovery_click
- review_click
- trainer_click
- article_click
- article_cta_click
- related_article_click
- section_view
- faq_open
- approach_click when M1 is finalized

3. Event parameters
- event_version
- site_version
- page_path
- page_type
- placement
- component
- destination_type
- section_id
- faq_id
- faq_topic
- article_slug
- cta_type

4. Key-event policy
- reserve_click may be marked as the primary website intent event
- dashboard wording must remain “Booking Intent / 予約画面クリック”
- it must not be labelled as a confirmed booking

## 6. Preview infrastructure note

Vercel returned:

`Deployment rate limited — retry in 24 hours.`

Therefore E2 did not depend on a new Vercel Preview for acceptance.

Instead:
- branch runtime was tested through a local static HTTP server in GitHub Actions
- external GTM / GA4 behavior was tested against current production

This separates code-runtime verification from external tag verification and avoids treating the Vercel quota as an analytics failure.

## 7. E2 completion gate

E2 can move to COMPLETE only after:

- [x] E2 dataLayer runtime implemented
- [x] section_view runtime accepted
- [x] faq_open runtime accepted
- [x] canonical reserve_click normalization implemented
- [x] production GTM loader verified
- [x] current production GA4 absence verified
- [ ] Windsor GA4 OAuth complete
- [ ] Windsor Search Console OAuth complete
- [ ] GA4 property / stream / Measurement ID identified
- [ ] GTM Google Tag configured
- [ ] GTM custom-event forwarding configured
- [ ] GA4 live network collection confirmed
- [ ] GA4 live event storage confirmed
- [ ] Search Console property/data retrieval confirmed

Current verdict:

**E2 runtime PASS / live analytics collection NOT YET CONNECTED.**
