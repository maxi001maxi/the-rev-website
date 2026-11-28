# 2026-10-15 THE REV Editorial R7 — FINAL VERIFIED PUBLICATION

**Latest authoritative state; supersedes older owner-hold / connection / pending-recovery notes.**

## Owner-initiated publish
- User clicked Review & Publish on the 2026-10-15 article.
- Article slug: `personal-gym-first-session-pain-health-history`
- Content ID: `BLOG-20261015-fac1fd`
- Public URL: `https://therev-lab.com/blog/personal-gym-first-session-pain-health-history/`
- GitHub article commit: `7913093151419e8732498e7096442f8590328f2f`
- Published Markdown blob SHA1: `b65cd92d19f690c768eac07dbc354e44eff06536`
- R7 image asset version: `reference-v26-grounded-lobbysp-20261015-pain-r7-depth-portrait-offline`

## Root cause (original Deploy to Xserver failure)
- Run: `38690436919`, started 2026-10-15 06:06:05 UTC, completed failure 06:08:49 UTC.
- Build, Blog validation and existing R7 image verification passed.
- `Deploy Blog LAST` failed all 3 attempts with `mkdir: Access failed: 550 blog/category/boxing: File exists (/blog/category/boxing)`.
- `lftp mkdir -p` does not tolerate existing remote directories with `set cmd:fail-exit yes`; original pipeline treated a normal existing directory as fatal.
- DB remained `PUBLISH_COMMITTED` because exact original deployment run had failed. Never re-click Publish for this condition.

## Actual remediation performed
1. PR #252: `scripts/xserver-blog-delta.mjs` now emits `mkdir -pf`; regression added to `scripts/test-xserver-incremental.mjs` and CI. Full Phase 9 Check PASS run `38691857794`, merged on commit `2b620a9085a6616324be54c71939cbf81a69b552`.
2. Scoped recovery run `38692106617` with head SHA `e098ac22c294d8a900f104acbae67b109de330e1` ran to completion SUCCESS. It compared a deterministically rebuilt prepublication snapshot with the owner-approved published build; diff: **11 changed / 0 deleted**. FTPS connected with server certificate verification. Transferred **only Blog changed HTML/cache policy and sitemap**. Exact public HTML SHA gate logged `BLOG_DELTA_SHA256_LIVE_PASS 11 changed 0 deleted`, and `R7 target article exact publication recovery passed. GBP untouched.`
3. PR #253: Canonical status reconciler now can recognize **this one source SHA, article blob SHA, recovery workflow HEAD SHA, run ID and workflow path only**, plus live HTTP success, rather than remaining permanently stuck looking only at the failed original run. Regression tests (including wrong slug, wrong hash, wrong run, missing live response) and full Phase 9 CI PASS run `38692565848`. Merged `a9ce3b6d212331bb491e27e5f3dea1689d5992e2`. Vercel production deployment `dpl_Db48XgBD25aHyWUJJi1f4DWnAjMi` READY.
4. After confirming actual recovery job and exact production HTML readback, Supabase original draft row was conditionally repaired with all immutable article IDs, commit SHA, blob SHA, asset version, URL and prior `PUBLISH_COMMITTED` state matched. Result: **`publish_status=PUBLISHED`**, `published_at=2026-10-15T06:24:21Z`, `publish_verified_at=2026-10-15T06:29:55.330081Z`. R7 `image_status=READY`; `gbp_image_status=READY`.
5. The one-time recovery workflow was deleted after SUCCESS to prevent unintentional re-execution; historical Actions run `38692106617` remains auditable. The generic future deployment generator fix remains in main.

## Guardrails / remaining separate matters
- **Google Business Profile post not submitted**. An image being READY is not a GBP publication. Requires separate owner-approved action.
- Admin TLS/DNS issue noted in older document is independent. Vercel domain config had `admin.therev-lab.com` mapped through Xserver DNS, causing an invalid HTTPS hostname warning; current browser status was not re-verified. Do not bypass HTTPS warning; fix DNS in Xserver.
- The public article URL was verified from the successful GitHub Actions worker (exact bytes); the model's local container/browser could not directly resolve the Xserver DNS. This is not grounds to dispute the verified Actions log, but should be recorded as an observation constraint.
- This incident is now closed as: **BLOG_PUBLICATION_RECOVERED_EXACT_SHA_VERIFIED**. Future issues should reference PR #252, PR #253, run `38690436919` (failed), run `38692106617` (successful repair).
