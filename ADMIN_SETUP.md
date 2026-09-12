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

## STEP 4｜Supabaseプロジェクトを作成する（Phase Bで使用）

1. https://supabase.com/dashboard/projects で新規プロジェクトを作成
2. Authentication → Providers で **Email** を有効化
3. Authentication → Users で、運営者本人のメールアドレスを1件だけ招待する（Ver.1.0は1ユーザー運用）
4. Project Settings → API から、
   - `SUPABASE_URL`（Project URL）
   - `SUPABASE_ANON_KEY`（anon public key）
   - `SUPABASE_SERVICE_ROLE_KEY`（service_role key。**絶対にブラウザ側コードに書かない**）
   をコピーし、Vercelの Environment Variables に登録する

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
