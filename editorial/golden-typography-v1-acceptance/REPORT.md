# THE REV. Golden Typography V1｜実装・Visual Acceptance

最新main `e06720b865c33c70f2dfb19a6c1d6e6b51879f93` から新branch `feature/golden-typography-v1-20261003` を作成。却下済み `feature/thumbnail-typography-fix-20261001` はmergeしていない。

文字組みだけを実装。写真生成prompt/provider、元scene、crop/object-position/shade、コピー生成、Daily生成経路を維持。写真の再生成は0回。参照画像は元のGolden Referenceを固定し、生成結果を見本へ呼び替えていない。

## 実生成画像

実記事: 酸素ルームの中では何をする？｜横になって過ごす時間の使い方。
コピー: 中では、 / **静かに** / 休むだけ。原文保持。

| 形式 | サイズ | 原寸の3行font | 320pxの補助文字 | 独立契約 |
|---|---|---|---|---|
| Thumbnail | 1200×675 | 78 / 136 / 92.04px | 20.8px | golden-wide-v1 |
| OGP | 1200×630 | 78 / 136 / 92.04px | 20.8px | golden-wide-v1（高さ別） |
| GBP | 1200×900 | 68 / 112 / 76.16px | 18.1px | golden-gbp-v1 |

中心語は金茶色・太字。補助行はink。カテゴリを小さく、下部JOURNAL装飾を削減。fadeは文字の実幅から計算し、GBPは専用縦fadeで下部の身体を覆わない。任意の `typography_emphasis_text` で既存コピー中の中心語を指定できる。

- Thumbnail: `assets/images/blog/thumb-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003.jpg`
  - 320px: `assets/images/blog/thumb-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-320.jpg`
  - 400px: `assets/images/blog/thumb-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-400.jpg`
- OGP: `assets/images/blog/og/og-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003.jpg`
  - 320px: `assets/images/blog/og/og-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-320.jpg`
  - 400px: `assets/images/blog/og/og-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-400.jpg`
- GBP: `assets/images/gbp/gbp-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003.jpg`
  - 320px: `assets/images/gbp/gbp-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-320.jpg`
  - 400px: `assets/images/gbp/gbp-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-400.jpg`

## Visual Art Direction QC

ChatGPTが原寸3枚と実320px/400px JPEG、Golden Referenceを直接比較。別APIのVisual QCを実行したという主張ではない。

- 単なる文字拡大ではない: PASS。中心語と前後行に明確な階層。
- 視線の焦点: PASS。「静かに」と顧客の顔に焦点。
- 写真と文字の主従: PASS。顔・休息姿勢と文字が競合しない。
- 巨大な白板・無意味な白場: PASS。文字に沿ったfadeと控えめな余白。
- 16:9 / OGPと4:3の独立成立: PASS。GBPは狭いblockと専用縦位置、下部に写真が戻る。
- 強いテンプレ感: PASS。装飾を減らし、記事固有の写真とコピーが中心。

全形式で文字切れなし、原文保持、保守的contrast >=5.586:1。画像とpreviewのSHA256照合済み。判断の詳細は `visual-qc.json`、写真維持の証拠は `photo-preservation.json`。CTRの改善は未測定。

## 検証

- npm ci: PASS
- Typographyの必須Gate・欠落/各項目FAIL・旧画像互換: 3 test blocks PASS
- 実コピー10 Job×3形式: 30 layout cases PASS（長すぎるpending copy 3形式は想定したFAIL）
- 「通いやすさ」「調子を見る」「体重計に出ない」の途中改行を防止。「通いやすさまで、」はGBPでも一つの意味単位を維持。
- 明示中心語の保持・原文に無い中心語の拒否: PASS
- test:editorial-images: 10 jobs PASS
- test:phase-9: 154 passed / 0 failed
- test:daily-editorial-contract / test:daily-editorial-state-machine / test:daily-creator: PASS
- build:blog / syntax / git diff --check: PASS（buildが作る記事差分は含めない）
- GitHub CI: feature branch限定、contents:read、写真生成API・Production deployなし。結果はGitHub Actions参照。

## 公開境界と注意事項

main merge、Production反映、Draft READY変更、記事Publish、GBP投稿は未実施。自動operatorの新画像は原寸・縮小・Art Directionを共通Gateで検証する。旧承認済み画像は日時だけで失効させない。文字QC失敗時は写真sceneを保持して停止する。

## 変更ファイル

- `.github/workflows/auto-editorial-hybrid-images.yml`
- `.github/workflows/golden-typography-v1-check.yml`
- `.github/workflows/phase-9-check.yml`
- `AGENTS.md`
- `assets/images/blog/og/og-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-320.jpg`
- `assets/images/blog/og/og-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-400.jpg`
- `assets/images/blog/og/og-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003.jpg`
- `assets/images/blog/thumb-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-320.jpg`
- `assets/images/blog/thumb-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-400.jpg`
- `assets/images/blog/thumb-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003.jpg`
- `assets/images/blog/thumb-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003.jpg.typography.json`
- `assets/images/gbp/gbp-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-320.jpg`
- `assets/images/gbp/gbp-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003-preview-400.jpg`
- `assets/images/gbp/gbp-oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94-golden-v1-20261003.jpg`
- `editorial/EDITORIAL_IMAGE_RUNBOOK.md`
- `editorial/editorial-image-system.json`
- `editorial/golden-typography-v1-acceptance/REPORT.md`
- `editorial/golden-typography-v1-acceptance/browser-regression.txt`
- `editorial/golden-typography-v1-acceptance/job.json`
- `editorial/golden-typography-v1-acceptance/photo-preservation.json`
- `editorial/golden-typography-v1-acceptance/regression.json`
- `editorial/golden-typography-v1-acceptance/visual-qc.json`
- `editorial/typography-golden-reference/lock.json`
- `editorial/typography-golden-reference/reference-16x9.png`
- `editorial/typography-golden-reference/reference-gbp-4x3.png`
- `editorial/typography-golden-reference/reference-list-view.png`
- `lib/editorialHybridImageFormat.mjs`
- `lib/editorialImageReviewGate.mjs`
- `lib/editorialThumbnailTypography.mjs`
- `package.json`
- `scripts/auto-editorial-hybrid-image.mjs`
- `scripts/render-hybrid-editorial-overlay.mjs`
- `scripts/test-thumbnail-typography-browser.mjs`
- `scripts/test-thumbnail-typography.mjs`
