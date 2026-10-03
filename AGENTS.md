# AGENTS.md — THE REV. website

## Daily Editorial（日次記事）を扱うAIへの必須ルール

日次記事の新規作成可否とPublish後のQueue同期は、プロンプト判断ではなくコードが正本です。

フロー: 毎日一定時刻 → **翌日分**を自動準備 → 記事 → QC → GBP → 画像 → Review Ready → 人間Publish → 公開後状態も自動同期

- 判定エンジン: `lib/dailyEditorialStateMachine.mjs`（`planDailyEditorial`）
- 判定API: `POST /api/integrations/editorial-status` `{ "action": "daily_plan", "rows": [...] }`
- GAS Gate正本: `editorial/gas/DailyEditorialGate_v0.6.9.gs`（04時台Gate / 08時台Watchdog）
- Daily Creator正本: `editorial/gas/DailyEditorialCreator_v0.6.9.gs`（05〜11時台 毎時）/ 選定エンジン `lib/dailyEditorialCreator.mjs` / 一次情報の登録 `lib/dailyEditorialKnowledge.mjs` / 運用 `editorial/DAILY_CREATOR_RUNBOOK.md`
- 契約と再発防止テスト: `editorial/daily-editorial-state-contract.json` / `npm run test:daily-editorial-state-machine`

### 絶対に守ること

- 実行は毎日。準備する記事の `run_date` は **実行日 + `daily_editorial_lead_days`（既定1 = 翌日）**。営業日かどうかは実行日ではなく `run_date` で判定する（金曜は土曜分を作り、木曜・日曜は翌日が定休日なので作らない）
- `REVIEW_READY` などのACTIVE状態は **上限5件のカウント対象であり、排他ロックではない**。active < 5 で対象日が営業日なら、Review待ち記事があっても対象日の記事を1本作る
- 「既存記事のReview待ち」と「今日の新規作成」は並行作業。片方を理由にもう片方を止めない
- Queueを `PUBLISHED` にしてよいのは、Supabase `publish_status=PUBLISHED` + `publish_verified_at` + `published_url` がある時だけ（= exact commitのDeploy to Xserver成功 + 本番URL確認済み）。`PUBLISH_COMMITTED` やGitHub commitだけでは推測で昇格しない
- active件数を数える前に、公開済みの取りこぼし（stale `REVIEW_READY`）を上記証拠で自己修復する
- 通知（LINE等）の失敗は記録するが、記事生成の停止条件にしない。未確認の通知をSENT扱いしない
- 対象日（営業日）の行が作られなかった場合は `ERROR_BLOCKED` として通知する（無通知停止禁止）
- **新規記事を作り始める判断はGateのdecisionだけ**。外部のChatGPT Scheduled Task等が独自に作る/止める判断をしてはならない。`REVIEW_READY` やactive件数を理由にした独自停止は禁止。残す場合は `DAILY_CREATOR_RUNBOOK.md` §5 の機械的フォールバックのみ
- 「CREATE_NEWを記録した」「Watchdogが失敗を通知した」は成功ではない。成功は対象日のQueue行を読み戻して確認できた時だけ
- 一次情報が未登録のレーンを「既存知識で十分」と推測しない（`dailyEditorialKnowledge.mjs` の登録が必要。無ければInterview）
- 最終PublishとGBP投稿は人間承認で停止する

## Blog / Column画像を扱うAIへの必須ルール

記事サムネイル、OGP、Editorial AI画像、Hybrid画像、Reference V2.xに関する作業を始める前に、必ず次の順で読んでください。

1. `editorial/EDITORIAL_IMAGE_RUNBOOK.md`
2. `editorial/editorial-image-system.json`
3. `editorial/REFERENCE_V23_HYBRID_FORMAT.md`
4. `lib/editorialHybridImageFormat.mjs`

画像システムのCurrent Truthは上記です。過去チャットや推測を正本にしないでください。

### 絶対に守ること

- 現行画像engineは `rev-column-reference-v2.3-hybrid`、安全Policyは **`editorial-thumbnail-v2.4`**、デザイン正本は **`editorial-thumbnail-v2.6-human-first` / `human-first-v1`**
- 通常の新規記事は **Automated Hybrid Image Operator (`github-actions-auto-operator-v1`)** がReview Readyまで進める
- 検証済み自動source正本は `editorial/automated-image-sources.json`。registry外の画像を無人生成で使わない
- `IMAGE_PREPARING` を単にAI Operator待ちとして放置しない。Job未作成ならBridge/statusが自動修復し、`.github/workflows/auto-editorial-hybrid-images.yml` が生成を担当する
- Thumbnailは **1200×675 / 16:9**
- OGPは **1200×630**
- Content Referenceは指定Driveルートの範囲だけを使う
- THE REV.ではない架空のジムへ置き換えない
- 未知のトレーナー、スタッフ、コーチを生成しない
- **実在トレーナー写真もBlog / Columnサムネイルには使わない**
- **顧客役は必須かつ1人だけ。男性・女性は直近履歴を見ながら偏らせない**
- トレーナー / スタッフ / コーチ風人物は実在・生成を問わず禁止
- **施設だけの完成サムネイルは禁止**
- **全身のトレーニング動作は人物切り抜きの後貼り合成を禁止。scene-aware生成/編集を使う**
- 人物の縮尺・遠近・床接地・接触影・光・器具接触が背景と自然に一致しない画像はREJECT
- 受付・通路など実際の利用として不自然な場所でトレーニングさせない
- 高難度動作はFLUX Kontext/Pro等のscene-aware photoreal editorまたは同等品質を優先し、使えない場合は静的シーンへ簡略化するかPREPARINGで止める
- 人間Reviewで違和感が出た場合は `manual_visual_rejection=true` として自動QAの高得点より優先してREJECT
- 直近4記事と同一画像・同一背景provenanceを再利用しない
- Thumbnail Copyは直近12投稿を比較し、完全一致だけでなく主要フレーズが近い言い回しも避ける。安全な候補がない場合は自動生成を止める
- 新規Editorial画像はHybrid生成が必須。source-lockは障害切り分け用fallbackとしてのみ残し、新規記事のPublish完成条件にはしない
- 生成シーンには日本語文字を生成させず、`rev-column-v24-fixed-overlay-v1` を `npm run image:render-hybrid-overlay -- <job.json>` で後段適用する。新規/再生成は `layout_variant=human-first-v1` を標準とし、`impact-v1` / `legacy-v24` は既存資産互換で保持する
- Human First V1では人物が視覚的注意の約60〜70%を担う主役。顔・表情・記事固有の行動を小さいカードでも読ませ、THE REV.背景はロゴ/受付/設備などで場所が分かる程度に残しつつ自然にぼかしてサブへ下げる。見出しは2カラム表示でも即読できる大きさを維持する
- V2.3 Hybrid完成前にV2.2 source-lockを診断用fallbackとして作ることはできるが、V2.4の新規Editorial記事はHybrid完成までPublish不可
- 一度READYになったHybrid画像を本文再同期だけでsource-lockへ巻き戻さない
- 最終Publishは必ず人間承認で停止する

### 変更後に必ず実行する検証

```bash
npm ci
npm run test:editorial-images
npm run test:phase-9
npm run test:daily-editorial-contract
npm run test:daily-editorial-state-machine
npm run test:daily-creator
npm run build:blog
```

### 新規Hybrid Job

通常の日次記事ではEditorial BridgeがJobを自動作成します。手動でJobをゼロから作らないでください。
自動Operatorの例外復旧や検証用途では、
`editorial/hybrid-image-request.template.json` を入力用に複製し、次で正規Jobへ変換します。

```bash
npm run image:compile-job -- path/to/request.json
```

詳細、失敗時の復旧、GitHub/Xserver/Reviewまでの流れは `editorial/EDITORIAL_IMAGE_RUNBOOK.md` を正本とします。

## Golden Typography V1（文字組みのみ）

- 文字契約: `lib/editorialThumbnailTypography.mjs`。承認済み見本: `editorial/typography-golden-reference/lock.json`。写真生成ルール・scene・cropは変更しない。
- wide / OGPは `golden-wide-v1`、GBPは独立した `golden-gbp-v1`。中心語を強調し、前後行・カテゴリは補助にする。
- 2026-10-03のユーザー指摘を反映した `centered-organic-v1`: GBPの文字は実測高さから左中央へ配置し、wideは専用中央配置。英字ラベルを省き、文字周辺の曲線fadeを使う。左上の白い枠へ戻さない。
- `composition_balanced` / `fade_integrated` を独立したVisual QC項目として必ず確認する。文字の可読性PASSだけでは構図の完成扱いにしない。人間による却下はPASSより優先。
- 任意の `typography_emphasis_text` は既存コピー内の中心語のみを指定する。比率ごとの `typography_override.<variant>.emphasis_text` も利用可。コピーは書き換えない。
- 新レンダーは原寸と実JPEGからの320px/400px previewを作り、機械QCとVisual Art Direction QCの両方が必須。旧承認済み画像は日時だけで失効させない。
- 追加検証: `npm run test:thumbnail-typography` / `npm run test:thumbnail-typography-browser`（Playwright 1.55.0 / Chromium / Noto CJK必須）。
