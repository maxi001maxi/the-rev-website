# TOP v7 / Recovery v8 本番公開記録

Owner承認：2026-10-17「このまま本番サイトの実装、公開をお願いします」。mainマージとXserver公開を実行する。GTM管理設定変更は別承認のまま。

## 現在の状態（公開ジョブ監視中）

- PR #254はDraft解除・merge済み。公開対象SHA `dadc7dafca58fda776f4b3f355d73c69ad150524`。
- 直前main `95ef2c80ab17f96b03d14713d3cce984ba335892` のEditorial内部10ファイルを保持。exact merge Production buildの691ファイルは受入候補2e290と全SHA256一致。
- [公開run39005228524](https://github.com/maxi001maxi/the-rev-website/actions/runs/39005228524)、FULL。attempt1はFTPS backupが2回timeoutし、代替backupも48h超のため書込前に停止。安全条件の緩和なし。
- 読取専用診断39005451527・39005513214・39005647882：認証/TLS/旧TOP取得、lftp既存設定と直接AUTH TLSの双方、root/Blog一覧が成功。旧TOP hashはHTTP preimageと一致。恒久的な設定不備は再現せず。リトライはattempt2を1回だけ起動、現在full backup中。重複dispatchなし。
- 先行の別案件main更新は継続保持。35995（画像Operator状態/使用記録）、540f5（非公開Visual QC記録）は静的公開物に影響しない。

## 監査の追加修正（サイトの見た目・コピー・計測契約は変更なし）

- 成功した実deploy後に、exact run SHAのProduction成果物と通常本番URLを10件照合し、既存532チェックを実ブラウザ実行するworkflowを追加。planner SKIPは実公開と区別するgate付き。
- マージで自動起動した旧GA4 Live Audit（39005228556）は、コレクション遮断なしの既存処理だった。05:10:00〜05:11:03 UTCの旧サイトへの監査では6 page_view＋1 article_view要求を観測。これは新TOP受信の証拠ではなく、テストアクセスとして分析注記。実受信は未確認。local-runtimeにもlocalhost送信要求があった。
- 再発防止として両監査へ `scripts/qa-block-analytics.mjs` を導入。Google CDN GETのみ通常許可、collectionは送信前にローカル204、それ以外のwriteはabort。外部GA4受信をPASSにしない。
- 実ブラウザの負のテストでGET/POST collectionと他POSTが受信サーバーへ0件、通常GETは到達することを確認。
- 旧監査のfaq_open要件は、承認済みTOP v7の常時表示FAQと不整合だった。6件の質問/回答の可視性と「開閉イベントを捏造しない」を追加検証し、保持された実main.jsの開閉処理を独立fixtureで検証（開く時1件・閉じる時0件・必須属性保持）。既存イベント要件を単に削除してPASSにはしていない。
- CI39005873929のlocal-runtimeは上記の実ブラウザ検証を含めPASS。production-auditは別に監視。古い別ブランチVercel admin smokeをXserver受入へ流用しない。

## 公開前GET

- TOP：HTTP200、46358bytes、SHA256 `81de5b834f004c8cd5ffc7badbde4321b656e483cc7b070725c53a865dbae731`
- Recovery：HTTP200、27054bytes、`b53fcf6edb5217cf93c1a95d94b9e22e0e20fe63f3a22de8d6619bbdd2b28655`
- robots：HTTP200、`52431c3571df4fb0e884124e608fc3876e23677fbdc0583da82924d05881541c`
- sitemap：HTTP200、`7248485ecf0e4c7d1bc4b6b1a45535d7b0e5fe3452348b37a8c9642079e46236`

## 再開時の順序

1. run39005228524 attempt2の状態とバックアップArtifactを取得。公開済みと推測しない。
2. 成功後に自動起動するProduction public site acceptanceで通常URL10件のexact byte、全6ページ×7 viewport／532操作と画像を確認。
3. 本番HTMLのSEO/GTM/予約先・UTM、JS例外、承認デザインを実物で確認。
4. 新TOPのGA4実受信とCompany OS公開後同期は受動確認し、未確認を維持。詳細属性12項目は別承認。
5. 本書・証拠JSON・PR #254を最終結果と復旧元で更新。公開失敗なら既存Runbookを守り、バックアップやTLS安全性を弱めない。

## 2026-10-17 14:36 JST 更新：キャッシュ対策を含めた最終公開を継続

- 初回公開run39005228524 attempt2で当回FULLバックアップ成功。Artifact12090654704、93,304,312bytes、2026-10-31 05:30:01 UTCまで。ZIP SHA256 `055bbe71a7b97bd208e55da0519f39e858ff2cb2218273f1090a20e0f3e48504`を取得して照合。434ファイル、assets/Blogあり、unlimited-dev除外、TOP/Recovery/robots/sitemapの4SHAは上の公開直前GETと完全一致。現在assets転送中。
- 追加の実本番HEADでmain.jsに`Cache-Control: max-age=604800`を確認。旧main.js SHAは40e549d3...、新本体は466ce1e34991...で異なる一方、URLは同じだった。再訪問者に旧コードが7日残るため、公開受入前に対策する。
- 最終公開候補 `a3b98e788238ee84dac77416d332e689856639d2` をmainへpush。Production buildでmain/unified-navigation/home-v7のscript URLに内容SHA12桁を付与。39 HTML内のURLのみが変わり、691ファイル比較で他のbyte変更0。本文・画像・CSS・JS本体は不変。
- 実ブラウザのHTTPキャッシュを有効にした負の試験：旧未version URLの7日キャッシュ再利用を確認した後、新TOP/Recovery/Priceが新hashのURLを取得し、正しい分類で予約意向イベント1件を生成。PASS。ルーティングによるcache無効化を使わず、テストserverのCSPで外部通信を遮断。
- Production/Preview parity691 PASS、既存技術13チェックPASS（Google CDN直結は別UNVERIFIED）、TOP/Recovery×PC1440/スマホ390の4組PNGは前後ピクセル完全一致。Control CaptureとVercel policyもPASS。
- 公開物増加への運用調整：FULL backupとassets転送は同時2ファイル、job上限45分に変更。FTPS/証明書/全体backup/14日保存/48h fallback/assets先行/Blog LASTの条件は維持。最終公開も通常FULL laneで行い、先行runと並行書込しない。
- 並行main更新を含む現行ソースで`test:editorial-images` PASS、Phase9/10 164/0。前の非公開V3不一致は履歴として区別し、現在もFAILと決めつけない。

先行の未version版公開が成功しても、今回の最終完了とはしない。a3b98eのFULL公開と、そのexact buildを対象にした本番byte/ブラウザ/安全なGTM要求生成の受入まで継続する。GA4実受信・Company OS公開後同期・別承認GTM詳細属性は従来どおり別判定。
