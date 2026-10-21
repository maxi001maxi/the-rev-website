# Editorial Console / GBPブラッシュアップ受入（2026-10-21）

対象：Owner指摘の一覧順・猫背GBP欠落・新着行の3点。記事や画像の再制作は行わない。

## 本番で確認した結果

|指摘|原因|反映・検証|
|---|---|---|
|Articlesの下書きが埋もれる|updated_atだけで並ぶため、公開確認で更新された過去記事が上に移動|DRAFT→PUBLISHING→PUBLISHED、同じ状態はcreated_at降順。認証済み23件の実一覧で夜の筋トレ→10/18下書きが先頭。並び順を画面に明記|
|猫背のGBPがない|BLOG-20261014-AD08-POSTUREはCMSに存在するが通常Queue/本文出力/GBPを経ない過去記事。22_GBP_POSTの親ID検索0件を実測|公開済み本文の範囲で363字の原稿を補完。同じ親ID、既存画像QA/4:3、公開URLを接続。Googleへの投稿は未実行|
|最新原稿が上に来ない|表示式がISO UTC日時を0として扱い、日付型・文字列・旧カンマ形式が混在|表示式A2だけを修正。UTCはJSTへ変換、親ID重複は最新を表示。全28件の作成日降順を実測。2行目猫背、3行目夜の筋トレ。元データ行・他シート・既存画像は並べ替えない|

通常のGBPは完成した親記事を基に250〜500字へ編集し、親記事にない事実を追加せず、親記事IDと画像を接続する。Google投稿そのものは人間確認で停止する。今回の猫背は欠落原稿の補完であり、記事・Draft・画像を重複登録していない。

## コード・本番導入

- 修正PR：#275。head 7ccbf1d68701211ac7f90fe668712672a440c000、merge/current main 0839599a4a01fc5b47b9ddc15f8f6496a5277f49。
- CI Recovery39543800161 / Phase9 39543800170 SUCCESS。追加3回帰テストPASS（実例の下書き優先・安定順・検証前公開扱い防止・GAS表示修復の冪等性・GBP欠落検出）。既存回帰も同CIで成功。
- Preview dpl_971D688kDewnK74rkPskD9ytaGRx READY、exact head。HTML/module HTTP200、配信moduleは候補ソースと完全一致。認証付きPreviewのデータ操作は未実施。
- Production dpl_8NsYBKwm4c5iF3xdhqkitzegWYH9 READY、exact main。認証済み本番Articlesで全23件と先頭2下書きを確認。
- 本番GASはPhase9既存ファイルの定期ハンドラーと3補助関数のみ差分適用。既存GBP文体アダプター、画像ビュー、既存インストーラーを保持。インストーラーは実行せず、トリガーを追加・削除しない。
- UI保存・全ソース読戻し一致。before SHA256 6244e3bc2b5adc52e1a178dff70e9ae11f8b88dda107ec618b6489fe85a6746e、after 8e4f20e731e14735fed04b89ce9cfa0a00d16576d37cba6060603f5bfc95bbee。
- 既存15分同期の終端でGBP表示式を維持し、公開済み親に原稿がなければCOPY_MISSINGの結果を返す。自動の有料補完や品質合格の偽装はしない。定期トリガーによる次回実行そのものは今回の手動検証とは区別する。
- 猫背GBP画像は公開GET200、SHA256 4310fbd1b86ab0a6fd7a6fb9127d449aea223538a73d3ee95d9e277a9da2cfc9。既存CMS QAはPASS/1200×900。

## 自動化の判定

本番導入・既存記事のPrimary自動復旧・認証済み公開前Preflightは確認済み。新しいテーマ選択と必要回答からWriter/Editor/有料画像を含む全工程を毎回完走する新規本番E2Eは未完了であり、システム全面完成とは扱わない。今回修正はOwner画面と不足GBPの保全的な整備。

追加画像生成0、追加有料本文QC0、追加Visual QC0。記事Publish・GBP投稿・DBスキーマ変更なし。今後のOwner操作はテーマ選択/必要回答/最終公開判断。通常の新着順を手動で並べ直す必要はない。

証拠アーカイブ：[editorial-owner-polish-acceptance-20261021.zip](https://drive.google.com/file/d/1GtyxVuGpF8f_afh5bxE4SGQITruUE9Pd/view?usp=drivesdk)。実画面・GAS before/after・CIログを含む。
