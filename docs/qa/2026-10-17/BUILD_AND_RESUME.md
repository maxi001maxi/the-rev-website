# THE REV. 統合構成と再開手順

作業ブランチ: `feature/unified-v7-header-20261015` / Draft PR #254。
mainの更新、本番公開、Xserver適用はOwner最終承認まで禁止。

## 正本

- TOP v7: `/index.html` + `/assets/css/top-v7.css` + `/assets/js/home-v7.js`
- Recovery v8: `/solution.html` + `/assets/css/recovery-v8.css`
- 全ページのヘッダー: `/assets/css/unified-header-v7.css`、現在地/新ページメニュー: `/assets/js/unified-navigation.js`
- 既存ページのメニュー処理: `/assets/js/main.js`
- フォント: `/assets/css/site-fonts.css`、承認済みHTMLに埋め込まれていた同じフォントをローカル配信
- 画像・フォント: `/assets/images/redesign/` と `/assets/approved-v7-v8/`
- Blog本文正本: `/content/blog/`。Blogの生成物は `npm run build:blog` で作り直す。

承認スナップショットは旧HEAD `019d37bbd207f741542cad23d7613a3e3d5ab4c9` の `staging-src/` に履歴保存されている。現行ソースをそちらで上書きしない。分割ソースとデザイン用React/DC runtime、親iframeルーターは現行ビルドから除去済み。

## ビルド

```sh
npm ci
npm run vercel-build
npm run test:build-parity
npx playwright install chromium
npm run test:public-site-browser
```

`test:build-parity` は production/preview を別々に再ビルドし、全ファイルのSHA-256を比較する。HTMLのrobotsメタとrobots.txt以外に差があればFAIL。最終distはPreview用。

`vercel-build` の出力は通常のroot HTMLが正本。`scripts/build-review-site.mjs` は互換名を残したrobotsポリシー処理であり、ページの差し込みは行わない。本番indexable、Preview全公開HTML noindex/nofollow＋robots Disallow。adminは従来の保護を維持。

## ブラウザ検証

`qa-unified-site.mjs` はdistを一時HTTPサーバーで配信し、実Chromiumで検証する。BASE_URLを指定すると明示した配備先を検証する。`SHARE_URL`は認証cookie確立用の短期URL（ソース/レポート/ログに値を記録しない）。`CHROMIUM_EXECUTABLE_PATH`は既存ブラウザを使う場合のみ。

7画面サイズ × 6ページで全ヘッダー7項目、実履歴往復、スクロール、画像/横はみ出し/重複ID、メニュー開閉・Escape・フォーカストラップ・復元位置、予約リンク属性を検証。TOPは3タブ/キー操作/声のレール、Recoveryは詳細開閉とDENBAを確認。

計測汚染・外部送信を防ぐため、QA中はGTM等のテレメトリーとGET/HEAD以外を遮断。実予約、フォーム送信、決済は実施しない。外部ネットワークの観測と自サイト障害はログ上で分離する。

成果物は `qa-out/`（Git対象外）。`QA_MATRIX.csv` / `results.json` / 全画面証拠 / build-parity.json / 回帰ログを保存する。公開前レポートとPRからEvidenceパッケージを参照する。

## デザイン・本文保全

TOPの40:60写真配置・マスクの柔らかいフェード・看板・文字・初回体験3アイコン、RecoveryのDENBA図と簡潔な注意書きは承認済み内容を維持。既存Trainer/Price/Accessのmain要素は変更前と同一であることを確認。

メニューを7項目に統一。Gyms URL、既存のutmとdata-track/data-placementを保持。新TOPとRecoveryでは既存main.jsの計測ハンドラーも利用する。本文・健康情報を新しく収集/送信する処理は追加しない。

## 本番への境界

Vercelは `git.deploymentEnabled=false` を維持。中間pushでは配備しない。受入候補のexact SHAを1回Preview作成する。Xserver workflowはmain pushを公開トリガーとするため、Owner承認前にmainを変更しない。

公開承認後は最新mainとの差分・記事更新を再確認し、公開対象SHAを固定して既存本番Runbookに従う。PreviewがREADYでも自動で公開可とは判定しない。
