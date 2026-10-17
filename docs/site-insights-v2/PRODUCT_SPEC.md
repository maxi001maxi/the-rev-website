# Site Insights v2 — Product Specification (Gate 1)

Updated: 2026-09-29. Gate 2 is implementation; this document fixes behavior without changing the existing Admin interface in Gate 1.

## Goal and two layers

The operator should recognize in 3–5 seconds whether search visibility, site visits, and meaningful intent are improving, stable, deteriorating, or cannot yet be judged. **Layer 1 shows a status, 4–6 numbers, and up to three changes. Layer 2 reveals period, source, daily series, raw aggregated rows and the rule behind each claim.** Fact labels (“検索クリック 43”) and rule-based interpretations (“増加の主因候補”) must be visually and semantically distinct. Never promise a confirmed booking.

The current Admin Analytics remains at `/admin/analytics/`. Implement v2 at a separate route or safely versioned replacement after Gate 2 acceptance; preserve existing Supabase Auth, navigation and article workflows. Desktop first; mobile prioritizes status, KPI, trend, then changes with compact cards instead of a wide mandatory table.

## Top view, default 28 settled days

1. **Status header.** One sentence and state `improving | declining | stable | insufficient_data | partial`. The sentence links to a rule ID and evidence panel. If search is DELAYED/ERROR and GA4 is healthy, say what can be observed, without a site-wide “良い” verdict. Show `データは YYYY-MM-DD まで` per source and a partial badge.
2. **Six KPI slots, in order:** Google検索クリック, 訪問 (`sessions`), アクティブユーザー, ページ表示, 予約画面クリック (`reserve_click`), LINEを開いた (`line_click`). Each shows `Metric` status, previous period absolute/relative delta when valid, unit, meaning tooltip and source. Impressions/CTR appear in Search detail. If any slot is unavailable, keep its status visible; do not collapse the layout to imply zero.
3. **Main trend.** Two aligned small panels sharing dates: Search clicks (GSC) and Sessions (GA4); optional Booking Intent overlay only on a separate event panel/toggle because units, attribution and sparsity differ. Default 28; switches 7/28/90. Each point has source status and tooltip with calendar/timezone. Anomalies appear as markers with a reason and evidence. Dashed or missing segments indicate missing/unsettled days; no zero interpolation.
4. **What changed.** At most three cards, ranked by materiality/confidence, from deterministic rules. Each gives a fact, an explicitly marked interpretation (if one exists), a comparison period and a link to evidence. Never emit a causal “because of page X” solely from two concurrent movements; use “寄与が大きいページ候補” only after contribution arithmetic and comparable scope.
5. **Funnel.** Search impressions → GSC clicks → GA4 sessions → `price_click` / `article_cta_click` → `line_click` / `reserve_click`. Counts with source chips and denominators; stages are **not mutually exclusive**. Show directional journey, not exact user transition or mathematically valid cross-source conversion. Across GSC/GA4 edge, label “異なる計測元・直接の転換率なし”. Within GA4, event counts can exceed sessions through repeats. No confirmed reservation stage until an authoritative booking integration exists.

Use 7/28/90 complete GSC days anchored by `settledThrough`. Default 28 even if the 90-day lookback is not complete. Relative comparison requires the exact previous N dates and complete data for the metric. Otherwise show absolute value plus `比較できません`. The “today” realtime strip is optional and separate from this settled view; it never drives the main status.

## Day drilldown

Click a day on the trend to open a URL-addressable panel (range and ISO day preserved); keyboard activation and close return focus to the original point. Header contains source-aware date and status. Sections: (1) daily Sessions, Search Clicks, Booking Intent, LINE Intent and valid comparison with same weekday only where rules permit; (2) top 10 GA4 viewed pages and source/medium, with session/page scope indicated; (3) top 10 GSC queries and pages for that date; (4) CTA event counts; (5) verified annotations. Expose “数値の定義と取得元” to drill into raw aggregate rows and timestamps. A field without evidence displays its status, never a synthetic zero. Day-specific `article_cta_click` can be shown by event; article-slug attribution is UNKNOWN until an approved GA4 registered dimension or supported official `eventName × pagePath` query is validated.

The panel must not claim that a particular search query led to a reserve click: Search Console query data and GA4 events lack person-level joining keys and should remain aggregate. Date-line annotations are correlation context, not automatic root causes.

## Detail views

| View | Purpose and fixed contents | Evidence behavior |
|---|---|---|
| Search | Clicks, impressions, CTR, average position; top/rising/falling queries and pages; CTR and position 4–20 opportunities | Time window and GSC source; minimum impression guards; privacy-suppressed query rows do not reconcile to total. Opportunity is a hypothesis, not a forecast. |
| Content | Blog/ordinary page separation; GA4 page views, sessions where semantically supported, engagement; GSC search clicks; article CTA and other CTA counts/rates when event/page attribution is proven | Viewed page ≠ landing page. Show UNKNOWN for CTA per article if the provider cannot return event by page. Avoid filtered GA4 sessions as CTA denominator. |
| Funnel | Source-specific stage counts and within-GA4 diagnostic rates with explicit denominator; no completed reservation | Explain overlap/repeat and mismatch between GSC clicks and sessions. |
| Technical | GA4, GSC, blended and API status/freshness; indexing/sitemap/404 only when a real configured source is present | Health check wording; no speculative “all pages indexed”. Detailed technical logs are for evidence or maintenance, not top layer. |

Advanced filters (source, device, country, page/query, event) live in relevant details. Page and query lists paginate with stable sort, accessible empty states and explicit coverage. Metric tooltips in plain Japanese use `DATA_CONTRACT.md` definitions. No revenue, reservation completion or AI-generated prose in v2 initial release.

## State and trust UI

`ZERO` renders `0`; `UNKNOWN` renders `— / 根拠不足`; `NOT_CONFIGURED` offers an administrator-only setup pointer; `DELAYED` shows “反映待ち” with expected source lag; `ERROR` has retry; `STALE` shows “最終成功: timestamp” and optional last-good value clearly marked historical. Partial data never yields a blanket stable/improving badge. GSC status dates and GA4 timezone are accessible in the evidence panel. Protect against overselling low-volume percentage swings.

## Acceptance in Gate 2

For each of 7/28/90: status and dates align with provider, a successful zero differs from an error, comparison uses correct complete windows, and only evidence-backed insight cards render. All four P0 event labels are accurate. Day click opens a consistent evidence panel; Search, Content, Funnel, Technical have correct status behavior. Keyboard and mobile paths are usable. Existing Admin login, Analytics and article operations still work. No UI work occurs in Gate 1.
