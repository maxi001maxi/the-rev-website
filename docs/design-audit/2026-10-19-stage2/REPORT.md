# Stage 2 実装報告（共通UIの統一）2026-10-19

ブランチ `design/unify-shared-ui`（`design/p0-header-hotfix` = PR #261 の上に積む）。main へのマージ・本番公開は未実施。
正本: Claude Design Board 1・2（AFTER）。OWNER_DECISIONS の #1〜#10・追加は**未承認のまま**、採用していない。

## 実装したもの

| 項目 | 内容 |
|---|---|
| 共通部品 | 新規 `assets/css/rev-chrome-v7.css`（ヘッダーのトーン、メニュー、固定バー、ボタン）。`unified-navigation.js` に固定バーの表示制御を追加 |
| ヘッダー（H4） | トレーナー・料金・アクセス・特商法・プライバシー・規約・404・コラム（partials）を、TOP の v7 ネイティブヘッダー（`#site-header`）に置換。トーン: `header-tone-dark`（料金・アクセス・法務3）／`header-tone-light`（トレーナー・コラム・404）。予約ボタンの `data-track` / `data-placement` / `utm_*` / `rel` / `target` / `aria-label` は旧要素から機械的に引き継ぎ |
| メニュー（M1〜M3） | 全ページ（TOP・Recovery 含む）を新構造に統一: 紙色全面、先頭行はヘッダーと同寸、項目60px、ボタン56px（→ なし）、現在地は文字だけ太字＋下線、≥861px は右寄せ560px列、即時開閉、フォーカス管理（S1-5 を包含）。旧黒メニュー・金色ボタンは全廃 |
| フッター（F1） | 旧3種を TOP と同じフッターに統一。ナビ順を「サービス→リカバリー→トレーナー→料金→コラム→初回体験→アクセス」に（TOP・Recovery は順序のみ変更。Recovery はリカバリーのリンクが欠けていたため追加）。SNS各1回 |
| ボタン（C1） | 旧金色 `.cta` / `.btn-outline-gold` を黒矩形（60px）と1px枠に。料金タブは丸のまま（#4 未承認） |
| 固定バー（C2） | 旧「料金を見る＋金ボタン」を紙色バー＋黒ボタン54px に（トレーナー・料金・アクセス・コラム）。860px以下で、スクロールが360pxを超え、フッターが見える前だけ表示。左側の文言は #3 未承認のため `hidden`（`data-owner-decision="3"` を外せば仮文言が出る） |
| 404 | `404.html` を Board の AFTER に作り直し（紙色ヘッダー/フッター、`site-fonts.css`、noindex、絶対パス）。サーバー接続（#7）は未実施 |
| コラム | `templates/partials/{header,drawer,footer}.html`・`blog-index.html`・`blog-post.html` を更新。`blog/` の生成物は**コミットしない**（デプロイ時に生成される）。確認は `BLOG_OUTPUT_ROOT` の一時出力で実施 |

## 実ブラウザ検証（headless Chrome / CDP。12ページ × 10幅 × スクロール前後。`docs/design-audit/2026-10-19-p0/tools/stage2-verify.mjs`）

| 検査 | 結果 |
|---|---|
| ヘッダー高さ・ロゴ幅/位置・ナビ文字サイズ・予約ボタン高さを TOP と比較（全ページ×全幅） | 差 0 |
| ナビ・予約ボタン文字 4.5:1／ハンバーガー 3:1 | 全 PASS（TOP のスクロール前は写真上のため対象外） |
| 横はみ出し・JSエラー | 0 |
| メニュー（1399/768/390px）: 開いた直後のフォーカス・Tab/Shift+Tab循環・Esc で閉じてボタンへ復帰・背面固定と位置復元 | 全 PASS |
| 固定バー（390/375/768px）: 上部で非表示、中間で表示、フッターで非表示 | PASS（下記の既知の検査上の誤検出を除く） |
| TOP・Recovery 1440px のヘッダー〜ヒーロー | Before/After バイト一致（TOP 390px は JPEG 揺れのみで目視同一） |
| 予約・LINE・Instagram の計測属性（`trackdiff2.cjs`） | TOP・Recovery・partials のヘッダー 差 0。意図した差のみ（下記） |
| `npm run test:technical-site` | PASS（14 attributed booking anchors） |
| `npm run vercel-build` 内 `[stage-qa]` | PASS（6 real pages）。続く `test:build-parity` は Windows の npm spawn で起動できず**未実行** |

検査上の誤検出（不具合ではない）: ハーネスがビューポート変更時に前回のスクロール位置を引き継いだ（375px）、カテゴリページが短くて 900px スクロールでフッターが見える（768px）。新規ロードでの単体確認では正常。

### 計測属性の意図した差
- フッターの同一プレースメント重複（Instagram・LINE が2回ずつ）→ 各1回。プレースメントは残る
- 旧ドロワーの `instagram_click:*_drawer`（トレーナー・料金・アクセス・法務3・コラム）を削除。**Board 確定案（TOP どおり Instagram 無し）に従った結果で、#1（追加）は未承認**。承認されるまでは計測点が一つ減る点を Owner が認識する必要がある
- 404 に `404_header` / `404_footer` / `404_drawer` の計測を新設（従来は計測リンク無し）

## 未実施・制限（正直な記録）
- 目視で確認した画面: トレーナー1440、料金1440（スクロール前後）、メニュー（390/1280）、404、コラム記事390、特商法390（全長）、TOP/Recovery（比較）。**他の幅・ページは機械検査のみで目視未実施**（Board の寸法確認と同様）
- 未実施: iPhone/Android 実機、1280pxの全ページ目視、`test:build-parity`、Playwright系（`test:public-site-browser`。`npm ci --ignore-scripts` のためブラウザ未取得）、Preview デプロイ
- 旧ヘッダー/ドロワー用 CSS・JS の削除（S2-10 Z1）は未実施（使われなくなったが無害。削除は別コミットで grep 確認後に）
- S2-3（H5: 1200〜1399px の予約導線）は #2 未承認のため**未実装**（ナビは従来どおり 1400px 以上）。ローダー（#6）、「2026.07 OPEN」（#5。旧フッターがあったページは残し、TOP/Recovery は従来どおり無し）、料金タブ（#4）、明朝見出し（追加）も未変更
- 固定バーの表示条件は Recovery の「ヒーローを過ぎたら」の近似（360px超）。ページごとの厳密なヒーロー判定ではない
- トレーナー/アクセス等の既存コンテンツ内の他の金色要素（見出し装飾・アイコン等）は本ステップの対象外

## Owner へ
1. #1（メニューのInstagram）: 承認するとドロワー計測点が復活。承認しない場合は現状の計測減少を許容するか
2. #2・#3・#4・#5・#6・追加の採否（採用時は `rev-chrome-v7.css` / 各ページのスイッチで反映）
3. 本ブランチのDraft PRは未作成（`gh` が無いため）。`design/unify-shared-ui` を GitHub で PR 化してください（ベースは #261 のブランチ）
