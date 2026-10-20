# Editorial AI 総合監査・受入（2026-10-20）

Issue [#264](https://github.com/maxi001maxi/the-rev-website/issues/264)。対象 `BLOG-20261021-4ac8fd`。既存Draft `ac869d7c-c6b8-4d15-b3a0-e8b6c0963f47` とPR #263の原稿を保持した。測定正本は [REAL_DATA_BASELINE.json](REAL_DATA_BASELINE.json)、接続テストは [DRY_RUN_RESULT.json](DRY_RUN_RESULT.json)。

## 正式版と責任分担

「v3.1」は未マージのPR #260の画像・復旧提案で、全システムの本番版ではない。現行はGAS Supervisor v0.6.5系、Topic v0.7.0、QCクラッシュ復旧 v0.7.1、画像状態 v0.7.2、トリガー整理 v0.7.3、Quality v0.8.0の組合せ。既存の単発復旧 `_v081` と区別して、本変更を **v0.8.2 Autonomous Production Recovery（未リリース候補）** と呼ぶ。

- 承認・回答の正本：Supabase `editorial_topic_proposals`。今回 QUEUE_CREATED / approved 00:37:16Z / answered 01:57:13Z / Queue反映 01:57:34Z。
- 制作正本：Sheets `26_DAILY_EDITORIAL_QUEUE` row25、本文 `21_WEB_BLOG_OUTPUT` row22、配信 `25_WEB_PUBLISH_BRIDGE` row29。Master ID `1_Cia3fsELLCJtBcIFq38Jg5CbEVG2md2G6w6Do4BaeI`。
- 実行主体：既存GAS Primary Supervisor。Watchdogは検出と通知。新しい独立制作スケジューラは追加していない。
- GitHub：ジョブ、画像、QC、記事公開コード。Supabase：CMS Working Draftと公開証拠。Vercel：Console/API。Xserver：配信画像の検証対象。Sheetsの `synced_at` や `status=draft` 単独は受入証拠にならない。
- Vercel本番を接続済みAPIで実測：`dpl_Db48XgBD25aHyWUJJi1f4DWnAjMi`, SHA `a9ce3b6d212331bb491e27e5f3dea1689d5992e2`（10月15日）。GitHub main測定 SHA `89ed1b41c58afbf71303e53df00445666a4f2519`。明確な版ずれ。GASのインストール済みソース・実トリガー一覧は未検証。Driveのコード文書はインストール証拠ではない。

## 原因と区分

| 原因 | 区分・根拠 | 対応 |
|---|---|---|
| Editor 91でも独立QCは16/20・pass=false・source_unverified=true・5件の阻害事項 | 正常な品質停止。Queue/Output row25/22 | 基準を維持。具体的な研究の対象・結果・限界を確認 |
| QCへ論文URLだけを渡し、確認済み要約を渡さない | 設計不足。`v080QcEvidence_` は10/15向け公式資料のみ | 4一次資料の狭い証拠と適用限界をEditor/QCへ接続 |
| 妥当なREVIEW_REQUIRED後の修正経路がない | 復旧設計不足。v0.7.1はQC/QCクラッシュ用 | 既存Writerを保持し、1編集修復・最大2独立QC。過去の停止原稿もPrimaryから再開 |
| 手動Working Draftはsync_hash=null、bridge_synced=false | 運用・連携不整合。Supabase実読取 | 新Draftを作らず、同一IDへ正式Bridgeで統合するコード。本文証拠とhashを要求 |
| 画像ジョブの厳格Preflightがopt-inで外れていた | システム障害。Oct21はLEGACY_UNMODIFIED / unknown履歴5件 / max2 | 新規ジョブを強制strict、実行器でも課金直前に再検証 |
| 「強さ/強度」から一般的筋トレ実行シーンへ分類 | 意味設計劣化。既存画像QAはケーブル運動と睡眠の意味不一致 | 夜・睡眠の時間/強度選択をreadinessへ分類。旧不合格は改ラベルして採用しない |
| 初回画像生成後、失敗時に次の生成へ進む／中断で予算を失う | コスト・復旧設計不足 | 上限1生成・QC HTTP2件、GitHub CAS事前予約、曖昧な呼出は停止、scene checkpoint |
| R2は旧QA.pass=trueでもOwner拒否 | 自動QC過大評価 | R2/R3/R4/R6/R8/R9とOct21失敗版を不採用台帳で固定。版・SHA両方で拒否 |
| R9は背景保全後に顔/紙が欠損 | 実画像の合成不良 | hard-restore経路を課金前に停止。新しい方式の実画像品質検証は未完了 |
| mainとVercel/GASの修正導入が一致しない | 構成・版の不一致 | CI/実装/マージ/各環境導入/本番E2Eを別判定 |
| 単なるDraft作成を完成とする | 実行運用の問題 | body/evidence hash、画像3形式SHA、正式同期、Preflightを進捗に表示 |

## R7と直近失敗の比較

10/15 R7は実背景、自然な人物、独立QC、画像3形式と配信検証を含む成功参考。ただしOwnerの限定承認・手動復旧も使っており、完全自動制作の実証ではない。正本：`editorial/image-review/2026-10-15-r7-published-recovery-verified.md`。

10/18は不採用画像を何度も構図・マスクの変更で修復しようとし、実背景保全と人物保全が両立しなかった。10/21は原稿の正常なQC停止を手動Draftで迂回した後、無料意味検査を通らないジョブで画像2回が失敗。直近Run [39345665666](https://github.com/maxi001maxi/the-rev-website/actions/runs/39345665666) / [39358414337](https://github.com/maxi001maxi/the-rev-website/actions/runs/39358414337)。現物を開き、原写真とR7に比べた色温度・機器位置・行為の不一致を確認した。品質停止を故障として解除しない。

## 14工程の受入表

「合成PASS」は接続経路での検証。「実案件PASS」は実データでその工程が合格した場合だけ。

| 工程 | 現行対応 | 合成テスト・修正 | 10/21実案件 |
|---|---|---|---|
| 01 企画 | Topic API / 候補・重複判定 | 既存回帰PASS | 既存候補・承認履歴確認 |
| 02 テーマ選定 | proposal→正式Queue | 回答遅延/重複/Interview不要PASS | QUEUE_CREATED確認 |
| 03 独自情報 | Owner回答→Writer/Editor ctx | 引継ぎPASS | 2回答を保持 |
| 04 調査 | source_refs→確認済み証拠 | 限定4一次資料を実装 | 一次資料を照合、証拠pack保存 |
| 05 記事制作 | Writer / Preservation Editor | Writer保持・修復1回PASS | PR263本文を修正、別記事は作らない |
| 06 本文QC | 独立QC v0.8 gate | 低評価/証拠なし/API障害停止PASS | 実API結果は記事報告Dへ記録 |
| 07 画像設計 | source/scene/brief preflight | strict必須、旧失敗回帰PASS | 旧計画FAIL。新人物領域・編集方式は未検証 |
| 08 画像生成 | OpenAI Actions | 事前CAS予約・1回制限・実行器中断回帰PASS | 既存2回失敗。追加生成0 |
| 09 画像QC | 独立grounding+visual | 台帳拒否/R7維持PASS | 実物不合格。採用なし |
| 10 画像3形式 | deterministic overlay | 画像不足・改変検出PASS | 不合格3形式を隔離保存 |
| 11 データ連携 | GitHub/Supabase/Bridge | 同一Draft再送・同期障害復旧PASS | Working Draft未正式同期 |
| 12 配信準備 | Xserver照合 | 3画像SHA・同サイズ改変検出PASS | 合格画像の配信なし |
| 13 管理画面 | Admin article / review API | 認証境界doubleでAPI表示PASS、進捗UI実装 | 実Consoleはログイン画面 |
| 14 最終Preflight | 共通runPreflight | 接続正常系PASS・各故障時停止 | READY判定不可。Owner Publish未実行 |

## 判定

**PARTIAL**。接続経路のDRY_RUN_PASSは、本番GAS/認証済みConsole/本番配信の成功を意味しない。既存資産は照合・保存できたが、10/21をREAL_DATA_PASSまたはREADY_FOR_OWNER_PUBLISHとは報告しない。
