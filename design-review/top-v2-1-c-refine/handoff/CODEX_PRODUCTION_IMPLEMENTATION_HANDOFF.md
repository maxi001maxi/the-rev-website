# THE REV. TOP v2.1 C Refine — Production Implementation Handoff（Codex向け）

作成：2026-10-11 JST ／ 作成元ブランチ：`claude/the-rev-top-v2-1-c-design-4k6uwo` ／ 保存commit：`b397e93`（デザイン）＋ 本handoff commit

**状態：Owner採用済みデザイン／本番実装は未着手／Production未変更／main未merge。**
関連文書：[Phase 6との差分](./PHASE6_VS_ADOPTED_C_DIFF.md) ・ [実装方針：mainの機能・計測契約の維持](./IMPLEMENTATION_POLICY_PRESERVE_MAIN_CONTRACTS.md)

---

## 1. Owner Decision（2026-10-11、固定事項）

1. Heroは「動く時間も、休む時間も、ここから。」を採用。
2. 旧Phase 5の「新大宮で、自分に合う運動を。」へ戻さない。
3. Section順序は現在のC案を維持。
4. Methodで代表の指導方針を先に説明し、詳しいTrainer紹介は現状の下方配置を維持。
5. Methodに「担当トレーナーについて詳しく」の控えめな内部リンクを追加してよい（**追加済み**。`#person` へ。レイアウトは不変）。
6. 現在の色・書体・写真・余白・装飾の方向性を保持。

今回の範囲は**デザイン保存とこのhandoff作成まで**。以下は禁止のまま：main merge／Production deploy／価格変更／GTM公開変更／予約システム変更。

## 2. Visual Source of Truth と、その読み方

| 役割 | 正本 | 備考 |
|---|---|---|
| **見た目・構成・文言・寸法（Visual SoT）** | `design-review/top-v2-1-c-refine/index.html` ＋ `review.css` ＋ `review.js` | 同ブランチ。単体版 `THE_REV_TOP_C_refine_preview_2026-10-11.html` は画像埋め込みの閲覧用 |
| 画面の見本 | `design-review/top-v2-1-c-refine/screens/*.png`（1440／390） | Hero／全体／Trial／Person／Drawer／デモダイアログ |
| 意図・変更理由・Evidence Conflict | `design-review/top-v2-1-c-refine/DESIGN_INTENT_CHANGE_LOG.md` | |
| **本番機能・計測・リンク契約（Behavior SoT）** | **現在のmain**（`index.html`／`assets/js/main.js`／`assets/css/style.css`／`docs/analytics/*`） | 実装時点のmain SHAを再取得して使う。本書記載のmain情報は `bde08c6` 時点 |

**判断の優先順位**：Owner Decision（上記）＞ Visual SoT（見た目）＞ main（機能・計測・リンク先）＞ 研究・旧Phase資料。見た目と機能が衝突した場合は勝手に決めず、§9の「要判断」に追記して止める。

重要な前提：
- このデザインは**元のC比較画面・研究原本・Phase 6 Final Implementation Specと照合していない**（それらは作業環境から読めなかった）。Phase 6との差分は [差分文書](./PHASE6_VS_ADOPTED_C_DIFF.md) に、読めた範囲の根拠付きで整理している。
- Production（therev-lab.com）の実表示は未確認。mainのコードと素材のみが根拠。

## 3. 実装スコープ

### 3.1 変更してよいもの
| 対象 | 方針 |
|---|---|
| `index.html`（TOPのみ） | C構成へ全面置換。`<head>` のGTM・meta・OGP・canonical・JSON-LD（HealthClub）は**現行のまま保持**（§3.3） |
| `assets/css/` に**TOP専用**CSSを新設（例 `home-c.css`） | `style.css` は他ページ（price／trainer／solution／access／blog／legal等）と共有。**共有ルールの変更は避け**、TOP専用クラス接頭辞で隔離する。`prepare-deploy.mjs` はルートHTMLの `assets/css/style.css` 参照にだけ内容ハッシュを付けるため、新CSSのキャッシュ更新方法（style.cssへ統合／prepare-deployの対象に追加／ファイル名にバージョン）を決めて記録する |
| `assets/js/` にTOP専用JS（タブ・TOP内の軽い表示遷移）を追加、または `main.js` へ最小追加 | `main.js` の計測・ローダー・ドロワー・ヘッダー関数は**改変しない**（§4・方針書） |
| 新規画像 | **不要**。使用素材はすべて既存（§5） |

### 3.2 変更しないもの
`price.html`（`REV-EXP-2026-001`／`#cat-trial[data-track-section="pricing_trial"]` 含む）／`trainer.html`／`solution.html`／`access.html`／`blog/**`／`legal.html` 等／`vercel.json`／`scripts/**`（原則）／GTM container／料金・予約URL／`admin/**`／Editorial系 `lib/**`・`editorial/**`。

### 3.3 TOPで現行のまま保持するもの
- GTM `<script>` と `<noscript>`（`GTM-WFD7R8BT`）。**`window.dataLayer` を使う既存 `main.js` の計測をそのまま使う**。
- `<title>`／description／OGP／Twitter／canonical／JSON-LD（住所・営業時間・`ReserveAction`）。
- `<html lang="ja">`、`skip-link`、`<main id="main-content">`。
- サイトローダー（`#site-loader`、同一タブ初回のみ約1秒）。C検討画面にはローダーが無いが、これは**デザインではなく既存機能**なので維持（要判断：§9-5）。

## 4. デモ → 本番への戻し（必須）

検討画面で入れたデモ専用物を**すべて除去**し、本番導線へ戻す。

| 検討画面の要素 | 本番での扱い |
|---|---|
| `<meta name="robots" content="noindex, nofollow">` | **削除**（本番はindex対象） |
| `.review-strip`（DESIGN REVIEW帯） | 削除 |
| `<dialog id="demo-dialog">`、`#demo-cta` セクション、`data-demo` 属性、`review.js` の Demo CTA dialog処理 | 削除 |
| `href="#demo-cta"` の予約・LINEリンク | 下表の実URLへ |
| 本番GTM／main.jsを**読み込んでいない** | 本番では現行どおり読み込む |
| Google Fonts `<link>`（Zen Kaku `wght@400;500;700`） | mainの現行linkを維持。**TOPで実使用する太さがロード済みか確認**（現行 Jost 300–500／Shippori 500–700／Zen Kaku 300–500。C CSSの使用は Shippori 500・600、Zen Kaku 400・500、Jost 300・400。700は未使用なら追加しない） |
| `../../assets/images/*.webp` の相対パス | TOP本番は `assets/images/...`。**`<picture>` で webp＋jpg fallback**（現行mainの書式。検討画面はwebpのみ） |

### 予約・LINEの復元

予約基準URL：`https://cl.gyms.jp/t/CC2237480443/`、UTM：`utm_source=website&utm_medium=referral&utm_campaign=trial&utm_content=<placement>`。LINE：`https://lin.ee/UXE0bLd`。

- 予約リンクは `target="_blank" rel="noopener"`、`aria-label="予約ページを新しいタブで開く"`、`data-track="reserve_click"`、`data-placement="<placement>"` を**付ける**。`utm_content` と `data-placement` を一致させる。
- LINEリンクは `data-track="line_click"` ＋ `data-placement`。`target="_blank" rel="noopener"`。
- **`reserve_click` は `href` が `https://cl.gyms.jp/` で始まる場合だけ送信される**（`main.js` `initTrackingDataLayer`）。`#` やデモ用hrefのままだと計測が**無音で欠落**する。復元後に必ず確認。
- 各CTAと placement の対応は [方針書 §3](./IMPLEMENTATION_POLICY_PRESERVE_MAIN_CONTRACTS.md) の表を正とする。

## 5. 素材（既存のみ）

| 用途 | ファイル（`assets/images/`） | 備考 |
|---|---|---|
| Hero（Desktop／Mobile） | `photo-lobby.webp/.jpg`、`photo-lobby-sp.webp/.jpg` | Mobileは `<source media="(max-width:760px)">`。MobileはHero上62%に配置し下へ暗色で溶かす（CSS参照） |
| Training／Recovery | `photo-evolgear.webp`、`photo-oxyroom.webp` | `object-position` はCSS参照 |
| Boxing | **インライン線画SVG**（`index.html` 内、`role="img"`＋`<title>`） | `photo-boxing` は使用しない（顧客実写の根拠未確定） |
| Person | `trainer-portrait.webp/.jpg` | Desktop 260px幅／Mobile 168px幅、角丸四角、`object-position:50% 34%` |
| Access | `access-parking-approach.webp/.jpg` | 川沿い道路側の駐車場入口 |
| Logo／Footer | `logo-full(-white).webp/.png` | 正式ロゴ。描き直さない |
| Voice | **画像ではなくHTMLテキスト**（`voice-04`／`voice-01` の画像内文言を転記） | 原文との照合は未実施。画像内の「要約」注記を維持 |

既存のVoice画像（`voice-01..05`）はこのデザインでは未使用。他ページで使っていないか確認するまで**削除しない**。

## 6. 実装手順（推奨順）

1. 作業ブランチを現在の `main` から作る（本ブランチ `claude/the-rev-top-v2-1-c-design-4k6uwo` は**デザイン保存用**。実装ブランチは別名）。`vercel.json` の `git.deploymentEnabled=false` は触らない。
2. `index.html` を [方針書](./IMPLEMENTATION_POLICY_PRESERVE_MAIN_CONTRACTS.md) の契約に従って置換：C構成のマークアップ、既存の `#site-loader`／`.site-header`／`.rev-drawer`（`#revDrawer`）／フッターのHooks、GTM、JSON-LDを維持。
3. TOP専用CSS／JSを追加（C検討CSSを移植。クラスは接頭辞で隔離）。検討JSの `data-state` ヘッダーは使わず、**mainの `initHeader`（`.site-header.scrolled`）に合わせる**。ドロワーは検討JSではなく**mainの `initDrawer`（フォーカストラップ・スクロールロック込み）を使い**、C見た目だけ適用。
4. §4のデモ除去と予約・LINE復元。
5. ローカル検証（§7）。
6. Pull Request（Owner承認前提）。**mainへのpushは `Deploy to Xserver` を自動起動する**（`*.html`／`assets/**` 変更時）。mergeはOwnerの明示承認後のみ。
7. Vercel：`docs/operations/VERCEL_RELEASE_POLICY_V1.md` に従い、全ゲート通過後に**Preview 1回**、承認後に**Production 1回**（exact main SHAを明示deploy）。docs／handoffのみのcommitではdeployしない。

## 7. 受入チェックリスト

**表示・操作（Desktop 1440／Mobile 390、実表示で）**
- [ ] 検討画面（screens/）と並べて Hero→Choice→Method→Voice→Trial→Pricing→Person→Place→Questions→Final→Footer の順序・文言・色・余白が一致
- [ ] 横はみ出し・壊れた画像・コンソール例外なし／H1は1つ／全画像alt
- [ ] 体験タブ3種（クリック・←→・Home／End）、Mobileドロワー（開閉・Esc・フォーカストラップ）、内部アンカー、`prefers-reduced-motion`
- [ ] JS無効時も体験の3パネルが全て読める／タップ領域44px以上
- [ ] 実機Safari（検討時は未検証）

**機能・計測（既存契約を壊さない）**
- [ ] 全予約リンクが `cl.gyms.jp` ＋ 正しい `utm_content`、`reserve_click` がdataLayerに**各クリック1回**
- [ ] `line_click`／`price_click`／`recovery_click`／`trainer_click`／`review_click`／`article_click`／`instagram_click`／`access_click` が各placementでpush（`page_type:'home'`、`event_version:'e1_v1'`）
- [ ] `section_view` が方針書の対応表どおり各1回
- [ ] `/#faq`・`/#service` へのサイト内リンク（blog記事など約38件）がTOPの適切な位置へ着地
- [ ] `price.html` の `REV-EXP-2026-001` 関連が無変更（diffで確認）
- [ ] GTMコンテナ・GA4設定・料金・予約URLの差分なし
- [ ] `npm ci` → `npm run build:blog` → `npm run test:vercel-release-policy`／`test:site-insights`／`test:control-capture`（既存回帰）→ `node scripts/prepare-deploy.mjs`（distにTOPと新CSS／JSが含まれ、style.css参照の更新が失敗しない）

## 8. 絶対に守ること

- 価格・入会金・予約URL・UTM規則・LINE URLを**変更しない**。TOPの可視の3,300円は初回共通欄の**一か所のみ**（JSON-LDの `priceRange` は構造化データなので現状維持）。
- GTM／GA4コンテナの公開・変更をしない。`main.js` のトラッキング関数の挙動を変えない。
- デザイン文言のうち**医学的効果・安全・無痛・成果の保証**に読める表現を足さない。Voiceを成果Caseと呼ばない。
- 「必ず60分以内に退出」「一切営業しない」「永久に毎回代表固定」「約5,000人」などの禁止表現を入れない（約5,000は代表個人の累計指導セッション）。
- Owner確定事実はデザインのHTMLをそのまま使い、勝手に言い換えない。公開ページ側（`solution.html`等）との食い違いは §9 で扱い、**独断で書き換えない**。

## 9. 要判断（実装着手前にOwnerへ確認）

| # | 内容 | 推奨 | 影響 |
|---|---|---|---|
| 1 | **スマホ固定CTA**（現行 `rev-fixed-cta`／`home_fixed_cta`）：Cは未採用、現行mainには存在 | Ownerへ確認。落とすなら `home_fixed_cta` は退役、残すならCの見た目に合わせて現行挙動を維持 | 予約導線・計測placementの欠落（最もリスクの高い挙動変更） |
| 2 | **FAQアコーディオン**（現行9問・`faq_open`）はCで「Questions（記事リンク5問）」へ置換 | 現行FAQの回答（自動で月額契約にならない、駐車場、シャワー、頻度等）をTOPで失うことをOwnerが承認。`/#faq` は `#questions` へ着地させる | `faq_open` がTOPで観測不能に。FAQ内の事実がTOPから消える |
| 3 | 現行TOPの「実績ストリップ（約5,000）」「共感4項目」「リカバリー詳細（1.35気圧表）」「設備ミニ（シャワー・水素水）」がCに無い | Cの順序・構成を維持（Owner決定3）。`約5,000` はPerson内に残存。1.35気圧表はTOPから消えるため公開ページ間の食い違い（下記）はTOP側では解消 | `section_view` の `trust`／`empathy`／`recovery` が退役 |
| 4 | Evidence Conflict（`DESIGN_INTENT_CHANGE_LOG.md` §3）：Recoveryの気圧・耳の連絡先・シャワー表現が公開ページと異なる | TOPはOwner事実に沿う。`solution.html` 等の整合は別タスク | 公開前の整合確認が将来工程 |
| 5 | サイトローダー（約1秒）を維持するか | 既存機能として維持（Owner未指示） | LCP体感・初回表示 |
| 6 | ドロワーのInstagram（現行 `home_drawer`）をCのドロワーに残すか | `instagram_click` 維持のため小リンクで残す案 | 計測placementの継続 |
| 7 | `home_hero_line`／`home_trial` 等の**新規placement**採用 | 採用可（GTM変更不要、`placement` はパラメータ）。ただし計測の受信・カスタムディメンションの一部は未確認 | 新規値は「観測済み」と書かない |
| 8 | 記事 `muscle-mass-not-increasing-progress-signs` の本番実在 | 実装前にProductionで確認（mainに静的ファイルなし、sitemapとadmin catalogに掲載） | 404リンクの回避 |
| 9 | Voice原文の照合（Google口コミ） | 実装前に照合 | 文言の正確性 |

## 10. 本handoffの限界

- 元C比較HTML／画面画像、研究原本、Phase 5 Blueprint／**Phase 6 Final Implementation Spec**、Production実表示は**未確認**。本書のPhase 6関連記述は、Owner提供の引き継ぎ書に記録された差異に基づく。
- 実装・検証・Preview／Productionは**未実施**。Cのデザイン優位性やCVR向上は未検証。
