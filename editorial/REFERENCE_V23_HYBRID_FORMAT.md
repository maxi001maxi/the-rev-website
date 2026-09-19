# THE REV. Reference V2.3 Hybrid｜画像制作フォーマット

## 目的

このフォーマットは、2026-09-19に採用した2記事の画像制作方法を今後のBlog / Column画像の標準として再利用するための正本です。

重要なのは、**固定テンプレートへの文字流し込みではなく「デザイン文法」を固定すること**です。毎回まったく同じ左右分割にするのではなく、記事内容に合わせて構図は変えてよい一方、THE REV.の実空間・誌面感・人物ルール・QC基準は変えません。

正本コード: `lib/editorialHybridImageFormat.mjs`  
機械可読仕様: `editorial/reference-v23-hybrid-format.json`

## 1. 素材選定

Content Referenceは以下のDriveルートだけから選びます。

`1I2qrLVBSlnC035b6U6z76dtyHXNc-6iG`

- Drive全体検索は禁止
- 静止画・動画フレームの両方を利用可
- 記事内容との関連性を最優先
- 同じ関連性なら過去未使用を優先
- 次に直近4記事で未使用を優先
- 重複回避だけを理由に記事との関連性を落とさない

## 2. GPT Image Hybridの役割

### 許可

- 実THE REV.素材を背景・空間の正本として使う
- 顧客役の人物を生成する
- 背景のcrop / resize
- 背景のsoften / blur
- 奥行き・光・色調を誌面向けに整える
- 記事ごとに構図を変える

### 禁止

- THE REV.ではない架空のジムへ置き換える
- 知らないトレーナー、スタッフ、コーチを生成する
- 顧客以外の第三者を意味なく追加する
- 元のTHE REV.空間が分からなくなるほど背景構造を作り変える
- 広告バナーのような強いCTAや過剰装飾

## 3. デザイン文法

- Premium editorial
- Quiet luxury
- Warm ivory
- restrained Japanese typography
- generous negative space
- 既存Columnシリーズと並んだときに同じ編集部の一枚に見える
- SEO記事タイトル全文を画像に入れない
- 画像用コピーは短いEditorial Copyに分離
- カテゴリ / COLUMN番号は小さく整然と扱う
- **構図は固定しない**

採用例:

1. `after-work-tired-strength-training / reference-v23-hybrid-4387-75`
2. `no-time-for-gym-starting-friction / reference-v23-hybrid-3978-20`

この2枚を今後のStyle Referenceとして優先します。

## 4. 出力サイズ

| 用途 | サイズ | 比率 |
|---|---:|---:|
| Thumbnail / 記事メイン | 1200 × 675 | 16:9 |
| OGP | 1200 × 630 | 1.91:1 |

ファイル名はasset version付きで固定します。

`thumb-{slug}-{asset_version}.jpg`  
`og-{slug}-{asset_version}.jpg`

## 5. QC

最低条件:

- series_consistency >= 8
- editorial_quality >= 8
- article_visual_relevance >= 8
- rev_environment_consistency >= 8
- brand_space_authenticity >= 8
- source_material_scope_pass = true
- unknown_trainer_present = false
- non_customer_people_present = false
- customer_only_or_no_people = true
- expected_copy_present = true
- copy_legible = true
- too_promotional = false

QC不合格画像はArticlesへREADY反映しません。

## 6. 正式フロー

```
記事Draft
  ↓
指定DriveルートからContent Reference選定
  ↓
過去使用 / 直近4記事チェック
  ↓
GPT Image Hybrid
  - 実THE REV.背景
  - 必要なら顧客役生成
  - 未知トレーナー禁止
  ↓
Thumbnail 1200×675
OGP 1200×630
  ↓
Visual QC
  ↓
GitHub
  - versioned assets
  - hybrid image job
  - QA report
  ↓
Xserver Assets FIRST
  ↓
Articles Draft = READY
  ↓
Review & Publish
  ↓
【人間承認で停止】
  ↓
Publish
```

## 7. Reviewの安全境界

`Review & Publish` を開いただけでは公開しません。

- Hybrid READY画像をV2.2へ自動降格させない
- Reviewは画像・本文・Thumbnail・OGP・QCを確認する場所
- Publishボタン操作は人間承認
- 公開後はGitHub Markdownを正本とする

## 8. 今後の制作時にAIへ渡す要点

1. 記事タイトル
2. 短いEditorial Copy
3. CATEGORY / COLUMN番号
4. 選定したDrive Content Reference
5. その画像/動画を選んだ理由
6. 過去使用状況
7. 実THE REV.背景のどこを残すべきか
8. 顧客役が必要か
9. QC結果
10. Review & Publishで停止すること

このフォーマットの目的は、**「嘘のないTHE REV.空間」と「毎回ちゃんとデザインされた誌面感」を両立すること**です。
