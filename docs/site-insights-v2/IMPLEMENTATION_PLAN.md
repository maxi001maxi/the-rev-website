# Site Insights v2 — Gate 2 Implementation Plan

Updated: 2026-09-29. Gate 1 creates only these design documents. Begin Gate 2 only after its own authorization; keep the current Admin and public site stable. Work on a feature branch and review before merging/deploying. The file paths below are proposed implementation targets, not created code.

## Sequence and acceptance

| Phase | Proposed files | Objective / dependency | Acceptance gate |
|---|---|---|---|
| A — provider readiness | `lib/siteInsights/providers/{search,ga4,blended,annotations}.mjs`, `lib/siteInsights/normalize.mjs`, `.env.example` | Verify Wizard read-only API contract and secure server-side key route; reuse GA4 service account where configured. Depends on documented upstream access. | Real authorized reads for date/query/page, GA4 summary/events and blended; strict typed normalization, source/timezone/freshness; unsupported dimension UNKNOWN. No secret in Git or logs. |
| B — canonical API | `api/admin/site-insights.mjs`, `lib/siteInsights/{assemble,status,cache}.mjs`, `admin/js/admin-api.mjs` | Build authenticated, bounded 7/28/90 endpoint on Phase A. Use legacy Admin Auth; do not change `/api/admin/analytics.mjs`. | JSON matches `DATA_CONTRACT.md`; six KPI statuses; exact periods; partial provider failure does not erase healthy sources; cache deduplicates widgets. |
| C — status shell | `admin/site-insights/index.html`, `admin/js/site-insights.mjs`, `admin/css/site-insights.css` | First layer status and KPI, responsive layout. Depends on B. | 3–5-second recognition, clear data status; zero/error/delay/stale shown distinctly; keyboard and mobile access; no existing navigation regression. |
| D — trend and day drilldown | same view modules, `lib/siteInsights/assemble.mjs` | Aligned, source-labeled trends and one-day evidence panel. Depends on B/C and GA4 daily series. | 7/28/90 dates align; no mixed-unit deception; clickable, keyboard-accessible day; per-date completeness and query/page/source/event rows accurate. |
| E — detail sections | `admin/site-insights/*` and view modules; provider pagination | Search, Content, Funnel, Technical details. Depends on A–D. | Search total independent of query top-N; viewed vs landing page distinction; cross-source funnel disclaimers; unsupported article CTA attribution UNKNOWN; pagination and filters bounded. |
| F — deterministic insights | `lib/siteInsights/rules.mjs`, `lib/siteInsights/anomalies.mjs` | Status header, What Changed, anomaly markers with evidence. Depends on complete comparison in B/D/E. | Threshold fixture tests including 1→3 suppression; no rule emitted on delayed/error data; every claim has rule ID, input and confidence. |
| G — QA and security | `scripts/test-site-insights-v2.mjs`, `.github/qa/*` as needed | Contract, live source, auth, browser and regression QA. Depends on A–F. | 401/role checks, SSRF/query bounds, no key in client/build/logs, source totals sampled, no duplicate API fanout, desktop/mobile/keyboard, legacy Admin/editorial checks pass. |
| H — production readiness | existing deploy workflow config only if necessary, release notes | Stage, inspect evidence, then controlled deployment. Depends on G. | Secrets installed server-side via host, health/readiness real, rollback version recorded, production smoke test and data-state checks; review deployment separately. |

## Decisions fixed for Gate 2

- Default period 28 **settled GSC dates**, options 7/28/90; previous adjacent N dates. Realtime is separate. GSC `settledThrough` anchors data range; compare only like-for-like complete periods.
- Top six KPI: GSC clicks, GA4 sessions, active users, page views, reserve clicks, LINE clicks. No confirmed reservation, revenue, query-to-CTA attribution or guessed blog CTA attribution.
- GSC CTR normalized percentage points → fraction; GA4 rates already fraction. Preserve source statuses instead of legacy zero coercion.
- One authenticated canonical endpoint and replaceable providers. `GSC_WIZARD_API_KEY` is server-only; existing `GA4_PROPERTY_ID` and `GA4_SERVICE_ACCOUNT_JSON` are reused when possible. No new GA4 base tag or website measurement changes.
- TTLs, day anomaly floors, insight thresholds and evidence behavior are in `API_PROVIDER_SPEC.md` and `INSIGHT_RULES.md`.

## Gate 2 quality cases

1. Fixture values: successful zero, missing field, permission error, missing configuration, stale snapshot and unsettled date all render different states.
2. GSC 28 days sum to source aggregate; query top-N does not substitute for total. GA4 daily user counts do not sum to period users.
3. GSC 2% CTR and GA4 0.35 engagement rate display 2% and 35%; position weighted by impressions; no 0/0 CTR.
4. Four P0 event names map to accurate labels; `reserve_click` never “予約完了”. Repeat clicks are event counts, not people.
5. Page view and landing page keys are not mixed; event-filtered sessions never act as full traffic denominator; blended GSC-only page preserved even with GA4 zero sessions.
6. Broken Wizard while GA4 healthy gives PARTIAL, and reverse scenario too; cache health visible. Incomplete 90-day history has coverage explanation.
7. Same authenticated session used by the existing Admin; unauthorized request cannot read aggregates. No secret appears in client response, static bundle, GitHub, logs or screenshot evidence.
8. Existing `/admin/analytics/`, article review/publish workflow, base GA4 page_view and public CTA measurement are regression checked. No GTM changes in Gate 2 unless a separately scoped measurement need is approved.

## Remaining implementation prerequisite

Confirm the production-capable GSC Wizard read-only API's endpoint and limits from its official specification, and install its existing key securely on the server only when Phase A starts. The connected MCP read path confirms data availability but does not itself establish how Vercel Functions authenticate to Wizard. If Wizard cannot supply the needed typed rows, select the already authorized official GSC/GA4 read path without changing the Admin contract. This is a technical verification step, not a product decision or a reason to expose the key.
