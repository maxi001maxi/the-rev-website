# THE REV. Editorial Image | Quality per Yen v1 (proposed, non-executable)

**Date:** 2026-10-17. **Status:** design proposal; **NO production workflow changes** and **NO image-model calls** authorized by this document.

## Owner feedback and immediate safety boundary

- 2026-10-18 article image `BLOG-20261018-082d82` R2 is **visually rejected by Owner at approximately 30/100**, despite automatic Visual QA PASS with 8-9/10 sub-scores. The user wants photographic attractiveness on the level of the approved 2026-10-15 R7, not merely plausible anatomy, equipment identity, legible text or synthetic QA acceptance.
- User objects to rapid API-credit expenditure from repeated image iterations and directs the system to **plan the framing and content before generation**, not randomly regenerate.
- **Only the approved OpenAI/GPT generation path is permitted.** Do not send creative requests to Higgsfield, Adobe, or any other external AI provider without Owner's advance explicit approval. Do not silently substitute providers or tools.
- **Current R2 is not publishable.** DB `admin_article_drafts.image_qa.manual_visual_rejection=true`, `image_asset_ready=false`, GBP rejected. Official Queue `REVIEW_REQUIRED`, Bridge `REVIEW_REQUIRED`, GBP `BLOCKED_OWNER_VISUAL_REJECT`. Blog/GBP remain NOT_PUBLISHED. Never use a legacy visual PASS to override the Owner's rejection.
- This proposal does **not** schedule generation and does **not** authorize automatic retries. No regression to `REVIEW_READY` without Owner's approval of a new image.

## Existing pipeline findings (2026-10-17 code audit)

- Generator: `scripts/auto-editorial-hybrid-image.mjs`; `OPENAI_API_KEY` via `https://api.openai.com/v1/responses`, workflow sets `EDITORIAL_IMAGE_GENERATION_MODEL=gpt-5.6` and `EDITORIAL_IMAGE_QA_MODEL=gpt-5.6`. Tool `type=image_generation, quality=medium, size=1536x1024`. Exact backend image-model version is not logged; do not pretend it is pinned or that GPT-5.6 itself is a standalone image model.
- One generated scene is shared through deterministic layout into three image files (Thumbnail/OGP/GBP). **Keep this existing efficiency**, do not generate separate scenes per format by default.
- Existing `lib/editorialProductionImagePreflight.mjs` already checks verified source bytes, scene ontology/fingerprints, history, no unknown equipment and strict attempt count. This does **not** determine whether the proposed image looks like a compelling photograph to a human.
- Current QC sends the source, generated scene, up to 3 full derivatives, 320px and 400px previews, and several golden examples to multimodal model. This can cost nontrivial input-image tokens, and its 8-9/10 scores still allowed an image Owner rates 30/100. Preserve structural QA; add meaningful attractiveness/semantics, and investigate cheaper staging before expensive all-image QC.
- Current article-specific staging used the scene `adult male looking at smartphone in gym`, an easy generic image that satisfies story keywords but insufficiently communicates compelling candid photography, novelty or decision emotion; avoid passive phone-glance photos as default substitutes for a genuine article-specific moment.
- `max_generation_attempts=1` saved further calls but also accepted the first aesthetically weak PASS image. Solve by preflight art direction and Owner-calibrated quality; not by unlimited iterations.

## Recommended strict stages

**Stage A | Text-only Creative Brief (near-zero image cost)**
1. Reader and emotional promise in 1 sentence; specific article insight and what image makes the reader feel at glance.
2. Three truly distinct concepts written **only as text**; rate 0-5 for relevance, visual storytelling, uniqueness vs prior 12, room/source fidelity, composition feasibility. Reject all generic phone, arbitrary gym pose, visibly non-THE REV environment, imaginary room reconfiguration and unidentified trainer.
3. Pick ONE concept; record source image path / SHA / room equipment positions, focal plane and 35/50mm-equivalent framing, camera height/distance, subject expression and action, exact relative scale, light/shadow, depth and a reserved typography region; include minimum framing safe bounds in both 16:9 and 4:3.
4. Set headline hierarchy and exact line breaks based on approved R7 Golden Grammar. Record a visual acceptance reference and precise failure criteria (not just score thresholds).
5. Require `CREATIVE_BRIEF_PASS` before any image request. A draft generated automatically is acceptable if deterministic / text-model checks and reference comparison pass. If no strong concept, stop and do not spend.

**Stage B | Zero-generation layout tests**
- Use already-approved actual room photo + temporary bounding-box/neutral silhouette overlay and final typography, crop at thumbnail/OGP/GBP sizes with local rendering only. Validate readable headlines at 320/400px, no face/title overlap, realistic human-to-rack scale, safe margins, room and equipment fidelity.
- The silhouette is a planning aid, **never public or a replacement for the GPT generated photograph**.
- Reject weak copy and wrong composition without image generation.

**Stage C | Paid OpenAI image generation**
- Generate exactly ONE genuine high-value scene using real source image and approved references, with documented `model`, `image_generation` quality and size. Use **OpenAI only**. Ask for quality selection from measured accepted-image cost data; do not blindly hardcode `high` (it can be far more expensive than `medium`).
- Record all successful `response.id`, `usage`, tool call ID, attempted model, image quality, pixel size, source set hashes, job version, estimated incremental image cost and request ID. Never log secrets.
- Create 3 layouts locally from that ONE source as before.
- First failure: cheaper deterministic QA + focused independent image QA, separate structural compliance from photographic/brand aesthetics. If the image is generic, too passive, visually weak, or far below approved R7 reference, FAIL even when anatomy and typography are good. Human rejection ALWAYS overrides automation.
- **One paid attempt per article by default.** A second paid generation requires a distinct approved revised concept and a fresh spend budget; no blind retry loop. Retouch typography/crop/contrast offline when the scene itself is good and only composition is weak.

**Stage D | Quality and spend gate**
- Record `generation_calls`, `QC_calls`, `prompt_input_tokens`, `image_input_tokens`, `image_output_tokens`, usage-derived cost estimate, actual Cost API reconciliation if available, and yen FX rate *separately*.
- Enforce article budget and rolling weekly budget in **configured project currency**. If unknown, do not auto-spend beyond the first approved call. A user budget of ~¥1,000/week for the broader API was discussed but is not a verified per-image budget; allocate to image generation vs QC only after actual Costs endpoint breakdown is known.
- KPI: `approved-usable-image cost`, owner aesthetic rating and number of generated candidates. Do **not** optimize lowest image cost in isolation. Pilot 5 articles; aim ≥80/100 owner visual assessment while reducing API spending per accepted article. Do not promise percent savings before measurement.
- No picture judged 30/100 may ever be passed to release simply because automatic `qa.pass=true`.
- Human Publish remains separate for Website and GBP.

## Decision for Oct 18 article

**R2 concept is rejected**, not simply a medium-quality variant worth polishing with more prompt iterations. Begin with a revised story / art-direction brief referencing Oct15 R7 as positive benchmark. Never run another image-generation API request until preflight plan and spend budget are established and approved. Preserve article copy and its text QC evidence.

**Source of truth:** user feedback in ChatGPT 2026-10-17, current production operator + image QA + reviewed thumbnail, and official OpenAI API image generation pricing documentation at https://developers.openai.com/api/docs/guides/image-generation/ (model-specific output costs and input reference image tokens apply; actual Responses tool image backend is not directly identified in current job logs).
