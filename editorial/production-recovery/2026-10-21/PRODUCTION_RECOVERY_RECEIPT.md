# Editorial AI v0.8.2 本番復旧・継続結果（2026-10-21）

対象：BLOG-20261021-4ac8fd / 既存Draft ac869d7c-c6b8-4d15-b3a0-e8b6c0963f47。
記事公開・GBP投稿は未実行。クラウドブラウザはOwnerの指示に従い使用していない。

## 実行済み

- PR266をmain a9a8d9d0へマージ。本番Vercel dpl_EWjWfQbk19dTqqxTqALqjSoos2LU READY。初回Xserver39520528918成功。
- GAS既存Autonomyファイルをバックアップして更新。既存の本番専用4補助関数と11トリガーを保持。読み取り専用health実行完了。復旧モード有効化の実行・値の確認は未完了。
- 合格済み本文20/20をSheets既存行22へ復元。本文SHA256：29cf1be0d80d2f9b9c5928d374fbd40f677f28336f675da15791c049b31bd079。過去19/20・18/20・20/20の計3回のQC履歴を保持し、再QCなし。
- QC-onlyの同一RAWに「NEW edit」「PREVIOUS REJECTED EDIT INPUT」と指示していた文脈不具合を修正。厳格な店舗構造・夜・人物・R7基準は維持。
- Run39528881887：追加生成0回、独立QC1回で実画像PASS。RAWと3形式はOwner選定画像のSHAと完全一致。旧不合格判定を改変せず、新しい独立証拠を別保存。
- Run39530070637：合格した3形式をXserverへ配信。HTTP200とSHA256を検証。
- 合格済み既存画像を正規Bridgeで認識する接続経路を修正。記事ID、既存Draft ID、本文QC、Owner承認、画像QC、R7、GitHub5素材SHA、配信3形式SHAが揃う場合だけ同じDraftを更新する。再生成・上限リセット・Draft重複・公開の処理なし。
- GitHub Contents APIが1MiB超PNGの本文を返さないケースに、正確なGit blobによるSHA検証を追加。
- PR267をmain d77ac1b26efd53aaabc2aa3219cd5ca6721c5cbdへマージ。Preview dpl_52dnoBiZ6VDchXyJLGU6GPBDFefN READY。修正後の本番Vercel dpl_FracHmdagFsd6GVzUhfZk8h1aVxe READY。同SHAを確認。公開APIのGET405・未認証Admin401を実応答で確認。
- 既存GBP_DRAFT.mdをSheets行20へ再利用保存。GBP画像READY、投稿BLOCKED_URL。投稿なし。QueueはREVIEW_REQUIRED / 本文READY / 画像READY / 次WEB_BRIDGE。記事REVIEW_READYにはしていない。

## 画像と課金証拠

| 形式 | 寸法 | SHA256 |
|---|---|---|
| RAW | 1024×1536 | 6f3b19d4a15565bce5d5399a6e85cbb0443b410285911d6c2f94188975fb70b7 |
| Thumbnail | 1200×675 | 83ffff6b1d2cc26d817e6420896fcc69060af02fd8359dfaebfbc83eaee7a4e1 |
| OGP | 1200×630 | c3124f7d6571a53cef13880ace469966b8a918848da4065db2e522d552c9358b |
| GBP | 1200×900 | 3ccdf051b1c0d042c9dd9ce0b6ad6ed9b69a811b579e3d736cc7a5fdfbc77ba3 |

採用QC証拠のasset version：reference-v082-evolgear-r5-qc-context-20261021。旧選定版とバイト一致。
独立QCモデル実応答：gpt-5.6-sol。request_id=req_eb49e4dfea96481bb8330d4ac8e4d2e7。
input23455 / output2801 / total26256 tokens。HTTP200・completed。
今回追加：生成0・画像QC1・本文QC0。API応答から確定請求額は取得できず、confirmed_cost=null。過去の消費は0扱いせず、元の台帳を保持。

## 検証範囲

Recovery Acceptance39530075547 / Phase9 39530075533 PASS。
追加9ケース（実Bridge→実Supabaseクライアントを使う境界モック＋8停止ケース）、既存16復旧テスト＋3接続E2EがPASS。
ネットワーク境界を模擬したDRY_RUN_PASSであり、認証済み本番記事のE2E合格とは別。

| 工程 | 今回の受入・既存証拠 | 判定 |
|---|---|---|
| 01 企画 | TP-20261021・既存候補と履歴を保持 | 既存証拠再利用 |
| 02 選定 | 承認記録・対象日の正式Queueを保持 | 既存証拠再利用 |
| 03 一次情報 | Owner回答原文と承認を保持 | 既存証拠再利用 |
| 04 研究 | 検証済み4資料と根拠SHAを保持 | 既存証拠再利用 |
| 05 本文 | 合格版を既存Sheetsへ復元 | PASS・CMS未同期 |
| 06 本文QC | 実物20/20・本文SHA一致・履歴3回保持 | PASS |
| 07 画像設計 | 実店舗素材・立位/時計動作・無料Preflight | PASS |
| 08 生成 | 既存Owner選定OpenAI画像を保持、追加生成なし | 再利用 |
| 09 Visual QC | 独立実画像QC・夜/設備/手/視線/R7 | PASS |
| 10 画像3形式 | 全寸法・同一バイト・SHAを確認 | PASS |
| 11 同期 | GitHub・Xserver画像とSheets成果物は接続、CMS旧データ | PARTIAL |
| 12 公開準備 | 画像配信完了、正式Bridge待ち | PARTIAL |
| 13 Console | 未認証401を確認、認証済み実表示は未確認 | PENDING |
| 14 最終Preflight | 本番対象Draftでは未実行 | PENDING |

## 発見した差分配信の問題と復旧

main merge後のXserver39530660521はアップロード前に安全停止。先行ステージ済みJPEGをDELTA_UNEXPECTED_REMOTE_FILEと判定したため。
修正：旧Gitに無い新規ファイルでも、現地と新規成果物のSHAが完全一致する場合だけalready_stagedとして採用し、上書き・ロールバック削除を行わない。不一致は引き続き停止。
続く限定復旧39531129904では、FTP既存フォルダへのmkdirが550 File existsで停止。4画像のロールバック照合はPASS。既存Blog差分配信で実績のあるmkdir -pfを画像差分のupload/rollbackへ適用。
この修正はPR268。18差分配信回帰テストPASS。最新実復旧39531371292 PASS：通常delta planner・FTPS・通常verifierで4画像SHA一致。3 JPEGは既存バイトを保持して無転送、欠けていたRAWだけ配信。Phase9 39531376065 PASS。PR268をmain dc255dad8d15ef5e560f295fc01793b3cb1d6c9cへマージ。Vercel実行コードには変更なし。

## 残る実行境界

現在のSupabaseは同一Draft1件、editorial_sync_hash=null / editorial_synced_at=null / 旧画像ERROR / NOT_PUBLISHED。CMSの合格・公開準備完了は報告しない。
GAS v0.8.2コード保存と、ENFORCE有効化・実際のPrimary再開は別。
自動承認審査は、本番Apps Scriptへの設定確認用Scriptファイル追加を「その具体的変更に個別承認が必要」として拒否した。同じ変更を別経路で回避していない。
利用可能なGoogle Drive接続にはApps Scriptコード実行/Script Properties変更APIが無く、専用接続の探索でも該当機能を確認できなかった。クラウドブラウザは利用禁止。

Owner側でGASエディタを操作できる場合の限定手順：
1. リポジトリの editorial/gas/manual/EditorialProductionRollout_v082_20261021.gs を同じ本番プロジェクトへ追加。
2. enableEditorialProductionV082 を1回実行。この関数は自動公開OFF/人間承認ON、Primary1個、過去QC3回の取り込みを確認し、品質/復旧の2モードだけENFORCEへ設定する。トリガー・Secretsは変更しない。
3. 次の実行コンテキストで inspectEditorialProductionV082 を実行してreadback。その後、既存Primaryが受入済み本文からWEB_BRIDGEへ再開する。GBP READY行を再利用し、Writer/本文QC/画像生成を再実行しない。
4. 同一Draftの同期ハッシュ、本文SHA、3画像、サーバー側canonical Preflightを再照合。認証済みConsole実表示は別途確認。Publishは押さない。

## 判定

- A：10/21記事のOwner公開待ち到達＝未到達。
- B：v0.8.2本番復旧＝PARTIAL（Vercel/GASコード導入済み、GAS復旧モードの有効化・正式Bridge・認証済み最終受入が未完了）。
- DRY_RUN_PASS：上記接続テストの範囲。
- REAL_DATA_PASS：本文QC・実物画像QC・3形式配信の部分証拠。記事全体のREAL_DATA_PASSではない。
- EXTERNAL_VERIFICATION_PENDING：GAS有効化・認証済みConsole。
- BLOCKED：正式Bridge未実行のためCMSは旧データ。

証拠：GitHub PR266/267/268、Issue264、Drive監査フォルダ1PIqHPLAuWZCfekNDRhbUZhQcnz36dfei。
QC保存1SNjWHQFsX6dIVnJaF69BXit4SlE3JA46、画像配信1vrjKAzoxRAtQO_fMdDYLC9lXsdhO4_hQ、接続受入1Xuj2y57OFrzGyiJc6ftzuSenH-3hKTXU、本番変更前後バックアップ1VbpoYcSaeCy43OSkMnyG6c6nkgTy92Ot。

最終main dc255dad8d15ef5e560f295fc01793b3cb1d6c9cと本番deployed d77ac1b26efd53aaabc2aa3219cd5ca6721c5cbdの差分は、差分配信script・そのtest・限定復旧workflowの3ファイルのみ。Vercel runtimeは同一で追加deployなし。通常delta成功のDrive証拠1weIYGE8TB5GPc_haj1nQEWPM2ifs7ymz。
