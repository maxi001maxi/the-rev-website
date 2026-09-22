# THE REV. Blog / Column 運用ガイド

このサイトの「コラム（Column）」ページ（`/blog/`）は、Markdownファイルから自動的にHTMLを生成する仕組みです。
`/blog/` フォルダの中身は自動生成物なので、**直接編集しないでください**。記事の追加・修正はすべて `/content/blog/` の中のMarkdownファイルから行い、ビルドコマンドを実行してください。

---

## 1. 新規記事の追加方法

1. `/content/blog/` フォルダに、新しいMarkdownファイル（例：`sample-article.md`）を作成する
2. ファイルの先頭に「Front Matter」（下記2章参照）を書く
3. その下に本文をMarkdown形式で書く
4. 画像を使う場合は `/assets/images/blog/` に画像を追加する（3章参照）。一覧サムネイルは **1200×675px（16:9）** を正本とし、OGPは **1200×630px** とする
5. ターミナルで以下を実行する

```bash
npm run build:blog
```

6. `/blog/index.html` や `/blog/{slug}/index.html` が新しく生成されていることを確認する
7. ローカルで表示を確認する（5章参照）
8. 問題なければ、サーバーへアップロードして公開する

---

## 2. Front Matter（記事情報）の書き方

各Markdownファイルの一番上に、以下のように `---` で囲んで記事情報を書きます。

```yaml
---
title: "記事のタイトル"
slug: "url-yougo-eigo"
description: "検索結果やSNSに表示される説明文（100文字程度）"
published: "2026-09-15"
updated: "2026-09-15"
category: "training"
category_label: "TRAINING"
author: "THE REV. CONDITIONING LAB."
author_role: "THE REV. CONDITIONING LAB."
thumbnail: "/assets/images/blog/thumb-example.jpg"
og_image: "/assets/images/blog/og/og-example.jpg"
status: "published"
featured: false
cta_type: "personal-training"
keywords:
  - "キーワード1"
  - "キーワード2"
---
```

### 必須項目

| 項目 | 内容 |
|---|---|
| `title` | 記事タイトル |
| `slug` | URLになる部分。半角英数とハイフンのみ（例：`personal-training-frequency`） |
| `description` | 検索結果に出る説明文 |
| `published` | 公開日（`YYYY-MM-DD`） |
| `updated` | 更新日（`YYYY-MM-DD`）。修正して再公開する時だけ変更する |
| `category` | `training` / `boxing` / `recovery` / `body-knowledge` のいずれか |
| `author` | 執筆者名。本人監修でない場合は `THE REV. CONDITIONING LAB.` にする |
| `status` | `draft`（下書き・非公開）または `published`（公開） |

### 任意項目

| 項目 | 内容 |
|---|---|
| `thumbnail` | 一覧・カード用の画像パス |
| `og_image` | SNSシェア用の画像パス（未指定時は共通のデフォルトOGP画像） |
| `featured` | 注目記事フラグ（現状は表示上の特別扱いはなし） |
| `cta_type` | 記事末尾のCTA種類：`personal-training` / `boxing` / `recovery` / `general` |
| `keywords` | 関連記事の判定に使うキーワード一覧 |
| `canonical` | 通常は不要（自動設定される） |
| `noindex` | `true` にすると検索エンジンに登録されない（社外秘の下書き公開時などに使用） |

---

## 3. 画像の追加方法

Editorial AI管理の記事画像は、ここだけを読んで手動作成しないでください。画像制作・素材範囲・人物ルール・QC・GitHub/Xserver反映・再発防止までを含む正本は **`editorial/EDITORIAL_IMAGE_RUNBOOK.md`** です。

Current Truth:

- Image engine: `rev-column-reference-v2.3-hybrid`
- Current Policy: **`editorial-thumbnail-v2.4`**
- 顧客役: **必須・原則1人・最大2人**
- トレーナー / スタッフ / コーチ風人物: **禁止**
- Facility-only thumbnail: **禁止**
- 固定Overlay: `rev-column-v24-fixed-overlay-v1`
- Thumbnail: **1200×675px / 16:9**
- OGP: **1200×630px**
- 最小入力: `editorial/hybrid-image-request.template.json`
- Job生成: `npm run image:compile-job -- path/to/request.json`
- 固定Overlay: `npm run image:render-hybrid-overlay -- editorial/hybrid-image-jobs/{slug}.json`
- 全体検証: `npm run test:editorial-images`
- 最終Publish: 人間承認

手動記事で画像を直接追加する場合のみ、以下を守ります。

- 記事サムネイル・本文画像は `/assets/images/blog/` に置く
- OGP画像は `/assets/images/blog/og/` に置く
- Front Matterの `thumbnail` / `og_image` に公開パスを書く
- 実在しないTHE REV.の空間や人物を捏造しない
- Blog一覧のサムネイルは16:9前提なので、3:2画像を新規正本にしない

---

## 4. カテゴリ一覧

カテゴリは記事情報（Front Matter）としてのみ使用します。カテゴリ専用のページ（一覧ページ）は作成しません。記事カードに小さく表示されるラベルと、関連記事の判定にのみ使われます。

| category値 | 表示名 | 内容 |
|---|---|---|
| `training` | TRAINING | パーソナルトレーニング、筋トレ、フォーム、頻度など |
| `boxing` | BOXING | 初心者向けボクシング、ミット、技術など |
| `recovery` | RECOVERY | 休息、酸素ルーム、DENBA、コンディショニング |
| `body-knowledge` | BODY KNOWLEDGE | 身体づくりの基礎、姿勢、動作、継続の考え方 |

新しいカテゴリを増やす場合は `scripts/build-blog.mjs` の `CATEGORIES` の配列を編集してください（Ver.1.0では4カテゴリを推奨）。

---

## 5. Build（ビルド）コマンド

```bash
npm install       # 初回のみ。gray-matter と marked をインストール
npm run build:blog
```

実行すると、以下が自動更新されます。

- `/blog/index.html`（一覧。コラムの入口はここ1ページのみです）
- `/blog/{slug}/index.html`（各記事）
- `/sitemap.xml`
- `/blog/feed.xml`（RSS）

`status: draft` の記事は生成対象から除外されます（＝公開されません）。

---

## 6. ローカルでのPreview方法

プロジェクトフォルダで、簡易サーバーを起動して確認します（`assets/...` や `/blog/...` が絶対パスのため、`index.html` を直接ダブルクリックする方法では正しく表示されません）。

```bash
npx serve .
```

表示されたURL（例：`http://localhost:3000`）にアクセスし、`/blog/` から確認してください。

---

## 7. Draft（下書き）機能

`status: "draft"` にしておくと、その記事はビルドしても `/blog/` 配下に生成されません（一覧にも、サイトマップにも、RSSにも出ません）。内容を確認しながら書き進め、公開する準備ができたら `status: "published"` に変更して再度ビルドしてください。

---

## 8. 記事の更新方法

1. 該当する `/content/blog/xxx.md` を編集する
2. 内容を修正して再公開する場合は `updated` の日付を今日の日付に変更する（`published` は変更しない）
3. `npm run build:blog` を再実行する

---

## 9. 記事の削除方法

1. `/content/blog/xxx.md` を削除する（または `status: "draft"` にして非公開にする）
2. `npm run build:blog` を再実行する（削除した記事のページは自動的に消えます。一覧・カテゴリ・サイトマップ・RSSからも除外されます）

---

## 10. 公開前チェックリスト

記事を公開する前に、以下を確認してください。

- [ ] title・description が内容と一致しているか
- [ ] slug（URL）が正しいか、他の記事と重複していないか
- [ ] published・updated の日付が正しいか
- [ ] category が正しいか
- [ ] author が正しいか（本人監修でない記事は `THE REV. CONDITIONING LAB.` のままにする）
- [ ] thumbnail・OGP画像が設定されているか
- [ ] 画像のalt（説明文）が事実ベースで簡潔か
- [ ] 内部リンク（トレーナー・料金・リカバリーページなど）が適切か
- [ ] cta_type が記事内容と合っているか
- [ ] 医療的な効果を断定していないか（特にRecoveryカテゴリ。「保証」「治る」等の表現は使わない）
- [ ] PC表示で確認したか
- [ ] スマホ表示で確認したか

---

## 補足：現在のサンプル記事について

初期実装確認用として、以下4本のサンプル記事を `status: "published"` で用意しています。

1. `personal-training-frequency.md`（TRAINING）
2. `boxing-beginner-first-step.md`（BOXING）
3. `recovery-after-training.md`（RECOVERY）
4. `self-training-form-check.md`（BODY KNOWLEDGE）

本文はTHE REV.の文体ルールに沿って作成した草案です。**実際に一般公開する前に、内容がTHE REV.の実態・方針と相違ないか、代表者側でのご確認をお願いします。**問題なければそのまま公開、修正が必要であれば該当Markdownを編集して再ビルドしてください。
