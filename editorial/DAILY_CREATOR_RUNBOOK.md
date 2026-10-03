# Daily Editorial Creator Runbook（v0.6.9）

**Current Truth: この文書とGitHub main。** 日次記事を「作り始める」判断と実行は、ChatGPTのプロンプトではなく、ここに書いたコードが行います。

## 0. フロー

```text
毎日（店舗定休日も含む） 既定 05:00 JST / 08_SETTINGS daily_editorial_hour
↓ run_date = 実行日 / target_date = run_date + daily_editorial_lead_days（既定1 = 翌日分）
↓ 記事 → QC → GBP → Bridge/Supabase → 画像 → Review Ready → LINE
↓ （現在）人間Publish  ← Safety Gate: AUTO_PUBLISH_ENABLED=false
↓ 公開後状態も自動同期（Supabase → Queue / Bridge / GBPのURL）
```

| 設定（08_SETTINGS） | 既定 | 意味 |
|---|---|---|
| `daily_editorial_lead_days` | 1 | 何日先の記事を準備するか。0 = 当日作成 |
| `daily_editorial_cadence` | `BUSINESS_DAYS` | 対象日に記事を作る条件。`DAILY` にすると毎日（定休日の対象日も作る） |
| `daily_editorial_days` | TU,WE,TH,SA,SU | `BUSINESS_DAYS` のときに対象になる曜日 |
| `daily_editorial_hour` | 5 | Creatorの開始時刻（JST）。11:59まで毎時再試行 |

- `run_date` と `target_date` は別の列。`target_date` 列はCreatorが初回に自動で追加する（既存列は動かさない）
- 記事ID `BLOG-<対象日>-xxxxxx` は対象日を表し、Bridgeは記事の日付を対象日にする
- 例: 10/03 実行 → 10/04分 / 金曜実行 → 土曜分 / 木曜実行 → 金曜は定休日なので `BUSINESS_DAYS` では作らない

## 1. 0 → 10 の担当（毎日）

| 時刻(JST) | 担当 | 内容 |
|---|---|---|
| 04:xx | GAS `scheduledDailyEditorialGateV069` | STARTログ → Bridge `daily_plan` → 公開済みの取りこぼしを `PUBLISHED` に同期 → 判定記録 |
| 05:00〜11:59 毎時 | GAS `scheduledDailyEditorialCreatorV069` | Bridge `daily_create` → **翌日分のQueue行を作成**（読み戻し確認後にCREATED）。翌日分がREVIEW_READYになったらLINE通知（終日・毎時） |
| 常時（1分） | GAS v0.6.5.2 `scheduledDailyEditorialSupervisorV065` | Draft/QC → GBP行 → Bridge/Supabase → IMAGE_PREPARING → REVIEW_READY → LINE |
| 画像Job作成後 | GitHub Actions `Auto Editorial Hybrid Images` | 画像生成・Visual QC・Xserver検証 |
| 08:xx | GAS `scheduledDailyEditorialWatchdogV069` | 対象日の行が無い場合のバックストップ（ERROR_BLOCKED + LINE） |
| 人間 | Review & Publish | **最終Publishのみ人間承認**。GBP投稿も人間 |

判定は `lib/dailyEditorialStateMachine.mjs`（Gate）と `lib/dailyEditorialCreator.mjs`（候補選定・Queue行生成）が唯一の正本です。GASはBridgeの返したQueue行を追記するだけで、独自に判断しません。

## 2. Creatorがやること / やらないこと

- 対象日が営業日か・active上限(5)・対象日の重複をGateが判定し、`CREATE_NEW` のときだけ作成する
- `REVIEW_READY` は件数に数えるが作成を止めない（並行作業）
- 候補は `23_BLOG_TOPIC_SHORTLIST` から決定的に選ぶ
  - 条件: `route_lane=WEB_BLOG` / `decision=PUBLISH` / 未使用 / Raw score ≥ 65 / 直近14日以内の週 / 直近Queueと同一クエリでない
  - 順位: `portfolio_final_score` → `pillar_adjusted_score` → `total_score` → rank → candidate_id
- 既存知識が十分かは `lib/dailyEditorialKnowledge.mjs` の登録済み一次情報だけで判断する。未登録のレーン（例: PERFORMANCE）は **Interviewが必要** で、自動作成しない
- 作成する行は契約どおり `DRAFTING / SUFFICIENT / NOT_REQUIRED / NOT_STARTED`（`PENDING` は禁止）
- Supervisorが未導入・未起動なら **作成しない**（孤立行を作らない）
- 「CREATE_NEWを記録しただけ」「Watchdogが失敗通知しただけ」は成功ではない

## 3. 失敗は必ず可視化される（ERROR_BLOCKED + LINE、1日1回）

| kind | 意味 | 人間の対応 |
|---|---|---|
| `SUPERVISOR_NOT_WIRED` | v0.6.5.2 Supervisorが無い/Triggerが無い | `installEditorialV065()` を実行 |
| `CREATOR_PLAN_FAILED` | Bridge/Supabase/Sheets不達 | Vercel / Supabase を確認 |
| `NO_ELIGIBLE_CANDIDATE` | Shortlistに使える候補がない | 週次Shortlistを再実行 |
| `INTERVIEW_REQUIRED` | 候補はあるが既存知識が不足 | Interview回答、または候補/知識登録の追加 |
| `SUPERVISOR_NOT_PICKING_UP` | 作成から10分以上DRAFTINGのまま | Supervisor Trigger/実行ログを確認 |
| `STAGE_STALLED` / `IMAGE_STALLED` | 30分/6時間以上進まない | 実行ログ / Actions を確認 |

LINEの送信失敗は `18_AUTOMATION_LOG` に `unverified` として残り、Queue状態も記事生成も止めません。

## 4. 導入手順（1回だけ・Apps Script）

1. Bound Apps Script に `editorial/gas/DailyEditorialAutonomy_v0.6.9_ONE_PASTE.gs` の全文を **1ファイルへそのまま貼り付ける**（v0.6.5.2 は既存のまま）。個別管理したい場合だけ Gate / Creator の2ファイルを使う
2. `startDailyEditorialAutonomyV069()` を1回実行する。Trigger導入（Gate 04時台 / Creator 毎時 / Watchdog 08時台）と、対象日分の初回準備を1回で行う。Supervisor（`scheduledDailyEditorialSupervisorV065` または v0.6.7 の `...V067`）のTriggerが無ければ失敗して止まる。旧v0.6.8 Asset Ledgerが保護付きPreview aliasを参照しないよう `EDITORIAL_STATUS_BASE_URL=https://the-rev-website.vercel.app` も同時に修復する
3. `26_DAILY_EDITORIAL_QUEUE` に対象日（target_date）の行、`18_AUTOMATION_LOG` に `DAILY_EDITORIAL_CREATE / CREATED` が出ることを確認する
4. GASソースを変更したら `npm run build:gas-bundle` でONE_PASTEを再生成し、Apps Scriptへ貼り直して `installDailyEditorialAutonomyV069()` を再実行する（Bundleの古さはCIが検出する）。`runDailyEditorialCreatorV069Once()` は時間帯に関係なく対象日分を1回準備する
5. Vercel側は `main` にマージされた `/api/integrations/editorial-status`（`daily_plan` / `daily_create`）が必要

## 5. 外部ChatGPT Scheduled Task の扱い

GAS Creatorの本番Triggerを確認できたら予備タスクは縮小または無効化する。未導入の間は以下の機械的フォールバックを使う。

残す場合は **独自判断を一切してはならない**。許される役割は次の機械的フォールバックだけです。

```text
1. 18_AUTOMATION_LOG に開始記録（DAILY_EDITORIAL_FALLBACK START）を書く。
2. 新規作成判定とは別に、既存の未完了行を全日付で確認する。対象日が定休日・新規不要でも、前日分のIMAGE_PREPARING等の進行確認を省略しない。
3. 26_DAILY_EDITORIAL_QUEUE に対象日（実行日+daily_editorial_lead_days、既定は翌日）の行（target_date。空ならrun_date。SKIPPED以外）があれば、何もしない。終了。
4. 無ければ 26_DAILY_EDITORIAL_QUEUE と 23_BLOG_TOPIC_SHORTLIST の全行・08_SETTINGSの daily_editorial_* を
   POST https://the-rev-website.vercel.app/api/integrations/editorial-status/ {action:"daily_create", now, rows, shortlist, settings}
   に送る（Bearer EDITORIAL_BRIDGE_SECRET）。
5. creation.status が READY_TO_CREATE なら、creation.queue_row を一切変更せず26_DAILY_EDITORIAL_QUEUEへ追記する。
   NOT_REQUIRED なら何も作らない。それ以外（NO_ELIGIBLE_CANDIDATE / INTERVIEW_REQUIRED）はERROR_BLOCKEDとして通知する。
6. REVIEW_READYやactive件数・店舗定休日を理由に自分で停止しない。決めるのはBridgeのdecisionだけ。PrimaryのGASと同じAPIを使うので、同時に動いても対象日の行は1本だけになる。
7. 終了時に18_AUTOMATION_LOGへ最終状態（CREATED / NO_ACTION / ERROR_BLOCKED）を書く。
8. 最終Publishも GBP投稿も行わない。
```

### Bridge資格情報を持たない接続済みタスクの予備経路（2026-10-03）

認証なしの公開APIを追加しない。BridgeのBearer secretを取得できない場合は、GitHub mainの同じcommitから次のファイルを取得し、`scripts/daily-editorial-connector-plan.mjs` をNodeで実行する。

- `scripts/daily-editorial-connector-plan.mjs`
- `lib/dailyEditorialCreator.mjs`
- `lib/dailyEditorialStateMachine.mjs`
- `lib/dailyEditorialKnowledge.mjs`
- `lib/editorialPublication.mjs`

stdinは `{now,rows,shortlist,settings,evidenceByContentId}`。Queue/Shortlist/SettingsはライブSheetsを使う。公開の証拠は接続済みSupabaseの `publish_status / publish_verified_at / published_url / publish_commit_sha` だけ。取得できない証拠を推測しない。

判定は既存の `planDailyCreation` そのもの。独自のテーマ選定、Knowledge判定、Gateの再実装は禁止。返されたpatchは既存列だけへ適用し、`creation.queue_row` を変更せず追記する。追記直前にtarget_dateの重複を読み直す。読み戻しで永続化を確認し、候補をSELECTEDへ同期する。

5時開始と8時・11時の再試行は毎日（JST）。対象日cadenceはSettingsを維持する。定休日の対象日への新規作成がNO_ACTIONでも、既存の未完了記事の監視は続ける。日付を跨いだReview Readyも未確認通知として報告する。LINE未確認をSENTにしない。

予備経路も自動運転の保証ではない。実行後のQueue・Bridge・画像READY・通知を別々に確認し、途中状態を成功としない。GASの新しいソースはGitHub mergeだけでは配備されない。

## 6. 既知の限界

- デプロイ済みv0.6.5.2のReview Ready通知は `run_date` が当日の間だけ動きます。日付をまたいでREADYになった記事はCreatorが通知を補います
- 公開後の同期対象は Supabase / Queue / Bridge / GBPのURL です。`01_POST_HISTORY` はInstagram用（企画・類似判定・実績同期）なのでBlogは書き込みません
- 自動公開は未実装です。`lib/editorialAutoPublishGate.mjs` のGate（env + 設定の2鍵）だけがあり、executorを追加・登録するまで公開は必ず人間です
- 導入日は `runDailyEditorialCreatorV069Once()` を1回実行すると、その日のうちに翌日分を準備できます
- GAS（Gate / Creator / Watchdog）は自動配備されません。Apps Scriptへの貼り付けと `install...` の実行は人間が1回行う必要があります
- v0.6.5.2 Supervisor本体はGitHubに無くDriveの貼り付け用パッチ文書のみです（Creatorはその選別条件に合う行を生成するよう、テストで固定しています）
- 意味的な記事の被り（同一クエリではない類似テーマ）は、週次のTopic Gate / Shortlist段階の判定に依存します
- 新しいテーマの一次情報が登録されるまで、そのレーンの記事はInterview経由になります
