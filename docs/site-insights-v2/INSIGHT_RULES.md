# Site Insights v2 — Deterministic Insight Rules v1 (Gate 1)

Updated: 2026-09-29. No LLM call in the request path. Every output is a rule ID, evidence, an interpretation label, confidence and a source-aware drilldown link. Never turn an unavailable value into zero or infer causality from simultaneous movement.

## Common gate and comparisons

`C` = current N complete settled days, `P` = immediately previous N complete settled days; N is 7, 28 or 90. Require exact days, same source and compatible dimensions for a comparative claim. `delta = C-P`, `relative = delta/P` only if P>0. Any non VALUE/ZERO status in required inputs suppresses that rule with a reason code; incomplete history yields `comparison_unavailable`. If C or P is zero after a successful complete read it remains a true zero. Do not use GSC query/page top-N totals for site totals. Do not use GA4 users summed across days. Only top three nonduplicative insights are shown; deterministic priority: data health > high intent > search/traffic > content opportunities. A suppressed candidate is not shown as “no change.”

CTA measurement starts with GTM v3 on **2026-09-27**. A pre-start day is NOT_CONFIGURED; a window straddling the start is UNKNOWN as a full-window CTA count. Therefore CTA trends and any CTA-based comparison rule are suppressed until both C and P are fully covered. Show measured partial observations only with their explicit covered dates. This prevents a new tag from looking like sudden demand growth.

Thresholds reflect observed low volume: on the 2026-08-30–09-26 settled window, 43 GSC clicks total, median 1/day, max 5/day; 1,674 impressions, median 59/day. These are **initial safety floors**, not claims of statistical significance. Defaults can be versioned after live QA, with rule version and threshold set recorded in evidence.

| N | Click baseline minimum P | Click absolute delta | Session baseline minimum P | Session absolute delta | Impressions baseline minimum P | Impressions absolute delta | CTA baseline minimum P |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 7 | 8 | 5 | 8 | 5 | 250 | 100 | 8 |
| 28 | 20 | 10 | 20 | 10 | 800 | 300 | 12 |
| 90 | 60 | 30 | 60 | 30 | 2400 | 900 | 30 |

Comparative growth/decline also needs `|relative| >= 0.30`, except search CTR (`>= 0.20` relative and >= 2 percentage points absolute) and event flatness (below). Users may inspect smaller changes in data tables, but the header and insight engine do not call them meaningful. Never label a 1→3 click increase as a +200% anomaly.

## Header selection and What Changed

| ID | Inputs / minimum | Condition | Output template / confidence |
|---|---|---|---|
| `H_DATA` | Health for search, GA4, event reporting | Any core source ERROR, NOT_CONFIGURED, STALE, DELAYED for requested period, or incomplete comparison | “一部のデータを確認できません” / `insufficient_data` or `partial`. No trend verdict; confidence high about data state only. |
| `H_VISITS_UP` | Sessions P floor by N, full C/P | Relative >=30% and absolute >= floor | “訪問が増えています” / medium. Add contributing page candidate only if page-level change is measured in same scope, >=40% of positive session delta, and total/page arithmetic reconciles; otherwise omit cause. |
| `H_VISITS_DOWN` | Same | Relative <=-30% and absolute loss >= floor | “訪問が減っています” / medium; no causal claim. |
| `H_SEARCH_UP/DOWN` | GSC clicks P floor and full C/P | Relative and absolute thresholds met | “Google検索からのクリックが増加/減少” / medium. Priority below verified high-intent signal. |
| `H_STABLE` | All core search, GA4 and P0 metrics complete and both windows complete | No material rule fires | “大きな変化は確認されていません” / medium, **not** “良好”. |
| `H_INSUFFICIENT` | Anything else | Sparse baseline or unavailable comparison | “比較できるデータがまだ十分ではありません” / high about insufficiency. |

Header uses exactly one applicable first rule; What Changed can additionally show up to three compatible findings below. `reserve_click` always renders as “予約画面クリック”, never “予約完了”. `line_click` is a LINE-open action, not a conversation.

## Specific insights

| ID | Required input and minimum volume | Condition | Fact, interpretation, confidence |
|---|---|---|---|
| `I_SEARCH_VISITS_DIVERGE` | GSC clicks and GA4 sessions full C/P, each passes respective baseline and absolute floors | Search clicks rise >=30% while sessions do not rise >=10% and session absolute delta < its floor | Fact: each source's independent change. Interpretation: “検索クリック増に対し訪問の伸びは確認できません”; low, because attribution/date definitions differ. No cross-source conversion or causal loss statement. |
| `I_VISITS_INTENT_FLAT` | Sessions P floor; P0 reserve event history with P>=CTA floor and full C/P | Sessions rise >=30% and absolute floor, reserve absolute growth <3 and reserve relative growth <10% | Fact: sessions and reserve counts. Interpretation: “訪問は増えていますが予約画面クリックは横ばい”; medium. If P reserve below floor, suppress interpretation, show counts only. |
| `I_SEARCH_CTR_DOWN` | Impressions P>=N floor, C>=floor; C/P clicks and impressions complete; CTR P>=0.02 | Impressions rise >=30% with absolute floor AND CTR falls >=2 percentage points and >=20% relative | “表示機会は増え、検索クリック率は低下”; medium. Explain changing query mix as a possibility, not cause. |
| `I_INTENT_UP/DOWN` | Reserve P>=CTA floor by N, C/P full | Relative change >=40% and absolute delta >=5 (7d), 8 (28d), 20 (90d), either direction | “予約画面クリックが増加/減少”; medium. If P=0 and C>0: fact “新たにC回” without percentage or trend headline. |
| `I_PAGE_CONTRIBUTION` | GA4 page/landing sessions in same scope and C/P; aggregate delta passes session rule; a page P>=5 | Page delta >=40% of positive total delta, page delta>=5, no inconsistent truncation | Fact “増分のうち X セッションはページ Y の数値上の増加”; interpretation “寄与候補”; low. Viewed-page views cannot be substituted for landing sessions. |
| `I_QUERY_OPPORTUNITY` | GSC query row impressions>=50 in C, clicks and position measured, C full | Position 4–20 and CTR<=2%; no brand-only automatic exclusion assumption | “検索語 X は表示されているがクリックが少ない”; low, link to raw query. Query privacy/filter means no completeness claim. |
| `I_CONTENT_NEXT_ACTION` | GA4 article views>=30 and event-by-article attribution explicitly validated | Article CTA rate below 1% using **article page views** denominator | “記事からの次の行動が少ない可能性”; low. Disabled until supported event×page evidence exists; total article CTA events cannot be spread across articles. |

For any ratio with a zero denominator, the rate metric is UNKNOWN; successful zero numerator with positive denominator is 0%. `confidence` is `high | medium | low`, reflecting evidence reliability, never a probability. Each insight includes `{ruleId,ruleVersion,periods,thresholds,inputMetricPaths,observed,reasonCode,evidenceRef,confidence}`. Do not expose raw query containing unsafe markup without escaping.

## Daily anomaly markers

Compute on settled GSC dates and GA4 sessions independently, not on the current incomplete day. Baseline: previous **four same weekdays** (28 calendar days); use median and MAD with `robustZ = 0.6745*(actual-median)/max(MAD, floor)`. Floors are 1 click, 10 impressions, 2 sessions to avoid zero MAD explosion. Require `|robustZ|>=3.5`, relative deviation >=60%, and material absolute difference. For GSC click spikes require actual>=10 and delta>=8; drops require median>=10 and loss>=8. For impressions require median>=30, delta>=40; sessions require median>=10, delta>=8. These floors intentionally suppress almost all present low-count click spikes. No marker when fewer than four comparable weekdays, missing/DELAYED dates, or a source error. Maximum five markers per 90-day view; choose largest verified deviations, then date. Marker says “通常より増/減”, links to the day's raw counts, baseline observations and annotation context. It does not assert an algorithm update caused a change.

The GSC Wizard `detect_anomalies` result can be displayed as a separate evidence candidate but is **not** allowed to bypass local minimum volume or completeness gates; record its `modifiedZScore`, source and settledThrough. Backend unit tests must cover 1→3 suppression, a material high-volume change, zero baseline, provider delay, missing same-weekday history, and contradictory source states.
