# Phase 9-C | Recovery page owner-review implementation (2026-10-12)

## Scope
- **Draft only**; no production merge or booking changes.
- Owner-facing strategy: Phase 1-E, 9-A, 9-B sourced from Google Drive.
- Edits **only** to `solution.html` and new `assets/css/recovery-9c.css`. Existing TOP PR #213, `index.html`, `price.html`, global CSS, `assets/js/main.js`, GTM, Vercel config and Gyms are untouched.

## Changed
1. Actual OXYROOM photo displayed as product Hero; existing real OXYROOM + lobby photos shown under overview. No P04 AI lifestyle image or invented luxurious pod.
2. Clear H1 "休むために、行く場所がある。" preceded by service category label "奈良・新大宮｜完全予約制の酸素ルーム" and factual product name.
3. Up-front offer: **first use 45min 3,300JPY incl tax, booked in 60min**, with normal 30min 3,300 / 60min 5,500 / 90min 7,700 stated nearby.
4. Corrected duration cards that previously treated normal 30min as "First time". First-time 45min is a separate card.
5. Training membership is not required. Existing customers can choose this as a separate paid service.
6. DENBA photo ALT and caption describe equipment **photo**, not photo taken inside the room.
7. Removed unconditional promise that smartphones are permitted, pending equipment/SOP review.
8. Added a Hero link to the existing public Gyms entry, with `reserve_click` / `recovery_hero` tracking fields, no direct-booking claim. Existing links and schema unchanged.
9. SEO title/description/social text updated with category and factual offer, leaving existing canonical and OGP image unchanged.

## Evidence & review gates
- P01, P03, `photo-oxyroom.webp`, `photo-lobby.webp` are actual asset files in GitHub `main`; imported provenance and Drive video evidence checked in Phase 9-B.
- This PR **does not claim** the photographs were taken within the oxygen room or depict P04. Actual P02 seating-level and P04 visitor usage scene remain unavailable.
- Existing site may contain other statements requiring Owner operational confirmation (reading/music permissions; 1.35ATA current setting; 2-person policy; cancellation terms).
- `/price.html` holds correct first-use 45min conditions and was intentionally NOT changed, preserving the pricing-control experiment boundary.
- Existing Gyms common booking URL is a gateway, not verified Recovery-specific deep-link. Its menu, vacancy, live booking, one-event analytics receipt and cancellation policy require real-page QA.
- No new discount, 5-use 11,000JPY program or medical-therapy benefit claim.
- Page-specific style lives in `assets/css/recovery-9c.css`. Check production browser at **390px + 1440px**, real mobile navigation/header, photos, heading hierarchy, jump links, contrast, image sizing, no horizontal overflow, and no-JS UX.
- Live Gyms booking behavior and Vercel Preview browser screenshots **not yet verified** by this code change alone. Do not merge/deploy without Owner approval.
- GitHub Actions usage budget should be checked before rerunning workflows; avoid unnecessary re-runs.

## Acceptance checklist
- [ ] Owner approves message/copy, pricing, service and actual equipment imagery.
- [ ] Gyms initial 45min and normal pricing shown correctly (view only; **do not create reservations**).
- [ ] Owner confirms official cancellation time: policy is inconsistent between 22:00 and 23:59 in prior materials.
- [ ] Actual room timing/additional setup/pressure & cleaning aligned with booking slots.
- [ ] Browser/mobile Preview visual QA and click-tracking QA.
- [ ] Price-control capture and TOP PR boundary checked before merge.
- [ ] Explicit Owner production go-ahead.

STATUS: DRAFT IMPLEMENTATION — OWNER REVIEW ONLY; NO PRODUCTION RELEASE.
