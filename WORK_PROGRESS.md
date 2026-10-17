# THE REV. 統合作業の最終状態

# 公開前QA結果 — 2026-10-17

判定: **ステージングでOwner最終確認可能**。mainマージ・本番公開・Xserver適用は未実施。

- Preview: https://the-rev-website-9eia5e5bd-htrmaxi0101-9305s-projects.vercel.app/
- runtime SHA: `ec529f3d629b053b3db3d16c3eafdfa95a49a30a` / deployment `dpl_77TbYrkYCx726dvKa3jJHdDeKCRK`
- Draft PR: https://github.com/maxi001maxi/the-rev-website/pull/254
- 正本: root index.html / solution.html + assets。Preview限定差し込みは廃止。

## 検証
- 実Chromium7サイズ × 全6ページ、532チェックPASS。JSエラー0、自サイト通信失敗0。
- 6ページ × 7メニュー × 7サイズの294遷移と履歴往復、スクロール・現在地・drawer・Escape・focus・復元位置・予約URL・3タブ・DENBA・記事を確認。
- 本番/Previewビルド680ファイル一致（robotsのみ意図した差）。
- 内部リンク/アセット2295件、欠損0。
- GitHub CI: Control Capture Contract / Phase 9 Check / Unified public site QA 成功。詳細run IDはRESULTS.json。
- 配備済みPreviewの実操作はRESULTS.jsonのremote_browserを参照。
- 証拠画像と詳細ログはChatGPT添付の単体HTMLレポートに埋め込み。CIのunified-public-site-qa artifact（14日保存）にも7サイズ画像・CSV・JSONを保存。配備先QA run: https://github.com/maxi001maxi/the-rev-website/actions/runs/38991029681 （deployed-public-site-qa artifact）。

## 修正
通常ビルドへのTOP v7/Recovery v8統合、デザイン用runtime除去、Recoveryヘッダーの視認性と重なり、drawerのスクロール復元と遅延focus競合、記事のColumn現在地、既存Recovery注意アンカー、ローカルフォント配信。

## 残る確認
- Owner最終デザイン・文章・予約導線の承認。公開操作は承認後の別工程。
- Windows固有環境・実機iPhone Safariは未実施。7サイズChromiumのレスポンシブ検証を実施。
- 実予約・送信・決済・有料生成は実施していない。
- Google Mapsは制御した履歴QAで遮断し、実ブラウザで店舗ピン付き地図の表示を確認。予約先も3メニューの表示を確認（送信なし）。

## 再開
BUILD_AND_RESUME.mdを読む。配備済みruntime SHAを基準とし、QA記録のみの後続commitでは再配備しない。mainの並行記事更新を公開承認時に再確認する。

元承認ソース履歴: `019d37bbd207f741542cad23d7613a3e3d5ab4c9`。統合済みmain: `89de47cdb37aa3a5fe29e1c26f8b09577164a8f5`（main自体は本作業で変更なし）。その後の main `ebd99ee` は記事引継ぎ文書のみで、受入済みruntimeへの影響なし。
