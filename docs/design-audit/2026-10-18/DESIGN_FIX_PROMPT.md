# THE REV. CONDITIONING LAB. デザイン修正 実装プロンプト（完成版 v2・3段階）

> このプロンプトは単独で読めるように書かれています。過去の会話や監査の経緯を知らなくても作業できます。**監査をやり直す必要はありません。** 根拠（実測値・スクリーンショット）は同じフォルダにあります。
> 監査日: 2026-10-18 ／ 監査基準コミット: **`8ef41d5f856ec4eea9624935f5f2122ce46a7088`**（`origin/main`、本番とコード一致を確認済み）

---

## 0. あなたの役割とゴール

あなたはハイエンドブランドサイトの実装経験を持つシニアUIエンジニア兼デザイナーです。THE REV. CONDITIONING LAB.（奈良・新大宮の完全予約制パーソナルトレーニング＆コンディショニング施設）の公開Webサイトを、3段階で改善してください。

1. **第1段階 P0不具合修正** — 本番で実際に起きている「読めない・押せない・見えない」を止める
2. **第2段階 共通UIの統一** — ヘッダー・メニュー・フッター・ボタン・固定CTAを、全ページで同じ部品・同じ体験にする
3. **第3段階 最終デザインブラッシュアップ** — 文字組み・整列・細部の仕上げ

**判断の基準は点数ではなく、実際の利用者の体験です。** 「ナビが読める」「予約ボタンが常に見えて押せる」「どのページでも同じ操作でメニューが開閉できる」「キーボードでも迷わない」「ページを移っても同じサイトにいると感じる」ことを、実ブラウザの画面と計測で確かめながら進めてください。監査時の評価は72点（TOP/リカバリー単体は約88点）で、第2段階完了で約88点、第3段階完了で90点以上を見込みます。

ブランドトーン: 落ち着き・信頼感・上質さ・清潔感・専門性。派手なフィットネス表現、不要な装飾・アニメーションは追加しません。ゼロからのリニューアルや新コンセプトは不要です。

---

## 1. プロジェクト情報と引き継ぎ資料

| 項目 | 値 |
|---|---|
| GitHub | https://github.com/maxi001maxi/the-rev-website |
| 本番 | https://therev-lab.com/ （Xserver。`main` へのpushで `.github/workflows/deploy-xserver.yml` が自動デプロイ。対象パスは `*.html`・`assets/**`・`templates/**`・`content/blog/**`・`scripts/**`・`lib/**`・`package*.json`） |
| Preview | Vercelのgit自動デプロイは無効（`vercel.json` `git.deploymentEnabled:false`）。Previewは明示的に作成し、`.github/workflows/preview-qa.yml`（workflow_dispatch、`base_url`・`deployment_sha` 指定）で検証する運用 |
| 監査基準SHA | `8ef41d5f856ec4eea9624935f5f2122ce46a7088` |
| 引き継ぎ資料 | `docs/design-audit/2026-10-18/`（入口は [HANDOFF.md](HANDOFF.md)）。保存場所と共有方法は HANDOFF.md の「資料の場所」を参照 |
| リポジトリ規約 | ルートの `AGENTS.md`（Daily Editorial・画像・Blogの規則。今回は触らないが、検証コマンドとBlogビルドに関係）。前回のサイト統合の手順は `docs/qa/2026-10-17/BUILD_AND_RESUME.md` |
| 既存のサイトQA | `npm run vercel-build`（distを作る）、`npm run test:build-parity`、`npm run test:public-site-browser`（`scripts/qa-unified-site.mjs`、Playwright。6ページ×7サイズ）、`npm run test:technical-site` / `test:technical-browser`。**ただし既存QAには色・コントラストの検査が無く、ドロワー検査は閉じるボタンへ自分でフォーカスしてから測るため、今回のP0と旧ドロワーのフォーカス漏れを検出できていない**（第1段階で拡張する） |

### 1-1. ページと実装系統

| ページ | ファイル | 系統 |
|---|---|---|
| TOP | `index.html` ＋ `assets/css/top-v7.css` ＋ `assets/js/home-v7.js` | **v7ネイティブ**（`#site-header.rev-home-header`、`.rev-native-drawer`。インラインstyle中心） |
| リカバリー | `solution.html` ＋ `assets/css/recovery-v8.css` | **v8ネイティブ**（`body.recovery-page`） |
| トレーナー | `trainer.html` ＋ `style.css` ＋ `trainer.css` | 旧系統（`header.site-header#header`、`.rev-drawer#revDrawer`、`main.js`） |
| 料金 / アクセス | `price.html` / `access.html` ＋ `style.css` | 旧系統（暗い `.page-head`） |
| 特商法 / プライバシー / 規約 | `legal.html` / `privacy.html` / `terms.html` | 旧系統（`body.tpage`、暗い `.page-head`） |
| コラム一覧・カテゴリ・記事 | `templates/blog-index.html`、`templates/blog-post.html`、**`templates/partials/header.html` `drawer.html` `footer.html`**、`assets/css/blog.css` | 旧系統。`scripts/build-blog.mjs` が `content/blog/` とpartialsから `blog/` を生成（body class: `blog blog-index`／`blog blog-index blog-category`／`blog blog-post`） |
| 404 | `404.html` | 本番では未接続（Xserver既定ページが出る） |

共通: `assets/css/unified-header-v7.css`（全ページ）、`assets/js/unified-navigation.js`（全ページ。ネイティブdrawer開閉・`rev-is-scrolled`・現在地）、`assets/js/main.js`（全ページ。旧drawer・ローダー・`.site-header` の `scrolled`・FAQ等）、`assets/css/site-fonts.css`（自前ホストのサブセットWebフォント）。

**正本とするデザイン:** TOP v7 / Recovery v8 のヘッダー・メニュー・フッター・CTA（Owner承認済み）。旧系統をこれに合わせます。逆方向はしません。

---

## 2. 不変条件（最優先で守る）

### 2-1. TOP v7 で維持するもの（見た目を変えない）

| 要素 | 内容 |
|---|---|
| ヒーロー | 白い情報領域＋写真領域＋境界の横フェード、写真、トリミング、見出し「自分の身体に、ちゃんと向き合う時間。」、リード、黒矩形「初回体験を予約する →」＋枠線「LINEで相談する」、注記、TRAINING/BOXING/RECOVERY 行、SCROLL表示。**例外: 第3段階 S3-5（641〜959pxのボタン幅）のみ** |
| セクション見出し体系 | 番号＋細線＋英字キッカー＋明朝見出し＋サブコピー＋右寄せ説明（SERVICE〜FAQ） |
| SERVICE | 写真付き3カード、タグ、テキストリンク |
| METHOD | 写真＋暗いキャプション箱、流れ図（01〜03 → PROGRAM） |
| TRIAL | 3,300円／約60分の数値、3タブ（アイコン付き）、当日の流れ、準備するもの |
| VOICE | 5件のカード列、矢印、件数表示、Googleクチコミ導線 |
| PRICE / ACCESS / FAQ / 最終CTA | 表組み、地図、Q&A 2カラム、暗い最終CTA（ベージュ＋枠線） |
| 色と余白 | 紙色系の背景切替（`#F2F1EE`・`#F7F4EE`・`#EDE6DD` 系）、黒 `#1F1D1B`、セクションの余白のリズム（第3段階 S3-7 はOwner承認時のみ） |
| ヘッダー・ドロワー | 現在の見た目と動作が**全ページの正本**。TOPの見た目は変えない（第2段階でCSSの置き場所を移しても、ピクセル同一であること） |

### 2-2. Recovery v8 で維持するもの

| 要素 | 内容 |
|---|---|
| 2D図解 | 人物イラスト・普段の環境/加圧した環境の比較図・DENBAの電場空間図・SVG。**一切変えない** |
| ヒーロー | 写真、見出し「疲れた日に、酸素ルームへ。」（2行目の木目色）、価格「初回限定 45分 3,300円」、ボタン構成 |
| パンくず＋ページ内ナビ帯（`.rv-pagebar`） | 構成と位置 |
| 固定CTA（`.rv-sticky`） | 紙色の帯＋価格＋黒ボタン。**旧系統の固定CTAの正本** |
| FAQ・注意書き・ご利用の流れ（4ステップ） | 構成と文言 |
| 例外 | 第3段階 S3-1（代替フォント解消）と S3-6（ヒーロー左端の整列）のみ |

### 2-3. 変更禁止

1. 予約URL（`https://cl.gyms.jp/t/CC2237480443/...`）、UTMパラメータ、`data-track` / `data-placement` の値、`rel` / `target`（下表）
2. GTM・GA4・JSON-LD・canonical・OGP・robots・sitemap・meta description
3. 料金の金額・条件・注記、記事本文、`content/` 以下、営業時間・定休日・住所の**値**
4. Editorial・画像・Supabase関連（`editorial/`、`lib/`、`api/`、`supabase/`、記事・画像系の `.github/workflows/`）、`admin/`
5. 新しい画像の生成・差し替え
6. mainへの直接push・mainへのマージ・本番デプロイ・GTM/GA4管理画面の変更（Owner承認なしに行わない）

### 2-4. 保持すべき計測属性（監査時点の実値。各ページの値を保持）

| ページ | ヘッダー予約 | ドロワー | 固定CTA | フッター |
|---|---|---|---|---|
| TOP | reserve_click:home_header | reserve/line:home_drawer | なし | reserve/line/instagram:home_footer |
| リカバリー | reserve_click:recovery_header | reserve/line:recovery_drawer | reserve_click:recovery_fixed_cta | reserve/line/instagram:recovery_footer |
| トレーナー | reserve_click:trainer_header | reserve/line/instagram:trainer_drawer | reserve_click:trainer_fixed_cta | reserve/line/instagram:trainer_footer |
| 料金 | reserve_click:pricing_header（utm_content=pricing_page） | pricing_drawer | pricing_fixed_cta | pricing_footer |
| アクセス | reserve_click:access_header | access_drawer | access_fixed_cta | access_footer |
| 特商法/プライバシー/規約 | legal_header / privacy_header / terms_header | *_drawer | なし | *_footer |
| コラム（partials） | reserve_click:blog_header（`{{UTM_TERM}}`付き） | blog_drawer | blog_fixed_cta | blog_footer |

マークアップを置き換える段階では、作業前後に全ページの `(data-track, data-placement, utm_content, utm_term)` 一覧を出力し、差分0であることを機械照合します（意図した削除・追加はOwner承認済みのものだけ）。

### 2-5. 変更してよい範囲の原則

- 変更してよいのは「共通部品（ヘッダー・ドロワー・フッター・ボタン・固定CTA）」「旧系統ページの装飾（色・角丸・字間・書体）」「文字組みの規則」「本プロンプトに個別に書いた箇所」だけ
- TOP/リカバリーのファイルを触るステップでは、**意図した箇所以外がピクセル同一**であることをBefore/Afterで示す
- 迷ったら変えない。変える場合は理由と画面をPRに残す

---

## 3. 修正工程の全体像

| 段階 | 目的 | 含む項目 | リリース単位 | 進めてよい条件（ゲート） |
|---|---|---|---|---|
| **第1段階 P0不具合修正** | 本番の「読めない・押せない・見えない」を止める。再発を自動検出できるようにする | H1・H2・H3、QA拡張（S1-4）、条件付きで旧ドロワーのフォーカス最小修正（S1-5） | CSS中心の小さなPR。単独で本番反映できる | 4章のゲートをすべて満たす |
| **第2段階 共通UIの統一** | 全ページを同じヘッダー・メニュー・フッター・ボタン・固定CTAにする | S2-0（CSS共通化）、H4、M1、H5、M2、M3、F1・F2、C1、C2、O1、Z1 | ステップごとのコミット。PRは1本または「ヘッダー/ドロワー」「フッター/CTA」の2本 | 5章のゲート |
| **第3段階 最終デザインブラッシュアップ** | 文字組み・整列・細部の仕上げ | T1、T2、T3、L1、R1、L2、L4、L3、X1、P3の確認 | 項目ごとのコミット | 6章のゲート |

各ステップは別コミットにし、メッセージに項目IDを書きます（例: `fix(header): H1-H3 readable header on light mastheads`）。作業ブランチ例: `design/p0-header-hotfix`、`design/unify-shared-ui`、`design/final-polish`（いずれも最新 `origin/main` から作成）。

---

## 4. 第1段階 P0不具合修正

**この段階では旧系統のマークアップを変えません。CSS（と検証スクリプト）だけで止めます。**

### S1-1（H1）明るいマストヘッドのページで、1400px以上のナビが読めない

| 観点 | 内容 |
|---|---|
| 現状（実測） | トレーナー・コラム一覧・カテゴリ・記事のスクロール前、リンク色 `rgb(250,249,247)` × ヘッダー背景 `rgba(251,250,247,.94)`／ページ地 `#FBFAF7`。コントラスト比 1.01:1。予約ボタンは `rgba(31,29,27,.32)` の半透明（1.98:1）。証拠: `screenshots/main/trainer-1440-a-top.jpg`、`screenshots/sections/blog-1440/00.jpg`、`screenshots/sections/post-1440/00.jpg` |
| 原因 | `unified-header-v7.css` の `.site-header .nav .nav-link{color:#FAF9F7!important}` と `.site-header{background:transparent!important}` が、`trainer.css:451-472`・`blog.css:12-14` の「常に明るいヘッダー」指定を上書き |
| 修正内容 | `body.trainer-page`、`body.blog-index`（カテゴリ含む）、`body.blog-post` のヘッダーを、**スクロール前から `.site-header.scrolled` と同じ見た目**にする: 背景 `rgba(242,241,238,.97)`、下線 `1px solid rgba(50,46,43,.12)`、リンク `#24211E`・影なし、現在地は下線のみ（トレーナーの木目色 `#9C8160` は廃止）、予約ボタン `#1F1D1B` 地・`#FAF9F7` 文字、ロゴ暗色、ハンバーガー線 `#1E1C1A` |
| 実装例 | 下のCSSを `unified-header-v7.css` 末尾に追加し、競合する `trainer.css` の旧指定（`.trainer-page .nav a`、`[aria-current=page]` の色、`.cta-mini` の色）を削除 |
| 対象ファイル | `assets/css/unified-header-v7.css`、`assets/css/trainer.css`（必要なら `assets/css/blog.css`） |
| 影響範囲 | トレーナー・コラム全ページのヘッダー（全幅）。TOP・リカバリー・料金・アクセス・法務は変化しないこと |

```css
/* 明るいマストヘッドのページは最初から solid（スクロール後と同じ見た目） */
:is(body.trainer-page, body.blog-index, body.blog-post) .site-header{
  background:rgba(242,241,238,.97)!important;
  border-bottom-color:rgba(50,46,43,.12)!important;
}
:is(body.trainer-page, body.blog-index, body.blog-post) .site-header .nav .nav-link{
  color:#24211E!important; text-shadow:none!important;
}
:is(body.trainer-page, body.blog-index, body.blog-post) .site-header .nav .cta-mini{
  background:#1F1D1B!important; border-color:#1F1D1B!important; color:#FAF9F7!important;
}
:is(body.trainer-page, body.blog-index, body.blog-post) .site-header .nav-toggle span{
  background:#1E1C1A!important;
}
```
（特異性の注意: `trainer.css` の `.trainer-page .site-header.scrolled .nav .cta-mini{color:var(--ink)!important}` は (0,5,0) で上記より強いため、**削除が必須**）

### S1-2（H2）スクロール後のヘッダー予約ボタンが黒地に黒文字

| 観点 | 内容 |
|---|---|
| 現状（実測） | トレーナー・料金・アクセス・特商法・プライバシー・規約、1400px以上でスクロール後、文字 `rgb(35,34,32)` × 地 `rgb(31,29,27)`（1.06:1）。証拠: `screenshots/sections/price-1440/01.jpg`、`trainer-1440/01.jpg`、`legal-1440/01.jpg` |
| 原因 | `style.css:2249-2250` `.tpage .site-header.scrolled .nav a, body:has(.page-head) .site-header.scrolled .nav a{color:var(--ink)!important}` が `.cta-mini` にも当たる（特異性(0,4,2)で統一CSS(0,4,0)に勝つ）。`trainer.css:465-466` も同様 |
| 修正内容 | 該当セレクタを `.nav a:not(.cta-mini)` に変更。`trainer.css` の `.cta-mini` 色指定を削除。スクロール後の予約ボタンは全ページ `#1F1D1B` 地・`#FAF9F7` 文字 |
| 対象ファイル | `assets/css/style.css`、`assets/css/trainer.css` |
| 影響範囲 | 旧系統6ページのスクロール後ヘッダー。スクロール後のナビ文字色（インク）は維持 |

### S1-3（H3）コラム系のハンバーガーが見えない

| 観点 | 内容 |
|---|---|
| 現状（実測） | コラム一覧・カテゴリ・記事のスクロール前、1399px以下でハンバーガー線 `rgb(250,249,247)` が明るい背景に溶ける。証拠: `screenshots/main/blog-1280-a-top.jpg`、`screenshots/sections/blog-390/00.jpg` |
| 原因 | `unified-header-v7.css` の `.site-header .nav-toggle span{background:#FAF9F7!important}`。トレーナーは `trainer.css` で黒に戻しているがblogには無い |
| 修正内容 | S1-1のCSSに含まれる `.nav-toggle span` 規則で `#1E1C1A`。暗いpage-headのページ（料金・アクセス・法務）はスクロール前白線・後黒線のまま |
| 対象ファイル | `assets/css/unified-header-v7.css` |
| 影響範囲 | コラム全ページの1399px以下 |

### S1-4 再発防止の自動検査（既存QAの拡張）

`scripts/qa-unified-site.mjs` を拡張します（サイトの見た目は変えない）。
- 対象ルートに `/blog/category/<任意の1カテゴリ>/`、最新記事1本、`/legal.html`、`/privacy.html`、`/terms.html` を追加
- **ヘッダーのコントラスト検査**: スクロール前と `scrollTo(0,900)` 後に、表示中のナビ文字・予約ボタン文字・ハンバーガー線の前景色と実効背景色（半透明はヘッダー背景→ページ地の順に合成）からコントラスト比を計算し、文字4.5:1・線3:1未満をFAIL
- **ドロワーの初期フォーカス**: 開くボタンを `click()` した直後に `document.activeElement` がdialog内であること（現行テストは `close.focus()` で自分から合わせているので検出できない）
- **Tab循環**: Tabを（フォーカス可能要素数＋2）回押して常にdialog内
- **Escape後のフォーカス**: 閉じた後 `document.activeElement` が開くボタン
- 可能なら `reducedMotion:'reduce'` と通常の両方で実行（現行は reduce 固定で、遷移中のフォーカス問題を見逃す）

### S1-5（条件付き）旧ドロワーのフォーカス最小修正

第2段階（ドロワー統一 M1）が第1段階と同じリリースに入らない場合だけ実施します。
- 現状（実測）: 旧ドロワーを開いた直後 `activeElement` がBODY。トレーナー・料金・アクセス・コラムではTabで背面本文へ移動、Escape後もボタンへ戻らない。アクセス768pxでは地図iframeにフォーカスが入りEscapeで閉じられなくなった（`MEASUREMENTS.md` のハンバーガー表）
- 推定原因: `style.css` 2801行 `body.drawer-open .site-header .nav-toggle{visibility:hidden}` でクリックしたボタンが隠れ、`main.js initDrawer()` の初期/復帰フォーカスが効かない
- 最小修正: ドロワーの可視化後（`requestAnimationFrame` 2回後、または `transitionstart`）に閉じるボタンへフォーカス。閉じる時はボタンの `visibility` が戻ってからフォーカス復帰。対象: `assets/js/main.js`、`assets/css/style.css`
- S1-4の検査がPASSすること

### 第1段階のゲート（すべて満たしたら第2段階へ）

- [ ] 1500/1440/1400pxで、トレーナー・コラム一覧・カテゴリ・記事のスクロール前、全ページのスクロール後に、ナビ文字・予約ボタン文字のコントラスト比4.5:1以上（数値表を提出）
- [ ] 1399/1280/1024/861/860/768/390/375pxで、全ページのハンバーガー線が3:1以上
- [ ] TOP・リカバリーがピクセル同一（ヘッダー含む）
- [ ] 拡張したQAが本修正前のコードでFAIL、修正後でPASSすること（検査が実際に不具合を捕まえることの証明）
- [ ] 横はみ出し0、JSエラー0、計測属性差分0
- [ ] Owner承認後に本番反映（この段階単独で反映してよい）

---

## 5. 第2段階 共通UIの統一

**方針:** 旧系統ページの見た目を上書きで寄せるのではなく、**TOP/リカバリーと同じ部品（マークアップ＋CSS＋JS）に置き換えます。** 1ページずつ進め、各ページの後に計測属性照合とスクリーンショット比較を行います。順序: トレーナー → 料金 → アクセス → 法務3 → コラムpartials。

### S2-0 ネイティブヘッダー/ドロワーCSSの共通化（見た目は不変）

| 観点 | 内容 |
|---|---|
| 内容 | `.rev-home-logo*` の切替、`#menu-toggle` の色、`.rev-is-scrolled` 時の状態、ドロワー（`.rev-drawer-head/-nav/-actions` 相当）の規則が `top-v7.css` と `recovery-v8.css` に重複。これを `unified-header-v7.css` へ移し、両ファイルからは削除 |
| 対象ファイル | `assets/css/unified-header-v7.css`、`assets/css/top-v7.css`、`assets/css/recovery-v8.css` |
| 影響範囲 | TOP・リカバリー（見た目は不変が条件） |
| 検証 | TOP・リカバリーを全幅でBefore/Afterピクセル比較し差分0 |

### S2-1（H4）ヘッダーをv7ネイティブに統一

| 観点 | 内容 |
|---|---|
| 現状（実測） | ネイティブ: 高さ80px＋下線1px、ロゴ184px(1440)／168px(1200)、1399pxでロゴx=48、ハンバーガー「2本線＋メニュー」104px、ナビ14.5px(1400〜1499)、予約ボタン高さ46px。旧系統: 高さ76px、ロゴ154.5px(1440)／148.2px(1200)、1399pxでロゴx=56、ハンバーガー3本線44px、ナビ15px、予約ボタン44px。スクロール判定もネイティブ24px／旧40px |
| 内容 | `index.html` の `<header id="site-header">…</header>` を正本として、旧系統6ページと `templates/partials/header.html` を置換。差し替えるのは各ページの予約リンクの `data-placement`/`utm_content`（とコラムの `{{UTM_TERM}}`）と `aria-current` だけ |
| ヘッダーのトーン | bodyに付けて `unified-header-v7.css` で定義する。①既定（TOP、現行どおり）②`header-tone-dark`（料金・アクセス・法務3。スクロール前は透明・明るいロゴ（全幅で）・白文字・半透明予約ボタン＋白枠・白いメニュー表示、スクロール後はsolid）③`header-tone-light`（リカバリー・トレーナー・コラム。常にsolid）。既存の `body.recovery-page #site-header …` を `header-tone-light` に一般化。`@media(min-width:1200px)` の「スクロール前は暗いロゴ」規則はTOP専用なので `header-tone-dark` で明るいロゴに上書き |
| 寸法（全ページ共通・現行v7値） | 高さ `min-height:80px`（641px以上）/`68px`（640px以下）＋下線1px。内側 `max-width:1710px`、`padding-inline: clamp(48px,4vw,72px)`（1400px以上）・`clamp(20px,4vw,48px)`（1399px以下）・`20px`（640px以下）。ロゴ `width:clamp(148px,14vw,184px)`（`recovery-v8-03.webp` 暗／`-12.webp` 明）。ナビ `clamp(15px,.9vw,16px)`・500・`letter-spacing:.025em`（1400〜1499pxは14.5px）。予約ボタン `min-height:46px`・15px（1400〜1499pxは14px）・500・角0・`letter-spacing:.06em`（TOP 0.42px／リカバリー0.84pxと実測で差があるので.06emに揃える）。ハンバーガー 2本線（22px幅・1.5px・間隔6px）＋「メニュー」14px・44px以上 |
| 注意 | 旧系統は `style.css`（158KB）も読むため、`header`/`nav`/`ul`/`li`/`a`/`button`/`img`・`.brand`・`.nav` 系の規則がネイティブヘッダーに当たらないか、置換後に `getComputedStyle` で上の寸法・色と照合。`main.js` の `.site-header` 用 `scrolled` 処理は不要になる（状態は `unified-navigation.js` の `rev-is-scrolled`） |
| 固定ヘッダーとの重なり | 先頭要素（`.page-head`、`.tdetail-hero`、`.blog-article-hero`、コラム一覧の先頭）が80px/68pxのヘッダーに隠れないこと。ページ内アンカー（`#trial`、料金のカテゴリ等）の到達位置を `scroll-padding-top`（TOP 88px・リカバリー98px）と同じ考え方で確認 |
| 対象ファイル | `trainer.html`、`price.html`、`access.html`、`legal.html`、`privacy.html`、`terms.html`、`templates/partials/header.html`、`assets/css/unified-header-v7.css`、`assets/css/style.css`・`trainer.css`・`blog.css`（不要になった旧ヘッダー規則の削除） |
| 影響範囲 | TOP/リカバリー以外の全ページのヘッダー。記事HTMLはビルドで再生成される |

### S2-2（M1）ハンバーガーメニューをv7ネイティブに統一

| 観点 | 内容 |
|---|---|
| 現状（実測） | ネイティブ: 紙色 `#F2F1EE`、先頭行ロゴ＋「× 閉じる」(88×44)、日本語18px・500・行60px・右端→、黒矩形予約56px＋枠線LINE 56px＋注記13px、即時開閉、フォーカス管理正常。旧系統: 黒 `rgba(24,23,21,.97)`、「×」のみ(44×44、位置も異なる)、18px・400・行72px＋金色英字ラベル、金色角丸6px予約、Instagram/LINEアイコン、0.4秒フェード、**フォーカスが背面へ漏れる**。証拠: `screenshots/main/top-390-c-menu.jpg` と `trainer-390-c-menu.jpg`、`top-1280-c-menu.jpg` と `price-1280-c-menu.jpg` |
| 内容 | 旧 `.rev-drawer#revDrawer`・`.nav-toggle`・`.d-social` を削除し、`index.html` の `<div class="rev-native-drawer" id="drawer" role="dialog" aria-modal="true" …>` を配置。開閉は `unified-navigation.js` に一本化。現在地は太字700＋下線（旧の金色表示は廃止）。開閉アニメーションは付けない（v7どおり即時）か、全ページ同一の短いフェードのどちらか一方 |
| 不要になるコード | `main.js initDrawer()`（`.nav-toggle` が無ければ何もしないが、旧drawer専用処理として削除可）、`style.css` 1126-1190 と 2798-2805、`unified-header-v7.css` 内の旧drawer複製ブロック、`style.css` の `.d-link[aria-current]` |
| Instagram | 旧ドロワーには `instagram_click:*_drawer` がある。**Owner確認**: (1) 削除してv7に合わせる、(2) 全ページのネイティブドロワー注記の下にテキストリンク「Instagram」を追加。勝手に計測ポイントを消さない |
| 動作要件 | 開くと最初のフォーカス可能要素へ／Tab・Shift+Tabで内部循環／Escapeで閉じて開くボタンへ復帰／背面スクロール固定と元位置復元／ドロワー内リンクで閉じて遷移／デスクトップナビ表示幅へリサイズで閉じる／`prefers-reduced-motion` で遷移なし |
| 対象ファイル | 旧系統6ページ、`templates/partials/drawer.html`、`assets/js/main.js`、`assets/css/style.css`、`assets/css/unified-header-v7.css` |
| 影響範囲 | TOP/リカバリー以外の全ページのメニュー |

### S2-3（H5）1280〜1399pxでヘッダーに予約導線が無い

| 観点 | 内容 |
|---|---|
| 現状 | 全ページで `max-width:1399px` からデスクトップナビと予約ボタンが消える。1399pxのTOPではヘッダー右側に大きな空白（`screenshots/bounds/top-1399-a-top.jpg`） |
| 推奨（第一案） | デスクトップナビの表示境界を1400px→**1200px**に下げ、1200〜1399pxは1400〜1499pxの詰め設定（ナビ14.5px、リンク左右8px、nav gap 20px、予約ボタン14px／左右18px）。計算上ナビ全体約670px、1200pxでの空き約912px |
| 第二案 | 第一案で窮屈なら、861〜1399pxでハンバーガーの左に予約ボタン（44px・14px・角0・`#1F1D1B`）を常時表示 |
| 対象ファイル | `assets/css/unified-header-v7.css`、`assets/js/unified-navigation.js`（`innerWidth >= 1400` の閉じる条件を新境界に） |
| 影響範囲 | 全ページの1200〜1399px（第二案は861〜1399px） |

### S2-4（M2）861〜1399pxのドロワーをパネル化

- 現状: 1280pxで項目罫線と予約ボタンが1240px幅（`screenshots/main/top-1280-c-menu.jpg`）
- 内容: ナビとアクションを `max-width:560px` の右寄せパネルに（背景全面 `#F2F1EE` のまま、または左に `rgba(30,28,26,.24)` の暗幕＋右パネル `width:min(560px,100%)`）。**860px以下は現行のまま**
- 対象: `assets/css/unified-header-v7.css`。影響: 全ページの861〜1399px（S2-3第一案採用時は861〜1199px）

### S2-5（M3）開閉時の位置の連続性

- 現状: TOP 1280pxでヘッダーのロゴx=48 → ドロワー内x=20、高さ80→76px。768pxで30.7→20px
- 内容: ドロワー先頭行の `min-height`・左右padding・ロゴ幅をヘッダーと同値に。閉じるボタンを開くボタンと同じ右端に
- 対象: `assets/css/unified-header-v7.css`、ドロワーのマークアップ（全ページ共通）

### S2-6（F1・F2）フッターをv7に統一

| 観点 | 内容 |
|---|---|
| 現状 | 3種類。v7（TOP・リカバリー: 日本語ナビ・3カラム）、旧フル（トレーナー・料金・アクセス・コラム: 英字ナビ、MENU/SUPPORT/CONTACT、「2026.07 OPEN」、Instagram・LINEが2回）、旧ショート（法務3）。v7のリンク順もヘッダーと違う |
| 内容 | 全ページを `index.html` の `<footer>`（背景 `#151413`・文字 `#DDD7CE`）に置換、計測は各 `*_footer` を維持。ナビ順をヘッダーと同じ「サービス→リカバリー→トレーナー→料金→コラム→初回体験→アクセス」に（TOP/リカバリーも。リンク先は不変）。営業時間の表記を v7（`火・水・木 9:00–13:00 ／ 15:00–19:00`、`土・日 9:00–13:00 ／ 14:00–18:00`、`月・金 定休／完全予約制`）に統一（値は変えない。アクセス本文・JSON-LDと矛盾しないこと）。「2026.07 OPEN」の扱いはOwner確認 |
| 対象ファイル | 旧系統6ページ、`templates/partials/footer.html`、`index.html`・`solution.html`（順序のみ） |
| 影響範囲 | 全ページのフッター |

### S2-7（C1）予約ボタンを2系統に統一

| 観点 | 内容 |
|---|---|
| 現状 | 4系統: v7黒矩形 `#1F1D1B`／v7反転ベージュ `#E8DCC8`（TOP最終CTA）／旧金色 `#D4BA8F`（トレーナー・料金の最終CTA `.cta`、旧ドロワー `.d-cta`、固定CTA `.fc-book`。字間.14em・影・角丸6px）／料金ページのピル型タブ |
| 内容 | 明背景＝黒矩形、暗背景＝ベージュ矩形（`#E8DCC8` 地・`#1F1D1B` 文字・高さ60px・16px・500・`.06em`。TOP `data-placement="home_final"` の現行値）。セカンダリ（LINE）は1px枠・同じ高さ（暗背景では `1px solid #BDB6AC`・文字 `#F2EEE8`）。金色の角丸・影・.14em字間を外す。ピル型タブは `border-radius:0`・選択中 `#1F1D1B` 地を推奨（Ownerが丸型を好めば維持） |
| トークン（推奨） | `--rev-cta-bg:#1F1D1B; --rev-cta-fg:#FAF9F7; --rev-cta-inverse-bg:#E8DCC8; --rev-cta-inverse-fg:#1F1D1B; --rev-cta-radius:0;` |
| 対象ファイル | `assets/css/style.css`、`assets/css/trainer.css`（必要なら共通CSS） |
| 影響範囲 | 旧系統ページの全CTA。TOP/リカバリーは不変 |

### S2-8（C2）モバイル固定CTAをv8形式に統一

| 観点 | 内容 |
|---|---|
| 現状 | 3デザイン: TOPなし／リカバリー `.rv-sticky`（紙色・「初回45分 3,300円 税込・予約枠60分」＋黒ボタン）／旧系統 `.rev-fixed-cta`（黒「料金を見る」＋金「初回体験を予約」）。料金ページで自ページへの「料金を見る」が常時表示 |
| 内容 | 旧系統の固定CTAを `.rv-sticky` と同じ見た目・同じ表示条件（ヒーローの予約ボタンが見えている間は隠す。`solution.html` 末尾のスクリプト参照）に。左の文言は「初回体験 3,300円（税込）」案（**Owner確認**）。「料金を見る」は廃止。本文末尾が隠れないよう下余白（固定CTAの高さ＋`env(safe-area-inset-bottom)`）。TOPは現状どおりなし |
| 対象ファイル | 旧系統HTML（トレーナー・料金・アクセス）、`templates/partials/drawer.html`（コラムの固定CTAはここ）、`assets/css/style.css`、必要なら共通JS |
| 影響範囲 | 860px以下の旧系統ページ。計測 `*_fixed_cta` は維持 |

### S2-9（O1・Owner判断）旧系統だけの初回ローダー

- 現状: 旧系統の初回訪問で黒地にロゴのローダーが約1.7秒（`screenshots/extra/trainer-1440-loader-fading.jpg`、`main.js initLoader`）。TOP・リカバリーには無い
- 推奨: 旧系統の `#site-loader` とロゴクリック時のカバー演出（`initBrandHome`）を外し、v7と同じ即時表示に。対象: 旧系統HTML、`main.js`、`style.css`

### S2-10（Z1）コードの整理

- `trainer.html` ドロワーの `aria-current` 重複属性（ドロワー置換で消える）
- 旧ヘッダー/ドロワー専用CSS・JSの削除（使われていないことを `grep` で確認してから）

### 第2段階のゲート

- [ ] 全ページ・全幅で `#site-header` の高さ・ロゴ幅・ロゴ位置が同値（±0.5px）
- [ ] 全ページでドロワーが同じDOM構造・同じ見た目・同じ挙動（S1-4のフォーカス検査が全ページPASS）
- [ ] 1280/768/390pxで開閉前後のロゴ・ボタン座標差±1px以内（M3）、1024/1280/1399pxでドロワーの項目幅560px以下（M2）
- [ ] 1200/1280/1366/1399pxで予約導線が常に見え、折返し無し（H5）
- [ ] 全ページでフッター構造が同一、SNSリンクの重複なし、順序がヘッダーと同じ
- [ ] 金色 `#D4BA8F` の予約ボタンが0件、固定CTAが1デザイン、料金ページに「料金を見る」無し
- [ ] 計測属性の照合で差分0（Owner承認済みの変更を除く）
- [ ] TOP・リカバリーは、フッターのリンク順以外ピクセル同一
- [ ] 横はみ出し0、JSエラー0、先頭要素・アンカーがヘッダーに隠れない

---

## 6. 第3段階 最終デザインブラッシュアップ

### S3-1（T1）代替フォントの解消 ※優先度P1。第2段階と並行してよい

| 観点 | 内容 |
|---|---|
| 現状（実測、`font-fallback.json`） | リカバリー「予約**枠**」「空き**枠**」「**鼻**づまり・風**邪**」「↗」、トレーナー「競技で**培**った」、TOP FAQの「Q」と「↗」、料金・特商法「進**捗**」、プライバシー・規約「遵・託・措・滅・毀・撤・棄・倦・怠・賠・轄・附・誉・誹・謗」など。1文字だけ太さ・字形が変わる（`screenshots/sections/recovery-1440/08.jpg`、`11.jpg`） |
| 原因 | `site-fonts.css` の Zen Kaku Gothic New / Shippori Mincho / Jost は本文から作ったサブセットで、ウェイト別に収録字が違う。救済用 `RV Glyph Sans/Serif` は `recovery-v8.css` の一部の font-family にしか入っていない |
| 内容（推奨） | 全公開テキスト（全HTML＋`content/blog/` 全記事＋固定文言）から使用字を集め、全ウェイトのサブセットを再生成。今後の記事に備え常用漢字＋記号（↗→←↓・Q・全角記号）を含め、unicode-range分割で容量を抑える。短期案: すべての font-family スタックでサブセット直後に `'RV Glyph Sans'`／`'RV Glyph Serif'` を入れ、救済フォントに不足字を追加 |
| 対象ファイル | `assets/css/site-fonts.css`、`assets/approved-v7-v8/*.woff2`、各CSSの font-family |
| 影響範囲 | 全ページの文字（字形が正しくなる以外の変化が無いこと） |
| 検証 | `docs/design-audit/2026-10-18/tools/fonts.mjs` 相当（`CSS.getPlatformFontsForNode`）で全ページのシステムフォント描画0件 |

### S3-2（T2）日本語の改行

- 現状: 料金390px「リカバリ｜ー・メニュー作成」「メニュ｜ー設計」、TOP390px「マンツ｜ーマン」（行頭に長音）、トレーナー768px「パーソナ｜ルトレーニング」（語の途中）、コラム一覧リード「リカバリー、／ボクシング。」「身体づくりに／ついての」（固定`<br>`）
- 内容: 本文・見出しの共通規則に `line-break:strict`。見出し・短いリード・ボタンに `word-break:auto-phrase`（Chrome系のみ有効）。トレーナーの「/」区切りの語は各語を `white-space:nowrap` で包む。コラム一覧リードは `<br>` を外し `max-width:34em` 程度
- 対象: `style.css`・`top-v7.css`・`recovery-v8.css`（共通規則の追加のみ）、`trainer.html`、`templates/blog-index.html`
- 影響: 全ページの改行位置（文言は変えない）

### S3-3（T3）料金ページの価格数字

- 現状: TOP・リカバリーはJost系（`17,600円`）、料金ページは明朝（`¥17,600`）
- 内容: 料金ページの価格をTOPの価格表と同じ書体・単位表記に。**金額・税込表記・「1回あたり」等は変えない**
- 対象: `assets/css/style.css`（料金カード）、必要なら `price.html` の単位表記のマークアップ

### S3-4（L1）テキストリンクの下線

- 現状: 「初回の流れを見る ↓」「月額プランの詳細 →」等で文字と矢印の下線が分断（`screenshots/sections/top-1440/01.jpg`、`06.jpg`）
- 内容: 下線をリンク全体で1本にするか、矢印に下線を付けない。全ページ同一ルール
- 対象: `top-v7.css`（TOPはインラインstyleも確認）、`recovery-v8.css`、`style.css`

### S3-5（R1）TOPヒーローのボタン幅（641〜959px）

- 現状: `index.html` の `@media(max-width:959px)` で `max-width:none!important;flex-basis:100%`。768pxで幅728px（`screenshots/main/top-768-a-top.jpg`）
- 内容: 641〜959pxは横並び（各 `max-width:300px`）、窮屈なら縦積み `max-width:420px`。640px以下と960px以上は不変。**ヒーローの構図・フェード・文言は変えない**

### S3-6（L2）リカバリーの縦ライン

- 現状: 1440pxでヒーロー左端64px、パンくず・本文120px
- 内容: ヒーロー情報ブロックの左端を本文 `.rv-frame` に揃える（写真右端は現状どおり）か、その逆。**図解・写真は変えない**
- 対象: `assets/css/recovery-v8.css`

### S3-7（L4・Owner判断）TOPのセクション余白

- 現状（1440px実測、上下同値）: service/method/questions 112px、trial 129.6px、voice 123.84px、pricing/place 100.8px、contact 128px
- 内容: 意図的な強弱でなければ「標準」「強調」の2段階に整理。ヒーローは対象外

### S3-8（L3・Owner判断）ヘッダー左端と本文左端

- 現状: 1440pxでロゴ57.6px（TOPヒーロー文字も約58px）、TOP本文・フッター72px。承認済み構成の微調整になるため、Owner承認時のみ

### S3-9（X1・Owner判断）404ページ

- 現状: 本番の存在しないURLはXserver既定の青いページ（`screenshots/sections/404-1440/00.jpg`）。自前 `404.html`（`/404.html` で配信）も崩れている: `.skip-link` を隠すCSSが無く「本文へ進む」が金色ボタンとして本文の左に並び、本文が押し縮められる。`site-fonts.css` 未読込（`screenshots/extra/404-html-390.jpg`）
- 内容: `404.html` にv7ヘッダー/フッター・`site-fonts.css`・`noindex` を適用し、skip-linkを通常どおり隠す。ルート `.htaccess` に `ErrorDocument 404 /404.html`。**デプロイworkflowのルート転送対象に `.htaccess` が含まれるか確認が必要**（現状は `blog/.htaccess` のみ）。サーバー設定のため Owner承認必須
- 検証: Previewと（承認後）本番で存在しないURLがHTTP 404・自前ページ表示

### S3-10 P3 / 観察事項（原則変更しない。確認のみ）

| 項目 | 判断 |
|---|---|
| 旧系統ページの明朝見出しの字間が広い | ページの個性として**変えない** |
| ページごとのコンテンツ幅（TOP 1296／リカバリー1200／トレーナー・コラム1180／料金900／アクセス・記事860px） | 読み物の幅として妥当。**統一しない** |
| コラム一覧カードの1px枠線 | 記事カードの個性として**変えない** |
| VOICEカルーセル右端のカード見切れ | カルーセルの示唆として**変えない** |
| 旧系統ページの黒いpage-head（料金・アクセス・法務） | 今回は**対象外**（大きな変更。別途Owner判断） |
| リカバリーのフッター左端72pxと本文120pxの差 | フッター統一後に再確認し、気になる場合のみOwnerへ提案 |

### 第3段階のゲート

- [ ] 全ページで代替フォント描画0件
- [ ] 375/390/768/1280/1440pxで見出し・リード・カードの行頭に「ー」「ッ」「ャュョ」等が無い、語の途中の改行が無い（画像添付）
- [ ] TOP・リカバリー・料金で価格数字の `font-family` が同じ
- [ ] 文字と矢印の下線に隙間が無い
- [ ] 641/768/959pxでTOPヒーローのボタンが横並び各≤300pxまたは縦積み≤420px、640px以下と960px以上は不変
- [ ] リカバリーのヒーロー情報ブロックと本文の左端差0（1440/1280px）
- [ ] Owner判断項目は、承認されたものだけ実装済み

---

## 7. Owner判断事項（着手前に確認する）

| ID | 内容 | 推奨 | 関係する段階 |
|---|---|---|---|
| M1 Instagram | ドロワーのInstagramを削除するか、全ページのv7ドロワーにテキストリンクで追加するか | 追加（計測を残せる） | 第2段階 |
| H5 | デスクトップナビの境界を1200pxに下げるか、861〜1399pxでハンバーガー横に予約ボタンを置くか | 1200px | 第2段階 |
| C2 | 固定CTA左側の文言（「初回体験 3,300円（税込）」案） | 案どおり | 第2段階 |
| C1 | 料金ページのタブを角丸から矩形へ | 矩形 | 第2段階 |
| F2 | 旧フッターの「2026.07 OPEN」を残すか | 削除 | 第2段階 |
| O1 | 旧系統の初回ローダーを外す | 外す | 第2段階 |
| X1 | 404の接続（`.htaccess`・デプロイ対象） | 実施 | 第3段階 |
| L3 | ヘッダー左端を本文72pxへ揃える（TOPヒーロー文字も動く） | 現状維持でも可 | 第3段階 |
| L4 | TOPのセクション余白を2段階へ整理 | 実施 | 第3段階 |
| 表記確認 | `legal.html`・`privacy.html` 本文の「FKビル 2F」（他は全て1F）が意図どおりか | 確認のみ。デザイン修正では変えない | — |

---

## 8. 品質保証（各段階で必須）

**QA-1 Before / After スクリーンショット**: 幅 1500, 1440, 1400, 1399, 1366, 1280, 1200, 1199, 1024, 861, 860, 768, 641, 640, 430, 390, 375, 360。ページ TOP、リカバリー、トレーナー、料金、アクセス、コラム一覧、カテゴリ1つ、最新記事1つ、特商法、プライバシー、規約、404。状態: スクロール前、900pxスクロール後、メニュー展開時。監査時のBeforeは `screenshots/`。撮影には `tools/run.mjs`（headless Chrome・計測タグ遮断）か既存 `npm run test:public-site-browser` を使える

**QA-2 実機**: iPhone Safari と Android Chrome でヘッダー・メニュー・固定CTA・フッターを最低1回。できなければ「未実施」と明記

**QA-3 計測属性の機械照合**: 2-4参照。差分0

**QA-4 ハンバーガーメニュー操作**（全ページ×1399/1024/768/390/375px）: クリックで開いた直後のフォーカスがメニュー内／Tab・Shift+Tab循環／Escapeで閉じて開くボタンへ復帰／背面がスクロールしない／閉じた後に元の位置／7リンク（`/#service`、`/solution.html`、`/trainer.html`、`/price.html`、`/blog/`、`/#trial`、`/access.html`）の遷移／予約ボタンが新しいタブで予約URLを開く（**予約は確定しない**）

**QA-5 ナビゲーション**: ヘッダー7リンク×全ページの遷移、`aria-current` の正しさ（`/#service`・`/#trial` はTOPでハッシュ一致時のみ）、戻る/進むでヘッダー状態が崩れない（`pageshow`）

**QA-6 予約・外部リンク**: 予約 `https://cl.gyms.jp/t/CC2237480443/?utm_source=website&utm_medium=referral&utm_campaign=trial&utm_content=<ページ値>`、LINE `https://lin.ee/UXE0bLd`、Instagram `https://www.instagram.com/the.rev.nara/` が不変

**QA-7 レイアウト回帰**: 全ページ・全幅で横はみ出し0（監査時0）。固定ヘッダーが先頭要素・アンカーを隠さない。固定CTAが本文末尾・フッターを隠さない

**QA-8 JavaScriptエラー**: 計測タグを遮断した状態でコンソールエラー・未捕捉例外0

**QA-9 コントラスト**: ヘッダー・ドロワー・固定CTA・フッターの文字4.5:1以上、大きい文字・UI部品3:1以上。数値表を提出

**QA-10 TOP/リカバリーの保護**: 2-1・2-2の要素が、意図した変更以外ピクセル同一

**QA-11 リポジトリの検証**（失敗したら出力をそのまま報告）
```bash
npm ci
npm run vercel-build
npm run test:build-parity
npm run test:public-site-browser
npm run test:technical-site
npm run test:editorial-images
npm run test:phase-9
npm run test:daily-editorial-contract
npm run test:daily-editorial-state-machine
npm run test:daily-creator
npm run build:blog
```
注意: `npm run build:blog` はリポジトリ直下の `blog/` を削除して再生成します。意図しない記事HTMLの差分をコミットしないこと（確認用は `BLOG_OUTPUT_ROOT=<一時ディレクトリ>`）。`vercel-build` は `dist/` に出力（Git対象外）

**QA-12 Preview**: 明示的に作成したVercel Previewで `preview-qa.yml`（workflow_dispatch、`base_url`・`deployment_sha`）を実行。本番での確認は公開後にOwner承認のもとで

---

## 9. 安全な作業条件

- 専用ブランチで作業。**mainへの直接push・マージ・本番公開・GTM/GA4管理画面の変更はOwner承認なしに行わない**（mainへのマージ＝Xserver自動デプロイ）
- PRはDraftで作成し、本文に「段階・項目ID」「Before/After」「QA結果表」「Owner判断事項」を記載
- 記事・料金・SEO・計測・予約URL・`admin/`・Editorial/画像/Supabase関連を変更しない
- `origin/main` は日次記事の自動コミットで頻繁に進む。リベース時に記事・画像系の変更を上書きしない
- 本番で予約・LINE送信・フォーム送信をしない。検証中はGTM/GA4への送信を遮断
- 実ブラウザで確認できなかったことを「確認済み」と書かない

---

## 10. 監査指摘のカバレッジ（漏れが無いことの確認表）

番号は `AUDIT_REPORT.md` B-3 の指摘番号。

| 指摘 | 内容 | 優先 | 対応 | 本書 |
|---|---|---|---|---|
| (1) | 1400px+、明るいマストヘッドのナビが読めない | P0 | H1 | S1-1 |
| (2) | 1400px+、スクロール後のヘッダー予約が黒×黒 | P0 | H2 | S1-2 |
| (3) | 1399px以下、コラムのハンバーガー不可視 | P0 | H3 | S1-3 |
| (4) | ヘッダー2種・寸法差（高さ・ロゴ・トグル・ナビ文字・予約・スクロール判定・1200〜1399のロゴ位置） | P1 | H4 | S2-0・S2-1 |
| (5) | 1280〜1399pxに予約導線なし | P1 | H5 | S2-3 |
| (6) | ヘッダー左端と本文左端 | P3 | L3 | S3-8 |
| (7) | ドロワー2デザイン＋旧ドロワーのフォーカス漏れ | P1上位 | M1（暫定S1-5） | S2-2・S1-4・S1-5 |
| (8) | 861〜1399pxでドロワー全幅 | P2 | M2 | S2-4 |
| (9) | 開閉時にロゴ・閉じるが跳ぶ | P2 | M3 | S2-5 |
| (10) | 代替フォント | P1 | T1 | S3-1 |
| (11) | 行頭長音・語の途中の改行・強制改行 | P2 | T2 | S3-2 |
| (12) | 価格数字の書体 | P2 | T3 | S3-3 |
| (13) | 旧系統の見出し字間 | P3 | 変更しない | S3-10 |
| (14) | コンテンツ幅の差／リカバリー内の縦ライン | P3／P2 | 変更しない／L2 | S3-10・S3-6 |
| (15) | TOPのセクション余白5種 | P3 | L4 | S3-7 |
| (15-2) | タブレットのTOPヒーローボタン幅 | P2 | R1 | S3-5 |
| B-3-5 | 写真・図解・サムネイル・カード枠・カルーセル見切れ | — / P3 | 変更しない | 2-1・2-2・S3-10 |
| (16) | 予約ボタン4系統 | P1 | C1 | S2-7 |
| (17) | 固定CTA3デザイン・料金ページの「料金を見る」 | P1 | C2 | S2-8 |
| (18) | テキストリンク下線の分断 | P2 | L1 | S3-4 |
| (19) | フッター3種・リンク順・表記ゆれ | P1／P2 | F1・F2 | S2-6 |
| (20) | 旧系統のみの初回ローダー | P2 | O1 | S2-9 |
| (21) | 本番404がXserver既定・自前404.htmlも崩れ | P1 | X1 | S3-9 |
| (22-0) | 「FKビル 2F」表記 | 確認のみ | — | 7章 |
| (22) | 重複属性・重複CSS | P3 | Z1 | S2-10 |
| 追加 | 既存QAがP0とフォーカス漏れを検出できない | — | QA拡張 | S1-4 |

---

## 11. 完了報告の形式（各段階の終わりに提出）

1. 段階名・ブランチ・コミットSHA・PR URL（Draft）
2. 実施した項目IDと、各項目の「変更内容／検証方法／結果（数値）」の表
3. Before/Afterスクリーンショット（QA-1の組合せ。差分のある組合せは並べて提示）
4. QA-3〜QA-11 の結果（失敗はそのまま記載）
5. 未実施・未検証の事項とその理由
6. Ownerに判断を求める事項
