-- THE REV. Social Director v0.8 Phase 2 — Evidence-first Reel / Stories shadow runtime

create table if not exists public.social_reel_evidence_runs (
  id uuid primary key default gen_random_uuid(),
  target_date date not null,
  run_mode text not null default 'SHADOW',
  planner_version text not null default 'v0.8',
  opportunity_plan_id uuid references public.social_opportunity_daily_plans(id) on delete set null,
  status text not null default 'OPEN',
  source_context jsonb not null default '{}'::jsonb,
  hold_reason text,
  selected_candidate_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(target_date,run_mode),
  constraint social_reel_evidence_runs_mode_chk check (run_mode in ('SHADOW','PRODUCTION')),
  constraint social_reel_evidence_runs_status_chk check (status in ('OPEN','READY','HOLD','SELECTED'))
);

create table if not exists public.social_reel_evidence_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.social_reel_evidence_runs(id) on delete cascade,
  candidate_no integer not null,
  opportunity_id uuid not null references public.social_opportunities(id) on delete restrict,
  creative_direction text not null,
  title text not null,
  hook text,
  core_message text,
  why_this_execution text not null,
  difference_from_history text,
  asset_plan text,
  estimated_shoot_minutes integer,
  business_job text,
  audience_state text,
  fact text,
  interpretation text,
  hypothesis text,
  expected_behavior text,
  confidence text not null default 'LOW',
  evidence_strength text not null,
  evidence_gaps text[] not null default '{}'::text[],
  test_metrics text[] not null default '{}'::text[],
  claim_refs text[] not null default '{}'::text[],
  generalization_flags text[] not null default '{}'::text[],
  qc_decision text not null default 'REVIEW_REQUIRED',
  status text not null default 'CANDIDATE',
  production_plan jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  selected_at timestamptz,
  unique(run_id,candidate_no),
  constraint social_reel_evidence_candidates_no_chk check (candidate_no between 1 and 5),
  constraint social_reel_evidence_candidates_confidence_chk check (confidence in ('HIGH','MEDIUM','LOW')),
  constraint social_reel_evidence_candidates_strength_chk check (evidence_strength in ('GROUNDED','EXPLORATORY','UNGROUNDED')),
  constraint social_reel_evidence_candidates_qc_chk check (qc_decision in ('READY_FOR_APPROVAL','REVIEW_REQUIRED','BLOCKED','HOLD')),
  constraint social_reel_evidence_candidates_status_chk check (status in ('CANDIDATE','SELECTED','REJECTED')),
  constraint social_reel_evidence_candidates_shoot_chk check (estimated_shoot_minutes is null or estimated_shoot_minutes between 0 and 240)
);
create index if not exists social_reel_evidence_candidates_run_idx
  on public.social_reel_evidence_candidates (run_id,candidate_no);
create index if not exists social_reel_evidence_candidates_opportunity_idx
  on public.social_reel_evidence_candidates (opportunity_id);

alter table public.social_reel_evidence_runs
  add constraint social_reel_evidence_runs_selected_candidate_fkey
  foreign key (selected_candidate_id)
  references public.social_reel_evidence_candidates(id)
  on delete set null;

create table if not exists public.social_story_evidence_runs (
  id uuid primary key default gen_random_uuid(),
  target_date date not null,
  run_mode text not null default 'SHADOW',
  planner_version text not null default 'v0.8',
  opportunity_plan_id uuid references public.social_opportunity_daily_plans(id) on delete set null,
  status text not null default 'OPEN',
  source_context jsonb not null default '{}'::jsonb,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(target_date,run_mode),
  constraint social_story_evidence_runs_mode_chk check (run_mode in ('SHADOW','PRODUCTION')),
  constraint social_story_evidence_runs_status_chk check (status in ('OPEN','READY','HOLD'))
);

create table if not exists public.social_story_evidence_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.social_story_evidence_runs(id) on delete cascade,
  slot_no integer not null,
  opportunity_id uuid not null references public.social_opportunities(id) on delete restrict,
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
  source_signal text not null,
  why_today text not null,
  expected_behavior text,
  confidence text not null default 'LOW',
  evidence_strength text not null,
  evidence_gaps text[] not null default '{}'::text[],
  recent_pattern_difference text,
  test_metrics text[] not null default '{}'::text[],
  claim_refs text[] not null default '{}'::text[],
  generalization_flags text[] not null default '{}'::text[],
  qc_decision text not null default 'REVIEW_REQUIRED',
  status text not null default 'PLANNED',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id,slot_no),
  constraint social_story_evidence_items_slot_chk check (slot_no between 1 and 3),
  constraint social_story_evidence_items_interaction_chk check (interaction in ('NONE','POLL','QUESTION','QUIZ','LINK','DM')),
  constraint social_story_evidence_items_confidence_chk check (confidence in ('HIGH','MEDIUM','LOW')),
  constraint social_story_evidence_items_strength_chk check (evidence_strength in ('GROUNDED','EXPLORATORY','UNGROUNDED')),
  constraint social_story_evidence_items_qc_chk check (qc_decision in ('READY_FOR_APPROVAL','REVIEW_REQUIRED','BLOCKED','HOLD')),
  constraint social_story_evidence_items_status_chk check (status in ('PLANNED','HOLD'))
);
create index if not exists social_story_evidence_items_run_idx
  on public.social_story_evidence_items (run_id,slot_no);
create index if not exists social_story_evidence_items_opportunity_idx
  on public.social_story_evidence_items (opportunity_id);

alter table public.social_reel_evidence_runs enable row level security;
alter table public.social_reel_evidence_candidates enable row level security;
alter table public.social_story_evidence_runs enable row level security;
alter table public.social_story_evidence_items enable row level security;

revoke all on table public.social_reel_evidence_runs from anon, authenticated;
revoke all on table public.social_reel_evidence_candidates from anon, authenticated;
revoke all on table public.social_story_evidence_runs from anon, authenticated;
revoke all on table public.social_story_evidence_items from anon, authenticated;

grant select,insert,update,delete on table public.social_reel_evidence_runs to service_role;
grant select,insert,update,delete on table public.social_reel_evidence_candidates to service_role;
grant select,insert,update,delete on table public.social_story_evidence_runs to service_role;
grant select,insert,update,delete on table public.social_story_evidence_items to service_role;
