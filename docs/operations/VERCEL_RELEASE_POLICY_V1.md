# THE REV. Vercel Release Policy v1

Status: ACTIVE CANDIDATE
Owner: Website / Analytics
Updated: 2026-10-07

## 1. Purpose

THE REV. Website / Admin / APIのVercel Releaseを、Git commitの副作用ではなく明示的なRelease Gateとして扱う。

目的は次の4点。

1. Hobby planのrolling 24h Deployment上限を開発途中のcommitで浪費しない
2. Previewを「毎commitのbuild」ではなく「Acceptance Candidate」に限定する
3. `main`、Preview、Productionを明確に分離する
4. 緊急修正用のDeployment余力を常時残す

## 2. Incident evidence

2026-10-06 09:00–15:00 JSTのVercel Activityを監査した結果:

- Deployments: 100
- Preview: 72
- Production: 28
- 100件中99件は異なるGit SHA
- 主因はretry loopではなく、細かいcommit/pushごとのautomatic Git deployment

代表例:

- `company-os/github-material-collector-v1`: 13 deployments
- `company-os/ga4-direct-read-v1`: 13 deployments
- `feature/social-production-learning-v0.6`: 10 deployments

したがって対策は「失敗buildをキャンセルする」ではなく、automatic Git deploymentそのものをRelease Gateの外へ出す。

## 3. Canonical control

`vercel.json`:

```json
{
  "git": {
    "deploymentEnabled": false
  }
}
```

この設定を標準とする。

GitHubへのcommit / push / PR / mergeはVercel Deploymentを自動生成しない。
Preview / ProductionはVercel API / MCP / CLIで明示作成する。

`git.deploymentEnabled=false` の解除はOwner承認が必要。

## 4. Release state machine

```text
WORKING
-> CI_READY
-> PREVIEW_CANDIDATE
-> PREVIEW_READY
-> PREVIEW_ACCEPTED
-> MERGED_TO_MAIN
-> PRODUCTION_READY
-> PRODUCTION_ACCEPTED
```

重要:

- WORKING / CI_READYはDeployment不要
- GitHub commitだけでPREVIEW_READYへ進めない
- mergeだけでPRODUCTION_READYへ進めない
- ProductionのCurrent Truthはexact deployed SHA + Deployment ID + READY + live acceptance

## 5. Default deployment budget

rolling 24hで管理する。JST 0時リセットとは扱わない。

| Zone | Rolling 24h deployments | Rule |
|---|---:|---|
| GREEN | 0–20 | 通常運用 |
| YELLOW | 21–39 | taskを統合。不要Preview禁止 |
| ORANGE | 40–59 | 新規非緊急Previewを原則停止 |
| RED | 60+ | 非緊急Deployment停止。Owner/Incident判断のみ |

通常タスクのdefault budget:

- Preview: 1
- Production: 1
- 合計: 2

追加Previewは「前Previewで発見した実コード問題を修正した」場合に限る。
認証確認、ログ再確認、設定の読み直しだけを理由に再deployしない。

## 6. Standard workflow

### A. Development

1. latest mainからbranch作成
2. 実装
3. local/static/unit/integration test
4. GitHub CI
5. 必要な修正をまとめる
6. Acceptance Candidate SHAを固定

この段階ではVercel Deploymentを作らない。

### B. Explicit Preview

Release operatorはrolling 24h countを確認後、exact branch SHAを1回だけPreviewへdeployする。

ChatGPT Work / Vercel MCPでは `create_deployment` を使い、GitHub `ref` と `sha` を明示する。
targetは指定せずPreviewとする。

作成後に記録:

- Git SHA
- Deployment ID
- URL
- READY state
- acceptance evidence

Browser QAが必要な場合は `.github/workflows/preview-qa.yml` を手動実行し、明示Preview URLとSHAを渡す。

### C. Merge

Preview Acceptance PASS後のみmerge。

merge後はlatest main SHAを再取得する。
Preview SHAとmain SHAが同じと推測しない。

### D. Explicit Production

exact latest main SHAからProduction Deploymentを1回作る。

確認:

- Deployment state READY
- custom production domain live
- runtime/API smoke
- task-specific acceptance

Production failure時は原因を診断してから修正版をまとめる。
同じSHAを「念のため」で再deployしない。

## 7. No-deploy changes

原則Vercel Deployment不要:

- docs only
- comments only
- test fixture only
- non-runtime research / planning docs
- Company OS routing docs
- GitHub workflow documentation-only changes

ただしVercel runtime / build / GitHub Action実挙動そのものを検証する必要がある場合は明示Previewを許可する。

## 8. Environment variable changes

Vercel runtimeが新env snapshotを必要とする変更ではfresh Deploymentが必要な場合がある。

その場合も:

1. env存在確認
2. target確認
3. secret値は出力しない
4. 変更完了後に1回だけ明示deploy

env設定を試行錯誤するたびにredeployしない。

## 9. Preview failure rule

PreviewがFAILした場合:

- Code failure -> local/CIで修正をまとめ、次のCandidateを1回deploy
- External service failure -> 同じPreviewを使って再確認
- Credential / permission failure -> 設定を修復し、fresh runtime snapshotが必要な場合のみ再deploy
- Vercel quota / platform failure -> deployを繰り返さずBLOCKEDとして止める

## 10. Emergency exception

Production incidentで重大な顧客影響がある場合のみPreview省略可。

必須:

- Incident理由
- exact main/hotfix SHA
- local/CI PASS
- rollback target
- Production smoke
- Company Timeline記録

「急いでいる」はIncident理由ではない。

## 11. Work / Agent contract

THE REV.のcoding agent / ChatGPT Workは次を守る。

- intermediate commitごとにVercelを作らない
- PRを作っただけでPreviewを要求しない
- Acceptance Candidateが固まるまでGitHub CIを使う
- Vercelを使う直前に24h deployment countを確認
- Preview/ProductionのDeployment IDを最終報告へ含める
- `main != production`
- `READY != accepted`
- `deployment attempted != deployed`

## 12. Acceptance

このPolicy自体のAcceptance:

- `vercel.json git.deploymentEnabled === false`
- Preview QAはpush triggerを持たない
- Preview QAは明示URL / SHAを要求する
- CIにrelease-policy regression testがある
- Agent canonからこのRunbookへ到達できる

Static contract:
`npm run test:vercel-release-policy`
