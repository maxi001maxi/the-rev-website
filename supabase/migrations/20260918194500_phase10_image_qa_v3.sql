-- Phase 10 v3: visual/text QA metadata for generated article images
alter table public.admin_article_drafts
  add column if not exists image_qa jsonb,
  add column if not exists image_attempts integer;
