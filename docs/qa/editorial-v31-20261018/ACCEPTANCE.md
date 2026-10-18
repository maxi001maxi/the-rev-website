# Editorial AI v3.1｜全工程受入・復旧状況

判定：**PARTIAL**。検証した接続経路は機能するが、全14工程の本番自動運転を受入済みとはしない。

調査基点：main `8ef41d5f856ec4eea9624935f5f2122ce46a7088`。SupabaseはSELECTのみ。
有料生成・main変更・本番DB変更・公開・GBP投稿：すべて未実行。

## 14工程の対応と受入

「PASS」は記載した範囲の検証成功。外部応答を固定したテストは、本番サービスの動作や新画像の品質を証明しない。

|工程|既存実装・正本|今回の検証結果|問題・修正状況|
|---|---|---|---|
|01 記事企画|`editorialTopicApproval` / `dailyEditorialCreator` / `editorialAudienceDiscovery`|実プランナーで3候補→保存→選択を接続。既存重複判定テストもPASS|実データの選定正本はTP-20261018。検索需要の実測は今回の対象外|
|02 テーマ選定|`editorialTopicStore` / `editorial_topic_proposals`|保存済み選択・承認→記事IDを引き継ぐテストPASS|Bridgeで保存済み承認を再照合する修正を追加。呼出側READYだけでは進まない|
|03 独自情報収集|`answerInterview` / `approvedQueue` / `dailyEditorialKnowledge`|Owner回答→Queue context→本文QCへ接続PASS|本記事の回答保存をDBで確認。架空の店舗手順は追加していない|
|04 リサーチ|GAS既存Writer/Research、`DailyEditorialQuality_v0.8.0.gs`の根拠入力|固定根拠・一次情報を独立QCへ渡す接続を確認|**本体がこのrepoにない。インストール済みGASの実行・新規出典収集は未検証**|
|05 記事制作|既存GAS Writer/Editor→`api/integrations/editorial.mjs`|固定本文応答→実品質adapter→実Bridge→下書き保存PASS|Writer/Editor本体の実生成は未検証。再同期時に成功済み画像・不採用状態を保持する修正|
|06 本文QC|`v080BaseQuality_` / `v080IndependentQc_` / Bridge length gate|実GAS adapterの決定論的判定・独立QC応答の検証PASS|10/18本文は最終QC20/20の保存稿と一致。新規モデル判断は実行していない|
|07 画像設計|`prepareAutomatedHybridImageJob` / `preflightEditorialImage` / `v3BriefPreflight`|実source registry→正規Job生成、無料Preflightの接続を確認|Briefのshooting指定を実生成promptへ接続。**10/18の向き・視線・3crop配置の再設計と視覚確認は未完**|
|08 画像生成|`auto-editorial-hybrid-image.mjs` / OpenAI Responses|実operatorを子プロセス実行し503障害→記録→再実行時0追加呼出しを確認|全Jobで送信前予算予約、曖昧応答の自動再生成禁止、scene hash checkpointを実装。正常生成は固定画像で代替|
|09 画像QC|`editorialImageAcceptance` / `editorialHybridImageFormat` / `editorialImageReviewGate`|旧R2 PASSを拒否、R7を保全。新規3.1の物理5軸9点未満を拒否|R2/R6不採用版・画像hashを独立台帳化。期待poseを独立観測へ渡す処理を除去。実R7を同一QCリクエストの比較に追加。新規画質は未検証|
|10 画像3形式|既存overlay renderer / `checkEditorialImageReady`|固定の実JPEG3形式→参照・QA hash・実在検査。GBP不足を拒否|3画像のQC対象hashとGitHub実体を照合。新規3比率の構図品質は未検証|
|11 データ連携|Bridge / `editorial-status` / Supabase / GitHub|実SDK・実API経路、同期失敗→停止→成果物を保持して同期再開PASS|エラー握り潰しを修正。Job版不一致を拒否。実10/18はR2パスとR6版が混在し**BLOCKED**|
|12 配信準備|Auto Hybrid workflow / Xserver staging / `editorialAssetBytes`|GitHub成功・Xserver失敗相当、同サイズ別bytesの拒否と復旧を確認|最終Preflightも3形式SHA256照合へ変更。公開済み記事を自動生成候補から除外。実FTP・Actions Runnerは別途確認|
|13 管理画面|`api/admin/article` / `publish-preview` / Review UI|認証付き管理APIを実行。反映失敗を公開可としないテストPASS|工程・停止理由・再開案の表示を追加。SELECT/UPDATE失敗を明示エラー化。**本番ログイン・実ブラウザ表示は未検証**|
|14 最終Preflight|`runPreflight`（Review/Publish共通）|正常接続試験PASS。実記事は画像不合格で停止。公開操作なし|必須本文・3形式・QC対象hash・本番bytesのGateを維持。未検証工程を合格扱いしない|

## 実装された復旧動作

- 不採用画像は、別のslug/版への名前変更や古いPASS QAを使っても、既知の画像hashが一致すれば拒否する。THE REV.実素材そのもののhashは拒否対象に含めない。
- Reviewを開く／本文を再同期する操作で、不採用・回数上限・原因を消さない。
- 生成前に呼出しを予約し、結果・request ID・usageを記録する。実際の請求額が得られない場合は`null`。0円や推定円額へ置き換えない。
- 生成済みsceneのcheckpointと、失敗時のquarantineを保持。曖昧な有料要求は停止。復旧判断後に検証済みscene／同期から再開し、合格QCと承認を省略しない。
- 旧背景固定処理の縦横引き伸ばしを廃止。uniform coverへ変更し、見直したmask・medium・寸法指定のない旧経路はAPI前に停止する。楕円外の画素保全を人物周辺全体の品質保証と扱わない。
- 管理APIの進捗は**根拠のある工程だけ**表示。未取得の工程をUNVERIFIEDのまま残す。画像operatorは遷移履歴・現在／最後の成功工程・理由・次の処理・承認要否を保存する。

**残る制約：** 全工程の永続履歴は現在もProposal・GAS/Sheets・画像operator・Supabaseへ分かれる。画像部分のcheckpointとConsoleの統合表示を追加したが、未取得GAS本体まで含む統一的な自動再開は本番未受入。

## テストと判定

- **DRY_RUN_PASS（接続経路限定）**：実プランナー→永続承認→Interview→GAS品質adapter→Bridge→正規Job→画像状態同期→管理API→canonical Preflight。固定した外部応答の範囲はテストコードとJSONに明記。14個の独立テストを並べたものではない。
- 異常系：画像QC、生成上限、実operator API503、DB同期、画像不足、本文Preflight、配信部分失敗、管理反映失敗、QC後の画像改変、同サイズの配信改変を再現。再開は同期／既存成果物から行い、新規生成を呼んでいない。
- **REAL_DATA_PASS未達／BLOCKED**：10/18の本文保全・承認記録・未公開は確認。画像参照の整合と新しい合格画像は未完。
- **EXTERNAL_VERIFICATION_PENDING**：GAS実起動・新規出典取得・認証付き本番Console・実Xserver配信・新規有料画像生成と実画質。現在のコードはDraft PRであり本番適用前。

証拠：[`dry-run-evidence.json`](dry-run-evidence.json)、[`real-data-preflight.json`](real-data-preflight.json)、[`local-ci-results.json`](local-ci-results.json)。

## 10月18日記事の復旧

`BLOG-20261018-082d82` / `personal-gym-trial-three-checks`。

- 本文SHA256：`5335b6e3dd556e6ff1b19deecb14602ef435081622da09c7204772bf4323f467`。
- 保存稿SHA256は最終本文QCの`source_sha256`と一致し、DB本文もその稿に含まれる。本文・公開状態の変更なし。
- Supabase：`NOT_PUBLISHED` / `image_status=ERROR` / `ready=false`。保存されたOwner選択・Interviewと、下書きOwnerが有効なPublisherであることを確認。
- 正規Job・operator・現在QAはR6。画像パスとQA report pathはR2。R2・R6とも不採用なので、どちらかへ揃えてREADYにすることは禁止。
- 過去R6の記録はResponses 3回（画像生成1回、QC2回）。確認できた金額なし。**今回の有料API使用は0回**。
- 無料の実データPreflightは、本文必須項目・slug・public GitHub接続・未公開記事パスを確認し、画像Gateで停止した。

次は、本文を保持したまま工程07の構図・行動・視線と3比率crop計画を修正し、必要な1回の追加生成についてOwner承認を得る。合格後だけ新しい3形式・QA・Job・DBを同じ版へ接続し、Xserver SHA検証と認証付きPreflightへ進む。mainマージ・本番適用・公開・GBP投稿の承認は別。

## 最終回答

**「記事企画から本番公開直前まで継続して自動実行できる状態か？」→ PARTIAL。**
接続試験で確認した範囲の停止・同期・再開と公開防止は改善した。全14工程の本番自動運転、新規画像のR7品質、未取得GASの起動まで確認できたという報告はしない。
