# Technical recovery checkpoint — 2026-10-17

Scope: PR #254 / feature/unified-v7-header-20261015. No merge to main, production deployment, Xserver application, GTM publication, GA4 configuration changes, or real booking submission authorized.

## Baseline and continuity

- Feature start: 7d8f093e6eca3d7bfe69166c16465c6d5abe168a.
- Main fetched: 03b4273c7112f0230dbe81064942947bbdd77aaa. Its independent editorial/workflow changes merged cleanly into the isolated feature worktree; no unrelated files overwritten.
- Live production HTML fetched read-only with curl (JavaScript never executed). It still has one GTM bootstrap, HealthClub JSON-LD and seven attributed booking links.
- Correct previous QA record: its claim that TOP/Recovery UTM had been retained was inaccurate. The browser navigation checks did not validate analytics attribution.

## Findings and fixes in progress

1. Native v7/v8 HTML migration omitted GTM bootstrap/noscript, HealthClub schema and booking UTM. Restore the existing container only, no direct gtag installation and no consent/config changes.
2. Four Recovery body/sticky booking anchors lacked data-track/data-placement. Restore controlled placements and UTM matching each placement; old Recovery used the same recovery_page UTM for multiple different placements.
3. v7 trial lacked section tracking; several legacy IDs are zero-height aliases. Observe actual content containers without changing appearance.
4. Generic index.html classification misclassified blog index/article URLs as home. Normalize only for page classification; preserve actual page_path.
5. TOP skip link stayed offscreen on keyboard focus. Restore focus-only visibility.
6. Retain verified business facts; omit old priceRange rather than inheriting its ambiguous range. Name, address, split opening hours, company, phone and social URL cross-checked against published access/legal/current copy. No ratings or medical claims added.

## Verification boundaries

- Existing event names and e1_v1 contract retained. reserve_click means booking intent, never booking completion.
- Price HTML and Company OS read-side code must remain byte-identical to feature baseline. REV-EXP-2026-001 control exposure remains 25%, once, /price.html, no treatment launch.
- Browser QA must abort analytics collection before transmission. Code, dataLayer, GTM/Google tag download, constructed collection request, transmitted request and GA4 receipt are separate evidence fields. GA4 receipt is UNVERIFIED unless independently confirmed safely.
- Remaining: regression tests, production/preview parity, desktop/mobile browser & visual equivalence, safe booking redirects, commit/push, CI, one explicit Preview after gates, Draft PR update and final report.
