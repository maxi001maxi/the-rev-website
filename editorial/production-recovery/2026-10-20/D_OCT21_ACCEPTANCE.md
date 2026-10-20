# 10月21日記事の実案件受入

Content `BLOG-20261021-4ac8fd` / Proposal `TP-20261021` / CMS Draft `ac869d7c-c6b8-4d15-b3a0-e8b6c0963f47`。Slug `night-workout-sleep-timing-intensity`。元のCMS body SHA `d56731283b10f02461a1475089d9d0aa17a415396f3b160aa77e7fe547a5742a`。

- [最終候補本文](../../prepublication/2026-10-21-evening-strength-sleep/ARTICLE_DRAFT.md)。原稿を作り直さず、研究対象・限界、一般的目安、Owner発言の帰属を修正した。
- [確認済み一次資料](../../prepublication/2026-10-21-evening-strength-sleep/VERIFIED_RESEARCH.json)：MHLW睡眠ガイド2023印刷p26、Stutz2019公開抄録、Frimpong2021公開抄録、Leota2025本文。観察研究と因果、入眠時刻と入眠潜時、筋トレ負荷指標の限界を区別。
- [Owner回答](../../prepublication/2026-10-21-evening-strength-sleep/APPROVED_INTERVIEW.json)：Supabaseで承認・回答・Queue作成を確認した原文。
- 本文の第1回実API独立QCは19/20、pass=false、source_unverified=true。氏名/役職、生理説明、販促への移行を指摘。第1回を `INDEPENDENT_QC_V082_INITIAL.json` に固定し、この3点を修正。異なる本文hashに限り合計2回を上限として再QC。Editor自己評価91は独立合格の代わりにならない。
- 画像：既存run2回とも不合格。[実QC](OCT21_REJECTED_QC.json)、[3形式SHA付き隔離manifest](OCT21_REJECTED_MEDIA_MANIFEST.json)。追加生成0。実画像を開き、原写真・R7との相違を確認した。失敗画像はREADYにしない。
- [画像設計の更新](../../prepublication/2026-10-21-evening-strength-sleep/IMAGE_CREATIVE_BRIEF.md)：実店舗原写真とSHAを確認した。人物領域・3クロップの主題伝達と編集方式が未検証で、無料設計もBLOCKED。別画像版を作って既存上限をリセットしていない。
- CMSは読取バックアップを取得。`status=draft / NOT_PUBLISHED / noindex=true / editorial_sync_hash=null / bridge_synced=false`。正規Bridge経由の本文更新は未実施。重複登録もしていない。
- GitHub/Xserverの読取probeは `REAL_DATA_PREFLIGHT.json` が証拠。候補コードが取得済みSupabase snapshotを評価した結果であり、認証済み本番Admin APIの成功ではない。
- 本番Console実アクセスは `/admin/login/` に遷移。認証後のPC/スマホ・予約リンク・Reviewボタン状態は未検証。PublishとGBP投稿は一切していない。

**受入A：BLOCKED。READY_FOR_OWNER_PUBLISHではない。** 本文QC実結果の確認、画像編集方式の検証、限定追加生成枠、独立Visual QC合格、3形式SHAと配信、正式CMS統合、認証済み最終Preflightが残る。

初回読取Preflightはsnapshotのeditorial_source取得漏れで手動記事と誤判定したため無効。再読取で制作元を確認し、Editorial IDがあるのに制作元が不足するケースを回帰に追加した。初回は実案件合格の証拠に使わない。GitHub画像実体なし・配信先3形式404は独立した実測結果。
