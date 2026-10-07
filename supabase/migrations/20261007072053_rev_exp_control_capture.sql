-- Aggregate experiment read model only; no customer identifiers or personal data.
create table if not exists public.company_os_experiment_daily_metrics (
  experiment_id text not null,
  metric_date date not null,
  variant text not null check (variant in ('control','treatment')),
  eligible_sessions bigint check (eligible_sessions >= 0),
  exposure_event_count bigint check (exposure_event_count >= 0),
  reserve_click bigint check (reserve_click >= 0),
  reservation_start bigint check (reservation_start >= 0),
  reservation_complete bigint check (reservation_complete >= 0),
  trial_show bigint check (trial_show >= 0),
  trial_to_paid bigint check (trial_to_paid >= 0),
  data_status text not null default 'UNKNOWN'
    check (data_status in ('VALUE','DELAYED','UNKNOWN','ERROR')),
  booking_data_status text not null default 'UNKNOWN'
    check (booking_data_status in ('VALUE','UNKNOWN')),
  source text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (experiment_id,metric_date,variant),
  check (
    booking_data_status <> 'UNKNOWN' or
    (
      reservation_start is null and
      reservation_complete is null and
      trial_show is null and
      trial_to_paid is null
    )
  )
);

alter table public.company_os_experiment_daily_metrics enable row level security;
revoke all on public.company_os_experiment_daily_metrics from anon, authenticated;
grant select, insert, update on public.company_os_experiment_daily_metrics to service_role;

comment on table public.company_os_experiment_daily_metrics is
  'Private aggregate Company OS read model for marketing experiment capture. No PII. UNKNOWN is never coerced to zero.';

comment on column public.company_os_experiment_daily_metrics.eligible_sessions is
  'GA4 sessions containing section_view on production /price.html. price.html emits section_view only when #cat-trial reaches >=25% viewport visibility. This is not eventCount and must not be summed across days as a distinct period-session metric.';

comment on column public.company_os_experiment_daily_metrics.reserve_click is
  'Diagnostic GA4 reserve_click event count on /price.html during the experiment window. It is booking intent, not reservation completion.';

comment on column public.company_os_experiment_daily_metrics.reservation_complete is
  'NULL until an authoritative, scope-compatible Gym booking aggregate is confirmed. Clicks are not bookings.';
