# TOP v2.2 implementation — A / Choice

2026-10-08. Acceptance candidate, not a production release.

## Design authority

Owner-approved direction: A refined preview `THE_REV_TOP_v2_2_A_Refined_Preview.html` and latest in-session feedback. Source documents: `THE_REV_TOP_v2_Design_Reassessment_Brief_2026-10-08`, the v2.1 comparison, Phase 5 Blueprint, Phase 6 Owner facts, Current Truth and CTA map. The later reassessment explicitly reopens the earlier Hero/large portrait/price repetition decisions. Research supports resolving relevant uncertainty; it does not establish a universal shorter-page rule. Preserve the full information sequence. Do not shorten only because of pixel height.

## Integration

The homepage uses `assets/css/top-v22.css` and `assets/js/top-v22.js`. Lower pages retain `style.css`. Existing `main.js` owns all analytics and existing lower-page behavior; the new script only operates tabs, gallery, dialog, and mobile CTA visibility. One GTM container snippet; no new gtag config or manual page_view.

The homepage HTML renders its Hero and all three Trial panels on the server/static file. With JavaScript, tabs select one panel. Without JavaScript, all three remain readable and booking anchors still work. Existing metadata, canonical, JSON-LD and OGP are retained. Fonts use the existing Google Fonts families, not subset fonts embedded into a demonstration file.

Existing images are unchanged: photo-evolgear, photo-oxyroom, photo-lobby, trainer-top. Illustrations are process diagrams, not real customer scenes or clinical evidence. Customer cases are not fabricated. Voice excerpts retain the existing source text meaning.

Header → Hero → Choice → short Method → Voice → Trial → Pricing → small Person → Access → Questions/articles → Final → Footer. Original anchors `service`, `trainer`, `recovery`, `pricing`, `access`, `faq`, `contact` retained. Trainer portrait remains 180px/92px and below Pricing. Initial trial price shown once. Current prices and Owner operational facts retained.

## CTA contract

All reserve anchors: `reserve_click`, destination `https://cl.gyms.jp/t/CC2237480443/`, `utm_source=website`, `utm_medium=referral`, `utm_campaign=trial`, `utm_content` equal to placement. LINE: `line_click`, `https://lin.ee/UXE0bLd`, no invented UTM.

| Event | Placements in this implementation |
|---|---|
| reserve_click | home_header, home_hero, home_trial, home_final, home_footer, home_drawer, home_fixed_cta |
| line_click | home_hero_line, home_trial_guide, home_final, home_footer, home_drawer |
| price_click | home_service_training, home_service_boxing, home_pricing, home_footer, home_fixed_cta |
| trainer_click | home_trainer, home_footer |
| recovery_click | home_service_recovery, home_trial_guide, home_footer |
| access_click | home_access |
| blog_click | home_pricing, home_faq, home_footer |
| instagram_click | home_footer |

`home_trial` and `home_hero_line` were introduced in the prior v2 Draft; they are not claimed to be historical Production measurements. There is no reserve CTA at Pricing in this visual design, so the old `home_pricing` reserve placement is not reused for Trial. Its price links retain price_click. There is no promise of historical placement-level comparability.

`event_version=e1_v1` retained; homepage `site_version=top_v2_2` distinguishes the layout. Section views: service, voice, trial, pricing, trainer, access, faq, final_cta. Price page experiment selector and payload unchanged. Native Trial detail opening sends faq_open with controlled IDs `home_trial_training_details`, `home_trial_boxing_details`, `home_trial_recovery_details`; topics trial/trial/recovery. No free text or health information is sent.

The mobile fixed bar preserves Pricing and Reserve actions, hides while Hero is visible, while Final/Footer are visible, or while Menu is open. Bottom space and safe-area padding prevent covering final content. Booking/LINE open a new tab with external notice; internal links remain same-tab.

## Acceptance boundary

Local real-browser checks use production HTML/JS on an intercepted local origin. Third-party network is blocked to avoid polluting GA4. Cached matching fonts are supplied only by the QA runner. Verify one dataLayer event per tracked link, UTM values, tabs, native FAQ, menu/Escape, mobile fixed visibility, full screenshots at 1440/390, and no-JS content. This is not proof of GA4 receipt.

GTM workspace/GA4 parameter mapping is not modified. Booking completion remains CLICK-OUT ONLY. Production forwarding and completed bookings cannot be inferred from click dataLayer tests.

## Release

Update Draft PR #192 on top of current main, preserving the prior Recovery wording corrections. Preview only after CI PASS, within Vercel release budget. No main merge, Xserver publish or Production deploy in this task. REV-EXP-2026-001 release boundary and final Owner price/staff/assets checks remain before production release.
