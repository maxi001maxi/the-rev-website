# 2026-11-28分 コラム制作引き継ぎ
作業日：2026-11-27。公開前の本文・画像・GBP原稿を準備。記事PublishとGBP投稿は実行していない。

- 題名：筋トレはゆっくり動かすほど効く？「下ろす動作」で見直したいこと
- slug：`strength-training-slow-repetition-tempo`
- content_id：`BLOG-20261128-tempo`
- CMS draft_id：`9eb31128-f946-44f1-a410-d54c72e8171c`
- Review：https://the-rev-website.vercel.app/admin/articles/review/?id=9eb31128-f946-44f1-a410-d54c72e8171c
- CMSが現在の編集正本。保存snapshotは作業時点の記録であり、後日の実CMSを上書きしない。
- run_date=2026-11-27、target_date=2026-11-28。日付を混同せず、予約公開や新しい自動化を作っていない。
- 本文1,954非空白文字（JavaScript基準）。本文SHA256 `47a39e2135c8593279d1571389a10109df6ff4ced4844f4a2587246a85fcd2bb`。
- 正本のplanDailyEditorialで翌日分CREATE_NEW、登録済みTRAINING一次情報でSUFFICIENT。PLAN.jsonに選定理由・未選択案・既存改善候補とデータの古さを記録。
- 公開用原稿42・下書き1、実CMS39、保存履歴を比較。読者の問いと近い本文の比較はOVERLAP_AUDIT.md。休憩や追い込みの話を主題にせず、一回の戻す動作のテンポを扱う。
- 一次情報はBLOG-20260922-4d8f2a。本人に帰属するのは挙上テンポ・フォーム・呼吸を見て回数や負荷を変えること。下ろす動作の例・4手順はAIの編集上の一般説明で、過去の本人発言や顧客の実話として創作していない。
- 2025年Enesら14研究のメタ分析は公開抄録のみ確認。筋肥大の結論を技能学習やパワーに一般化せず、最適な秒数も指定しない。NIHの公式案内も直接確認。
- 実素材：the-rev-floor-rack-wide-20261119 / Drive 1tA7z7SiBCWGdUg11OhQzmXv_UyqIhBqQ / IMG_1312.HEIC由来の登録JPEG。
- 自動のダンベル素材照合は候補枯渇で停止したため、既存registryの別実素材で器具を追加しない自重の下降練習へ手動設計。ルールや素材registryは変更していない。canonical compilerでjobを作成。
- 内蔵画像生成2回、外部有料AI API0回。R1は既存の種目順記事と全身構図のfingerprintが一致し不採用。R2は実際の構図を頭から膝付近のmedium three-quarterへ変更、女性1人の顔と動きを拡大。足は画面外のため接地の直接確認には限界がある。静止画から速さは測れない。
- 最終asset：reference-v26-tempo-20261128-work-r2。1枚から1200×675、1200×630、GBP1200×900。原寸3形式と320/400pxの各previewを確認。文字はcanonical overlay、GBPのみ写真位置をleft centerに調整。背景・人体・文字・主従を確認、点数や注意量65%は担当AIの見立て。
- 本文/画像QCは同会話内の作成後再読で、別人・別AIの独立審査ではない。
- PR324：https://github.com/maxi001maxi/the-rev-website/pull/324。記事原稿はcontent/blogへ追加せず、成果物と画像だけmainへ保存。GitHub ActionsのGITHUB_TOKENで検証後mergeしたため、不要な全サイト再配信・画像APIの再実行を発生させていない。
- 配信/検証：run45971342911 SUCCESS。必須6コマンドPASS、画像3枚だけFTPS配信・実HTTP200・SHA256一致。XSERVER_EVIDENCE.json。
- 初回canonical Preflightはerror0、bridge未同期のためIMAGE_READY。接続済みマスター21/22/25/26/43/44へ保存し読戻し、GBP表示タブ・既存画像数式保持まで確認後、bridge同期証拠をQAへ反映。最終状態は後続のFINAL_PREFLIGHT.jsonを参照。
- PR側の全サイトPhase9 CIは既存のblog taxonomyテスト不一致でFAIL。前回作業で変更前mainでも再現済みの制約。今回の必須6項目のPASSと区別し、全サイトCIが全て成功とは報告しない。
- 前回休憩記事は実CMSのPUBLISHED・publish_verified_at・published_urlを確認し、残留REVIEW_READYとBridgeを正本reconcileQueueRowsの結果で同期。公開操作の再実行はしていない。
- 11/25料金記事はユーザー指示で引き続き保留。

次は明日分の本文・画像を人間が確認してPublishし、検証された記事URLをGBP原稿末尾の[BLOG_URL]へ反映して投稿する。自動公開の指示は受けていない。

## 最終確認

run45972474158 SUCCESS（https://github.com/maxi001maxi/the-rev-website/actions/runs/45972474158）。実CMSの最終読戻しに対して、変更していないrunPreflightを再実行し、13チェック中error0、production_recovery=REVIEW_READY、ready_for_owner_publish=true。認証とPublisher権限はautomation actorではskipされ、人間Publish時に再検証される。認証後のReview UI自体の目視確認は未実施。

手動adapterではimage_qa.bridge_synced=trueだけでは正式同期の証拠にならない。最初の最終確認run45972071249はeditorial_sync_hash/editorial_synced_at未登録によりIMAGE_READYで停止した。APIと同じnormalizeArticleInput / resolveEditorialCtaType / resolveEditorialPublishedDate / normalizeBridgeMetadata / computeEditorialSyncHashで値を作り、接続済みSheetsと実CMSの保存内容を照合して同期記録を登録。Bridge APIを実行したと偽っていない。BRIDGE_SYNC_EVIDENCE.jsonを参照。本文は変更していない。

canonical CTA policyにより、情報提供のSTANDARD記事はcta_type=null。更新日は対象日の2026-11-28へ正規化。同期ハッシュは2f4c08bd7177e7418b56350c6b9c90a9d7d91a4793bef186bb25b475874fbdf5。

SHEET_SYNC_EVIDENCE.jsonに6タブの読戻し・GBP表示・画像数式保持と前回記事の公開状態同期を記録。実CMSのNOT_PUBLISHED、source_path/publish証拠nullを最終読戻しでも確認。現在の成果物の変更や再生成は不要。

## 店長指定の腕位置修正（R3）

2026-11-27、店長が「手を前に出さず、胸の前でクロス」と指定。R2の人物・スクワット姿勢・実店舗背景・構図・見出しを維持し、腕だけを内蔵画像編集1回で修正。累計3回、外部有料AI API0回。R2は手の位置について人間却下として保存し、R3を3形式へ同じcanonical Overlayで展開。本文・GBP投稿文の変更はない。

最新assetはreference-v26-tempo-20261128-work-r3。CMS・Bridge・GBP画像参照をR3へ同期。R3の配信証拠と最終Preflightはこの追記後に更新するXSERVER_EVIDENCE.json / FINAL_PREFLIGHT.jsonを参照。記事・GBPは未公開のまま。

R3最終確認：run45979538309 SUCCESS。3画像の実HTTP200・SHA256一致、canonical Preflight13項目error0、REVIEW_READY。実CMSのR3参照と本文不変、未公開を最終読戻しでも確認。GBP表示と既存画像数式の保持も確認した。

## 最新 R4｜2026-11-28 店長指定の身体比率修正
頭・腕・手の相対比率、肩から肘のつながりを再生成。肘を下げ、手を反対側の上腕に添えた胸前クロスへ。元写真・生成写真・3形式の完成画像・320/400pxプレビューを目視点検。身体比率評価は定性的、足は画面外。R3は店長の違和感指摘で却下しQA pass=false。今回追加生成1回、累計4回、外部有料AI API0回。店長の追加依頼に対する修正で自動試行上限3回の方針は変更なし。本文・GBP投稿文は変更なし、CMS未公開。R4の配信・最終PreflightはXSERVER_EVIDENCE/FINAL_PREFLIGHTの最新asset_versionを確認。
