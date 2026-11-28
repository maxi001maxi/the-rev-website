# 2026-10-21｜記事メタ情報・編集QA（公開前）

## 正本と状態
- Proposal: TP-20261021 / 候補番号2 / Candidate: BT-20261020-DAILY-2
- 目標日: 2026-10-21（Ownerの依頼は2026-10-20。run_dateとtarget_dateを混同しない）
- 権限: GitHubの編集稿のみ。公開や公式Editorial DBの品質ステータス更新はしない。
- 想定slug: `evening-strength-training-sleep-timing`
- 正式記事ID: **未採番**（canonical pipelineでのみ発行）
- Article title: 夜に筋トレしても眠れる？寝る前の時間と強さを決める目安
- SEO title: 夜の筋トレは睡眠に影響する？寝る何時間前・強度の目安｜THE REV.
- Meta description: 夜の筋トレは睡眠に悪い？厚生労働省の睡眠ガイドや研究を基に、寝る何時間前までに終えるか、遅い日の運動強度と量の調整方法をわかりやすく解説します。
- 検索意図: 夜 筋トレ 睡眠 何時間前 / 寝る前 筋トレ 影響 / 夜の運動 強度
- Category: TRAINING
- 想定読者: 日中は仕事、夜しか運動時間が取れず寝つきも気になる人
- 独自性: 朝夕の優劣を押しつけず、終了時刻と運動量を個人の睡眠に合わせて調整
- CTA: 初回体験の予約は末尾に控えめに置き、本文で会員規約/料金の未確認主張をしない
- Brand: 「大人のための」乱用なし / 誇大な睡眠改善の保証なし / 医療的治療効果を標榜しない

## 実際に照合した一次・学術ソース
1. 厚生労働省「健康づくりのための睡眠ガイド2023」p.26。夕方や夜の運動は「就寝の約2〜4時間前まで」が目安で、軽い筋力トレーニングは中強度例として記載。https://www.mhlw.go.jp/content/001305530.pdf
2. Stutz et al., Sports Medicine 2019, 23 study systematic review; 全体で夜間運動の睡眠悪化を支持せず、寝る1時間以内の激しい運動には注意。https://pubmed.ncbi.nlm.nih.gov/30374942/
3. Frimpong et al., Sleep Medicine Reviews 2021, 15 study meta-analysis, 194 participants: 健康で良く眠れる成人では寝る2〜4時間前の激しい運動による全般的な睡眠悪化は認められない。対象は一般全人口でない。https://pubmed.ncbi.nlm.nih.gov/34416428/
4. Leota et al., Nature Communications 2025, 14,689 participants, 4,084,354 person-nights. 就寝4時間以内の高負荷運動と睡眠関連指標の悪化の関連。**観察研究であり因果関係・全員への閾値を証明しない**。https://doi.org/10.1038/s41467-025-58271-x
5. 厚生労働省 身体活動安全のポイント: 体調確認・ウォームアップ/クールダウン。https://kennet.mhlw.go.jp/information/information/exercise/s-00-008.html

## 内容監査（編集者の予備点検。独立QCと区別する）
- 「夜筋トレは一律NG」: 不採用
- 「4時間あけなければ眠れない」: 不採用（観察研究の過剰一般化防止）
- 「睡眠が必ず改善する」: 不採用
- 「23時就寝19時/21時/22時」の表: 事例。医療的絶対基準ではない旨を明記
- 高負荷と軽めの区別: 重量・セット数・限界までの追い込み・息の上がり方
- 当日睡眠不足、寝つき、翌朝の予定を考慮
- **未確認の独自店舗インタビューや口コミは記事内に作らない**
- Research/Sources preliminary checked. **Independent Editorial QC: NOT_RUN**
- Actual public web/render/browser QA: NOT_RUN
- Authenticated Preflight: NOT_RUN
- GBP copy/asset and original Xserver SHA confirmation: NOT_RUN
- Final publish: NEVER AUTOMATED

## 過去画像失敗からの回帰
2026-10-15 R7を合格比較対象とし、2026-10-18 R2/R3/R4/R6/R8で露見した「現物写真の背景改変」「設備位置改変」「人物が不自然」「本文と関係が薄い」「Generic phone-glance」「自動QCがOwner低評価をPASS扱い」を再発禁止にする。画像1シーンを3サイズに展開。費用制限で品質を下げない。

## 明確な本番ゲート
1. GPT選択リクエストが `APPLIED` → 公式Topic state machine `INTERVIEW_WAITING` 進行
2. **一次情報Interviewは実際の店舗方針回答が必要**。回答未取得なら `knowledge_gate` を偽装しない
3. 正式Writer → Editor → 独立QCの結果を本文SHAに結びつける
4. 実店舗原写真・Creative Brief・本番画像/3派生物・独立Visual QC・Xserver SHA検証
5. Supabase正式Draft/Google Sheets/Bridgeの同一content ID一致
6. Ownerによる認証付きReview Preflightで全チェックPASS。最終公開はOwnerのみ
