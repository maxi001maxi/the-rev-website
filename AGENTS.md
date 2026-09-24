# AGENTS.md — THE REV. website

## Blog / Column画像を扱うAIへの必須ルール

記事サムネイル、OGP、Editorial AI画像、Hybrid画像、Reference V2.xに関する作業を始める前に、必ず次の順で読んでください。

1. `editorial/EDITORIAL_IMAGE_RUNBOOK.md`
2. `editorial/editorial-image-system.json`
3. `editorial/REFERENCE_V23_HYBRID_FORMAT.md`
4. `lib/editorialHybridImageFormat.mjs`

画像システムのCurrent Truthは上記です。過去チャットや推測を正本にしないでください。

### 絶対に守ること

- 現行画像engineは `rev-column-reference-v2.3-hybrid`、運用Policyは **`editorial-thumbnail-v2.4`**
- Thumbnailは **1200×675 / 16:9**
- OGPは **1200×630**
- Content Referenceは指定Driveルートの範囲だけを使う
- THE REV.ではない架空のジムへ置き換えない
- 未知のトレーナー、スタッフ、コーチを生成しない
- **実在トレーナー写真もBlog / Columnサムネイルには使わない**
- **顧客役は必須。原則1人、記事上必要な場合のみ2人まで**
- トレーナー / スタッフ / コーチ風人物は実在・生成を問わず禁止
- **施設だけの完成サムネイルは禁止**
- **全身のトレーニング動作は人物切り抜きの後貼り合成を禁止。scene-aware生成/編集を使う**
- 人物の縮尺・遠近・床接地・接触影・光・器具接触が背景と自然に一致しない画像はREJECT
- 受付・通路など実際の利用として不自然な場所でトレーニングさせない
- 高難度動作はFLUX Kontext/Pro等のscene-aware photoreal editorまたは同等品質を優先し、使えない場合は静的シーンへ簡略化するかPREPARINGで止める
- 人間Reviewで違和感が出た場合は `manual_visual_rejection=true` として自動QAの高得点より優先してREJECT
- 直近4記事と同一画像・同一背景provenanceを再利用しない
- 新規Editorial画像はHybrid生成が必須。source-lockは障害切り分け用fallbackとしてのみ残し、新規記事のPublish完成条件にはしない
- 生成シーンには日本語文字を生成させず、`rev-column-v24-fixed-overlay-v1` を `npm run image:render-hybrid-overlay -- <job.json>` で後段適用する
- V2.3 Hybrid完成前にV2.2 source-lockを診断用fallbackとして作ることはできるが、V2.4の新規Editorial記事はHybrid完成までPublish不可
- 一度READYになったHybrid画像を本文再同期だけでsource-lockへ巻き戻さない
- 最終Publishは必ず人間承認で停止する

### 変更後に必ず実行する検証

```bash
npm ci
npm run test:editorial-images
npm run test:phase-9
npm run build:blog
```

### 新規Hybrid Job

Job JSONを手書きでゼロから作らないでください。
`editorial/hybrid-image-request.template.json` を入力用に複製し、次で正規Jobへ変換します。

```bash
npm run image:compile-job -- path/to/request.json
```

詳細、失敗時の復旧、GitHub/Xserver/Reviewまでの流れは `editorial/EDITORIAL_IMAGE_RUNBOOK.md` を正本とします。
