# REV-EXP-2026-001 Control Capture

Status: IMPLEMENTED / PRODUCTION ACCEPTANCE PENDING  
Treatment: NOT STARTED

## Purpose

Capture the current Control without changing visible copy, design, price, offer, business hours, booking destination or UTM.

## Exposure contract

The canonical surface is `price.html #cat-trial`.

Control Capture deliberately reuses the existing GA4-forwarded `section_view` event instead of creating a new GTM event.

On `price.html`:

- `#cat-trial` has `data-track-section="pricing_trial"`
- exposure fires only when the section reaches at least 25% viewport visibility
- it fires once per page lifecycle
- if IntersectionObserver is unavailable, exposure is not inferred
- the event uses `section_id=pricing_trial`
- controlled HTML/dataLayer metadata records `REV-EXP-2026-001 / control / pricing_trial`
- no customer-provided values or PII are read

There are no other `section_view` emitters on `price.html`.

Therefore:

`Eligible Trial Sessions = GA4 sessions filtered by eventName=section_view + pagePath=/price.html + production host`

`eventCount` is stored separately and is never substituted for sessions.

This removes the need for a new GTM trigger, tag or registered experiment custom dimension. The existing single Google tag and Website Insights forwarding remain unchanged.

## Reserve-click contract

Existing `reserve_click` behavior is unchanged.

For Control Capture, `reserve_click` stored in the experiment daily read model is the diagnostic event count on `/price.html` during the same date window. It remains booking intent, not a confirmed reservation, and is not claimed to be a cohort-linked funnel transition.

## Company OS persistence

The established GA4 Cron calls the experiment capture only after `ga4-direct-read.metadata.control_capture.production_accepted_at` is explicitly recorded.

The private aggregate table:

`company_os_experiment_daily_metrics`

stores:

- experiment_id
- metric_date
- variant
- eligible_sessions
- exposure_event_count
- reserve_click
- reservation_start
- reservation_complete
- trial_show
- trial_to_paid
- data_status
- booking_data_status
- source / timestamps

No customer identifiers or PII are stored.

Today is `DELAYED`. If an otherwise successful complete-day filtered GA4 report has no row, zero is valid for that completed day. Before Production Acceptance, no experiment rows are produced.

GA4 sync omits booking fields and therefore cannot overwrite a future authoritative booking aggregate.

## Gym's

Gym's remains the authoritative confirmed-booking source.

Automatic reservation_start / reservation_complete integration remains unverified. Until a compatible authoritative aggregate exists:

- reservation_start = NULL
- reservation_complete = NULL
- trial_show = NULL
- trial_to_paid = NULL
- booking_data_status = UNKNOWN

`reserve_click != reservation_complete`.

## Capture window

Production Acceptance day is partial and excluded.

Control Capture Day 1 is the next Asia/Tokyo calendar day.

Capture runs for seven complete calendar days. This is an operational comparison window, not a claim of statistical sufficiency.

Treatment remains blocked through the complete Control Capture window.

## Release

Vercel release policy applies.

- automatic Git deployment remains disabled
- use at most one accepted Preview and one Production deployment
- RED budget blocks new non-incident deployment
- READY != accepted
- merge only after Preview Acceptance
- Production truth requires exact SHA + deployment ID + live acceptance

## Validation

Required:

- `npm run test:control-capture`
- Measurement Gate contracts
- GA4 direct-read tests
- Site Insights tests
- Phase E
- release-policy regression
- build

`CONTROL_CAPTURE_ACTIVE` requires actual Production acceptance, GA4 receipt, persisted capture availability and a dated seven-complete-day window.

Until then the verdict is `READY_BUT_DEPLOY_BLOCKED` or `PARTIAL`.

REV-EXP-2026-001 Treatment: **NO**.
