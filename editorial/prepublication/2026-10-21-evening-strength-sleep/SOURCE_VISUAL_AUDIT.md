# 2026-10-21｜画像原写真の目視監査（生成なし）

GitHub mainの実画像を開き、現物の構図を確認した。現状は画像QAではなくソース選定レビュー。

- `assets/images/photo-evolgear.jpg`（blob d33af4d7ad43cb108bfe234d06f6c716b76efcc9）：縦長でラックが大写し。人物を合成するとラック・プレートを隠しやすく、自然な人物スペースに乏しい。推奨しない。
- `assets/images/photo-lobby.jpg`（blob 0e63c201c31e49f711f0deb14ffb8affd1faf164）：横長、左にTHE REV.ロゴと観葉植物、中央に受付、右奥にラック。ロビーで筋トレ動作を生成するのは禁止。本文に合わせた人物・器具を両立しにくい。
- `assets/images/photo-lobby-sp.jpg`（blob 2a36b9bd04b8124045154851d22e858878ae11d3）：縦長の受付で天井面積が大きい。横長3形式には不利。
- `assets/images/editorial-source/drive/AI_FRAME_IMG_4387_75.jpg`（blob 8a778bdb34a449f1f5420f23610d017f649df9db）：床すれすれのラック・ベンチ接写。トレーニング中/直後の人物を自然に大きく収める余白が足りない。

現物構図からは、4候補ともR7基準・人物主体・実店機材保護・Thumbnail/OGP/GBPの全条件を同時に満たす確信がない。原写真維持を優先し、別の実景フレーム探しと無料の3形式構図検証を先に行う。生成APIは0回、独立Visual QC未実施、Xserver配置なし。公開不可。
