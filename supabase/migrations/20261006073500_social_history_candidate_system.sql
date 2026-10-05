-- THE REV. Social Director v0.5
create table if not exists public.social_published_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'INSTAGRAM',
  platform_account_id text,
  platform_media_id text not null,
  permalink text,
  published_at timestamptz,
  media_type text,
  format text,
  title text,
  topic text,
  angle text,
  hook text,
  main_claim text,
  caption text,
  content_lane text,
  territory text,
  ownership text,
  source text not null default 'UNKNOWN',
  source_ref text,
  semantic_status text not null default 'RAW',
  raw_json jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  unique(platform, platform_media_id)
);
create index if not exists social_published_posts_published_at_idx
  on public.social_published_posts (published_at desc);

create table if not exists public.social_post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_published_posts(id) on delete cascade,
  observed_at timestamptz not null default now(),
  reach bigint,
  views bigint,
  likes bigint,
  saves bigint,
  shares bigint,
  comments bigint,
  profile_visits bigint,
  website_clicks bigint,
  follows bigint,
  source text not null default 'UNKNOWN',
  raw_json jsonb not null default '{}'::jsonb
);
create index if not exists social_post_metrics_post_time_idx
  on public.social_post_metrics (post_id, observed_at desc);

create table if not exists public.social_reel_candidate_batches (
  id uuid primary key default gen_random_uuid(),
  target_date date not null unique,
  phase text not null default 'STORE_AWARENESS_BUILD',
  status text not null default 'OPEN',
  source_context jsonb not null default '{}'::jsonb,
  notification_status text,
  notified_at timestamptz,
  selected_candidate_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_reel_candidates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.social_reel_candidate_batches(id) on delete cascade,
  candidate_no integer not null,
  title text not null,
  territory text not null,
  business_job text,
  audience_state text,
  hook text,
  why_now text,
  difference_from_history text,
  asset_plan text,
  estimated_shoot_minutes integer,
  score numeric,
  status text not null default 'CANDIDATE',
  production_plan jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  selected_at timestamptz,
  unique(batch_id, candidate_no)
);
create index if not exists social_reel_candidates_batch_idx
  on public.social_reel_candidates (batch_id, candidate_no);

alter table public.social_published_posts enable row level security;
alter table public.social_post_metrics enable row level security;
alter table public.social_reel_candidate_batches enable row level security;
alter table public.social_reel_candidates enable row level security;