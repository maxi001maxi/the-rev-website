# REV-EXP-2026-001｜Control Baseline v1

Status: WEB BASELINE LOCKED / END-TO-END BASELINE PARTIAL  
Date: 2026-10-07 JST  
Owner: Website / Analytics + Company OS  
Related Decision: DEC-20261007-MARKETINGEXP001

## 1. Purpose

REV-EXP-2026-001（初回体験で「何を見る・何が分かる・何を持ち帰れるか」を具体化する実験）を開始する前に、Controlの実測値とUNKNOWNを固定する。

UNKNOWN != ZERO を維持し、取得できない予約開始・予約完了を推測で埋めない。

## 2. Control runtime

Production runtime code:

- Git SHA: `f260ddb9f00b57b59322dff97409f10f99a385a5`
- Vercel Deployment: `dpl_Csfd5qQvPyGb3vqVj1Q95DWEtrfa`
- State: READY
- Measurement Gate: PASS

その後のmain差分はMeasurement Gate / GA4 Current Truthのdocumentation onlyであり、このBaselineのruntime Controlは上記Productionを採用する。

## 3. Primary reference window

Baseline reference window:

`2026-09-30 ～ 2026-10-06`

- 7 complete calendar days
- 2026-10-07 today partialは除外
- Google Analytics Data API direct read
- period unique active usersはMorning RPCのperiod-unique値を使用
- daily active usersの単純合計はunique usersとして扱わない

## 4. Web Control Baseline

| Metric | Baseline | Semantics |
|---|---:|---|
| Sessions | 94 | completed 7-day sessions |
| Active Users | 64 | period_unique_active_users |
| New Users | 58 | GA4 new users |
| Page Views | 154 | GA4 screenPageViews |
| Page Views / Session | 1.638 | 154 / 94 |
| reserve_click | 2 | external booking page open intent |
| reserve_click / 100 Sessions | 2.128 | diagnostic only, NOT booking CVR |
| line_click | 0 | observed event count |
| price_click | 2 | observed event count |
| price_click / 100 Sessions | 2.128 | diagnostic |
| article_cta_click | 3 | observed event count |
| article_cta_click / 100 Sessions | 3.191 | diagnostic |

Important:

`reserve_click != reservation_start != reservation_complete`

## 5. Broader collection context

GA4 collection context:

### Traffic collection available
`2026-09-25 ～ 2026-10-06`

- Sessions: 198
- Page Views: 337
- New Users: 137

### P0-event comparable context
`2026-09-27 ～ 2026-10-06`

- Sessions: 155
- reserve_click: 6
- line_click: 1
- price_click: 5
- article_cta_click: 5

2026-09-25 / 09-26のP0 event fieldsはNULLであり、0へ変換しない。

Primary experiment comparisonには直近7 complete daysを採用し、上記はcontextとしてのみ保持する。

## 6. End-to-end funnel baseline

| Funnel Stage | Baseline | Status |
|---|---:|---|
| Site Sessions | 94 | VALUE |
| Eligible Trial Exposure Sessions | null | UNKNOWN |
| reserve_click | 2 | VALUE |
| reservation_start | null | UNKNOWN |
| reservation_complete | null | UNKNOWN |
| Trial Show | null for same 7-day window | UNKNOWN |
| Trial -> Membership | null for same 7-day window | UNKNOWN |
| 30-day Retention | null | UNKNOWN |

理由:

1. `view_trial` / experiment exposure eventは現在未実装。
2. GYM'S confirmed bookingはauthoritative sourceだが自動同期されていない。
3. KPI / GYM'S snapshotは2026-10-03 15:48 JST時点でstale。
4. user-confirmed dataでは2026-10-03 15:48以降の一部期間について問い合わせ0 / 体験予約0、2026-10-04の体験来店0 / 新規有料0が確認されているが、7日間全体のBaselineへ外挿しない。

## 7. Historical lower-funnel reference

2026-09 monthly KPI:

- Trial Visits: 4
- Trial -> Paid: 3
- Trial -> Paid Rate: 75%

これは小標本かつBaseline reference windowと期間が異なるため、REV-EXP-2026-001のPrimary Control値としては使わない。
Guardrail / historical contextとしてのみ使用する。

## 8. Primary KPI status

Phase 5で定義されたPrimary KPI:

`Reservation Completion Rate = reservation_complete / Eligible Trial Sessions`

Current Baseline:

- reservation_complete: UNKNOWN
- Eligible Trial Sessions: UNKNOWN
- Reservation Completion Rate: UNKNOWN

したがって、Primary KPIの数値Baselineを捏造しない。

## 9. Required Control Capture before Treatment

REV-EXP-2026-001 Treatment開始前に、Control Captureを追加する。

Visual / offer / priceは変更しない。

必要条件:

1. Treatmentと同一placementでControl exposureを計測できるeventを実装
   - canonical candidate: `view_trial` または `experiment_exposure`
   - experiment_id: `REV-EXP-2026-001`
   - variant: `control`
2. `reserve_click`は既存契約を維持
3. GYM'S confirmed bookingをauthoritative sourceとして集計
4. Company OSへPIIを保存せず、件数のみ記録
5. 少なくとも7 complete calendar daysをControl Capture
6. today partialはBaseline確定に含めない

7日間は統計的十分性を意味しない。
曜日構成を一巡させ、Primary KPIのControl denominator / numeratorを実測するための最低運用期間とする。

Treatment実験そのもののMinimum DurationはPhase 5どおり最低28日。

## 10. Experiment lock

Control Capture完了まで変更しない:

- Trial price: ¥3,300
- Joining fee: ¥22,000
- Normal prices
- Booking destination
- Main CTA intent
- Business hours
- Broad site positioning
- Free trial / discount / joining-fee campaign

Treatment開始時に変更する変数は、

「初回体験で何を見る・何が分かる・何を持ち帰れるか」の具体性

のみ。

## 11. Decision rule

Current Phase 1 result:

- Web Baseline: PASS / LOCKED
- End-to-end Baseline: PARTIAL
- Primary KPI Baseline: UNKNOWN
- Control Capture: REQUIRED
- REV-EXP-2026-001 Treatment launch: BLOCKED until Control Capture completes

This is not a Measurement Gate regression.
Measurement infrastructure is working; the remaining gap is experiment-specific exposure + authoritative booking baseline.
