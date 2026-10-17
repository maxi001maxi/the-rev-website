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

## Checkpoint: feature saved, CI running

- Runtime candidate committed/pushed: 3c246b8ff2cb18e31b9828ad30add5a5b1ca1ced (tree 42fec2030ae3f2e4649c63e1802f5cc75655ad8f), with both original feature and latest main parents.
- Local: 691-file parity PASS; all 532 navigation checks PASS / JS errors 0 / first-party failures 0; 12 technical browser checks PASS; four full-page pixel comparisons identical; 2,260 references / missing 0.
- GitHub Control Capture Contract 38993763534 and Phase 9 Check 38993763539 PASS. Unified public site QA 38993763530 running.
- Strengthen booking QA to require actual three-menu rendering and fail assertions; permit observed public Gym API GET reads only, still abort all writes, OneSignal and analytics. No runtime change.
- Remaining: CI results, explicit Preview, deployed QA, final evidence/report/PR.

## Preview analytics isolation

The current published GTM resource version 3 has an all-host init rule. Add an identical runtime hostname allowlist to every built public HTML bootstrap (therev-lab.com and www.therev-lab.com only) without modifying source Price HTML, GTM settings or the production event contract. This protects manual Owner Preview review as well as automated QA. Production/Preview bytes still match except robots. Mandatory VM tests cover production, www, localhost, Preview, and suffix-spoofed hostnames; actual Chromium exercises all six Preview-origin pages with zero GTM requests and working local dataLayer.

## Safe collection test diagnostics

The first CI failed the new strict network probe (navigation/build gates passed). Deliberately aborting collection caused a transport retry of page_view, while a fixed 4-second wait missed GA4 custom-event batches. A read-only replay of current public CDN scripts confirmed one initial page_view and delayed POST batches containing reserve_click. The probe now intercepts collection locally with HTTP204 (zero transmission) and waits up to 15 seconds for actual expected batch events. Exact once-per-event assertions remain unchanged; no production/GTM configuration modified to make tests pass.

## Booking probe correction and accepted Preview

- Accepted runtime d6ffcfeb1e2e7ef0d12d2e9dc3236b3a639c7dba: all candidate CI passed, including 532 navigation checks and 20 tag/event checks. One explicit Preview created: dpl_BgedYMG9n63F549j9Vkde9GkrZ65, https://the-rev-website-qao22ebbr-htrmaxi0101-9305s-projects.vercel.app/ . Deployed all-seven-size QA run 38995212728 also succeeded.
- Evidence image inspection found that the booking probe matched the shop intro rather than actual menu controls. Correct the false PASS: redirect/UTM remains PASS, menu UI is not yet PASS. Strengthen the probe to wait for public reserve_master GET data and actual full menu options/controls. No customer data or reservation submission.
- A diagnostic empty POST status lookup to the booking API was rejected by automatic approval review because it could affect external session state. It was not completed; do not retry it or work around the rejection. All ongoing reservation verification remains GET-only, with all POSTs blocked.
- Deployed site runtime is unchanged by this test-only correction; no additional Vercel deployment is required. Existing GTM parameter map and GA4 receipt remain external release holds.

- No synchronize workflow was observed for test-only head 9d48ce5010a38cd3ae2018aaa786fd587944179c. Add the strict booking probe to the explicit deployed Preview QA job as well, with a separate evidence artifact, then bind the already accepted Preview URL via PR edit. No deployment/runtime change.
