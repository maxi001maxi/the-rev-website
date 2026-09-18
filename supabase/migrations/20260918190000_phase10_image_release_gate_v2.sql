-- Phase 10 v2: image release gate + render metadata
alter table public.admin_article_drafts
  add column if not exists image_status text,
  add column if not exists image_render_version text,
  add column if not exists image_strategy text,
  add column if not exists image_source_path text,
  add column if not exists image_asset_ready boolean not null default false,
  add column if not exists image_checked_at timestamptz,
  add column if not exists image_last_error text;

update public.admin_article_drafts
set
  image_status = coalesce(image_status, case when thumbnail is not null and og_image is not null then 'LEGACY_READY' else 'PENDING' end),
  image_asset_ready = case
    when thumbnail is not null and og_image is not null then true
    else image_asset_ready
  end
where image_status is null
   or (image_asset_ready = false and thumbnail is not null and og_image is not null);
