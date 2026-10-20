# THE REV. CONDITIONING LAB. — Stage 2 本番公開・最終受入

判定：**PASS — 本番公開完了**。2026年10月20日18:11 JSTまでに、Xserver公開、本番ブラウザー532チェック、実画面確認、公開記事境界の検証が完了しました。既存Editorial CIとGTM詳細パラメータの問題は別途残り、すべてのCIが緑という意味ではありません。

公式サイト：https://therev-lab.com/

## 公開した変更と正本

- 共通ヘッダー、PC・スマホメニュー、ハンバーガーのフォーカス・Esc操作、フッター、予約ボタンとモバイル固定予約バー。
- Trainer・Price・Access・法務・Column・404の共通UI、P0の文字・ボタン・アイコン視認性、承認済みInstagramメニュー #1。
- TOP v7の写真フェードとRecovery v8の写真・図解・レイアウトを維持。
- 価格・コピー・画像・予約URL・Editorial AI・404サーバー接続は変更していません。未承認Stage 3 #2〜#10、暗背景見出しの明朝化は含めていません。

| 項目 | 確定値 |
|---|---|
| Repository | maxi001maxi/the-rev-website |
| 統合PR | [#265 — MERGED](https://github.com/maxi001maxi/the-rev-website/pull/265) |
| 最終本番Commit | `fedb2f4fe473a6d67e6d84a8a5b74e6611ba7722` |
| 検証済み候補 | `6b9bd65e6e85ae4a594b10427f8f28c9d99035f7` |
| main側親Commit | `89ed1b41c58afbf71303e53df00445666a4f2519` |
| 候補とマージ後の共通tree | `ecde253f4d63c51d7700164b16629a7af0d1e107` |
| マージ時刻 | 2026-10-20 17:15:44 JST |
| Xserver公開完了 | 2026-10-20 18:03:03 JST |

PR #261のP0は候補に統合済みです。#265マージによる祖先関係から#261もGitHub上でmerged/closedになりましたが、#261の独立マージや追加main pushは行っていません。

今回5067222以降に修正したソースは `scripts/qa-booking-site.mjs` のみです（8a327f1 → 6b9bd65）。完成デザインのruntimeは5067222から変更していません。

## BLOCKED解消の根拠

**予約検査の原因と修正。** 旧テストは外部Gymsのメニュー選択画面で入力欄を待っていました。実際の導線は「体験メニュー → 空き日時 → 空の予約フォーム」です。この実フローへ検査を修正しました。タイムアウトを延ばすだけの対応、テスト削除・skipは行っていません。

独立検査は3メニュー×PC1440px・スマホ390pxの6ケースすべてPASS。メニューAPI、リダイレクト、4つのUTM、空き枠、空フォームを確認しました。本番公開後も実際の公式TOPのCTAからGymsへ遷移し、3メニュー表示・空き枠・氏名/電話/メール欄の表示を確認しています。顧客情報、規約同意、実予約、決済は行っていません。自動検査の業務書込は0です。

本番TOPからの到達先：`https://cl.gyms.jp/trial/CC2237480443/?utm_campaign=trial&utm_content=home_hero&utm_medium=referral&utm_source=website`。

**Editorialの独立性。** [main単体の検証39384111611](https://github.com/maxi001maxi/the-rev-website/actions/runs/39384111611)も29件中28PASS、同じ期待SENT/実際PENDINGの1FAILでした。検証Commit e4022757とmainの差は検証workflowのみで、アプリコードは同一です。main対公開候補でlib・api・Editorial実装・content/blog・package・画像の差分は0。最新mainのEditorial関連4ファイルを保持しています。静的ブログbuildはtopic approvalをimportせず、Xserver公開物はAPI/GAS/adminを含みません。今回の変更はEditorial自動処理workflowのpush対象にも一致しません。承認状態を書き換えず、既存の赤い結果を保存した上で静的デザイン公開から分離しました。

## 自動QAと目視QA

| 検証 | 結果・証拠 |
|---|---|
| 最終候補 npm ci / vercel-build / build-parity | PASS。694ファイルを照合、意図したPreview robots差を除き一致。run39390622529 |
| 最終候補 public-site-browser | 532 PASS、JS例外0、first-party取得失敗0。7画面幅 |
| test:technical-site / stage QA | PASS。GTM singleton、HealthClub、14予約属性、metadata、listener重複、6ページのリンクとCSS等 |
| 最終候補のtechnical browser全体 | **FAILを保持**。240秒の全体時間上限で最後の画像取得前に終了。20機能検査と7ページのGTM/intent構築はPASS。残存画面は別Preview検査で完了 |
| 外部予約の独立実フロー | 6/6 PASS。[run39390265341](https://github.com/maxi001maxi/the-rev-website/actions/runs/39390265341) |
| 最終候補Control Capture | PASS、run39390622580 |
| 最終候補Editorial Phase 9 | 既存SENT/PENDING問題でFAIL、run39390622534。削除・skipなし |
| 最終Preview | READY、下記55画面PASS。[run39390705456](https://github.com/maxi001maxi/the-rev-website/actions/runs/39390705456) |
| 本番公開後の標準受入 | **SUCCESS、532 PASS**、7幅、JS例外0・first-party失敗0、warm-cache検査PASS。[run39397851894](https://github.com/maxi001maxi/the-rev-website/actions/runs/39397851894) |
| 本番のGTM/Google tag実行 | 7ページでpage_view/intentリクエスト構築PASS。自動検査は収集前に遮断し送信0。GA4側での実受信はUNVERIFIED |
| 本番ソース/公開記事境界 | 672ファイル照合PASS、エラー0。公開25記事すべてHTTP200、未公開1記事HTTP404を維持 |
| 本番22画面＋操作 | 11ページ×1440/390、22ケースPASS。移動と戻る10ケース、JS・取得失敗・横はみ出し0。[run39398014975](https://github.com/maxi001maxi/the-rev-website/actions/runs/39398014975) |
| 予約CTAコントラスト | 塗りボタン28サンプル、最小12.40:1。サイト全要素の網羅測定ではない |
| 本番目視 | 実際に取得したヘッダー・本文・フッター・メニュー77画像のコンタクトシート、TOP/Recovery拡大画像をレビュー。重大崩れなし |
| 本番の実操作 | 公式CTA→Gyms空フォーム、メニュー→Instagram実プロフィールへの新規タブ遷移を確認 |
| 物理実機 | **未実施**。Chromiumのviewport検査とクラウドブラウザーであり、実機PASSとは記載しない |

最終Previewは候補6b9bd65専用の `dpl_41WCrqVHS8FNDX4bxMoQs4HiCT4d`：https://the-rev-website-7w1emrllj-htrmaxi0101-9305s-projects.vercel.app 。旧SHAのPreviewとは区別しました。11ページ×1440・1280・768・390・375pxの55画面でヘッダー、本文、メニュー、CTA、フッター、画像、フォント、横幅を確認しています。

本番77画像と同じviewport・位置の最終Previewを比較し、**73画像がピクセル完全一致**。残るメニュー3画像は各1〜3px、記事フッター画像は画面上端ヘッダー文字の443px（0.0342%）のみの差です。差分領域を拡大してもレイアウト差はなく、文字の微小描画差と判断しました。TOP/Recoveryの主要画面は完全一致です。

料金390px上端の余分な空の黒帯は再現していません。375pxでは既存の料金本文「パーソナルボクシング」の最後の1文字の折返しを確認したため、軽微課題として残しています。

## Xserver公開と転送障害の安全な復旧

本番はVercelではなく、`deploy-xserver.yml` の既存main push自動実行です。[run39392124975](https://github.com/maxi001maxi/the-rev-website/actions/runs/39392124975) **attempt2 SUCCESS**。公開先は既定の `sv14602.xserver.jp`、FTPルート `/`、公式ドメイン therev-lab.com です。

attempt1はFTPSのmax-retriesでassets段階に停滞し、root/Blog工程には到達していませんでした。独立した読取専用FTPSプローブ39395215146では4ファイルを8秒で取得し全ハッシュが既存バックアップに一致しました。元runnerの接続経路が原因である可能性が高いと推定しました。

固定SHA・対象job・root/Blog未開始を確認する制御39395711461で停滞jobを停止し、公開URL671パスを監査しました。既存670ファイルは全て旧バックアップに一致、611画像も一致し、まだ無い新規CSS1件のみでした。中途半端なroot更新はなく、復元のための書込は不要でした。

その後、**同じrunのキャンセル済みdeploy jobだけを再実行**しました。別main push、手動の二重FULLデプロイは行っていません。初回の失敗・取消記録も保持しています。attempt2は新規完全バックアップ→assets→CSSハッシュゲート→公開画像バイトゲート→root→Blog→live verifyの全工程SUCCESS。CSSは17:59:50 JST、画像ゲートは18:00:27、rootは18:00:46頃、Blogは18:02:02、最終確認は18:03:03に完了しました。

公開後の通常URL45件でもbuildとのバイト一致を確認し、別の672ファイル監査もPASS。戻り客向けJSキャッシュ更新テストもPASSしています。

## バックアップとロールバック

公開直前の最新復旧元はartifact **12252042019**、`xserver-backup-39392124975`。2026-10-20 17:53:42 JST保存、678ファイル・展開後108,242,169 bytes、ZIP103,194,014 bytesです。

- SHA256：`61eef30f9c98c9856bab842f6930e77ad06a29577c608957deb7715b40d1ffa8`
- [GitHubバックアップ](https://github.com/maxi001maxi/the-rev-website/actions/runs/39392124975/artifacts/12252042019)
- Artifact期限：**2026-11-03 17:53:38 JST**。有効期限後の利用には別途保存したZIPが必要です。
- ローカルでもZIP digestと全678エントリのパス・サイズ・SHA256を再照合し、既存06:09 UTCの正常スナップショットとも全内容が一致しました。
- 前回のartifact12243869479も検証済みですが、今回保存した新しい完全バックアップを優先します。既知不完全artifact12091359317は使用禁止です。

復旧は既存 `docs/qa/2026-10-17/RELEASE_AND_ROLLBACK.md` と `XSERVER_DEPLOY.md` に従い、原因に関係するassets→対象root→必要な場合のみBlogの順です。後から公開された記事、`.htaccess`、`.user.ini`、`unlimited-dev`等を保持します。root削除・git force-pushでの全体巻戻しは禁止です。今回、全体復旧の実行やリハーサルはしていません。復旧手順と完全な復旧元を確認しました。

## 保存物と未解決事項

本番のTOP・Recovery・Trainer・Price・Column・Accessについて、PC1440pxとスマホ390pxの**元PNG12枚**を保存しました。全77枚とJSONは本番専用artifactに保存し、12枚のJPEG閲覧用コピーと本報告をQA evidenceブランチにも記録します。公開runtimeへの追加変更ではありません。

| 証拠 | Artifact / ZIP SHA256 |
|---|---|
| 本番22画面・672照合 | [12252607411](https://github.com/maxi001maxi/the-rev-website/actions/runs/39398014975/artifacts/12252607411) / `a584e31a49cd95be0c78d2e3f3eb7639aa26c602521444f6794529d7398361a7` |
| 本番532・計測構築 | [12252209806](https://github.com/maxi001maxi/the-rev-website/actions/runs/39397851894/artifacts/12252209806) / `c3c724a6de73cf8b3d146962caf4e8010c89886c448aaecf5ae8d9008a5e3590` |
| 最終Preview55画面 | [12249845828](https://github.com/maxi001maxi/the-rev-website/actions/runs/39390705456/artifacts/12249845828) / `b67c84bf55217a6db4ac8278054e178356da8bd1bdea3072561145919b9d96a9` |
| 予約6ケース | [12249600903](https://github.com/maxi001maxi/the-rev-website/actions/runs/39390265341/artifacts/12249600903) / `aac8301fb99e17674f45aa3337e6d6e759cbc6f1bce759e37357f933e3245e81` |

初期の本番観測39392834494はデプロイ待ちでタイムアウトし旧サイトを取得したもので、今回の公開後受入には使っていません。merge連動GA4 audit39392124979はproduction/local-runtimeのjobが成功、別admin-preview-smokeが古いVercel URL HTTP410で失敗しています。これも今回のXserver静的公開から独立した既存課題として記録します。

残存リスクは、Editorial SENT/PENDING、既存GTM詳細パラメータのmapping不足（実リクエストのpageType/placementがnull）、GA4実受信未確認、物理実機未確認、375px料金見出しの軽微な折返しです。サイト上の予約先・UTM・DOM/dataLayer属性と一回イベントの構築は維持されています。外部Maps iframeの機能は制御ブラウザー環境で未確認です。これらを本番表示・予約操作の新規回帰として扱わず、検証限界と既存課題を明記します。

Stage 3への引継ぎ：未承認提案#2〜#10と暗背景見出し明朝化は未採用のままです。提案内容の新規作成・実装は行っていません。375pxの既存折返しは次回の承認対象として別管理します。

ファイル転送サービスへの保存はHTTP403で失敗したため、保存成功とは扱っていません。代わりに本報告・閲覧用本番画像・検証JSONをGitHubのQA evidenceブランチへ記録し、元画像・検証一式・完全バックアップをダウンロード用ファイルとして提供します。バックアップの既存GitHub Artifact期限は上記のとおりです。

## 本番画像（閲覧用JPEG／元PNGは配布ZIP）

| ページ | PC 1440px | スマホ390px |
|---|---|---|
| TOP | [画像](screenshots/THE_REV_Production_TOP_PC_1440.jpg) | [画像](screenshots/THE_REV_Production_TOP_Mobile_390.jpg) |
| RECOVERY | [画像](screenshots/THE_REV_Production_RECOVERY_PC_1440.jpg) | [画像](screenshots/THE_REV_Production_RECOVERY_Mobile_390.jpg) |
| TRAINER | [画像](screenshots/THE_REV_Production_TRAINER_PC_1440.jpg) | [画像](screenshots/THE_REV_Production_TRAINER_Mobile_390.jpg) |
| PRICE | [画像](screenshots/THE_REV_Production_PRICE_PC_1440.jpg) | [画像](screenshots/THE_REV_Production_PRICE_Mobile_390.jpg) |
| COLUMN | [画像](screenshots/THE_REV_Production_COLUMN_PC_1440.jpg) | [画像](screenshots/THE_REV_Production_COLUMN_Mobile_390.jpg) |
| ACCESS | [画像](screenshots/THE_REV_Production_ACCESS_PC_1440.jpg) | [画像](screenshots/THE_REV_Production_ACCESS_Mobile_390.jpg) |
