# 2026-10-15 Editorial R7｜LIVE READY / Owner Hold (NOT PUBLISHED)

## 2026-10-15 ADMIN SSL/DNS ACCESS BLOCKER (CRITICAL)
- Owner received Chrome `net::ERR_CERT_COMMON_NAME_INVALID` when following `https://admin.therev-lab.com/admin/articles/review/?id=9a1fd56a-be01-4687-9474-f2377dc7e978`.
- Vercel current domain config `admin.therev-lab.com`: `misconfigured:true`, nameservers `ns1.xserver.jp` through `ns5.xserver.jp`, public IPv4 `162.43.104.3` (Xserver). Vercel recommended CNAME target `cname.vercel-dns.com.` for this hostname.
- Vercel project-domain record is `verified:true` and its alias maps to live READY production deployment `dpl_GNCXNfjbwCoFepNeSJeZpAvyoKtR`; verification is not a substitute for valid DNS/TLS routing.
- Fix external Xserver DNS ONLY for hostname `admin` to CNAME `cname.vercel-dns.com.`. If explicit `admin` A/AAAA exists, remove it before installing the exact-name CNAME. If only a wildcard `*.therev-lab.com` A exists, do not delete the wildcard; adding a specific CNAME for `admin` overrides it. Do not change apex, www, MX, SPF, DKIM or nameservers.
- Vercel can automatically provision HTTPS after correct DNS propagates. Recheck domain config `misconfigured:false`, certificate issued for `admin.therev-lab.com`, secure HTTPS before credentials, then run the admin Review preflight.
- Vercel DNS management APIs are not authoritative because the delegated nameservers are Xserver. The current connected tools cannot update Xserver DNS. No DNS records were modified.
- **Do NOT bypass the Chrome certificate warning or enter credentials over that URL until corrected.** No Blog or GBP publication authorized. Supabase R7 image+GBP READY is independent of safe Admin UI connectivity.


**Read this after older R7 candidate/checklist/progress snapshots.** This supersedes their pre-connection/blocker status.

## Owner intent and permission
Owner explicitly adopted the R7 visual direction and authorized all safe work up to immediately before the article's final publication confirmation. **This is NOT consent for Blog publication or Google Business Profile posting.**

## Actual production state observed
- Supabase project `ixeckiyvdzfccjwnzfsp`, row `9a1fd56a-be01-4687-9474-f2377dc7e978`, Content ID `BLOG-20261015-fac1fd`
- image_status: **READY**; image_asset_ready: **true**
- GBP image_status: **READY**
- image_asset_version: `reference-v26-grounded-lobbysp-20261015-pain-r7-depth-portrait-offline`
- image_qa.pass: **true**, generated/customer/source grounding evidence as in immutable R7 QA and asset manifest
- `publish_status=NOT_PUBLISHED`, `published_url=null`, `publish_commit_sha=null`, `publish_verified_at=null`
- Real Supabase Draft has R7 Thumbnail, OG and GBP paths, matching headline. No article markdown created on main by this work.
- Updated public-facing manuscript sentence: does not claim to have failed to verify the store's internal procedures; reader can ask about stopping exercise and individual load adjustments.
- Corrected `author_role` to `THE REV. CONDITIONING LAB. 店長・パーソナルトレーナー`.

## Test and deployment evidence
- Uploaded ZIP's 3 JPG + scene PNG + independent QC JSON: SHA256 exactly matches approved R7 manifest.
- R7 Visual QC: independent GitHub Action `38677888686`, success.
- R7 Xserver image SHA byte staging: GitHub Action `38680168911`, success.
- Production runtime code: PR #251 merged (squash) into main `535417a9717ba061bd4cebadc97f5e2a1551025a`. Exactly scoped SHA-pinned R7 distinct-scene exception (generic Hybrid + Review QC). No global relaxation.
- New tests: `scripts/test-editorial-r7-owner-reuse.mjs`, including different slug/version, image SHA tampering, repeated same scene, trainer presence, manual rejection. Full Phase 9 CI `38685708285` succeeded.
- Vercel preview `dpl_HE9EC5cU6mftfMjyd8F6wteaZ2E3`: READY at `37e39072037cca055ff2c546e2592cabb926d8c4`.
- Vercel production `dpl_GNCXNfjbwCoFepNeSJeZpAvyoKtR`: READY, exact release SHA `535417a9717ba061bd4cebadc97f5e2a1551025a`.
- Xserver main deployment `38685945207`: SUCCESS for the above release SHA.
- Extra one-time authenticated Bridge Acceptance workflow `38686111359` failed *before invocation* because repository Actions did not have `EDITORIAL_BRIDGE_SECRET`. It was removed; no secrets were disclosed and no publication attempted. Separately, the established production process updated Supabase R7 image and GBP states to READY, which was directly re-read.
- R5 Job/operator ERROR is historical and must not be reinterpreted as rejection of approved R7.

## Exact next action
Use the existing authenticated review page at:

`https://admin.therev-lab.com/admin/articles/review/?id=9a1fd56a-be01-4687-9474-f2377dc7e978`

Opening the page checks production Preflight and shows the actual Article/Thumbnail/OGP. **STOP before clicking `Review & Publish`.** Because the authenticated Admin session wasn't available to this execution environment, the final UI Preflight response itself was not read here. The canonical QA readiness gate and the live Supabase READY state were verified by production data, but the user-facing final Preflight screen must still be checked in the authenticated Admin UI.

When the owner separately authorizes Blog publication, use existing Review & Publish UI and verify GitHub publish commit, exact Xserver deploy and live article canonical URL plus Supabase PUBLISHED evidence. GBP posting requires its own explicit approval and follows article publication. No extra image generation is necessary.

**Final guard:** `image READY` does not equal `article published`. Do not call the task completed as a published post.
