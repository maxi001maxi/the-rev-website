# THE REV. Admin / Editorial Console — 接続セットアップ手順

このドキュメントは、Admin機能（Phase B以降）を進めるために**あなた自身が行う必要がある手順**をまとめたものです。GitHubアカウント・Vercelアカウント・Supabaseアカウントへのログインが必要なため、Claude Codeが代わりに実行することはできません。

現状（Phase A完了時点）でできていること：

- このフォルダはローカルGitリポジトリになっています
- `npm run build:blog` は今まで通り動作します
- `vercel.json` / `/admin/`（プレースホルダ）/ `/api/health.mjs`（疎通確認用）を用意済みです
- `.env.example` に、今後必要になる環境変数の一覧を用意済みです

---

## STEP 1｜GitHubリポジトリを作成し、コードをpushする

1. https://github.com/new で新しいリポジトリを作成する（Public/Privateはお好みで。記事内容が公開前提ならPrivateを推奨）
2. 作成後に表示される「…or push an existing repository from the command line」の中の、リポジトリURLをコピーする（例: `https://github.com/your-account/therev-site.git`）
3. このフォルダで以下を実行する（`<URL>` は上でコピーしたもの）

```bash
git remote add origin <URL>
git branch -M main
git push -u origin main
```

---

## STEP 2｜Vercelプロジェクトを作成する

1. https://vercel.com/new を開き、GitHubアカウントと連携する
2. STEP 1で作成したリポジトリを選択して **Import**
3. Framework Presetは **Other**（自動検出されない場合は手動で選択）のままでよい。Build Command / Output Directoryは `vercel.json` の内容が優先されるため変更不要
4. そのまま **Deploy** を押す（この時点では `/api/health` と `/admin/`（準備中ページ）以外の新機能はまだ動きません。既存サイト・Blogが今まで通り表示されればOKです）
5. デプロイ後、`https://<プロジェクト名>.vercel.app/api/health` にアクセスし、`{"ok":true,...}` が返ることを確認する

---

## STEP 3｜GitHub Personal Access Token を発行する（Phase Dで使用・Publishに必須）

1. https://github.com/settings/personal-access-tokens/new を開く
2. Repository access は **Only select repositories** → STEP 1で作ったリポジトリのみ選択
3. Permissions → **Contents: Read and write** を付与（他は不要）
4. 発行されたトークンをコピーする（この画面を閉じると二度と表示されません）
5. Vercelのプロジェクト → Settings → Environment Variables で、
   - `GITHUB_TOKEN` … 発行したトークン
   - `GITHUB_REPO` … `maxi001maxi/the-rev-website` の形式（`owner/repo`）
   - `GITHUB_BRANCH` … `main`
   を登録する

> `GITHUB_TOKEN` はVercel Functionsの中でのみ使用します。ブラウザ側のJS・HTML・`/api/config`・ログのいずれにも出力されません。
> 未設定のままでも Admin のログイン・下書き作成・保存は従来どおり動作し、Publish Review画面で
> 「GitHub連携の環境変数が未設定です」とだけ表示されます（Publishボタンは押せません）。

---

## STEP 3b｜Publish権限（`ADMIN_PUBLISHER_USER_ID`）を設定する（Phase Dで使用・Publishに必須）

「Supabaseにログインできる人＝誰でもGitHubへ書き込める」構造にしないための追加ゲートです。
Publish APIは、ログイン中ユーザーの `user.id` がこの環境変数と一致した場合のみGitHubへ書き込みます（不一致は403）。

1. Supabase Dashboard → **Authentication → Users** を開く
2. STEP 4で作成した運営者アカウントの行を開き、**User UID**（UUID形式）をコピーする
3. Vercelのプロジェクト → Settings → Environment Variables で
   - `ADMIN_PUBLISHER_USER_ID` … コピーしたUUID
   を登録する

> 未設定の場合、Publish APIは常に403を返します（安全側の既定動作）。
> 記事の作成・編集・保存（Articles CRUD）は従来どおりSupabaseのRLSのみで制御され、この変数の影響を受けません。

---

## STEP 4｜Supabaseプロジェクトを作成する（Phase Bで使用・今すぐ必要）

Admin（`/admin/`）のログイン機能はSupabase Authを使います。Ver.1.0は運営者本人1名のみが使う想定なので、**一般向けの新規登録画面は作りません**。ユーザー登録はSupabase側の管理画面から手動で1件だけ作成します。

1. https://supabase.com/dashboard/projects を開き、新規プロジェクトを作成する
   - Database Passwordは控えておく（今回のAdmin機能では直接使いませんが、念のため保管してください）
   - Regionは日本から近いもの（Northeast Asia系）があればそれを選択
   - プロジェクトの起動まで1〜2分待つ
2. 左メニュー **Authentication → Providers** を開き、**Email** が有効になっていることを確認する（通常は初期状態で有効）
3. 同じくAuthenticationの中の **Sign In / Providers**（または **Settings**）で、「Allow new users to sign up」（新規ユーザーのセルフサインアップ許可）を **OFF** にする
   - これにより、万が一SupabaseのURLとpublishable keyが第三者に知られても、勝手にアカウントを作成される心配がなくなります
4. **Authentication → Users** を開き、**Add user** から運営者本人のメールアドレスとパスワードを直接作成する（Ver.1.0はこの1件のみ）
   - 「Auto Confirm User」のようなチェックがあれば有効にして、メール確認なしですぐログインできるようにしてください
5. **Project Settings → API Keys**（現行のSupabase UIでは publishable key / secret key という表記）を開き、以下をコピーする
   - **Project URL** → Vercelの環境変数 `SUPABASE_URL` に登録
   - **publishable key** → Vercelの環境変数 `SUPABASE_PUBLISHABLE_KEY` に登録
   - **secret key** はPhase B〜Dのいずれでも使いません（Adminの認可はSupabaseのRow Level Securityのみで行う設計のため）。Vercelへ登録する必要もありません。**絶対にブラウザ側コードや`/admin`配下の静的ファイルには書かないでください**
6. Vercelプロジェクト → **Settings → Environment Variables** で、上記の `SUPABASE_URL` ・ `SUPABASE_PUBLISHABLE_KEY` の2つを登録し、**Production**（必要ならPreviewも）にチェックを入れて保存する
   - Phase Bのログインはこの2つだけで動作します。secret key（service role key）の登録は不要です
7. 環境変数は保存しただけでは既存のデプロイには反映されません。Vercelの **Deployments** タブから最新デプロイの「Redeploy」を行うか、次にこちらからpushするコミットで自動的に反映されます

> スキーマ変更（テーブル・列・RLSの追加変更）は、STEP 4以降 `supabase/migrations/*.sql` として管理します。
> 運用方法は `supabase/README.md` を参照してください。

---

## STEP 5｜GA4 Data API連携（Phase E / Admin Analytics）

Adminの `/admin/analytics/` は、ブラウザからGoogleへ直接アクセスせず、認証済みの `/api/admin/analytics` を経由してGA4 Data APIを読み取ります。

### 5-1. Google側の準備

1. Google Cloudで利用するプロジェクトを選択し、**Google Analytics Data API** を有効化する
2. 読み取り専用のサービスアカウントを作成し、JSONキーを発行する
3. GA4 → 管理 → プロパティのアクセス管理で、そのサービスアカウントのメールアドレスを **閲覧者** として追加する
4. GA4の **プロパティID（数字のみ）** を確認する

> サービスアカウントのJSON鍵は秘密情報です。GitHub、HTML、ブラウザJS、`/api/config`、ログへ出してはいけません。

### 5-2. Vercel Environment Variables

Production（必要ならPreviewも）へ以下を登録します。

- `GA4_PROPERTY_ID` … GA4の数字のみのプロパティID
- `GA4_SERVICE_ACCOUNT_JSON` … サービスアカウントJSON。raw JSONまたはbase64で登録可能

保存後は新しいDeploymentが必要です。既存Deploymentへは自動反映されません。

### 5-3. Admin Analyticsで表示する内容

- ユーザー数
- セッション数
- ページビュー
- 新規ユーザー
- 前期間比較
- よく見られているページ
- 流入元（source / medium）
- 新規 / リピーター
- デバイス
- 主要CTAイベント
- Realtime active users（取得できる場合）
- 期間切替：今日 / 7日 / 28日

Analytics APIはSupabase AuthのBearer tokenを必須とし、未ログインアクセスは401で拒否します。サービスアカウント鍵はサーバー側のみで使用します。

### 5-4. 計測側（GTM / GA4）

Admin Data APIは「すでにGA4へ入っているデータを読む」機能です。サイト計測そのものは、既存の `GTM-WFD7R8BT` からGoogleタグを全ページ発火させる構成を正本とします。

サイト側 `assets/js/main.js` は `data-track` を持つリンクについて、以下のようなイベントを `dataLayer` へpushします。

- `reserve_click`
- `line_click`
- `instagram_click`
- `price_click`
- `article_click`
- `article_cta_click`
- `map_click`（該当導線が実装されている場合）

GTM側ではこれらのうち運営判断に必要なイベントをGA4 Eventへ接続します。個人情報、フォーム入力内容、健康情報は送信しません。

### 5-5. 検証

ローカルの安全性・正規化テスト：

```bash
npm run test:phase-e
```

本番接続後は、GA4 Realtime / DebugView等で `page_view` と主要イベントの受信を確認し、Admin Analyticsでも同じプロパティのデータが取得できることを確認します。

---

## ここまで終わったら

STEP 1・2（GitHub + Vercel接続）、STEP 4（Admin認証）がAdminの基盤です。STEP 3・3bは記事Publish、STEP 5はAdmin Analyticsを本番データへ接続するために必要です。

---

## Phase D（GitHub同期・Publish）の使い方

### 必要な環境変数（4つ）

| 変数 | 用途 | 未設定のときの挙動 |
| --- | --- | --- |
| `GITHUB_TOKEN` | GitHub Contents APIでのコミット | Publish Reviewの「GitHub接続」が✕になり、Publishできない |
| `GITHUB_REPO` | `owner/repo`（例: `maxi001maxi/the-rev-website`） | 同上 |
| `GITHUB_BRANCH` | コミット先ブランチ（`main`） | 未設定なら `main` として扱う |
| `ADMIN_PUBLISHER_USER_ID` | Publishを許可するSupabase user.id | Publish APIが常に403 |

環境変数は保存しただけでは既存のデプロイに反映されません。Vercelの **Deployments → 最新デプロイ → Redeploy** を実行してください。

### 公開の流れ

```
Admin Editor → Save Draft → Review & Publish → Preflight → Publish
   → GitHub content/blog/{slug}.md へコミット → Vercel自動デプロイ → /blog/{slug}/ 公開
```

- 公開サイトのSource of Truthは引き続き **GitHub の `content/blog/*.md`** です。
- Supabaseの `admin_article_drafts` は Working Draft であり、`status` はPhase Dでも `draft` 固定です（DBのCHECK制約はそのまま）。
- GitHubへ書き出すMarkdownのFront Matterだけが `status: "published"` になります。

### Publish前のPreflight（`GET /api/admin/publish-preview?id=...`）

Review画面を開いた時点で以下を確認します。Publishボタンを押したあとも、サーバー側で**同じPreflightを再実行**してから書き込みます（Review時の結果は信用しません）。

1. 認証
2. Publisher権限（`ADMIN_PUBLISHER_USER_ID` 一致）
3. Draft存在
4. 必須項目（title / slug / description / published / updated / category / author / 本文）
5. slug形式（`a-z 0-9 -`）
6. GitHub接続（リポジトリ＋ブランチの到達性）
7. GitHub上のslug衝突（新規時）／対象ファイルの存在（更新時）
8. `source_path`
9. `source_sha`

### 事故防止のための制約（Phase D v1.0）

- **新規公開**：`content/blog/{slug}.md` がGitHubにすでに存在する場合はPublishをブロックします（Supabase内のslug重複チェックだけでは不十分なため、GitHub側も必ず見ます）。
- **既存記事の更新**：GitHubの現在SHAとSupabaseの `source_sha` が一致しない場合は上書きを禁止し、`409 source_conflict` として「GitHub側の記事が別経路で変更されています」と表示します。Force overwriteはPhase D v1.0では実装していません。
- **公開後のSlug**：`source_path` が設定された記事はSlugを変更できません（Editorでread-only、API側でも `409 slug_locked`）。URL変更・redirect対応は別Phaseです。
- **公開済みDraftの削除**：`source_path` がある記事はAdminから削除できません（`409 published_article`「公開済みの記事はAdminから削除できません。」）。GitHubに記事が残ったまま同期情報だけ消える事故を防ぐためです。
- **GitHub失敗時**：Supabase Draftは一切変更しません。`source_path` / `source_sha` はGitHubへの書き込みが成功した場合にのみ保存します。
- **公開後もDraftは保持**：次回の更新（Editor → Save Draft → Review & Publish）で同じGitHubファイルを更新し、そのたびに `source_sha` を最新へ更新します。

### 検証（ローカル）

```bash
npm run test:phase-d
```

GitHub環境変数を未設定にした状態で、
GitHub連携が安全にエラーになること・トークンが戻り値やエラーメッセージに混入しないこと・
Publish権限がfail closedであること・生成Markdownが既存の `scripts/build-blog.mjs` でそのままビルドできることを確認します。
（テスト中に `content/blog/` へ一時記事を書きますが、終了時に必ず削除して元の状態へ戻します。）

### 既存のGitHub記事について

現在GitHubにあるサンプル4記事は、Phase D v1.0ではSupabaseへ自動Importしません。
**Adminから作成した記事のみ**がGitHub同期の対象です。既存記事の取り込みは別途行います。

---

## Phase D.1（画像アップロード）の使い方

Editorから記事のThumbnail・OGP画像・本文中の画像をアップロードできます。
記事MarkdownのSource of TruthはこれまでどおりGitHubで、**画像ファイルのみ** Supabase Storageに
置きます。アップロードはブラウザから既存のSupabase session（ログイン中のアクセストークン）で
直接行われ、`service_role` は使用しません。認可の実体はSupabase Storageのポリシー（RLS）です。

### 必要な設定（1回だけ・SQL Editorでの実行が必要）

Supabase側の設定はSQLで完結しますが、このセッションの実行環境からは
`api.supabase.com` へ到達できず `supabase db push` を実行できないため、
**この1手順だけ手動でお願いします**（Phase Cのテーブル作成時と同じ操作です）。

1. Supabase Dashboard → **SQL Editor** を開く
2. `supabase/migrations/20260913020000_phase_d1_storage.sql` の内容をそのまま貼り付けて実行する
   - `blog-images` という Storage バケットを作成します（存在すれば設定を上書きするだけなので、
     誤って複数回実行しても安全です）
   - 許可する画像形式：JPEG / PNG / WebP、上限5MB（Storage側でも強制されます）
   - 読み取り（select）はバケット全体を公開にします（公開Blogページの`<img>`から
     認証なしで表示できるようにするため。既存の `/assets/images/blog/*.jpg` と同様の扱いです）
   - 書き込み（insert / update / delete）は **認証済みユーザーのみ** 許可します

以上でVercel側の環境変数の追加や、コードの変更は不要です（アップロードは
ブラウザ→Supabase Storageへ直接行われ、Vercel Functionsを経由しません）。

### 保存先・命名規則

`blog/{draft-id}/{timestamp}-{ランダム8文字}.{jpg|png|webp}` の形式で保存されます。

- `draft-id` は `admin_article_drafts.id`（UUID）。ユーザー入力ではなく、
  Draftを一度Save Draftした後にAdmin側が保持している値のみを使用します
  （画像アップロードは **Save Draft後** でないと行えません）
- ファイル名は常にAdmin側が生成する値のみで、アップロード元の元ファイル名は一切使用しません
  （パストラバーサル対策）

### 使い方（Editor）

1. Editorで記事を作成し、一度 **Save Draft** する（articleIdが確定するまで画像アップロードは無効）
2. 「SEO / Advanced」内の **Images** から画像をアップロード（アップロード中／成功／失敗を表示）
3. アップロードした画像のサムネイルから
   - **Set as Thumbnail** → Thumbnail欄へ設定
   - **Set as OGP** → OGP image欄へ設定（Thumbnailと同じ画像でよい場合は、OGP欄の
     「Thumbnailと同じ」ボタンでコピーできます）
   - **本文へ挿入** → 本文（Markdown）のカーソル位置へ `![](URL)` を自動挿入
4. Review画面・公開後のBlog記事のどちらでも、Supabase StorageのURLがそのまま
   `<img src="...">` として表示されます（既存のローカルパス画像と扱いは同じ）
