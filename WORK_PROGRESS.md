# THE REV. 公開前統合作業 — 2026-10-17

## 境界
- 作業ブランチ: feature/unified-v7-header-20261015 / Draft PR #254
- mainへのマージ・本番公開・Xserver適用は未実施、Owner最終承認待ち。
- 出発HEAD: 019d37bbd207f741542cad23d7613a3e3d5ab4c9

## 実施済み
- HANDOFF_FULL.md / 00_WORK_START_PROMPT.md と最新GitHub/Vercelを確認。
- 既存ステージング6ページを実ブラウザで開き、Trainer→Recovery→Price、戻る/進む、Blog→Accessを操作。
- 初回TOPでデザインruntimeのスクリプト断片表示を観測。再訪で復帰。通常静的HTMLへの移行で除去する。
- main ce50a7d052131b0cebdf2b12eff95290e043610b の差分3ファイルを作業ブランチへ通常merge。競合なし。main自体は未変更。

## 実装完了 / 検証進行中
- TOP v7をネイティブHTMLに変換し、Recovery v8とともに正規ルートへ統合済み。
- preview専用overlayを廃止。通常/Previewの680ファイル同等性PASS（robotsのみ意図した差）。
- デザイン用runtimeの不安定な表示、Recovery白背景での白文字/ページバー重なり、既存drawerスクロール復元を修正。
- 外部フォント依存を承認スナップショット由来のローカル配信へ統一。
- 7サイズ×6ページの実Chromium操作回帰中。実施結果はqa-out/browser/results.json / QA_MATRIX.csv。
- Phase 9: 164 / 0、Daily Creator: 120 / 0、Phase D: 75 / 0、Phase E、画像/状態機械/契約/Release Policy/Xserver plan各gate PASS。

## 残作業 / 次の一手
1. 通常/previewビルド同等性・6ページ接続検証。
2. 指定7画面サイズのブラウザ操作・表示検証、証拠保存。
3. 作業ブランチpush、CI確認、exact SHAのPreviewを1回作成。
4. 配備済みPreviewで操作回帰、QA_MATRIXとレポート更新、Draft PR更新。

検証結果を得る前にPASSと記録しない。

構成/再開の詳細: docs/qa/2026-10-17/BUILD_AND_RESUME.md。

追加検証: 既存記事のRecovery注意事項アンカーを補完し、記事ページのColumn現在地表示を修正。全7サイズを固定ビルドsnapshotで最終回帰中。並行main更新 89de47c は未公開記事の2文書のみで、サイトruntimeに影響なし。
