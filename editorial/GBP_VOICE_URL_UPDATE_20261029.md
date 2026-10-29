# GBP文体と記事URL同期の更新（2026-10-29）

Owner依頼：Googleビジネス投稿の人間味と絵文字を改善し、ブログURL欠落も修正する。既存Editorialの生成、独立QC、画像、Topic Approval、人間Publishの経路を維持する。

文体は説明書調を避け、親しみのある自然な言葉と、通常1〜2か所を目安に意味のある絵文字を使う。数合わせ・連打・毎回同じ型を避け、医療上の注意を軽く見せず、接客体験を創作しない。投稿を自動送信する変更ではない。

URL欠落には、未公開のため待っている場合と、公開後の同期漏れがある。旧GateはQueueの公開状態を更新する瞬間にGBPも同期するため、すでにPUBLISHEDのQueueに対して後から再作成されたGBPや、本文にURLの置換記号がない原稿を回収できなかった。

既存15分asset ledgerの認証付きstatus応答から、PUBLISHED・公開検証日時・正式therev-lab.com記事URLが揃う親記事を再照合する。本文とURL列をそろえ、置換記号がない本文にも正式URLを1回入れる。画像却下等の保留を解除せず、未公開URLをslugから推測しない。Google投稿タブでは未公開を「記事公開待ち」と明示する。

## 実環境への適用

GitHubへのmergeだけでは、既存のbound Apps Scriptは更新されない（DAILY_CREATOR_RUNBOOK §6）。新しいスクリプト・Trigger・別のEditorialフローは作らず、既存プロジェクトの次の2ファイルの全文をそれぞれ差し替えて保存する。

1. `GoogleBusinessVoice_v081.gs`：同名の既存voice adapterを置換する。
2. `Phase9_CurrentAssetRefresh_v081.gs`：既存のasset ledger用ファイル（旧名称は`Phase9_CurrentAssetRefresh_v068.gs`）を置換する。

同じコードを別ファイルへ重複追加しない。既存15分Triggerはそのまま使い、再インストールや新Trigger追加は不要。公開・Google投稿・有料生成APIの呼び出しはしない。

保存後は`inspectGoogleBusinessVoiceV081()`で新revision、既存runtime、URL同期関数の存在を読み取り確認できる。この関数は生成APIを呼ばない。通常の次回ledger同期で公開済みURLが反映される。`verifyGoogleBusinessVoiceV081()`は生成を伴う既存診断なので、この作業では実行しない。

## 検証

`node --test scripts/test-google-business-voice-publication.mjs scripts/test-editorial-owner-order.mjs`。公開済みQueueの後からの復旧、本文URL欠落、未公開・検証不足・別hostの拒否、画像却下維持、再実行の冪等性、実際の生成wrapperへの文体指示、URL枠の欠落補正を検証する。モデル呼び出しはローカルstubのみ。
