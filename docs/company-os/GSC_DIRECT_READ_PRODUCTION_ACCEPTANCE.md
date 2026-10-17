# GSC Direct Read Production Acceptance

2026-10-07 JST — **PASS: GSC Direct Read ACTIVE**.
Current truth is the live Source Registry, finalized daily table and Morning RPC.
This record supersedes the earlier API-disabled/property-unauthorized attempts.

## Production evidence

- PR #184 merged; release main: `30d0c7a8c2e2519b852478631612f8e4c848f7ac`.
- Preview: `dpl_du7tpGd813a8PT2PbJ2rnwbWJuSt`, exact `f17afebd59b98ebd750cbc1acf06af8ce911d39d`, READY and accepted.
- Production: `dpl_EhhYoGuoxmprvEZVse8L6H9FvnUJ`, exact release main, READY and accepted.
- Existing Production GSC Cron `/api/cron/company-os-gsc/` Run: HTTP 200 at 2026-10-07T10:15:22.673Z; sync observed at 10:15:23.142Z.
- Public Production application rejects unauthenticated Cron: HTTP 401, body `{"error":"unauthorized"}`. Preview's application also returned 401 in the Vercel request log.
- Domain website is served by Xserver; its `/api/cron` path is not the API host. Public API acceptance used `https://the-rev-website.vercel.app/api/cron/company-os-gsc/`.
- Preview top/price/Control display used the ordinary signed-in browser. Existing candidate writer was executed with real Google API data and authenticated Supabase SQL transport before merge. An authenticated in-Preview Cron execution was not performed; the deployed runtime path was positively verified by Production Cron.
- Release budget: one Preview and one Production. Automatic Git deployments remain disabled. This evidence-only documentation update requires no deployment.

## Direct connection and data

- Provider: `google-search-console-api-direct`; scope `webmasters.readonly`.
- Production credential priority checked: GOOGLE_READONLY_SERVICE_ACCOUNT_JSON absent; existing GA4_SERVICE_ACCOUNT_JSON fallback. No credential was changed or disclosed.
- Selected property: `https://therev-lab.com/`; API permission `siteFullUser`. Full permission was added after explicit owner confirmation.
- Existing `syncDirectGscToCompanyOs()` performed both the acceptance sync and the live Production sync.
- Daily rows: **56**, 2026-08-10 through **2026-10-04**, missing days **0**. These are actual API date rows, never manufactured zeroes.
- Source `gsc-direct-read`: **ACTIVE**, last_error **NULL**, last_observed_at **2026-10-07T10:15:23.142Z**.
- Registry provider, site_url, permission_level, settled_through, requested range and rows_upserted match the API and persisted table.
- `dependency_on_gsc_wizard=false`. No GBP or Treatment work.

## Morning read-model and Japanese comparisons

Actual `company_os_get_gsc_morning_metrics('2026-10-07')`: all four periods have VALUE and full coverage (7/7/28/28 days).
Date windows use finalized Search Console service dates, anchored at October 4 with a conservative three-day lag.

| Comparison | 表示された回数 | サイトがクリックされた回数 | クリック率 | 検索結果の平均順位 |
|---|---|---|---|---|
| 前7日→直近7日 | 593→697 (+17.5%) | 11→10 (-9.1%) | 1.9%→1.4% (-0.4ポイント) | 5.2位→5.6位 (0.4順位低下) |
| 前28日→直近28日 | 808→2,140 (+164.9%) | 23→42 (+82.6%) | 2.8%→2.0% (-0.9ポイント) | 6.2位→5.2位 (1.0順位改善) |

The existing Morning Meeting (08:00 JST) and Company State Builder (07:30 JST) are enabled and configured to read the Direct RPC, show Japanese labels/directions and preserve UNKNOWN semantics. Actual returned data was passed through `buildGscMorningPresentation()`; both comparisons are ready.
Missing days remain absent; incomplete coverage becomes DELAYED/UNKNOWN with NULL totals. Verified returned zeroes alone may be ZERO. Zero denominators are not fabricated rates.

## Regression and durable record

- CI PASS: GSC Direct Contract 37603463213; Control Capture Contract 37603463226; Phase 9 Check 37603463286.
- GA4 remains ACTIVE / last_error NULL. Actual GA4 Morning RPC retains today.partial=true / data_status=DELAYED, period-unique user semantics, and UNKNOWN reservation_start/reservation_complete.
- `reserve_click` remains external-booking-page intent, not a completed reservation.
- REV-EXP-2026-001 remains CONTROL_CAPTURE_ACTIVE; existing Control Capture contract and Preview price display pass.
- Editorial and Instagram insights sources remain ACTIVE. Company-state's earlier DEGRADED observation (2026-10-06T22:28:08.83683Z) was not promoted or modified by this GSC connection.
- Company Timeline milestone: `ae4f0270-85f4-4eaf-8c99-3b79c4e7c04e`, SYSTEM_VERIFIED, GSC Direct Read ACTIVE — Production Acceptance PASS. Historical blocked event `be98653c-14c7-4335-b1a1-acb3d69884cd` is preserved.
