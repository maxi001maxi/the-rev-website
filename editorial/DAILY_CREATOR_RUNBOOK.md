# Daily Editorial Creator Runbook（v0.7.0候補確認 / v0.6.9互換）

**Current Truth: この文書とGitHub main。** 日次記事を「作り始める」判断と実行は、ChatGPTのプロンプトではなく、ここに書いたコードが行います。

## 0. フロー

```text
毎日（店舗定休日も含む） 既定 05:00 JST / 08_SETTINGS daily_editorial_hour
↓ run_date = 実行日 / target_date = run_date + daily_editorial_lead_days（既定1 = 翌日分）
↓ 理由付き3候補をLINE通知 → オーナーがLINE/GPTで選択
↓ 必要な一次情報InterviewをLINE通知 → 回答後に再開
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

## v0.7.0 候補確認の導入と運用

この節が `daily_editorial_topic_approval_required=TRUE` の運用正本。以降のv0.6.9自動選定手順は互換モードだけに適用する。

1. `supabase/migrations/*_editorial_topic_approval.sql` を適用し、候補・返信のテーブルをservice role限定にする。新APIをVercelへ配備する。
2. Vercelに `THE_REV_LINE_CHANNEL_SECRET` と `THE_REV_LINE_USER_ID` を設定する。GASの同じ宛先を使う。LINE DevelopersのWebhookを `/api/integrations/editorial-status/?mode=line_webhook` に設定し署名付きの本人返信を検証する。認証情報をチャットへ貼らない。
3. 現行Supervisorが一次情報Interviewの原文を `topic_gate_json.notes` / `knowledge_context_json` から利用することを確認する。v0.6.5.2ではWriterへknowledgeを渡す一方、最終Editorは `ctx.first_party_interview` を読むため、v0.7.0のadapterで原文を両方へ渡す。機器・医療効果や未確認の運用ルールを補完しない。
4. 再生成したONE_PASTEに含まれる `DailyEditorialTopicApproval_v0.7.0.gs` を既存GASへ保存し、`installDailyEditorialTopicApprovalV070()` を実行する。新APIとSupervisorを確認した後で、候補承認必須・対象日DAILY・1分返信ポーリングを設定する。旧CreatorとWatchdogも同じ候補経路へ移る。
5. `記事候補` タブに理由・差分・確認の有無が出ること、LINEがAPIに受理されたこと、実際の本人返信が保存されることを確認する。通知失敗をSENT扱いしない。
6. 選択前は制作しない。例: `TP-20261005 2`。GPTでの明示的な選択は既存の認証付きBridge `{action:"topic_choose",source:"GPT",proposal_id,number}`（回答は `topic_answer`）、または接続済みオペレーターが同じ正本の `chooseTopic` / `answerInterview` を実行して保存する。GPT上の返答を常時読めるとは扱わない。
7. 足りない一次情報があれば2問をLINEへ送る。返信例は `TP-20261005 回答` の次行に `1: 回答`、次に `2: 回答`。未知だけの回答でSUFFICIENTにしない。店舗運用の追加アイデアは資料のレーンが登録済みでも個別Interviewを要求する。
8. 全対象日の承認を1分ごとに確認。05時台に返答しなくても翌日・夜に再開する。Queueの読み戻し後にだけ `QUEUE_CREATED`。既存の重複保留記事は、選択・新Queue確認後にSKIPPEDへ移し、原稿と画像却下の履歴は残す。
9. 選択後にも全公開履歴を再確認。新しい重複・対象日の競合は保留をLINE通知する。未選択の記事へ自動で差し替えない。active上限5、画像Review、人間Publishは継続する。

既存の公式LINE通知が接続済みで、LINEの返信受信がまだ未接続なら `installDailyEditorialTopicApprovalGPTV070()` を使える。これは通知を既存GASのtoken/宛先で送り、選択・回答をGPTで保存する経路。通知には「GPTへ返信・LINE返信の自動受付は準備中」と明記する。LINE受信側が未接続でも、GPTで明示的に選択した記事は自動再開する。LINE返信を有効にする通常installerは署名検証と宛先一致を必須にする。両経路とも最終Publishは人間。

日次の候補補充は、既存の `generateBlogTopicCandidates_` / 調査・店舗Fact contextを使って本文を作らず5案だけ生成する。日付ごとの候補IDとSheet読み戻しで重複追加を避ける。直近200候補を評価に渡し、記事の重複は別途全履歴で確認する。候補生成障害では既存候補/登録ideasを照合し、3件揃わなければ通知して止める。週次の旧Blog/GBP生成は承認モード中には記事を作らず、日次の本人選択を待つ。

診断: `inspectDailyEditorialTopicApprovalV070()`。候補だけの補充確認: `refreshDailyEditorialTopicPoolV070()`。通知だけの単発確認: `sendPendingTopicNotificationsGPTV070()`。いずれも候補を自動選択しない。接続状態や通知SENTを、実記事のReview Readyまでの成功証拠と混同しない。

候補はShortlistと `lib/editorialTopicSeeds.mjs` の未使用アイデアから役割の異なる3つを選ぶ。スコアは編集上の順位で、検索ボリュームの実測値ではない。すべて使用済み・重複の場合は `POOL_REFRESH_REQUIRED` を知らせ、週次Shortlist更新または新アイデア追加で補充する。候補不足を隠して自動生成しない。

`TOPIC_SELECTION_WAITING` / `INTERVIEW_WAITING` は正常な人間待ち。故障・容量待ち・重複保留と区別する。通知は失敗時に待ち時間を増やして再試行し、API受理後はローカルにも保存して二重送信を防ぐ。LINEのリトライ保証期間を超える不明な送信は勝手に再送しない。

毎日自動で進むのは**候補提示と、回答済み記事の公開前準備**。記事の選択と最終Publishが未完了なら、毎日の公開そのものは保証できない。

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

1. Bound Apps Script に `editorial/gas/DailyEditorialAutonomy_v0.6.9_ONE_PASTE.gs` の全文を **1ファイルへそのまま貼り付ける**（v0.6.5.2 は既存のまま）。個別管理したい場合だけ Gate / Creator / TopicApproval の3ファイルを使う
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
- `lib/editorialArticleOverlap.mjs`
- `lib/editorialReadiness.mjs`
- `lib/editorialScenePlausibility.mjs`
- `lib/dailyEditorialStateMachine.mjs`
- `lib/dailyEditorialKnowledge.mjs`
- `lib/editorialPublication.mjs`
- `lib/blogMarkdown.mjs`（Publicationが参照する依存。未取得だとNode起動時に停止する）

stdinは `{now,rows,shortlist,settings,evidenceByContentId,articleHistory,outputRows}`。articleHistoryには同一main SHAのcontent/blog全件とSupabase全Draft、outputRowsには21_WEB_BLOG_OUTPUT全件を渡す。履歴取得失敗時は新規選定を止める。Queue/Shortlist/SettingsはライブSheetsを使う。公開の証拠は接続済みSupabaseの `publish_status / publish_verified_at / published_url / publish_commit_sha` だけ。取得できない証拠を推測しない。

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
- 意味的な記事の被りは全記事履歴を用いたanswer-overlap-v1で候補作成前に検査する。説明可能な決定論的ルールのため、未知の言い換えには人間Reviewも必要。
- 新しいテーマの一次情報が登録されるまで、そのレーンの記事はInterview経由になります

## 7. Editorial Consistency v1（2026-10-04）

全履歴Semantic Duplicate Gateはcandidateの読者疑問/答え・意図を比較し、SKIPPED_OVERLAPとduplicate_of/evidenceを返す。同カテゴリだけでは拒否しない。BridgeはGitHub公開記事全件とSupabase Draft全件を取得し、GASは21出力も送る。CreatorはShortlist notesに理由を保存する。

記事別画像はlib/editorialImageSheetView.mjsのcolumn spillを正本とし、Bridge全件・最新順・ID重複排除・GBP parent_blog_id JOINで追従する。

ONE_PASTEのconsistency-v1 runtime adapterは既存SupervisorのLength GateをSTANDARD/EXPERTへ適用し、画像status応答でGBP行の欠落を復旧またはREVIEW_READYを遮断する。STANDARD既定1600、EXPERT既定1400は異常短縮検出の下限で、目標文字数や水増し要求ではない。

GitHub mergeはGASインストールの証明ではない。実行ログ・installed source・実Sheet readbackまで確認する。

予備経路はreviewInputsByContentIdに実Blog/GBP/Bridge/Supabase QAを渡し、返されたreview_readinessがokの行だけREVIEW_READYへ進める。GBP行欠落は旧生成関数による復旧、またはBLOCKEDで止める。
