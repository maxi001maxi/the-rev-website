# 引き継ぎ: THE REV. デザイン修正（2026-10-18 監査）

**ここから読んでください。** 監査は完了しています。監査をやり直さず、[DESIGN_FIX_PROMPT.md](DESIGN_FIX_PROMPT.md) に従って第1段階から実装へ進めます。

## 1. 現在の状態

| 項目 | 状態 |
|---|---|
| 監査 | 完了（成果物A〜E） |
| サイトの変更 | **なし**。HTML/CSS/JSの修正、Commit、Push、PR、本番公開は未実施 |
| 監査基準 | `origin/main` = `8ef41d5f856ec4eea9624935f5f2122ce46a7088`。本番 https://therev-lab.com/ とコード一致（差分はビルド時の `?v=`・GTMホスト制限・robots metaのみ） |
| 次の工程 | 第1段階 P0不具合修正（Owner判断を待たずに着手できる） |
| Owner判断待ち | 10項目（[DESIGN_FIX_PROMPT.md](DESIGN_FIX_PROMPT.md) 7章）。第2段階の着手前に確認 |

**注意:** Ownerの手元チェックアウト `C:\Projects\the-rev-website` は detached HEAD `0241258`（`origin/main` より551コミット古い）。実装は必ず最新 `origin/main` から新しいブランチを作って行う。

## 2. 読む順番（約15分）

1. この HANDOFF.md
2. [DESIGN_FIX_PROMPT.md](DESIGN_FIX_PROMPT.md) — 実装の指示書。2章「不変条件」、3章「工程の全体像」、4〜6章「各段階の内容・対象ファイル・影響範囲・ゲート」、10章「監査指摘のカバレッジ表」
3. 必要に応じて [AUDIT_REPORT.md](AUDIT_REPORT.md) — 根拠と評価（成果物A〜D）
4. 数値が必要なときは [MEASUREMENTS.md](MEASUREMENTS.md)、字形は [font-fallback.json](font-fallback.json)

## 3. 3段階の要約

| 段階 | 主な内容 | ユーザー体験の変化 |
|---|---|---|
| 第1段階 P0不具合修正 | 明るいヘッダーのナビ文字（H1）、スクロール後の予約ボタン黒×黒（H2）、コラムのハンバーガー不可視（H3）をCSSで修正。既存QAにコントラスト・初期フォーカス・Escape後フォーカスの検査を追加 | 全ページでナビと予約導線が読めて押せる |
| 第2段階 共通UIの統一 | 旧系統ページのヘッダー・ドロワー・フッター・予約ボタン・固定CTAを、TOP v7/Recovery v8 と同じ部品に置換。1280〜1399pxの予約導線、ドロワーのパネル化と位置の連続性 | どのページでも同じ操作感。キーボード操作の不具合解消 |
| 第3段階 最終ブラッシュアップ | 代替フォント解消、日本語の改行、価格数字、下線、タブレットのヒーローボタン、リカバリーの縦ライン、（承認時）余白・整列・404 | 文字と細部の品位 |

## 4. 根拠資料の索引（主要なもの）

| 指摘 | 画面 |
|---|---|
| H1 ナビが読めない | [trainer-1440-a-top](screenshots/main/trainer-1440-a-top.jpg)、[blog-1440/00](screenshots/sections/blog-1440/00.jpg)、[post-1440/00](screenshots/sections/post-1440/00.jpg) |
| H2 予約ボタン黒×黒 | [price-1440/01](screenshots/sections/price-1440/01.jpg)、[trainer-1440/01](screenshots/sections/trainer-1440/01.jpg)、[legal-1440/01](screenshots/sections/legal-1440/01.jpg) |
| H3 ハンバーガー不可視 | [blog-1280-a-top](screenshots/main/blog-1280-a-top.jpg)、[blog-390/00](screenshots/sections/blog-390/00.jpg) |
| H5 ノートPC幅に予約導線なし | [top-1399-a-top](screenshots/bounds/top-1399-a-top.jpg)、[top-1280-a-top](screenshots/main/top-1280-a-top.jpg) |
| M1 ドロワー2種 | [top-390-c-menu](screenshots/main/top-390-c-menu.jpg) / [trainer-390-c-menu](screenshots/main/trainer-390-c-menu.jpg)、[top-1280-c-menu](screenshots/main/top-1280-c-menu.jpg) / [price-1280-c-menu](screenshots/main/price-1280-c-menu.jpg) |
| M1 フォーカス漏れ | [MEASUREMENTS.md](MEASUREMENTS.md) の「ハンバーガーメニュー」表（「Tab16回で外へ出たか」「Esc後 フォーカス」列） |
| C2 固定CTA | [price-390/00](screenshots/sections/price-390/00.jpg)、[recovery-390/05](screenshots/sections/recovery-390/05.jpg) |
| T1 代替フォント | [recovery-1440/08](screenshots/sections/recovery-1440/08.jpg)、[recovery-1440/11](screenshots/sections/recovery-1440/11.jpg)、[font-fallback.json](font-fallback.json) |
| T2 改行 | [price-390/00](screenshots/sections/price-390/00.jpg)、[top-390/02](screenshots/sections/top-390/02.jpg)、[trainer-768-a-top](screenshots/main/trainer-768-a-top.jpg)、[blog-1440/00](screenshots/sections/blog-1440/00.jpg) |
| R1 タブレットのヒーローボタン | [top-768-a-top](screenshots/main/top-768-a-top.jpg) |
| X1 404 | [本番の404](screenshots/sections/404-1440/00.jpg)、[自前404.htmlの崩れ](screenshots/extra/404-html-390.jpg) |
| O1 ローダー | [trainer-1440-loader-fading](screenshots/extra/trainer-1440-loader-fading.jpg) |

全指摘と段階・仕様の対応は [DESIGN_FIX_PROMPT.md](DESIGN_FIX_PROMPT.md) 10章。

**スクリーンショットの命名**

| フォルダ | 命名 | 内容 |
|---|---|---|
| `screenshots/sections/<page>-<width>/NN.jpg` | 1440px・390px | 画面1枚分ずつスクロールした連番（ページ全体を読める解像度） |
| `screenshots/main/<page>-<width>-a-top.jpg` / `-b-scrolled.jpg` / `-c-menu.jpg` | 1440・1280・768・390・375px | スクロール前／900pxスクロール後／600px位置でメニューを開いた状態 |
| `screenshots/bounds/…` | 1500〜641px | ブレークポイント前後（TOP・リカバリー・トレーナー・料金・コラム一覧・記事） |
| `screenshots/extra/` | — | 初回ローダー、自前404.html |

ページ名: top, recovery, trainer, price, access, blog（一覧）, blogcat（カテゴリ recovery）, post（`/blog/denba-health-device-mat-role/`）, legal, privacy, terms, 404

これらは**修正前（Before）の基準画像**としてそのまま使えます。

## 5. 資料の場所と共有方法

| 方法 | 状態 | 次のセッションからの見え方 |
|---|---|---|
| ① このPCのフォルダ | **保存済み**: `C:\Projects\the-rev-website\docs\design-audit\2026-10-18\`（475ファイル・約32MB、Git未追跡） | このPCで `C:\Projects\the-rev-website` を開いたセッションならそのまま読める。**新しいgit worktreeやクラウドのセッションには未追跡ファイルは含まれない**ため、その場合は上の絶対パスを伝えて読ませるか、②を行う |
| ② GitHubのドキュメント専用ブランチ（推奨） | **未実施（Owner承認が必要）** | 最新 `origin/main` から `docs/design-audit-2026-10-18` ブランチを作り、このフォルダだけをコミットしてpush。どの環境のセッションからも `git fetch` で参照でき、修正ブランチにも取り込める。`main` ではないため Xserver デプロイは起動しない（デプロイは `main` へのpushかつ `*.html`・`assets/**` 等の変更時のみ。`docs/**` は対象外）。Vercelのgit自動デプロイも無効 |
| ③ ZIP | 未作成（必要なら作成） | ChatGPTなど別ツールへ添付する場合 |

修正担当への渡し方（②の後）: 「`docs/design-audit-2026-10-18` ブランチの `docs/design-audit/2026-10-18/HANDOFF.md` から読み、`DESIGN_FIX_PROMPT.md` の第1段階を実装してください」と伝える。①のみの場合は「`C:\Projects\the-rev-website\docs\design-audit\2026-10-18\HANDOFF.md` から読む」と伝える。

## 6. 計測・撮影ツールの再利用

`tools/` は Node 24 とローカルの Google Chrome だけで動く（npm依存なし。GTM/GA4等は遮断。Chromeの場所は環境変数 `CHROME_PATH`）。

```bash
node docs/design-audit/2026-10-18/tools/run.mjs <出力先>/main main
```

| スクリプト | 用途 |
|---|---|
| `run.mjs` | ヘッダー・ドロワー・CTA等の計測と a/b/c 撮影（`main` 主要幅、`bounds` 境界幅） |
| `segs.mjs` | 画面1枚ずつのスクロール撮影 |
| `fonts.mjs` | 代替フォントの検出 |
| `one.mjs` | 任意URLの1枚撮影 |
| `report-measurements.mjs` | `MEASUREMENTS.md` の再生成 |

リポジトリ既存の `npm run test:public-site-browser`（Playwright）も使える。第1段階でこちらに恒久的な検査を追加する。

## 7. 監査の未確認事項（確認済みとして扱わない）

- 実機の iPhone Safari / Android Chrome、Firefox、macOS（ヒラギノ）での字形
- 計測がタイムアウトした組合せ（390pxのTOP・特商法・規約、375pxのコラム一覧・記事・プライバシー、1500pxのアクセス・カテゴリ、1200/1199/1024pxのコラム一覧・記事の一部）。640px・360pxの境界撮影、390pxの記事のスクロール撮影
- キーボードのEnterでメニューを開いた場合のフォーカス（マウスで開いた場合のみ計測）
- ホバーの見た目（CSSの読み取りのみ）
