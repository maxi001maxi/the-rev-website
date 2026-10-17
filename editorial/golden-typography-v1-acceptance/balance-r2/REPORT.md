# 中では、静かに休むだけ。｜構図バランス改善案

Branch: feature/golden-typography-v1-20261003。Parent HEAD: 1a121fcb414432249f153cc8bb9f43e3c7c1d1c2。

ユーザーの「左上の白い枠に文字がまとまって見え、バランスが悪い」という指摘に沿い、共通文字rendererをcentered-organic-v1へ修正した。写真生成・scene・crop・shadeは維持。

GBPは文字の実測高さに応じ左中央（画面高さ48%）へ配置、wide/OGPは各高さ50%へ配置。装飾ラベル・hairlineを省き、補助行のweightを400へ落とした。原文、主役となる語、読みやすさの下限は維持。

白い領域は文字の周囲を支える曲線veilへ変更。上端からの一面の白と、横一直線の写真への復帰を廃止。wideは既存写真の開始位置を狭いbase blendでつなぐ。実veilの全glyph矩形での最小opacityから保守的なcontrastを算出する。

| 形式 | 契約 | 見出しの中心Y | 最小contrast | 目視 |
| --- | --- | --- | --- | --- |
| thumbnail | golden-wide-v1 | 337.4px | 4.62 | 原寸・320px PASS |
| og | golden-wide-v1 | 315.4px | 4.62 | 原寸・320px PASS |
| gbp | golden-gbp-v1 | 432.4px | 5.17 | 原寸・320px PASS |

Visual QCでは原寸・実320pxを直接確認した。焦点、自然な主従、目的のある余白、独立した比率別構図に加え、人物と文字の重心とfadeの自然さを確認。320pxで読めても構図が悪ければFAILとする。最終ユーザー承認を取得したという意味ではない。

全実画像・320px/400px previewのパスとSHA256はvisual-qc.jsonのdeterministic.variants。sceneの同一性と写真側コードの維持はphoto-preservation.json。30ブラウザレイアウトは27成功、長い未生成コピーの3形式は読みやすさを損なう縮小を禁止する期待通りのFAIL。必須回帰7件とnpm ciはPASS。

変更: lib/editorialThumbnailTypography.mjs / scripts/render-hybrid-editorial-overlay.mjs / scripts/auto-editorial-hybrid-image.mjs / 文字テスト2本 / AGENTS.md / EDITORIAL_IMAGE_RUNBOOK.md / editorial-image-system.json / reference lock / feature専用CI / 実生成物と証跡。写真生成API呼出し0回。main merge・Production反映・記事公開は行っていない。今後の本番自動適用はmain反映後。
