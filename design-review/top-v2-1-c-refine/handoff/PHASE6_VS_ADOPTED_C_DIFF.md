# Phase 6 Final Implementation Spec ↔ 採用C（TOP v2.1 C Refine）差分整理

2026-10-11 JST ／ 採用C = `design-review/top-v2-1-c-refine/`（commit `b397e93`）

## 0. 根拠の範囲（先に読む）

- **Phase 6 Final Implementation Spec の原本は読めていない。** リポジトリ内に無く、Google Driveの検索でもTOP用のPhase 5 Blueprint／Phase 6 Specは見つからなかった（Drive上の「Phase 6」はBoxing／Recovery系の別文書）。
- そのため本書の「Phase 5/6側の記述」は、**Owner提供の引き継ぎ書（2026-10-09）が「既知の差異」「旧資料の更新」として明記した内容**に限る。原本にあるそれ以外の項目は未確認＝差分に含めていない。原本が提供されたら §1 の表を原本の章番号で照合し直すこと。
- 「採用C」側は実ファイル（`index.html`／`review.css`）と `DESIGN_INTENT_CHANGE_LOG.md` に基づく確認済み事項。

## 1. Phase 5/6（引き継ぎ書記載の差異）→ 採用C

| # | 項目 | Phase 5/6（引き継ぎ書の記載） | 採用C | 実装上の帰結 |
|---|---|---|---|---|
| 1 | 第一候補の方向 | 「Aが第一候補」（元比較レポート・再設計判断書） | **C「空間から」**（Owner採用） | Aの段差カード／緑の写真コラージュHeroを混ぜない。v3 Wireframe Brand Integration／Current Base Refinement／PR #192のv2.2／redesign-top-v1は雛形・CSS正本にしない |
| 2 | Hero H1 | 「新大宮で、自分に合う運動を。」が固定Hero | **「動く時間も、休む時間も、ここから。」**（三行） | 旧H1へ戻さない。Eyebrow `奈良・新大宮 ｜ 完全予約制パーソナルジム`、Sub三行、Primary `初回体験を予約する`、Secondary `LINEで相談する`、注記「予約は外部サイトでメニューと日時を選びます。」 |
| 3 | Heroの価格 | Heroに体験価格（3,300円）を繰り返す | **Heroに価格・手順・実績バッジを置かない** | Heroの `初回体験 ¥3,300（税込）` を**削除**（現行mainのHero注記にも存在） |
| 4 | 価格の反復 | Hero／各サービスカード／Pricingで体験価格を反復 | **TOPの3,300円は体験区画の共通欄の一か所のみ** | 現行mainの `home_pricing` 区画の「初回体験 ¥3,300」大きな行と注記、Finalの `初回体験 ¥3,300（税込）`、Hero注記内の3,300円は**すべて削除**（可視テキストのみ。JSON-LDは保持）。Recovery 30分3,300円はTOPで省略（`/price.html#cat-recovery` へ） |
| 5 | 人物の位置・大きさ | 人物をChoice直後に大きく配置 | **下方（Pricingの後）に、顔が分かる大きさ**（Desktop 260px／Mobile 168px、角丸四角） | 元C比較の180／92pxは拡大済み。巨大な全幅人物写真へ戻さない。Methodでは名前と指導方針だけを先に示し、詳細は下方Personへ（Owner決定4・5） |
| 6 | 体験（Trial）の見せ方 | G1重要＝三メニューの説明を同時に長く表示 | **共通要点は常時表示、メニュー別の準備と手順は3タブ** | 共通：3,300円／約60分／約5分前／店頭支払い／その場で決めなくてよい。個別：服装・持ち物・実際の流れ。JS無効時は3パネル縦表示 |
| 7 | 60／50／45分 | メニュー表示の分数がTOPに出る可能性 | **TOPは共通の「約60分」のみ**。60／50／45は予約画面の正式メニュー表示で別指標 | 現行mainの `trial-guide`（Training 60分／Boxing 50分／Recovery 45分／「予約枠はいずれも60分」注記）は**削除**。TOPに60／50／45を出さない |
| 8 | Boxingのビジュアル | `photo-boxing` を候補としうる | **暖色の説明用線画**（実写の根拠未確定） | `photo-boxing.webp` を使わない。線画SVGは検討HTMLからそのまま移植 |
| 9 | Recoveryの扱い | 現行TOPは独立の詳細セクション（1.35気圧の仕様表） | **Choice内の1サービス＋Trialタブ内の流れ／注意** | `solution.html` の気圧表現とOwner事実の差はEvidence Conflict（`DESIGN_INTENT_CHANGE_LOG.md` §3）。TOPからは詳細表が消える |
| 10 | 計測・CTA配置 | 旧Phase 6のCTA配置（CSV／CTA Map） | 下記 §3、および[方針書](./IMPLEMENTATION_POLICY_PRESERVE_MAIN_CONTRACTS.md) | 配置名は「既存の実測値」と「新規候補」を分けて扱う |

引き継ぎ書が明示した追加の更新（採用Cに反映済み）：Pricingの月2／月4の整理と記事への接続は**維持**、同じ箱の連続を避ける（サービス＝写真と説明の交互配置、Trial＝左固定欄＋右タブ、Pricing＝表形式の行）、Fixed CTAの導入は最終確定ではない（Cは未導入）。

## 2. 現行main（`bde08c6`）→ 採用C：コンテンツの増減

| 現行mainのTOP区画（`id`／class） | 採用Cでの行き先 | 区分 |
|---|---|---|
| Hero（`.hero`、H1「鍛えるだけで終わらない。整えるまでが、THE REV.」、`TRAIN. CONDITION. RECOVER.`、価格注記） | C Hero（新H1、価格注記なし） | **置換** |
| 実績ストリップ `.trust-strip`（約5,000／完全予約制／TRAINING+RECOVERY） | 削除。「約5,000セッション」はPerson内の経歴行へ（個人の累計指導セッション） | 削除／縮小 |
| サービス `#service`（3サービス） | Choice `#service`（写真と説明の交互配置。リンク名を具体化） | **置換（idは維持）** |
| 共感 `.empathy`（4つの悩み） | 削除（Methodの「目的を聞く→状態を知る…」が役割を引き継ぐ） | 削除 |
| Voice `#voice`（画像5枚の横スクロール） | Voice `#voice`（HTMLテキスト2件：Training 30代／Boxing 50代） | **縮小・HTML化**（残り3件は未使用） |
| Trainer `#trainer`（3写真＋経歴） | Person `#person`（1写真＋経歴行） | **置換（位置はPricingの後へ）** |
| リカバリー `#recovery`（1.35気圧の仕様表） | Choice内Recovery＋Trialタブ内 | 削除／統合 |
| 設備ミニ `#facility-mini`（プライベート・シャワー・水素水） | 削除。シャワーは体験タブ内の持ち物欄（「初回でもシャワーを使えます」） | 削除／統合 |
| Pricing `#pricing`（体験3,300円行＋継続料金＋`trial-guide`＋予約ボタン） | Pricing `#pricing`（継続料金のみの表、予約ボタンなし）＋ Trial `#trial`（体験） | **分離・再構成** |
| FAQ `#faq`（9問アコーディオン、`faq_open`） | Questions `#questions`（問い5＋コラム枠、記事リンク） | **置換（機能変更）** |
| Access `#access` | Place `#place`（写真＋濃い暖色の情報） | **置換** |
| 最終CTA `#contact`（3,300円、本文、予約＋LINE） | Final `#final`（本文、予約＋LINE、価格なし） | **置換** |
| フッター | Footer（C見た目。リンク・法定3リンク・Instagram・LINE・予約） | **置換** |
| スマホ固定CTA `.rev-fixed-cta`（`home_fixed_cta`） | **未採用**（要判断：handoff §9-1） | 削除（要承認） |
| ドロワー `#revDrawer`（`home_drawer` 予約／Instagram／LINE） | C見た目のドロワー（予約・LINE。Instagramは要判断） | 再スタイル |

## 3. CTA・配置の差（要約。詳細表は方針書 §3）

- **維持**：`home_header`／`home_hero`／`home_final`／`home_footer`／`home_drawer`（予約・LINE）、`home_service_training`／`_boxing`（`price_click`）、`home_service_recovery`（`recovery_click`）、`home_voice`（`review_click`）、`home_trainer`（`trainer_click`）、`home_access`（`access_click`）、`home_trial_guide`（`line_click`）。
- **削除**：`home_pricing` の**予約ボタン**（`home_pricing` の `price_click`「すべての料金を見る」は残す）、`home_recovery`、`home_fixed_cta`（要承認）。
- **新規候補（観測済みではない）**：`home_hero_line`、`home_trial`、`home_trial_recovery`、`home_pricing_training`／`_boxing`／`_recovery`、`home_pricing_frequency`、`home_questions`。

## 4. 差分が示す実装上の主なリスク

1. 価格3,300円の**削除漏れ**。現行mainの可視表示は `index.html` の L157（Hero注記）／L433（Pricing体験行）／L456（Recovery 30分行：TOPでは省略）／L471（Pricing注記）／L544（Final）。実装後に `3,300` を全文検索し、**可視テキストはTrial共通欄の一か所のみ**であることを確認。なお JSON-LD の `"priceRange": "¥3,300〜¥60,500"`（L48）は構造化データであり価格変更ではないため**そのまま保持**する。
2. `reserve_click` はhrefが `cl.gyms.jp` で始まる時のみ送信（`main.js`）。デモの `#demo-cta` を戻し忘れると**計測が無音で欠落**。
3. `section_view` の対象セレクタ（`.trust-strip`、`.empathy`、`#recovery`、`#faq`、`.trial-guide` 等）が消えるため、`initSectionTracking` の `home` 定義を新セクションへ更新する必要がある（方針書 §4）。ここは**主要な計測契約の変更点**で、変更を最小に・意図を記録する。
4. `/#faq`、`/#service` を指す内部リンクがブログ等に約38件ずつ。`#faq` は新構成に存在しない。
5. 60／50／45分（予約画面の正式表示）と「約60分」は別指標。TOPに混ぜない。
