# 実装方針：Cを Visual Source of Truth とし、mainの本番機能・計測契約を維持する

2026-10-11 JST ／ 対象：TOP（`index.html`）の本番実装 ／ 前提：[handoff](./CODEX_PRODUCTION_IMPLEMENTATION_HANDOFF.md)・[差分](./PHASE6_VS_ADOPTED_C_DIFF.md)

## 1. 原則

> **見た目・構成・文言・寸法はCの検討画面が正。機能・計測・リンク先・外部契約は現在のmainが正。**
> 衝突したら止めて Owner に確認する（勝手に両者を混ぜない）。

実装は「C検討CSS／マークアップを、mainの既存Hooksの上に載せる」形で行い、`main.js` と共有 `style.css` を**書き換えて**Cを実現しない。

## 2. 維持する契約（main側、変更禁止）

| 契約 | 現行の根拠 | 方針 |
|---|---|---|
| GTM `GTM-WFD7R8BT` の head script と body noscript | `index.html` の `<head>` 冒頭と `<body>` 直後 | **逐語で保持**。GTM／GA4コンテナは変更・公開しない |
| dataLayer push（`pushTrackingEvent`）と共通パラメータ | `main.js` §9：`event_version:'e1_v1'`、`site_version`（`<html data-site-version>`、既定 `pre_m1`）、`page_path`、`page_type:'home'` | **`main.js` の計測関数を変更しない**。新ページでも `<html>` に `data-site-version` を足さない（現行TOPにも無く、既定値が使われている） |
| クリック計測の発火条件 | `a[data-track]` をdocument委譲。`reserve_click` は `href` が `https://cl.gyms.jp/` の時のみ。`data-*` は `snake_case` で自動送信 | **計測対象は必ず `<a data-track data-placement href=...>`**。`<button>` やJSでの遷移にしない。予約リンクのhrefを本番URLに戻す |
| 送信しない情報 | 個人情報・健康情報・自由入力 | タブ内容・フォーム値などをdataLayerに送らない（タブ切替は計測しない） |
| `section_view`（key section到達、25%可視で1回） | `initSectionTracking`（`home` の `defs`） | §4 の対応表で**意図を記録した上で**セレクタを更新（これが唯一の計測コード変更候補。IDの値は可能な限り維持） |
| `faq_open` | `initFaq`（`.faq-q`） | Cにアコーディオンが無いためTOPでは観測不能になる（要承認：handoff §9-2）。`initFaq` は他ページ向けに**そのまま残す**（`.faq-q` が無ければ何もしない） |
| ローダー／ヘッダー／ドロワー／ロゴ再読み込み／画像先読み | `initLoader`／`initHeader`（`.site-header.scrolled`）／`initDrawer`（`.nav-toggle`＋`.rev-drawer#revDrawer`＋フォーカストラップ＋body固定）／`initBrandHome`／`initImagePrefetch` | **マークアップのHooksを維持**して再利用：`#site-loader`、`.site-header`、`.nav-toggle`、`.rev-drawer`（`aria-hidden`／`role=dialog`）、`.rev-drawer-close`、`.brand`。Cの検討JS（`data-state`ヘッダー、独自ドロワー）は**移植しない** |
| サイト内リンク先 | blog記事等から `/#faq`（38件）、`/#service`（38件）ほか | `#service` は維持。`#faq` は `#questions` へ着地するよう**別名アンカー**を置く（例：`<span id="faq"></span>` をQuestions先頭に）。`#trainer`／`#access`／`#pricing`／`#voice`／`#contact` も既存リンクがあれば維持（実装時に全文検索） |
| `price.html` の `REV-EXP-2026-001` | `#cat-trial[data-track-section="pricing_trial"]` | **触らない**。TOPからの `price.html#cat-*` リンクは `#cat-training`／`#cat-boxing`／`#cat-recovery` を維持 |
| 構造化データ・meta | JSON-LD（HealthClub、`priceRange` 含む）、OGP、canonical、`og:image` | そのまま保持。文言変更が必要な場合はOwner承認 |
| 配信パイプライン | `prepare-deploy.mjs`（ルート `*.html`＋`assets`／`blog`／`admin`のみコピー、style.cssのハッシュ付与）、`vercel.json`（`git.deploymentEnabled=false`）、`deploy-xserver.yml`（mainのpushで起動） | 変更しない。新CSS／JSは `assets/` 配下に置く（配信対象）。**キャッシュ更新方法を決めて記録**（style.cssのみハッシュ付与される） |

## 3. CTA・配置（placement）の契約

凡例：**維持**＝現行mainに存在し同じ値／**新規候補**＝この設計で提案、未観測／**削除**。`utm_content` は予約リンクのみ、`data-placement` と一致させる。

| 配置（`data-placement`） | イベント（`data-track`） | 行き先 | 状態 | 備考 |
|---|---|---|---|---|
| `home_header` | `reserve_click` | 予約 | 維持 | Cのヘッダー「初回体験を予約」 |
| `home_drawer` | `reserve_click`／`line_click`（／`instagram_click`） | 予約／LINE（／Instagram） | 維持 | Instagramの扱いは要判断（handoff §9-6） |
| `home_hero` | `reserve_click` | 予約 | 維持 | |
| `home_hero_line` | `line_click` | LINE | **新規候補** | 現行Heroに LINE無し |
| `home_service_training` | `price_click` | `/price.html#cat-training` | 維持 | リンク文言：月額プラン・入会金を見る |
| `home_service_boxing` | `price_click` | `/price.html#cat-boxing` | 維持 | 回数券の料金・有効期限を見る |
| `home_service_recovery` | `recovery_click` | `/solution.html` | 維持 | 酸素ルーム・DENBAについて見る |
| `home_voice` | `review_click` | Google Maps口コミ | 維持 | `target=_blank rel=noopener` |
| `home_trial` | `reserve_click` | 予約 | **新規候補** | Trial区画下。`home_pricing` を流用しない |
| `home_trial_guide` | `line_click` | LINE | 維持 | Trial内「LINEで相談」（現行は旧trial-guide内） |
| `home_trial_recovery` | `recovery_click` | `/solution.html` | **新規候補** | Recoveryタブの注意事項リンク |
| `home_pricing`（予約ボタン） | `reserve_click` | — | **削除** | 予約はTrial／Finalへ |
| `home_pricing` | `price_click` | `/price.html` | 維持 | 「すべての料金を見る」 |
| `home_pricing_training`／`_boxing`／`_recovery` | `price_click` | `/price.html#cat-*` | **新規候補** | 料金行ごとのリンク |
| `home_pricing_frequency` | `article_click` | `/blog/personal-training-frequency/` | **新規候補** | 月2／月4カード。`data-article-slug` を付与 |
| `home_trainer` | `trainer_click` | `/trainer.html` | 維持 | 「経歴と指導の考え方を見る」 |
| （Method内リンク「担当トレーナーについて詳しく」） | **なし** | `#person` | 新規（計測なし） | 内部アンカー。`data-track` を付けない（未定義イベントを作らない） |
| `home_access` | `access_click` | `/access.html` | 維持 | ※`access_click` は GTM Custom Event の正規表現（`docs/analytics/GTM_GA4_IMPLEMENTATION.md` §4）に**含まれていない**（既存の状態。今回は直さない） |
| `home_questions` | `article_click` | 記事5本 | **新規候補** | 各リンクに `data-article-slug`（`main.js` が `article_slug` として送る） |
| （Questions内「コラムの一覧を見る」） | **なし** | `/blog/` | — | 検討版で付けていた `blog_click` は未定義イベントのため**除去済み**（handoff commit） |
| `home_final` | `reserve_click`／`line_click` | 予約／LINE | 維持 | |
| `home_footer` | `reserve_click`／`line_click`／`instagram_click` | 予約／LINE／Instagram | 維持 | |
| `home_fixed_cta` | `reserve_click` | 予約 | **削除（要承認）** | Cは固定CTA未採用 |
| `home_recovery` | `recovery_click` | `/solution.html` | **削除** | 区画ごと廃止 |

計測の限界（据え置き）：CLICK-OUT ONLY／予約完了は観測不能／`placement` 別受信とカスタムディメンションの一部は未確認。新規placementを「既存の実測値」と書かない。

## 4. `section_view` 対応表

現行 `home` の `defs`（`initSectionTracking`）→ C構成。**section_id の値は時系列比較のため可能な限り維持**。

| 現行 `section_id`（セレクタ） | C側の対応 | 提案 |
|---|---|---|
| `trust`（`.trust-strip`） | 該当区画なし | 退役（ID廃止を記録） |
| `service`（`#service`） | Choice `#service` | **維持** |
| `empathy`（`.empathy`） | 該当区画なし | 退役 |
| `voice`（`#voice`） | Voice `#voice` | **維持** |
| `trainer`（`#trainer`） | Person `#person` | **ID値 `trainer` を維持**し、セレクタを `#person` へ |
| `recovery`（`#recovery`） | 該当区画なし（Choice内に統合） | 退役 |
| `trial`（`.trial-guide`） | Trial `#trial` | ID値 `trial` を維持（意味が「Pricing内ガイド」→「体験区画」へ変わる点を記録） |
| `pricing`（`#pricing`） | Pricing `#pricing` | **維持**（意味が「体験＋継続」→「継続」へ変わる点を記録） |
| `faq`（`#faq`） | Questions `#questions` | 新ID `questions` を推奨。`faq` は退役（`faq_open` と同様に連続性が切れる点を記録） |
| `access`（`#access`） | Place `#place` | ID値 `access` を維持し、セレクタを `#place` へ |
| `final_cta`（`#contact`） | Final `#final` | ID値 `final_cta` を維持し、セレクタを `#final` へ |
| （新規） | Method `#method` | `method` を新規候補として追加するか判断（任意） |

注：`section_view` は区画が高くても25%可視で1回のみ発火。`#faq` の別名アンカーは空要素のため `defs` のセレクタには使わない（`#questions` を使う）。

## 5. 見た目の移植ルール（C → main）

- **CSS隔離**：TOP専用ファイル＋クラス接頭辞（検討CSSの `.hero`／`.btn`／`.sec` 等は `style.css` の既存クラスと**衝突**する。例：`.hero`、`.cta`、`.section`、`.brand`、`.nav`）。そのまま貼らない。`body` 直下のリセットや `html{scroll-behavior}` が他ページに影響しない形に。
- **トークン**：検討CSSの `:root` 変数（`--bg #F5EFE5`、`--bg-trial #FFFAF1`、`--ink #3C3029`、`--ink-2 #716154`（C参照 `#7B6B5D` からAA確保のため微調整）、`--line #D2C5B5`、`--dark #45382E`、`--band #E3D6C0`、`--cta #EAD8B6`／`--cta-ink #352E26`、`--illust-bg #EEE0C9`）を**TOP専用スコープ**に定義。現行の紙色 `#FBFAF7` 等を他ページから変えない。
- **ヘッダー**：他ページは共通ヘッダー（`style.css`）のまま。TOPのみCのヘッダー見た目（Hero上は透明→スクロールで暖色の面）を `.site-header.scrolled` で実現。ナビ項目はC準拠（サービス／初回体験／料金／トレーナー／アクセス／予約。**コラムはフッター**）。
- **ドロワー**：`main.js` の `initDrawer` が前提とするマークアップ（`.nav-toggle`／`.rev-drawer`／`.rev-drawer-close`）の上に、Cのドロワー見た目（ナビ7項目＋予約＋LINE）を適用。検討JSの `hidden` 方式は使わない。
- **タブ**：検討JS（WAI-ARIA tabs、矢印／Home／End、0.3秒の表示遷移、JS無効時は全パネル表示）を**TOP専用ファイル**として移植。`html.js` クラスは現行にないため、**headの最小インライン**かTOP専用JS先頭で付与し、JS無効時のフォールバックを保つ。
- **Reveal**：検討版は `.rv` ＋ IntersectionObserver。現行mainの `.reveal`／`initReveal` と二重にならないよう**どちらか一方**に統一（mainの `.reveal` を使うのが安全）。`prefers-reduced-motion` で即表示。
- **画像**：現行の `<picture>`（webp＋jpg）書式。`width`／`height` 属性と `loading`／`fetchpriority`（Hero画像のみ `high`）を維持。Mobile Heroは `photo-lobby-sp`。
- **インラインSVG**：Boxing線画、Methodアイコン、Trialの段階図、Final線画。装飾は `aria-hidden`、意味を持つBoxingのみ `role=img`＋`<title>`。`vector-effect:non-scaling-stroke` は線幅の見え方に影響するので移植時に確認。
- **動き**：タブ0.2〜0.35秒、リンク矢印・画像の微細hover、控えめな表示遷移のみ。自動カルーセル・スクロール固定・parallaxは**作らない**（現行の Hero Ken Burns 等の既存アニメーションは、Cの見た目に合わないなら**TOP専用スコープで無効化**し、他ページへ波及させない）。

## 6. リリースの安全策

1. 実装は**別ブランチ**。このデザイン保存ブランチ（`claude/the-rev-top-v2-1-c-design-4k6uwo`）には実装を積まない。
2. `main` へのmerge＝`Deploy to Xserver`（`*.html`／`assets/**` 変更で自動起動、FTPSでバックアップ→本番反映）が走る。**Ownerの明示承認なしにmergeしない**。
3. Vercelは `docs/operations/VERCEL_RELEASE_POLICY_V1.md`：中間commitではdeployしない、Preview 1回（全ローカル／CI gate通過後）→ 承認後 Production 1回（exact main SHA）。rolling 24hのdeploy数を確認（40以上で警戒、60以上で非緊急停止）。`git.deploymentEnabled=false` は維持。
4. 公開直後の確認：Production URLで `reserve_click`／`line_click` が dataLayer／GA4 Realtime に出ること（ただし**GTM公開は行わない**。既存コンテナの挙動確認のみ）。
5. ロールバック：`Deploy to Xserver` のバックアップArtifact（48時間）と直前のmain SHAの再deploy。

## 7. 禁止（再掲）

main merge／Production deploy／価格変更／GTM公開変更／予約システム変更／`price.html` の実験部分の変更／`main.js` の計測関数の変更／未承認のplacement削除（`home_fixed_cta` 等）／デモ用CTAのまま公開。
