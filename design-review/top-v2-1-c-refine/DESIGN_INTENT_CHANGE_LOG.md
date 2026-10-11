# THE REV. TOP — C「空間から」ブラッシュアップ｜Design Intent & Change Log

2026-10-11 JST ／ **Owner採用済み（Visual Source of Truth）／本番実装は未着手／Production未変更**

> 2026-10-11 Owner Decision：本Cブラッシュアップ案を本実装に使うデザインとして採用。Hero文言・Section順序・色／書体／写真／余白／装飾は固定。採用後の唯一の差分は、Methodの代表紹介の下に控えめな内部リンク「担当トレーナーについて詳しく」（`#person` へ）を追加したこと（Owner決定5。レイアウトは不変）。実装方針は `handoff/` を参照。

- 検討画面：`design-review/top-v2-1-c-refine/index.html`（リポジトリ直下からローカルサーバーで表示。`../../assets/images/` の既存実写を参照）
- 単体ファイル版：`THE_REV_TOP_C_refine_preview_2026-10-11.html`（画像・CSS・JSを埋め込み。サイト内リンク `/price.html` 等はこの単体版では解決しない）
- 画面：`screens/`（1440／390 の Hero・全体、Trial、Person、Drawer、デモダイアログ）
- 本番GTM／GA4／`main.js` は読み込んでいない。予約・LINEはデモダイアログのみ（外部遷移・送信・計測なし）

## 0. 開始時の確認（入力の範囲）

1. **参照パッケージは未確認**：`C:\Users\hp\Downloads\…Reference_Package_2026-10-09.zip` はクラウド作業環境から読めず、Google Driveの検索でもC比較HTML・`c-1440/390` 画像は見つからなかった。**元C画面との直接照合は行っていない**。研究原本（Drive）も未読。
2. 使ったもの：本引き継ぎ書の具体仕様（C参照値・構成・文言・Owner確定事実）＋ main（`bde08c6`）の `index.html`／`price.html`／`solution.html`／`access.html`／`trainer.html`／`blog/`／実写素材。
3. **Production（therev-lab.com）は閲覧不可**（作業環境のプロキシがドメインを拒否）。本番の実表示は未確認。
4. Cの特徴として維持：全幅の実店舗写真Hero、明朝の三行H1、暖色の面、細い線と小さな英字ラベル、交互配置のChoice、暖色帯のMethod、下方のPerson、濃い暖色のAccess／Footer。
5. 公開しない範囲：commit／push／PR／deploy／GTM公開／予約・LINE送信／料金変更はいずれも未実施。

## 1. Design Intent & Change Log

| 区画 | 元Cから維持したこと | 変更したこと | 理由・根拠 | 区分 |
|---|---|---|---|---|
| Hero | `photo-lobby` 全幅、左の暗いグラデーション、Eyebrow・三行H1・Sub・Primary／Secondary・外部注記、下端線＋`TRAINING / BOXING / RECOVERY`＋「あなたの入口を見つける ↓」。H1 66px／lh1.5／ls.08em、写真center 55%、最大1260px・左右90px、Header 98px | 写真に薄い暖色の乗算レイヤー（10%）。スクロールしたらHeaderに暖色の面を敷く（透明HeaderのロゴがH1に重なるため）。Mobileは `photo-lobby-sp` を上62%に置き、壁の「THE REV.」サインと植物が見える位置で切り抜き、下を濃い暖色へ溶かして文字を載せる | 写真の寒色を暖色トーンへ寄せる。Mobileで文字が店名サインに被らず、店の実在が一目で分かるようにする | デザイン判断。文言はOwner指定どおり |
| Choice／Method | 3サービスを写真＋説明で交互配置（Boxingのみ左右反転）、Mobileは写真→説明の縦。Method帯 `#E3D6C0`、4段階、Training／Boxingの違い、代表名をここで示す | 各サービスに小さな事実タグ（マンツーマン／月額制、回数券、着替え不要・別料金）。リンクを具体化（月額プラン・入会金を見る／回数券の料金・有効期限を見る／酸素ルーム・DENBAについて見る）。Boxingは実写ではなく暖色の説明用線画（「実際の指導写真ではありません」と明記）。線画は丸い手足の柔らかい人物＋細線の道具で統一 | `photo-boxing` は実顧客写真の根拠未確定のため不使用。三つが「別メニュー」であることを操作なしで読めるようにする。「固定テストを全員に行わない」を Method の Training 説明に明記 | Owner確定事実（固定テスト不要・別料金）／デザイン判断（線画） |
| Voice／Trial | Voice：TrainingとBoxingの声を引用で。Trial：共通事実を常時表示、メニュー別はタブ、暖色の4段階図＋実際の手順 | Voiceを左右の段差で配置、引用文は明朝。Trialの共通欄に 3,300円（TOPで唯一の出現）／約60分／約5分前／店頭支払い（現金・クレジットカード・PayPay）／その場で決めなくてよい、を固定。タブ切替0.3秒、矢印キー・Home／Endに対応。JSなしでは3パネルを縦に全表示。Recoveryに耳・気圧の注意と `/solution.html` リンク | 価格の反復を一か所に集約（Owner希望）。G1の要点はタブの中に隠さない（受入基準）。60／50／45分の個別表示は繰り返さない | 確定事実（価格・時間・支払・手順・持ち物）／Owner希望（反復抑制）／デザイン判断（レイアウト） |
| Pricing／Person | Pricing：左に見出しと説明、右に料金の行、Trialと継続を分離、月2／月4の選び方への接続。Person：Pricingの後、顔の実写＋短い紹介＋経歴詳細へ | 料金行は「名称／種類」と「項目＝金額」を同じ行に置き、金額をJostで大きく。入会金は条件付きの補助行。Pricing内の予約ボタンを外し、予約はTrial（`home_trial` 候補）とFinalへ。Personの写真をCの180／92px → **Desktop 260×324px／Mobile 168×210px** の柔らかい角丸四角（`trainer-portrait`）に変更 | Owner指摘「小さすぎて顔が分からない」への対応。丸い切り抜きは腕組みとロゴ壁が切れて顔が小さくなるため四角を採用。`trainer-top` はラックの柱が顔に掛かるため不採用。下方配置と非全幅は維持 | 寸法はデザイン判断（引き継ぎ書の調整レンジ内）。経歴は main の `index.html` 記載のみ |
| Access／Questions／CTA | Access：実写＋濃い暖色の情報を左右、Mobileは縦。Questions：問い→手掛かり→記事、Desktop2列／Mobile1列。Final：予約＋LINE＋外部注記 | Accessの写真を店内ではなく `access-parking-approach`（川沿い道路側の駐車場入口）に変更し、キャプションを付与。駐車場の進入方向（国道24号線側から入れない）を正本どおり記載。Questionsは5問＋「コラムの一覧」の6枠目で2列を揃える。Finalに入口と植物の小さな線画 | 「店内写真の繰り返しでなく入口の理解につなぐ」指示への対応。ブログ一覧に置き換えず、問いごとの具体ラベルを維持 | 確定事実（住所・時間・駐車場）／デザイン判断（6枠目・線画） |
| Mobile／Motion | 390pxで縦の読み順。動きは短く少量 | Drawerナビ（開閉、Escで閉じる、リンクで閉じる、44px以上）。Hero CTAは縦並び全幅。Methodは縦の線でつなぐ縦ステップ。Trialの4段階は2×2。動き：タブ0.3秒、矢印・画像のhover、軽い表示遷移（JSが動く時のみ）。`prefers-reduced-motion` で全て無効化。Fixed CTAは導入しない | 自動カルーセル・スクロール固定・parallaxなし。JSなしでも全情報が読める | デザイン判断 |

補足：本文の補助文字色はC参照 `#7B6B5D` だと背景 `#F5EFE5` に対し 4.47:1 で小さな文字のAA（4.5）を下回るため `#716154`（5.19:1）に微調整。

## 2. 素材・リンクの確認記録

| 対象 | 結果 |
|---|---|
| `photo-lobby.webp`／`photo-lobby-sp.webp`／`photo-evolgear.webp`／`photo-oxyroom.webp`／`trainer-portrait.webp`／`access-parking-approach.webp`／正式ロゴ（`logo-full(-white).webp`） | main に存在、検討画面で表示確認 |
| `/blog/personal-gym-trial-checkpoints/`／`personal-training-frequency/`／`boxing-beginner-first-step/`／`training-how-hard-to-push/` | main に静的ページあり（タイトル確認済み） |
| `/blog/muscle-mass-not-increasing-progress-signs/` | main に静的ファイルなし。`sitemap.xml` と `admin/js/generated-page-catalog.mjs` に掲載（Editorial生成記事）。**本番の実在は未確認** |
| `boxing-beginner-scared-before-mitt-training` | main・sitemapに無し → 不使用（`boxing-beginner-first-step` を採用） |
| `/price.html#cat-training`／`#cat-boxing`／`#cat-recovery`、`/solution.html`、`/access.html`、`/trainer.html` | アンカー・ページの存在を main で確認 |
| Voice | `voice-04`（30代・Training）と `voice-01`（50代・Boxing）の画像内文言をHTML化。画像自体に「Googleに寄せられたクチコミをもとに、内容を損なわない範囲で要約」と記載があり、その注記を維持。**Google上の原文とは照合していない** |

## 3. Evidence Conflict（勝手に解消していない差異）

1. **Recoveryの気圧**：`solution.html` は「1.35気圧」固定の表現。Owner事実は「初めての場合等は約1.1から、状況を見て1.25、最大1.35まで調整可」。検討画面はOwner事実に沿った表現（全員がこの順序とは書かない）。公開前に `solution.html` との整合が必要。
2. **耳の違和感の連絡先**：`solution.html` は「インターホンでお知らせください」、Owner事実は「スタッフへ」。検討画面は「スタッフへ」。
3. **シャワー**：現行TOPの設備欄は「会員専用のシャワー」、Owner事実は「初回でもシャワー可」。検討画面はOwner事実。
4. **Recoveryの手順**：`solution.html` は「来店→確認事項の記入→入室→加圧・休息・減圧→退室」。Owner事実の「注意事項説明と所定の用紙記入・同意」を合わせて表記。会計の位置は正本で要確認。
5. **Voiceの原文**：表示文は要約版（画像内注記どおり）。原文照合は未実施。
6. **Boxingの入会金**：main の `price.html` は「入会金不要」。TOPでは記載せずリンク先へ委ねた。

## 4. CTA・計測（仕様記録のみ。接続は未実施）

| 配置 | `data-placement` | イベント | 状態 |
|---|---|---|---|
| Header予約 | `home_header` | `reserve_click` | 現行mainにあり |
| Drawer予約／LINE | `home_drawer` | `reserve_click`／`line_click` | 現行mainにあり |
| Hero予約 | `home_hero` | `reserve_click` | 現行mainにあり |
| Hero LINE | `home_hero_line` | `line_click` | **新規候補・未観測**（現行mainのHeroにLINEなし） |
| Trial予約 | `home_trial` | `reserve_click` | **新規候補・未観測** |
| Trial LINE | `home_trial_guide` | `line_click` | 現行mainにあり（位置はTrial内のまま） |
| Pricing予約 | （削除） | — | 現行 `home_pricing` の予約ボタンを外した。`home_pricing` は「すべての料金を見る」（`price_click`）に残る |
| Final予約／LINE | `home_final` | `reserve_click`／`line_click` | 現行mainにあり |
| Footer予約／LINE／Instagram | `home_footer` | 既存イベント | 現行mainにあり |
| Fixed CTA | （導入せず） | — | 現行 `home_fixed_cta` は検討画面に無い |

その他、`price_click` の配置値に `home_pricing_training／_boxing／_recovery`、`article_click` に `home_questions`／`home_pricing_frequency`、`recovery_click` に `home_trial_recovery` を**新規候補**として付与（未観測）。計測は CLICK-OUT ONLY のまま。`REV-EXP-2026-001` には触れていない。

## 5. 実表示・操作の検証（Chromium／Playwright）

- 1440×900 と 390×844（DPR2）で表示。横はみ出しなし、コンソール例外なし、外部（予約・LINE・GTM／GA）へのリクエストなし。
- H1は1つ、全画像にalt。Trialの3タブはクリック・矢印・Home／Endで切替、表示パネルは常に1つ。JS無効時は3パネル全表示。
- デモダイアログ：予約／LINEとも行き先URL・placement・イベントを表示、Escで閉じる。
- Mobile Drawer：開閉、aria-expanded、先頭リンクへフォーカス、内部リンクで閉じる。
- タップ領域：header／main のリンク・ボタンで 44px 未満なし。
- reduced motion：表示遷移を無効化し全要素を即表示。
- **未検証**：実機Safari／iOS、Android実機、スクリーンリーダー読み上げ、本番フォント配信下での表示（Google Fontsで表示）、本番ドメイン上の挙動。

技術的なPASSはOwnerのデザイン承認ではない。

## 6. 次に判断が必要なこと

1. 元C（`THE_REV_TOP_v2_1_Visual_Comparison.html`）または `c-1440-*.png`／`c-390-*.png` との並べ比較（今回未照合）。
2. Person写真サイズ（260／168px・角丸四角）が「前半の主役でも豆粒でもない」かのOwner確認。
3. Boxingを線画のままにするか、許諾済みの指導写真を用意するか。
4. Evidence Conflict 1〜4 の正本確定（特にRecoveryの気圧・連絡方法・シャワー）。
5. 新規placement（`home_hero_line`／`home_trial` 等）を採用するか。
