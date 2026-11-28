alter table public.admin_article_drafts
  add column if not exists gbp_image text,
  add column if not exists gbp_image_status text,
  add column if not exists gbp_image_checked_at timestamptz,
  add column if not exists gbp_image_qa jsonb,
  add column if not exists gbp_image_asset_version text,
  add column if not exists gbp_image_last_error text,
  add column if not exists gbp_image_attempts integer;

comment on column public.admin_article_drafts.gbp_image is 'GBP latest-update 4:3 image public path (1200x900)';
comment on column public.admin_article_drafts.gbp_image_status is 'GBP image readiness: PREPARING / READY / ERROR';
comment on column public.admin_article_drafts.gbp_image_checked_at is 'Last GBP image readiness check';
comment on column public.admin_article_drafts.gbp_image_qa is 'GBP-specific crop/aspect/copy QA summary';
comment on column public.admin_article_drafts.gbp_image_asset_version is 'Asset version shared with the Editorial Hybrid image set';
comment on column public.admin_article_drafts.gbp_image_last_error is 'Last GBP image generation/readiness error';
comment on column public.admin_article_drafts.gbp_image_attempts is 'GBP image generation/QA attempt count';
