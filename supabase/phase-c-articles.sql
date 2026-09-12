-- THE REV. Editorial Console — Phase C: Admin Draft Workspace
-- Supabaseの SQL Editor（https://supabase.com/dashboard/project/_/sql/new）に
-- このファイルの内容をそのまま貼り付けて実行してください。
--
-- 役割：
--   admin_article_drafts は「Adminで書いている下書き」を保存するテーブルです。
--   公開サイトのSource of Truthは引き続き GitHub の content/blog/*.md であり、
--   このテーブルはPhase D（GitHub同期）が実装されるまでの作業スペースです。
--   status は Phase C では 'draft' のみを許可します（CHECK制約でDBレベルでも強制）。

-- ---------------------------------------------------------------------------
-- 1. テーブル
-- ---------------------------------------------------------------------------
create table if not exists public.admin_article_drafts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- Blog Front Matter 相当のフィールド（scripts/build-blog.mjs のFront Matter仕様と互換）
  title         text not null default '',
  slug          text not null default '' check (slug = '' or slug ~ '^[a-z0-9-]+$'),
  description   text not null default '',
  published     date,
  updated       date,
  category      text check (category is null or category in ('training','boxing','recovery','body-knowledge')),
  category_label text,
  author        text not null default 'THE REV. CONDITIONING LAB.',
  author_role   text,
  thumbnail     text,
  og_image      text,
  status        text not null default 'draft' check (status = 'draft'), -- Phase Cではdraft固定。published化はPhase Dで別途対応
  featured      boolean not null default false,
  cta_type      text check (cta_type is null or cta_type in ('personal-training','boxing','recovery','general')),
  keywords      text[] not null default '{}',
  canonical     text,
  noindex       boolean not null default false,

  body_markdown text not null default '',

  -- Phase D（GitHub同期）で使用する予定のフィールド。Phase Cでは未使用（常にnull）
  source_path   text,
  source_sha    text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- slugは（空文字を除き）全ユーザー横断で一意。公開記事URLの衝突を防ぐため。
create unique index if not exists admin_article_drafts_slug_key
  on public.admin_article_drafts (slug)
  where slug <> '';

create index if not exists admin_article_drafts_user_id_idx
  on public.admin_article_drafts (user_id);

-- ---------------------------------------------------------------------------
-- 2. updated_at 自動更新
-- ---------------------------------------------------------------------------
create or replace function public.admin_article_drafts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.admin_article_drafts;
create trigger set_updated_at
  before update on public.admin_article_drafts
  for each row
  execute function public.admin_article_drafts_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
--    「自分（auth.uid() = user_id）の下書きだけ」SELECT/INSERT/UPDATE/DELETEできる。
--    Ver.1.0は1ユーザー運用だが、RLSは省略しない。
-- ---------------------------------------------------------------------------
alter table public.admin_article_drafts enable row level security;

drop policy if exists "select own drafts" on public.admin_article_drafts;
create policy "select own drafts"
  on public.admin_article_drafts
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own drafts" on public.admin_article_drafts;
create policy "insert own drafts"
  on public.admin_article_drafts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own drafts" on public.admin_article_drafts;
create policy "update own drafts"
  on public.admin_article_drafts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own drafts" on public.admin_article_drafts;
create policy "delete own drafts"
  on public.admin_article_drafts
  for delete
  using (auth.uid() = user_id);
