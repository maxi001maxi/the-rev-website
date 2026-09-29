create table if not exists public.daily_manager_inputs (
  business_date date primary key,
  planned_sessions integer check (planned_sessions is null or planned_sessions >= 0),
  cancel_count integer not null default 0 check (cancel_count >= 0),
  same_day_additions integer not null default 0 check (same_day_additions >= 0),
  actual_sessions integer check (actual_sessions is null or actual_sessions >= 0),
  trial_sessions integer check (trial_sessions is null or trial_sessions >= 0),
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_manager_snapshots (
  business_date date primary key,
  snapshot_status text not null default 'PRELIMINARY'
    check (snapshot_status in ('PRELIMINARY','FINAL')),
  generated_at timestamptz not null default now(),
  finalized_at timestamptz,
  planned_sessions integer,
  cancel_count integer,
  same_day_additions integer,
  actual_sessions integer,
  completed_sessions integer,
  session_data_quality text,
  trial_sessions integer,
  gross_sales_today numeric,
  paid_transactions_today integer,
  followup_due_count integer,
  followup_attention_count integer,
  web_sessions integer,
  web_active_users integer,
  web_views integer,
  web_engagement_rate numeric,
  organic_sessions integer,
  organic_social_sessions integer,
  ai_assistant_sessions integer,
  reserve_click integer,
  line_click integer,
  price_click integer,
  article_cta_click integer,
  high_intent_events integer,
  consideration_events integer,
  gsc_settled_through date,
  gsc_clicks_7d integer,
  gsc_impressions_7d integer,
  published_articles_today integer,
  manager_comment text,
  priorities jsonb not null default '[]'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_manager_inputs enable row level security;
alter table public.daily_manager_snapshots enable row level security;

drop policy if exists "select daily manager inputs" on public.daily_manager_inputs;
create policy "select daily manager inputs"
on public.daily_manager_inputs for select
using (exists (
  select 1 from public.admin_members m
  where m.user_id = auth.uid() and m.active = true
));

drop policy if exists "insert daily manager inputs" on public.daily_manager_inputs;
create policy "insert daily manager inputs"
on public.daily_manager_inputs for insert
with check (
  exists (
    select 1 from public.admin_members m
    where m.user_id = auth.uid() and m.active = true
  )
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists "update daily manager inputs" on public.daily_manager_inputs;
create policy "update daily manager inputs"
on public.daily_manager_inputs for update
using (exists (
  select 1 from public.admin_members m
  where m.user_id = auth.uid() and m.active = true
))
with check (
  exists (
    select 1 from public.admin_members m
    where m.user_id = auth.uid() and m.active = true
  )
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists "select daily manager snapshots" on public.daily_manager_snapshots;
create policy "select daily manager snapshots"
on public.daily_manager_snapshots for select
using (exists (
  select 1 from public.admin_members m
  where m.user_id = auth.uid() and m.active = true
));

create index if not exists daily_manager_snapshots_generated_at_idx
  on public.daily_manager_snapshots (generated_at desc);
