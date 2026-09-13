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
   - **secret key** はPhase B（今回）では使いません。Phase D（記事公開のGitHub連携）で使うため、控えておくだけで構いません。**絶対にブラウザ側コードや`/admin`配下の静的ファイルには書かないでください**
6. Vercelプロジェクト → **Settings → Environment Variables** で、上記の `SUPABASE_URL` ・ `SUPABASE_PUBLISHABLE_KEY` の2つを登録し、**Production**（必要ならPreviewも）にチェックを入れて保存する
   - Phase Bのログインはこの2つだけで動作します。secret key（service role key）の登録は不要です
7. 環境変数は保存しただけでは既存のデプロイには反映されません。Vercelの **Deployments** タブから最新デプロイの「Redeploy」を行うか、次にこちらからpushするコミットで自動的に反映されます

---

## STEP 5｜GA4連携の準備（Phase Eで使用）

1. Google Cloud ConsoleでSupabaseとは別のプロジェクトを用意（または既存プロジェクトを利用）し、**Google Analytics Data API** を有効化する
2. サービスアカウントを作成し、JSON形式のキーをダウンロードする
3. GA4管理画面 → プロパティのアクセス管理 で、上記サービスアカウントのメールアドレスを「閲覧者」として追加する
4. GA4のプロパティID（数字のみ、例: `123456789`）を確認する
5. Vercelの Environment Variables に、
   - `GA4_PROPERTY_ID`
   - `GA4_SERVICE_ACCOUNT_JSON`（ダウンロードしたJSONの中身）
   を登録する

---

## ここまで終わったら

STEP 1・2（GitHub + Vercel接続）が完了していれば、Phase B（Admin認証・共通画面）に着手できます。STEP 3・3bはPhase D（記事公開）、STEP 4はPhase B、STEP 5はPhase Eに入る直前までに完了していれば問題ありません。

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
