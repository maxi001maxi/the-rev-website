-- Morning Meeting v3 Phase 2
-- Decision continuity + daily handoff.
-- Inert until v3 runtime writes reviews/handoffs.

create table if not exists public.company_os_morning_decision_reviews (
  business_date date not null,
  decision_id text not null references public.company_os_decision_memory(decision_id) on delete cascade,
  disposition text not null check (
    disposition in (
      'NEW',
      'CARRY_FORWARD',
      'UPDATED',
      'COMPLETED',
      'SUPERSEDED',
      'INVALIDATED_BY_NEW_EVIDENCE'
    )
  ),
  rationale text not null,
  confidence double precision not null default 0.5 check (confidence >= 0 and confidence <= 1),
  evidence_refs text[] not null default '{}'::text[],
  task_refs text[] not null default '{}'::text[],
  timeline_refs text[] not null default '{}'::text[],
  owner_confirmation_required boolean not null default false,
  owner_confirmed boolean not null default false,
  canonical_writeback_applied boolean not null default false,
  canonical_status_after text check (
    canonical_status_after is null
    or canonical_status_after in ('ACTIVE','COMPLETED','SUPERSEDED','REVERSED','EXPIRED')
  ),
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_date, decision_id),
  constraint morning_decision_review_confirmation_semantics check (
    not canonical_writeback_applied
    or not owner_confirmation_required
    or owner_confirmed
  )
);

alter table public.company_os_morning_decision_reviews enable row level security;
revoke all on table public.company_os_morning_decision_reviews from anon, authenticated;

comment on table public.company_os_morning_decision_reviews is
'Morning Meeting v3 daily review of durable Company OS decisions. This is not a second decision truth; canonical truth remains company_os_decision_memory.';

create index if not exists company_os_morning_decision_reviews_date_idx
  on public.company_os_morning_decision_reviews (business_date desc, disposition);

create table if not exists public.company_os_morning_handoffs (
  business_date date primary key,
  meeting_status text not null default 'DRAFT' check (
    meeting_status in ('DRAFT','WAITING_INPUT','DATA_BLOCKED','FINAL')
  ),
  main_judgment text,
  active_decision_ids text[] not null default '{}'::text[],
  priority_task_refs text[] not null default '{}'::text[],
  top_priorities jsonb not null default '[]'::jsonb,
  material_changes jsonb not null default '[]'::jsonb,
  unresolved_items jsonb not null default '[]'::jsonb,
  next_day_checks jsonb not null default '[]'::jsonb,
  carryover_refs text[] not null default '{}'::text[],
  resolved_refs text[] not null default '{}'::text[],
  source_report_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_os_morning_handoffs enable row level security;
revoke all on table public.company_os_morning_handoffs from anon, authenticated;

comment on table public.company_os_morning_handoffs is
'One compact Morning Meeting handoff per business date. Carries unresolved items and next checks into the next Morning Meeting without duplicating Task OS or Decision Memory.';

create index if not exists company_os_morning_handoffs_updated_idx
  on public.company_os_morning_handoffs (updated_at desc);

create or replace function public.company_os_get_morning_continuity_context(
  p_business_date date default (now() at time zone 'Asia/Tokyo')::date,
  p_lookback_days integer default 45
)
returns jsonb
language sql
security definer
set search_path=public
as $$
with
previous_handoff as (
  select *
  from public.company_os_morning_handoffs
  where business_date < p_business_date
  order by business_date desc
  limit 1
),
active_decisions as (
  select
    decision_id,
    decision_date,
    domain,
    title,
    decision,
    rationale,
    evidence_refs,
    status,
    supersedes,
    owner,
    review_date,
    source_ref,
    updated_at
  from public.company_os_decision_memory
  where status='ACTIVE'
  order by decision_date desc, decision_id
),
previous_decision_ids as (
  select unnest(coalesce((select active_decision_ids from previous_handoff),'{}'::text[])) as decision_id
),
required_decision_ids as (
  select decision_id from active_decisions
  union
  select decision_id from previous_decision_ids
),
required_decisions as (
  select
    r.decision_id,
    d.decision_date,
    d.domain,
    d.title,
    d.decision,
    d.rationale,
    d.evidence_refs,
    d.status,
    d.supersedes,
    d.owner,
    d.review_date,
    d.source_ref,
    d.updated_at,
    exists(select 1 from previous_decision_ids p where p.decision_id=r.decision_id) as was_in_previous_handoff,
    exists(select 1 from active_decisions a where a.decision_id=r.decision_id) as is_active_now
  from required_decision_ids r
  left join public.company_os_decision_memory d using (decision_id)
),
recent_timeline as (
  select
    event_id,
    occurred_at,
    event_type,
    domain,
    title,
    summary,
    source_system,
    source_id,
    source_ref,
    verification_status,
    impact_areas,
    metrics,
    related_refs,
    tags
  from public.company_os_timeline_events
  where occurred_at >= ((p_business_date - greatest(p_lookback_days,1))::timestamp at time zone 'Asia/Tokyo')
    and occurred_at < ((p_business_date + 1)::timestamp at time zone 'Asia/Tokyo')
  order by occurred_at desc, created_at desc
  limit 200
),
current_reviews as (
  select *
  from public.company_os_morning_decision_reviews
  where business_date=p_business_date
  order by decision_id
)
select jsonb_build_object(
  'business_date',p_business_date,
  'lookback_days',greatest(p_lookback_days,1),
  'previous_handoff',coalesce((select to_jsonb(previous_handoff) from previous_handoff),'null'::jsonb),
  'required_decisions',coalesce((select jsonb_agg(to_jsonb(required_decisions) order by decision_id) from required_decisions),'[]'::jsonb),
  'active_decisions',coalesce((select jsonb_agg(to_jsonb(active_decisions) order by decision_date desc, decision_id) from active_decisions),'[]'::jsonb),
  'current_reviews',coalesce((select jsonb_agg(to_jsonb(current_reviews) order by decision_id) from current_reviews),'[]'::jsonb),
  'recent_timeline',coalesce((select jsonb_agg(to_jsonb(recent_timeline) order by occurred_at desc) from recent_timeline),'[]'::jsonb)
);
$$;

revoke all on function public.company_os_get_morning_continuity_context(date,integer)
  from public,anon,authenticated;

create or replace function public.company_os_get_morning_continuity_gate(
  p_business_date date default (now() at time zone 'Asia/Tokyo')::date
)
returns jsonb
language sql
security definer
set search_path=public
as $$
with
previous_handoff as (
  select *
  from public.company_os_morning_handoffs
  where business_date < p_business_date
  order by business_date desc
  limit 1
),
active_ids as (
  select decision_id
  from public.company_os_decision_memory
  where status='ACTIVE'
),
previous_ids as (
  select unnest(coalesce((select active_decision_ids from previous_handoff),'{}'::text[])) as decision_id
),
required_ids as (
  select decision_id from active_ids
  union
  select decision_id from previous_ids
),
reviews as (
  select r.*
  from public.company_os_morning_decision_reviews r
  where r.business_date=p_business_date
),
missing_reviews as (
  select q.decision_id
  from required_ids q
  left join reviews r using (decision_id)
  where r.decision_id is null
),
previous_unresolved as (
  select distinct nullif(item->>'item_id','') as item_id
  from previous_handoff h
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(h.unresolved_items)='array' then h.unresolved_items
      else '[]'::jsonb
    end
  ) item
  where nullif(item->>'item_id','') is not null
    and coalesce(item->>'status','OPEN') not in ('RESOLVED','CANCELLED','COMPLETED')
),
current_handoff as (
  select *
  from public.company_os_morning_handoffs
  where business_date=p_business_date
),
unaddressed_carryover as (
  select p.item_id
  from previous_unresolved p
  where not (
    p.item_id = any(coalesce((select carryover_refs from current_handoff),'{}'::text[]))
    or p.item_id = any(coalesce((select resolved_refs from current_handoff),'{}'::text[]))
  )
),
active_missing_from_handoff as (
  select a.decision_id
  from active_ids a
  where not (
    a.decision_id = any(coalesce((select active_decision_ids from current_handoff),'{}'::text[]))
  )
),
confirmation_violations as (
  select decision_id
  from reviews
  where canonical_writeback_applied
    and owner_confirmation_required
    and not owner_confirmed
)
select jsonb_build_object(
  'business_date',p_business_date,
  'required_decision_count',(select count(*) from required_ids),
  'reviewed_decision_count',(select count(*) from required_ids q join reviews r using(decision_id)),
  'missing_review_ids',coalesce((select jsonb_agg(decision_id order by decision_id) from missing_reviews),'[]'::jsonb),
  'previous_unresolved_count',(select count(*) from previous_unresolved),
  'unaddressed_carryover_refs',coalesce((select jsonb_agg(item_id order by item_id) from unaddressed_carryover),'[]'::jsonb),
  'active_missing_from_handoff',coalesce((select jsonb_agg(decision_id order by decision_id) from active_missing_from_handoff),'[]'::jsonb),
  'confirmation_violations',coalesce((select jsonb_agg(decision_id order by decision_id) from confirmation_violations),'[]'::jsonb),
  'current_handoff_status',(select meeting_status from current_handoff),
  'decision_review_gate_pass',not exists(select 1 from missing_reviews),
  'carryover_gate_pass',not exists(select 1 from unaddressed_carryover),
  'handoff_active_decision_gate_pass',not exists(select 1 from active_missing_from_handoff),
  'confirmation_gate_pass',not exists(select 1 from confirmation_violations),
  'final_handoff_present',coalesce((select meeting_status='FINAL' from current_handoff),false),
  'continuity_gate_pass',
    not exists(select 1 from missing_reviews)
    and not exists(select 1 from unaddressed_carryover)
    and not exists(select 1 from active_missing_from_handoff)
    and not exists(select 1 from confirmation_violations)
    and coalesce((select meeting_status='FINAL' from current_handoff),false)
);
$$;

revoke all on function public.company_os_get_morning_continuity_gate(date)
  from public,anon,authenticated;

create or replace function public.company_os_record_confirmed_decision(
  p_decision_id text,
  p_decision_date date,
  p_domain text,
  p_title text,
  p_decision text,
  p_rationale text default null,
  p_evidence_refs text[] default '{}'::text[],
  p_supersedes text[] default '{}'::text[],
  p_owner text default 'OWNER',
  p_review_date date default null,
  p_source_ref text default null
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old_id text;
begin
  if nullif(btrim(p_decision_id),'') is null
     or nullif(btrim(p_domain),'') is null
     or nullif(btrim(p_title),'') is null
     or nullif(btrim(p_decision),'') is null then
    raise exception 'DECISION_REQUIRED_FIELDS_MISSING';
  end if;

  if exists(select 1 from public.company_os_decision_memory where decision_id=p_decision_id) then
    return p_decision_id;
  end if;

  foreach v_old_id in array coalesce(p_supersedes,'{}'::text[]) loop
    update public.company_os_decision_memory
    set status='SUPERSEDED', updated_at=now()
    where decision_id=v_old_id and status='ACTIVE';
  end loop;

  insert into public.company_os_decision_memory (
    decision_id,decision_date,domain,title,decision,rationale,evidence_refs,
    status,supersedes,owner,review_date,sensitivity,allowed_context_profiles,
    source_ref
  ) values (
    p_decision_id,p_decision_date,p_domain,p_title,p_decision,p_rationale,
    coalesce(p_evidence_refs,'{}'::text[]),'ACTIVE',coalesce(p_supersedes,'{}'::text[]),
    p_owner,p_review_date,'INTERNAL',
    array['COMPANY_OVERVIEW_SAFE','COMPANY_BUILDER_PRIVATE','MANAGEMENT_PRIVATE']::text[],
    p_source_ref
  );

  return p_decision_id;
end;
$$;

revoke all on function public.company_os_record_confirmed_decision(
  text,date,text,text,text,text,text[],text[],text,date,text
) from public,anon,authenticated;

comment on function public.company_os_record_confirmed_decision(
  text,date,text,text,text,text,text[],text[],text,date,text
) is
'Records only owner-confirmed durable decisions. Idempotent by decision_id. Superseded decisions are updated before insert so Decision Memory remains canonical.';
