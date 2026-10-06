-- THE REV. Social Director v0.6 — Daily Stories integration

create table if not exists public.social_story_daily_plans (
  id uuid primary key default gen_random_uuid(),
  target_date date not null unique,
  status text not null default 'READY',
  primary_theme text,
  source_context jsonb not null default '{}'::jsonb,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_story_daily_plans_status_chk check (status in ('READY','HOLD'))
);

create table if not exists public.social_story_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.social_story_daily_plans(id) on delete cascade,
  slot_no integer not null,
  role text not null,
  pattern text,
  interaction text not null default 'NONE',
  business_job text,
  audience_state text,
  title text,
  hook text,
  frame_text text,
  asset_plan text,
  posting_window text,
  related_reel_candidate_id uuid references public.social_reel_candidates(id) on delete set null,
  status text not null default 'PLANNED',
  published_post_id uuid references public.social_published_posts(id) on delete set null,
  platform_media_id text,
  published_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, slot_no),
  constraint social_story_items_slot_chk check (slot_no between 1 and 3),
  constraint social_story_items_interaction_chk check (
    interaction in ('NONE','POLL','QUESTION','QUIZ','LINK','DM')
  ),
  constraint social_story_items_status_chk check (
    status in ('PLANNED','CREATED','POSTED_VERIFIED','HOLD')
  )
);

create index if not exists social_story_items_plan_idx
  on public.social_story_items (plan_id, slot_no);

create index if not exists social_story_items_history_idx
  on public.social_story_items (created_at desc, pattern, interaction);

alter table public.social_story_daily_plans enable row level security;
alter table public.social_story_items enable row level security;
