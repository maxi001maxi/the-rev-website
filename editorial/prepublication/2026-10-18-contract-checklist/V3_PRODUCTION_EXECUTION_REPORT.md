# THE REV. Editorial Image v3｜2026-10-18 本番実行記録

対象記事 `BLOG-20261018-082d82` / `personal-gym-trial-three-checks`。実行日 2026-10-17 JST。

## 実行済みの正規工程
- OpenAI/GPT以外の画像生成AIは使用していない。正規 `.github/workflows/auto-editorial-hybrid-images.yml` → `scripts/auto-editorial-hybrid-image.mjs` → OpenAI Responses API `image_generation` を使用した。
- 生成前に3案を文章のみで比較（25/25、22/25、20/25）、実店の出典ハッシュ・新R7参照・レンズ/人物/カメラ高・見出し配置・3サイズ整合・過去12記事の重複を検証した。記録 `V3_IMAGE_CREATIVE_BRIEF.json`、導入スクリプト `scripts/preflight-v3-image-brief.mjs`。
- 写真案 A「決断の直前、ラックを見つめる」を採択。新資産識別子 `reference-v3-grounded-evolgear-20261018-contract-r3`。
- 2回の初期Workflow試行（runs `38997353217`、`38997460802`）は無料の事前チェックでFAIL。記事画像APIの費用は発生していない（画像生成ステップ未着手）。
- 最後の正規Workflow **[38997553389](https://github.com/maxi001maxi/the-rev-website/actions/runs/38997553389)** では無料チェックを通過し、**OpenAIの画像生成を1回のみ実行**、1シーンからブログ/OGP/GBP 3種類の派生画像をオフラインで作成し、独立Visual QCを実行した。画像生成2回目は実施していない。

## 実行結果：品質FAIL（意図的に公開停止）
- 撮影構図と文字組み：3フォーマット全部でローカル組版PASS。実際の見出しは「体験前に、\n3つだけ。」で約1.32倍の最終行強調。
- **実店との背景整合：FAIL**。生成結果は本物のEVOLGEARラック構造、支柱/ケーブル/プレート、鏡の位置を変化させ、別の汎用ジムの設備のように見える。人間の袖を整える指示も胸元をつまむ姿になっていた。
- 独立QC：`pass=false`、`rev_environment_consistency=3/10`、`brand_space_authenticity=3/10`、`article_visual_relevance=7/10`、`main_claim_visualization=6/10`。従来のR2同様に偽の合格と扱わない。
- Operator最終：`ERROR` / `attempts_total=1` / `max_attempts=1`。自動で追加生成しない。Runの`editorial-rejected-image-evidence-38997553389`（Artifact ID `12087522445`）に画像現物、3サイズ、QA資料を隔離保存。ブログ画像/Xserverへの配信・GBP投稿は未実施。
- Supabase記事 `BLOG-20261018-082d82` は `NOT_PUBLISHED`、`image_asset_ready=false`、`image_qa.manual_visual_rejection=true`、`gbp_image_qa.manual_visual_rejection=true`。正式管理キューは`REVIEW_REQUIRED`のまま。
- 請求金額は当該GitHub Actionから取得できないため推測しない。確定している画像生成APIの呼び出しは1回。制作コードには画像QCおよび直近画像の意味的履歴評価の追加OpenAI Responses API呼び出しが存在し、総呼び出し回数・実際の金額は現在未集計。生成画像の3サイズ展開には別の有料画像生成APIは使用していない。

## 次回に必要な設計改善（ここでは新生成しない）
画像生成プロンプトで実在の設備を「保持」と書いても、OpenAIの生成結果が設備全体を作り直してしまう事態が起きた。次は**画像の背景全体を再生成させない方向**を優先して、原写真固定＋変更領域のみの生成（マスク/inpaint または工程上の実景ロックの技術検証）を、無料で先に調査・試験する。肩・袖の自然な動作を選ぶと本物のラックの形状が崩れないか、人物/設備の切り抜き感がないか、R7級の写真の魅力を得られるかを確認する。再度の画像生成はOwnerに追加1回の費用と具体的改善理由を提示してからのみ行う。画像生成3サイズを別々に回すことは禁止。

**現時点では『本番公開ボタンのみ』の状態ではない。** 記事本文は維持し、画像は再制作待ち。Blog / GBP 未公開。
