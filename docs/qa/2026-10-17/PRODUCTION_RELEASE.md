# TOP v7 / Recovery v8 本番公開・最終受入

更新：2026-10-17T15:18:32+09:00

**CONDITIONAL GO — 本番公開・静的機能受入完了。** Ownerの「このまま本番サイトの実装、公開をお願いします」を受けPR #254をmergeしXserverへ公開した。追加のサイト公開承認待ちはない。GTM管理設定の変更は別承認のまま。GA4実受信・公開後のCompany OS同期は未確認を維持する。

- 本番：https://therev-lab.com/
- PR：https://github.com/maxi001maxi/the-rev-website/pull/254 （merge済み）
- 公開ソース：`a3b98e788238ee84dac77416d332e689856639d2`
- [FULL転送run39006859070](https://github.com/maxi001maxi/the-rev-website/actions/runs/39006859070)：全転送完了、旧CSS検査でFAIL。履歴を保持。
- [修正後の読取専用完全受入run39008806727](https://github.com/maxi001maxi/the-rev-website/actions/runs/39008806727)：PASS。検証コード92769820、公開成果物の変更なし。
- 機械証拠：[PRODUCTION_ACCEPTANCE_EVIDENCE.json](PRODUCTION_ACCEPTANCE_EVIDENCE.json)。532件の完全JSON/CSV・全画像は [Artifact12091893650](https://github.com/maxi001maxi/the-rev-website/actions/runs/39008806727/artifacts/12091893650) に保存（2026-10-31 06:16:55 UTCまで、ZIP SHA256 e0045ec0ae70c95c1fb0436a37baee4a633e7696f2bb45f1bf46938fd6062d95）。

## 1. 発見した退行・原因と解決

GTM/HealthClub/予約UTMは先行修正を維持。追加で、main.jsの旧URLが7日キャッシュされる問題を確認し、main/unified-navigation/home-v7のURLへ内容SHA12桁を付与した。39HTMLのURLのみ変更、本文・画像・CSS・JS本体は不変。全691ファイルの比較・Preview/Production同等性・実キャッシュ回帰・通常表示4組ピクセル一致を確認した。

初回30分timeoutでBlog記事1件が欠損したため、原子的な限定修復と最終FULL転送で復旧した。バックアップ完全性検査（5回帰試験）を追加し、欠損を含む中間バックアップを復旧候補から除外した。

旧公開確認はv7 TOPへ旧style.cssリンクを要求していた。全6ページの実参照CSSのHTTP/完全SHA一致を追加し、既存style.css fingerprint/bytes/VOICE規則はPriceで維持。専用CSS・古いCSS拒否・HTML欠損拒否の3回帰テスト合格。テスト基準を単に削除してPASSにしていない。

## 2. 変更範囲

公開用：`scripts/prepare-deploy.mjs`（JS fingerprint）、技術回帰・実キャッシュ試験。承認済みHTMLのデザイン/文章/料金/営業情報/公式予約先は変更していない。

運用/検査：`deploy-xserver.yml`（FULL parallel2・45分、バックアップ完全性・既知不良除外・正しいCSS確認）、`verify-xserver-backup.mjs`/テスト、`verify-production-styles.mjs`/テスト、`production-site-acceptance.yml`、`production-release-readback.yml`、解析送信遮断helperと旧監査修正、公開/復旧文書。FTPS証明書、14日保存、48h安全網、assets先行/Blog LAST、並行変更保持の条件は維持。

## 3. 旧サイトと新TOPの差分

| 項目 | 旧サイト | 公開した新TOP/統合サイト |
|---|---|---|
| 見た目/文章 | 旧TOP | 承認済みv7/Recovery v8を維持 |
| GTM/基本イベント | GTM-WFD7R8BT/既存名 | 同一ID・同一名、二重初期化なし。dataLayer分類/配置を維持 |
| 詳細属性 | 公開GTMに既存不足 | 同じ不足を明示、無断変更なし |
| SEO | 旧HealthClub/metadata | 確認済みHealthClub・canonical/OGP/robots/sitemap維持 |
| 予約 | Gym's公式URL/4UTM | 同一予約先、website/referral/trial/配置のUTM、クリック≠完了 |
| JSキャッシュ | URL固定/最大7日 | 内容SHA付きURLで再訪問者も現行JS取得 |
| Price実験/Company OS | 既存control/標準集計 | 契約不変、treatment未開始、完了予約UNKNOWN |

## 4. 本番テストと証拠

本番全6ページ×7画面幅：532/532 PASS、JS例外0、自サイト通信失敗0、証拠画像63枚。通常URL 43件の本番バイトがビルドと完全一致。実参照CSS 8件一致、元の本番verify全項目とカテゴリー検証も合格。実GTM/Googleタグと単一page_view・意向イベント要求は7ページ合格。

Production build・静的SEO/JSON/UTM回帰合格、元のlive verify全項目・Blog公開24件/下書き非公開・日付/カテゴリー149チェック合格。実キャッシュ試験・CSS検証3ケース合格。外部観測226件はすべて意図的に遮断したGoogle Maps埋込であり、地図の今回の表示PASSとは扱わない。PC/スマホはChromium7画面幅で、物理iPhone/Safari/Firefox合格を主張しない。外部予約は既存Owner通常利用確認の例外を明示する。

## 5. 残条件・担当・公開判断

1. GA4実受信：Owner/GA4閲覧担当が自然発生のpage_viewと既存意向イベントをRealtimeで受動確認する。新TOP/Recoveryのpage_locationを区別し、自然流入0を欠落と決めつけない。通常同意条件の2環境で新版由来の基本収集欠落が再現した場合は公開担当が停止・復旧する。

2. Company OS：計測/Company OS担当が次の正常定期同期、遅くとも2026-10-19 15:01 JSTまでにproperty552679302の公開後observed_at、完了日、標準pagePath/eventName集計、partial/UNKNOWN契約を再判定する。現時点のsourceはACTIVE/errorなしだが最終観測は公開前であり、新TOP反映はUNVERIFIED。読み取り側だけの問題ならサイトを先に巻き戻さない。

3. GTM詳細12属性：既存公開コンテナのpage_type/placement等のマップ不足は継続。OwnerがGTM_PARAMETER_MAPPING_OWNER_REVIEW.mdの具体案を別承認し、権限を持つGTM担当がworkspace差分・同意・単一送信を確認して適用する。サイト側イベントとCompany OS基本集計契約は維持。現段階で属性による配置比較を開始しない。

4. Price REV-EXP-2026-001：計測担当が公開24〜48時間後にcontrolのsection_view sessionsを確認。treatmentは開始しない。10/17は公開切替と旧自動監査の影響日として注記し、翌完了日との比較を区別する。

5. 外部予約UIの厳密自動操作FAILはOwner通常利用確認の例外を維持。公式URL・リダイレクト・UTM保持・3メニューのGET確認は合格。実予約、顧客情報、決済は送信していない。

重大なサイト退行は最終受入で認められず、公開状態を維持可能。GA4実受信と同期未確認だけを理由に無期限HOLDにしない。Ownerの残操作は、GA4閲覧担当への受動受信確認と、GTM12属性案を適用する場合の別承認。サイトコード編集・全QAやり直しは不要。

## 復旧元・停止条件

正常な公開前復旧元：Artifact12090654704 / xserver-backup-39005228524、434ファイル、93,304,312 bytes、ZIP SHA256 055bbe71a7b97bd208e55da0519f39e858ff2cb2218273f1090a20e0f3e48504、2026-10-31 05:30:01 UTCまで。Artifact12091359317は中断時の欠損入りのため復旧禁止・fallback除外済み。

主要5xx、本文/ナビ不可、誤予約先、noindex/canonical退行、主要asset欠損、新版由来の基本計測欠落が再現した場合は公開担当が停止・復旧。[RELEASE_AND_ROLLBACK.md](RELEASE_AND_ROLLBACK.md)に従い、assets→対象root→必要時のみBlog。後続記事を保全しroot全削除・Git force-pushをしない。

## 経過・例外を隠さない記録

- 初回公開run39005228524 attempt2は旧30分上限でBlog転送中に取消。DENBA記事1件が16384 bytesに欠損した。run39007782884で限定原子的修復し、通常URLで25164 bytes/SHA c28a72ffce9e59a8ebd7b06ea4fd15a2fa61de76ec1f63e0492d261a720ce04dを確認。最終FULLで全Blogを転送し、今回通常URLの全記事バイト一致を確認した。

- 最終FULL run39006859070は転送完了後の旧TOP用CSS検査でFAIL。TOP v7はtop-v7.cssを使うため、存在しない旧style.cssリンクを要求していた。92769820で全6ページの実参照CSS一致を追加し、共通style.cssのfingerprint/bytes/VOICE規則はPriceで維持した。古いFAILはそのまま保持し、読取専用run39008806727で元の全本番verifyと追加受入が成功。再転送で結果を隠していない。

- JSは旧本番で7日キャッシュのため内容SHA付きURLへ変更。691ファイル比較で39HTMLのscript URL以外に差分0、Production/Preview parity691合格、TOP/RecoveryのPC/スマホ4組は変更前後ピクセル完全一致。今回readbackでも実HTTPキャッシュ試験合格。

- 旧自動GA4監査run39005228556は05:10:00〜05:11:03 UTCに旧サイトの6 page_view+1 article_view要求を観測。実受信は未確認。監査を送信前遮断へ修正済みで、今回7ページ実GTM試験は解析送信0。全作業が最初から汚染0だったとは主張しない。

- PC/スマホは実Chromiumを7画面幅で操作した。物理iPhone/Safari/Firefoxの合格は主張しない。履歴試験ではGoogle Maps iframeを除外し、過去の実ブラウザ確認と区別した。

- 別案件mainのEditorial/Operator変更を保持。現行Editorial検証合格、Phase9 164/0。以前の非公開Job不一致や旧Vercel admin smoke失敗を現在の本番サイト障害とは扱わず、全CI緑とも主張しない。

