begin;

create table if not exists public.social_threads_api_connections (
  connection_key text primary key default 'primary',
  connected_by_user_id uuid references auth.users(id) on delete set null,
  threads_user_id text,
  username text,
  access_token text not null,
  token_type text not null default 'bearer',
  scopes text[] not null default '{}',
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz,
  last_error text
);

alter table public.social_threads_api_connections enable row level security;
revoke all on table public.social_threads_api_connections from public, anon, authenticated;
grant select,insert,update,delete on table public.social_threads_api_connections to service_role;

comment on table public.social_threads_api_connections is
'Server-only primary Meta Threads API OAuth connection for THE REV Social Director. No browser RLS policies; service_role only.';

comment on column public.social_threads_api_connections.access_token is
'Long-lived Threads user access token. Server-only secret; never return to browsers, logs, GitHub, or Social plan JSON.';

commit;
