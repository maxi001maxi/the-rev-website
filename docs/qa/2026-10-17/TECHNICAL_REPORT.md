# TOP v7 / Recovery v8 technical regression recovery

2026-10-17 — PR #254. Status: local contracts and 532 browser navigation checks passed; CI and final Preview pending. Production release is not authorized.

## Findings and classification

| Function | Latest live/old main | Native v7/v8 baseline | Recovery |
|---|---|---|---|
| GTM-WFD7R8BT | One bootstrap + noscript, published Google tag G-Q6ZSSJMEZ2 | Missing on both pages | Restore exact existing snippets; no direct gtag or GTM/GA4 configuration change |
| Consent | Existing GTM-managed setup; no site-side new consent policy | Bootstrap omitted | Preserve existing policy; no invented consent setting |
| HealthClub JSON-LD | Name/address/split hours/social/company/reservation; ambiguous priceRange | Missing on both | Verified facts restored; omit priceRange, no ratings/unverified medical claims |
| Booking attribution | TOP per-placement; old Recovery used generic recovery_page | Four UTM fields missing from 14 anchors; four Recovery anchors also lacked event attributes | source=website, medium=referral, campaign=trial, content=data-placement |
| section_view | Legacy actual sections | Trial unobserved, some alias targets have zero height | Prefer explicit actual content surfaces; same IDs/events, once |
| page_type | Generic index.html rule also misclassifies blog | Same latent bug | Normalize index suffix only for classification; actual page_path unchanged |
| Keyboard skip | Legacy keyboard entry | TOP link never became visible | Focus-only visibility and focusable main; resting design unchanged |
| Native build | Previously preview injection | Already moved to normal HTML before this audit | Retain native rendering; both build environments tested |

Approved removal/rearrangement of legacy trust/empathy/fixed TOP surfaces is a design decision. Do not fabricate exposures for absent surfaces. Existing internal header links were not tracked in the old header either; no new event taxonomy introduced. Instagram/reviews/LINE destinations remain available in approved page/footer layouts.

## Files and contracts

- `index.html`, `solution.html`: invisible bootstrap, JSON-LD, social metadata, booking attribution, tracking surfaces, main focus target.
- `assets/js/main.js`: correct blog classification, actual section targets, analytics initialization idempotence.
- `assets/css/unified-header-v7.css`: keyboard-focus-only skip link.
- `scripts/test-technical-site.mjs`: mandatory source/built HTML regression contracts.
- `scripts/qa-technical-site.mjs`: actual Chromium events, exposure, keyboard, safe tag execution and pixel equivalence evidence.
- `scripts/qa-booking-site.mjs`: official booking GET/redirect observation; all writes/analytics blocked.
- `package.json`, `.github/workflows/unified-site-qa.yml`: build-time and CI gates.
- [All 14 booking anchors](TECHNICAL_CTA_MAP.csv).

`price.html`, `lib/ga4CompanyOsSync.mjs`, and `lib/ga4ExperimentCapture.mjs` are byte-identical to feature start. Price non-trial buttons intentionally retain the existing `pricing_page` attribution; `pricing_trial` remains exact. REV-EXP-2026-001 remains control / not a treatment launch. An eventual redesign release must be annotated in experiment analysis; before/after attribution cannot isolate the Price treatment from a whole-site release. No experiment/metric definition changed. Booking completion remains UNKNOWN, never inferred from reserve_click.

## Local evidence

- Production/Preview: 691 published files, identical after only robots meta normalization; robots.txt intentionally differs. Production indexable, Preview noindex/nofollow.
- Technical source and built contracts PASS. GTM appears once; HealthClub parses once per page; 14 booking URLs match placement; title/description/canonical/OG metadata retained/restored.
- Actual Chromium: 12 technical checks PASS. All TOP/Recovery/Price booking event attributes, line_click, price_click, article_cta_click + intentional reserve_click, home section_view, Price control exposure, keyboard skip.
- TOP + Recovery × PC1440/mobile390 full-page screenshots: all four before/after PNG buffers identical. Visible copy/assets/spacing/layout preserved.
- Existing Phase E, GA4 Direct Read, Control Capture, Site Insights (14), GSC production, Vercel policy contracts PASS. Phase 9 (164) and Phase D (75) PASS; existing full CI Phase 9 Check and Control Capture Contract also PASS.
- GA4 transmission intentionally blocked before network; no test sessions intentionally delivered to production GA4. Local browser CDN connection returned ERR_EMPTY_RESPONSE. Curl retrieved published GTM JavaScript read-only and verified the existing measurement ID. These are distinct checks; actual browser tag execution/collection construction need CI evidence.
- 2,260 internal HTML/asset references checked in the current build: missing 0. Image/font assets unchanged; no performance field benchmark claimed.
- Official booking entry returned HTTP200 with JavaScript redirect retaining all four UTM values. Local external browser network failed; real redirect browser verification pending CI. No customer data submitted or booking made.

## Reproduce and resume

1. `npm ci`
2. `npm run test:build-parity`
3. `VERCEL_ENV=production npm run vercel-build`
4. `npm run test:technical-site && npm run test:control-capture && npm run test:ga4-direct && npm run test:phase-e`
5. `npm run test:public-site-browser && npm run test:technical-browser`
6. `node scripts/qa-booking-site.mjs`

Output: `qa-out/` JSON/logs/screenshots (CI artifact retained 14 days). Baseline screenshot comparison additionally requires the pre-edit HTML under `qa-out/technical/baseline/`. All analytics collection is blocked in the technical QA; local files are fulfilled under the production origin, never fetched from production.

## Release boundary / remaining work

- GA4 real receipt: **UNVERIFIED**, because no test data is transmitted. Company OS compatibility is contract/code verification, not proof of new live receipt.
- Google Rich Results Test / Schema Markup Validator hosted UI: not yet submitted. JSON syntax, HealthClub type/properties, required name/address and split hours validated against official documentation; no rich-result guarantee.
- Actual Safari/iPhone/Windows-specific environments not covered by Chromium viewports.
- Pending: final CI, one accepted explicit Preview, Draft PR evidence update, Owner review. No main merge, production deployment or Xserver changes.

References: [Google LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business), [Schema.org HealthClub](https://schema.org/HealthClub), repository `docs/analytics/GA4_CURRENT_TRUTH.md`, `docs/analytics/GTM_GA4_IMPLEMENTATION.md`, `docs/company-os/GA4_DIRECT_READ_V1.md`, `docs/analytics/REV_EXP_2026_001_CONTROL_CAPTURE.md`, and Company OS `KNOWLEDGE_ARCHITECTURE_V1` / `REV_EXP_2026_001_TREATMENT_DESIGN_V1`.
