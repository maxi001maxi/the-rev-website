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

## STEP 3｜GitHub Personal Access Token を発行する（Phase Dで使用）

1. https://github.com/settings/personal-access-tokens/new を開く
2. Repository access は **Only select repositories** → STEP 1で作ったリポジトリのみ選択
3. Permissions → **Contents: Read and write** を付与（他は不要）
4. 発行されたトークンをコピーする（この画面を閉じると二度と表示されません）
5. Vercelのプロジェクト → Settings → Environment Variables で、
   - `GITHUB_TOKEN` … 発行したトークン
   - `GITHUB_REPO` … `your-account/therev-site` の形式
   - `GITHUB_BRANCH` … `main`
   を登録する

---

## STEP 4｜Supabaseプロジェクトを作成する（Phase Bで使用・今すぐ必要）

Admin（`/admin/`）のログイン機能はSupabase Authを使います。Ver.1.0は運営者本人1名のみが使う想定なので、**一般向けの新規登録画面は作りません**。ユーザー登録はSupabase側の管理画面から手動で1件だけ作成します。

1. https://supabase.com/dashboard/projects を開き、新規プロジェクトを作成する
   - Database Passwordは控えておく（今回のAdmin機能では直接使いませんが、念のため保管してください）
   - Regionは日本から近いもの（Northeast Asia系）があればそれを選択
   - プロジェクトの起動まで1〜2分待つ
2. 左メニュー **Authentication → Providers** を開き、**Email** が有効になっていることを確認する（通常は初期状態で有効）
3. 同じくAuthenticationの中の **Sign In / Providers**（または **Settings**）で、「Allow new users to sign up」（新規ユーザーのセルフサインアップ許可）を **OFF** にする
   - これにより、万が一SupabaseのURLとanonキーが第三者に知られても、勝手にアカウントを作成される心配がなくなります
4. **Authentication → Users** を開き、**Add user** から運営者本人のメールアドレスとパスワードを直接作成する（Ver.1.0はこの1件のみ）
   - 「Auto Confirm User」のようなチェックがあれば有効にして、メール確認なしですぐログインできるようにしてください
5. **Project Settings → API** を開き、以下をコピーする
   - **Project URL** → Vercelの環境変数 `SUPABASE_URL` に登録
   - **anon public key** → Vercelの環境変数 `SUPABASE_ANON_KEY` に登録
   - **service_role key** はPhase B（今回）では使いません。Phase D（記事公開のGitHub連携）で使うため、控えておくだけで構いません。**絶対にブラウザ側コードや`/admin`配下の静的ファイルには書かないでください**
6. Vercelプロジェクト → **Settings → Environment Variables** で、上記の `SUPABASE_URL` ・ `SUPABASE_ANON_KEY` の2つを登録し、**Production**（必要ならPreviewも）にチェックを入れて保存する
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

STEP 1・2（GitHub + Vercel接続）が完了していれば、Phase B（Admin認証・共通画面）に着手できます。STEP 3〜5は、それぞれ対応するPhase（D／B／E）に入る直前までに完了していれば問題ありません。
