# THE REV. 統合作業の最終状態

# 公開前QA結果 — 2026-10-17

判定: **ステージングでOwner最終確認可能**。mainマージ・本番公開・Xserver適用は未実施。

- Preview: https://the-rev-website-9eia5e5bd-htrmaxi0101-9305s-projects.vercel.app/
- runtime SHA: `ec529f3d629b053b3db3d16c3eafdfa95a49a30a` / deployment `dpl_77TbYrkYCx726dvKa3jJHdDeKCRK`
- Draft PR: https://github.com/maxi001maxi/the-rev-website/pull/254
- 正本: root index.html / solution.html + assets。Preview限定差し込みは廃止。

## 検証
- 実Chromium7サイズ × 全6ページ、532チェックPASS。JSエラー0、自サイト通信失敗0。
- 6ページ × 7メニュー × 7サイズの294遷移と履歴往復、スクロール・現在地・drawer・Escape・focus・復元位置・予約URL・3タブ・DENBA・記事を確認。
- 本番/Previewビルド680ファイル一致（robotsのみ意図した差）。
- 内部リンク/アセット2295件、欠損0。
- GitHub CI: Control Capture Contract / Phase 9 Check / Unified public site QA 成功。詳細run IDはRESULTS.json。
- 配備済みPreviewの実操作はRESULTS.jsonのremote_browserを参照。
- 証拠画像と詳細ログはChatGPT添付の単体HTMLレポートに埋め込み。CIのunified-public-site-qa artifact（14日保存）にも7サイズ画像・CSV・JSONを保存。配備先QA run: https://github.com/maxi001maxi/the-rev-website/actions/runs/38991029681 （deployed-public-site-qa artifact）。

## 修正
通常ビルドへのTOP v7/Recovery v8統合、デザイン用runtime除去、Recoveryヘッダーの視認性と重なり、drawerのスクロール復元と遅延focus競合、記事のColumn現在地、既存Recovery注意アンカー、ローカルフォント配信。

## 残る確認
- Owner最終デザイン・文章・予約導線の承認。公開操作は承認後の別工程。
- Windows固有環境・実機iPhone Safariは未実施。7サイズChromiumのレスポンシブ検証を実施。
- 実予約・送信・決済・有料生成は実施していない。
- Google Mapsは制御した履歴QAで遮断し、実ブラウザで店舗ピン付き地図の表示を確認。予約先も3メニューの表示を確認（送信なし）。

## 再開
BUILD_AND_RESUME.mdを読む。配備済みruntime SHAを基準とし、QA記録のみの後続commitでは再配備しない。mainの並行記事更新を公開承認時に再確認する。

元承認ソース履歴: `019d37bbd207f741542cad23d7613a3e3d5ab4c9`。統合済みmain: `89de47cdb37aa3a5fe29e1c26f8b09577164a8f5`（main自体は本作業で変更なし）。その後の main `ebd99ee` は記事引継ぎ文書のみで、受入済みruntimeへの影響なし。


## 2026-10-17 技術退行監査（PR #254、公開保留）
TOP v7 / Recovery v8のGTM・JSON-LD・予約UTM欠落を確認して復元中。前回QAの「UTM保持」は不正確で訂正。見た目と文章は維持。詳細・再開地点: docs/qa/2026-10-17/TECHNICAL_RECOVERY_WORKLOG.md。mainへのマージ・本番公開・Xserver適用・GTM/GA4設定変更・予約成立は実施しない。

追加: 公開中GTMが全ホスト初期化であることを確認。build-review-siteで全ビルド共通の本番ホスト許可ガードを追加し、Owner手動Preview確認のGA4汚染も防止。本番イベント名・設定は維持。

## 2026-10-17 最終技術QA：公開保留
実装修正bd3f219、ソース全ツリー照合済み。サイト532・技術20・691ファイル同等性はPASS。現在のPreview dpl_BgedYMG9n63F549j9Vkde9GkrZ65（d6ffcfeb）も配備先532 PASS。最新フォーカス重なり修正はPreview未反映。外部予約UIプローブFAIL／既存GTM属性転送FAIL／GA4受信UNVERIFIEDのため公開HOLD。GTM差分案はOwner承認対象・未適用。追加PreviewはAGENTSの全CIゲート規則により保留。詳細と再開先：docs/qa/2026-10-17/TECHNICAL_REPORT.md。mainマージ・本番・Xserver適用なし。

## 2026-10-17 Owner例外承認後の確認用Preview更新完了
Ownerの「続行」により、外部予約UI FAILを明示した確認用Previewの更新を例外承認。dpl_6LqoHfZQnzvpdTx6CvW4K5Sgd7un / 配備SHA f749d9c21370287efbb4fb3cb47ed3046ba3c98c / READY。最新フォーカス修正も反映。実Cloud Chromeで6ページ往来、TOP/RecoveryのTab非遮蔽・Enter本文移動を確認。配備先CI38998326481はサイト532 PASS・63画像・JS例外0・自サイト通信失敗0、外部予約UIのみFAIL。GTM属性転送FAIL・GA4受信UNVERIFIEDは継続し、公開HOLD。追加デプロイ不要。main・本番・Xserver・GTM管理設定は未変更。

## 2026-10-17 最終受入（最新判定）
FINAL_ACCEPTANCE.md / RELEASE_AND_ROLLBACK.mdを参照。Owner通常予約確認を受入根拠に追加。main f1667a7を安全に取り込み、公開691ファイルは受入済み実装CIの全バイトと一致。技術20・既存計測契約・Production SEOを再確認。詳細GTM属性FAIL、実受信/Company OSライブUNVERIFIEDを公開後条件へ分離。別案件の未公開V3 Job参照不一致によるPhase9 FAILは維持し、サイト公開物への非影響を確認。CIの技術ブラウザ長時間未終了に240秒FAIL/証拠保存を追加。判定CONDITIONAL GO、main/本番/GTM設定は未変更。

最終受入追記：既存Company OSのライブ参照をREAD ONLYで実施。10/17 07:32 JST同期ACTIVE/エラーなし、7日集計VALUE、今日partial、予約完了UNKNOWN。未確認なのは新TOP公開後の反映。最新判定・期限付き条件はFINAL_ACCEPTANCE.mdに集約。

最終確定：実装修正d3f2474のCI39001184604でサイト532/技術20/全技術画像保存PASS、JS例外0/自サイト通信失敗0。補助画像工程停止は解消。外部予約UI FAILと別案件V3 Job CI FAILは例外として明示し、全CI緑とはしない。判定CONDITIONAL GO。最終レポート・公開後条件・復旧手順・GTM操作票まで保存。Ownerのmainマージ＋Xserver公開の承認待ち。
