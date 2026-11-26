# 2026-11-26 コラム制作の引き継ぎ

状態：**公開前ドラフト完成。記事・Googleビジネス投稿は未公開。**

## ユーザーの今回の指示

11月25日の料金記事 `nara-personal-gym-price-per-session` は一旦飛ばす。新しい記事を1から通常の流れで制作する。料金記事の本文は共有先に未確認であり、画像はクレジット不足の停止記録がある。今回、その記事を再生成・再試行・公開していない。

## 今回の成果物と正本

- タイトル：筋トレのセット間は何分休む？次のセットの質で決める休憩時間
- slug：`strength-training-rest-between-sets`
- content_id：`BLOG-20261126-rest-sets`
- CMS draft_id：`ce03fc6c-a086-4945-874b-3397cc3c1fa5`
- Review：<https://the-rev-website.vercel.app/admin/articles/review/?id=ce03fc6c-a086-4945-874b-3397cc3c1fa5>
- CMSの `publish_status=NOT_PUBLISHED`、`source_path=null`、公開証拠の各値はnull。`content/blog` にこの記事の公開原稿は追加していない。
- CMSが現在の編集正本。`ARTICLE.json` / `ARTICLE_DRAFT.md` / `ACTUAL_CMS_SNAPSHOT.json` は今回の完成時点の保存物。将来の編集では実CMSを読み直し、古いsnapshotで上書きしない。
- 本文：2197非空白文字。body SHA256：`554c5f7da65d8729ecce380040e28b2e39f5a96a90861649af7ffc9f0328f01e`。
- GBP原稿：`GBP_DRAFT.json`。未公開のため末尾は `[BLOG_URL]`。Googleへの投稿はしていない。

## 方針・テーマ選定

`docs/operations/COLUMN_PDCA_PROTOCOL_V1.md` の11/19追記§5.6に基づき、指定テーマがないため1本選んだ。旧3候補承認フローを実行したと偽っていない。選定・未選択案・実測と仮説は `PLAN.json` とマスターの43/44に記録した。テーマ自体の検索需要の実測はなく、検索語は仮説。参照実績は11/17取得・過去3か月であり最新値として扱わない。

GitHub原稿42件（下書き含む）・CMS38件と既存出力の履歴を機械照合し、近い記事の本文も確認した。セットを終える基準や翌日の筋肉痛ではなく、次セットまでの休憩を新しい問いにした。

一次情報は `BLOG-20260922-4d8f2a` の本人回答。THE REV.の説明として使ったのは、挙上テンポ・フォーム・呼吸を見て、その日の回数を変えること。「まず2分」等はAIが編集した実用上の出発例で、本人の既存発言や効果が最大になる普遍的な処方とはしていない。10回→5回の例も架空の説明例と明記。

研究は2024年の筋肥大メタ分析と、2026年11月18日受理の筋力メタ分析の公開抄録を照合。筋肥大と筋力を混同せず、後者は確認時点で抄録のみと表示。安全情報は厚生労働省。出典・主張範囲は `TEXT_QC_EVIDENCE.json`。

## 画像・費用・検証

- 元素材：`the-rev-floor-rack-low-20261119` / `assets/images/editorial-sources/floor-rack-low-IMG1310-20261119.jpg`。指定Driveルート由来の登録済み実店舗写真。
- asset_version：`reference-v26-rest-sets-20261126-work-r1`。
- 実店舗ベンチで、セット間に左手首の時計を見る架空の男性顧客1人。トレーナー・スタッフ不在。
- 内蔵画像生成1回。外部の有料AI API呼び出し0回。日本語文字は正式Overlayで後段配置。1枚からThumbnail 1200×675、OGP 1200×630、GBP 1200×900を制作。
- 原寸3形式と実320/400pxの6プレビューを確認。解剖・時計を確認する行動・ベンチ接触・実設備位置・背景由来・文字と構図を確認。足先は画面外なので接地の判断は見える着座部分に限定。
- 本文と画像QCは執筆・生成後の同じ会話内での再読であり、別人・別エージェント・有料QCモデルによる独立審査ではない。点数と注意量64%は担当AIの見立てで、実測値ではない。証拠にはこの限界を記載。
- 画像配信run：<https://github.com/maxi001maxi/the-rev-website/actions/runs/45774638655> SUCCESS。3枚だけFTPS配置し、実HTTP200とGitHub上のSHA256一致を確認。`XSERVER_EVIDENCE.json`。
- main反映で起動した全体同期run45773746273はバックアップ中に停止し、画像3枚だけの配信へ切替。全体同期を成功と報告しない。
- 実CMS読戻しに対して、変更していない `lib/publishFlow.mjs` の `runPreflight` を実行。run：<https://github.com/maxi001maxi/the-rev-website/actions/runs/45774824398> SUCCESS。`FINAL_PREFLIGHT.json` は `ok=true`、13項目中error0、`REVIEW_READY`。認証/Publisher権限はautomation actorではskipされ、人間Publish時に再検証される。
- クラウドブラウザのReview画面はログインへ遷移したため、認証後のReview UI自体の目視確認は未実施。DB・実サーバー・正本チェックの証拠と区別する。

## 保存先・既存システムの限界

本文・GBP・Bridge・Queue・選定理由をマスターの `21_WEB_BLOG_OUTPUT`、`22_GBP_POST`、`25_WEB_PUBLISH_BRIDGE`、`26_DAILY_EDITORIAL_QUEUE`、`43_BLOG_IMPROVEMENT_LOG`、`44_COLUMN_TOPIC_LOG` に保存し読戻し確認。GBP表示用タブにも新原稿が現れることを確認。投稿準備とGoogle投稿済みは別。

記事用の必須6コマンドはPASS。全サイトCIの既存不一致2件は変更前mainでも再現した。カテゴリー2ページ目を含めない旧テストと、既存TOPの旧FAQマークアップ期待。`CI_BASELINE_LIMITS.json` に記録。最終差分に既存テスト・ランタイムコードの変更はなく、不一致を抑制していない。

## 次の操作

人間による本文・画像の最終確認と記事Publish、その後のGBP投稿。公開後は実際の公開URL・配信・`publish_verified_at` で状態同期し、GBPのURLも検証済みURLへ置換する。本文と画像を再生成する必要はない。11/25料金記事はユーザーの再開指示があるまで保留。
