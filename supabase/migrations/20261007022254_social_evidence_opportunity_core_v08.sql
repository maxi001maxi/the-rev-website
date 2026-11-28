-- THE REV. Social Director v0.8 Phase 1 — Shared Evidence & Opportunity Core

create table if not exists public.social_evidence_daily_pools (
  id uuid primary key default gen_random_uuid(),
  target_date date not null unique,
  status text not null default 'OPEN',
  source_context jsonb not null default '{}'::jsonb,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_evidence_daily_pools_status_chk check (
    status in ('OPEN','READY','HOLD')
  )
);

create table if not exists public.social_evidence_items (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.social_evidence_daily_pools(id) on delete cascade,
  evidence_key text not null,
  source_type text not null,
  source_ref text,
  source_date timestamptz,
  freshness text,
  audience_state text,
  topic text,
  signal text,
  evidence_text text not null,
  business_relevance text,
  channel_relevance text[] not null default array['SHARED']::text[],
  truth_authority integer,
  decision_relevance integer,
  confidence numeric not null default 0.5,
  privacy_scope text not null default 'INTERNAL',
  allowed_use text not null default 'INTERNAL_REASONING',
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(pool_id,evidence_key),
  constraint social_evidence_items_source_type_chk check (
    source_type in (
      'CUSTOMER_SIGNAL','PERFORMANCE','OPERATOR_FIRST_PARTY','STORE_EVENT',
      'FACT_REGISTRY','RESEARCH_CANON','RAW_RESEARCH','LOCAL_SIGNAL',
      'TREND_SIGNAL','PRODUCTION_LEARNING'
    )
  ),
  constraint social_evidence_items_truth_chk check (
    truth_authority is null or truth_authority between 1 and 6
  ),
  constraint social_evidence_items_relevance_chk check (
    decision_relevance is null or decision_relevance between 1 and 8
  ),
  constraint social_evidence_items_confidence_chk check (
    confidence >= 0 and confidence <= 1
  ),
  constraint social_evidence_items_privacy_chk check (
    privacy_scope in ('PUBLIC','INTERNAL','CONFIDENTIAL')
  ),
  constraint social_evidence_items_use_chk check (
    allowed_use in ('INTERNAL_REASONING','PARAPHRASE_OK','PUBLIC_QUOTE_OK')
  )
);
create index if not exists social_evidence_items_pool_rank_idx
  on public.social_evidence_items (pool_id,decision_relevance desc,confidence desc);
create index if not exists social_evidence_items_source_idx
  on public.social_evidence_items (source_type,source_date desc);
create index if not exists social_evidence_items_tags_idx
  on public.social_evidence_items using gin(tags);
create index if not exists social_evidence_items_channels_idx
  on public.social_evidence_items using gin(channel_relevance);

create table if not exists public.social_opportunity_daily_plans (
  id uuid primary key default gen_random_uuid(),
  target_date date not null unique,
  evidence_pool_id uuid references public.social_evidence_daily_pools(id) on delete set null,
  status text not null default 'OPEN',
  primary_business_problem text,
  source_context jsonb not null default '{}'::jsonb,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_opportunity_daily_plans_status_chk check (
    status in ('OPEN','READY','HOLD')
  )
);

create table if not exists public.social_opportunities (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.social_opportunity_daily_plans(id) on delete cascade,
  opportunity_no integer not null,
  title text not null,
  business_problem text not null,
  business_job text,
  primary_objective text,
  audience_state text,
  why_now text not null,
  observed_signal text,
  interpretation text,
  hypothesis text,
  expected_behavior text,
  confidence text not null default 'LOW',
  evidence_strength text not null,
  evidence_gaps text[] not null default '{}'::text[],
  possible_channels text[] not null default '{}'::text[],
  channel_scores jsonb not null default '{}'::jsonb,
  test_metrics text[] not null default '{}'::text[],
  counterevidence_summary text,
  generalization_flags text[] not null default '{}'::text[],
  qc_decision text not null default 'REVIEW_REQUIRED',
  status text not null default 'CANDIDATE',
  source_refs text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id,opportunity_no),
  constraint social_opportunities_no_chk check (opportunity_no between 1 and 5),
  constraint social_opportunities_confidence_chk check (
    confidence in ('HIGH','MEDIUM','LOW')
  ),
  constraint social_opportunities_strength_chk check (
    evidence_strength in ('GROUNDED','EXPLORATORY','UNGROUNDED')
  ),
  constraint social_opportunities_qc_chk check (
    qc_decision in ('READY','REVIEW_REQUIRED','BLOCKED','HOLD')
  ),
  constraint social_opportunities_status_chk check (
    status in ('CANDIDATE','RETIRED')
  )
);
create index if not exists social_opportunities_plan_idx
  on public.social_opportunities (plan_id,opportunity_no);
create index if not exists social_opportunities_channels_idx
  on public.social_opportunities using gin(possible_channels);

create table if not exists public.social_opportunity_evidence (
  opportunity_id uuid not null references public.social_opportunities(id) on delete cascade,
  evidence_id uuid not null references public.social_evidence_items(id) on delete cascade,
  evidence_role text not null,
  created_at timestamptz not null default now(),
  primary key(opportunity_id,evidence_id,evidence_role),
  constraint social_opportunity_evidence_role_chk check (
    evidence_role in ('PRIMARY','CORROBORATING','COUNTEREVIDENCE')
  )
);
create index if not exists social_opportunity_evidence_opportunity_idx
  on public.social_opportunity_evidence (opportunity_id,evidence_role);
create index if not exists social_opportunity_evidence_evidence_idx
  on public.social_opportunity_evidence (evidence_id);

alter table public.social_evidence_daily_pools enable row level security;
alter table public.social_evidence_items enable row level security;
alter table public.social_opportunity_daily_plans enable row level security;
alter table public.social_opportunities enable row level security;
alter table public.social_opportunity_evidence enable row level security;

revoke all on table public.social_evidence_daily_pools from anon, authenticated;
revoke all on table public.social_evidence_items from anon, authenticated;
revoke all on table public.social_opportunity_daily_plans from anon, authenticated;
revoke all on table public.social_opportunities from anon, authenticated;
revoke all on table public.social_opportunity_evidence from anon, authenticated;

grant select,insert,update,delete on table public.social_evidence_daily_pools to service_role;
grant select,insert,update,delete on table public.social_evidence_items to service_role;
grant select,insert,update,delete on table public.social_opportunity_daily_plans to service_role;
grant select,insert,update,delete on table public.social_opportunities to service_role;
grant select,insert,update,delete on table public.social_opportunity_evidence to service_role;
