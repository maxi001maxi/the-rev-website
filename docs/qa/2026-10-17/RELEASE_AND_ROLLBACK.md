# Owner承認後の公開・復旧手順（未実行）

対象は新TOP v7/Recovery v8を含むXserver静的サイト。正本は XSERVER_DEPLOY.md と .github/workflows/deploy-xserver.yml。本書は今回の候補に必要なチェックポイントを補足する。今回、merge・本番配備・FTPS接続・復旧は実行していない。

## 公開前

1. Ownerから `FINAL_ACCEPTANCE.md` の条件を含むmainマージ＋Xserver公開の最終承認を得る。GTM設定の公開承認は別。
2. 公開担当はfeature/main/PRを再取得。mainが受入基準f1667a73e5da097c1432f7ecd2c423265e5ab3a1から変わっていれば、新規記事・公開ファイル・共通JS・deploy/build変更を確認。公開物が変わった場合は、その部分を再ビルド/再検証する。古いPreviewへmainを巻き戻さない。
3. 同時間帯の記事公開・別FULL公開を担当間で調整し、今回の切替から受入/必要な復旧まで、重なる公開を避ける。既存concurrencyはFTPS処理を直列化するが、業務上の公開順序確認の代わりにはならない。
4. PRの差分とCIを確認。全CI緑とは扱わず、サイト受入・外部予約例外・非公開V3 Jobの既知CI不一致を明示する。公開物バイト一致の証拠が崩れた場合は今回の非ブロッキング判断を再利用しない。
5. 本番TOP/Recovery/robots/sitemap、公開記事一覧と主要アセットのHTTP/SHAを保存。復旧元は**今回の公開直前状態**とする。現在保存済みのGETハッシュはqa-out/final-acceptance/fresh-reads.jsonにあるが、承認時に取り直す。

## 公開

1. 承認後にPR #254をmainへmerge。このpushはDeploy to Xserverを自動起動する。重ねてRun workflowを押さない。
2. workflowが検証するexact SHA、run ID、mode FULLを記録。npm ci→production build→公開Blog検証が通るまでFTP変更は始まらない。
3. FULLのバックアップ証拠 `xserver-backup-<run id>` と14日期限を確認。正本workflowは当回失敗時に48時間以内の非expiredバックアップを安全網として許容する。その場合は使用Artifactと作成日時を記録し、直前の公開記事/ルートの状態と復旧可能性を確認する。復旧元を特定できないまま受入完了にしない。
4. assets→style.css/公開画像SHA照合→root→Blog LAST→本番readbackの順序を維持。ルート全体に--deleteを使わない。adminはXserver payloadから除外。
5. 成功したrun/SHAだけで公開受入PASSにしない。FINAL_ACCEPTANCE.md §6の本番15分smoke、計測・同期の期限付き確認を実行し、証拠を保存する。
6. VercelのProductionをこのサイト公開のために重複作成しない。Vercel API/管理画面の新runtime公開が必要なら別の承認・release手順とする。

## 停止・復旧

直後の主要5xx、ナビ/本文不可、公式予約URL誤り、noindex/canonical退行、主要画像/CSS欠損、移行に起因するGTM/GA4基本収集欠落が再現したら、新規公開を停止して公開担当が復旧する。詳細属性だけの既存不足、標準GA4レポートの処理待ち、自然流入なし、Gyms本体の障害だけを理由にサイトを戻さない。

復旧手順は以下。FTPSの書き込みはOwnerが承認した本番操作の範囲で担当者が行う。今回のWorkでは実行しない。

1. 後続の本番deployを止め、公開担当とOwnerへ障害・対象SHA/runを記録する。実行中のFTP処理を確認し、二つの書き込みを競合させない。
2. 今回の直前バックアップArtifactを取得。index.html・solution.html・assets・blog・robots.txt・sitemap.xmlと作成時刻/ハッシュを確認する。48時間のfallbackしかない場合は、その後の新規記事を先に保全し、古いBlogで上書きしない。
3. 正規のXserver_FTP_USER/PASSWORDを持つ運用環境でFTPS・証明書検証を有効にし、`sv14602.xserver.jp`のFTPルート`/`へ直前assetsを先に戻す。次に今回変更したroot HTML/robots/sitemapを戻し、必要な場合のみBlogを最後に復旧する。root全体の削除は禁止、.htaccess/.user.ini/unlimited-dev等は保持。
4. Blog全体を戻す必要がある場合だけ、確認済みバックアップBlogを正本として/blog/を完全同期する。バックアップ後の記事を消さないよう、直列公開の確認と公開記事一覧の照合を先に行う。
5. 旧版のTOP/Recovery、全6ページ、公式予約先、robots/canonical、主要assetsの本番SHA/HTTPを再確認。再現障害が解消して初めて復旧完了とする。
6. Gitはreset/force-pushしない。必要な公開物の差分だけを復旧ブランチで戻し、並行記事/Editorial更新を保持して通常レビューへ進める。site復旧時に古いPR全体をrevertして別案件を巻き戻さない。
7. GTM詳細属性の別公開が原因の場合は、サイトとは独立してGTMの直前コンテナバージョンへ復旧し、二重送信と既存イベントを確認する。

## 今回は未実施

- main merge、Xserver deploy、Vercel Production、GTM publish：全て未実施。
- 今回runのバックアップID・本番release SHAは公開操作後に確定する。架空IDは記載しない。
