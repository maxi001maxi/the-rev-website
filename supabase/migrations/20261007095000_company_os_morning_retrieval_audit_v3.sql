-- Morning Meeting v3 Phase 1
-- Retrieval Audit + required-source contract.
-- Inert until Morning Meeting v3 runtime writes audit rows.

create table if not exists public.company_os_morning_required_sources (
  source_id text primary key,
  display_label text not null,
  source_kind text not null check (source_kind in ('SUPABASE','GOOGLE_SHEETS','PLUGIN','DIRECT_API','MANUAL','GITHUB')),
  required_by_default boolean not null default true,
  payload_required_on_success boolean not null default false,
  analysis_required_on_success boolean not null default true,
  retrieval_path text not null,
  fallback_rule text,
  freshness_policy text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_os_morning_required_sources enable row level security;
revoke all on table public.company_os_morning_required_sources from anon, authenticated;

comment on table public.company_os_morning_required_sources is
'Morning Meeting v3 Phase 1 required-source contract. Server/service-role only. Missing required source audit rows are treated as NOT_ATTEMPTED.';

create table if not exists public.company_os_retrieval_audit (
  audit_id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references public.company_os_sync_runs(sync_run_id) on delete set null,
  business_date date not null,
  source_id text not null,
  display_label text not null,
  material boolean not null default true,
  attempt_no integer not null default 1 check (attempt_no >= 1),
  attempted boolean not null,
  attempted_at timestamptz,
  retrieval_path text not null,
  result text not null check (
    result in (
      'SUCCESS_CURRENT',
      'SUCCESS_EMPTY',
      'SUCCESS_STALE',
      'ATTEMPT_FAILED',
      'NOT_CONFIGURED',
      'HUMAN_ONLY',
      'NOT_ATTEMPTED',
      'BLOCKED_EXTERNAL'
    )
  ),
  latest_data_date date,
  freshness text not null default 'UNKNOWN' check (
    freshness in ('CURRENT','STALE','UNKNOWN','NOT_APPLICABLE')
  ),
  records_or_metrics_received integer check (
    records_or_metrics_received is null or records_or_metrics_received >= 0
  ),
  payload_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_summary text,
  fallback_attempted boolean not null default false,
  fallback_result text,
  used_in_analysis boolean not null default false,
  exclusion_reason text,
  evidence_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint company_os_retrieval_audit_attempt_semantics check (
    (
      result in ('SUCCESS_CURRENT','SUCCESS_EMPTY','SUCCESS_STALE','ATTEMPT_FAILED','BLOCKED_EXTERNAL')
      and attempted = true
      and attempted_at is not null
    )
    or
    (
      result in ('NOT_CONFIGURED','HUMAN_ONLY','NOT_ATTEMPTED')
      and attempted = false
    )
  ),
  constraint company_os_retrieval_audit_analysis_semantics check (
    not used_in_analysis or result in ('SUCCESS_CURRENT','SUCCESS_EMPTY','SUCCESS_STALE')
  )
);

alter table public.company_os_retrieval_audit enable row level security;
revoke all on table public.company_os_retrieval_audit from anon, authenticated;

comment on table public.company_os_retrieval_audit is
'Per-run/per-source Morning Meeting retrieval evidence. Distinguishes not attempted, failed attempt, stale success, not configured, human-only, and current success.';

create unique index if not exists company_os_retrieval_audit_run_source_attempt_uidx
  on public.company_os_retrieval_audit (sync_run_id, source_id, attempt_no)
  where sync_run_id is not null;

create index if not exists company_os_retrieval_audit_business_source_idx
  on public.company_os_retrieval_audit (business_date desc, source_id, attempted_at desc nulls last, created_at desc);

create index if not exists company_os_retrieval_audit_result_idx
  on public.company_os_retrieval_audit (business_date desc, result);

insert into public.company_os_morning_required_sources (
  source_id, display_label, source_kind, required_by_default,
  payload_required_on_success, analysis_required_on_success,
  retrieval_path, fallback_rule, freshness_policy, metadata
) values
  (
    'company-state','Company State','SUPABASE',true,false,true,
    'Supabase public.daily_manager_snapshots',
    'Use source-level reads only when snapshot is stale/partial and decision requires them.',
    'current business_date',
    '{"role":"cross-agent current state"}'::jsonb
  ),
  (
    'decision-memory','経営判断メモ','SUPABASE',true,false,true,
    'Supabase public.company_os_decision_memory WHERE status=ACTIVE',
    null,
    'read every Morning Meeting',
    '{"role":"decision continuity"}'::jsonb
  ),
  (
    'company-timeline','Company Timeline','SUPABASE',true,false,true,
    'Supabase public.company_os_timeline_events recent 45 days',
    null,
    'read every Morning Meeting',
    '{"role":"material change history"}'::jsonb
  ),
  (
    'task-os','Task OS','GOOGLE_SHEETS',true,false,true,
    'Google Sheets THE_REV_Task_OS_LIVE_v0.1',
    null,
    'current read required',
    '{"spreadsheet_id":"1ImIUSrjJnec3Ta5II0L4iLUYQ8IRIwxuX__-v4_iBRg"}'::jsonb
  ),
  (
    'kpi-ai-export','KPI','GOOGLE_SHEETS',true,true,true,
    'Google Sheets KPI Dashboard 70_AI会議_EXPORT + 80_指標の定義',
    null,
    'stale must remain stale; never current by inference',
    '{"spreadsheet_id":"10ZVV1cw4gOBYoIu862AUXQydfKgIg6t6CaFp3U-maZA"}'::jsonb
  ),
  (
    'cashbook','現金出納','GOOGLE_SHEETS',true,true,true,
    'Google Sheets THE_REV_現金出納帳',
    null,
    'use latest confirmed close only',
    '{"spreadsheet_id":"1duYBgLQWXR3XsKCyb7pl8hHBkfTEIz0uJsMoWdOdGpM"}'::jsonb
  ),
  (
    'gyms','GYM''S','MANUAL',true,false,true,
    'USER_CONFIRMED aggregate-only input',
    null,
    'ask only when material and stale',
    '{"privacy":"aggregate_only_no_customer_pii","expected_result":"HUMAN_ONLY"}'::jsonb
  ),
  (
    'editorial-master','Editorial','GOOGLE_SHEETS',true,false,true,
    'Editorial Master + relevant Supabase editorial state',
    'Use canonical GitHub editorial state only for runtime interpretation, not as fake publication evidence.',
    'current read required',
    '{"spreadsheet_id":"1_Cia3fsELLCJtBcIFq38Jg5CbEVG2md2G6w6Do4BaeI"}'::jsonb
  ),
  (
    'metricool-instagram','Instagram','PLUGIN',true,true,true,
    'Metricool brand 6934494 / the.rev.nara analytics',
    'If one Metricool connector is unavailable, try another verified Instagram analytics connector before failing.',
    'latest complete day + current partial day when available',
    '{"brand_id":"6934494","account":"the.rev.nara","minimum_metrics":["views","reach","reels","reelsViews","reelsReach"],"success_requires_actual_analytics_rows":true}'::jsonb
  ),
  (
    'ga4-direct-read','GA4','DIRECT_API',true,true,true,
    'Company OS company_os_get_ga4_morning_metrics() / ga4-direct-read',
    'Only if direct read is NOT_CONFIGURED/DEGRADED/STALE, try documented legacy read paths. Never convert read failure into GA4 collection failure.',
    'today partial; 7d/28d complete-day windows',
    '{"property_id":"552679302","measurement_id":"G-Q6ZSSJMEZ2"}'::jsonb
  ),
  (
    'gsc-direct-read','GSC','DIRECT_API',true,false,true,
    'Company OS gsc-direct-read',
    'Site Insights only after direct read is unavailable and fallback is valid.',
    'final Search Console data with conservative lag',
    '{"current_expected_state":"NOT_CONFIGURED"}'::jsonb
  ),
  (
    'gbp-live','Googleビジネスプロフィール','DIRECT_API',true,false,true,
    'Official Google Business Profile API connection',
    null,
    'live only after verified OAuth/API connection',
    '{"current_expected_state":"NOT_CONFIGURED"}'::jsonb
  ),
  (
    'github-material-changes','GitHub重要変更','GITHUB',true,false,true,
    'Company Timeline github-material-changes collector',
    'Direct GitHub read only when collector freshness is insufficient for a material decision.',
    'current collector health required',
    '{"repositories":["maxi001maxi/the-rev-website","maxi001maxi/the-rev-ops"]}'::jsonb
  )
on conflict (source_id) do update set
  display_label=excluded.display_label,
  source_kind=excluded.source_kind,
  required_by_default=excluded.required_by_default,
  payload_required_on_success=excluded.payload_required_on_success,
  analysis_required_on_success=excluded.analysis_required_on_success,
  retrieval_path=excluded.retrieval_path,
  fallback_rule=excluded.fallback_rule,
  freshness_policy=excluded.freshness_policy,
  metadata=excluded.metadata,
  updated_at=now();

create or replace function public.company_os_get_morning_retrieval_audit(
  p_business_date date default (now() at time zone 'Asia/Tokyo')::date,
  p_sync_run_id uuid default null
)
returns jsonb
language sql
security definer
set search_path=public
as $$
with ranked as (
  select
    a.*,
    row_number() over (
      partition by a.source_id
      order by
        case when p_sync_run_id is not null and a.sync_run_id=p_sync_run_id then 0 else 1 end,
        a.attempted_at desc nulls last,
        a.created_at desc,
        a.attempt_no desc
    ) as rn
  from public.company_os_retrieval_audit a
  where a.business_date=p_business_date
    and (p_sync_run_id is null or a.sync_run_id=p_sync_run_id)
),
latest as (
  select * from ranked where rn=1
),
resolved as (
  select
    r.source_id,
    r.display_label,
    r.required_by_default,
    r.payload_required_on_success,
    r.analysis_required_on_success,
    coalesce(a.material,r.required_by_default) as material,
    coalesce(a.attempted,false) as attempted,
    a.attempted_at,
    coalesce(a.retrieval_path,r.retrieval_path) as retrieval_path,
    coalesce(a.result,'NOT_ATTEMPTED') as result,
    a.latest_data_date,
    coalesce(a.freshness,'UNKNOWN') as freshness,
    a.records_or_metrics_received,
    coalesce(a.payload_summary,'{}'::jsonb) as payload_summary,
    a.error_code,
    a.error_summary,
    coalesce(a.fallback_attempted,false) as fallback_attempted,
    a.fallback_result,
    coalesce(a.used_in_analysis,false) as used_in_analysis,
    a.exclusion_reason,
    coalesce(a.evidence_ref,'{}'::jsonb) as evidence_ref,
    case
      when a.audit_id is null then false
      when a.result='NOT_ATTEMPTED' then false
      when r.payload_required_on_success
        and a.result in ('SUCCESS_CURRENT','SUCCESS_STALE','SUCCESS_EMPTY')
        and a.result<>'SUCCESS_EMPTY'
        and coalesce(a.payload_summary,'{}'::jsonb)='{}'::jsonb then false
      else true
    end as retrieval_gate_pass,
    case
      when not r.analysis_required_on_success then true
      when a.result not in ('SUCCESS_CURRENT','SUCCESS_STALE','SUCCESS_EMPTY') then true
      when a.used_in_analysis then true
      when nullif(btrim(a.exclusion_reason),'') is not null then true
      else false
    end as use_gate_pass
  from public.company_os_morning_required_sources r
  left join latest a on a.source_id=r.source_id
  where r.required_by_default=true
),
agg as (
  select
    count(*)::int as required_sources,
    count(*) filter (where retrieval_gate_pass)::int as retrieval_pass_sources,
    count(*) filter (where use_gate_pass)::int as use_pass_sources,
    count(*) filter (where result='NOT_ATTEMPTED')::int as not_attempted_count,
    count(*) filter (where result='ATTEMPT_FAILED')::int as failed_attempt_count,
    count(*) filter (where result='NOT_CONFIGURED')::int as not_configured_count,
    count(*) filter (where result='HUMAN_ONLY')::int as human_only_count
  from resolved
)
select jsonb_build_object(
  'business_date',p_business_date,
  'sync_run_id',p_sync_run_id,
  'required_sources',(select required_sources from agg),
  'retrieval_pass_sources',(select retrieval_pass_sources from agg),
  'use_pass_sources',(select use_pass_sources from agg),
  'not_attempted_count',(select not_attempted_count from agg),
  'failed_attempt_count',(select failed_attempt_count from agg),
  'not_configured_count',(select not_configured_count from agg),
  'human_only_count',(select human_only_count from agg),
  'retrieval_gate_pass',(select required_sources=retrieval_pass_sources from agg),
  'use_what_you_got_gate_pass',(select required_sources=use_pass_sources from agg),
  'sources',coalesce((select jsonb_agg(to_jsonb(resolved) order by source_id) from resolved),'[]'::jsonb)
);
$$;

revoke all on function public.company_os_get_morning_retrieval_audit(date,uuid) from public,anon,authenticated;
