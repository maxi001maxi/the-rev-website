# 2026-10-15 R7｜記事接続・公開直前のオーナー承認用チェックリスト

> **これは公開指示ではない。** `main`・Supabaseの正規Draft・正規画像Job・本番記事・GBPは、このPRでは変更しない。画像生成・Visual QCの有料再実行も行わない。

## 1. 確認済み Current Truth

- 記事 slug: `personal-gym-first-session-pain-health-history`
- Content ID: `BLOG-20261015-fac1fd`
- 基準 main: `58af99631f536060c3729f36938c983eda6ab3de`
- R7独立QC: GitHub Actions `38677888686`, SUCCESS。画像生成0回、Independent QC PASS。
- R7画像のGitHub配置・Xserver SHA256完全一致: run `38680168911`, SUCCESS。画像3点だけ配置され、記事/GBP投稿は実行されていない。
- ステージ正本: `editorial/image-review/2026-10-15-health-pain-r7-prepublication.json` (`XSERVER_BYTE_VERIFIED_OWNER_REVIEW_PENDING`)
- R7画像SHA・対応する公開用パス・旧Draft観測値: 同ディレクトリの `2026-10-15-health-pain-r7-connection-candidate.json` に固定。
- Supabase `public.admin_article_drafts` を実際にSELECTした時点で `publish_status=NOT_PUBLISHED` / `image_status=PREPARING` / `gbp_image_status=PREPARING`。画像参照は**旧R2**、見出しも **「最初の一回で、相性を確かめる。」**。R7の見出しは **「痛みや体調は、どこまで伝える？」**。
- GitHubの通常Job `editorial/hybrid-image-jobs/personal-gym-first-session-pain-health-history.json` はR5のまま。これはR7 QC結果の否定ではない。ただし公開時の同期・再実行リスクとして認識する。
- `content/blog/personal-gym-first-session-pain-health-history.md` は基準mainに存在せず、公開記事コミットもSupabaseで未記録。
- 今回の確認環境からサイトURLを直接再取得できなかったため、「**2026-10-15現時点のXserver再取得**」は未実施。最後の実バイト照合証拠は上記の成功したActions run。公開直前に最新再検証すること。

## 2. 制作品質・本文との整合

- Thumbnail 1200×675、OGP 1200×630、GBP 1200×900。3形式のSHAはmanifest参照。
- 成人女性の顧客役1名、未知のトレーナー0名。腕を気にする自然な姿勢とTHE REV.受付の実素材に基づく構図。
- QAでは主役感9/10、THE REV.一致9/10、記事関連性9/10、視覚的注意量66%、全比率のタイポグラフィ・GBP安全領域PASS。
- **オーナー目視合格は未取得。** AIのQC PASSでオーナー承認を代行してはならない。
- 本文の次の2項目は公開前に品質判断が必要:
  1. 「THE REV. CONDITIONING LAB.における個別の中止基準や、種目変更の具体的な手順は今回確認できていません。」は制作過程の調査メモに見え、読者向け記事として不自然。未確認の運用を創作せず、現場の正しい説明に修正するか記述を整理する。
  2. `author_role` に「THE REV. CONDITIONING LAB. 代表トレーナー」とあり、店舗での正式肩書と合っているかオーナー確認が必要。
- 記事の医療・安全上の表現は現場基準とソースの妥当性を再点検し、体験相談導線のCTAは `personal-training` と一致させる。本文の未承認変更を勝手に本番へ反映しない。

## 3. 承認後の接続順序（未実行）

1. Supabase原稿を再SELECTし、slug、Content ID、publish_status、現行のversion、`updated_at`のドリフトを確認。異なるなら停止して差分を調べる。
2. 最新`main`のprepublication JSON・R7 QA・3画像を再確認し、SHAがmanifestと同じか確かめる。Xserver外部取得は公開前にもう一度実施する。モデル画像の再生成はしない。
3. **明示的なオーナー承認を取得して初めて**同じDraftにR7 `thumbnail`、`og_image`、`gbp_image`、`image_asset_version`、`gbp_image_asset_version`、`image_qa_report_path`、`image_headline_short`を一貫してセットする。現行のR5ジョブを不用意に書き換えず、OperatorとBridgeによるR2/R5への巻き戻りの有無を確認する。ブログ記事もGBPも、この段階では公開しない。
4. 通常の `api/integrations/editorial-status` または認証済み `api/admin/publish-preview` の**既存QC/readiness gate**に、GitHub R7 QAと3画像を読み込ませる。`READY`や`image_qa.pass`は**検証成功の結果としてのみ**保存する。独立GBP画像の`READY`も別途確認する。
5. 著者の役職・本文の指摘部分をオーナーと確定し、画像・記事テキスト・メタ・CTA・公開日・重複の最終Reviewを行う。
6. 記事公開はオーナーの**別の明示承認**を受けて既存の `Review & Publish` UI/endpointで実行。GitHub`content/blog/`の作成だけでは公開完了ではなく、Deploy to Xserverのexact commit SUCCESS、記事URL、一覧画像、OGP、Supabase `PUBLISHED`＋`publish_verified_at`を確認して初めて完了とする。
7. GBP投稿は記事公開とは**別承認**で実行する。LINE通知はAPI受理・通知状態の証拠を分けて報告する。

## 4. 安全上の注意

- `api/admin/publish-preview` はGETでもDraftの画像状態を更新することがあるため、**承認前にブラウザで安易に叩かない**。今回の調査では未実行。
- R7 QC PASSの正本をR5 ERRORやSupabase旧R2の表示で上書きしない。
- 本PRはdoc/manifestのみ。mergeしても参照切替・公開を起こさないが、オーナー判断が済むまで**draft PRのまま保持**。
- 次の実作業は「R7採用／本文修正／肩書の最終判断→Draft画像参照更新→readinessゲート→別承認でPublish」。責任境界を越えたショートカットは禁止。
