alter table public.social_published_posts
  add column if not exists reel_evidence_candidate_id uuid
  references public.social_reel_evidence_candidates(id) on delete set null;

alter table public.social_published_posts
  add column if not exists story_evidence_item_id uuid
  references public.social_story_evidence_items(id) on delete set null;

alter table public.social_published_posts
  add column if not exists director_assignment_id uuid
  references public.social_director_channel_assignments(id) on delete set null;

alter table public.social_published_posts
  add column if not exists opportunity_id uuid
  references public.social_opportunities(id) on delete set null;

create index if not exists social_published_posts_reel_evidence_idx
  on public.social_published_posts(reel_evidence_candidate_id);
create index if not exists social_published_posts_story_evidence_idx
  on public.social_published_posts(story_evidence_item_id);
create index if not exists social_published_posts_director_idx
  on public.social_published_posts(director_assignment_id);
create index if not exists social_published_posts_opportunity_idx
  on public.social_published_posts(opportunity_id);

alter table public.social_reel_evidence_candidates
  add column if not exists published_post_id uuid
  references public.social_published_posts(id) on delete set null;
alter table public.social_reel_evidence_candidates
  add column if not exists published_verified_at timestamptz;

alter table public.social_story_evidence_items
  add column if not exists published_post_id uuid
  references public.social_published_posts(id) on delete set null;
alter table public.social_story_evidence_items
  add column if not exists published_verified_at timestamptz;

alter table public.social_reel_evidence_candidates
  drop constraint if exists social_reel_evidence_candidates_status_chk;
alter table public.social_reel_evidence_candidates
  add constraint social_reel_evidence_candidates_status_chk check (
    status in ('CANDIDATE','SELECTED','CREATED','PUBLISHED_VERIFIED','REJECTED')
  );

alter table public.social_story_evidence_items
  drop constraint if exists social_story_evidence_items_status_chk;
alter table public.social_story_evidence_items
  add constraint social_story_evidence_items_status_chk check (
    status in ('PLANNED','APPROVED','CREATED','PUBLISHED_VERIFIED','HOLD')
  );

create table if not exists public.social_learning_observations (
  id uuid primary key default gen_random_uuid(),
  learning_id uuid not null references public.social_production_learnings(id) on delete cascade,
  learning_key text not null,
  source_post_id uuid not null references public.social_published_posts(id) on delete cascade,
  opportunity_id uuid references public.social_opportunities(id) on delete set null,
  director_assignment_id uuid references public.social_director_channel_assignments(id) on delete set null,
  channel text not null,
  direction text not null,
  rationale text not null,
  confidence numeric not null default 0.5,
  performance_snapshot jsonb not null default '{}'::jsonb,
  comparison_context jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(learning_key,source_post_id),
  constraint social_learning_observations_channel_chk check (
    channel in ('REEL','STORIES','THREADS')
  ),
  constraint social_learning_observations_direction_chk check (
    direction in ('SUPPORT','COUNTER','NEUTRAL')
  ),
  constraint social_learning_observations_confidence_chk check (
    confidence >= 0 and confidence <= 1
  )
);
create index if not exists social_learning_observations_learning_idx
  on public.social_learning_observations(learning_id,observed_at desc);
create index if not exists social_learning_observations_post_idx
  on public.social_learning_observations(source_post_id);
create index if not exists social_learning_observations_opportunity_idx
  on public.social_learning_observations(opportunity_id);

create table if not exists public.social_production_acceptance_runs (
  id uuid primary key default gen_random_uuid(),
  target_date date not null,
  planner_version text not null,
  run_mode text not null default 'SHADOW',
  status text not null default 'PENDING',
  deployment_commit_sha text,
  deployment_id text,
  deployment_state text,
  scheduled_task_version text,
  gates jsonb not null default '{}'::jsonb,
  blockers text[] not null default '{}'::text[],
  evidence_refs text[] not null default '{}'::text[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique(target_date,planner_version,run_mode),
  constraint social_production_acceptance_mode_chk check (
    run_mode in ('SHADOW','PRODUCTION')
  ),
  constraint social_production_acceptance_status_chk check (
    status in ('PENDING','BLOCKED','READY_FOR_CUTOVER','ACCEPTED')
  )
);

alter table public.social_learning_observations enable row level security;
alter table public.social_production_acceptance_runs enable row level security;

revoke all on table public.social_learning_observations from anon, authenticated;
revoke all on table public.social_production_acceptance_runs from anon, authenticated;

grant select,insert,update,delete on table public.social_learning_observations to service_role;
grant select,insert,update,delete on table public.social_production_acceptance_runs to service_role;
