# THE REV. Xserver Deployment

本番サイト `https://therev-lab.com/` を、GitHub Actions から Xserver へ自動反映するための運用メモです。

## 方式

Workflow: `.github/workflows/deploy-xserver.yml`

通常運用では、`main` に本番サイトへ影響する変更が入ると自動起動します。必要に応じて `workflow_dispatch` から手動実行もできます。

自動起動対象は主に次の正本・公開ソースです。

- ルートHTML
- `assets/**`
- `content/blog/**`
- `scripts/**`
- `lib/**`
- `package.json`
- `package-lock.json`
- `favicon.ico`
- `robots.txt`

生成物である `blog/**` や `sitemap.xml`、Workflowや運用ドキュメントだけの変更では、自動デプロイしません。

## 実行順序

1. `npm ci`
2. `npm run vercel-build`
3. `content/blog/*.md` の `status` と `dist/blog/` の生成結果を照合
4. `dist/admin` を除外したXserver用payloadを作成
5. Xserver FTPルート `/` の本番をFTPSでバックアップ
6. バックアップをGitHub Actions Artifactへ14日保存
7. 本番 `/blog/` 配下を完全同期し、下書き化・削除された記事の残骸を除去
8. それ以外の公開ファイルをFTPルート `/` へ上書き
9. `therev-lab.com` のTOP / Blog一覧 / 全公開記事をHTTP確認
10. 下書き記事がBlog一覧に出ておらず、URLもHTTP 200になっていないことを確認

Xserver接続は一時的に不安定になることがあるため、バックアップとデプロイは最大3回まで自動再試行します。ビルド検証に失敗した場合は、FTP接続や本番変更を行う前に停止します。

## 公開先の確認結果

2026-09-17 に手動probeで確認済みです。

- FTP `/` に置いた `__rev_root_probe.txt` は `https://therev-lab.com/__rev_root_probe.txt` で直接配信された
- FTP `/unlimited-dev/` に置いたファイルは本番ルート直下では配信されない
- `https://therev-lab.com/unlimited-dev/...` へアクセスするとBasic認証が表示される
- `therev-lab.com` と `sv14602.xserver.jp` は同じIP `162.43.104.3` を解決した

したがって、GitHub Actions の本番配信先は **FTPルート `/`** とする。
`/unlimited-dev/` は本番DocumentRootではなく、認証付きの別環境として扱う。

## Xserver設定

固定値:

- FTP host: `sv14602.xserver.jp`
- Production remote directory: `/`
- Protected environment: `/unlimited-dev/`
- Production URL: `https://therev-lab.com`

GitHub Repository Secretsとして次の2つを使用します。

- `XSERVER_FTP_USER`
- `XSERVER_FTP_PASSWORD`

FTP認証情報をファイルやWorkflowへ直接書かないでください。

GitHubでの登録場所:

`Repository → Settings → Secrets and variables → Actions`

## 通常運用

サイトの正本を更新し、その変更が `main` に入ると自動でXserver本番まで反映されます。

通常は次の操作は不要です。

- FileZillaでの手動アップロード
- `npm run vercel-build` の手動実行
- GitHub Actions の `Run workflow` ボタン操作
- 公開後のBlog URL手動チェック

手動実行が必要な場合だけ、GitHubで:

`Actions → Deploy to Xserver → Run workflow`

を使用します。

同じ本番deployを重複起動しないよう `concurrency` を設定しています。

## サーバー上で削除しないもの

FTPルート `/` 全体には `--delete` を使いません。そのため、Xserver側にだけ存在する以下のようなファイル・ディレクトリは保持されます。

- `.htaccess`
- `.user.ini`
- 既存バックアップZIP
- `/unlimited-dev/`
- Xserver固有ファイル

ただし本番 `/blog/` だけはGitHubの公開状態を正本とするため完全同期します。

## adminをXserverへ配信しない理由

現在の `dist/admin` はVercel Functions / API連携を前提とする管理機能を含みます。静的Xserver本番には不要なため、Xserver用payload作成時に除外します。

## バックアップ

各デプロイ前に現在のFTPルート `/` の本番領域を取得し、GitHub Actions Artifactとして保存します。認証付き別環境 `/unlimited-dev/` は本番バックアップ対象から除外します。

Artifact名:

`xserver-backup-<GitHub Actions run id>`

保存期間: 14日

本番確認に失敗した場合でもバックアップArtifactは残ります。現段階では誤検知時の不要な巻き戻しを避けるため、自動ロールバックは行いません。

## ローカルUSB側を同期する

GitHub上でWorkflowやサイトを更新した後、USBのローカルリポジトリを使う前に以下で同期します。

```bat
cd /d "E:\rev\サイト\ブラッシュアップ"
git pull --ff-only
git status -sb
```

正常なら `## main...origin/main` のみ表示されます。
