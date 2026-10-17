-- Canonical GPT operator inbox for Topic Approval.
-- ChatGPT/connected operators may enqueue explicit owner choices/answers here.
-- They never write editorial_topic_proposals directly. The production Topic API
-- consumes PENDING requests and applies the existing chooseTopic/answerInterview
-- validation and state machine.

create table if not exists public.editorial_gpt_operator_requests (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  proposal_id text not null references public.editorial_topic_proposals(id) on delete cascade,
  action text not null check (action in ('choose','answer')),
  number integer,
  answers jsonb,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','APPLIED','REJECTED')),
  resulting_status text,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (action = 'choose' and number is not null and answers is null)
    or
    (action = 'answer' and number is null and jsonb_typeof(answers) = 'array')
  )
);

alter table public.editorial_gpt_operator_requests enable row level security;

revoke all on table public.editorial_gpt_operator_requests from anon, authenticated;
grant all on table public.editorial_gpt_operator_requests to service_role;

create index if not exists editorial_gpt_operator_requests_pending_idx
  on public.editorial_gpt_operator_requests (status, created_at)
  where status in ('PENDING','PROCESSING');

comment on table public.editorial_gpt_operator_requests is
  'Private GPT operator inbox. Requests are inputs only; production Topic API applies canonical validation/state transitions.';
