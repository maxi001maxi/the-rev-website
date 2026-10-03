# 「通いやすさまで、選ぶ基準に。」実記事確認

記事: 新大宮で完全予約制のパーソナルジムを探す方へ｜THE REV.の設備と過ごし方

Branch: `feature/golden-typography-v1-20261003`

既存のsceneをそのまま使用し、共通Golden Typography V1 rendererでThumbnail / OGP / GBPを生成。写真生成APIは呼び出していない。原文2行を維持し、「選ぶ基準に。」を焦点として指定した。

| 形式 | レイアウト | 文字サイズ（補助 / 焦点） | 実画像目視 |
| --- | --- | --- | --- |
| Thumbnail 1200×675 | golden-wide-v1 | 64 / 85.81 | 原寸・320px PASS |
| OGP 1200×630 | golden-wide-v1 | 64 / 85.81 | 原寸・320px PASS |
| GBP 1200×900 | golden-gbp-v1 | 62 / 82.51 | 原寸・320px PASS |

焦点がある、文字と写真の主従が自然、顔・身体と文字が競合しない、白場が文字の支持に使われている、wideとGBPが別々に成立することを確認。GBPは下部へ写真が戻り、受付・植物・荷物が残る。ラベルは明確に弱い。Golden Referenceの文法を既存記事の2行コピーに合わせた。文字が大きいだけの変更にはなっていない。

実画像と320px/400px JPEGのパス・SHA256は `visual-qc.json` の `deterministic.variants` を参照。写真の同一性は `photo-preservation.json`。400pxは生成済み、今回の目視判定対象は原寸と320px。

今回は記事用fixture・生成画像・確認証跡を追加。renderer、写真生成ルール、記事の公開参照は変更していない。mainへmergeしていない。本番への反映後、共通rendererが今後の記事にも適用される。320px目視確認は今後も必要。

検証: typography / editorial-images / phase-9 / daily-editorial-contract / daily-editorial-state-machine / daily-creator / build:blog はすべてPASS（`regression.json`）。CIは今回の実記事も既存sceneから再生成する。
