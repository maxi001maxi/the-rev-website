# THE REV. Xserver Deployment

本番サイト `https://therev-lab.com/` を、GitHub Actions から Xserver へ安全に反映するための運用メモです。

## 方式

Workflow: `.github/workflows/deploy-xserver.yml`

手動起動（`workflow_dispatch`）専用です。通常の `main` push ではXserverへ自動公開しません。

実行順序:

1. Xserver FTPルート `/` を丸ごとFTPSでバックアップ
2. バックアップをGitHub Actions Artifactへ14日保存
3. `npm ci`
4. `npm run vercel-build`
5. `content/blog/*.md` の `status` と `dist/blog/` の生成結果を照合
6. `dist/admin` を除外したXserver用payloadを作成
7. 本番 `/blog/` 配下を完全同期し、下書き化・削除された記事の残骸を除去
8. それ以外の公開ファイルをFTPルート `/` へ上書き
9. `therev-lab.com` のTOP / Blog一覧 / 全公開記事をHTTP確認
10. 下書き記事がBlog一覧に出ておらず、URLもHTTP 200になっていないことを確認

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

GitHub Repository Secretsとして次の2つだけ登録します。

- `XSERVER_FTP_USER`
- `XSERVER_FTP_PASSWORD`

FTP認証情報をファイルやWorkflowへ直接書かないでください。

GitHubでの登録場所:

`Repository → Settings → Secrets and variables → Actions → New repository secret`

## 実行方法

GitHubの対象リポジトリで:

`Actions → Deploy to Xserver → Run workflow`

実行中は同じ本番deployを重複起動できないよう `concurrency` を設定しています。

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

各実行前に現在のFTPルート `/` を取得し、GitHub Actions Artifactとして保存します。

Artifact名:

`xserver-backup-<GitHub Actions run id>`

保存期間: 14日

本番確認に失敗した場合でもバックアップArtifactは残ります。現段階では誤検知時の不要な巻き戻しを避けるため、自動ロールバックは行いません。

## ローカルUSB側を同期する

GitHub上でWorkflowファイルを更新した後、USBのローカルリポジトリで以下を実行します。

```bat
cd /d "E:\rev\サイト\ブラッシュアップ"
git pull --ff-only
git status -sb
```

正常なら `## main...origin/main` のみ表示されます。
