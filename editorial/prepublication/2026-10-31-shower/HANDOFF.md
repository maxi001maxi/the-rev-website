# Shower article recovery — 2026-10-31

## Exact target

- Existing content ID: `BLOG-20261101-c36b34`; target date 2026-11-01 (run date 2026-10-31).
- Existing draft ID: `e63749b5-d8d2-460f-a4c1-e75e91aec1ee`.
- Article: ジムのあとに出かけられる？THE REV.のシャワー備品と持参品の違い
- Body is unchanged. SHA256 `6103919e9b35d7ac3fa3569ab7c3121843c8a591908ab5ff85d7d1f4cd7cad20`, exactly the prior independent text QC body hash. Editor READY / Fact PASS / Topic PUBLISH / independent text QC 19 remain existing evidence, not newly invented reviews.

## Completed privately

- Recovered existing Sheets row 30 and Supabase draft. The old repo reservation was GENERATING, attempts 0; no registered scene or final images. The prior lobby-generated candidate was found, but Owner subsequently explicitly supplied actual shower/changing-room photos for this article.
- Inspected IMG_0650 / IMG_0651 / IMG_0652. Mirrored original IMG_0651 bytes as `assets/images/photo-shower-changing-20261031.jpg` and uploaded to the existing scoped Drive root. Drive source ID `1mOLC1F15NwTBMAAheZJ1hg0gm5mqPMk1`; original Library ID `libfile_c4d7791ce1bc8191b9bf8cfa9e277365`.
- Generated one fully clothed male customer finishing preparation to go out, using the actual shower room as the spatial reference. Exactly one built-in ChatGPT Work imagegen call; no external image-generation API calls.
- Canonical renderer produced Thumbnail 1200x675, OGP 1200x630 and GBP 1200x900. Copy `ジムのあと、\n出かけよう。` fits readable typography without reducing the readability floor. All three deterministic typography checks PASS, including actual 320/400px previews.
- Registered actual `changing_area` location in the existing scene vocabulary. No QA thresholds, existing scene selection, Publish Gate or generation engine replaced.
- `test:editorial-images`, `test:phase-9` (164), daily contract, daily state machine (73), daily creator (120), thumbnail typography (3), browser typography (87 layouts), and blog build passed. Image-system validation currently validates a pending job, NOT a completed independent image-QC result.
- Draft HTML at Library file `libfile_1c6faa149f4c8191ab97da78779a1178`; desktop 1320px/mobile 390px checked for image loading and horizontal overflow. Body unchanged.

## Automatic approval review hold — do not circumvent

A git push was rejected by automatic approval review because sharing the Owner-provided shower-room photo and generated assets to the GitHub destination had not been explicitly authorized. No branch was pushed. No GitHub upload, independent external image QC, Xserver transfer, article Publish or GBP post was executed.

The existing unpublished Supabase draft retains PREPARING / NOT_PUBLISHED; only image_last_error was updated to record `RECOVERY_PENDING_ASSET_TRANSFER_APPROVAL` and link the private review draft. Do not mark READY, claim independent image QC, or set xserver_verified until actual checks complete.

## Resume only after concrete Owner approval of the held transfer

1. Confirm approval for the actual source photo and generated/derived images to the existing public `maxi001maxi/the-rev-website` repository, independent image QC, and staging only the three image assets to existing Xserver. Article/GBP publication remains outside scope.
2. Current canonical job path is `editorial/hybrid-image-jobs/after-training-shower-changing-the-rev.json`; current version `reference-v26-grounded-shower-20261031-work-r1`. Scene file and state are SHA-pinned as SCENE_GENERATED. Do not regenerate the photo.
3. Execute the existing operator with `EDITORIAL_IMAGE_DISABLE_GENERATION=1`. It recognizes SCENE_GENERATED state and rerenders plus independently observes/grades actual source/finals. The job limits external generation calls to zero and independent QC calls to two. No fake QC flags or retry budget resets.
4. If independent QC fails, retain evidence and repair only the failed part. Do not silently bypass the limit or lower thresholds.
5. Only after independent QC passes: run required canonical checks, transfer versioned three derivatives to Xserver, verify actual HTTP bytes by SHA256, register job/QA/assets on main and update only this draft via canonical READY gates.
6. Sync existing Queue/Bridge row to REVIEW_READY only with actual image-ready evidence. Keep `publish_status=NOT_PUBLISHED`; no article Markdown in published content/blog, no website release, no GBP posting, no LINE messages authorized in this request.

Private raw Supabase snapshot is outside the repo to avoid publishing internal account metadata. Generated blog-build output was reverted; public content is unchanged.
