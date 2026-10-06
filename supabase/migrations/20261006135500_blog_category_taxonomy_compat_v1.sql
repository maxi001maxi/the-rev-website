-- THE REV. COLUMN Category Architecture v1.0
-- Compatibility gate: allow the legacy category during the application deploy window,
-- while also permitting the new categories. The final migration removes body-knowledge.
begin;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.admin_article_drafts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
      and pg_get_constraintdef(oid) not ilike '%category_label%'
  loop
    execute format('alter table public.admin_article_drafts drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.admin_article_drafts
  add constraint admin_article_drafts_category_check
  check (
    category is null
    or category in (
      'training',
      'health',
      'gym-guide',
      'recovery',
      'boxing',
      'body-knowledge'
    )
  );

commit;
