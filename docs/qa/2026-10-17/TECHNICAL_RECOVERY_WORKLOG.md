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

## Complete-tree restoration checkpoint

Test-only commits 9d48ce5 and 043afe9 temporarily had incomplete trees because a transient base-tree value was missing. No main, production or accepted Preview change occurred. Commit bfd775965a49c2714bfbaea9d60284f0b3543ec6 restored from the literal accepted full tree 71e6cff932ad58448b08c7495540ee606ef004bc and applied the three intended QA/document changes. New full tree fbe0d48ac686695e1df41c74448259e6d65c27b6 exactly matches the complete local tree. PR restored to 276 changed files / mergeable true. Do not create a Git tree without an explicit verified base SHA and exact local/remote tree-hash assertion. Latest CI: 38996083580 / 38996083571 / 38996083586.

## Focus occlusion correction

An additional actual-browser hit test proved the Recovery skip link was behind the fixed header (elementFromPoint returned the logo rather than the focused link). Raise only focused TOP/Recovery skip links above the header, and assert the hit-test result in browser QA. Resting layout is unchanged. This is a code-caused QA defect, so after all gates pass one corrective Preview acceptance is justified under the release policy; no production action. Evidence: qa-out/technical/recovery-skip-before.png.

## Final authorized-work boundary

Latest runtime bd3f219a7653bd77f1a6f27c5b1efa7bafb88729: own navigation 532 PASS, technical 20 PASS (including the focus occlusion assertion), build parity 691 PASS, Control Capture and Phase 9 PASS. Unified workflow 38996381862 overall FAIL only at the strict external booking UI control wait. Redirect and four UTM fields PASS; public GET master returns three approved trial menus, but actual inputs/selects do not appear within 20 seconds. Do not weaken the probe or call the menu UI PASS.

Accepted Preview remains dpl_BgedYMG9n63F549j9Vkde9GkrZ65 / d6ffcfeb; its deployed 532 checks and 63 screenshots PASS. Latest focused-link z-index fix remains source-only because all-CI-gates policy blocks a further Preview. Owner may approve a review-only Preview exception; main/production/Xserver and GTM settings remain unapproved. Deliver the concrete code, report, evidence and PR before asking that exception.

## Owner-authorized corrective review Preview

Owner answered 「続行」 to the explicit exception request. This authorizes one review-only corrective Preview with the existing external booking UI failure disclosed; it does not authorize production, main merge, Xserver, GTM settings, or the previously rejected POST. Verified remote head f749d9c21370287efbb4fb3cb47ed3046ba3c98c and complete local tree 5ab8f1ce07f4c212d8d56b1e65409b4062ac6fd5; mergeable true. Rolling 24h deployments: 9 before creation. Created Preview dpl_6LqoHfZQnzvpdTx6CvW4K5Sgd7un for exact head f749, target null. Await READY then full deployed QA; do not create another deployment for documentation-only records.

Corrective Preview READY at exact f749 source. GitHub run 38998326481: deployed navigation 532 PASS, 63 screenshots, errors/network empty; strict external booking still FAIL at input/select 20s, redirect and UTM PASS, 3 public menu names obtained. Artifacts 12088172738 (site) / 12087789616 (booking), expiry 2026-10-31. Separately Cloud Chrome visited all 6 pages via actual links; TOP and Recovery focused skip links uncovered true and Enter reached main-content/main. Screenshot and read-only hit-test evidence saved. Runtime bd3→f749 differences confirmed documents/evidence only against equivalent local commits 40d4219→c5f69cf. No further Preview for records. Finalize report and remove PR marker to prevent repeated QA on edits.

## Final acceptance continuation — Owner normal-booking confirmation
Fresh main f1667a73e5da097c1432f7ecd2c423265e5ab3a1 fetched (30 internal Editorial commits); non-conflicting merge into isolated feature worktree. Fresh production/preview rebuild: all 691 hashes match accepted runtime CI artifact in each environment. Current production four GETs HTTP200; published GTM v3 macros/tags/predicates/rules match. Fresh local browser 20 PASS, four pixel pairs same, no external collection sent; fresh Cloud Preview TOP/Recovery metadata/14CTA/focus PASS. Owner says ordinary booking system works: record separately from controlled browser UI FAIL. Phase9 image-job reference mismatch reproduced and isolated to unpublished slug absent from content/blog and public payload; do not edit another project canon to green it. Add 240s fail-closed watchdog/evidence to technical browser (CI external stage stalled >18min), preserve every assertion. Final acceptance and rollback plan written; verdict CONDITIONAL GO with explicit non-blocking exceptions and postrelease receipt/sync criteria. No production/main/GTM setting mutations. Remaining: bound-probe rerun, merge commit/push, latest CI evidence, Draft PR/report save.

CI diagnosis correction: downloaded cancelled e65 artifact12088248757. Navigation532 PASS and technical/browser/progress.json has all20 checks PASS, seven tagPages PASS, measurement EVENT_NAMES_CONSTRUCTED_NOT_TRANSMITTED, zero external collection. Only two desktop visual PNGs exist; mobile visual proof stage stalled. Earlier external-CDN-stage description was provisional and is superseded by this artifact evidence. Candidate f2a6283568a21fe144e8485380c59194310b952e pushed with exact tree5efb270c0ab0846d962a13549441a2549dd4bec6 and parents e65+mainf166. Candidate CI39000569126 / control39000569029 / phase939000569043. Bound local run20 PASS and four pixel-identical pairs. No source or mandatory assertion weakened.

Existing production read-side verified directly via Supabase MCP READ ONLY transaction: property552679302, ga4-direct-read ACTIVE, no last_error, observed2026-10-16T22:32:23.216Z (10/17 07:32JST). Morning RPC source/window VALUE, today partial/DELAYED, period_unique_active_users, bookingsUNKNOWN. Recent pageviews exist and latest positive P0 date10/14. No writes/customer data/forced sync. This resolves existing Company OS current-state uncertainty; new-TOP postrelease receipt remains UNVERIFIED. e65 progress measurement classification is derived from seven PASS tagPages, not a nonexistent raw final field.

Bounded f2a CI artifact12089301530: technical20 PASS and measurementStatus EVENT_NAMES_CONSTRUCTED_NOT_TRANSMITTED; FAIL watchdog identified visual / top /390. Add finite2s best-effort image decode wait (its errors were already ignored), explicit visible-broken-image failure,15s screenshot timeout and finer stage diagnostics. No event/visual assertion weakened. Source d3f2474fe62452ac55509a397ecd2169f0667538 pushed (complete treeaf18419aac645408a52b9c323adab54c19147fc4). New local run20 PASS,4 exact pixel pairs. Latest CI39001184604 / Control39001184619 / Phase939001184609 pending/completing; no new deployment, public payload unchanged.

FINAL SOURCE ACCEPTANCE: d3f2474fe62452ac55509a397ecd2169f0667538, CI39001184604 artifact12089615462 verified. Site532 PASS, technical20 PASS, four visual screenshots saved, errors0/network0, analytics transmitted0. Previous mobile visual stall resolved by best-effort image decode bound; no product or assertion weakening. Remaining workflow FAIL only external booking input/select20s; redirect4UTM and three public menu records PASS. Control39001184619 PASS; Phase939001184609 FAIL unpublished V3 style-reference contract, public payload unchanged. Existing CompanyOS read-only ACTIVE07:32JST confirmed. Main f166 re-read unchanged, PR mergeable true/draft,280 files. Final docs-only record now saved; no new deployment needed. Final verdict CONDITIONAL GO, postrelease/rollback criteria in FINAL_ACCEPTANCE/RELEASE_AND_ROLLBACK; Owner release and GTM approvals not granted.
