# THE REV. Editorial Image System｜完全引き継ぎ・実行Runbook

**Current Truth: 2026-09-24**

この文書は、過去チャットを一切知らない人・AIでも、THE REV. Blog / ColumnのサムネイルとOGPを同じ考え方で再現し、GitHubへ安全に接続し、Review & Publish直前まで進められる状態にするための正本です。

## 0. 最初に結論

現在の画像システムは、**記事DraftがPREPARINGになってからReview Readyになるまで自動化済み**です。V2.4 Policyの「記事を読む → 検証済みTHE REV.実素材を選ぶ → 顧客シーンを生成する → 固定Overlayを適用する → 視覚QCする → GitHub/Xserverへ反映する」を、GitHub ActionsのAutomated Hybrid Image Operatorが実行します。

したがって状態は次の通りです。

- 仕様、命名、素材範囲、QC、出力サイズ、公開境界: 固定済み
- Editorial Bridgeが正規Hybrid Jobを自動作成
- 検証済みsource registry: `editorial/automated-image-sources.json`
- V2.3 Hybrid engine + V2.4 Policy生成: `github-actions-auto-operator-v1`
- 生成runner: `scripts/auto-editorial-hybrid-image.mjs`
- 自動Workflow: `.github/workflows/auto-editorial-hybrid-images.yml`
- V2.4固定Overlay: `scripts/render-hybrid-editorial-overlay.mjs` で決定論的に適用
- Multimodal Visual QC: fail-closed、最大試行回数を超えたら停止
- GitHub assets → Xserver public bytes照合 → Supabase READY → LINE完了通知まで自動
- 最終Publishだけは人間承認

通常運用で人間やチャットAIが画像を手作業する必要はありません。例外は、直近4記事と重複しない検証済み実素材が尽きた場合、または自動Visual QCが最大試行回数まで失敗した場合です。

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
| Hybrid V2.4 fixed overlay | `scripts/render-hybrid-editorial-overlay.mjs` |
| fallback renderer | `scripts/render-blog-image.mjs` |
| fallback visual QA | `scripts/qa-editorial-image.mjs` |
| Review preflight | `api/admin/publish-preview.mjs` |
| Publish gate | `lib/publishFlow.mjs` |
| Blog表示 | `scripts/build-blog.mjs` / `assets/css/blog.css` |
| CI | `.github/workflows/phase-9-check.yml` |
| automated Hybrid workflow | `.github/workflows/auto-editorial-hybrid-images.yml` |
| source-lock workflow | `.github/workflows/render-editorial-images.yml` |
| 本番deploy | `.github/workflows/deploy-xserver.yml` |
| Preview実機QA | `.github/workflows/preview-qa.yml` |

---

## 3. 現行標準

### V2.3 Hybrid engine + V2.4 Policy

- Format ID: `rev-column-reference-v2.3-hybrid`（互換維持）
- Policy revision: `editorial-thumbnail-v2.4`
- Layout template: `rev-column-v24-fixed-overlay-v1`
- Strategy: `reference-v2-gpt-image-hybrid-drive-source`
- Thumbnail: **1200×675 / 16:9**
- OGP: **1200×630**
- Publish boundary: **REVIEW_AND_PUBLISH**

承認済みDesign Reference:

- `assets/images/blog/thumb-after-work-tired-strength-training-reference-v23-hybrid-4387-75.jpg`
- `assets/images/blog/thumb-no-time-for-gym-starting-friction-reference-v23-hybrid-3978-20.jpg`

この2枚は人物情景・写真処理・静けさのDesign Referenceです。V2.4の最終文字位置は固定Overlay rendererを正本とします。

### V2.2 fallback

Hybrid生成の障害切り分け時だけ `rev-column-reference-v2.2` source-lockを使えます。**新規Editorial記事はsource-lockのままPublish不可**です。

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

必須:

- 顧客役の生成
- 原則1人
- 記事上必要な場合のみ2人まで
- 記事状況を表情・姿勢・動作で伝える

禁止:

- 知らないトレーナー
- 知らないスタッフ
- 知らないコーチ
- 顧客以外の第三者
- 実在・生成を問わずトレーナー / スタッフ / コーチ
- 施設だけで完成させること

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

### 通常運用｜自動フロー

通常は次が自動で進みます。

`Editorial Bridge → verified source選定 → Hybrid Job作成 → GitHub Actions画像生成 → 固定Overlay → Multimodal Visual QC → GitHub commit → Xserver assets反映 → status poll → Review Ready → LINE通知`

下記Step 1〜11は、手動復旧・品質監査・新しいsource追加時に使う詳細手順です。通常の日次運用で人間が毎回実行する手順ではありません。

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
  "scene_intent": "仕事終わりの顧客1人が、その日の状態を見ながら無理なく始める瞬間",
  "generated_customer_count": 1,
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
- 顧客役は必須。原則1人、最大2人
- トレーナー / スタッフ / コーチ風人物は禁止
- 人物の表情・姿勢・動作は記事内容に合わせる
- 施設だけの完成画像は禁止
- 生成シーンには日本語文字を入れない
- premium editorial / quiet luxury / warm ivory
- **全身のトレーニング動作は、人物だけを切り抜いて後貼りしない**
- スクワット、ランジ、バーベル動作など接地・器具接触・関節角度が重要な場面は、背景を含む **scene-aware編集/生成** を使う
- 人物の縮尺、カメラ遠近、足裏の床接地、接触影、光源方向、色温度、器具との接触が一枚の写真として自然に一致すること
- 受付・通路など、実際の店舗利用として不自然な場所でトレーニングさせない
- 高難度の運動動作は **FLUX Kontext/Pro 等のscene-aware photoreal editor、または同等品質のモデル** を優先する
- そのクラスの生成が利用できない場合は、セット直後に自然に立つ、ベンチで休む、記録を見る等の低難度シーンへ簡略化するか、`PREPARING` のまま止める
- 「生成したから使う」は禁止。人物がステッカー/切り抜き合成に見える時点でREJECT

生成シーンをJobの `generated_scene_path` へ保存した後、必ず:

```bash
npm run image:render-hybrid-overlay -- editorial/hybrid-image-jobs/{slug}.json
```

を実行し、`rev-column-v24-fixed-overlay-v1` の固定文字レイアウトでThumbnail / OGPを作る。

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
- **realism_qc_version = v1（新規・再生成画像）**
- **human_environment_integration >= 9**
- **perspective_scale_consistency >= 9**
- **ground_contact_shadow_consistency >= 9**
- **lighting_consistency >= 9**
- **anatomy_pose_realism >= 9**
- **no_cutout_or_sticker_look = true**
- **location_semantics_pass = true**
- **exercise_pose_plausible = true**
- **manual_visual_rejection != true**
- source_material_scope_pass = true
- unknown_trainer_present = false
- non_customer_people_present = false
- customer_only_or_no_people = true
- generated_customer_present = true
- generated_customer_count = 1..2
- facility_only_thumbnail = false
- fixed_overlay_layout_confirmed = true
- layout_template_id = rev-column-v24-fixed-overlay-v1
- policy_revision = editorial-thumbnail-v2.4
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

Hybrid 1記事につき最低5点です。

1. generated scene
2. Thumbnail
3. OGP
4. `editorial/hybrid-image-jobs/{slug}.json`
5. `editorial/image-qa/{slug}-{asset_version}.json`

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

V2.2 source-lockで障害切り分けはできますが、新規Editorial記事はREADY / Publishへ進めません。Hybrid生成が復旧するまでPREPARINGで停止します。既に承認済みのHybrid画像もfallbackへ上書きしません。

### F. GitHubにはあるが本番で見えない

Xserver反映とpublic asset bytes照合を確認します。Blog HTMLを先に進めず、Assets FIRSTの順序を守ります。

### G. QC JSONだけPASSに書き換えたくなる

禁止です。QCは実画像と実素材を見て判断します。validatorを通すためだけの数値改ざんはシステムの意味を壊します。

### H. 人物が「貼り付け」に見える

即REJECTです。特に以下のどれかがあれば、既存の総合点が高くても採用しません。

- 人物のサイズが背景の遠近に合わない
- 足裏が床へ接地して見えない
- 人物だけ影がない / 影の方向が違う
- 色温度やコントラストが背景と合わない
- 手・足・関節・器具接触が不自然
- 実際にはトレーニングしない受付・通路で運動している
- 人物の輪郭がステッカーのように浮いて見える

この場合は `manual_visual_rejection = true` とし、Draftを `PREPARING` へ戻す。
複雑な運動シーンならscene-awareモデルへ切り替える。利用できなければ、静的で自然な顧客シーンへ簡略化する。

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


---

## 14. Review判定の追加ルール（人物・生成方式・再利用）

### 14-1. 人物

Blog / Columnサムネイルでは、**実在・生成を問わずトレーナー / スタッフ / コーチを使用しない**。

必須:
- 記事の状況説明に必要な顧客役
- 原則1人、最大2人

必須QA:
- `trainer_present = false`
- `unknown_trainer_present = false`
- `non_customer_people_present = false`
- `customer_only_or_no_people = true`
- `generated_customer_present = true`
- `generated_customer_count = 1..2`
- `facility_only_thumbnail = false`

この判定が欠けている場合もPASSにしない。

### 14-2. 画像方式

新規Editorial画像の標準は `HYBRID_GENERATED`。

必須:
- `review_mode = HYBRID_GENERATED`
- `image_generation_used = true`
- `fallback_used = false`

Source-lockは障害切り分け用の明示fallbackに限る。その場合でも新規Editorial記事のPublish完成条件にはしない。

「画像生成前提の記事へ既存写真を貼っただけ」はReview FAIL。

### 14-3. THE REV.実背景

必須:
- `real_the_rev_background_confirmed = true`
- `source_material_scope_pass = true`
- `background_source_recorded = true`
- `background_selection_reason_recorded = true`

THE REV.ではない架空ジムへの置換は禁止。

### 14-4. 直近4記事の再利用禁止

Review時に直近4記事との重複を確認する。

必須:
- `recent_similarity_window >= 4`
- `recent_similarity_check_pass = true`
- `same_image_as_recent_articles = false`
- `same_background_as_recent_articles = false`
- `trainer_photo_reused = false`

背景provenanceとして少なくとも以下を照合する:
- content_reference
- Drive source File ID
- cached frame File ID
- origin video File ID
- origin video file name

同一origin videoは、別フレームであっても直近4記事では原則同一背景扱いとする。

### 14-5. Publish Gate

Review UIの表示だけでなく、`lib/publishFlow.mjs` のサーバー側Preflightでも同じGateを再評価する。

`lib/editorialImageReviewGate.mjs` を単一判定正本とし、
Review / READY / Publishで判定基準を分岐させない。

FAIL時はPublishボタンを無効にし、GitHub mainへの記事Publishを拒否する。

### 14-6. 旧QA

新しい必須フィールドが欠ける旧QAはfail-closedとする。
「過去にpass=trueだったから」という理由で新Gateを迂回しない。

### 14-7. 今回のAcceptance基準

Draft:
`f11add0c-3073-4e58-a4f6-ba050403b82e`

Slug:
`strength-training-to-failure-when-to-stop`

旧画像 `assets/images/trainer-top.jpg` はトレーナー素材のため新GateではFAILでなければならない。

修正版は:
- THE REV.実背景
- トレーナー不在
- 顧客役1人を基本（最大2人）
- facility-onlyではない
- Hybrid生成
- V2.4固定Overlay適用
- 直近4記事と同一背景なし
- 1200×675 Thumbnail
- 1200×630 OGP
- QA PASS

を満たし、Review & Publish直前で停止する。


---

## 15. 2026-09-24 追加｜Human-scene Realism Gate

今回、実THE REV.背景へ顧客役を合成した画像が、シリーズ整合・記事関連性・ブランド空間整合では高得点だった一方、人物の縮尺、床との接地、光、配置が不自然なままPASSした。

この失敗を再発防止するため、**構造QCと人物リアリズムQCを別軸**として扱う。

### 原則

1. 実店舗背景が正しいだけではPASSにしない。
2. 人物単体が綺麗なだけでもPASSにしない。
3. 「人物がその場所に本当に存在して見えるか」を最優先で確認する。
4. 複雑な運動姿勢は、切り抜き合成ではなくscene-aware編集を使う。
5. モデル名より完成品質を優先するが、FLUX Kontext/Pro級のscene-aware生成が使える場合は高難度の運動シーンで優先する。
6. 適切な生成手段がない場合、品質を下げて埋めずにPREPARINGで止める。
7. 人間Reviewで違和感があれば、数値QAより人間Reviewを優先してREJECTできる。


## v0.6.7 GBP 4:3 derivative

- Automated Hybrid generation now emits three deterministic derivatives from the same approved generated scene:
  - Thumbnail: 1200x675 (16:9)
  - OGP: 1200x630
  - GBP Latest Update image: 1200x900 (4:3)
- GBP path: `assets/images/gbp/gbp-{slug}-{asset_version}.jpg`.
- New Editorial jobs are fail-closed until the GBP image exists, passes GBP safe-area / copy-legibility QA, and is byte-identical on Xserver.
- Existing pre-v0.6.7 jobs remain backward compatible unless `gbp_image_asset_version` is set.
- GBP image uses the same real THE REV. background and generated customer scene as the Blog image set. It must not trigger a second unrelated customer/background generation.
- Final website Publish remains human-only. GBP auto-posting is outside this patch.
