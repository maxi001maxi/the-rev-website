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
  select count(*)::int as days_present,
    sum(sessions)::bigint as sessions, sum(active_users)::bigint as active_users,
    sum(page_views)::bigint as page_views, sum(new_users)::bigint as new_users,
    sum(reserve_click)::bigint as reserve_click, sum(line_click)::bigint as line_click,
    sum(price_click)::bigint as price_click, sum(article_cta_click)::bigint as article_cta_click
  from public.company_os_ga4_daily_metrics
  where metric_date between p_business_date - 7 and p_business_date - 1
),
previous7 as (
  select count(*)::int as days_present,
    sum(sessions)::bigint as sessions, sum(active_users)::bigint as active_users,
    sum(page_views)::bigint as page_views, sum(new_users)::bigint as new_users,
    sum(reserve_click)::bigint as reserve_click, sum(line_click)::bigint as line_click,
    sum(price_click)::bigint as price_click, sum(article_cta_click)::bigint as article_cta_click
  from public.company_os_ga4_daily_metrics
  where metric_date between p_business_date - 14 and p_business_date - 8
),
recent28 as (
  select count(*)::int as days_present,
    sum(sessions)::bigint as sessions, sum(active_users)::bigint as active_users,
    sum(page_views)::bigint as page_views, sum(new_users)::bigint as new_users,
    sum(reserve_click)::bigint as reserve_click, sum(line_click)::bigint as line_click,
    sum(price_click)::bigint as price_click, sum(article_cta_click)::bigint as article_cta_click
  from public.company_os_ga4_daily_metrics
  where metric_date between p_business_date - 28 and p_business_date - 1
),
previous28 as (
  select count(*)::int as days_present,
    sum(sessions)::bigint as sessions, sum(active_users)::bigint as active_users,
    sum(page_views)::bigint as page_views, sum(new_users)::bigint as new_users,
    sum(reserve_click)::bigint as reserve_click, sum(line_click)::bigint as line_click,
    sum(price_click)::bigint as price_click, sum(article_cta_click)::bigint as article_cta_click
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
  'today_partial',
    case when exists(select 1 from today_row)
      then (select jsonb_build_object(
        'status','VALUE','partial',true,'metric_date',metric_date,
        'sessions',sessions,'active_users',active_users,'page_views',page_views,'new_users',new_users,
        'reserve_click',reserve_click,'line_click',line_click,'price_click',price_click,'article_cta_click',article_cta_click,
        'observed_at',observed_at
      ) from today_row)
      else jsonb_build_object('status','UNKNOWN','partial',true,'metric_date',p_business_date)
    end,
  'recent_7_complete_days',
    (select jsonb_build_object(
      'status',case when days_present=7 then 'VALUE' when days_present=0 then 'UNKNOWN' else 'DELAYED' end,
      'days_present',days_present,'expected_days',7,
      'sessions',case when days_present=7 then sessions end,
      'active_users',case when days_present=7 then active_users end,
      'page_views',case when days_present=7 then page_views end,
      'new_users',case when days_present=7 then new_users end,
      'reserve_click',case when days_present=7 then reserve_click end,
      'line_click',case when days_present=7 then line_click end,
      'price_click',case when days_present=7 then price_click end,
      'article_cta_click',case when days_present=7 then article_cta_click end,
      'partial_values',case when days_present between 1 and 6 then jsonb_build_object(
        'sessions',sessions,'active_users',active_users,'page_views',page_views,'new_users',new_users,
        'reserve_click',reserve_click,'line_click',line_click,'price_click',price_click,'article_cta_click',article_cta_click
      ) end
    ) from recent7),
  'previous_7_complete_days',
    (select jsonb_build_object(
      'status',case when days_present=7 then 'VALUE' when days_present=0 then 'UNKNOWN' else 'DELAYED' end,
      'days_present',days_present,'expected_days',7,
      'sessions',case when days_present=7 then sessions end,
      'active_users',case when days_present=7 then active_users end,
      'page_views',case when days_present=7 then page_views end,
      'new_users',case when days_present=7 then new_users end,
      'reserve_click',case when days_present=7 then reserve_click end,
      'line_click',case when days_present=7 then line_click end,
      'price_click',case when days_present=7 then price_click end,
      'article_cta_click',case when days_present=7 then article_cta_click end,
      'partial_values',case when days_present between 1 and 6 then jsonb_build_object(
        'sessions',sessions,'active_users',active_users,'page_views',page_views,'new_users',new_users,
        'reserve_click',reserve_click,'line_click',line_click,'price_click',price_click,'article_cta_click',article_cta_click
      ) end
    ) from previous7),
  'recent_28_complete_days',
    (select jsonb_build_object(
      'status',case when days_present=28 then 'VALUE' when days_present=0 then 'UNKNOWN' else 'DELAYED' end,
      'days_present',days_present,'expected_days',28,
      'sessions',case when days_present=28 then sessions end,
      'active_users',case when days_present=28 then active_users end,
      'page_views',case when days_present=28 then page_views end,
      'new_users',case when days_present=28 then new_users end,
      'reserve_click',case when days_present=28 then reserve_click end,
      'line_click',case when days_present=28 then line_click end,
      'price_click',case when days_present=28 then price_click end,
      'article_cta_click',case when days_present=28 then article_cta_click end,
      'partial_values',case when days_present between 1 and 27 then jsonb_build_object(
        'sessions',sessions,'active_users',active_users,'page_views',page_views,'new_users',new_users,
        'reserve_click',reserve_click,'line_click',line_click,'price_click',price_click,'article_cta_click',article_cta_click
      ) end
    ) from recent28),
  'previous_28_complete_days',
    (select jsonb_build_object(
      'status',case when days_present=28 then 'VALUE' when days_present=0 then 'UNKNOWN' else 'DELAYED' end,
      'days_present',days_present,'expected_days',28,
      'sessions',case when days_present=28 then sessions end,
      'active_users',case when days_present=28 then active_users end,
      'page_views',case when days_present=28 then page_views end,
      'new_users',case when days_present=28 then new_users end,
      'reserve_click',case when days_present=28 then reserve_click end,
      'line_click',case when days_present=28 then line_click end,
      'price_click',case when days_present=28 then price_click end,
      'article_cta_click',case when days_present=28 then article_cta_click end,
      'partial_values',case when days_present between 1 and 27 then jsonb_build_object(
        'sessions',sessions,'active_users',active_users,'page_views',page_views,'new_users',new_users,
        'reserve_click',reserve_click,'line_click',line_click,'price_click',price_click,'article_cta_click',article_cta_click
      ) end
    ) from previous28),
  'freshness', (select to_jsonb(freshness) from freshness)
);
$$;

revoke all on function public.company_os_get_ga4_morning_metrics(date) from public, anon, authenticated;

comment on function public.company_os_get_ga4_morning_metrics(date) is
'Service-role Morning Meeting GA4 read model. Complete windows return VALUE only when all expected daily rows are present; missing days never collapse to zero.';
