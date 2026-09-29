create or replace view public.daily_manager_weekly_rollup
with (security_invoker = true) as
select
  date_trunc('week', business_date::timestamp)::date as week_start,
  (date_trunc('week', business_date::timestamp)::date + 6) as week_end,
  count(*)::integer as snapshot_days,
  count(*) filter (where snapshot_status = 'FINAL')::integer as final_days,
  count(*) filter (where planned_sessions is not null)::integer as session_input_days,
  sum(planned_sessions) filter (where planned_sessions is not null)::integer as planned_sessions,
  sum(completed_sessions) filter (where completed_sessions is not null)::integer as completed_sessions,
  sum(cancel_count) filter (where cancel_count is not null)::integer as cancel_count,
  sum(trial_sessions) filter (where trial_sessions is not null)::integer as trial_sessions,
  sum(web_sessions) filter (where web_sessions is not null)::integer as web_sessions,
  sum(web_active_users) filter (where web_active_users is not null)::integer as daily_active_user_sum,
  sum(web_views) filter (where web_views is not null)::integer as web_views,
  sum(organic_sessions) filter (where organic_sessions is not null)::integer as organic_sessions,
  sum(organic_social_sessions) filter (where organic_social_sessions is not null)::integer as organic_social_sessions,
  sum(ai_assistant_sessions) filter (where ai_assistant_sessions is not null)::integer as ai_assistant_sessions,
  sum(reserve_click) filter (where reserve_click is not null)::integer as reserve_click,
  sum(line_click) filter (where line_click is not null)::integer as line_click,
  sum(price_click) filter (where price_click is not null)::integer as price_click,
  sum(article_cta_click) filter (where article_cta_click is not null)::integer as article_cta_click,
  sum(high_intent_events) filter (where high_intent_events is not null)::integer as high_intent_events,
  sum(consideration_events) filter (where consideration_events is not null)::integer as consideration_events,
  sum(published_articles_today) filter (where published_articles_today is not null)::integer as published_articles,
  max(gsc_settled_through) as latest_gsc_settled_through,
  max(gsc_clicks_7d) filter (
    where gsc_settled_through = (
      select max(s2.gsc_settled_through)
      from public.daily_manager_snapshots s2
      where date_trunc('week', s2.business_date::timestamp)::date =
            date_trunc('week', daily_manager_snapshots.business_date::timestamp)::date
    )
  ) as latest_gsc_clicks_7d,
  max(gsc_impressions_7d) filter (
    where gsc_settled_through = (
      select max(s2.gsc_settled_through)
      from public.daily_manager_snapshots s2
      where date_trunc('week', s2.business_date::timestamp)::date =
            date_trunc('week', daily_manager_snapshots.business_date::timestamp)::date
    )
  ) as latest_gsc_impressions_7d,
  max(generated_at) as latest_snapshot_at
from public.daily_manager_snapshots
group by 1,2;

comment on view public.daily_manager_weekly_rollup is
'Daily Manager snapshots aggregated Monday-Sunday for the weekly AI management meeting. daily_active_user_sum is a sum of daily active users and must not be treated as weekly unique users.';
