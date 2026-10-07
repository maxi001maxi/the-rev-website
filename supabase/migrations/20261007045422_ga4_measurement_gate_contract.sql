-- Events before verified collection are UNKNOWN, not zero.
alter table public.company_os_ga4_daily_metrics
  alter column reserve_click drop not null, alter column reserve_click drop default,
  alter column line_click drop not null, alter column line_click drop default,
  alter column price_click drop not null, alter column price_click drop default,
  alter column article_cta_click drop not null, alter column article_cta_click drop default;
create or replace function public.company_os_get_ga4_morning_metrics(
  p_business_date date default (now() at time zone 'Asia/Tokyo')::date
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  result jsonb; src public.company_os_source_registry%rowtype;
  today_data public.company_os_ga4_daily_metrics%rowtype;
  spec record; aggregate_data record; window_data jsonb; unique_data jsonb;
  source_state text; last_seen timestamptz; latest_date date;
begin
  select * into src from public.company_os_source_registry where source_id='ga4-direct-read';
  select max(observed_at),max(metric_date) into last_seen,latest_date from public.company_os_ga4_daily_metrics;
  source_state := case when src.status <> 'ACTIVE' then 'ERROR'
    when src.last_observed_at < now()-interval '36 hours' then 'STALE' else 'VALUE' end;
  select * into today_data from public.company_os_ga4_daily_metrics where metric_date=p_business_date;
  result:=jsonb_build_object('business_date',p_business_date,'provider','google-analytics-data-api-direct',
    'dependency_on_gsc_wizard',false,'source_status',source_state,
    'reserve_click_semantics','external_booking_page_open_intent',
    'reservation_start',jsonb_build_object('status','UNKNOWN','value',null),
    'reservation_complete',jsonb_build_object('status','UNKNOWN','value',null),
    'today_partial',case when today_data.metric_date is null
      then jsonb_build_object('status','UNKNOWN','partial',true,'metric_date',p_business_date)
      else to_jsonb(today_data)||jsonb_build_object('status',source_state,'partial',true) end,
    'freshness',jsonb_build_object('last_observed_at',last_seen,'latest_metric_date',latest_date));
  for spec in select * from (values
    ('recent_7_complete_days',7,1,7),('previous_7_complete_days',14,8,7),
    ('recent_28_complete_days',28,1,28),('previous_28_complete_days',56,29,28)
  ) as w(key,from_days,to_days,expected_days) loop
    select count(*)::int days_present,sum(sessions) sessions,sum(page_views) page_views,sum(new_users) new_users,
      sum(active_users) daily_active_users_sum,
      case when count(reserve_click)=spec.expected_days then sum(reserve_click) end reserve_click,
      case when count(line_click)=spec.expected_days then sum(line_click) end line_click,
      case when count(price_click)=spec.expected_days then sum(price_click) end price_click,
      case when count(article_cta_click)=spec.expected_days then sum(article_cta_click) end article_cta_click
      into aggregate_data from public.company_os_ga4_daily_metrics
      where metric_date between p_business_date-spec.from_days and p_business_date-spec.to_days;
    unique_data:=src.metadata->'window_metrics'->spec.key;
    if unique_data->>'start_date' <> (p_business_date-spec.from_days)::text
      or unique_data->>'end_date' <> (p_business_date-spec.to_days)::text then unique_data:=null; end if;
    window_data:=jsonb_build_object('status',case when aggregate_data.days_present=0 then 'UNKNOWN'
      when source_state<>'VALUE' then source_state when aggregate_data.days_present=spec.expected_days then 'VALUE' else 'DELAYED' end,
      'start_date',p_business_date-spec.from_days,'end_date',p_business_date-spec.to_days,
      'days_present',aggregate_data.days_present,'expected_days',spec.expected_days,
      'active_users',case when unique_data->>'status'='VALUE' then unique_data->'active_users' end,
      'active_users_semantics','period_unique_active_users','active_users_status',coalesce(unique_data->>'status','UNKNOWN'),
      'daily_active_users_sum',aggregate_data.daily_active_users_sum,
      'daily_active_users_sum_semantics','user_days_not_unique_users',
      'sessions',case when aggregate_data.days_present=spec.expected_days then aggregate_data.sessions end,
      'page_views',case when aggregate_data.days_present=spec.expected_days then aggregate_data.page_views end,
      'new_users',case when aggregate_data.days_present=spec.expected_days then aggregate_data.new_users end,
      'reserve_click',aggregate_data.reserve_click,'line_click',aggregate_data.line_click,
      'price_click',aggregate_data.price_click,'article_cta_click',aggregate_data.article_cta_click,
      'partial_values',case when aggregate_data.days_present between 1 and spec.expected_days-1
        then jsonb_build_object('sessions',aggregate_data.sessions,'page_views',aggregate_data.page_views,'new_users',aggregate_data.new_users) end);
    result:=result||jsonb_build_object(spec.key,window_data);
  end loop;
  return result;
end; $$;
revoke all on function public.company_os_get_ga4_morning_metrics(date) from public,anon,authenticated;
grant execute on function public.company_os_get_ga4_morning_metrics(date) to service_role;
