create table if not exists public.social_director_daily_plans (
  id uuid primary key default gen_random_uuid(),
  target_date date not null,
  run_mode text not null default 'SHADOW',
  planner_version text not null default 'v0.9',
  opportunity_plan_id uuid references public.social_opportunity_daily_plans(id) on delete set null,
  status text not null default 'OPEN',
  channel_states jsonb not null default '{}'::jsonb,
  workload_budget_minutes integer,
  estimated_workload_minutes integer not null default 0,
  cross_channel_qc jsonb not null default '{}'::jsonb,
  source_context jsonb not null default '{}'::jsonb,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(target_date,run_mode),
  constraint social_director_daily_plans_mode_chk check (run_mode in ('SHADOW','PRODUCTION')),
  constraint social_director_daily_plans_status_chk check (status in ('OPEN','READY','REVIEW_REQUIRED','HOLD')),
  constraint social_director_daily_plans_budget_chk check (workload_budget_minutes is null or workload_budget_minutes between 0 and 600),
  constraint social_director_daily_plans_estimated_chk check (estimated_workload_minutes between 0 and 600)
);

create table if not exists public.social_director_channel_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.social_director_daily_plans(id) on delete cascade,
  opportunity_id uuid not null references public.social_opportunities(id) on delete restrict,
  channel text not null,
  assignment_role text not null,
  channel_job text not null,
  angle_key text not null,
  message_key text not null,
  claim_focus text not null,
  rationale text not null,
  expected_behavior text,
  priority integer not null default 1,
  estimated_work_minutes integer not null default 0,
  evidence_keys text[] not null default '{}'::text[],
  qc_decision text not null default 'READY',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(plan_id,opportunity_id,channel),
  unique(plan_id,channel,priority),
  constraint social_director_assignment_channel_chk check (channel in ('REEL','STORIES','THREADS')),
  constraint social_director_assignment_role_chk check (assignment_role in ('LEAD','SUPPORT')),
  constraint social_director_assignment_priority_chk check (priority between 1 and 5),
  constraint social_director_assignment_work_chk check (estimated_work_minutes between 0 and 240),
  constraint social_director_assignment_qc_chk check (qc_decision in ('READY','REVIEW_REQUIRED','BLOCKED','HOLD'))
);
create index if not exists social_director_assignments_plan_idx
  on public.social_director_channel_assignments(plan_id,channel,priority);
create index if not exists social_director_assignments_opportunity_idx
  on public.social_director_channel_assignments(opportunity_id);

alter table public.social_reel_evidence_candidates
  add column if not exists director_assignment_id uuid
  references public.social_director_channel_assignments(id) on delete set null;

alter table public.social_story_evidence_items
  add column if not exists director_assignment_id uuid
  references public.social_director_channel_assignments(id) on delete set null;

alter table public.social_thread_candidates
  add column if not exists opportunity_id uuid
  references public.social_opportunities(id) on delete set null;

alter table public.social_thread_candidates
  add column if not exists director_assignment_id uuid
  references public.social_director_channel_assignments(id) on delete set null;

create index if not exists social_reel_evidence_candidates_assignment_idx
  on public.social_reel_evidence_candidates(director_assignment_id);
create index if not exists social_story_evidence_items_assignment_idx
  on public.social_story_evidence_items(director_assignment_id);
create index if not exists social_thread_candidates_opportunity_idx
  on public.social_thread_candidates(opportunity_id);
create index if not exists social_thread_candidates_assignment_idx
  on public.social_thread_candidates(director_assignment_id);

alter table public.social_director_daily_plans enable row level security;
alter table public.social_director_channel_assignments enable row level security;

revoke all on table public.social_director_daily_plans from anon, authenticated;
revoke all on table public.social_director_channel_assignments from anon, authenticated;

grant select,insert,update,delete on table public.social_director_daily_plans to service_role;
grant select,insert,update,delete on table public.social_director_channel_assignments to service_role;
