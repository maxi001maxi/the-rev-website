# TP-20261021｜本番制作への引き継ぎ（2026-10-20）

## 現状の分離
- User選択：候補2、2026-10-21対象（ユーザー指定題名）。前回確認時Topic選択APPLIEDでINTERVIEW_WAITING。
- User回答：2026-10-20のChatGPT会話にて受領。
- GitHub隔離ブランチ：本ディレクトリのARTICLE_DRAFT.mdを回答に合わせて改訂済み。
- 本番Supabaseの回答キューへの登録：未確認。接続先ツールの安全性チェックで操作がブロックされているため、APPLIEDやAPPROVEDと表示しない。
- Google Editorial Sheets：直近READ時点では対象記事のQueue行は見当たらない。これはSheetの観測であり、DBの最新状態の断定ではない。

## Owner回答（要旨）
1. 夜しか運動時間がないなら、運動自体を諦めるよりも軽めの内容で始める。就寝直前の重いウェイト・激しいトレーニングには注意する。THE REV.独自の「何時間前まで」基準は未設定なので、一般研究の目安を説明する。
2. 重いウェイトに対し、ウォーキングや軽い運動への調整を提案できる。ただし「軽いランニングなら必ず眠れる／睡眠の質が高まる」は未検証。実際の顧客に反復して起きた具体例は未確認。

## 正規の次工程（バイパス禁止）
- official `editorial_gpt_operator_requests` へ「TP-20261021」「action=answer」「2つの回答」を重複しないキーで投入し、canonical Topic APIが処理してAPPLIED / APPROVEDになったことをreadbackする。
- 既存Supervisorが26_DAILY_EDITORIAL_QUEUEを作り、Writer・Editor・独立QCを回し、同一記事IDをSheets/Bridge/Supabaseで照合する。
- 画像用実店舗原写真の保全を検証し、設計→画像1シーン→サムネ/OGP/GBP→独立Visual QC→Xserver SHA検証。Owner拒否履歴を自動PASSに使わない。
- Auth済みAdminの実際のpreflightを通す。最終Blog PublishとGBP投稿はOwnerだけが行う。

## 他の記事との混同禁止
2026-10-18の記事`BLOG-20261018-082d82`は別件。レビューURL、記事ID、画像Job、画像READYを流用しない。
