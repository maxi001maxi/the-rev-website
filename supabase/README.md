# Supabase migrations（Phase Dで導入）

このディレクトリは、Supabaseのスキーマ変更を `supabase/migrations/*.sql` として
バージョン管理するためのものです。Phase Dまでは「SQL Editorに貼り付けて実行」する
運用でしたが、今後のスキーマ変更はこの方式に統一します。

## 現状の運用（重要）

**このセッション（Claude Codeのサンドボックス環境）からは、ネットワークの egress ポリシーにより
`api.supabase.com` および Supabaseプロジェクトへの直接のDB接続（Postgresポート）に到達できません。**
そのため、`supabase link` / `supabase db push` / `supabase migration list` などリモートの
Supabaseプロジェクトと通信するコマンドは、このセッションからは実行できません
（Supabase CLI自体はGitHub Releases経由でインストールでき、ローカルの `config.toml` 生成など
ネットワーク不要な操作は問題なく行えます）。

これらのコマンドは、以下のいずれかの方法で実行してください。

- あなたのローカルPC（ネットワーク制限のない環境）で実行する
- このセッションが動く環境のネットワークポリシーを変更し、`api.supabase.com` と
  Supabaseプロジェクトのdb hostへのアクセスを許可した新しい環境を作成する
- GitHub Actions上で実行する（`SUPABASE_ACCESS_TOKEN` と `SUPABASE_DB_PASSWORD` を
  GitHub Secretsに登録すれば、ランナーには制限がないため実行できます。これはSecret発行が
  必要なため、導入する場合は別途ご案内します）

## 初回セットアップ（どこかネットワーク制限のない環境で1回だけ）

既存の本番Supabaseには、`supabase/migrations/20260910120000_phase_c_articles.sql` の内容が
Phase C当時にSQL Editorから**すでに手動実行済み**です。そのため、初めて `supabase db push` を
行う前に、このmigrationを「適用済み」としてベースライン登録する必要があります
（そうしないと `create table` 等が重複実行され、既存オブジェクトとの衝突でエラーになります）。

```bash
# 1. Supabase CLIにログイン（ブラウザでの認証が必要）
supabase login

# 2. このリポジトリのローカルディレクトリでプロジェクトをlink
#    <project-ref> は Supabase Dashboard の Project Settings → General → Reference ID
supabase link --project-ref <project-ref>

# 3. 既存migrationを「適用済み」としてベースライン登録（実行はしない）
supabase migration repair 20260910120000 --status applied

# 4. 以降のmigration状態を確認
supabase migration list
```

## 通常運用（ベースライン登録後）

1. スキーマ変更が必要になったら、新しいmigrationファイルを作成する
   ```bash
   supabase migration new <説明>
   # supabase/migrations/<timestamp>_<説明>.sql が作成される
   ```
2. 生成されたファイルにSQLを書く（既存の `20260910120000_phase_c_articles.sql` のように、
   `create table if not exists` / `drop policy if exists` など再実行に強い書き方を推奨）
3. ネットワーク制限のない環境で以下を実行し、本番Supabaseへ適用する
   ```bash
   supabase db push
   ```
4. コミットし、`claude/jolly-maxwell-aav5fn`（または該当ブランチ）へpushする
   （migrationファイル自体はGitで管理するSource of Truthであり、`supabase db push` は
   「まだ適用されていないファイルを適用する」だけなので、pushの順序はどちらが先でも安全）

## RLS / DB制約の変更について

`admin_article_drafts.status` の `check (status = 'draft')` 制約は、Phase Dでも意図的に
解除していません（公開判定は `source_path` の有無で行い、Supabase側のstatusは常に
Working Draftを表す `draft` のままにする設計のため）。この制約を変更する場合は、
必ずこのリポジトリの `ADMIN_SETUP.md` と `lib/publishFlow.mjs` の前提を合わせて見直してください。
