create table if not exists public.google_business_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  token_scope text,
  account_resource text,
  account_name text,
  location_resource text,
  location_title text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz,
  last_error text
);

alter table public.google_business_connections enable row level security;

comment on table public.google_business_connections is
'Server-only Google Business Profile OAuth connection. No browser RLS policies; service role only.';

comment on column public.google_business_connections.refresh_token is
'Google OAuth refresh token. Server-only secret; never expose through browser/API responses.';
