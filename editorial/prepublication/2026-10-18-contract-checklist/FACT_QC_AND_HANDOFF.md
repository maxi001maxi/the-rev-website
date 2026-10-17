# 2026-10-17 Continuation after Owner replenished API credits — CURRENT FINAL HANDOFF

## Article is technically READY FOR HUMAN REVIEW (not published)
- **Verified independent Owner-approved article QC = PASS 20/20, zero issues**, checked at 2026-10-17 02:15:39 UTC, exact owner article SHA256 `e772344b92253cd013075e3d6c55c947db9cc7c0785dfb8e4284a1cf59ad0854`. Official model evidence: [FINAL_QC_RESULT.json](FINAL_QC_RESULT.json). Previous HTTP429 billing blocker is **resolved**, never cite prior failed result as current.
- Production-backed static checks `OFFLINE_STATIC_PREFLIGHT.json` **12/12 PASS**. Real `lib/publishFlow.mjs` `runPreflight` was run in **read-only automation actor mode** with GitHub access and public Xserver fetch, resulting in **10/10 real non-auth checks PASS**, 2 actor-specific checks (human auth, Publisher session) intentionally **SKIP**. Evidence: [CANONICAL_PREFLIGHT_AUTOMATION.json](CANONICAL_PREFLIGHT_AUTOMATION.json); date 2026-10-17 02:21:17 UTC. This tests a reconstructed draft from exact owner source, with the DB draft content separately compared byte-for-byte; it is NOT proof of a completed authenticated production UI session.
- Official Supabase Draft UUID `2519f5a1-2ed9-4397-8a85-153354b4421a`, `BLOG-20261018-082d82`, slug `personal-gym-trial-three-checks`. Exact source Title and Markdown match Supabase; organization-only anonymous author. `publish_status=NOT_PUBLISHED`, `source_path=NULL`. Blog not published.
- Official R2 image files verified: thumbnail 1200x675, OGP 1200x630, GBP 1200x900. Independent Visual QC true, Xserver file byte verified. Supabase `image_status=READY` and `gbp_image_status=READY`. GBP not posted.
- Google Editorial Sheet `THE_REV_Editorial_AI_v0.1_Master`: `21_WEB_BLOG_OUTPUT` row 21 `READY` and 2 editorial flags `PASS` with exact QC provenance in Q21. `22_GBP_POST` row 19 is prepared (no post), `status=READY`, `image_status=READY`, `post_ready=BLOCKED_URL` (expected until the article's public URL exists). `25_WEB_PUBLISH_BRIDGE` row 28 `PREVIEW_READY`; `26_DAILY_EDITORIAL_QUEUE` row 24 `REVIEW_READY`, `next_stage=HUMAN_REVIEW`, `human_action_required=REVIEW_AND_PUBLISH`, review link exact.
- Vercel deployment for `the-rev-website.vercel.app`: `READY` and alias assigned. Suggested secure review URL:
  `https://the-rev-website.vercel.app/admin/articles/review/?id=2519f5a1-2ed9-4397-8a85-153354b4421a`
- **Admin vanity domain still misconfigured**: `admin.therev-lab.com` DNS `A 162.43.104.3` points Xserver, whereas Vercel recommends `CNAME cname.vercel-dns.com.`; never click through HTTPS cert warning. Exact authenticated human-browser `/api/admin/publish-preview` response still UNVERIFIED; the user must sign in via the standard Vercel alias and check that its live Preflight shows no errors, then **the user alone** clicks `Review & Publish`.
- No auto-publication or GBP posting performed. Blog publication must be followed by separate GBP posting approval/workflow; `post_ready=BLOCKED_URL` is intentional before public Blog URL exists.
- All previous portions of this file describe **historical** blockers and may no longer be current. This top section is the state authority.

## 2026-10-17T01:50Z CONTINUATION — actual blockers, DO NOT PUBLISH

**Owner definition:** "本番直前" means approved article + all thumbnail/OGP/GBP image assets generated and QA'd + article draft in the production Admin with all preflight checks confirmed, leaving ONLY their final Publish button. Work is **not yet complete** by this definition.

**What really is complete**
- Official `admin_article_drafts` row for `BLOG-20261018-082d82`: `2519f5a1-2ed9-4397-8a85-153354b4421a`, slug `personal-gym-trial-three-checks`; exact owner-approved short 3-item body (with Dec withdrawal example and shop-rule caveat), organization-only author, `NOT_PUBLISHED`.
- Image job `editorial/hybrid-image-jobs/personal-gym-trial-three-checks.json`, asset version `reference-v26-grounded-evolgear-20261018-contract-r2`, generated 1200x675 Thumbnail, 1200x630 OGP, 1200x900 GBP. Independent visual QA `pass=true`; `editorial/image-operator-state/personal-gym-trial-three-checks.json` has `xserver_verified=true`. Supabase `image_status=READY`, `image_asset_ready=true`, `gbp_image_status=READY`, `image_qa.pass=true` with QA scores. NOT GBP-posted.
- Current `21_WEB_BLOG_OUTPUT` D/E/H/I/J/K contain the approved short 3-item copy, title/slug; preserved status `REVIEW_REQUIRED` until a genuine independent QC result. Do not overwrite approved short copy with old machine-generated 5-item copy.

**What failed and why**
- A separate model-based `scripts/oct18-final-qc.mjs` executed in GitHub Actions. The **actual final model request returned OpenAI HTTP 429**: `You have no credits remaining. Add credits to continue using the API`. The result is recorded in `editorial/prepublication/2026-10-18-contract-checklist/FINAL_QC_RESULT.json`, commit `03b4273c7112f0230dbe81064942947bbdd77aaa`. Its `pass=false` is **runtime billing failure, not a prose verdict**. No more paid retry loop before API project credit / key association is checked.
- Previous independent result `INDEPENDENT_QC_RESULT.json` scored **19/20, pass=false** for an OLD SOURCE SHA `bb05ca781636a213ac5e305714e2b9d22bc8de9938aa05f681b9dce03e6eef12`, reporting 3 bullets (one was actually a strength) and requested date example and 'different gyms have different terms'. Both editorial improvements were made in latest source SHA `e772344b92253cd013075e3d6c55c947db9cc7c0785dfb8e4284a1cf59ad0854`. Old 19-point review must NOT be stamped PASS for the new bytes. **Independent editorial QC remains unverified.**
- Vercel `get_domain_config(admin.therev-lab.com)` still `misconfigured:true`, DNS `A=162.43.104.3` (Xserver) instead of recommended Vercel CNAME `cname.vercel-dns.com.`. The user previously saw `ERR_CERT_COMMON_NAME_INVALID`. This DNS is delegated to Xserver and cannot be fixed by editing Vercel GitHub project alone. Do **not** bypass TLS warnings.
- Direct user-authenticated `GET /api/admin/publish-preview?id=2519f5a1-2ed9-4397-8a85-153354b4421a` has NOT been confirmed from a real logged-in browser, so **do not say Preflight OK or one-click READY** yet. `https://the-rev-website.vercel.app/admin/articles/review/?id=2519f5a1-2ed9-4397-8a85-153354b4421a` is a potential secure alternate hostname but actual auth/browser preflight is still unverified.
- Source `lib/publishFlow.mjs` checks required fields, slug, Editorial Closing, 2 image QA gates, live Xserver asset sizes, GitHub target and Publisher permission. It does not directly check `INDEPENDENT_QC_RESULT`, but the canonical Editorial production pipeline has a separate fact/QC fail-closed gate. **Never conflate these two gates or mask a blocked Editorial QC.**

**Next action order**
1. Owner or administrator must replenish or check the **specific OpenAI API project used by the GitHub Actions OPENAI_API_KEY**, and verify billing/credit (not the ChatGPT subscription).
2. Rerun `scripts/oct18-final-qc.mjs` once, collect new verdict proving exact latest approved SHA; only then reconcile official Editorial Sheet QC/queue statuses legitimately.
3. If PASS, confirm article draft still matches exact final source and image version R2, use Review & Publish preflight; report actual JSON checks.
4. Separately set the Xserver DNS for **admin subdomain only** to the recommended Vercel CNAME; never alter apex/www/MX. Verify HTTPS hostname + login, or use a confirmed secure alternate admin domain.
5. **STOP before Publish**, no Blog or GBP write. No additional creative interviews needed.

## 2026-10-17 Owner release-prep execution — authoritative current status

- **Owner approved v2 conversational 3-item text**. Approved source: [ARTICLE_DRAFT.md](ARTICLE_DRAFT.md), GitHub content SHA `3276b76cef053aefd9add71972a1527a950300ea` (read back at time of Sheet update).
- Supabase proposal `TP-20261018`: `QUEUE_CREATED`; `BLOG-20261018-082d82` Interview answered/approved (GPT). No additional interview needed.
- Google Sheets `THE_REV_Editorial_AI_v0.1_Master` ID `1_Cia3fsELLCJtBcIFq38Jg5CbEVG2md2G6w6Do4BaeI`, **`21_WEB_BLOG_OUTPUT` row 21**: prior automated 5-item body was `REVIEW_REQUIRED`. Replaced `D21:E21`, `H21:K21`, `Q21` with **the exact owner-approved 3-item title, slug, summary, lead, body (1,524 chars), CTA and revision provenance**. Re-read and verified correct content; original reviewer score 91 is *historical*, NOT QC for revised copy.
- **Do not convert historical QC to PASS by hand.** `21_WEB_BLOG_OUTPUT!P21=REVIEW_REQUIRED`, `T21=REVIEW_REQUIRED`, `X21=REVIEW` deliberately unchanged. Sheet `26_DAILY_EDITORIAL_QUEUE!I24/M24=REVIEW_REQUIRED`, `N24=NOT_STARTED` unchanged.
- Prior v0.8 Quality mode `ENFORCE` makes `REVIEW_REQUIRED` fail-closed unless independent model QC passes. Execute the existing v0.8 Writer/Preservation Editor + **Independent QC** for **exact revised text**, verify source claims and dates/terms, and persist actual QC evidence before marking `READY/PASS`. Do not manually manufacture `quality_v080.independent.pass`.
- National Consumer Affairs Center 2026-10-07 warning is real: https://www.kokusen.go.jp/news/data/n-20261007_1.html (independently verified through public search). Current price.html and terms.html in this repo support ¥3,300 trial; ¥30,800 monthly x4; ¥22,000 admission for monthly training; ordinary cancellation previous day 23:59 / initial trial fee free; withdrawal by end of prior month; next-month billing on day 20.
- `25_WEB_PUBLISH_BRIDGE` has no Oct18 row and Supabase `admin_article_drafts` has no `BLOG-20261018-082d82` as of this check. No Image Job/QA/asset READY. **No Blog or GBP publication.**
- After independent QC PASS: use **canonical GAS Supervisor/Bridge** to transition state and create official Supabase draft, GBP draft, image Hybrid job and stage Xserver assets; check SEO/Visual QC and live SHA match. Stop at Owner Review & Publish.
- Additional external blocker: Admin domain `admin.therev-lab.com` currently Vercel `misconfigured:true` and public A record `162.43.104.3` (Xserver). Domain remains without correct CNAME / TLS as of this check. Do NOT bypass SSL browser warning. Separate server DNS fix needed before logged-in production Admin Preflight.
- Owner content approval is **NOT** permission for website Blog publishing or GBP posting.
- This section supersedes older temporal status bullets below.

## 2026-10-17 EDITORIAL V2 — Lighter reader-first version is the current draft

- **Current draft of record is `ARTICLE_DRAFT.md` v2**, title: 「パーソナルジム体験前に確認したい3つのこと｜料金・予約・退会」. Owner feedback: earlier version too formal, lengthy and heavy to read.
- Primary reader: an **interested prospective first-time client** who wants to try a gym but is uncertain whether it will fit budget/schedule/commitment. Not primarily a legal-research reader.
- Lead with the reader's curiosity and mild anxiety, not cancellation scandals or regulatory warnings. Retain regulatory citation in short tail note. Avoid scare framing or hard-sell.
- Collapse six explanatory sections to 3: 1) first-payment vs monthly price 2) booking suitability and cancellation 3) withdrawal deadlines and unused sessions. Explain only actionable terms and link the complete `terms.html` and `price.html`.
- Preserve latest official details: ¥3,300 trial, ¥30,800/month for 4 training sessions, ¥22,000 admission for monthly training, 23:59 preceding-day ordinary cancellation (trial cancellation has no fee), payment 20th for next month, monthly withdrawal request due last day of preceding month, unused sessions generally don't roll over with exceptions under terms.
- Anonymized first-party viewpoint: one may overthink starting, or start on motivation, but must understand contract conditions and retain autonomy; staff will support clients on attending, not guarantee outcomes.
- Prevent unauthorized rollback: Canonical creator may now have queued `BLOG-20261018-082d82`. Before Review, compare generated Supabase draft against **v2** text and revise if it is materially more formal. Do not blindly copy editorial metadata header into public body. Never alter approved Topic/interview/authorship evidence or human Publish boundaries to force progress.
- **Anonymity:** Do not attribute the interview to an identified employee. Avoid private name in publicly visible author or byline.
- This revision is pre-publication editorial copy only, no image-generation or GBP publication authorized.

# 2026-10-18 料金・予約・解約記事｜Fact QC / 一次情報Interview / Handoff

## Authority and current state
- Owner on 2026-10-17 selected notification candidate **1**, "パーソナルジムの体験前に確認したいこと｜料金・予約・解約で後悔しないために".
- Canonical topic proposal: `TP-20261018`; candidate ID: `BT-20261017-DAILY-3`; target_date **2026-10-18** (notification sent 2026-10-17 JST; do not overwrite target date with notification date).
- Explicit GPT owner selection queued in `editorial_gpt_operator_requests` as `gpt-TP-20261018-choose-1-20261017-owner`. Must be consumed by existing `lib/editorialGptOperatorInbox.mjs` → `lib/editorialTopicStore.mjs` and yield `INTERVIEW_WAITING`. Do not bypass by fabricating Interview answers or marking status `APPROVED` by hand.
- Automated Topic Knowledge Gate requires **two first-party Interview answers**. Owner supplied one comprehensive narrative on 2026-10-17; both Q/A records were derived transparently **only** from that response, with the absence of a verified individual customer example explicitly stated, and sent to the canonical GPT operator inbox as request `gpt-TP-20261018-answer-anonymous-20261017-owner`. Treat `PENDING` as still awaiting official engine processing; never claim `APPROVED` until official state changes. No canonical queue article should be created before official Interview success.
- Article copy has been drafted editorially in `ARTICLE_DRAFT.md` outside `content/blog/`. This is NOT a published article nor a bypass of the official approval / creator workflow.
- Owner only requested preparation up to immediately before publishing; **no article Publish or GBP posting**.

## Official first-party prices (source: same-repo `price.html`)
- Trial: ¥3,300 incl tax. Personal training 60m, personal boxing 50m, recovery 45m (reservation slots 60m).
- Monthly personal training: 2 visits ¥17,600; 4 visits ¥30,800.
- Admission fee **¥22,000 only for monthly personal training**; do not wrongly say all services are no-admission-fee.
- Boxing 5 tickets ¥29,700, 10 ¥55,000; expiry 6 months and 1 year respectively.
- Conditioning 5-ticket expiry 3 months, 10-ticket 6 months.
- Verify site pricing before releasing: connected website repo is current first-party code, but independent live-site fetch from this session was unavailable.
- Prices differ from some preliminary marketing brainstorms in old conversation; rely on current `price.html`, not old planning notes.

## Official first-party member conditions (source: `terms.html`, revised 2026-07-22)
- §3 formal changes / withdrawal: desk or official LINE. Instagram DM is NOT an accepted formal procedure.
- §17 monthly automatic renewal and payment on 20th for next month.
- §18 monthly unused sessions normally no carryover/refund/transfer, with bounded exceptions.
- §19 tickets expire; unused mid-term refund handling depends on price table, key explanation and individual contract; don't invent a universal refund formula.
- §20 full reservations, established on acceptance by gym.
- §21 ordinary reservation cancellation deadline 23:59 preceding day, later normally 1 session counted; official LINE / desk.
- §24 first trial once per person; trial cancellation **no fee**; no automatic monthly membership without express consent.
- §25 withdrawal for monthly plans: by **last day of month BEFORE withdrawal month**; effective end of withdrawal month. Explicitly distinguish from monthly payment date.
- §26 course change deadline *two months ahead*; do not conflate with withdrawal.
- §27 no ordinary suspension plan, but case-by-case discussion for hardship.
- Prior consent form, individual agreements and applicable law may prevail; avoid blanket "always non-refundable".
- Distinguish gym's published monthly withdrawal from general contract rescission under consumer law; don't claim all personal training enjoys or lacks statutory cooling-off rights.

## External research crosscheck
- National Consumer Affairs Center 2026-10-07 advisory: `https://www.kokusen.go.jp/news/data/n-20261007_1.html`, actual page verified. Real issues include forced-on-the-day contracts, related service upsell, cancellation calculations, inconvenient reservations. Distinguish "training fit" from "contract fit".
- National Consumer Affairs Center advice: `https://www.faq.kokusen.go.jp/faq/show/933?site_domain=default`, 2026-01-22 update, look at actual contract and check unexplained fees.
- Tokyo gov 2026-08-28 ongoing dispute: `https://www.metro.tokyo.lg.jp/information/press/2026/08/2026082801`, context only; do not state its allegations as adjudicated court facts.

## Non-overlap with existing THE REV blog
- `the-rev-trial-three-menus-first-visit`: compares **three trial service types** and visit prep.
- `personal-gym-first-session-pain-health-history`: safety disclosure **of pain and past health conditions**.
- New article specifically compares **contract conditions and post-signup risk**. Avoid copying their intro, CTA and image action.

## Interview required from owner (capture verbatim, redact customer identities)
1. "THE REV.では体験後、料金・予約の空き枠・退会手続をどの順序で、どのように説明している？ 公式規約どおり運用しているか、個別に例外を扱うことはあるか？"
2. "実際にお客様が誤解しやすかった契約条件や、質問してくれて良かったと感じた出来事は？（個人情報なし。事実が無ければ『実例なし』で可）"
The original canonical two questions are in proposal `TP-20261018` option 1. Answers must be stored through official Topic API / GPT operator inbox; no fake answers and no mark-as-approved based solely on published FAQ.

## Image direction, deferred to canonical Automated Hybrid
- Suggested short thumbnail-copy **「契約前に、\n何を聞く？」** (subject to exact copy overlap and typography validation).
- Show **one adult customer** considering a comparison/booking on phone or simple real-world notes in an *actual verified THE REV.* indoor zone if selected source supports it. Calm realistic expression and article-specific preparatory action, no unknown coach/staff, no fake interiors, no logos invented, no medical gear.
- Scene must be selected from actual `editorial/automated-image-sources.json`, with recent-4 provenance restriction and recent-12 semantic uniqueness, not blindly reuse October 14/15 reception background.
- Standard: V2.3 Hybrid, editorial-thumbnail-v2.6-human-first, Human First 1 customer, typography/golden checks, independent Visual QC, 1200×675 thumbnail, 1200×630 OGP, 1200×900 GBP.
- Do not manually craft a Hybrid job: normal Editorial Bridge should create it when canonical approved queue advances. No image generation, Xserver image staging or API spending was triggered by this draft.

## Release checklist still unresolved
1. Confirm owner 2 Interview answers, canonical Topic proposal moves `INTERVIEW_WAITING` → `APPROVED`.
2. Canonical Creator/Gate generates queue/content ID, article into Supabase draft; verify target date 2026-10-18, not 2026-10-17. Integrate this draft without bypassing safeguards or overwriting other articles.
3. Recheck price + member terms version and validate final wording. Run editorial repetition/brand/SEO/closing QC.
4. Canonical image operator generates verified one-customer R7-quality derivative; verify GitHub/Xserver SHA and image/GBP READY statuses.
5. Authenticated **Review & Publish preflight OK**, owner review. **STOP** before pressing final Publish. GBP post also forbidden without separate approval.
6. No guarantee of exact readiness date until Topic interview and production execution really succeed; report current blocked state accurately.

## 2026-10-17 anonymized first-party owner interview: editorial rules
- Interview source must **never be named**. Do not use owner first name, surname, exact personal biography, or suggest any specific customer's experience. No customer was identified.
- Captured source meaning: Overthinking can impede taking action. Sometimes deciding to start while motivated is reasonable if the person has understood and voluntarily accepted contract conditions. A person might feel reluctant after signing; that is a hypothetical, not an observed customer case. In-person trainers can help the person explore how to respond to uncertainty and anxiety after they attend. Personal training support does not guarantee attendance, outcomes, refunds or freedom from anxiety.
- The owner **did not** specify the actual sequence in which staff explains pricing, booking, cancellation or refund exceptions; do not invent one as a first-party operational policy.
- The user requested anonymous treatment. The public article must use no personal attribution or byline identifying the respondent. If the official Draft creator populates a named `author`, change that to a non-identifying organization credit before final review, with user-requested author anonymity preserved.
- Integrated public-facing discussion in `ARTICLE_DRAFT.md` section 6. The public wording must preserve **voluntary informed decision vs rushed pressured contract**; avoid a promotional recommendation to commit impulsively.
- National Consumer Affairs Center reference `https://www.kokusen.go.jp/news/data/n-20261007_1.html` verified 2026-10-17: strong warnings on pressure, hidden related goods, cancellation fees and booking availability.
