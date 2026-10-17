-- THE REV. Social Director v0.6
-- Production Learning: finalized production state, operational events, reusable learnings,
-- and verified linkage from an actual Instagram post back to the selected Reel candidate.

alter table public.social_reel_candidates
  add column if not exists production_finalized_at timestamptz,
  add column if not exists production_updated_at timestamptz,
  add column if not exists learning_summary jsonb not null default '{}'::jsonb;

alter table public.social_published_posts
  add column if not exists candidate_id uuid references public.social_reel_candidates(id) on delete set null;

create index if not exists social_published_posts_candidate_idx
  on public.social_published_posts (candidate_id)
  where candidate_id is not null;

create table if not exists public.social_production_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.social_reel_candidates(id) on delete cascade,
  event_type text not null,
  event_at timestamptz not null default now(),
  source text not null default 'UNKNOWN',
  idempotency_key text unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint social_production_events_type_chk check (
    event_type in ('FINALIZED','CREATED','SHOT','FEEDBACK','PUBLISHED_VERIFIED')
  )
);
create index if not exists social_production_events_candidate_time_idx
  on public.social_production_events (candidate_id, event_at desc);

create table if not exists public.social_production_learnings (
  id uuid primary key default gen_random_uuid(),
  learning_key text not null unique,
  learning_type text not null,
  scope text not null,
  statement text not null,
  status text not null default 'CANDIDATE',
  confidence numeric not null default 0.5,
  reuse_weight numeric not null default 0.5,
  source_candidate_id uuid references public.social_reel_candidates(id) on delete set null,
  source_post_id uuid references public.social_published_posts(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  observation_count integer not null default 1,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_production_learnings_type_chk check (
    learning_type in ('USER_PREFERENCE','CREATIVE','EDITORIAL','QC','PERFORMANCE','BRAND')
  ),
  constraint social_production_learnings_scope_chk check (
    scope in ('SHARED','STRATEGIST','CREATIVE_DIRECTOR','EDITOR','QC')
  ),
  constraint social_production_learnings_status_chk check (
    status in ('CANDIDATE','ACTIVE','SUPERSEDED','RETIRED')
  ),
  constraint social_production_learnings_confidence_chk check (confidence >= 0 and confidence <= 1),
  constraint social_production_learnings_reuse_chk check (reuse_weight >= 0 and reuse_weight <= 1),
  constraint social_production_learnings_observation_chk check (observation_count >= 1)
);
create index if not exists social_production_learnings_runtime_idx
  on public.social_production_learnings (status, scope, reuse_weight desc, updated_at desc);

alter table public.social_production_events enable row level security;
alter table public.social_production_learnings enable row level security;
