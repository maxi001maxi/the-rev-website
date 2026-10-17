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
6. 選択前は制作しない。例: `TP-20261005 2`。GPTでの明示的な選択・回答は、private `editorial_gpt_operator_requests` へ**入力だけ**をenqueueする。Proposal本体を直接UPDATEしない。1分pollの本番Topic APIがPENDING requestをclaimし、既存の `changeProposal()` → `chooseTopic()` / `answerInterview()` を通してのみ状態遷移する。既存の認証付きBridge `topic_choose` / `topic_answer` も同じstate machineを使う。Requestは `APPLIED` / `REJECTED` をreadbackし、REJECTEDを成功扱いしない。
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
| 05:00〜11:59 毎時 | GAS `scheduledDailyEditorialCreatorV069` | **Topic Approval OFF時のみ**。Bridge `daily_create` で従来Creatorを実行。Topic Approval ONではTrigger自体を置かない |
| 常時（1分） | GAS `scheduledDailyEditorialTopicApprovalV070` + v0.6.5.2 `scheduledDailyEditorialSupervisorV065` | Topic Approvalが候補・承認・Stuck監視を担当。SupervisorはDraft/QC → GBP → Bridge/Supabase → Image → Review Readyを担当。P1/P3 adapterを含む |
| 画像Job作成後 | GitHub Actions `Auto Editorial Hybrid Images` | 画像生成・Visual QC・Xserver検証 |
| 08:xx | GAS `scheduledDailyEditorialWatchdogV069` | **Topic Approval OFF時のみ**。従来Creatorのmissing Queueバックストップ。Topic Approval ONではTrigger自体を置かない |
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
| `IMAGE_OPERATOR_BLOCKED` | Provider credits等の外部依存でOperator停止 | 原因を解消。attemptは無駄に消費しない |
| `IMAGE_OPERATOR_FAILED` | Max attempts / Operator ERROR / Overlay QC rejected | Image Operator / QCを確認して修復・再queue |

LINEの送信失敗は `18_AUTOMATION_LOG` に `unverified` として残り、Queue状態も記事生成も止めません。

## 4. 導入手順（1回だけ・Apps Script）

1. Bound Apps Script に `editorial/gas/DailyEditorialAutonomy_v0.6.9_ONE_PASTE.gs` の全文を **1ファイルへそのまま貼り付ける**（v0.6.5.2 は既存のまま）。ONE_PASTEには Gate / Creator / TopicApproval / `DailyEditorialSupervisorRecovery_v0.7.1.gs` / `DailyEditorialImageOperatorStatus_v0.7.2.gs` / `DailyEditorialTriggerTopology_v0.7.3.gs` が含まれる
2. `startDailyEditorialAutonomyV069()` を1回実行する。v0.7.3が設定に応じてTriggerを正規化する。Topic Approval ONでは `Gate 04時台 + TopicApproval 1分 + 既存Supervisor 1分` のみとし、Creator毎時 / Watchdog 08時台は削除する。Topic Approval OFFでは従来どおり Gate + Creator + Watchdog を使う。Supervisor（`scheduledDailyEditorialSupervisorV065` または v0.6.7 の `...V067`）は削除・再作成しない。旧v0.6.8 Asset Ledgerが保護付きPreview aliasを参照しないよう `EDITORIAL_STATUS_BASE_URL=https://the-rev-website.vercel.app` も同時に修復する
3. `26_DAILY_EDITORIAL_QUEUE` に対象日（target_date）の行、`18_AUTOMATION_LOG` に `DAILY_EDITORIAL_CREATE / CREATED` が出ることを確認する
4. GASソースを変更したら `npm run build:gas-bundle` でONE_PASTEを再生成し、Apps Scriptへ貼り直して `installDailyEditorialAutonomyV069()` を再実行する（Bundleの古さはCIが検出する）。`runDailyEditorialCreatorV069Once()` は時間帯に関係なく対象日分を1回準備する
5. Vercel側は `main` にマージされた `/api/integrations/editorial-status`（`daily_plan` / `daily_create`）が必要

## 5. 外部ChatGPT Scheduled Task の扱い

本番のGate / Topic Approval / Creator / Supervisorが実稼働していることを確認できた後、外部ChatGPT Taskは**第二のEditorial実行系ではなく独立Watchdog**として扱う。

2026-10-05監査時点の運用:
- 外部Task名: `THE REV Editorial Watchdog`
- 実行: JST **08:45 / 11:45**
- 05:00外部実行は廃止。Primaryの05時台処理と競合させない
- 正常時はLIGHT ONLY。全履歴・全Draft・全画像Workflowを読まない
- Heavy Recoveryは実データで異常条件が成立した場合だけ
- `TOPIC_SELECTION_WAITING` / `INTERVIEW_WAITING` は正常な人間待ちであり、Recovery対象外
- `REVIEW_READY` は正常状態。再QC・再画像検証を行わない
- `BLOCKED_PROVIDER_CREDITS` 等の明示的外部依存は通知だけ行い、無意味なretryでattemptを消費しない

### LIGHT WATCHDOG

毎回の初期READは以下だけに限定する。

1. `08_SETTINGS` の daily_editorial / supervisor / completion関連キー
2. `18_AUTOMATION_LOG` の直近行
3. `26_DAILY_EDITORIAL_QUEUE` の当日run_date・対象target_date・未完了行

次の場合は `HEALTHY / NO_ACTION` で終了する。

- Primary Gate / Topic Approvalの実行証拠がある
- 対象Queueが契約内で前進している
- Supervisor heartbeat / updated_at がstuck閾値内
- 意図した人間待ち
- REVIEW_READY

### CONDITIONAL HEAVY RECOVERY

次のどれかが成立した場合だけ、対象content_idから狭く追加READして復旧する。

- 08時台になってもPrimary Gate / Topic flowの実行証拠がない
- 承認済みで作成されるべきtarget_dateなのにQueue行がない
- 人間待ちではないDRAFTING / QC / PATCHING / BRIDGEがstuck閾値を超え、Supervisor heartbeatも停止
- IMAGE_PREPARINGが契約上のstuck閾値を超えた、またはWorkflowが明示的FAILEDでbounded retry可能
- Queue段階に対して必須のBlog / GBP / Bridge / Supabase rowが欠落・不整合
- Supabaseに検証済みPUBLISHED証拠があるのにQueue / Bridgeが未同期

Heavy Recoveryでも、まず対象content_idだけを読む。新規作成が本当に必要な場合だけcanonical `daily_create` / connector planを使い、その時に限りSemantic Duplicate Gateに必要な全履歴を取得する。画像異常時だけ該当Job / operator state / GitHub Actions / Xserver証拠を読む。

外部Taskは独自のTopic Gate・Knowledge Gate・Duplicate Judge・QC・Ready判定を持たない。最終Publish / GBP投稿も行わない。

### Bridge資格情報を持たない接続済みタスクの予備経路（2026-10-03）

認証なしの公開APIを追加しない。BridgeのBearer secretを取得できない場合は、GitHub mainの同じcommitから次のファイルを取得し、`scripts/daily-editorial-connector-plan.mjs` をNodeで実行する。

- `scripts/daily-editorial-connector-plan.mjs`
- `lib/dailyEditorialCreator.mjs`
- `lib/editorialArticleOverlap.mjs`
- `lib/editorialReadiness.mjs`
- `lib/editorialScenePlausibility.mjs`
- `lib/editorialSceneGrounding.mjs`
- `lib/dailyEditorialStateMachine.mjs`
- `lib/dailyEditorialKnowledge.mjs`
- `lib/editorialPublication.mjs`
- `lib/blogMarkdown.mjs`（Publicationが参照する依存。未取得だとNode起動時に停止する）
- `assets/js/blog-taxonomy.mjs`（blogMarkdownのCategory正本。未取得だとNode起動時に停止する）

stdinは `{now,rows,shortlist,settings,evidenceByContentId,articleHistory,outputRows}`。articleHistoryには同一main SHAのcontent/blog全件とSupabase全Draft、outputRowsには21_WEB_BLOG_OUTPUT全件を渡す。履歴取得失敗時は新規選定を止める。Queue/Shortlist/SettingsはライブSheetsを使う。公開の証拠は接続済みSupabaseの `publish_status / publish_verified_at / published_url / publish_commit_sha` だけ。取得できない証拠を推測しない。

判定は既存の `planDailyCreation` そのもの。独自のテーマ選定、Knowledge判定、Gateの再実装は禁止。返されたpatchは既存列だけへ適用し、`creation.queue_row` を変更せず追記する。追記直前にtarget_dateの重複を読み直す。読み戻しで永続化を確認し、候補をSELECTEDへ同期する。

Primary未導入時の旧05/08/11 Full Fallbackは廃止済み。Primary実稼働後の外部Watchdogは08:45/11:45（JST）のLIGHT-first運用とし、異常時だけこの予備経路へ昇格する。対象日cadenceはSettingsを維持し、LINE未確認をSENTにしない。

予備経路も自動運転の保証ではない。実行後のQueue・Bridge・画像READY・通知を別々に確認し、途中状態を成功としない。GASの新しいソースはGitHub mergeだけでは配備されない。

## 5.0.1 Topic Approval中のStuck Detection

`daily_editorial_topic_approval_required=TRUE` ではCreatorが `v070TopicTick_()` へ早期returnするため、旧v0.6.9 Creator側の `daily_create` 応答に含まれるStuck Detectionが実行されていなかった。現在はTopic APIの通常poll/prepare応答に、同じ正本 `lib/dailyEditorialCreator.mjs -> detectStuckRows()` の結果を付与する。

- `DRAFTING / NOT_STARTED` が `daily_editorial_stuck_timeout_minutes` 超過 → `SUPERVISOR_NOT_PICKING_UP`
- DRAFT/QC系の処理中状態がその3倍を超過 → `STAGE_STALLED`
- `IMAGE_PREPARING` が画像stuck閾値を超過 → `IMAGE_STALLED`
- `ERROR / BRIDGE_ERROR` → `ERROR_STATE`
- `TOPIC_SELECTION_WAITING / INTERVIEW_WAITING / REVIEW_READY` は正常待ちとしてStuck扱いしない
- Topic Approvalの1分pollで検出しても、LINEは既存 `v069cStuckAlerts_()` の日付・content_id・reason単位のde-dupeを使うため同じ異常を毎分通知しない
- Topic選択、Knowledge Gate、Duplicate Gate、Auto Publishの挙動は変更しない

これにより、Topic Approvalを有効にしたことで監視だけ消えるという、人間らしい『機能を足したら警報器が外れた』状態を解消する。
## 5.0.3 Trigger重複整理（v0.7.3）

Topic Approval ONでは `scheduledDailyEditorialTopicApprovalV070` が1分ごとに候補通知・承認再開・Stuck Detection・時間単位メンテナンスを担当するため、Creator毎時とWatchdog 08時台が同じ `v070TopicTick_()` を再実行する必要はない。v0.7.3はこの重複を削除する。

- Topic Approval ON: Gate 1本 / TopicApproval 1本 / Creator 0本 / Watchdog 0本。Supervisorは既存Triggerをそのまま維持
- Topic Approval OFF: Gate 1本 / Creator 1本 / Watchdog 1本 / TopicApproval 0本
- 古いCreator/Watchdog Triggerが残っていても、Approval ONでは関数本体が `DELEGATED_TO_TOPIC_APPROVAL_TRIGGER` を返すだけで `v070TopicTick_()` を二重実行しない
- `reconcileDailyEditorialTriggerTopologyV073()` は対象4Handlerだけを正規化し、Supervisorや他用途のTriggerには触れない
- `inspectDailyEditorialTriggerTopologyV073()` で現在の本数を確認できる
- cadence / Topic / Knowledge / Duplicate / Fact / Image gateは変更しない
- Auto PublishはOFF、Human ApprovalはTRUEのまま
## 5.0.2 Image Operator BLOCKED / FAILEDをPrimaryへ返す（v0.7.2）

画像OperatorはGitHubの `editorial/image-operator-state/{slug}.json` をdurable stateとして持つ。従来のPrimary Status APIは画像がREADYでない限りほぼすべて `PREPARING` として扱っていたため、`BLOCKED_PROVIDER_CREDITS` や `ERROR` がSupervisorへ届かず、外部FallbackだけがGitHub Actionsを読んで原因を発見していた。

v0.7.2では `/api/integrations/editorial-status?content_id=...` が現在asset_versionと一致するOperator stateをGitHub正本から読み、Primaryへ `operator` として返す。古いasset_versionのstateは無視する。

- `BLOCKED_PROVIDER_CREDITS` → Primary `BLOCKED` / `RESTORE_PROVIDER_CREDITS`。自動retryは禁止し、Operatorのattemptを消費しない
- `BLOCKED_MAX_ATTEMPTS` / `OVERLAY_QC_REJECTED` / `ERROR` → Primary `FAILED` / `REVIEW_IMAGE_OPERATOR`
- Queue自体は `IMAGE_PREPARING` を維持して1分pollを継続する。`image_status=BLOCKED|ERROR`、`failed_stage=IMAGE_OPERATOR`、`last_error` に実状態を保存する
- 外部要因解消や新asset_versionの再queueでOperatorが非blockingへ戻れば、Primaryが古いBLOCKED/ERROR markerを自動解除して `PREPARING` へ復帰する
- READY判定、Visual QC、Xserver verificationは従来どおり。BLOCKED/FAILEDをREADYへ読み替えない
- LINE通知は `content_id + operator status + asset_version` 単位でde-dupeする
- `detectStuckRows()` も `IMAGE_OPERATOR_BLOCKED` / `IMAGE_OPERATOR_FAILED` をgeneric `IMAGE_STALLED` より優先して返す
- Auto Publish / GBP auto-postは変更しない

診断: `inspectEditorialImageOperatorStatusV072()`。回帰テスト: `npm run test:image-operator-primary-status`。
## 5.1 Supervisor QC途中クラッシュ自己復旧（v0.7.1）

v0.6.5.2は本文生成後、Final Editorへ入る直前にQueueを `QC / QC` へ更新する。そこで例外・timeoutが起きると旧Supervisorは `LEGACY_BRIDGE_FAILED_AFTER_DRAFT` を返すだけで、次の1分tickのselector対象外になって停止していた。v0.7.1はこの中間状態だけを限定的に自己復旧する。

- catch可能な例外: 同じtickで `QC / QC` を検出し `PATCHING / NOT_STARTED` へ戻す。次tickで通常のSupervisor selectorが再開する
- Apps Scriptの強制終了・timeout: `daily_no_interview_resume_stale_minutes`（現在既定5分）を超えた `QC / QC` を次tickで回収する
- すでに `21_WEB_BLOG_OUTPUT` に `READY + fact_check_status=PASS` がある場合: 原稿を再生成せず `BRIDGE_ERROR / READY` に移し、既存のBridge recoveryへ渡す
- 無限retry防止: `daily_editorial_qc_recovery_max_attempts` があればそれを使用し、未設定は3回。超過時は `ERROR` でfail closedしLINE error通知対象にする
- `REVIEW_REQUIRED` / `READY` / `IMAGE_PREPARING` など正規状態は上書きしない
- Auto Publishは変更しない。Human Review & Publishは必須のまま

診断: `inspectEditorialQcRecoveryV071()`。回帰テスト: `npm run test:supervisor-qc-recovery`。
## 6. 既知の限界

- デプロイ済みv0.6.5.2のReview Ready通知は `run_date` が当日の間だけ動きます。日付をまたいでREADYになった記事はCreatorが通知を補います
- 公開後の同期対象は Supabase / Queue / Bridge / GBPのURL です。`01_POST_HISTORY` はInstagram用（企画・類似判定・実績同期）なのでBlogは書き込みません
- 自動公開は未実装です。`lib/editorialAutoPublishGate.mjs` のGate（env + 設定の2鍵）だけがあり、executorを追加・登録するまで公開は必ず人間です
- 導入日は `runDailyEditorialCreatorV069Once()` を1回実行すると、その日のうちに翌日分を準備できます
- GAS（Gate / Creator / Watchdog）は自動配備されません。Apps Scriptへの貼り付けと `install...` の実行は人間が1回行う必要があります
- v0.6.5.2 Supervisor本体はGitHubに無くDriveの貼り付け用パッチ文書のみです。GitHub側のv0.7.1 adapterが旧Supervisorの生成関数をwrapし、QCクラッシュ停止だけを自己復旧します
- 意味的な記事の被りは全記事履歴を用いたanswer-overlap-v1で候補作成前に検査する。説明可能な決定論的ルールのため、未知の言い換えには人間Reviewも必要。
- 新しいテーマの一次情報が登録されるまで、そのレーンの記事はInterview経由になります

## 7. Editorial Consistency v1（2026-10-04）

全履歴Semantic Duplicate Gateはcandidateの読者疑問/答え・意図を比較し、SKIPPED_OVERLAPとduplicate_of/evidenceを返す。同カテゴリだけでは拒否しない。BridgeはGitHub公開記事全件とSupabase Draft全件を取得し、GASは21出力も送る。CreatorはShortlist notesに理由を保存する。

記事別画像はlib/editorialImageSheetView.mjsのcolumn spillを正本とし、Bridge全件・最新順・ID重複排除・GBP parent_blog_id JOINで追従する。

ONE_PASTEのconsistency-v1 runtime adapterは既存SupervisorのLength GateをSTANDARD/EXPERTへ適用し、画像status応答でGBP行の欠落を復旧またはREVIEW_READYを遮断する。STANDARD既定1600、EXPERT既定1400は異常短縮検出の下限で、目標文字数や水増し要求ではない。

GitHub mergeはGASインストールの証明ではない。実行ログ・installed source・実Sheet readbackまで確認する。

予備経路はreviewInputsByContentIdに実Blog/GBP/Bridge/Supabase QAを渡し、返されたreview_readinessがokの行だけREVIEW_READYへ進める。GBP行欠落は旧生成関数による復旧、またはBLOCKEDで止める。
