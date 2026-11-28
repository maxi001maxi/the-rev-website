# Editorial production recovery — 2026-10-14 JST

## Verified production actions
- Bound GAS project 195NtyKUq-Q4EHOpFWxY70H2mHqawagqs38JGTiZBi9Kzjf8eKMzPO5Gl was identified by its container link to the exact Editorial master Sheet. Used the owner-selected maxi.no1.maxi account.
- Live canonical bundle already contained Audience v0.8 and media-role diversity logic. Existing triggers and owner approvals were preserved.
- 11:52:17–11:53:16 JST real five-topic API generation failed with max_output_tokens. No partial candidates saved.
- Root cause: legacy master generateBlogTopicCandidates_ capped output at 5200 while Audience v0.8 adds five nested reader/evidence contracts.
- 11:55:22–11:56:45 JST corrected real GAS API generation succeeded. Five BT-20261014-AUD08-LIVE-1..5 saved and independently read back through Sheets. Four roles: KNOWLEDGE, COMPARISON_DECISION, COMMUNITY_STORY, SERVICE_EXPERIENCE.
- Actual production selector prepared TP-20261015 for target_date 2026-10-15. A separate execution of the deployed pure selector in ENFORCE on live history confirmed the same selected set (order differs because live backend remains SHADOW).
- 12:01:51 JST official v070Notify_ -> LINE push API returned HTTP 200, x-line-request-id 499c98db-65b3-4bfd-a73e-cfcffeadb335, kind TOPICS_RETRY_2.
- 12:01:53 JST Supabase readback notification_status=SENT, notification_error empty. API acceptance verified; device receipt/read not inferred.
- selected_candidate_id=NULL, approved_at=NULL, status TOPIC_SELECTION_WAITING. No Writer, article creation, approval substitution or article Publish occurred.
- GAS THE_REV_EDITORIAL_QUALITY_V08_MODE was absent/OFF; set to ENFORCE and read back. Model QC execution itself is still pending the owner's topic choice and necessary interview.
- auto_publish=false; human_approval=true read from live getSettings_().

## Final LINE order
1. 初めてのパーソナルジムで、痛み・体調・運動歴はどこまで伝える？ — BT-20261014-AUD08-LIVE-3; COMPARISON_DECISION; interview_required=true
2. パーソナルジムに通うなら家トレは必要？続く人が最初に決めること — BT-20261014-AUD08-LIVE-5; SERVICE_EXPERIENCE; interview_required=true
3. 筋肉痛の日、サウナや冷却を足す前に確認したい3つのこと — BT-20261014-AUD08-LIVE-2; KNOWLEDGE; interview_required=true

## Durable repair
- DailyEditorialTopicApproval_v0.7.0.gs and ONE_PASTE canonical bundle now scope max_output_tokens>=14000 ONLY to Audience ENFORCE blog_topic_shortlist calls. Other calls and OFF mode retain existing budgets.
- Official sender logs HTTP code and request IDs without token, user ID or message contents.
- Live base コード.gs was restored exactly to its pre-repair text after the scoped canonical adapter was installed, so only Audience generation budgets change.
- Syntax and sandbox budget checks passed: OFF shortlist=5200, ENFORCE shortlist=14000, independent QC=1300 in both cases.
- Source commit f93d1fbe0a60ac77cf74c3d47db50e92fd606908; GAS source-only, no Vercel redeploy required for this patch.

## Preserved independent draft
89fcc8e3-e44f-4d82-afce-37ad9f29f2c2 / BLOG-20261014-MEDIA-TRIAL remains NOT_PUBLISHED, published_at=NULL, source_path=NULL, image READY. Theme unapproved and not linked to TP-20261015. Previously completed Closing/date/HTML/image checks were not rerun.

## Still pending / not claimed
- Owner topic selection and first-party interview are required for all three offered options. Writer/Editor/independent QC/image pipeline for the selected topic has NOT run.
- Vercel production Audience mode remains SHADOW (deployment dpl_12foQgoxFSDnGNEPLbqibGL3HLrx, SHA e8b391d2c9e7b775b27a6c4d064abeba0e95bdad). Do not claim backend ENFORCE rollout complete. The live GAS generator is ENFORCE and this notice was explicitly guarded by all three options' audience eligibility.
- Older DENBA queue BLOG-20261010-4f6323 has CANONICAL_PREFLIGHT_BLOCKED:github_connection / REVIEW_REQUIRED. This is still unresolved; do not clear it without actual preflight evidence.
- Authenticated Publisher preflight remains unverified. Final Review & Publish stays with the owner.
- First API failure is resolved by a successful second real generation; no additional generation was requested.
