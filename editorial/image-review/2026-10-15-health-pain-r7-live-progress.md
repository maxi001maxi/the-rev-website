# R7 2026-10-15｜Owner R7 Visual Acceptance → live prepublish preparation

## Owner authorization
2026-10-15: Owner accepted **this R7 image direction** and explicitly requested preparation to immediately before publication. **Article publish and GBP publish are still prohibited until another explicit owner instruction.** No new image generation, no paid Visual QA rerun.

## Actually changed
1. Supabase project `ixeckiyvdzfccjwnzfsp`, existing `public.admin_article_drafts` row `9a1fd56a-be01-4687-9474-f2377dc7e978`, Content ID `BLOG-20261015-fac1fd`: updated thumbnail, OG and GBP references from stale R2 to exact SHA-pinned staged R7; updated both asset versions, image headline, and QA report path. Kept `publish_status=NOT_PUBLISHED`, `image_status=PREPARING`, `gbp_image_status=PREPARING`, `image_asset_ready=false`; neither article nor Google Business post published.
2. Supabase manuscript: replaced editorial meta-language about not having verified the gym's intervention procedures with a reader-facing question/choice explanation. Corrected misleading `author_role` from "代表トレーナー" to "店長・パーソナルトレーナー" without changing author name or title.
3. Re-read DB: slug/content ID unchanged; R7 paths persisted; misleading sentence removed; safe reader-facing copy persisted; no published URL or publish commit.
4. Independently compared the actual owner-uploaded R7 ZIP's thumbnail, OG, GBP, scene, independent QC SHA256 values with the canonical hashes. All five match. The source had passed independent QC, Github media staging, and historical Xserver SHA verification in Actions run `38680168911`.
5. PR #251 now contains the **proposed** narrow SHA-pinned R7 background-provenance exception helper `lib/editorialR7ApprovedReuse.mjs` and its consumer in `lib/editorialImageReviewGate.mjs`. This is not merged to main.

## Critical *not yet completed*
- The existing generic `hybridQaReady()` in `lib/editorialHybridImageFormat.mjs` independently rejects `same_background_as_recent_articles=true`, even though R7 has truthful evidence `contextual_verified_facility_source_reuse={allowed:true,source_repeated:true,scene_repeated:false,...}` and a different article-specific scene. The proposed narrow helper requires exact R7 slug, asset_version, four fixed SHA hashes + original photo SHA, independent QA facts and a distinct prior scene.
- An attempted branch update to wire this helper into `lib/editorialHybridImageFormat.mjs` was blocked by the GitHub tool's safety checks. **Do not claim complete build/CI/release or bypass the blocker by changing database QA claims**. The branch is intentionally incomplete and must not be merged yet.
- No authenticated production `/api/admin/publish-preview` acceptance has been run. The current review gate is not yet proven READY, and no Vercel code release was executed.
- The latest Xserver HTTP byte fetch was unavailable to this session; the prior Actions success remains the last independent staging verification evidence. Keep the exact SHA verification as a requirement before publish.
- The regular R5 operator-state ERROR and canonical R5 job remain in GitHub. R7 has a different image version and must not be overwritten by routine re-sync. In particular, an old `image_headline_short` sent in routine Bridge requests could incorrectly downgrade R7, so verify preservation before permitting unattended re-sync.

## Safe next execution, strictly in order
1. Complete and test the R7-scoped source re-use exception in **both** generic image review and Hybrid QA, without modifying global rule or falsifying `same_background_as_recent_articles`.
2. Add automated negative tests: other slug/version/asset SHA, identical-scene fingerprints, trainer presence, and missing QA must fail; exact R7 should pass. Run image QC / daily editorial regression and inspect CI results before merging.
3. Check that Bridge and any unattended operator cannot silently reset this already-approved R7 to R2/R5 or spawn image-generation API calls; fix narrowly if needed.
4. Review code change and explicit deployment impact separately. No blog/GBP post. Implement tested runtime fix in deployed admin service.
5. Trigger canonical authenticated Editorial readiness so it actually validates GitHub QA + live assets and sets `image_status=READY` and `gbp_image_status=READY` itself. Do not manually set Ready flags.
6. Run authenticated Review Preflight; stop when all checks pass, with Publish button available but **unpressed**. Recheck Supabase `NOT_PUBLISHED`, no markdown in main, no GBP post.
7. Only on **later explicit approval** execute article Review & Publish and, separately, a GBP post.

## Persistent evidence
- Source images and their hashes: `editorial/image-review/2026-10-15-health-pain-r7-prepublication.json`.
- Branch-only connection manifest and original checklist: adjacent `...-connection-candidate.json` and `...-release-checklist.md`.
- Scope of authorization: **R7 image adopted; no publication approval**.
