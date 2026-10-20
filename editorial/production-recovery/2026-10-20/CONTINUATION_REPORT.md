# v0.8.2 継続開発・本番復旧（2026-10-20）

対象：PR #266 / Issue #264 / BLOG-20261021-4ac8fd / Draft ac869d7c-c6b8-4d15-b3a0-e8b6c0963f47。

## 現在の判定

A（記事がOwner Publishだけを残す）：**未達・BLOCKED**。B（v0.8.2本番導入・自動制作/復旧E2E）：**未達・NOT_DEPLOYED**。合成E2EはPASS、実案件の本文再QC・画像・正式Bridge・認証済みConsoleは未完了。追加課金0、mainマージ0、GAS導入0、本番DB変更0、FTP配信0、Publish/GBP投稿0。

## P0-1 本文

最新修正は `../../prepublication/2026-10-21-evening-strength-sleep/ARTICLE_DRAFT.md`。STANDARDの1600〜2400文字枠を維持。研究結果／記事独自の時刻例を別見出し・先行注記で分離。公的ガイドの強度説明と、残り数回・姿勢・セット調整の一般指導を区別し、特定負荷の睡眠効果を断定しない。Ownerの方針も臨床効果の証拠と扱わない。新しいRPE/RIR数値は追加していない。

厚労省PDF実物p28（印刷26）の運動強度説明を確認し、限定evidence packとGASの同一catalogを更新。一般的な強度説明であり就寝直前の安全閾値ではない。

旧19/20と18/20のJSON・API request ID・消費2回台帳は変更なし。`QC_CORRECTION_REVIEW.json` は保守者による指摘整理であり独立QC PASSではない。第1指摘は明確化推奨の文言、第2は中心質問への判断支援不足、第3は研究適用範囲の重大リスク。QCはsource_unverifiedをclaim別には示しておらず、どれを理由にtrueとしたかは断定しない。

QC responseにrecommendationsを分離。臨床的断定・不正確な出典・危険な指導はissuesへ残す。16点以上、各軸2以上、issuesゼロ、source_unverified=falseは変更なし。20点でも出典不備は停止する回帰テストを追加。

追加QCは**1回**を提案。通常見積$0.04〜0.07、承認要求上限$0.25（出力4000token上限、入力byteからの保守的見積もり約$0.16）。正式単価は公式OpenAIモデル/料金表で確認。過去の2回は現行単価で約$0.065084と推計できるが、請求額は未取得null。詳細 `ADDITIONAL_QC_PROPOSAL.json`。既存QC_EXECUTION max2は維持し、追加承認まで実行不可。

## P0-2 画像

既存Oct21画像は2回とも不合格・隔離のまま。新規生成/有料Visual QCゼロ。R7と過去R2/R3/R4/R6/R8/R9の拒否台帳は維持。

別の登録済み実原写真photo-evolgear（SHA437836…）で、人物の顔/時計の手元と3形式の切り取りを実画素寸法から検証。原写真を保持した図面を保存。画像主題は「夜の筋トレを切り上げる時刻を選ぶ」。器具操作・架空夜景・新設備は使わない。

R9のhard restoreは引き続き停止。新しいopt-in raw guardは、生の生成画像の保護画素を全数比較し、変化や境界への接触で拒否する。背景を上書きして人物を切る処理はしない。実経路へ固定provider応答を与え、受理・背景改変拒否・raw保持を検証。v3編集契約をAPI台帳digestに含め、mask変更で同じ予算を再利用できないよう修正。

**GEOMETRY_PASS_PRODUCTION_EDIT_BLOCKED**。実OpenAIのmask追従性、人物の自然さ、遮蔽、独立Visual QC、R7比較、最新の完全な意味履歴は未検証。図面は完成画像ではなく、無料Preflight全体のPASSとも扱わない。実画像を作っていないので最終3JPEG/SHA/配信200は提供不可。

## P0-3 予約QA・版ずれ

Run39363624290の実artifact12238742029を照合。redirect PASS、public master HTTP200/3メニュー取得済み、その後 `input,select` が存在せずtimeout。実ブラウザーで現在のカード型3メニューと、ジムカード→日時tableを確認。旧テスト前提の不一致が直接原因で、Editorial本体の障害ではない。

QAはカード操作→選択メニュー名＋日時tableの表示を全3メニューで検証し、旧selectも維持。個人情報・日時選択・予約送信は行わない。非GET通信を禁止。失敗時DOM/スクリーンショット/pageerror/通信失敗を保存し、transport UNVERIFIEDもCI成功にしない。カード／旧select／メニュー欠落／カレンダー欠落の実Chromium回帰テストを追加。

ローカルから当該サイトへはERR_EMPTY_RESPONSEでUNVERIFIED（クラウドブラウザーとCIとは経路が異なる）。CIで全3メニューの実検証を別途記録する。待ち時間を延ばして旧input前提を温存する修正ではない。

本番Vercelは依然deployment dpl_Db48XgBD25aHyWUJJi1f4DWnAjMi、main/a9ce3b6…のOct15版。v0.8.2ブランチは未マージ・GAS未導入。重要な本番変更承認前には反映しない。

## P0-4 正式統合

今回の実Supabase/Sheets読み戻しは `CONTINUATION_CMS_READBACK.json` / `CONTINUATION_SHEETS_READBACK.json`。既存Draftはdraft/NOT_PUBLISHED、Bridge hash/timeはnull、image ERROR、独立QC false。原稿をDBへ直書きせず同じDraftを保持。

順序は、追加承認後の本文独立QC→無料画像admission→限定生成/独立QC→合格3形式→承認された版の導入→正式Bridgeで既存Draft idを再利用→承認済みAssets FIRST/Xserver実SHA→Console認証/PCスマホ/SEO/予約/Preflight→REVIEW_READY。前段未合格のため後段の成功証拠を作らない。

## P1/P2

今回P1：重大issueと任意recommendationの混同防止、生画像ガード・契約変更時の予算保全、予約UI変更への回帰、失敗時証拠不足を修正。既存の無Interview/回答遅延・重複、本文修正再QC、API中断、Bridge再送、画像拒否・欠損・配信不一致、自動Publish禁止の接続E2Eを再実行。

導入前に残るP1：GAS実版/トリガーバックアップと全Writer境界のcrash checkpoint、実編集品質、認証済みConsole、本番配信/同期/通知の受入。汎用研究の自動収集、請求データ照合、横断版manifestはP2。1記事の通過でシステム全体の復旧としない。

## 承認・アクセス境界

直近の必要承認は追加本文QC1回（上限$0.25、自動再試行なし）。画像は無料admission未完了なので有料枠をまだ消費しない。mainマージ、GAS bundle導入/property有効化、Vercel本番deploy、Xserver配信と本番Bridge同期は、検証候補と影響を提示したうえで個別の承認が必要。GAS/Consoleの認証付き検証には利用可能なセッションが必要。最終Publish/GBP投稿は対象外。


### CI実画面で追加確認したQA前提

Run39378792698では「リカバリー」の日時表・09:00〜18:00・予約枠が実際に表示され、pageerror/許可host通信失敗なし。追加したQAの `.main_table_wrapper table` という包含関係の仮定が誤りだった。表の意味（table＋時間＋複数時刻行）と選択メニュー名を検証するよう修正し、旧wrapper外に表がある実DOM構造のfixtureを追加。サービス障害と誤認しない。作業環境はこの間に切断したが、変更はGitHub APIで同じDraft PRへ保存し、実検証はCIで継続。
