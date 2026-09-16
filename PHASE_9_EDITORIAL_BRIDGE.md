# Phase 9｜Editorial AI → Webサイト公開ブリッジ

## 目的

Google Sheets / Apps Script の `THE REV. Editorial AI` が生成した **READY + Fact Gate PASS + Topic Gate PUBLISH** のWeb記事を、THE REV. Webサイトの Editorial Console（Supabase Working Draft）へ安全に同期する。

このPhaseでは **自動公開しない**。同期先はあくまでWorking Draftで、公開は既存の

`Review & Publish → Preflight → GitHub content/blog/*.md → Vercel`

を使う。`human_approval = TRUE / auto_publish = FALSE` を維持する。

---

## 全体フロー

```text
Editorial AI
  21_WEB_BLOG_OUTPUT: READY
  Fact Gate: PASS
  Topic Gate: PUBLISH
        ↓
GAS Web Bridge Sync
        ↓ HTTPS / Bearer secret
POST /api/integrations/editorial
        ↓
Supabase admin_article_drafts
  Working Draft created / updated
        ↓
/admin/articles/review/?id=...
        ↓ 人間確認
Publish
        ↓
GitHub content/blog/{slug}.md
        ↓
Vercel
        ↓
therev-lab.com/blog/{slug}/
```

---

## Website側の追加物

### API

`POST /api/integrations/editorial`

- `Authorization: Bearer <EDITORIAL_BRIDGE_SECRET>` 必須
- `READY / PASS / PUBLISH` 以外は422で拒否
- `content_id` を外部IDとして同一記事をidempotentに同期
- 既存の無関係なDraftとslugが衝突した場合は409で停止
- GitHubへのPublishは行わない
- 成功時に `article.id`, `review_url`, `editor_url` を返す

### DB metadata

`admin_article_drafts` に以下を追加：

- `editorial_source`
- `editorial_content_id`
- `editorial_week_start`
- `editorial_sync_hash`
- `editorial_synced_at`

`(editorial_source, editorial_content_id)` はunique。

---

## Vercel環境変数

既存：

- `SUPABASE_URL`
- `ADMIN_PUBLISHER_USER_ID`

Phase 9で追加：

- `SUPABASE_SERVICE_ROLE_KEY`
  - Supabase Dashboardのsecret/service-role key
  - **Vercel Functionだけで使用。ブラウザへ出さない**
- `EDITORIAL_BRIDGE_SECRET`
  - GASとVercelだけが共有する長いランダム文字列
  - LINE token / OpenAI key / Supabase keyとは別にする

環境変数を追加したらVercelをRedeployする。

---

## Supabase migration

`supabase/migrations/20260916190000_phase_9_editorial_bridge.sql`

本番DBへ適用してからBridgeを有効化する。

---

## GAS側で送るpayload

```json
{
  "content_id": "BLOG-20260914-...",
  "week_start": "2026-09-14",
  "editorial_status": "READY",
  "fact_check_status": "PASS",
  "topic_gate_decision": "PUBLISH",
  "editor_score": 93,
  "topic_gate_score": 83,
  "title": "...",
  "slug": "...",
  "description": "...",
  "body_markdown": "...",
  "category": "training",
  "cta_type": "personal-training",
  "published": "2026-09-15",
  "updated": "2026-09-15",
  "keywords": ["仕事終わり 筋トレ 疲れてる 行くべき"],
  "primary_query": "仕事終わり 筋トレ 疲れてる 行くべき",
  "article_type": "STANDARD",
  "source_doc_url": "https://docs.google.com/..."
}
```

---

## 安全設計

1. Secret未設定は503（fail closed）
2. 認証不一致は401
3. Editorial Gate未通過は422
4. unrelated slug conflictは409
5. BridgeはSupabase Draftまで。GitHub Publishはしない
6. Web公開の最終操作は既存のPublisher認証 + Preflight + 人間承認を必須とする
7. Service-role key / Bridge secretはレスポンスやログへ出さない

---

## 検証

```bash
npm run test:phase-9
npm run test:phase-d
npm run build:blog
```

その後、GASから1件だけ同期し、返却された `review_url` を開いて本文・タイトル・slug・category・CTA・日付を確認する。

最初のE2EではPublishボタンを押す前に止め、Draft同期だけを確認する。
