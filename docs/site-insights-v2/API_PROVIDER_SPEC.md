# Site Insights v2 — Provider, cache and security specification (Gate 1)

Updated: 2026-09-29. This defines a server implementation boundary; no endpoint or credential is created in Gate 1.

## Modules and interface

`api/admin/site-insights.mjs` authenticates and validates the request, then calls `lib/siteInsights/assemble.mjs`. The assembler gets each dataset once per canonical date window and shares it among summary, trend, drilldown and detail views. `providers/ga4.mjs`, `providers/search.mjs`, `providers/blended.mjs`, `providers/annotations.mjs` return normalized, status-bearing values rather than UI-ready cards. `normalize.mjs` checks numeric fields strictly and handles CTR/rate units, dates, paths and pagination. `status.mjs`, `rules.mjs`, `cache.mjs` apply the contract. A provider can be replaced without changing the Admin-facing envelope or display logic.

```ts
interface ProviderResult<T> {
  status: 'VALUE'|'ZERO'|'UNKNOWN'|'NOT_CONFIGURED'|'DELAYED'|'ERROR'|'STALE';
  data: T | null;
  source: 'gsc-wizard'|'gsc-api'|'ga4-api'|'first-party';
  fetchedAt: string | null;
  settledThrough?: string;
  timezone?: string;
  coverage?: {requestedDays:number; returnedDays:number; missingDates:string[]};
  reasonCode?: string;
}
interface SearchProvider { daily(range):Promise<ProviderResult<DailySearch[]>>; queries(range,limit,cursor):Promise<ProviderResult<QueryPage>>; pages(range,limit,cursor):Promise<ProviderResult<PagePage>>; }
interface Ga4Provider { aggregate(range):Promise<ProviderResult<Ga4Aggregate>>; daily(range):Promise<ProviderResult<DailyGa4[]>>; events(range):Promise<ProviderResult<EventCounts>>; pageRows(range,limit,cursor):Promise<ProviderResult<Ga4Page>>; acquisition(range):Promise<ProviderResult<Acquisition>>; realtime():Promise<ProviderResult<Realtime>>; }
interface BlendedProvider { landingPages(range,limit,cursor):Promise<ProviderResult<BlendedPage>>; }
interface AnnotationProvider { list(range):Promise<ProviderResult<Annotation[]>>; }
```

One failed provider must not erase successful sources. Bound outbound concurrency, enforce 8-second timeout per upstream request, retry at most once for 429/5xx with jitter (not permission errors), preserve safe error codes, and never log response headers or secrets. Cache only after validating response shape and source coverage. Cursors are opaque server-generated values with range/sort binding; no arbitrary external URL, property or metric name accepted from clients. Cap lists at 20 default, 100 maximum. Day drilldown gets one date and scoped top-N; do not issue a query for every widget independently.

### Provider capability matrix

| Capability | Gate 1 observed path | Gate 2 adapter policy |
|---|---|---|
| GSC daily/date/query/page | Wizard `query_search_analytics`; `dataSource:api`, `settledThrough` | Use service-side read-only key under `GSC_WIZARD_API_KEY`; if official API chosen later, preserve normalized contract. Ensure complete daily pagination and distinguish privacy-filtered query lists. |
| GA4 summary/event/page/landing | Wizard GA4 overview/report; property `properties/552679302`, timezone Asia/Tokyo | Prefer typed official GA4 Data API via existing `lib/ga4Data.mjs` service account when configured; Wizard GA4 adapter can satisfy supported reads. No claim of stable `kpis` labels as raw schema. |
| GA4 day series and event by page | Not established by Gate 1 Wizard response | Implement official `runReport` `date` and validated `eventName × pagePath` where supported, or return UNKNOWN for unavailable dimensions. Do not use event-filtered page sessions as unfiltered denominator. |
| Blended landing | Wizard `get_blended_landing_pages` table, outer join | Add source flags; if no impressions field, merge GSC page aggregate by canonical key with separate provenance or return UNKNOWN. Do not equate blended keyEvents with reserve clicks. |
| Realtime | GA4 Realtime | Independent optional short-lived block; not mixed with settled period. |
| Indexing / 404 | No Gate 1 source acceptance for these metrics | Technical view NOT_CONFIGURED/UNKNOWN until appropriate, explicitly authorized source. Never infer 404 from a sitemap. |

The connected GSC Wizard MCP is an analysis path, **not automatically a deployable server SDK**. Before writing the server adapter, confirm the read-only API's supported endpoints, authentication header, quotas, pagination and field semantics from its official documentation using secure server credentials. If it cannot supply a required dimension, use the existing authorized official Google API route or mark it UNKNOWN; no browser-side key and no invented endpoint. No API key is needed to finish Gate 1.

## Internal cache and freshness

Cache key includes provider, property, exact start/end, timezone, dimensions, filters, organicOnly, schema/rule version and cursor. Singleflight concurrent identical requests; a 28-day view should make one call per distinct dataset, shared by its widgets. Store validated server-side snapshots; never shared CDN-cache authenticated responses. Do not cache raw OAuth tokens as data. Errors may use a short backoff entry but must not overwrite last good evidence.

| Dataset | TTL | Data freshness budget and handling |
|---|---|---|
| GA4 Realtime | 30 seconds | After 2 minutes without a successful refresh, STALE; optional and separate. |
| GA4 recent daily/event/page | 15 minutes | If `endDate` requested is incomplete: DELAYED. Successful snapshot older than 60 minutes: STALE. |
| GSC recent daily/query/page | 3 hours | Honor `settledThrough`; if it lags more than 5 calendar days from now, STALE even when cache is warm. |
| GSC+GA4 blended | 3 hours | Freshness is minimum of both contributing sources; no fresh status when either is stale/error. |
| Historical settled segments older than 30 days | 24 hours | Recheck if source correction or invalidation occurs; preserve source timestamp. |
| First-party editorial/deploy annotations | 15 minutes | Date/provenance validated; changes invalidate relevant range. |
| Verified external algorithm annotations | 24 hours | Never substitute news rumor as verified. |

On upstream failure, server may expose an optional last-good snapshot with timestamp in evidence but primary metric `ERROR`/`STALE` and `value:null`. No stale value is silently served as current. Bypass/invalidate affected cache on schema/provider or GTM configuration changes; partial cache hits retain per-source freshness.

## Auth and secrets

- Use existing browser `AdminApi` bearer path and server `getAuthedContext(req)` for **every** v2 route, including detail. Verify authorization policy for Site Insights access before accepting an arbitrary Supabase account; follow established Admin member roles rather than treating any valid JWT as universal authorization. No service-role key for read-only browser operations.
- Environment: `GSC_WIZARD_API_KEY` (read-only secret, server only), `GA4_PROPERTY_ID=552679302`, `GA4_SERVICE_ACCOUNT_JSON` (existing server-only route when used), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (existing Auth config). Only names and dummy values go in `.env.example`; production secrets go through secure host environment settings. Measurement ID and GTM ID are public identifiers; no need to ship the read-only key to clients.
- Scope outbound hosts to documented Wizard and official Google API endpoints; forbid user-controlled URL fetch, open redirects and SSRF. Never expose keys, access tokens, complete provider error bodies or raw personal/health input in HTML, JS, API payload or logs. Parameter allowlists exclude `link_text`, arbitrary `link_url` and form answers.
- Browser response `Cache-Control: private, no-store`; bounded query/cursor values, strict date validation, escaped text and rate limiting. Provider error maps to safe code and message. No cross-user cache leakage (source data is site aggregate, but cache is only server-internal and endpoint remains authenticated).

## Verification contract

Fixture tests must assert GSC percent-point CTR normalization (`2` → `0.02`), GA4 fraction preservation (`0.348...`), complete daily range, zero versus omitted, denied versus not configured, incomplete previous period, page path normalization, outer join source flags, nonadditive users, keyEvents distinct from reserve clicks, and unsupported event/page attribution UNKNOWN. Integration read uses 7/28/90 requests against the real authorized sources in Gate 2; compare one total and a sampled day/row to source. Verify response contains no secrets and existing `/api/admin/analytics` remains unaffected.
