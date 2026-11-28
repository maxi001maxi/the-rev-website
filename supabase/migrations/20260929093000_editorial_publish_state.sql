-- Editorial publication state: separate human-approved GitHub commit from
-- production-live verification. The Supabase draft remains status='draft'
-- because that legacy column is constrained to draft; these fields are the
-- durable publication evidence for Editorial AI.

alter table public.admin_article_drafts
  add column if not exists publish_status text not null default 'NOT_PUBLISHED',
  add column if not exists publish_commit_sha text,
  add column if not exists published_content_sha text,
  add column if not exists published_url text,
  add column if not exists publish_committed_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists publish_verified_at timestamptz;

do $$
begin
  alter table public.admin_article_drafts
    add constraint admin_article_drafts_publish_status_check
    check (publish_status in ('NOT_PUBLISHED', 'PUBLISH_COMMITTED', 'PUBLISHED'));
exception
  when duplicate_object then null;
end $$;

-- Existing source_path/source_sha values are written only after a successful
-- GitHub publish/update. Treat them as committed, then let the reconciler
-- verify the production URL before promoting to PUBLISHED.
update public.admin_article_drafts
set
  publish_status = 'PUBLISH_COMMITTED',
  published_url = coalesce(
    published_url,
    case when nullif(slug, '') is not null
      then 'https://therev-lab.com/blog/' || slug || '/'
      else null
    end
  ),
  publish_committed_at = coalesce(publish_committed_at, updated_at, now())
where source_path is not null
  and coalesce(publish_status, 'NOT_PUBLISHED') = 'NOT_PUBLISHED';
