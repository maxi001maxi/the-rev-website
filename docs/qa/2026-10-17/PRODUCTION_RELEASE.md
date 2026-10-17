# TOP v7 / Recovery v8 本番公開記録

2026-10-17 Ownerから「このまま本番サイトの実装、公開」を明示承認。GTM管理設定は別承認。

- PR #254: Draft解除・merge済み。
- Merge SHA: `dadc7dafca58fda776f4b3f355d73c69ad150524`。
- 直前main: `95ef2c80ab17f96b03d14713d3cce984ba335892`。受入基準f166からの10ファイルは別案件のEditorial内部変更で、全て保持。
- exact mergeのProduction build成功。691ファイルが受入候補2e290と全SHA256一致。
- 公開run: https://github.com/maxi001maxi/the-rev-website/actions/runs/39005228524 、FULL。現在、公開直前FTPSバックアップ中。重複dispatchなし。
- 公開前GETは4件HTTP200、TOP SHA256 `81de5b834f004c8cd5ffc7badbde4321b656e483cc7b070725c53a865dbae731`、Recovery `b53fcf6edb5217cf93c1a95d94b9e22e0e20fe63f3a22de8d6619bbdd2b28655`。
- 最新記録CI39001701762はサイト532 PASS・技術画像工程240秒timeout。既存d3の技術20 PASSは同一公開物の証拠として区別。今回ローカルで決定論的13チェック・PC/スマホ4画像保存PASS、CDN直結は未確認。

## 残作業

1. FULLバックアップArtifact ID/期限とdeploy完了を確認。
2. 通常本番URLの全6ページPC/スマホ操作、SEO、公開byte一致、画像/JS確認。
3. GA4 Live Audit自動起動run39005228556の結果確認（旧FAQ開閉前提のlocal-runtime FAILを観測。新TOPのFAQは承認済み常時表示であり、UI変更しない）。この既存監査は収集遮断を実装しておらず、今回の手動QAの収集遮断と分離し、影響を記録する。
4. 公開後GA4実受信とCompany OS正常同期は未確認を維持。詳細属性未マップは別承認。
5. 本書を最終結果・証拠・復旧元で更新しPRへ反映。
