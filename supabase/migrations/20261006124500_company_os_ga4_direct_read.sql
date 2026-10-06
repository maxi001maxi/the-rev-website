create table if not exists public.company_os_ga4_daily_metrics (
  metric_date date primary key,
  property_id text not null,
  sessions bigint not null default 0 check (sessions >= 0),
  active_users bigint not null default 0 check (active_users >= 0),
  page_views bigint not null default 0 check (page_views >= 0),
  new_users bigint not null default 0 check (new_users >= 0),
  reserve_click bigint not null default 0 check (reserve_click >= 0),
  line_click bigint not null default 0 check (line_click >= 0),
  price_click bigint not null default 0 check (price_click >= 0),
  article_cta_click bigint not null default 0 check (article_cta_click >= 0),
  source text not null default 'google-analytics-data-api-direct',
  data_status text not null default 'VALUE' check (data_status in ('VALUE','ZERO','UNKNOWN','DELAYED','ERROR','STALE')),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_os_ga4_daily_metrics enable row level security;
revoke all on table public.company_os_ga4_daily_metrics from anon, authenticated;

comment on table public.company_os_ga4_daily_metrics is
'Company OS direct GA4 daily read model. Server/service-role only. Today may be partial; completed-day trend windows end yesterday.';

create index if not exists company_os_ga4_daily_metrics_observed_at_idx
  on public.company_os_ga4_daily_metrics (observed_at desc);

create or replace function public.company_os_get_ga4_morning_metrics(
  p_business_date date default (now() at time zone 'Asia/Tokyo')::date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
with
today_row as (
  select * from public.company_os_ga4_daily_metrics where metric_date = p_business_date
),
recent7 as (
  select
    count(*)::int as days_present,
    coalesce(sum(sessions),0)::bigint as sessions,
    coalesce(sum(active_users),0)::bigint as active_users,
    coalesce(sum(page_views),0)::bigint as page_views,
    coalesce(sum(new_users),0)::bigint as new_users,
    coalesce(sum(reserve_click),0)::bigint as reserve_click,
    coalesce(sum(line_click),0)::bigint as line_click,
    coalesce(sum(price_click),0)::bigint as price_click,
    coalesce(sum(article_cta_click),0)::bigint as article_cta_click
  from public.company_os_ga4_daily_metrics
  where metric_date between p_business_date - 7 and p_business_date - 1
),
previous7 as (
  select
    count(*)::int as days_present,
    coalesce(sum(sessions),0)::bigint as sessions,
    coalesce(sum(active_users),0)::bigint as active_users,
    coalesce(sum(page_views),0)::bigint as page_views,
    coalesce(sum(new_users),0)::bigint as new_users,
    coalesce(sum(reserve_click),0)::bigint as reserve_click,
    coalesce(sum(line_click),0)::bigint as line_click,
    coalesce(sum(price_click),0)::bigint as price_click,
    coalesce(sum(article_cta_click),0)::bigint as article_cta_click
  from public.company_os_ga4_daily_metrics
  where metric_date between p_business_date - 14 and p_business_date - 8
),
recent28 as (
  select
    count(*)::int as days_present,
    coalesce(sum(sessions),0)::bigint as sessions,
    coalesce(sum(active_users),0)::bigint as active_users,
    coalesce(sum(page_views),0)::bigint as page_views,
    coalesce(sum(new_users),0)::bigint as new_users,
    coalesce(sum(reserve_click),0)::bigint as reserve_click,
    coalesce(sum(line_click),0)::bigint as line_click,
    coalesce(sum(price_click),0)::bigint as price_click,
    coalesce(sum(article_cta_click),0)::bigint as article_cta_click
  from public.company_os_ga4_daily_metrics
  where metric_date between p_business_date - 28 and p_business_date - 1
),
previous28 as (
  select
    count(*)::int as days_present,
    coalesce(sum(sessions),0)::bigint as sessions,
    coalesce(sum(active_users),0)::bigint as active_users,
    coalesce(sum(page_views),0)::bigint as page_views,
    coalesce(sum(new_users),0)::bigint as new_users,
    coalesce(sum(reserve_click),0)::bigint as reserve_click,
    coalesce(sum(line_click),0)::bigint as line_click,
    coalesce(sum(price_click),0)::bigint as price_click,
    coalesce(sum(article_cta_click),0)::bigint as article_cta_click
  from public.company_os_ga4_daily_metrics
  where metric_date between p_business_date - 56 and p_business_date - 29
),
freshness as (
  select max(observed_at) as last_observed_at, max(metric_date) as latest_metric_date
  from public.company_os_ga4_daily_metrics
)
select jsonb_build_object(
  'business_date', p_business_date,
  'provider', 'google-analytics-data-api-direct',
  'dependency_on_gsc_wizard', false,
  'today_partial', coalesce((select to_jsonb(t) - 'created_at' - 'updated_at' from today_row t), '{}'::jsonb),
  'recent_7_complete_days', (select to_jsonb(recent7) from recent7),
  'previous_7_complete_days', (select to_jsonb(previous7) from previous7),
  'recent_28_complete_days', (select to_jsonb(recent28) from recent28),
  'previous_28_complete_days', (select to_jsonb(previous28) from previous28),
  'freshness', (select to_jsonb(freshness) from freshness)
);
$$;

revoke all on function public.company_os_get_ga4_morning_metrics(date) from public, anon, authenticated;

insert into public.company_os_source_registry (
  source_id, domain, system, resource, role, canonicality, sensitivity,
  freshness_policy, owner, retrieval_method, fallback_sources,
  allowed_context_profiles, status, metadata
)
values (
  'ga4-direct-read',
  'web_analytics',
  'google_analytics_data_api',
  'properties/552679302',
  'Morning Meeting direct GA4 read model',
  'READ_MODEL',
  'INTERNAL',
  'daily before Morning Meeting; today is partial, completed-day trends end yesterday',
  'Company OS',
  'Vercel Cron -> Google Analytics Data API -> Supabase',
  array[]::text[],
  array['COMPANY_OVERVIEW_SAFE','MANAGEMENT_PRIVATE','WEBSITE_ANALYTICS']::text[],
  'NOT_CONFIGURED',
  jsonb_build_object(
    'property_id','552679302',
    'provider','google-analytics-data-api-direct',
    'dependency_on_gsc_wizard',false,
    'collection_verified_at','2026-09-25'
  )
)
on conflict (source_id) do update
set resource=excluded.resource,
    role=excluded.role,
    freshness_policy=excluded.freshness_policy,
    retrieval_method=excluded.retrieval_method,
    allowed_context_profiles=excluded.allowed_context_profiles,
    metadata=public.company_os_source_registry.metadata || excluded.metadata,
    updated_at=now();
