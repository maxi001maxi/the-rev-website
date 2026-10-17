-- THE REV. Editorial Console — shared admin access
--
-- Multiple explicitly registered admin accounts may view/edit the same Working Drafts.
-- Publish permission is controlled by admin_members.can_publish.

create table if not exists public.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_publish boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_members enable row level security;

drop policy if exists "select own admin membership" on public.admin_members;
create policy "select own admin membership"
  on public.admin_members
  for select
  using (auth.uid() = user_id);

-- Explicit admin members share Editorial Console drafts.
drop policy if exists "select own drafts" on public.admin_article_drafts;
drop policy if exists "select admin drafts" on public.admin_article_drafts;
create policy "select admin drafts"
  on public.admin_article_drafts
  for select
  using (
    exists (
      select 1 from public.admin_members m
      where m.user_id = auth.uid() and m.active = true
    )
  );

drop policy if exists "insert own drafts" on public.admin_article_drafts;
drop policy if exists "insert admin drafts" on public.admin_article_drafts;
create policy "insert admin drafts"
  on public.admin_article_drafts
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.admin_members m
      where m.user_id = auth.uid() and m.active = true
    )
  );

drop policy if exists "update own drafts" on public.admin_article_drafts;
drop policy if exists "update admin drafts" on public.admin_article_drafts;
create policy "update admin drafts"
  on public.admin_article_drafts
  for update
  using (
    exists (
      select 1 from public.admin_members m
      where m.user_id = auth.uid() and m.active = true
    )
  )
  with check (
    exists (
      select 1 from public.admin_members m
      where m.user_id = auth.uid() and m.active = true
    )
  );

drop policy if exists "delete own drafts" on public.admin_article_drafts;
drop policy if exists "delete admin drafts" on public.admin_article_drafts;
create policy "delete admin drafts"
  on public.admin_article_drafts
  for delete
  using (
    exists (
      select 1 from public.admin_members m
      where m.user_id = auth.uid() and m.active = true
    )
  );
