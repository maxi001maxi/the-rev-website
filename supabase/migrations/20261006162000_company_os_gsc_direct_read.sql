create table if not exists public.company_os_gsc_daily_metrics (
  metric_date date primary key,
  site_url text not null,
  clicks bigint not null default 0 check (clicks >= 0),
  impressions bigint not null default 0 check (impressions >= 0),
  ctr double precision,
  position double precision,
  source text not null default 'google-search-console-api-direct',
  data_status text not null default 'VALUE' check (data_status in ('VALUE','ZERO','UNKNOWN','DELAYED','ERROR','STALE')),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_os_gsc_daily_metrics enable row level security;
revoke all on table public.company_os_gsc_daily_metrics from anon, authenticated;

create index if not exists company_os_gsc_daily_metrics_observed_at_idx
  on public.company_os_gsc_daily_metrics (observed_at desc);

create or replace function public.company_os_get_gsc_morning_metrics(
  p_business_date date default (now() at time zone 'Asia/Tokyo')::date
) returns jsonb
language sql
security definer
set search_path=public
as $$
with a as (
  select max(metric_date) settled_through, max(observed_at) last_observed_at
  from company_os_gsc_daily_metrics
  where metric_date<=p_business_date
),
w as (
  select 'r7' k, count(*) n, sum(clicks)::bigint clicks, sum(impressions)::bigint impressions,
    case when sum(impressions)>0 then sum(clicks)::float8/sum(impressions) end ctr,
    case when sum(impressions)>0 then sum(coalesce(position,0)*impressions)/sum(impressions) end position
  from company_os_gsc_daily_metrics,a where metric_date between a.settled_through-6 and a.settled_through
  union all
  select 'p7', count(*), sum(clicks)::bigint, sum(impressions)::bigint,
    case when sum(impressions)>0 then sum(clicks)::float8/sum(impressions) end,
    case when sum(impressions)>0 then sum(coalesce(position,0)*impressions)/sum(impressions) end
  from company_os_gsc_daily_metrics,a where metric_date between a.settled_through-13 and a.settled_through-7
  union all
  select 'r28', count(*), sum(clicks)::bigint, sum(impressions)::bigint,
    case when sum(impressions)>0 then sum(clicks)::float8/sum(impressions) end,
    case when sum(impressions)>0 then sum(coalesce(position,0)*impressions)/sum(impressions) end
  from company_os_gsc_daily_metrics,a where metric_date between a.settled_through-27 and a.settled_through
  union all
  select 'p28', count(*), sum(clicks)::bigint, sum(impressions)::bigint,
    case when sum(impressions)>0 then sum(clicks)::float8/sum(impressions) end,
    case when sum(impressions)>0 then sum(coalesce(position,0)*impressions)/sum(impressions) end
  from company_os_gsc_daily_metrics,a where metric_date between a.settled_through-55 and a.settled_through-28
),
j as (
  select k, jsonb_build_object(
    'status',case when n=(case when k in('r7','p7') then 7 else 28 end) then 'VALUE' when n=0 then 'UNKNOWN' else 'DELAYED' end,
    'days_present',n,
    'expected_days',case when k in('r7','p7') then 7 else 28 end,
    'clicks',case when n=(case when k in('r7','p7') then 7 else 28 end) then clicks end,
    'impressions',case when n=(case when k in('r7','p7') then 7 else 28 end) then impressions end,
    'ctr',case when n=(case when k in('r7','p7') then 7 else 28 end) then ctr end,
    'position',case when n=(case when k in('r7','p7') then 7 else 28 end) then position end
  ) v from w
)
select jsonb_build_object(
  'business_date',p_business_date,
  'provider','google-search-console-api-direct',
  'dependency_on_gsc_wizard',false,
  'freshness',(select jsonb_build_object('settled_through',settled_through,'last_observed_at',last_observed_at) from a),
  'recent_7_final_days',(select v from j where k='r7'),
  'previous_7_final_days',(select v from j where k='p7'),
  'recent_28_final_days',(select v from j where k='r28'),
  'previous_28_final_days',(select v from j where k='p28')
);
$$;

revoke all on function public.company_os_get_gsc_morning_metrics(date) from public,anon,authenticated;

insert into public.company_os_source_registry (
  source_id,domain,system,resource,role,canonicality,sensitivity,
  freshness_policy,owner,retrieval_method,fallback_sources,
  allowed_context_profiles,status,metadata
) values (
  'gsc-direct-read','search_analytics','google_search_console_api','therev-lab.com',
  'Morning Meeting direct Search Console read model',
  'READ_MODEL','INTERNAL',
  'daily before Morning Meeting; final Search Console data uses a conservative 3-day lag',
  'Company OS',
  'Vercel Cron -> Google Search Console API -> Supabase',
  array['site-insights']::text[],
  array['COMPANY_OVERVIEW_SAFE','MANAGEMENT_PRIVATE','WEBSITE_ANALYTICS']::text[],
  'NOT_CONFIGURED',
  jsonb_build_object('provider','google-search-console-api-direct','dependency_on_gsc_wizard',false)
) on conflict (source_id) do update set
  role=excluded.role,
  freshness_policy=excluded.freshness_policy,
  retrieval_method=excluded.retrieval_method,
  fallback_sources=excluded.fallback_sources,
  allowed_context_profiles=excluded.allowed_context_profiles,
  metadata=company_os_source_registry.metadata||excluded.metadata,
  updated_at=now();
