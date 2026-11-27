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
