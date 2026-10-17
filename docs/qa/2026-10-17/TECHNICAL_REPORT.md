# THE REV. 技術退行回復・公開前QA — 2026-10-17

**技術修正はCommit/Push済み。公開判定はHOLD。** mainマージ、本番デプロイ、Xserver適用、GTM/GA4設定変更、実予約・顧客情報送信は実施していない。

## 1. 発見した退行と原因

承認済みTOP v7 / Recovery v8を通常HTMLへ移した際、GTM初期化、HealthClub JSON-LD、予約UTMが欠落した。Recoveryの本文・固定CTA4個には計測属性もなかった。追加監査で、TOPの高さゼロの旧アンカー参照／初回体験未観測、blog index.htmlのhome誤分類、本文スキップの表示不備を確認した。

前回の「UTM保持」記録は両ページについて不正確だったため訂正。今回の予約先プローブも当初、紹介文をメニュー表示と誤判定したため訂正し、完全なメニュー名・実コントロールを必須とするテストへ強化した。未確認をPASSにしない。

## 2. 修正内容・変更ファイル

- `index.html` / `solution.html`: 既存GTM＋noscript、店舗JSON-LD／Recoveryパンくず、OG/Twitter補完、全14予約アンカーのUTM・属性、実セクションの観測先、mainフォーカス。
- `assets/js/main.js`: 正しいblog分類、実コンテンツを優先したsection_view、計測初期化の重複防止。イベント名／e1_v1／実際のpage_pathは維持。
- `assets/css/unified-header-v7.css`: フォーカス時だけ本文スキップを可視化し、固定ヘッダーより前へ配置。通常表示は変更なし。
- `scripts/build-review-site.mjs`: 全ビルド共通で、GTMを本番ホスト2種だけで初期化。手動Preview確認もGA4を汚染しない。GTM管理設定は未変更。
- `scripts/test-technical-site.mjs` / `qa-technical-site.mjs` / `qa-booking-site.mjs`: ビルド成果物・イベント・実バッチ・表示・キーボード／遮蔽・予約遷移の回帰検証。
- `package.json` / `.github/workflows/unified-site-qa.yml`: 必須ビルド検査、実ブラウザと予約先検証・証拠保存。

承認済みHero・写真・本文・余白・レイアウト、料金・営業時間・予約システムは変更していない。

## 3. 旧サイトとの比較

| 項目 | 旧本番／main | 移行直後 | 修正後 |
|---|---|---|---|
| GTM | 1回初期化＋noscript | 両ページ欠落 | GTM-WFD7R8BTを復元。直接gtag追加なし |
| Google tag | GTM経由 G-Q6ZSSJMEZ2 | dataLayerだけ残り、初期化なし | 現行公開CDNの実行・要求生成を実ブラウザで確認 |
| HealthClub | 店舗情報あり、曖昧なpriceRangeあり | 欠落 | 公開Access/Legal/現行コピーと照合して復元。古いpriceRange・評価・未確認情報は追加しない |
| UTM | TOPは配置別、旧Recoveryはrecovery_page共通 | 14アンカーで欠落 | website / referral / trial / data-placement。公式URLは維持 |
| section_view | 旧セクションを観測 | trial未観測・一部高さゼロ | 実コンテンツを観測、同じイベント名／一度だけ |
| SEO／共有 | title/canonical/OGP等あり | 主要SEOは存在、一部SNS情報欠落 | 承認済みtitle/descriptionを維持、locale/画像寸法/Twitter等補完 |
| ビルド | 以前はPreview差し込み | 当作業開始時に通常HTML化済み | 本番／Preview 691ファイル同等、robots方針だけ差 |
| キーボード | 旧導線 | TOP非表示／Recoveryがヘッダー背後 | フォーカス表示とelementFromPointによる非遮蔽を確認 |

[全14アンカーのCTA Map](TECHNICAL_CTA_MAP.csv)。削除・再配置が承認済みの旧セクション／TOP固定CTA／重複SNSリンクを再追加していない。旧ヘッダーの内部リンクにも計測属性はなく、新イベントは作成しない。

Price HTML、`lib/ga4CompanyOsSync.mjs`、`lib/ga4ExperimentCapture.mjs`は開始時とバイト一致。REV-EXP-2026-001はcontrol・25%可視で一度、treatment開始なし。非体験Price CTAは既存pricing_page、pricing_trialは従来の配置対応を維持。全サイト公開は実験分析上の変更点として注記が必要。reserve_clickは予約意向であり、予約完了はUNKNOWNのまま。

## 4. 実行結果と証拠

| 検証 | 結果 |
|---|---|
| 本番／Previewビルド | 691ファイル、robotsメタとrobots.txtのみ意図した差：PASS |
| リンク／アセット | 2,260参照、欠損0：PASS |
| 実装候補の実Chromium | 6ページ×7サイズ、532チェック：PASS、JS例外0／自サイト通信失敗0 |
| 計測・SEO・キーボード | 20技術チェック：PASS。実GTM／Googleタグ／既存5イベントの要求生成まで確認 |
| 最新フォーカス修正 | beforeのヒット先はロゴ、afterは本文スキップ。遮蔽解消：PASS |
| 通常デザイン | TOP/Recovery × PC1440/スマホ390、全ページPNG4組が前後ピクセル一致：PASS |
| コンソール | 6ページでconsole error／pageerrorとも0（制御したPreview origin、スクロール含む） |
| 既存契約 | Phase E、Direct Read、Control Capture、Measurement Gate、Site Insights、GSC、Vercel Policy：PASS。Phase 9 164件、Phase D 75件PASS |
| 配備済みPreview | 全6ページ・7サイズ・532チェック：PASS。63画像保存 |
| 予約リダイレクト | 公式/t/→/trial/で全4 UTM保持：PASS |
| 予約メニューUI | 公開GET APIの3体験メニュー取得成功。実入力・選択フォームは20秒待っても確認できず：**プローブFAIL／通常環境の実際の挙動は未確定** |
| GTM属性転送 | 既存コンテナv3にpage_type／placement等の仕様上のマップなし：**FAIL（既存の外部設定課題）** |
| GA4本番への送信・受信 | 収集要求をローカル204で遮断、実送信なし。実受信／Company OS反映：**UNVERIFIED** |

最初の収集プローブはabortによる再送と固定4秒待機によるバッチ取りこぼしで失敗した。現在は送信前にローカル204を返し、実バッチを最大15秒待つ。exact-once条件は維持している。記事CTAはarticle_cta_clickと意図したreserve_clickを各1回確認した。

予約先の検証は新規・未ログインcontext、GETのみ、Service Worker・解析・通知・POSTを遮断。遮断されたPOSTはBugsnagセッション通信で、予約送信ではない。外部予約側の障害か制御環境の制約かは断定しない。顧客情報入力や予約確定は行っていない。空本文POSTの状態照会案は自動承認審査で外部セッション状態変更の可能性を理由に拒否され、未実施。その方法は再試行しない。

### SHA・CI・ステージングの対応

- 最新実装修正：`bd3f219a7653bd77f1a6f27c5b1efa7bafb88729`、完全ツリー`574c326850e3a595335f3c5755609b2361eabcd6`。
- [最新実装CI](https://github.com/maxi001maxi/the-rev-website/actions/runs/38996381862)：サイト532／技術20はPASS、外部予約UIプローブのみFAILのためworkflow全体はFAIL。
- [最新Control Capture](https://github.com/maxi001maxi/the-rev-website/actions/runs/38996381854)／[Phase 9](https://github.com/maxi001maxi/the-rev-website/actions/runs/38996381755)：PASS。
- 確認用Preview：<https://the-rev-website-27fwyd6ay-htrmaxi0101-9305s-projects.vercel.app/>。
- Deployment：`dpl_6LqoHfZQnzvpdTx6CvW4K5Sgd7un` / READY / 配備SHA`f749d9c21370287efbb4fb3cb47ed3046ba3c98c`。
- [最新配備先QA](https://github.com/maxi001maxi/the-rev-website/actions/runs/38998326481)：サイト532チェックPASS、63画像保存、JS例外0／自サイト通信失敗0。外部予約UIの待機だけFAILのためworkflow全体はFAIL。最新フォーカス修正も反映済み。別途、配備先の実Cloud ChromeでTOP/RecoveryをTab→非遮蔽（elementFromPoint一致）→Enterでmainへ移動できることを確認。
- 最新配備先artifact：サイト`12088172738`、予約先`12087789616`。artifactは2026-10-31まで。ユーザー向けHTMLレポートには63画像・JSON・比較画像を埋め込み保存する。

## 5. 残課題・公開可否・再開

**公開はHOLD。Draft PR #254を維持。**

1. [GTM属性マップの具体的な設定差分案](GTM_PARAMETER_MAPPING_OWNER_REVIEW.md)はOwner承認対象・未適用。イベント名転送と属性転送と実受信を混同しない。GTM/GA4管理設定は変更していない。
2. 公式予約先の実フォーム・メニュー表示を通常環境で確認する必要がある。公開APIに3体験メニューがあることは、UI動作確認の代わりにならない。
3. Ownerが例外承認の質問へ「続行」と回答し、外部予約UI不合格を明示した確認用Preview更新を承認。2026-10-17、最新コミットf749を一度だけPreview配備した。実装bd3とf749の差分は文書・証拠のみ。本番・main・Xserver・GTM設定は引き続き承認対象・未実施。
4. GA4実受信、予約完了、公開後のCompany OS反映、実機Safari/iPhone/Windows、公開サイトの速度実測、Google Rich Results Test／Schema Markup Validatorの画面投入は未確認。JSON構文・HealthClubの型／プロパティ・name/address／営業時間は公式仕様と照合済み。検索順位や表示は保証しない。

再開：このレポートとTECHNICAL_RECOVERY_WORKLOG.mdを読み、作業ブランチ最新refを取得。GTM設定／本番変更やPOSTを無断で試さない。

```
npm ci
npm run test:build-parity
VERCEL_ENV=production npm run vercel-build
npm run test:technical-site
npm run test:control-capture && npm run test:ga4-direct && npm run test:phase-e
npm run test:public-site-browser && npm run test:technical-browser
node scripts/qa-booking-site.mjs
```

根拠：[Google LocalBusiness仕様](https://developers.google.com/search/docs/appearance/structured-data/local-business)、[Schema.org HealthClub](https://schema.org/HealthClub)、`GA4_CURRENT_TRUTH.md`、`GTM_GA4_IMPLEMENTATION.md`、`GA4_DIRECT_READ_V1.md`、`REV_EXP_2026_001_CONTROL_CAPTURE.md`、Company OS `KNOWLEDGE_ARCHITECTURE_V1`／`REV_EXP_2026_001_TREATMENT_DESIGN_V1`。
