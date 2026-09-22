# THE REV. Reference V2.3 Hybrid｜画像制作フォーマット

> **初見の担当者・AIへ:** 実行手順、GitHub上の全ファイル役割、失敗時復旧、Current Truthは `editorial/EDITORIAL_IMAGE_RUNBOOK.md` から開始してください。機械向け入口は `editorial/editorial-image-system.json` です。

## 目的

このフォーマットは、2026-09-19に採用した2記事の画像制作方法を今後のBlog / Column画像の標準として再利用するための正本です。

重要なのは、**固定テンプレートへの文字流し込みではなく「デザイン文法」を固定すること**です。毎回まったく同じ左右分割にするのではなく、記事内容に合わせて構図は変えてよい一方、THE REV.の実空間・誌面感・人物ルール・QC基準は変えません。

正本コード: `lib/editorialHybridImageFormat.mjs`  
機械可読仕様: `editorial/reference-v23-hybrid-format.json`  
Jobテンプレート: `editorial/hybrid-image-jobs/_template.json`  
自動検証: `npm run test:hybrid-images`

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

この2枚は単なる参考例ではなく、今後の**Design Reference正本**として毎回参照します。

- `assets/images/blog/thumb-after-work-tired-strength-training-reference-v23-hybrid-4387-75.jpg`
- `assets/images/blog/thumb-no-time-for-gym-starting-friction-reference-v23-hybrid-3978-20.jpg`

ただしレイアウトをコピーするためではありません。**余白、写真処理、静けさ、タイポグラフィ、誌面としての完成度**を揃えるための基準です。

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
- typography_harmony >= 8
- negative_space >= 8
- photo_treatment >= 8
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

## 7. Review / Re-syncの安全境界

`Review & Publish` を開いただけでは公開しません。

- Hybrid READY画像をV2.2へ自動降格させない
- Reviewは画像・本文・Thumbnail・OGP・QCを確認する場所
- Publishボタン操作は人間承認
- 公開後はGitHub Markdownを正本とする
- Editorial AIから本文だけ再同期されても、記事タイトル・slug・category・明示画像コピーが変わっていなければ承認済みHybrid画像を保持する
- 記事タイトル・category・明示画像コピーが変わり、画像の意味が変わる可能性がある場合は既存Hybridを自動流用しない

このルールにより、本文の軽微な修正だけでせっかく承認したV2.3 Hybrid画像がV2.2へ巻き戻ることを防ぎます。

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


## 9. 再利用時の実行フォーマット

今後の記事では、画像制作担当AIは `_template.json` を複製する考え方でJobを組み立てます。毎回ゼロから命名・QC項目・公開境界を考え直しません。

1. 記事内容から短いEditorial Copyを決定
2. 指定Driveルートの画像在庫から候補を選定
3. 過去利用履歴と直近4記事を確認
4. 静止画、または必要時のみ動画フレームをContent Referenceに確定
5. 承認済み2枚のDesign Referenceを確認
6. `hybridGenerationBrief()` のデザイン文法でGPT Image Hybridを生成
7. Thumbnail 1200×675 / OGP 1200×630へ確定
8. Visual QCを実行
9. versioned assets / Hybrid Job / QA reportをGitHubへ保存
10. `npm run test:hybrid-images` でフォーマット、寸法、provenance、Design Reference、QCを自動検証
11. Articles DraftをREADYへ反映し、Review & Publishで停止

### Jobで必ず保持する情報

- slug / article_title
- Editorial Copy
- CATEGORY / COLUMN
- asset_version
- Driveルート
- 元素材のDrive File ID
- 動画の場合は元動画ID・ファイル名・フレーム位置
- 顧客生成の可否
- 未知トレーナー禁止
- THE REV.実空間必須
- QA report path
- Human Publish必須

これにより「今回たまたま良い画像ができた」ではなく、**同じ判断方法を次の記事でも再現できる**状態にします。

## 10. 自動化境界

V2.3 Hybridは今後の**標準ターゲット**です。ただし、GitHub/Vercelだけで勝手に架空の画像を量産しないよう、画像生成そのものは `gpt-operator-orchestrated` とします。

- GPT側が指定Drive素材を実際に確認してからHybrid画像を作る
- Hybrid完成前は安全なV2.2 source-lockをフォールバックとして利用可能
- 一度QC合格したV2.3 Hybridは本文再同期やReview表示でV2.2へ巻き戻さない
- Hybrid Jobの変更はCIで `test:hybrid-images` を通す
- Publishだけは引き続き人間の `Review & Publish` 承認を必要とする

つまり、**デザインは柔軟、素材範囲・人物ルール・QC・公開境界は固定**が正本です。


## 11. デザイン品質のFail-Closed

V2.3 Hybridは「THE REV.っぽい場所ならOK」だけではありません。今回採用した2枚で評価された**誌面としてのデザイン性**も公開条件に含めます。

次のどれかが8未満ならREADYにしません。

- typography_harmony
- negative_space
- photo_treatment
- series_consistency
- editorial_quality
- article_visual_relevance
- rev_environment_consistency
- brand_space_authenticity

また、`expected_copy_present` と `copy_legible` は必ず明示的にtrue、`too_promotional` は明示的にfalseである必要があります。値が欠けている場合も合格扱いにしません。

これにより、**安全なだけの無難なテンプレ画像へ後退すること**と、**見た目は良いがTHE REV.ではない生成画像へ逸脱すること**の両方を防ぎます。
