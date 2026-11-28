# 実装・テスト報告

Issue #264。作業ブランチ `fix/editorial-autonomous-recovery-20261020`、main基点 `89ed1b41c58afbf71303e53df00445666a4f2519`。PR263の8制作資料を引き継ぎ、本文と画像設計を更新。PR260を一括マージせず、実証済みの不採用台帳・3形式SHA照合を選択移植した。

変更の中心：

- `DailyEditorialQuality_v0.8.0.gs` / `DailyEditorialProductionRecovery_v0.8.2.gs` / bundle：証拠配信、保持修復、予算予約、既存停止原稿再開、GBP checkpoint、停止理由反映。
- `editorialAutomatedHybridImage` / `ProductionImagePreflight` / `SceneGrounding`：strict新規admission、独立観察の再利用、睡眠テーマ分類、失敗予算の自動リセット禁止。
- `editorialImageApiLedger` / 実operator：CAS台帳、実API使用量、最大1生成、scene checkpoint、破損状態で停止。
- `editorialRejectedAsset` / ReviewGate / HybridFormat：R2〜R9とOct21不合格の採用拒否。`LockedBackgroundEdit`：既知の顔欠損経路を課金前に停止。
- Bridge / publishFlow / ProductionRecovery / Review UI：本文hash証拠、同一Draft同期、画像停止時も合格本文保存、3形式SHA照合、Owner向け進捗。
- 既存PR260のHTTP境界doubleを再利用。新規テストは実Topic/承認→GAS Editor/独立QC→正式Bridge→Supabase JS→画像参照→status→認証Admin API→共通Preflightを接続する。

[LOCAL_VALIDATION.json](LOCAL_VALIDATION.json) と [DRY_RUN_RESULT.json](DRY_RUN_RESULT.json) が実行結果。npm ci、既存Quality・Daily Contract・State Machine・Creator・QC recovery・Trigger topology・Phase9・PhaseD・Image system・source/scene・production preflight・bundle一致・Blog buildを実行。型検査コマンドは現行packageに存在せず、ES module構文検査・build・契約テストで確認。

新規15 test cases（unit/接続を区別）：本文修復、証拠不足、API曖昧、2QC上限、事前予約保存失敗、旧画像PASS復活拒否、既存原稿再開、hard restore課金前停止、実operator subprocessの503/再実行/破損状態、接続正常系、接続10故障と復旧、Interview不要/遅延/重複回答。接続トレースには各caseと最終Preflightを保存している。

合成故障：Visual QC不合格、生成上限、API障害、DB同期失敗、GBPファイル不足、本文Preflight不合格、GitHub成功後の配信失敗、状態反映失敗、QA後の画素改変、同サイズの本番画像差替え。公開は発生しない。正常なOwner公開の本番実行は未承認のためテストしていない。

CIは `Editorial Recovery Acceptance` と既存 `Phase 9 Check`。独立実本文QCは専用ブランチの固定commitをcheckoutし、合成受入が通った後に実行する。第1回不合格の3指摘だけを修正し、異なるbody hashに限り合計2回まで許可する。main checkout、画像生成、FTP、DB書込、Publish処理はこの実行経路にない。STARTED・同一本文・合格済み・2回消費済みなら再実行しない。

**未マージ・未本番導入**。CI成功と本番E2E成功を混同しない。GAS実トリガー、認証済みConsoleのPC/スマホ、予約リンク実クリック、Xserverへの新画像配信は別受入が必要。

CIで既存Topic Approvalテストの固定10月4日候補が経時失効し、正しい候補refreshを誤って失敗扱いすることも確認。候補fixtureの鮮度をserver clockに合わせ、候補の鮮度基準自体は維持。29件PASSを確認した。


## CI実行証拠

- [Phase9 SUCCESS](https://github.com/maxi001maxi/the-rev-website/actions/runs/39362856567)
- [Editorial Recovery Acceptance / PR SUCCESS](https://github.com/maxi001maxi/the-rev-website/actions/runs/39362856565)
- [実本文QC・読取Probe](https://github.com/maxi001maxi/the-rev-website/actions/runs/39362851581)：合成acceptance成功、OpenAI呼出成功、実本文の品質判定FAIL、読取Probe成功。全CI成功とは表現しない。

初回Phase9は既存候補fixtureの鮮度依存で失敗し、fixture修正後29件PASS。最終コードでは品質ゲートを緩和していない。初回read-only probeのsource属性取得漏れも検出・修正し、最終結果はBLOCKED。API実行履歴を削除・リセットしていない。

最終回帰：実際の画像workflow selector Pythonを隔離ディレクトリで実行。上限到達/不合格の旧assetを保持し、次の別記事だけがoperator-jobsへ進むことを確認。旧失敗記事がstrict preflightを繰り返して全バッチを止める経路を修正した。
