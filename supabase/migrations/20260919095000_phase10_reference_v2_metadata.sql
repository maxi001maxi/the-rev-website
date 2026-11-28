-- Phase 10 Reference V2
alter table public.admin_article_drafts
  add column if not exists image_qa_report_path text,
  add column if not exists image_generation_model text,
  add column if not exists image_qa_model text,
  add column if not exists image_brand_qa_score integer;
