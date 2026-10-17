# THE REV. 新TOP v7 / Recovery v8 — 最終受入

判定：**CONDITIONAL GO（条件付き公開可能）**。2026-10-17 JST。

Ownerが本番公開を承認した後、既存Xserver Runbookで公開できる。今回の作業ではmainマージ・Xserver公開・Vercel Production・GTM/GA4設定変更を実施していない。前回TECHNICAL_REPORT.mdの包括的HOLDを、本書の具体的な受入・公開後条件に更新する。CI全体が緑になったという意味ではない。

## 1. 今、公開してよいか

新TOPのサイト側に、公開を止める重大な機能障害・新たな計測欠落・SEO退行は確認されなかった。承認済みPreviewの公開物を再ビルドし、production/preview各691ファイルの全SHA-256が受入済み実装CIと一致した。追加のmain更新は公開ソースに影響しない。デザイン・文章・料金・予約先・営業情報は今回変更していない。

以下の例外と公開後受入を明示して**条件付き公開可能**とする。未確認をPASSに変更しない。Ownerの最終公開承認には、この受入範囲と非ブロッキング例外の認識を含める。

## 2. 最新状態と根拠

| 対象 | 確認結果 |
|---|---|
| GitHub main | `f1667a73e5da097c1432f7ecd2c423265e5ab3a1`。開始時から30コミットの更新を取得、作業ブランチへ衝突なく取り込み。記事画像制作の内部変更をそのまま保持 |
| 受入済みPreview | https://the-rev-website-27fwyd6ay-htrmaxi0101-9305s-projects.vercel.app/ 、`dpl_6LqoHfZQnzvpdTx6CvW4K5Sgd7un`、READY、配備SHA `f749d9c21370287efbb4fb3cb47ed3046ba3c98c` を再取得 |
| Preview証拠の再利用 | [配備先CI 38998326481](https://github.com/maxi001maxi/the-rev-website/actions/runs/38998326481)：6ページ×7サイズ、532 PASS、63画像、JS例外0・自サイト通信失敗0。単なる過去結果の流用ではなく、再ビルド全バイト一致を根拠に再利用 |
| 重点実ブラウザ | 本日あらためてCloud ChromeでTOP→Recoveryへ移動。両ページのcanonical、Preview noindex、構造化データ、全14予約配置、Tab非遮蔽／Enter本文移動を確認 |
| 最新Production相当ビルド | `VERCEL_ENV=production npm run vercel-build`成功。6ページのtitle/description/canonical/index,follow/JSON構文、robotsとsitemapを成果物で確認 |
| 本番の読み取り | TOP/Recovery/robots/sitemapをGETし全てHTTP200。旧TOP・旧Recoveryは現在も本番にあり、公開前であることを確認。JSは実行しない |
| GTM公開設定 | 最新gtm.jsをGET。公開v3、macros/tags/predicates/rulesは先行監査と一致。新しい設定欠落はない |
| ローカル重点回帰 | 技術20 PASS、4組の通常表示PNG一致。Control Capture・Direct Read・Phase E・Measurement Gate・691ファイルparity PASS。実行環境のGoogle CDNブラウザ直結制限は、検証済みTLSのGETで取得した公開CDN応答を再生して区別 |
| 変更範囲 | 最新mainの安全な取り込み、技術ブラウザテストの240秒上限と診断保存、最終受入・公開/復旧手順。公開HTML/CSS/JS・GA4イベント契約の追加変更はない |

実装・UI・同等性の基準：実装修正 `bd3f219a7653bd77f1a6f27c5b1efa7bafb88729`。f749との差分は文書・証拠のみ。全バイト一致の対象にはassets・フォント・Blog・admin静的ファイルも含む。Vercel APIランタイムの新しい受入や配備まで承認したものではない。Xserverの公開物にはadminを含めない。

## 3. 計測：4段階を別判定

| 段階 | 現在の判定 | 公開を止めるか |
|---|---|---|
| 基本アクセス・既存イベント | サイトの単一GTM、dataLayer、現行Googleタグ実行、page_view / reserve_click / line_click / price_click / article_cta_click / section_viewの要求生成を確認。本番収集へはローカル204で応答し、実送信0 | 今回の移行による重大欠落は認めず、ブロックしない |
| 詳細パラメータ転送 | **既存GTM設定FAIL**。page_type/placement等の12フィールドがタグに未マップ。今回も公開v3で同じ。サイトdataLayerには正しく存在 | 既存の集計指標を止めないため、今回のサイト公開の必須条件から分離。別途GTM承認変更として修正 |
| GA4での実受信 | **新TOP公開後の受信はUNVERIFIED**。本番へテスト送信していない。旧本番の2026-10-07受信確認は履歴であり、今日の受信と主張しない | 公開後受入へ移す。実環境で新たな収集欠落を確認した場合は停止/復旧 |
| Company OSへの反映 | 読み取り・未知値・完了日・一意ユーザー・Price control契約は再試験PASS。今日のライブDB同期・新TOP公開後の反映は**UNVERIFIED**。接続済みGSCツールから今回利用可能な実データは取得できず | 公開後の正常同期で確認。既存設定不足だけでサイト公開を無期限に止めない |

Company OSの基本レポートはeventNameと標準pagePath/hostName等を使う。既存の詳細カスタム属性がなくても基本アクセス・イベント集計は成立する。GTMタグでpage_typeが未マップであることと、GA4標準pagePathがないことは別問題。Price実験は既存section_view＋/price.html＋本番hostでsessionsを取得し、25%可視・一度だけ・control・treatment未開始を維持する。今回の全サイト変更日時は分析の変更点として注記する。

予約クリックは予約意向であり、予約完了ではない。reservation_start / reservation_completeはUNKNOWN/NULLを維持し、0や成功に書き換えない。

### GTMを誰がどう直すか

今回、コンテナ管理の認証付き編集/公開権限と設定変更に対する明示承認は確認できていないため、設定は変更していない。公開リソースのGETは編集権限の証拠ではない。

Ownerまたは既存GTM管理担当は、[GTM変更案](GTM_PARAMETER_MAPPING_OWNER_REVIEW.md)の12行に限定した変更を別途承認する。具体的な操作・必要権限・差分確認・戻し方は同文書末尾に追記済み。Ownerが自分で作業する必要はなく、既存担当へそのまま渡せる。

## 4. 外部予約の受入例外

- **Owner確認：通常利用で予約システムは問題ない**（今回の依頼内の明示確認）。これはOwnerの利用確認であり、Workによる全メニュー操作PASSとは区別する。
- 公式入口 `https://cl.gyms.jp/t/CC2237480443/` は維持。/trial/への実ブラウザ遷移・全4UTM保持は既存配備先プローブでPASS。本日もUTM付き入口と遷移先をGETしHTTP200を再確認。
- 公開GET APIにはリカバリー45分、パーソナルジムトレーニング60分、パーソナルボクシング50分の3体験メニューが存在。TOPの来店から終了まで約60分という案内やRecoveryの予約枠60分は変更しない。
- **自動UIプローブはFAILのまま**。GET以外・Service Worker・通知・解析を遮断したcontextでinput/selectが20秒以内に表示されない。環境差のみが原因と確定したとは主張しない。
- Owner正常確認、公式URL/UTM/公開メニューデータの一致、サイト予約先に変更がないことから、予約障害を示す根拠として扱わず、**Owner確認に基づく外部依存の受入例外**とする。実予約・顧客情報・決済送信なし。
- 公開後に通常PC/スマホでもメニューが開かない場合は、サイトCTAとGyms本体を別々に確認する。Gyms自体が停止しているならサイトを旧版に戻しても直らない。新CTAだけ失敗する場合はサイトを戻す。

## 5. 最新CIの扱い（全CI PASSと偽らない）

[最終記録e65のUnified QA](https://github.com/maxi001maxi/the-rev-website/actions/runs/38998784792)では、サイト532が再度PASSした後、外部Googleタグ検証が長時間終了しない状態を観測。今回、テストに240秒のfail-closed上限と途中結果の保存を追加した。既存のイベント件数、二重送信、表示、JSON-LD等の合格基準は一切変更していない。新TOP自体のコード問題とはまだ判定しない。ローカルの同じ実ブラウザ条件では20技術チェックPASS、外部通信経路の差を明示する。

[Phase 9 38998784812](https://github.com/maxi001maxi/the-rev-website/actions/runs/38998784812)は `test:editorial-images` でFAIL。未公開 `personal-gym-trial-three-checks` のV3 JobがR7参照を指定する一方、汎用検証器は従来の2参照を要求する。最新mainを取り込んでも同じ不一致をローカルで再現。対象slugは公開content/blogにも成果物にも存在せず、全公開691ファイル一致を確認した。

この別案件の制作ルール/Jobを勝手に変更したり、テストを無効化したりしない。画像制作担当が別途正本を整合させる課題として残す。今回のXserver静的公開への影響は確認されないため、**サイトの公開判定では非ブロッキング**とする。この例外もOwner最終承認時に明示し、CI全体がPASSとの表示にはしない。VercelのAPI/Editorialを含む包括リリースのGO判定へ流用しない。

## 6. 公開後の受入：担当・期限・異常時対応

T＝Owner承認後に本番切替が完了した日時。実行は今回まだ許可されていない。

| 条件 | 担当・期限 | 合格の証拠 | 未達時の対応 |
|---|---|---|---|
| 本番静的機能・SEO | 公開担当（Workを含む）、T+15分 | 6ページPC/スマホ、全メニュー・戻る・アンカー、予約先、画像、JS例外、indexable robots、canonical、本番HTML/CSSのSHA | 5xx、本文/ナビ不可、予約URL誤り、noindexや別ドメインcanonical、主要アセット欠損を再現したら新規公開停止、直前バックアップへ復旧 |
| 基本GA4の実受信 | GA4閲覧権限を持つOwner/計測担当、T+30〜60分 | 自然発生のpage_view・既存意向イベントをRealtimeで受動確認。新TOP/Recoveryのpage_locationも確認 | 自然流入なしはUNVERIFIEDのまま。GTM/collect欠落を通常同意条件の2環境で再現し、新版由来なら復旧。HTTP204等の送信成功だけで受信PASSにしない |
| Company OS反映 | 計測/Company OS担当、次の正常定期同期、遅くともT+48時間で再判定 | source ACTIVE/last_errorなし、observed_atが公開後、対象期間/実イベント一致、今日partial、完了日と期間unique/UNKNOWN契約維持 | ERROR/STALE/欠落は読取側を診断。GA4収集が正常ならサイト巻き戻しを先に行わない。収集退行と確認できればサイト復旧 |
| GTM詳細属性 | Owner承認を受けたGTM担当、サイト公開と独立した変更枠（目標2営業日以内） | 12項目のworkspace差分、Tag Assistant/Data Layer、実collect内属性とGA4受信を別記録、単一タグ/イベント確認 | 詳細分析は制限を明記し、その属性で配置比較を開始しない。変更で二重送信等が出たらGTMを直前バージョンへ戻す |
| Price実験 | 計測担当、T+24〜48時間 | control契約とPriceページのsection_view sessionsが正常。公開日時を比較の変更点として記録 | treatment開始禁止。露出/集計異常は実験を保留し、サイト基本機能と切り分ける |

GA4標準レポートには24〜48時間の処理遅延があり得るため、直後はRealtimeと標準レポートを混同しない。本番のテスト汚染を避け、今回Workは収集要求を一切外部送信していない。公開後も合成イベントの大量送信は行わず、内部除外が確認済みの検証枠をOwnerが別に許可する場合に限って制御した確認を行う。

## 7. Ownerが最終的に承認・操作すること

1. この**CONDITIONAL GO**の範囲、外部予約のOwner確認、詳細属性/実受信/Company OSの公開後条件、非公開記事画像CIの例外を確認し、**PR #254のmainマージ＋Xserver FULL公開**を最終承認する。現時点ではまだ承認されていない。
2. 公開担当が[公開・ロールバック手順](RELEASE_AND_ROLLBACK.md)を実行する。mainへのmergeだけでXserver workflowが起動するため、先にmergeして後から公開承認を求めてはならない。
3. GTM12項目の変更は上記サイト公開とは別承認。権限を持つ既存担当へ具体的変更案を渡す。

Ownerにコード編集や全テストのやり直しを委ねない。Work側で最新main取り込み、再ビルド同等性、重点回帰、SEO、実Preview、例外の影響判定、具体的な公開後受入/復旧条件、Commit/PushとDraft PR更新まで実施する。

## 根拠

- Git: TECHNICAL_REPORT.md / TECHNICAL_CTA_MAP.csv / TECHNICAL_RECOVERY_WORKLOG.md / FINAL_ACCEPTANCE_EVIDENCE.json
- Canon: XSERVER_DEPLOY.md / .github/workflows/deploy-xserver.yml / VERCEL_RELEASE_POLICY_V1.md / GA4_CURRENT_TRUTH.md / GA4_DIRECT_READ_V1.md / REV_EXP_2026_001_CONTROL_CAPTURE.md
- [Google GTM権限](https://support.google.com/tagmanager/answer/6107011?hl=en)：編集と公開の権限を区別。
- [Google Analytics確認手順](https://developers.google.com/analytics/devguides/collection/ga4/troubleshoot?hl=ja)／[データ収集の確認](https://support.google.com/analytics/answer/9333790?hl=ja)：ネットワーク、Realtime/DebugView、標準レポートを別段階で確認。
