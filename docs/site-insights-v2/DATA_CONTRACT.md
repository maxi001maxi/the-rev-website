# Site Insights v2 — Data Contract (Gate 1)

Updated: 2026-09-29. Scope: design only. Current truth is `main` at `fbb5c279dd58d78874055e83755fcb9f08e123aa`; Gate 0 passed with GTM version 3. The existing `/api/admin/analytics` and `/admin/analytics/` remain operational and are not the v2 contract.

## 1. Sources, date policy, and reconciliation

| Domain | Primary source | Granularity / meaning | Caveat |
|---|---|---|---|
| Search | GSC Wizard Search Analytics `web` for `https://therev-lab.com/` | Google Search clicks, impressions, CTR, position by date/query/page | Query rows can be privacy filtered; never sum top queries as site total. GSC dates use the source's reporting date basis (observed `America/Los_Angeles`). |
| Traffic, content, events | GA4 Data API property `552679302` through a server-side provider (GSC Wizard GA4 where supported; existing `lib/ga4Data.mjs` official Data API path where needed) | GA4 sessions/users/views, event counts, page and landing dimensions | GA4 timezone observed `Asia/Tokyo`. Distinct users and sessions are not additive across pages/days. |
| Landing overlap | GSC Wizard blended landing pages | GSC organic search metrics and GA4 `google / organic` landing sessions, joined on canonical path | Outer join: preserve GSC-only/GA4-only. Cross-source ratios are diagnostic only. No query-to-booking attribution. |
| Annotations | GSC Wizard annotations plus verified first-party editorial publish/update, site deploy and GTM change records | Date, label, provenance | Algorithm updates only when official/verified; no inferred cause. Missing integration is `NOT_CONFIGURED`. |
| Realtime | GA4 Realtime API | Last 30 minutes, separate freshness domain | Never splice into settled daily time series or comparison. |

Default top range is **28 complete GSC dates**, with 7 and 90 switches. `endDate` is latest GSC `settledThrough`; `startDate` is inclusive `endDate-(N-1)` calendar days in the GSC reporting calendar. Compare to the immediately preceding N complete dates. If a provider cannot return that exact range, mark its metric `UNKNOWN` or `DELAYED` with coverage metadata; do not substitute today's partial GA4 totals. GA4 local-day and GSC local-day boundaries differ: same date labels are useful for trends, not proof of same-session causation. Display each source's timezone and `settledThrough` in evidence. For the 90-day view, insufficient history is `UNKNOWN` with `coverageDays`, not a fabricated zero or a percent comparison.

Observed on 2026-09-29: GSC settled through **2026-09-26**; 28 daily rows had 43 clicks (median 1/day, max 5) and 1,674 impressions (median 59/day, max 92). GA4 overview for the same 28-day window returned 43 sessions, 39 active users, engagement rate `0.348837...`. These coincidentally equal click/session totals do not mean the same users or visits. GTM v3 CTA forwarding was published **2026-09-27**. Any CTA period before that is NOT_CONFIGURED; a period straddling it is UNKNOWN for its full-period count, with an optional clearly marked observed partial count. A CTA comparison is enabled only after **both** full windows are covered by active measurement. The default settled GA4 event report ended 2026-09-26 and did not yet include the new tracking; Realtime Gate 0 proved the four events separately. No unobserved 90-day history is assumed.

## 2. Metric dictionary

| Canonical key / UI label | Definition and unit | Source / aggregation | Display caution |
|---|---|---|---|
| `searchClicks` / Google検索クリック | GSC web clicks to the property, count | Aggregate date rows; use source total, not query sum | One click is not one GA4 session. |
| `searchImpressions` / Googleでの表示 | GSC web result impressions, count | Aggregate date rows | Search visibility, not visits. |
| `searchCtr` / 検索クリック率 | `clicks/impressions`, fraction 0–1 | Recompute from totals when impressions > 0 | At 0 impressions, `UNKNOWN`, not 0%. Raw Wizard GSC `ctr` was observed in percentage points (e.g. `2` = 2%); divide by 100 at provider boundary. |
| `averagePosition` / 平均掲載順位 | GSC impression-weighted average position | Aggregate API value or weighted daily position by impressions | Lower is usually better. At 0 impressions `UNKNOWN`; do not average page/query averages without weights. |
| `sessions` / 訪問 | GA4 sessions in period | GA4 aggregate API | Not a unique-person count or sum of daily/page rows. |
| `activeUsers` / アクティブユーザー | GA4 active users in period | GA4 aggregate API | Unique over requested period; nonadditive. |
| `newUsers` / 新規ユーザー | GA4 new users in period | GA4 aggregate API | Definition is GA4's, not first website visit inferred locally. |
| `returningUsers` / 再訪ユーザー | GA4 returning user metric, when supported | Explicit GA4 metric; otherwise `UNKNOWN` | Do not derive by subtracting new from active users or summing a `newVsReturning` breakdown. |
| `pageViews` / ページ表示 | GA4 `screenPageViews` for this website | GA4 aggregate API | Page loads/views, not sessions. |
| `engagementRate` / エンゲージメント率 | GA4 engaged sessions / sessions | GA4 period aggregate, fraction 0–1 | Raw GA4 rate observed as fraction. |
| `bounceRate` / 直帰率 | GA4 bounce rate | GA4 period aggregate, fraction 0–1 | Do not infer from legacy Universal Analytics. |
| `averageSessionDurationSec` / 平均訪問時間 | GA4 average session duration in seconds, if provider supports | GA4 Data API | `UNKNOWN` when omitted. |
| `bookingIntent` / 予約画面クリック | GA4 `reserve_click` event count | GA4 `eventName` count | **Not a completed booking**, unique user, or revenue. Confirmed reservations remain `UNKNOWN` until GYM's authoritative integration. |
| `lineIntent` / LINEを開いた | GA4 `line_click` event count | GA4 event count | Not a sent message. |
| `priceIntent` / 料金を見る | GA4 `price_click` event count | GA4 event count | Not necessarily a price-page view. |
| `articleCtaIntent` / 記事下の次の行動 | GA4 `article_cta_click` event count | GA4 event count | Includes article CTA destinations; do not call all of them bookings. |
| `considerationEvents` / 検討行動 | `price_click + article_cta_click` | Sum two GA4 event counts | Event count, may include repeat clicks/person. |
| `highIntentEvents` / 問い合わせ・予約行動 | `line_click + reserve_click` | Sum two GA4 event counts | Same person can click both. |
| `ctaRate` / CTA率 | Chosen event count / eligible GA4 sessions or page views, with denominator identified | Explicit report scope | Experimental diagnostic; can exceed 100% on repeat clicks. Never silently divide GSC clicks by GA4 sessions. |

Source/medium and channel use GA4 session-scoped dimensions; device uses GA4 device category. `pagePath` is viewed page, `landingPage` is session's first page. Blog classification is canonical path prefix `/blog/` excluding `/blog/` index; preserve both. Path canonicalization: same site host only, strip query/hash, normalize percent encoding safely, collapse repeated slash, remove trailing slash except root, preserve case in a stable documented policy; never join unrelated hosts. Display `/blog/foo/` as friendly path while using canonical `/blog/foo` join key. Search queries are aggregate terms, never personal data; suppress or escape unexpected free text in UI.

## 3. Status contract

Every scalar is `Metric<T> = { status, value, unit, source, asOf, coverage? }`. `status` is exactly `VALUE | ZERO | UNKNOWN | NOT_CONFIGURED | DELAYED | ERROR | STALE`. `value` is `T` only for VALUE/ZERO; ZERO requires the source query succeeded for the relevant period and value is exactly 0. For all other statuses, `value:null`. Fractions use unit `ratio`, counts `count`, position `position`, duration `seconds`. Negative deltas are VALUE, not errors. `asOf` is source observation timestamp; `coverage` includes requested range, actual dates, `settledThrough`, timezone, completeness and missing days. Each object may carry safe `reasonCode` and a short non-sensitive message.

| Condition | Status | Behavior |
|---|---|---|
| Successful complete request, nonzero value | VALUE | Show number. |
| Successful complete request, genuine zero | ZERO | Show `0`. |
| Missing row/field without proof of zero, insufficient comparison history, unsupported dimension, privacy suppressed query, or period straddling instrumentation start | UNKNOWN | Show `—` and explanation; optional partial count stays outside the primary value. |
| Integration, property, measurement, registration or credentials absent | NOT_CONFIGURED | Show setup state; never assume zero. |
| Date after provider `settledThrough`, recent event while daily aggregation pending | DELAYED | Show pending; allow Realtime separately. |
| Request timed out, denied or malformed | ERROR | Show retry/error state; no stale numeric value silently labeled current. |
| Last successful snapshot older than freshness budget or old `settledThrough` beyond allowed lag | STALE | Show last value only in separate `lastGood` evidence, not `value`. |

Precedence per metric: `NOT_CONFIGURED` when confirmed absent; `ERROR` for failed attempted request; `DELAYED` for knowingly unsettled requested dates; `STALE` for expired successful snapshot; `UNKNOWN` for missing/unsupported despite success; `ZERO`/`VALUE` only on complete valid response. Widget/page health summarizes constituent states but does not overwrite their individual statuses. Empty top-N list with successful query may be `ZERO` rows; anonymized query list is not a zero site total. Comparison delta is another `Metric<number>`: when prior=0 and current>0, delta percent is `UNKNOWN` (`baseline_zero`) and absolute delta remains known; 0→0 is zero absolute and 0% only when both windows complete. Never turn provider `prev* = 0` into a comparison when `hasComparison:false`.

## 4. Canonical server API (v2, not an implementation)

Protected endpoint: `GET /api/admin/site-insights?range=7d|28d|90d` (default 28d). Optional detail endpoint `GET /api/admin/site-insights?range=...&view=search|content|funnel|technical&date=YYYY-MM-DD&cursor=...`, same envelope. Unknown params return 400; no arbitrary property ID or URL. `schemaVersion:"2.0"`. All dates ISO calendar strings; timestamps ISO UTC; timezone explicit. `generatedAt` is response creation, not data freshness. HTTP 200 for partial provider failure with per-source status; 401 for missing/invalid Admin token; 400 invalid input; 503 when API-wide configuration prevents any result. `Cache-Control: private, no-store` to the browser; internal server cache follows provider TTL. Restrict response size and paginate rows.

```json
{
  "schemaVersion": "2.0",
  "status": "PARTIAL",
  "range": {"key":"28d","startDate":"2026-08-30","endDate":"2026-09-26","comparisonStartDate":"2026-08-02","comparisonEndDate":"2026-08-29","anchor":"gsc_settled","completeDays":28},
  "generatedAt": "2026-09-29T00:00:00Z",
  "health": {"ga4":{"status":"VALUE","settledThrough":"2026-09-26","timezone":"Asia/Tokyo"},"search":{"status":"VALUE","settledThrough":"2026-09-26","timezone":"America/Los_Angeles"},"blended":{"status":"VALUE"},"annotations":{"status":"NOT_CONFIGURED"}},
  "summary": {"searchClicks":{"status":"VALUE","value":43,"unit":"count","source":"gsc","asOf":"2026-09-29T00:00:00Z"},"sessions":{"status":"VALUE","value":43,"unit":"count","source":"ga4","asOf":"2026-09-29T00:00:00Z"},"bookingIntent":{"status":"NOT_CONFIGURED","value":null,"unit":"count","source":"ga4","asOf":null,"reasonCode":"before_instrumentation"}},
  "trend": [{"date":"2026-09-26","searchClicks":{"status":"VALUE","value":1,"unit":"count","source":"gsc","asOf":"2026-09-29T00:00:00Z"},"sessions":{"status":"VALUE","value":2,"unit":"count","source":"ga4","asOf":"2026-09-29T00:00:00Z"}}],
  "anomalies": [], "funnel": {"stages":[],"edges":[]},
  "search": {"queries":{"status":"VALUE","rows":[],"nextCursor":null},"pages":{"status":"VALUE","rows":[],"nextCursor":null}},
  "content": {"pages":{"status":"VALUE","rows":[],"nextCursor":null}},
  "acquisition": {"channels":{"status":"VALUE","rows":[]}},
  "events": {"counts":{"reserve_click":{"status":"NOT_CONFIGURED","value":null,"unit":"count","source":"ga4","asOf":null}}},
  "insights": [], "annotations": {"status":"NOT_CONFIGURED","rows":[]}
}
```

The example illustrates shape/status, **not an actual snapshot**; illustrative daily and CTA values must not be presented as measured results. Top-level `status` is `OK | PARTIAL | UNAVAILABLE`; details below decide display. `health` entries hold status, last successful refresh, settledThrough, timezone, safe error code. `summary` uses dictionary keys with current, `previous` and `deltaAbsolute`/`deltaPercent` metrics when compared. `trend` has N ordered dates and source metrics; missing dates are assessed individually. `anomalies` rows carry id/date/metric/direction/observed/baseline/severity/confidence/evidenceRef. `funnel.stages` carry stage key/label/metric; `edges` carry `comparable:false` for cross-source or overlapping events. `search/content/acquisition/events` expose only approved aggregations and paginated evidence rows; `insights` rows carry ruleId, headline, factual evidence, interpretation, confidence, suppression reason if relevant. `annotations` rows carry date, type, label, source, verification status. No raw provider response, OAuth token, API key or PII in response.

## 5. Provider response mapping observed in Gate 1

- GSC Wizard `query_search_analytics`: `{rows:[{keys:[date|query|page],clicks,impressions,ctr,position}],dataSource,settledThrough,dataMaturity}`. Observed `ctr` in **percentage points**, divide by 100. A `rowLimit` can truncate; fetch full daily series before declaring zeros. GSC top queries returns a presentation table `{kind,columns,rows}` with `ctr` percentage points. Treat it as top-N, not exhaustive.
- GSC Wizard `query_ga4_report`: `{propertyId,range,timeZone,dimension,metrics,hasComparison,rowCount,totalRows,rows:[{key,eventCount,totalUsers,...}]}`. Observed `engagementRate` and `bounceRate` are **fractions**; `prev*` values are meaningless when `hasComparison:false`. Filtering page report to only CTA events produced `screenPageViews:0` and sessions per page; those values must **not** be used as unfiltered page performance or conversion denominator.
- `get_ga4_overview`: presentation-oriented KPI block `{kind:"kpis",kpis:[{label,kind,value,delta}],timeZone}` in this connection. Labels are not a stable typed API; provider maps explicitly or uses official GA4 runReport for missing daily metrics.
- `get_blended_landing_pages`: use the complete JSON tool result, which exposes `clicks, impressions, ctr, position, sessions, activeUsers, bounceRate, keyEvents` plus GA4 match state. The presentation projection omits impressions and must not be treated as the provider schema. Blended `keyEvents` is GA4 key-event count, not automatically `reserve_click`; P0 CTA counts come from an exact GA4 event report.
- Existing `api/admin/analytics.mjs` uses `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_JSON` and authenticated `getAuthedContext`. Its `lib/ga4Data.mjs` normalizer defaults absent `metricValues` to 0, and frontend also uses `|| 0`; v2 must have separate strict parsing/status logic. Do not silently repurpose legacy endpoint behavior.
