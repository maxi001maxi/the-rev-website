# THE REV. Editorial Image Improvement v1
## 現行フローを壊さず「75点の安定」から一段上を目指す段階開発

**Current Truth:** 2026-10-14 / 機能オーナー: Editorial Image System
**方式:** 既存 Human First V2.6 + Source/Scene Grounding v1 を正式ラインとして維持し、改善候補は SHADOW → offline paired review → owner approval → 限定導入で試す。
**初期状態:** `EDITORIAL_IMAGE_VARIATION_V1_MODE` は未設定 = **OFF**。現在の無人画像生成、画像QC、出版Gate、GAS、LINE運用は変えない。

> 75点・85点は改善目標の比喩であり、測定済み品質スコアではない。生成画像の印象は実物比較とオーナー評価で初めて判定する。

## 1. 現在の守るべき土台（回帰禁止）

| 領域 | 絶対に変えないもの |
| --- | --- |
| 実店舗 | 指定Drive rootに由来しrepo mirror / SHA256 / scene inventoryで確認済みのTHE REV.背景。架空ジム、壁・窓・器具移動禁止 |
| 人物 | Human First、顧客役1人、トレーナー/スタッフ不在。人物と実環境の距離・光・影・動作が自然 |
| デザイン | `editorial-thumbnail-v2.6-human-first` / 固定Golden Typography。煽らない、落ち着いたEditorial copy |
| 納品 | Thumbnail 1200×675、OGP 1200×630、GBP 1200×900。同じ承認済みsceneから派生 |
| 類似防止 | 直近4記事の背景再利用制約、直近12記事のscene fingerprint、コピー履歴の制約 |
| 安全・品質 | Source/Scene Grounding, 独立マルチモーダルVisual QC, human rejection, fail-closed |
| 公開 | Xserver byte check、CMS Review、最終Publishはオーナー承認のみ。GAS/記事QCを迂回しない |

## 2. 画像の課題と仮説

1. 現行の `planGroundedScene` は記事の種類ごとに候補が1〜2種類程度。安全だが構図・動作が反復しやすい。
2. 強い情景指示は人物の感情を伝えやすいが、背景がモデルによって再構成されやすい。2026-10-15用の試験R1〜R3では実背景改変・場面不一致・GBP改行が実際に拒否された。
3. 単に選択肢を増やすと、施設と行動の意味が一致しない危険も増す。source inventoryの許容行動と記事の意図に合う候補しか提案しない。
4. コピーの語句分割・小画面可読性はシーン品質と独立して評価する。`auditEditorialCopy` の警告は事前確認の補助であり、実画像Visual QCに代わらない。

## 3. 開発フェーズと作業の順序

| Phase | 開発内容 | 成果・合格条件 | 実運用への影響 |
| --- | --- | --- | --- |
| **P0 Baseline Lock** | 既存仕様、実背景、直近画像、画像QC・生成費を固定。成功・失敗例をタグ付け | 現行のCIを維持。無承認のエンジン変更なし | なし |
| **P1 Variety Shadow** | 記事ごとの構図/行動/視覚役割の反復、履歴欠損、コピー不自然改行を自動診断。許容scene候補を比較用に列挙 | 新規純関数・自動単体テスト。OFF時にジョブ差分なし。SHADOWでも`scene_plan`変更なし | **OFF既定、SHADOWは診断情報だけ** |
| **P2 Scene Brief Trial** | 記事5本×現行1案・改善1〜2案。感情・動作・理由の具体化を試験。実画像の背景条件は同じ | 類似率・不自然な動作・情景の意味をブラインド対比較。悪化例を記録 | offline / 承認前に本番へ採用しない |
| **P3 Source Fidelity Trial** | 記事3本で現行方式と「写真の形状保持優先」編集方式をA/B比較。モデル変更ではなく実背景の保持精度を重視 | 元写真と完成写真の設備/壁/窓/接地/光の人間監査。Visual QCを満たすこと。追加API費用も記録 | offline / 既存方式は保持 |
| **P4 Composition & Copy** | 構図レパートリー＋同系連続の回避。Thumbnail/OGP/GBP別の改行・強調語・縮小時可読性を検証 | 直近6記事の構図/行動偏りを低減、Golden Typographyの実表示QC全PASS | opt-in限定 |
| **P5 Canary** | オーナーが採用可と判断した差分のみ、公開対象を限定して切替。失敗は既存方式に戻す | 現行比で独立QC PASS率が悪化しない、空間一致100%、再生成回数・費用が許容範囲、オーナーが改善を認める | 承認後に限定導入 |
| **P6 Standardize** | 成功した項目だけを標準に取り込み、runbook・golden cases・失敗学習を更新 | 直近画像に回帰なし、CI/GAS/画像ジョブ/Review整合を確認 | 承認後のみ正式化 |

フェーズは**日付固定ではなく合格証拠で移行**する。過去の実績から「85点になった」と自動宣言しない。

## 4. P1（今回実装）の動作契約

- `lib/editorialImageVariationV1.mjs`: scene fingerprint 6軸・直近6記事の反復診断、直近12記事とのsemantic similarity、コピーの前処理チェック、許容シーン候補の提示。
- `lib/editorialAutomatedHybridImage.mjs`: `EDITORIAL_IMAGE_VARIATION_V1_MODE=SHADOW` の**ときだけ**新しいジョブJSONに `image_variation_shadow` を付ける。
- `OFF` または未設定ではジョブ出力、asset version、scene plan、image source、API呼び出し・画像QC・公開の挙動が従来と同じ。
- `SHADOW` は許容候補を **offline research** として記録する。候補を自動採用しない。実画像の品質点、画像QC合格、Publish Readyの代わりにならない。
- `ENFORCE` などその他の値は必ず`OFF`。勝手な本番昇格は許可しない。
- 同じslugの履歴版を重複カウントしない。履歴が欠けていたら `HISTORY_FINGERPRINT_INCOMPLETE` と記録し、不明なまま「十分に多様」としない。
- SOURCEの許容行動・zone・source hashから外れた画像案を生成しない。候補は現行の`source_id`と`source_sha256`に結び付ける。

### 既存画像ジョブの診断（読み取り専用）

`node scripts/inspect-image-variation-v1.mjs editorial/hybrid-image-jobs/personal-gym-first-session-pain-health-history.json`

標準出力に実ジョブのSOURCE照合、直近履歴、構図候補、コピー警告をJSONで出す。Driveや外部APIは使わず、既存のジョブ/QA/画像/公開状態を一切変更しない。個別記事のQC合否や公開準備完了を意味しない。

### テスト

```bash
node --test scripts/test-editorial-image-variation-v1.mjs
npm run test:editorial-images
npm run test:phase-9
npm run test:daily-editorial-contract
npm run build:blog
```

CIは既存の Phase 9 Check へ追加。P1導入による画像の追加生成や外部API費用は発生させない。

## 5. 写真の比較評価（P2以降）

評価方法:
- 記事タイトルと画像の組で **A/Bを順不同・匿名** に提示。可能なら同一記事/同一素材で比較。
- 人間が5軸を各1〜5で評価: **記事の意味 / 情景の独自性 / 人物の自然さ / THE REV.らしさ / コピー可読性**。
- 安全性は点数と分けた**必須Gate**: 実背景構造、許容動作、人物数、トレーナー不在、実画像QC、場所の意味。
- 判断は平均だけでなく、単一項目の悪化・QC不合格・再試行数・推定API費用を確認。
- P2で5記事、P3で3記事。採用は原則**少なくとも多数の画像で現行以上**かつ、品質Gateを全件通過したときのみ。
- バラエティ拡張によって事故率が上がった場合は理由を記録し、現行ラインへ戻す。

## 6. 1記事の日次ワークフロー（正式ラインは不変）

```text
記事Draft / 承認済みInterview
  ↓
既存の verified source registry + 直近履歴
  ↓
正規 planGroundedScene（source/zone/動作/記事意図）
  ├── OFF [既定]    → 現行の安全な画像フローだけ
  └── SHADOW [任意] → 反復診断・コピー警告・許容別案をジョブに記録
                        │（別案は使わない、公開判定に使わない）
  ↓
従来の Human First scene 生成
  ↓
既存Golden Typography（3比率）
  ↓
独立Visual QC + Source/Scene Grounding
  ↓
GitHub / Xserver exact assets検証
  ↓
記事QC + CMS Review Ready
  ↓
最終Publishは人間が承認
```

## 7. 開発運用ワークフロー（毎Phase共通）

1. main実装と最新成功画像を証拠で読み、現行の仕様を固定する。
2. 保護されたfeature branchで、小さな差分＋失敗例の再現テストを作る。
3. 新機能は最初OFFか純粋な診断のみ。既存の生成/画像QC/公開経路を置換しない。
4. 単体テスト、canonical image validators、Phase 9 CIを通す。
5. CI成功後にmainへ統合。ただし**merge ≠ GAS反映・Vercel本番反映・画質合格**。
6. 実画像比較を経て、オーナーが受け入れた差分だけに本番用の段階切替を追加する。
7. QC不合格の場合は誤ってREADYにせず失敗理由を記録し、対象slugの試験を保留する。すでにREADYの資産を破壊しない。

## 8. 2026-10-15記事との関係

`BLOG-20261015-fac1fd` は既存の本番原稿QCと画像QCで止まっていた**別の復旧案件**。改善研究を理由に既存記事のステータス、オーナーのInterview、画像不合格履歴を改ざんしない。P1のコミットだけで記事が公開可能になることはない。

## 9. Phase 2｜5記事の実画像A/B比較（2026-10-14開始）

**試験台帳**: `editorial/experiments/image-quality-p2/cohort.json`。対象5件は既存の independent Visual QC / Source-Scene Grounding PASS の画像が存在する記事だけを採用。B用の元ソース・記事見出し・人物属性・レンダラーはAと同じ。

| ID | 記事 | 比較する情景変更 |
|---|---|---|
| p2-01 | 初回体験はどれを選ぶ？ | 施設を眺める → 自分で選択肢を比較する |
| p2-02 | 運動前のストレッチ | 正面寄りの準備 → 横寄りの軽い動的動作 |
| p2-03 | DENBA機器・マット | 製品を間近で見る → 人と実機の距離が自然な横構図 |
| p2-04 | 猫背・筋トレ | 休息姿勢 → 姿勢を意識して準備する動き |
| p2-05 | 初心者のジム選び | ベンチで準備する → 安全距離から実設備を確認する |

**P2-A 現行画像の固定**: `node scripts/prepare-editorial-image-p2.mjs` を実行。5件のslug、asset version、source/thumbnail SHA256、元QCのPASS、現行fingerprintを比較用に読み出す。元ファイルは一切変更しない。

**P2-B 情景改善候補の審査**: 変更はscene fingerprint／情景の具体性のみ。5記事の同じ実素材を使い、許可された動作、source inventory、記事との意味の一致、直近12記事の重複を必ず確認する。旧履歴にfingerprint欠落があれば `requires_history_review=true` のまま記録し、既存の反復がないと推測しない。Bの見出しを新しく変えて公平性を損なわない。

**P2-C 実画像の制作・QC**: B画像は *別のoffline実験出力領域* へ生成する必要がある。現時点の`prepare-editorial-image-p2.mjs`は**ブリーフ作成専用であり、画像生成を実行しない**。Bが生成される前にA/Bの勝敗を宣言しない。画像ができたら現在の独立Visual QC、Source/Scene Grounding、3比率の可読性をすべて審査。公開用画像ジョブの上書き・Supabase READY操作・Xserver配置は禁止。

**P2-D ブラインド評価**: `node scripts/prepare-editorial-image-p2.mjs --review-template`。B画像とQCが揃った時点でA/Bの提示順だけをランダム化し、5軸（記事との一致、情景の独自性、人物の自然さ、実店舗らしさ、コピーの可読性）を1～5点で採点する。実店舗構造、動作、人物数・トレーナー不在、光の整合性は**別の必須ゲート**。5画像の相対比較を、制作側の自画自賛スコアで代替しない。

**P2-E 採用条件**: 5記事中4記事以上で総合的に上回り、自然さ・実店舗らしさ・コピーを悪化させず、すべて独立QCを通過したときに限り、**オーナー評価へ提案**。`assessP2PairedResults` は条件を満たしても `adopt:false`。P5 Canaryと本番反映は別の承認フェーズ。

**検証**:
```bash
npm run test:image-phase2
npm run image:prepare-phase2
npm run test:editorial-images
```

**禁止**: B未生成での品質改善宣言／ソース違い比較／元画像の差し替え／他の記事の自動再生成／本番QCを飛ばす比較／P2を理由とした自動Publish。

### P2実画像制作の専用ランナー（手動・本番非接続）

`.github/workflows/editorial-image-p2-offline-pilot.yml` は **workflow_dispatch のみ**。自動記事制作／定時トリガー／Xserver展開／GitHub本番画像のcommitは行わない。

- GitHub Actions → **P2 Offline Image Pilot** → **Run workflow** を開く。case_id は `p2-01`〜`p2-05` の1記事か `all`（5記事）から選ぶ。
- 旧ジョブは読み取り専用で参照。各ケースのB用scratch jobは `scripts/materialize-editorial-image-p2-job.mjs` が新しいslug、別asset version、別QA report、別状態ファイルで生成。
- 検証済み実THE REV.ソース、同一Editorial Copy、同一人物属性、同一Human First Overlayを使い、違いは承認対象の情景指示だけ。**1ケース画像生成1回まで**、5記事まとめても画像生成最大5回に制限する（画像QC/API利用自体には別途課金の可能性）。
- 成功／不合格のいずれも `p2-offline-image-comparison-{run_id}` アーティファクトに可能な証拠を保持。採用画像は自動で本番へ昇格しない。
- 独立QC不合格なら判定を変更せず、対象記事の試験画像だけREJECTとして記録。A画像を消さない。
- GitHub Actionsの手動実行が現環境からできない場合は、Workflow作成だけを画像生成実施と誤認しない。5枚すべての実画像制作・独立QC・人間採点の完了を確認してから「5記事比較完了」と言う。

実行時間・API費用の見積もりや統一的な85点評価は、自動で推測しない。結果の採用はP2-Eの判定後、オーナーの明示承認を要求する。

### P2独立QC証拠とブラインド画像（2026-10-14追加）

`scripts/package-editorial-image-p2-results.mjs` は元Aと出力Bの画像バイト、独立画像QC、Source/SceneのSHA256、実THE REV. Drive provenance、原稿・見出し・顧客属性を照合する。実画像が無い、独立QCがFAIL、Source hashが異なる、状態が`READY_CANDIDATE`でない場合は**PAIR_READYにしない**。

GitHub Actionsは次のように別々のartifactを保存する。採点者が閲覧するのは**匿名画像とreview-sheetだけ**。

| artifact | 中身 | 閲覧タイミング |
| --- | --- | --- |
| `p2-blind-review-<run_id>` | 匿名の`image-01.jpg`/`image-02.jpg`と評価用シート。A/Bをランダム化 | 比較評価時 |
| `p2-offline-image-comparison-<run_id>` | 試験の元画像・改善画像・QAとハッシュ・生成失敗記録 | 技術監査時 |
| `p2-unblind-key-<run_id>` | 01/02の正体と画像SHA256。採点中は開かない | **全5件の評価を提出してから** |

作成手順は `node scripts/package-editorial-image-p2-results.mjs all`。5件が完了していない場合も失敗を明示するが、画像未作成やQC不合格を成功に書き換えない。

この方式でも、実際の人間評価はまだ行われていない。画像5件のA/B比較が完了したと述べられるのは、**実画像QCをすべて通過し、匿名比較の採点まで完了した場合のみ**。
