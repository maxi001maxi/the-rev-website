# THE REV. Editorial Image System｜完全引き継ぎ・実行Runbook

**Current Truth: 2026-09-22**

この文書は、過去チャットを一切知らない人・AIでも、THE REV. Blog / ColumnのサムネイルとOGPを同じ考え方で再現し、GitHubへ安全に接続し、Review & Publish直前まで進められる状態にするための正本です。

## 0. 最初に結論

現在の画像システムは、**再現可能な仕組みとしては実装済み**です。ただし、V2.3 Hybrid画像の「素材を見る → 記事に合う素材を選ぶ → 画像を生成する → 視覚QCする」は、品質と事実性を守るために **AI Operator必須**で、GitHub Actionsだけの完全無人生成にはしていません。

したがって状態は次の通りです。

- 仕様、命名、素材範囲、QC、出力サイズ、公開境界: 固定済み
- Jobテンプレート、機械可読仕様、CI検証: 実装済み
- V2.2 source-lock fallback: 自動化済み
- V2.3 Hybrid生成: AI Operator orchestrated
- 最終Publish: 人間承認
- このRunbook、manifest、Job compilerにより「何も知らないAI」への引き継ぎ: 実装済み

**完全自動化されていないことを、未実装と混同しないでください。** Hybrid生成を意図的にOperator境界へ残しています。

---

## 1. まず読む順番

新しい担当者・AIは、作業前に以下を上から順に読みます。

1. `AGENTS.md`
2. `editorial/editorial-image-system.json`
3. このRunbook
4. `editorial/REFERENCE_V23_HYBRID_FORMAT.md`
5. `lib/editorialHybridImageFormat.mjs`

過去チャットよりGitHub mainのCurrent Truthを優先します。

---

## 2. 正本の階層

| 役割 | 正本 |
|---|---|
| AI入口 | `AGENTS.md` |
| 全体Current Truth | `editorial/editorial-image-system.json` |
| 人間向け実行手順 | `editorial/EDITORIAL_IMAGE_RUNBOOK.md` |
| V2.3デザイン思想 | `editorial/REFERENCE_V23_HYBRID_FORMAT.md` |
| V2.3コード契約 | `lib/editorialHybridImageFormat.mjs` |
| V2.3機械可読仕様 | `editorial/reference-v23-hybrid-format.json` |
| 最小入力テンプレ | `editorial/hybrid-image-request.template.json` |
| 正規Jobテンプレ | `editorial/hybrid-image-jobs/_template.json` |
| Job compiler | `scripts/compile-hybrid-image-job.mjs` |
| Hybrid Job validator | `scripts/validate-hybrid-image-jobs.mjs` |
| システム全体validator | `scripts/validate-editorial-image-system.mjs` |
| fallback仕様 | `lib/editorialImageStyle.mjs` |
| fallback renderer | `scripts/render-blog-image.mjs` |
| fallback visual QA | `scripts/qa-editorial-image.mjs` |
| Review preflight | `api/admin/publish-preview.mjs` |
| Publish gate | `lib/publishFlow.mjs` |
| Blog表示 | `scripts/build-blog.mjs` / `assets/css/blog.css` |
| CI | `.github/workflows/phase-9-check.yml` |
| source-lock workflow | `.github/workflows/render-editorial-images.yml` |
| 本番deploy | `.github/workflows/deploy-xserver.yml` |
| Preview実機QA | `.github/workflows/preview-qa.yml` |

---

## 3. 現行標準

### V2.3 Hybrid

- Format ID: `rev-column-reference-v2.3-hybrid`
- Strategy: `reference-v2-gpt-image-hybrid-drive-source`
- Thumbnail: **1200×675 / 16:9**
- OGP: **1200×630**
- Publish boundary: **REVIEW_AND_PUBLISH**

承認済みDesign Reference:

- `assets/images/blog/thumb-after-work-tired-strength-training-reference-v23-hybrid-4387-75.jpg`
- `assets/images/blog/thumb-no-time-for-gym-starting-friction-reference-v23-hybrid-3978-20.jpg`

この2枚を「レイアウトのコピーテンプレ」として使ってはいけません。見るべきなのは、余白、静けさ、写真処理、タイポグラフィ、THE REV.実空間との整合です。

### V2.2 fallback

Hybrid生成前、または生成機能が使えないときだけ `rev-column-reference-v2.2` source-lockを使えます。

- supplied THE REV. photoを生成編集しない
- crop / resizeのみ
- Playwrightで誌面タイポを合成
- Thumbnail 1200×675
- OGP 1200×630

V2.3 READY画像をfallbackへ勝手に戻してはいけません。

---

## 4. 素材選定

Content Referenceの探索範囲は指定Driveルートだけです。

`1I2qrLVBSlnC035b6U6z76dtyHXNc-6iG`

禁止:

- Drive全体検索
- 他店舗・他ジムの背景
- Webで拾った「似たジム」
- THE REV.に見えるが実際は存在しない空間への置換

選定優先順位:

1. 記事内容との意味一致
2. 同程度なら過去未使用
3. 次に直近4記事で未使用
4. 重複回避のために関連性を下げない

動画を使う場合、元動画File ID、ファイル名、フレーム位置、可能ならキャッシュしたframeのDrive File IDを保存します。

---

## 5. 人物ルール

許可:

- 顧客役の生成
- 記事状況を伝えるために必要な一般利用者

禁止:

- 知らないトレーナー
- 知らないスタッフ
- 知らないコーチ
- 顧客以外の意味のない第三者

生成顧客を使っても、背景のTHE REV.実空間が「どこか分からない架空のジム」へ変わってはいけません。

---

## 6. Editorial Copy

画像にSEO記事タイトル全文を入れません。

良い例:

- `疲れた日は、\n軽く始めて決める。`
- `30分より、\n行く前後を整える。`

目的はサムネイル単体で記事の意味を伝えつつ、広告バナーではなく誌面として成立させることです。

---

## 7. 新しい記事で実行する手順

### Step 1｜記事を読む

最低限確認:

- title
- slug
- category
- description / 本文
- 何を読者へ伝えたい記事か

### Step 2｜Editorial Copyを決める

SEOタイトルを短く言い換えます。煽らず、静かで、記事の結論を壊さない言葉にします。

### Step 3｜Drive素材を選ぶ

指定Driveルートだけを見て、記事との関連性を最優先します。

記録するもの:

- Drive File ID
- 動画なら元動画ID・ファイル名
- frame position ratio
- キャッシュframeを作った場合はそのDrive File ID
- 選定理由

### Step 4｜最小Requestを作る

`editorial/hybrid-image-request.template.json` をコピーし、記事固有情報だけ入力します。

例:

```json
{
  "slug": "sample-article",
  "article_title": "記事タイトル",
  "category_label": "BODY KNOWLEDGE",
  "column_label": "COLUMN 08",
  "image_headline_short": "短い言葉で、\n意味を残す。",
  "asset_version": "reference-v23-hybrid-4387-50",
  "background_source": {
    "cached_frame_drive_file_id": "DRIVE_FILE_ID",
    "origin_video_file_id": "ORIGIN_VIDEO_ID",
    "origin_video_file_name": "IMG_4387.MOV",
    "frame_position_ratio": 0.5,
    "selection_reason": "記事の状況と来店後のTHE REV.空間が一致するため"
  }
}
```

### Step 5｜正規Jobへcompile

```bash
npm run image:compile-job -- path/to/request.json
```

生成先:

`editorial/hybrid-image-jobs/{slug}.json`

固定ポリシー、Design Reference、出力パス、Publish boundaryをAIが毎回手で書き直す必要はありません。

### Step 6｜Hybrid画像を生成

画像生成担当AIは次を同時に参照します。

- 選んだ実THE REV. Content Reference
- 承認済みDesign Reference 2枚
- 記事タイトル
- Editorial Copy
- CATEGORY / COLUMN
- Jobのpolicy
- `hybridGenerationBrief()` の考え方

生成要件:

- 背景のTHE REV.実空間を視覚アンカーにする
- 構図は記事ごとに変えてよい
- 生成顧客は必要なときだけ
- 未知トレーナー禁止
- premium editorial / quiet luxury / warm ivory
- 広告CTAを入れない
- Thumbnail 1200×675
- OGP 1200×630

### Step 7｜Visual QC

実素材とDesign Referenceを並べて確認します。

必須閾値:

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

結果は:

`editorial/image-qa/{slug}-{asset_version}.json`

へ保存します。

### Step 8｜assetsを配置

```text
assets/images/blog/thumb-{slug}-{asset_version}.jpg
assets/images/blog/og/og-{slug}-{asset_version}.jpg
```

### Step 9｜ローカル/CI検証

```bash
npm ci
npm run test:editorial-images
npm run test:phase-9
npm run build:blog
```

1つでも失敗したらREADYへ進めません。

### Step 10｜GitHub → Xserver → Review

- versioned assets
- Hybrid Job
- QA report
- 記事Markdown / Draft image metadata

を揃えます。

XserverはAssets FIRSTで反映し、公開URLのbytes照合後にBlog側を進めます。

Review画面で:

- Thumbnail
- OGP
- 本文
- copy
- QC
- 画像パス

を確認し、**Publish直前で停止**します。

### Step 11｜Publish

最終Publishだけは人間承認です。AIが勝手に押しません。

---

## 8. asset_versionの考え方

同じslugでも画像を変更したら別versionにします。

例:

`reference-v23-hybrid-4387-75`

意味:

- `reference-v23-hybrid`: 画像方式
- `4387`: source lineageを人間が追える短い識別
- `75`: frame位置など再現に必要な短い識別

正確なDrive File IDはJobの `background_source` に別途保存するので、asset_versionへ秘密情報や長大IDを入れません。

---

## 9. GitHubへ必ず残すもの

Hybrid 1記事につき最低4点です。

1. Thumbnail
2. OGP
3. `editorial/hybrid-image-jobs/{slug}.json`
4. `editorial/image-qa/{slug}-{asset_version}.json`

加えて記事側のthumbnail / og_image / image_asset_version / image_render_versionが一致している必要があります。

---

## 10. 実装済みの自動防御

### Job drift

`scripts/validate-hybrid-image-jobs.mjs`

で以下をfail-closedします。

- Format ID
- Strategy
- Drive root
- 人物ポリシー
- Design Reference
- versioned path
- JPEG寸法
- QA report
- QC閾値
- provenance

### システム全体drift

`scripts/validate-editorial-image-system.mjs`

で以下を検証します。

- manifestとコード契約が一致
- Hybrid / fallbackの出力サイズが一致
- Design Referenceが存在
- Runbook / AGENTS / scriptsが存在
- package commandが存在
- CIがcanonical testを呼ぶ
- Hybrid Job実体が既存validatorを通る

### CSS / 表示比率

Blog側は16:9で固定し、CSSは内容hash付きURLで配信します。古い3:2 CSSのブラウザキャッシュを再利用しません。

Xserver deployでは本番CSS bytesと `aspect-ratio:16/9` まで照合します。

---

## 11. 失敗時の復旧

### A. 画像が左右で切れる

確認順:

1. asset本体が1200×675か
2. `assets/css/blog.css` が16:9か
3. HTMLの `blog.css?v=<hash>` が新しいか
4. Xserver上のCSS bytesがGitHubと一致するか
5. Preview QAのCard 16:9がPASSか

### B. 架空のジムに見える

画像を採用しません。実Content Referenceへ戻し、背景構造の改変を弱めます。

### C. 知らないトレーナーが出た

即FAILです。顧客役以外を消して再生成します。

### D. 記事と画像の意味が弱い

「未使用素材だから」は採用理由になりません。関連性を優先して再選定します。

### E. Hybrid生成機能が使えない

V2.2 source-lock fallbackへ進みます。ただし、既にV2.3 READYの画像をfallbackへ上書きしません。

### F. GitHubにはあるが本番で見えない

Xserver反映とpublic asset bytes照合を確認します。Blog HTMLを先に進めず、Assets FIRSTの順序を守ります。

### G. QC JSONだけPASSに書き換えたくなる

禁止です。QCは実画像と実素材を見て判断します。validatorを通すためだけの数値改ざんはシステムの意味を壊します。

---

## 12. 新しいAIへの最短指示

新しいAIへは次だけ伝えれば開始できます。

> GitHub repository `maxi001maxi/the-rev-website` のmainをCurrent Truthとして扱ってください。Blog / Column画像の作業前に `AGENTS.md`、`editorial/editorial-image-system.json`、`editorial/EDITORIAL_IMAGE_RUNBOOK.md`、`editorial/REFERENCE_V23_HYBRID_FORMAT.md` を読み、`npm run test:editorial-images` が通る状態を維持してください。V2.3 Hybridを標準とし、指定Driveルート外を検索せず、未知トレーナーを生成せず、最終Publishは人間承認で停止してください。

これ以上の過去チャットは必須ではありません。

---

## 13. 「完成」の定義

この画像システムの1記事分が完成したと言えるのは、次を全部満たしたときです。

- 記事とEditorial Copyが一致
- Content Referenceのprovenanceが追える
- THE REV.実空間が確認できる
- 人物ルールに違反しない
- Thumbnail 1200×675
- OGP 1200×630
- versioned filename
- Hybrid Jobあり
- QA reportあり
- `npm run test:editorial-images` PASS
- GitHub assetsあり
- Xserver public assets反映済み
- Review画面で正常
- Publishはまだ人間承認待ち

ここまでをAIが担当し、最後のPublish判断だけを人間が担当します。
