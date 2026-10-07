-- Morning Meeting v3 Phase 5
-- Composite release gate for production-candidate validation.
-- This migration is intentionally inert until merged/applied.

create or replace function public.company_os_get_morning_v3_release_gate(
  p_business_date date default (now() at time zone 'Asia/Tokyo')::date,
  p_report_version text default 'v3'
)
returns jsonb
language sql
security invoker
set search_path=public
as $$
with
retrieval as (
  select public.company_os_get_morning_retrieval_audit(p_business_date,null) as j
),
continuity as (
  select public.company_os_get_morning_continuity_gate(p_business_date) as j
),
consultant as (
  select public.company_os_get_morning_consultant_gate(p_business_date) as j
),
report as (
  select public.company_os_get_morning_report_gate(p_business_date,p_report_version) as j
)
select jsonb_build_object(
  'business_date', p_business_date,
  'report_version', p_report_version,
  'retrieval', (select j from retrieval),
  'continuity', (select j from continuity),
  'consultant', (select j from consultant),
  'report', (select j from report),
  'retrieval_gate_pass', coalesce(((select j from retrieval)->>'retrieval_gate_pass')::boolean,false),
  'use_what_you_got_gate_pass', coalesce(((select j from retrieval)->>'use_what_you_got_gate_pass')::boolean,false),
  'continuity_gate_pass', coalesce(((select j from continuity)->>'continuity_gate_pass')::boolean,false),
  'consultant_gate_pass', coalesce(((select j from consultant)->>'consultant_gate_pass')::boolean,false),
  'report_gate_pass', coalesce(((select j from report)->>'report_gate_pass')::boolean,false),
  'release_gate_pass',
    coalesce(((select j from retrieval)->>'retrieval_gate_pass')::boolean,false)
    and coalesce(((select j from retrieval)->>'use_what_you_got_gate_pass')::boolean,false)
    and coalesce(((select j from continuity)->>'continuity_gate_pass')::boolean,false)
    and coalesce(((select j from consultant)->>'consultant_gate_pass')::boolean,false)
    and coalesce(((select j from report)->>'report_gate_pass')::boolean,false)
);
$$;

revoke all on function public.company_os_get_morning_v3_release_gate(date,text)
  from public,anon,authenticated;

comment on function public.company_os_get_morning_v3_release_gate(date,text) is
'Morning Meeting v3 composite release gate. Returns Phase 1 retrieval/use, Phase 2 continuity, Phase 3 consultant and Phase 4 report QA gate states. Intended for trusted server-side validation only.';
