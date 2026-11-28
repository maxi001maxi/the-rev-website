# THE REV. Editorial AI | Phase 6A | Audience Discovery v0.8
基準日: 2026-10-13
Status: DESIGN_CONTRACT_FROZEN_FOR_PHASE_6B | NOT_DEPLOYED
Owner: THE REV. editorial operations
Scope: TOPIC DISCOVERY / CANDIDATE RANKING / APPROVAL UI. Does not modify Writer/Editor/QC or Apps Script production runtime.

## 0. Mission and operating rule
**Don't find subjects because a daily article needs publishing. Discover human questions that have not yet been answered well for THE REV.'s audience.**
- Reader-first: 「まだTHE REV.を知らない人」が抱く生活上の疑問・欲求・興味から、自然に専門性へ接続する。
- Search-first research remains useful but cannot fabricate actual GSC volume or ranks. SEO and satisfying people are compatible.
- A product may be mentioned only where it genuinely advances the answer. Do not imply oxygen room / DENBA cures pain, sleep problems, fatigue or injury.
- Never replace topic approval, owner fact confirmation or final human publication approval.
- "New series chapter" is not a novelty exemption: a different reader question and answer must be demonstrated.

## 1. Verified current baseline and cause
Sources: `21_WEB_BLOG_OUTPUT` (18 unique drafts), `23_BLOG_TOPIC_SHORTLIST` (69 candidate proposals, NOT published articles), Supabase `admin_article_drafts` publishing facts (15 with PUBLISHED status + 1 PUBLISH_COMMITTED + 2 NOT_PUBLISHED when verified); all figures time-bounded and statuses may later change.
Current pipeline:
- `lib/editorialTopicSeeds.mjs` manually enumerates boxing-specific mitt tension / technique / footwork / breath and DENBA basics. These topics strongly presuppose category experience.
- `lib/editorialTopicApproval.mjs::proposalOptions` ranks eligible options by `candidateScore`, then seeks distinct lanes; it does not model **reader stage, curiosity mechanism, difference in final answer**.
- `lib/dailyEditorialCreator.mjs::evaluateCandidates` checks shortlist age (14 days), existing primary query, threshold 65, and `evaluateArticleOverlap`.
- `lib/editorialArticleOverlap.mjs` compares text n-grams with some intent rules; it can miss question/answer convergence behind distinct titles.
- Editorial Sheet v0.1 has portfolio targets (OXYGEN_ROOM, DENBA, GYM_LOCAL, BOXING etc.). These are balancing tools, not audience-demand proof.

Observed clusters requiring restraint:
A. GYM_LOCAL: 2026-09-26 selection criteria, 2026-10-03 facility experience, 2026-10-08 new-member gym type comparison. A further "5 tips for choosing a gym" needs exceptional incremental evidence.
B. DENBA: 2026-09-29 what it is, 2026-10-05 electric potential field, 2026-10-10 device and mat (unpublished when verified). Only genuinely new question/answer and evidence justify another explanation.
C. Beginner training / fatigue: advice tends to repeat "pace yourself / adapt intensity." Prefer a specific unaddressed misconception or life situation.
D. Boxing: 2026-10-06 beginner fears. Existing seeded ideas focus post-adoption technical frustrations, limiting cold audiences.

## 2. New discovery process (batch-friendly)
1. DISCOVER (one capped model batch): Generate 8-12 distinct **human tensions**, BEFORE associating a service. Evidence buckets: actual 1P questions/feedback, existing research, Search Console if connected, and clearly tagged hypotheses. Do not infer local keyword volume. Classify life event / frustration / desire / current alternative / decision friction.
2. CONNECT (same batch or a short second pass): Link only those tensions with honest first-party expertise, boxing, training, oxygen room or DENBA, including "no product fit" as a valid outcome.
3. DIFFERENTIATE (no expensive LLM yet): Compare canonical article archive (all published + drafted + skipped overlap + candidate history, with source status). Compare reader question, promised answer, use case, evidence. One phrase variation is not innovation; choose UPDATE_EXISTING when incremental value fits an older page.
4. RANK (one batch model critic under independent instruction, optional): Judge concrete reader value, novelty, SEO fit, service fit, verifiable evidence. Reject unsupported therapeutic efficacy. Inspect scoring mechanically.
5. SELECT (deterministic plus human oversight): Produce 3 options with different **audience jobs** or discovery mechanisms, not just category labels. Human selection remains prerequisite; owner interview only if 1P information materially needed.
6. CREATE: Hand selected topic's reader contract to Writer->Editor->Independent QC. Do not write full article before selection.

## 3. Audience taxonomy (not a rigid funnel)
- `PROBLEM_AWARE`: knows a lived problem (exercise boredom; can't switch off at home), not a product.
- `EXPLORING_OPTIONS`: considering categories/alternative routines (fitness vs activities; spa vs staying home).
- `CATEGORY_AWARE`: queries oxygen room / DENBA / personal training terms to learn mechanisms or compare.
- `READY_TO_VISIT`: examines local pricing, availability, process, safety and reservation.
- `EXISTING_USER`: technique, how-to, maintenance, troubleshooting.
All stages are eligible; if 3 candidates exist, usually **at least one genuinely readable by someone who has never tried the service**. Do not optimize that into a rigid quota that suppresses actual demand.

## 4. Curiosity / psychological triggers (proposed, not proven conversion predictors)
- `RECOGNITION` lived friction ("home rest becomes doomscrolling") 
- `MISCONCEPTION` corrective explanation ("muscle soreness isn't the score")
- `DISCOVERY` unexpected relevant option ("skill learning makes exercise interesting")
- `COMPARISON` concrete choices with honest constraints
- `SITUATION` a moment-specific action ("after night shift", "pre-race": check evidence and service hours)
- `UNCERTAINTY` user asks what is known vs unproven (e.g. DENBA outcomes).
Do not use empty curiosity clickbait. The opening must answer the title. No unverified effects or false absolutes.

## 5. Candidate schema / contract (Phase 6B)
Must provide:
`candidate_id,title,primary_query,search_signal_type,search_signal_source,search_demand_verified`;
`audience_stage,reader_scene,reader_job,psychological_hook,reader_question`;
`new_reader_takeaway,decision_or_action,primary_service_connection,fit_or_no_fit`;
`nearest_articles:[{content_id,title,similarity_reason}]`,
`incremental_answer,distinct_from_prior,content_action` one of `NEW_ARTICLE|UPDATE_EXISTING|REJECT|HOLD_FOR_FACTS`;
`evidence_map:[{claim,source_ref,kind,status}]`, `claim_risk`, `owner_questions`, `score_breakdown`, `total_score`.
Sources must be `FIRST_PARTY_VERIFIED|EXTERNAL_VERIFIED|RESEARCH_INTERPRETATION|HYPOTHESIS|UNKNOWN`. Model-written `source_ref` without verifiable evidence is not verified.
A reader-facing candidate notification shows: title | who/scene | why it is worth reading | search signal (measured/hypothesis) | difference vs closest existing article | unresolved facts. No false "search volume" numbers.

## 6. Scoring 100 (editorial prioritization, NOT search analytics or user-test result)
- Reader relevance/self-recognition 0–25.
- Real new insight / difference in answer 0–25.
- SEO intent fit and evidence of opportunity 0–20 (query match 0–12, measured opportunity 0–8; missing GSC means the measured subscore is 0, **not** imputed).
- Natural THE REV. expertise/usefulness fit 0–15 (0 is allowed; should not invent a service use).
- Factual explainability / evidence readiness 0–15.
Score = arithmetic sum validated against each cap. The model must not claim measured engagement/clicks/volume without connected data.
Initial proposal: >=70 to consider, and relevance >=15, novelty >=15, plus all hard gates. This is a **provisional threshold** pending 6B offline calibration and 6C observed behavior. Do not compare directly with legacy 65/100 or historic Editor points.

## 7. Hard gates (precede score)
- `NO_CLEAR_READER` no non-specialist can identify the audience, scene and question.
- `ANSWER_ALREADY_EXISTS` same question AND same actionable insight as previously published or unpublished article; choose `UPDATE_EXISTING`, citing exact article.
- `ANGLE_ONLY_REPHRASE` merely rewords "what is X" or "5 ways to choose Y".
- `UNVERIFIED_HEALTH_CLAIM` effect, treatment or safety promise unsupported, including efficacy implications in a question's framing.
- `SERVICE_MISFIT` article arbitrarily redirects to a paid service or falsely suggests a substitute for medical treatment.
- `NO_EVIDENCE_PLAN` unverifiable core claim with no way to validate.
- `SCORE_INVALID` score outside cap or mismatch; fail closed.
- `INCOMPLETE_READER_CONTRACT` no specific new learning / decision / appropriate next action.
Hard-gate failure cannot be rescued by keyword relevance, portfolio bonus, or high total score.

## 8. De-duplication decision matrix
`NEW_ARTICLE`: different reader decision **and** substantive new content, even if same cluster.
`UPDATE_EXISTING`: same reader decision, but a richer illustration/claim/caveat is available. Recommend existing content_id and edit instructions.
`HOLD_FOR_FACTS`: strong curiosity and potential new question, but required owner/manual/scientific fact is absent.
`REJECT`: repeating answer, poor service fit, clickbait or unsupported claims.

History sources have distinct roles: Supabase `publish_status` or site's actual verified URL = publication truth; `21_WEB_BLOG_OUTPUT` = draft details; `26_DAILY_EDITORIAL_QUEUE` = execution; `23_BLOG_TOPIC_SHORTLIST` = proposed historical titles only, never "published". Include unpublished drafts in collision checks. Where Queue and Supabase disagree, log conflict; do not silently suppress a live page.

## 9. Evidence separation from existing Drive research
A. [Movement Motivation](https://docs.google.com/document/d/1SDIhFWnq4K9AFVQzVpy_dpae1Vx2YmqX2YmqO_uXyRg/edit): autonomy, affect, enjoyment and adherence are different constructs. Research isn't proof paid boxing retains better than alternatives.
B. [Boxing Experience Synthesis](https://docs.google.com/document/d/1zQGRuXh0_ItF5MPK8rXyEPuqz-G1LfLQZ3A-EMN7Fkk/edit): skill, play and sense of competence are creative hypotheses for editorial discovery, not guarantees.
C. [Search vs Rest Discovery](https://docs.google.com/document/d/1-AjltdwTlG6ZSnLOk3tkVmb8iud-YD5E-TLfcnU9Egc/edit): "looking for oxygen room" and "want a place to rest" imply different category knowledge, not necessarily different willingness to pay.
D. [Recovery Purchase Analysis](https://docs.google.com/document/d/1eq-kpKiGn_M4oIht0p6l7wdm1zBRrAdRNhQnJheBCpU/edit): separate symptom prevalence, real payments, category awareness, product fit, local feasibility.
External official: [Google people-first](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) and [Google AI search advice](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide). Multiple rephrased pages intended solely for search manipulation are discouraged.

## 10. Old vs new proposal comparison (QUALITATIVE editorial review, NOT live LLM A/B test)
Old-1 "パーソナルジムは何で選ぶ？初心者が『きつさ』より先に確認したい5つ": overlap high vs 09-26 and 10-08; UPDATE_EXISTING or hold. The safety angle could add value as a subsection if factual.
Old-2 "ミット打ちで肩に力が入る": fairly distinct answer vs 10-06 beginner article, but existing-user niche. Store for technique series; not default primary acquisition topic.
Old-3 "DENBA Healthで説明できること・まだ断定できないこと": significant material already in 09-29, 10-05 and unpublished 10-10; UPDATE_EXISTING.
New-1 "運動が単調で続かない人へ。ボクシングの『覚えて動く』楽しさとは？": problem-aware, discovery, explain learning experience and limits. Existing 10-08 overview mentions enjoyment, so must deliver detailed independent insight, not repeat generic fun.
New-2 "休みたいのに家ではついスマホを見る。『休む場所を変える』ことに意味はある？": early problem-aware, discuss environment/psychological detachment and free alternatives first; oxygen room only one optional example, not proof of extra efficacy.
New-3 "筋肉痛がない日の筋トレは無駄？『効いた感』と成果を分けて考える": misconception-led, separate soreness from outcome metrics and when to seek medical help. Unlike 09-22 failure training and 09-23 body composition tracking; require exercise evidence review.
None is automatically approved for publishing. New group covers boredom, rest-place behavior, and soreness, three distinct reader jobs, where old group mainly assumes category selection or existing product use.

## 11. Low-cost Phase 6B integration handoff
1. Add isolated pure module `lib/editorialAudienceDiscovery.mjs`: schema validator; hard gates; ranking/novelty; history join; shortlist output.
2. Run one capped model DISCOVERY batch (8–12 idea sketches); cheap deterministic filtering; optional critic only for survivors. Budget/rate limits, caching, idempotent run keys; no unbounded one-model-call-per-candidate loop.
3. Extend `lib/editorialTopicApproval.mjs` response while preserving legacy fields: one of existing three options per message; add 3 audience-focused summary fields. Preserve selection/interview/human Publish flow.
4. Retain existing overlap evaluator as mechanical prefilter, enhance **answer-equivalence and UPDATE_EXISTING** distinction. Do not publish or destroy older article automatically.
5. `THE_REV_AUDIENCE_DISCOVERY_MODE=OFF|SHADOW|ENFORCE` with OFF default; 6B offline tests and 6C live proof before ENFORCE.
6. Acceptance (6B): sample old 1/3 blocked as repeats, old 2 retained but downranked for cold audience, new 3 structurally eligible if sources are supplied; arithmetic and all gates pass; old pipeline regression pass. 6C: actual live model generates 3 reader-distinct topics, owner can choose/interview, Writer→Editor→QC→save→readback; no duplicate or public post.

## 12. Not claimed / blocked
- We have NOT measured Google search impressions, clickthrough, ranking, actual query volume or local market demand. GSC Wizard connector was inaccessible due to inactive subscription on 2026-10-13.
- We have NOT tested live model audience discovery or real reader response.
- No GAS runtime, Sheets values, Supabase proposal or production setting changed in Phase 6A.
- Phase 6B/6C have not yet executed.
