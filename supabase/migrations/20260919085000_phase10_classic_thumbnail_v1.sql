-- Phase 10 Classic V1
-- Stores the design-layer metadata for the original-five-column thumbnail system.
alter table public.admin_article_drafts
  add column if not exists image_style_template text,
  add column if not exists image_headline_short text,
  add column if not exists image_category_label text,
  add column if not exists image_series_label text,
  add column if not exists image_asset_version text,
  add column if not exists image_job_path text;
