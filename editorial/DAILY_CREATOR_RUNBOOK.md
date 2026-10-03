# Daily Editorial Creator Runbook（v0.6.9）

**Current Truth: この文書とGitHub main。** 日次記事を「作り始める」判断と実行は、ChatGPTのプロンプトではなく、ここに書いたコードが行います。

## 0. フロー

```text
毎日一定時刻（既定 05:00 JST / 08_SETTINGS daily_editorial_hour）
↓ 翌日分を自動準備（run_date = 実行日 + daily_editorial_lead_days、既定1）
↓ 記事 → QC → GBP → 画像 → Review Ready（前日のうちにLINE通知）
↓ （現在）人間Publish
↓ 公開後状態も自動同期（Queue / Bridge / GBPのURL）
```

- 実行は毎日。営業日判定は **`run_date`（対象日）** で行う。金曜の実行は土曜分を作り、木曜・日曜の実行は翌日が定休日なので何も作らない
- `daily_editorial_lead_days=0` にすると当日作成に戻る

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
2. `installDailyEditorialAutonomyV069()` を実行する（Gate 04時台 / Creator 毎時 / Watchdog 08時台。Supervisor未導入なら失敗して止まる）。このInstallerは旧v0.6.8 Asset Ledgerが保護付きPreview aliasを参照しないよう、`EDITORIAL_STATUS_BASE_URL=https://the-rev-website.vercel.app` も同時に修復する
3. `runDailyEditorialCreatorV069Once()` で翌日が営業日の日に1回確認し、`26_DAILY_EDITORIAL_QUEUE` の翌日（run_date）行と `18_AUTOMATION_LOG` の `DAILY_EDITORIAL_CREATE / CREATED` を確認する
4. GASソースを変更したら `npm run build:gas-bundle` でONE_PASTEを再生成し、Apps Scriptへ貼り直して `installDailyEditorialAutonomyV069()` を再実行する（Bundleの古さはCIが検出する）。`runDailyEditorialCreatorV069Once()` は時間帯に関係なく対象日分を1回準備する
5. Vercel側は `main` にマージされた `/api/integrations/editorial-status`（`daily_plan` / `daily_create`）が必要

## 5. 外部ChatGPT Scheduled Task の扱い

**推奨: 無効化** する。Creatorが作成するため不要です。

残す場合は **独自判断を一切してはならない**。許される役割は次の機械的フォールバックだけです。

```text
1. 18_AUTOMATION_LOG に開始記録（DAILY_EDITORIAL_FALLBACK START）を書く。
2. 26_DAILY_EDITORIAL_QUEUE に対象日（実行日+daily_editorial_lead_days、既定は翌日）のrun_dateの行（SKIPPED以外）があれば、何もしない。終了。
3. 無ければ 26_DAILY_EDITORIAL_QUEUE と 23_BLOG_TOPIC_SHORTLIST の全行・08_SETTINGSの daily_editorial_* を
   POST https://the-rev-website.vercel.app/api/integrations/editorial-status/ {action:"daily_create", now, rows, shortlist, settings}
   に送る（Bearer EDITORIAL_BRIDGE_SECRET）。
4. creation.status が READY_TO_CREATE なら、creation.queue_row を一切変更せず26_DAILY_EDITORIAL_QUEUEへ追記する。
   NOT_REQUIRED なら何も作らない。それ以外（NO_ELIGIBLE_CANDIDATE / INTERVIEW_REQUIRED）はERROR_BLOCKEDとして通知する。
5. REVIEW_READYやactive件数を理由に自分で停止しない。決めるのはBridgeのdecisionだけ。
6. 終了時に18_AUTOMATION_LOGへ最終状態（CREATED / NO_ACTION / ERROR_BLOCKED）を書く。
7. 最終Publishも GBP投稿も行わない。
```

## 6. 既知の限界

- デプロイ済みv0.6.5.2の通知（Review Ready / ERROR）は `run_date` が当日の行だけが対象です。翌日分のReview Ready通知はCreatorが補い、ERRORはCreatorのstuck通知で補います
- Bridgeへ送る記事の `published` 日付は `run_date`（翌日）になります。前日のうちにPublishすると、記事の表示日付は翌日になります
- 初回導入日は当日分を作りません（翌日分から開始）
- GAS（Gate / Creator / Watchdog）は自動配備されません。Apps Scriptへの貼り付けと `install...` の実行は人間が1回行う必要があります
- v0.6.5.2 Supervisor本体はGitHubに無くDriveの貼り付け用パッチ文書のみです（Creatorはその選別条件に合う行を生成するよう、テストで固定しています）
- 意味的な記事の被り（同一クエリではない類似テーマ）は、週次のTopic Gate / Shortlist段階の判定に依存します
- 新しいテーマの一次情報が登録されるまで、そのレーンの記事はInterview経由になります
