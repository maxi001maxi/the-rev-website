# Design Audit 2026-10-18

**入口: [HANDOFF.md](HANDOFF.md)**（現在の状態・読む順番・資料の場所と共有方法）

| ファイル | 内容 |
|---|---|
| [HANDOFF.md](HANDOFF.md) | 引き継ぎの入口 |
| [DESIGN_FIX_PROMPT.md](DESIGN_FIX_PROMPT.md) | 成果物E: 修正担当へ渡す実装プロンプト（3段階） |
| [AUDIT_REPORT.md](AUDIT_REPORT.md) | 成果物A〜D: 現状把握・監査レポート・優先順位表・改善設計 |
| [MEASUREMENTS.md](MEASUREMENTS.md) | 実ブラウザ計測値（`tools/report-measurements.mjs` で再生成） |
| [font-fallback.json](font-fallback.json) | 代替フォントで描画された要素 |
| `screenshots/` | 修正前（Before）の画面。命名は HANDOFF.md 4章 |
| `tools/` | 計測・撮影スクリプト（Node 24＋Chrome、npm依存なし。GTM/GA4は遮断。Chromeの場所は `CHROME_PATH`） |

監査基準: `origin/main` = `8ef41d5f856ec4eea9624935f5f2122ce46a7088`。監査ではサイトを変更していない。

注記: `screenshots/main/top-390-*.jpg` と `screenshots/extra/trainer-1440-loader-fading.jpg` は同日・同ツールの最初の試行（待機時間のみ短い設定）の撮影。計測がタイムアウトした組合せは [AUDIT_REPORT.md](AUDIT_REPORT.md) A-3 と HANDOFF.md 7章に列挙。
