-- source_path / source_sha は公開処理(api/admin/publish.mjs)が書く項目。
-- 未公開(NOT_PUBLISHED)の下書きには入れさせない。
-- 管理画面は「source_pathあり＝GitHubに公開済み」と扱うため、未公開で入れると
-- 「GitHub上に記事が見つかりません」エラーになる（2026-11-19 boxing-vs-strength の事例）。
-- 本番へは apply_migration で適用済み。
alter table public.admin_article_drafts
  drop constraint if exists admin_article_drafts_source_path_requires_publish;
alter table public.admin_article_drafts
  add constraint admin_article_drafts_source_path_requires_publish
  check (publish_status <> 'NOT_PUBLISHED' or (source_path is null and source_sha is null));
