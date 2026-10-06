-- THE REV. Social Director v0.7 — Evidence-first Threads runtime

create table if not exists public.social_customer_signals (
  id uuid primary key default gen_random_uuid(),
  observed_at timestamptz not null default now(),
  source_type text not null,
  audience_state text,
  tension text,
  question text,
  desired_outcome text,
  decision_barrier text,
  attraction text,
  anonymized_quote text,
  source_ref text,
  confidence numeric not null default 0.5,
  consent_scope text not null default 'INTERNAL_ONLY',
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_customer_signals_source_type_chk check (
    source_type in ('TRIAL','INQUIRY','CONSULTATION','FEEDBACK','DM','LINE','IN_PERSON','SURVEY')
  ),
  constraint social_customer_signals_confidence_chk check (confidence >= 0 and confidence <= 1),
  constraint social_customer_signals_consent_chk check (
    consent_scope in ('INTERNAL_ONLY','ANONYMIZED_SOCIAL','EXPLICIT_PUBLIC')
  )
);
create index if not exists social_customer_signals_observed_idx
  on public.social_customer_signals (observed_at desc);
create index if not exists social_customer_signals_tags_idx
  on public.social_customer_signals using gin (tags);

create table if not exists public.social_thread_daily_plans (
  id uuid primary key default gen_random_uuid(),
  target_date date not null unique,
  status text not null default 'OPEN',
  primary_theme text,
  source_context jsonb not null default '{}'::jsonb,
  hold_reason text,
  selected_candidate_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_thread_daily_plans_status_chk check (
    status in ('OPEN','READY','HOLD','SELECTED','PUBLISHED_VERIFIED')
  )
);

create table if not exists public.social_thread_evidence (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.social_thread_daily_plans(id) on delete cascade,
  evidence_key text not null,
  source_type text not null,
  source_ref text,
  source_date timestamptz,
  freshness text,
  audience_state text,
  topic text,
  signal text,
  evidence_text text not null,
  truth_authority integer,
  decision_relevance integer,
  confidence numeric not null default 0.5,
  privacy_scope text not null default 'INTERNAL',
  allowed_use text not null default 'INTERNAL_REASONING',
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(plan_id, evidence_key),
  constraint social_thread_evidence_source_type_chk check (
    source_type in (
      'CUSTOMER_SIGNAL','PERFORMANCE','OPERATOR_FIRST_PARTY','STORE_EVENT',
      'FACT_REGISTRY','RESEARCH_CANON','RAW_RESEARCH','TREND_SIGNAL','PRODUCTION_LEARNING'
    )
  ),
  constraint social_thread_evidence_truth_chk check (
    truth_authority is null or truth_authority between 1 and 6
  ),
  constraint social_thread_evidence_relevance_chk check (
    decision_relevance is null or decision_relevance between 1 and 8
  ),
  constraint social_thread_evidence_confidence_chk check (confidence >= 0 and confidence <= 1),
  constraint social_thread_evidence_privacy_chk check (
    privacy_scope in ('PUBLIC','INTERNAL','CONFIDENTIAL')
  ),
  constraint social_thread_evidence_use_chk check (
    allowed_use in ('INTERNAL_REASONING','PARAPHRASE_OK','PUBLIC_QUOTE_OK')
  )
);
create index if not exists social_thread_evidence_plan_idx
  on public.social_thread_evidence (plan_id, decision_relevance, confidence desc);
create index if not exists social_thread_evidence_tags_idx
  on public.social_thread_evidence using gin (tags);

create table if not exists public.social_thread_candidates (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.social_thread_daily_plans(id) on delete cascade,
  candidate_no integer not null,
  title text not null,
  content_job text not null,
  secondary_jobs text[] not null default '{}'::text[],
  draft_text text,
  why_now text not null,
  audience_signal text,
  observed_tension text,
  interpretation text,
  hypothesis text,
  expected_behavior text,
  confidence text not null default 'LOW',
  evidence_strength text not null,
  evidence_gaps text[] not null default '{}'::text[],
  test_metrics text[] not null default '{}'::text[],
  counterevidence_summary text,
  generalization_flags text[] not null default '{}'::text[],
  qc_decision text not null default 'REVIEW_REQUIRED',
  status text not null default 'CANDIDATE',
  evidence_packet jsonb not null default '{}'::jsonb,
  source_refs text[] not null default '{}'::text[],
  research_refs text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  selected_at timestamptz,
  unique(plan_id, candidate_no),
  constraint social_thread_candidates_no_chk check (candidate_no between 1 and 5),
  constraint social_thread_candidates_content_job_chk check (
    content_job in (
      'PERSPECTIVE_JUDGMENT','FIELD_NOTE_OBSERVATION','MINI_KNOWLEDGE_THROUGH_JUDGMENT',
      'HUMAN_TEXTURE','CONVERSATION','LOCAL_CONTEXT','STORE_PROCESS_EXPERIENCE','LIGHT_PROMOTION'
    )
  ),
  constraint social_thread_candidates_confidence_chk check (
    confidence in ('HIGH','MEDIUM','LOW')
  ),
  constraint social_thread_candidates_strength_chk check (
    evidence_strength in ('GROUNDED','EXPLORATORY','UNGROUNDED')
  ),
  constraint social_thread_candidates_qc_chk check (
    qc_decision in ('READY_FOR_APPROVAL','REVIEW_REQUIRED','BLOCKED','HOLD')
  ),
  constraint social_thread_candidates_status_chk check (
    status in ('CANDIDATE','SELECTED','REJECTED','READY','PUBLISHED_VERIFIED')
  )
);
create index if not exists social_thread_candidates_plan_idx
  on public.social_thread_candidates (plan_id, candidate_no);

create table if not exists public.social_thread_candidate_evidence (
  candidate_id uuid not null references public.social_thread_candidates(id) on delete cascade,
  evidence_id uuid not null references public.social_thread_evidence(id) on delete cascade,
  evidence_role text not null,
  created_at timestamptz not null default now(),
  primary key(candidate_id,evidence_id,evidence_role),
  constraint social_thread_candidate_evidence_role_chk check (
    evidence_role in ('PRIMARY','CORROBORATING','COUNTEREVIDENCE')
  )
);
create index if not exists social_thread_candidate_evidence_candidate_idx
  on public.social_thread_candidate_evidence (candidate_id, evidence_role);

alter table public.social_thread_daily_plans
  add constraint social_thread_daily_plans_selected_candidate_fkey
  foreign key (selected_candidate_id) references public.social_thread_candidates(id) on delete set null;

alter table public.social_published_posts
  add column if not exists thread_candidate_id uuid references public.social_thread_candidates(id) on delete set null;
create index if not exists social_published_posts_thread_candidate_idx
  on public.social_published_posts (thread_candidate_id)
  where thread_candidate_id is not null;

alter table public.social_customer_signals enable row level security;
alter table public.social_thread_daily_plans enable row level security;
alter table public.social_thread_evidence enable row level security;
alter table public.social_thread_candidates enable row level security;
alter table public.social_thread_candidate_evidence enable row level security;

revoke all on table public.social_customer_signals from anon, authenticated;
revoke all on table public.social_thread_daily_plans from anon, authenticated;
revoke all on table public.social_thread_evidence from anon, authenticated;
revoke all on table public.social_thread_candidates from anon, authenticated;
revoke all on table public.social_thread_candidate_evidence from anon, authenticated;

grant select, insert, update, delete on table public.social_customer_signals to service_role;
grant select, insert, update, delete on table public.social_thread_daily_plans to service_role;
grant select, insert, update, delete on table public.social_thread_evidence to service_role;
grant select, insert, update, delete on table public.social_thread_candidates to service_role;
grant select, insert, update, delete on table public.social_thread_candidate_evidence to service_role;
