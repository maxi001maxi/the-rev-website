# 通いやすさまで、選ぶ基準に。 — 下書き画像差し替えの準備

対象は既存の未公開下書き1件。写真生成・元scene・cropは維持し、Golden Typography V1 / centered-organic-v1の実生成済みThumbnail、OGP、GBPを届ける。

最新main `bfecf96e0e812e2ee412b16b032b3962424a389e`から分岐した画像専用branch。共通rendererのfeature `5a6a543195a42440d625fa2a00c303f1c0aead8d`はmergeしない。今回は画像9枚（3原寸＋320/400各3枚）、実測metrics、QA、render入力、対象Draftへの差し替え計画のみを追加する。既存画像は上書きしない。

QAは元写真の検証記録を継承し、新しい文字組みは原寸3形式と実320px JPEGで直接目視した。新たな画像生成・QA API呼び出しは0回。Golden acceptanceと元写真のprovenanceをQA内に記録する。最終Publish承認を取得したという意味ではない。

## 状態と反映手順

`delivery-plan.json`の状態は`PREPARED_NOT_APPLIED`。このcommitだけではSupabaseの実下書きは変わらない。

1. ユーザーの当初指定「mainへのmergeはまだ行わない」を尊重し、画像専用main反映の承認を待つ。
2. 承認後に画像専用PRをmergeし、exact commitのDeploy to Xserver成功を確認する。既存workflowは最新mainからサイト全体を配信するが、このPRは既存サイトコード・本文を変更しない。
3. 本番のThumbnail・OGP・GBPをGETし、3画像のSHA256とGitHub実体を確認する。確認前にREADYフラグや配信済みQAを作らない。
4. Draftを再取得し、対象ID・未公開状態・旧画像version・本文を確認する。画像参照、画像version、job/QA参照、検証済み画像QAだけを更新する。記事タイトル・本文・公開状態は維持する。
5. 読み戻しで画像3形式と本文hashを確認し、ログイン済み管理画面で表示を確認する。

記事PublishとGBP投稿は実施しない。現時点では管理画面がログインを求めているためUI確認は未完了。DB確認で対象Draftは存在し、`draft / NOT_PUBLISHED`と確認済み。

render入力は配信証跡であり、mainの自動Operator対象directoryには追加しない。今後の自動生成へ新rendererを常時適用するには、別途renderer featureをmainへ反映する必要がある。
