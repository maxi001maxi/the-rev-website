# Editorial AI v0.8.2｜本番復旧の最終受入（2026-10-21）
対象：BLOG-20261021-4ac8fd / 既存Draft ac869d7c-c6b8-4d15-b3a0-e8b6c0963f47。

## 実測した到達点
認証済みConsoleのPreflight全13項目がPASS。本文QC20/20・画像Review Gate・GitHubの3形式・Xserverとの3画像SHA256一致を実表示で確認した。Review & Publishボタンは有効だが押していない。Supabaseは同じDraft1件、status=draft / publish_status=NOT_PUBLISHED / source_path・source_sha・公開URL・公開検証時刻はnull。
QueueはREVIEW_READY、BridgeはPREVIEW_READY（HTTP200 / action=updated）。公開前の生成Markdownを確認・保存した。Markdown内のstatus=publishedは「ボタン押下後に書かれる予定内容」であり、GitHubのcontent/blogへ保存・公開したものではない。

## 今回の本番変更
1. Owner承認済みのGAS導入補助ファイルを追加。11:46:32 JSTに品質・復旧の2設定をENFORCEへ変更。別実行のreadbackでも両方ENFORCE。自動公開OFF、人間承認ON、既存11トリガーと全IDが不変。過去の本文QC3回を取り込み、利用枠をリセットしていない。
2. #269：本番SupervisorのBridge URL末尾スラッシュにQC証拠アダプターが対応していない実不具合を修正。既存Primaryが03:13:25 UTCに正式同期を実行した。Writer・Editor・画像の作り直しなし。
3. #270：画像status更新が完全な本文QC証拠を画像QAの短縮要約で上書きする実不具合を修正。同じ同期ハッシュでも、認証済みBridgeが欠損QC証拠を修復する。Consoleへの制作進捗返却も接続。03:21:36 UTCに既存Primaryが同じDraftを再同期し、Preflightを通過した。
4. #271：直接Bridge成功時のSheetsに古い停止理由が残る問題を修正。成功したcanonical Preflightだけを根拠にCANONICAL_PREFLIGHT / HUMAN_REVIEW / REVIEW_AND_PUBLISHを記録する。既に成功済みだった当該行の旧マーカーも、実Preflight証拠に基づき整合させた。記事・画像の再実行なし。
5. #272：実Consoleの公開予定Markdownを正規Blog builderで隔離出力したところ、390px幅で厚労省URLが403.92pxまではみ出した。本文リンクのoverflow-wrapを1か所修正。1440・390・360pxの再検査で横はみ出しなし。本文・QC・画像SHAは不変。配信結果は後記。

GAS最終読戻し03:35:25 UTC：ENFORCE/ENFORCE、11トリガー不変、本文QC履歴3件、Queue REVIEW_READY / 画像READY / 停止理由空 / 次HUMAN_REVIEW / 必要承認REVIEW_AND_PUBLISH。
本番GASの完全読戻しSHA256：16ab6511bc43a7143f46c23110811dee00511d93b8749b11d5d9a4f16352625a。既存4補助関数を保持した。

## 本文・画像の証拠
本文SHA256：29cf1be0d80d2f9b9c5928d374fbd40f677f28336f675da15791c049b31bd079。
本文独立QC証拠SHA：9682f9fddeb018530aeeb4e06a6ca6634fa6fe21c2bd88ef68bb6e8aac28ecd9。19/20→18/20→20/20の元履歴を保持。追加本文QCなし。
同期ハッシュ：de48da90574c7741e989850acd33f4a321996338010f944fd7c15797e3fd62fd。

採用画像版：reference-v082-evolgear-r5-qc-context-20261021。Owner選定画像の同一バイトを使用。R7比較・実店舗・人物・手・視線・夜・3形式の実物独立QCはRun39528881887のPASSを再利用。不採用版・旧失敗QA・消費台帳は変更していない。

|形式|寸法|SHA256|
|---|---|---|
|Thumbnail|1200×675|83ffff6b1d2cc26d817e6420896fcc69060af02fd8359dfaebfbc83eaee7a4e1|
|OGP|1200×630|c3124f7d6571a53cef13880ace469966b8a918848da4065db2e522d552c9358b|
|GBP|1200×900|3ccdf051b1c0d042c9dd9ce0b6ad6ed9b69a811b579e3d736cc7a5fdfbc77ba3|

先行画像配信39530070637、通常4画像delta復旧39531371292、今回の認証済みPreflightでもGitHub/Xserver一致。今回は有料生成0、本文QC0、Visual QC0。既存画像QC実応答はgpt-5.6-sol / req_eb49e4dfea96481bb8330d4ac8e4d2e7 / input23455・output2801・total26256。確定請求額は応答から取得できずnull。過去費用を0と扱わない。

## 14工程の受入
|工程|今回の実行・引継ぎ根拠|結果|
|---|---|---|
|01企画|TP-20261021の選択済み候補・重複判定を維持|既存証拠再利用|
|02選定|正式承認・対象日Queue1件を維持|既存証拠再利用|
|03一次情報|Owner回答原文・承認を維持|既存証拠再利用|
|04リサーチ|検証済み研究・公的資料4件と根拠SHAを維持|既存証拠再利用|
|05本文|20/20本文を正規Bridgeで同じDraftへ接続|PASS|
|06本文QC|完全証拠・本文SHA・content IDを実Preflightで検証|PASS|
|07画像設計|実素材・人物動作・夜・R7の既存契約を維持|既存証拠再利用|
|08生成|Owner選定OpenAI生成画像を再利用。追加生成なし|既存成果物再利用|
|09Visual QC|実物独立QC・R7 PASSを厳格に再利用|PASS|
|10画像3形式|GitHub実ファイル・寸法・SHA一致|PASS|
|11同期|既存Draft1件・Sheets Queue/Bridge・GitHub・Xserver|PASS|
|12公開準備|未公開保持・slug未使用・正規Preflight合格|PASS|
|13Console|Publisher認証・実画像3形式・本文・進捗表示|PASS|
|14最終Preflight|認証済み全13チェックPASS・公開ボタン有効|PASS|

## 検証と限界
- #269 CI：Recovery39537163374 / verify39537163304 PASS。
- #270 CI：Recovery39537729045 / verify39537729060 PASS。
- #271 最終CI：Recovery39538707140 / verify39538707133 PASS。最初の候補は生成bundleの余分な空行で停止。正本に合わせて修正し、最終SHAで成功した。
- 接続・復旧33テストPASS。実route、Supabaseクライアント、正規状態判定、Primary継続、QC保全、独立QC停止、API障害、上限、同期障害、既存Draftの再送、Admin Preflight、Publish未実行を検査。外部生成等は固定応答でありDRY_RUN_PASSとして扱う。
- 実案件の本番検証は「既存承認・合格成果物→GAS Primary→正規Bridge→CMS→status→認証済みConsole Preflight」。ゼロから新しい有料Writer/画像を生成して全自動完走した証明とは区別する。
- PC/スマホ検査は実Consoleの公開予定Markdownを正規builder・同じCSS/画像で隔離レンダーしたもの。1440/390/360px、横はみ出し0、画像正常、canonical/OG/description/予約CTA、JSエラー0・自ドメイン失敗0を検査。認証ブラウザ自体の端末エミュレーションではない。
- 旧本番サイトQA39522745045は333項目/4幅まで成功後にload待ち15秒timeout・25分cancelled。全幅PASSとは扱わない。記事Preflightとは別の未完了検証として保持する。

## Ownerの通常操作
候補選択と必要な一次情報回答を登録する。制作中はConsoleの進捗・停止理由を確認し、REVIEW_READYで最終内容を確認して公開する。日常のWriter起動、同期、画像手動登録は不要な設計。
未知の事実・Owner判断が必要な品質停止は明示し、証拠不足を自動で合格にしない。今回の過去QC枠は消費済みのまま維持。

## 判定の区別
A：記事は認証済みPreflight PASS / Owner公開待ち。スマホCSSは通常FULL配信39540437378で反映・公開GETのSHA一致を確認済み。
B：v0.8.2コード・GAS ENFORCE・Vercelへ本番導入済み。既存実案件の自動復旧経路は実証。次回新規記事のテーマ選択から有料制作を含む全本番完走は未実施のため、システム全工程の本番検証完了はPARTIAL。
DRY_RUN_PASS＝33接続・異常復旧テスト。REAL_DATA_PASS＝今回の既存記事の正式同期と認証Preflight。EXTERNAL_VERIFICATION_PENDING＝新規記事の本番全制作、全幅本番サイトQA。公開操作・GBP投稿は実行していない。

証拠：Issue264、PR266〜273、同日Drive監査フォルダ。


## 最終配信・通知の実測追記
- #272本番FULL配信39540437378はSUCCESS。既存本番バックアップ、assets先行、画像live gate、Blog最後、live検証の通常経路を全て通過。公開CSS GETのSHA256は274a38d9e344a875fab15a76f5d0943ea85d4fe9ff5f57d1b09d36ae6973acdfで、承認済み1行修正と一致する。
- Vercel本番dpl_7VCrsVUKHmGefUxd5hfN2FDzvtJPは4233f9e832ea5df622cd59a362ef0a53c4a84b16でREADY。以後のmain変更はGAS/テスト・別記事の正規公開であり、当該APIに必要な変更は導入済み。別記事の公開は今回の操作ではなく、保持した。
- #272候補CI39539259637：7画面幅・532項目PASS、JSエラー0、自ドメイン通信失敗0。予約サイトは6メニュー/フォームの読取検査PASS、入力・予約送信なし。これは候補環境検査であり、公開サイト全幅QAとは別証拠。
- #273：Queue作成日と処理完了日が異なると旧通知が対象を除外する問題を修正。本番GASへ保存、完全読戻し一致、構文検査PASS。最大3回・10分待機・不明な送信結果は再送停止。通知APIの既存受理記録と重複送信キーを保持する。
- 既存Primaryによる通知欄反映を実測：SENT / LINE / 「既存のLINE API受理記録を保持。到達・既読は未確認。」。既存記録の送信時刻は不明のまま保持し、新規送信・端末到達・既読を主張しない。
- #273最終CI Recovery39541689006 / verify39541689211 PASS、接続・復旧33テストPASS。日跨ぎ通知、重複抑止、バックオフ・上限、不確実な通信結果、品質停止通知を含む。
- 公開サイトQA39542046306はtherev-lab.com:443へのConnectTimeout（接続10秒）で失敗。本文・画像QCとは無関係な外部通信停止として分離。後続39542240086は公開バイト比較を通過し、7画面幅の実ブラウザーQAが継続中。未完了を合格扱いしない。

## 残課題と運用
P0：今回記事の公開前条件に残るBLOCKEDなし。Ownerは内容を最終確認し、公開する場合だけReview & Publishを押す。
P1：次回の新規テーマ・回答からWriter/Editor/有料画像を含む全工程の本番完走を継続検証。今回の合格済み原稿・画像の再制作では代替しない。通知端末への到達確認、公開サイト全幅QAの最終結果も独立して追跡する。
P2：コスト請求明細との突合、複数回の本番稼働による安定性測定。
本稿を最新判定とする。同梱のPRE_ENABLE_STATE.jsonおよび旧PRODUCTION_RECOVERY_RECEIPT.mdは導入前の履歴であり、現状判定ではない。

最終証拠アーカイブ：[editorial-v082-production-acceptance-20261021.zip](https://drive.google.com/file/d/1qIdr2dadhLd9BxKARxun8cgzXUch041p/view?usp=drivesdk)（4,970,800 bytes、既存監査フォルダ、共有設定変更なし）。
