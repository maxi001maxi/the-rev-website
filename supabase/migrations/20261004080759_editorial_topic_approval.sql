-- Private workflow state; choices can only be changed by authenticated APIs.
create table public.editorial_topic_proposals (
  id text primary key check (id ~ '^TP-[0-9]{8}$'),
  target_date date not null unique,
  status text not null check (status in ('TOPIC_SELECTION_WAITING','INTERVIEW_WAITING','APPROVED','QUEUE_CREATED','REVIEW_REQUIRED')),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 3),
  replaces_content_ids jsonb not null default '[]',
  selected_candidate_id text,
  approved_at timestamptz, approved_source text, approved_actor text,
  interview_answers jsonb, interview_answered_at timestamptz, interview_source text, interview_actor text,
  content_id text,
  notification_kind text not null default 'TOPICS',
  notification_status text not null default 'PENDING',
  notification_sent_at timestamptz, notification_error text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'TOPIC_SELECTION_WAITING' or selected_candidate_id is not null)
);
alter table public.editorial_topic_proposals enable row level security;
revoke all on public.editorial_topic_proposals from public, anon, authenticated;
grant all on public.editorial_topic_proposals to service_role;
create index editorial_topics_pending on public.editorial_topic_proposals (status, target_date);

create table public.editorial_line_receipts (
  event_id text primary key,
  processed_at timestamptz not null default now()
);
alter table public.editorial_line_receipts enable row level security;
revoke all on public.editorial_line_receipts from public, anon, authenticated;
grant all on public.editorial_line_receipts to service_role;
