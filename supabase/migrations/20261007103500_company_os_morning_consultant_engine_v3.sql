-- Morning Meeting v3 Phase 3
-- Consultant analysis engine storage + quality gates.
-- Stores concise business conclusions, not hidden chain-of-thought.

create table if not exists public.company_os_morning_analysis_runs (
  business_date date primary key,
  engine_version text not null default 'v3-phase3',
  analysis_status text not null default 'DRAFT' check (
    analysis_status in ('DRAFT','WAITING_INPUT','DATA_BLOCKED','READY','FINAL')
  ),
  main_judgment text,
  main_judgment_confidence double precision check (
    main_judgment_confidence is null or (main_judgment_confidence >= 0 and main_judgment_confidence <= 1)
  ),
  executive_rationale text,
  do_not_do text[] not null default '{}'::text[],
  lens_summary jsonb not null default '{}'::jsonb,
  data_limitations jsonb not null default '[]'::jsonb,
  active_decision_ids text[] not null default '{}'::text[],
  retrieval_audit_summary jsonb not null default '{}'::jsonb,
  continuity_summary jsonb not null default '{}'::jsonb,
  analysis_score numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_os_morning_analysis_runs enable row level security;
revoke all on table public.company_os_morning_analysis_runs from anon, authenticated;

comment on table public.company_os_morning_analysis_runs is
'Morning Meeting v3 Phase 3 consultant synthesis. Stores concise conclusions and evidence-backed rationale, never hidden chain-of-thought.';

create table if not exists public.company_os_morning_insights (
  business_date date not null references public.company_os_morning_analysis_runs(business_date) on delete cascade,
  insight_key text not null,
  insight_rank integer not null check (insight_rank between 1 and 3),
  theme text not null,
  domain text not null,
  funnel_stage text,
  evidence jsonb not null default '[]'::jsonb,
  interpretation text not null,
  alternative_explanations jsonb not null default '[]'::jsonb,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  business_meaning text not null,
  decision text not null,
  next_test text not null,
  evidence_refs text[] not null default '{}'::text[],
  decision_refs text[] not null default '{}'::text[],
  task_refs text[] not null default '{}'::text[],
  limitations jsonb not null default '[]'::jsonb,
  material boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_date, insight_key),
  unique (business_date, insight_rank),
  constraint company_os_morning_insights_evidence_array check (jsonb_typeof(evidence)='array'),
  constraint company_os_morning_insights_alternatives_array check (jsonb_typeof(alternative_explanations)='array'),
  constraint company_os_morning_insights_limitations_array check (jsonb_typeof(limitations)='array')
);

alter table public.company_os_morning_insights enable row level security;
revoke all on table public.company_os_morning_insights from anon, authenticated;

comment on table public.company_os_morning_insights is
'Maximum three evidence-backed business insights: fact -> interpretation -> alternative explanation -> business meaning -> decision -> next test.';

create table if not exists public.company_os_morning_priority_recommendations (
  business_date date not null references public.company_os_morning_analysis_runs(business_date) on delete cascade,
  priority_rank integer not null check (priority_rank between 1 and 3),
  action text not null,
  why_today text not null,
  owner text not null,
  done_condition text not null,
  business_impact text not null,
  tomorrow_check text not null,
  linked_insight_keys text[] not null default '{}'::text[],
  decision_refs text[] not null default '{}'::text[],
  task_refs text[] not null default '{}'::text[],
  impact_score integer check (impact_score is null or impact_score between 1 and 5),
  urgency_score integer check (urgency_score is null or urgency_score between 1 and 5),
  unlock_score integer check (unlock_score is null or unlock_score between 1 and 5),
  confidence_score integer check (confidence_score is null or confidence_score between 1 and 5),
  effort_score integer check (effort_score is null or effort_score between 1 and 5),
  status text not null default 'CANDIDATE' check (
    status in ('CANDIDATE','SELECTED','DEFERRED','BLOCKED')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_date, priority_rank)
);

alter table public.company_os_morning_priority_recommendations enable row level security;
revoke all on table public.company_os_morning_priority_recommendations from anon, authenticated;

comment on table public.company_os_morning_priority_recommendations is
'Morning Meeting v3 priority candidates. Internal scores are tie-breakers only; user-facing output must explain why today and completion criteria.';

create index if not exists company_os_morning_insights_material_idx
  on public.company_os_morning_insights (business_date desc, material, insight_rank);

create index if not exists company_os_morning_priorities_status_idx
  on public.company_os_morning_priority_recommendations (business_date desc, status, priority_rank);

create or replace function public.company_os_get_morning_consultant_input(
  p_business_date date default (now() at time zone 'Asia/Tokyo')::date,
  p_lookback_days integer default 45
)
returns jsonb
language sql
security definer
set search_path=public
as $$
select jsonb_build_object(
  'business_date',p_business_date,
  'retrieval_audit',public.company_os_get_morning_retrieval_audit(p_business_date,null),
  'continuity_context',public.company_os_get_morning_continuity_context(p_business_date,p_lookback_days),
  'company_state',coalesce((
    select to_jsonb(s)
    from public.daily_manager_snapshots s
    where s.business_date=p_business_date
  ),'null'::jsonb),
  'active_decisions',coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'decision_id',d.decision_id,
        'decision_date',d.decision_date,
        'domain',d.domain,
        'title',d.title,
        'decision',d.decision,
        'rationale',d.rationale,
        'review_date',d.review_date
      )
      order by d.decision_date desc,d.decision_id
    )
    from public.company_os_decision_memory d
    where d.status='ACTIVE'
  ),'[]'::jsonb)
);
$$;

revoke all on function public.company_os_get_morning_consultant_input(date,integer)
  from public,anon,authenticated;

create or replace function public.company_os_get_morning_consultant_gate(
  p_business_date date default (now() at time zone 'Asia/Tokyo')::date
)
returns jsonb
language sql
security definer
set search_path=public
as $$
with
r as (
  select * from public.company_os_morning_analysis_runs where business_date=p_business_date
),
i as (
  select * from public.company_os_morning_insights where business_date=p_business_date and material=true
),
p as (
  select * from public.company_os_morning_priority_recommendations
  where business_date=p_business_date and status='SELECTED'
),
bad_insights as (
  select insight_key
  from i
  where jsonb_array_length(evidence)=0
     or cardinality(evidence_refs)=0
     or nullif(btrim(interpretation),'') is null
     or jsonb_array_length(alternative_explanations)=0
     or nullif(btrim(business_meaning),'') is null
     or nullif(btrim(decision),'') is null
     or nullif(btrim(next_test),'') is null
),
bad_evidence as (
  select distinct i.insight_key
  from i
  cross join lateral jsonb_array_elements(i.evidence) e
  where nullif(e->>'source_id','') is null
     or nullif(e->>'claim','') is null
     or nullif(e->>'retrieval_result','') is null
     or coalesce(e->>'claim_type','') not in ('FACT','USER_CONFIRMED_FACT')
),
bad_priorities as (
  select priority_rank
  from p
  where nullif(btrim(action),'') is null
     or nullif(btrim(why_today),'') is null
     or nullif(btrim(owner),'') is null
     or nullif(btrim(done_condition),'') is null
     or nullif(btrim(business_impact),'') is null
     or nullif(btrim(tomorrow_check),'') is null
),
lens_check as (
  select
    case when r.business_date is null then false else
      (r.lens_summary ? 'CEO')
      and (r.lens_summary ? 'GROWTH')
      and (r.lens_summary ? 'CUSTOMER_CONVERSION')
      and (r.lens_summary ? 'OPERATIONS')
      and (r.lens_summary ? 'FINANCE')
      and (r.lens_summary ? 'ANALYST')
    end as pass
  from (select 1) x
  left join r on true
),
counts as (
  select
    (select count(*) from i)::int as insight_count,
    (select count(*) from p)::int as selected_priority_count,
    (select count(*) from bad_insights)::int as bad_insight_count,
    (select count(*) from bad_evidence)::int as bad_evidence_count,
    (select count(*) from bad_priorities)::int as bad_priority_count
)
select jsonb_build_object(
  'business_date',p_business_date,
  'analysis_run_present',exists(select 1 from r),
  'analysis_status',(select analysis_status from r),
  'main_judgment_present',coalesce((select nullif(btrim(main_judgment),'') is not null from r),false),
  'executive_rationale_present',coalesce((select nullif(btrim(executive_rationale),'') is not null from r),false),
  'lens_gate_pass',coalesce((select pass from lens_check),false),
  'insight_count',(select insight_count from counts),
  'selected_priority_count',(select selected_priority_count from counts),
  'bad_insight_count',(select bad_insight_count from counts),
  'bad_evidence_count',(select bad_evidence_count from counts),
  'bad_priority_count',(select bad_priority_count from counts),
  'insight_gate_pass',
    (select insight_count between 1 and 3 and bad_insight_count=0 and bad_evidence_count=0 from counts),
  'priority_gate_pass',
    (select selected_priority_count between 1 and 3 and bad_priority_count=0 from counts),
  'consultant_gate_pass',
    exists(select 1 from r)
    and coalesce((select analysis_status in ('READY','FINAL') from r),false)
    and coalesce((select nullif(btrim(main_judgment),'') is not null from r),false)
    and coalesce((select nullif(btrim(executive_rationale),'') is not null from r),false)
    and coalesce((select pass from lens_check),false)
    and (select insight_count between 1 and 3 and bad_insight_count=0 and bad_evidence_count=0 from counts)
    and (select selected_priority_count between 1 and 3 and bad_priority_count=0 from counts)
);
$$;

revoke all on function public.company_os_get_morning_consultant_gate(date)
  from public,anon,authenticated;
