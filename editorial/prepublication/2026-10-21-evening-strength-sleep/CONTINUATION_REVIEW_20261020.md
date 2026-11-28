# 10月21日記事：画像仕上げ・復旧実行の受入（2026-10-20）

判定：**PARTIAL / INDEPENDENT_QC_CONFLICT_REVIEW_REQUIRED**。公開直前には未到達。画像生成APIの実行成功と、画像の採用合格を区別する。

| 確認対象 | 実証結果 |
|---|---|
| 既存原稿 | 本文20/20 PASS、SHA 29cf1be0d80d2f9b9c5928d374fbd40f677f28336f675da15791c049b31bd079を保持。本文再生成・追加本文QCなし |
| OpenAI画像実行 | R4で日本人男性と夜の光、R5で奥行き修正を実行。今回の画像編集2回はHTTP 200・完了 |
| 3形式 | 1200×675 / 1200×630 / 1200×900の実JPEGを作成し、寸法・SHAを実ファイルとQC記録で照合 |
| 無料修正 | 夜の睡眠記事を回復場面へ分類。承認方向の立位全身と整合。GBPの横帯を曲線フェードへ変更 |
| 再利用・上限 | 同じ写真の独立観察をRAW/source/report SHA、直近履歴、構図一致で検証。QC専用経路は画像生成0回・QC1回、上限変更も別契約として拒否 |
| 最終Visual QC | 不合格を保持。文字・GBP Art DirectionはPASS。店舗背景と夜の表現、R7比較は同一RAWで前回評価と不一致 |
| 本番CMS | Draft ac869d7c-c6b8-4d15-b3a0-e8b6c0963f47が1件。draft / NOT_PUBLISHED / noindex、image ERROR、同期hashなし。本文MD5 d7ab027c9adc6bbeedd9eaf5b8ccbfd2を保持 |
| 本番反映・公開 | main未マージ。今回のDB/Sheets/Xserver/GAS/Vercel変更、Publish、GBP投稿なし |

同一RAWは **6f3b19d4a15565bce5d5399a6e85cbb0443b410285911d6c2f94188975fb70b7**。R5の判定は店舗構造・夜・R7比較を肯定し、最新の判定は否定した。RAWは変更していない。どちらの判定も書き換えず、合格票が出るまでの有料再評価や再生成を停止する。これは採用許可ではない。

立っている画像へ座位を要求した検査設定の修正漏れも確認・修正した。新しい無料テストは、同一RAWに対する構図や履歴の不一致を課金前に止める。品質閾値は維持し、最新の低評価を無視してREADYにしない。

## 実使用量

| 今回の継続実行 | 画像編集 | 独立QC | Run |
|---|---:|---:|---|
| R4 日本人・夜 | 1 | 2 | [39401031410](https://github.com/maxi001maxi/the-rev-website/actions/runs/39401031410) |
| R5 奥行き | 1 | 2 | [39402382169](https://github.com/maxi001maxi/the-rev-website/actions/runs/39402382169) |
| GBP/意味分類修正 | 0 | 1 | [39404345057](https://github.com/maxi001maxi/the-rev-website/actions/runs/39404345057) |
| 立位指定修正後 | 0 | 1 | [39405058065](https://github.com/maxi001maxi/the-rev-website/actions/runs/39405058065) |
| 合計 | **2** | **6** | すべて実HTTP応答・request ID・usageを保存 |

親Responsesモデルの返却usageはinput 148,598 / output 17,838 / total 166,436 tokens。画像tool固有usageは返却されず、確定請求額は取得できていない。費用0円や推定額を実費として扱わない。今回より前のR3 画像1回/QC2回、および本番の旧試行履歴を保持。新しいscopeで過去の使用回数を消していない。

## 検証と保存

- 実装候補 d23ac03572414aea3613ac775d19ee230c51e369：Editorial Recovery Acceptance [39405062164](https://github.com/maxi001maxi/the-rev-website/actions/runs/39405062164)、Phase9、PublishDate、Control Capture PASS。
- ローカル：production recovery 14件、実ハンドラーを接続した合成E2E 3件、実画像由来の意味分類・上限・SHA・構図・履歴・QC不一致テスト PASS。
- サイト全体QA [39405062181](https://github.com/maxi001maxi/the-rev-website/actions/runs/39405062181)：予約導線・static/browser・behavior PASS。visualはモバイルscroll中に240秒deadline。3acf335版ではPASSしたが再発し、根本原因は未確定。画像API障害とは分離する。
- [R4実物とQC](https://drive.google.com/file/d/1YeIfWPuY-yQK4L4zsv-vwN4VivMFC3ej/view?usp=drivesdk)
- [R5実物とQC](https://drive.google.com/file/d/10abnd49tBzea7ZKjjruJkd2-td4_EPx6/view?usp=drivesdk)
- [GBP修正後の初回QC](https://drive.google.com/file/d/1fhGYMl4a1333A5-VAG7pyoNTWtX2qKql/view?usp=drivesdk)
- [最終3形式・原画・QC・使用履歴](https://drive.google.com/file/d/1eAsc7obpdR4uLWztghBuJ819PxNOhpsQ/view?usp=drivesdk)

寸法・SHA・CMS読取・各request IDとtoken usageの詳細は [IMAGE_RECOVERY_REVIEW_HOLD.json](IMAGE_RECOVERY_REVIEW_HOLD.json)。実行時のJob/QC/Resultは各image-finish-* / image-layout-*配下で凍結しており、追記診断で元判定を上書きしない。

## 次の操作

1. 無料の比較で、元写真とRAWの窓・ブラインド・ラック・ベンチの位置を局所的に照合する。確認不能と実際の再構築を分け、夜の基準とOwnerの設備が見える構図を統一する。同じ画像への合格票探しは行わない。
2. モバイルのbrowser paint timeoutを別のP1として修復する。
3. 合格後のmainマージ、GAS/Vercel本番導入、正規Bridge・DB/Sheets/Xserver同期は別途Owner承認。認証済みConsole最終Preflightは未実行。Publish/GBPは操作しない。

**A（記事Owner公開待ち）NO。B（v0.8.2本番自動復旧）NO。コードと無料・合成テストは前進したが、画像最終受入と本番導入は未完了。**
