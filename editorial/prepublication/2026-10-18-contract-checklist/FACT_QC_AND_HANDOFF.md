# 2026-10-18 料金・予約・解約記事｜Fact QC / 一次情報Interview / Handoff

## Authority and current state
- Owner on 2026-10-17 selected notification candidate **1**, "パーソナルジムの体験前に確認したいこと｜料金・予約・解約で後悔しないために".
- Canonical topic proposal: `TP-20261018`; candidate ID: `BT-20261017-DAILY-3`; target_date **2026-10-18** (notification sent 2026-10-17 JST; do not overwrite target date with notification date).
- Explicit GPT owner selection queued in `editorial_gpt_operator_requests` as `gpt-TP-20261018-choose-1-20261017-owner`. Must be consumed by existing `lib/editorialGptOperatorInbox.mjs` → `lib/editorialTopicStore.mjs` and yield `INTERVIEW_WAITING`. Do not bypass by fabricating Interview answers or marking status `APPROVED` by hand.
- Automated topic Knowledge Gate explicitly requires **two first-party Interview answers**. Neither is received yet. No canonical queue article should be created before Interview success.
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
