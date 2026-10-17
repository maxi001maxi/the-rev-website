-- THE REV. Editorial Console — Phase 9: Editorial AI bridge metadata
--
-- Adds idempotent source tracking for drafts created/updated by the
-- Google Apps Script Editorial AI. Public-site Source of Truth remains
-- GitHub content/blog/*.md; these columns only track Working Draft sync.

alter table public.admin_article_drafts
  add column if not exists editorial_source text,
  add column if not exists editorial_content_id text,
  add column if not exists editorial_week_start date,
  add column if not exists editorial_sync_hash text,
  add column if not exists editorial_synced_at timestamptz;

create unique index if not exists admin_article_drafts_editorial_source_content_key
  on public.admin_article_drafts (editorial_source, editorial_content_id)
  where editorial_source is not null and editorial_content_id is not null;

create index if not exists admin_article_drafts_editorial_synced_at_idx
  on public.admin_article_drafts (editorial_synced_at desc)
  where editorial_synced_at is not null;
