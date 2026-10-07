-- Morning Meeting v3 Phase 4
-- PDF artifact + visual QA registry.

create table if not exists public.company_os_morning_report_artifacts (
  business_date date not null,
  report_version text not null default 'v3',
  artifact_status text not null default 'DRAFT' check (
    artifact_status in ('DRAFT','RENDERED','QA_FAILED','QA_PASS','DELIVERED')
  ),
  artifact_ref text,
  source_fixture_ref text,
  page_count integer check (page_count is null or page_count > 0),
  page_size text,
  orientation text,
  renderer_primary text,
  renderer_secondary text,
  render_dpi_primary integer,
  render_dpi_secondary integer,
  embedded_fonts jsonb not null default '[]'::jsonb,
  required_text_anchors jsonb not null default '{}'::jsonb,
  visual_qa jsonb not null default '{}'::jsonb,
  technical_qa jsonb not null default '{}'::jsonb,
  quality_score numeric(5,2),
  qa_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_date, report_version)
);

alter table public.company_os_morning_report_artifacts enable row level security;
revoke all on table public.company_os_morning_report_artifacts from anon, authenticated;

comment on table public.company_os_morning_report_artifacts is
'Morning Meeting PDF render/QA evidence. QA_PASS requires a valid 4-page A4 render with embedded Japanese fonts and all required page anchors.';

create or replace function public.company_os_get_morning_report_gate(
  p_business_date date default (now() at time zone 'Asia/Tokyo')::date,
  p_report_version text default 'v3'
)
returns jsonb
language sql
security definer
set search_path=public
as $$
with r as (
  select *
  from public.company_os_morning_report_artifacts
  where business_date=p_business_date
    and report_version=p_report_version
),
checks as (
  select
    r.*,
    coalesce(page_count=4,false) as page_count_pass,
    coalesce(lower(page_size) in ('a4','595.276 x 841.89 pts','595 x 842 pts'),false) as page_size_pass,
    coalesce(lower(orientation)='portrait',false) as orientation_pass,
    coalesce(jsonb_array_length(embedded_fonts)>0,false) as font_list_present,
    coalesce((technical_qa->>'japanese_font_embedded')::boolean,false) as japanese_font_embedded_pass,
    coalesce((technical_qa->>'unicode_mapping')::boolean,false) as unicode_mapping_pass,
    coalesce((technical_qa->>'primary_render_pass')::boolean,false) as primary_render_pass,
    coalesce((technical_qa->>'secondary_render_pass')::boolean,false) as secondary_render_pass,
    coalesce((visual_qa->>'all_pages_inspected')::boolean,false) as all_pages_inspected_pass,
    coalesce((visual_qa->>'no_clipping')::boolean,false) as no_clipping_pass,
    coalesce((visual_qa->>'no_semantic_overlap')::boolean,false) as no_overlap_pass,
    coalesce((visual_qa->>'no_missing_glyphs')::boolean,false) as no_glyph_pass,
    coalesce((visual_qa->>'information_hierarchy_pass')::boolean,false) as hierarchy_pass,
    coalesce((required_text_anchors->>'all_required_present')::boolean,false) as anchors_pass
  from r
)
select jsonb_build_object(
  'business_date',p_business_date,
  'report_version',p_report_version,
  'artifact_present',exists(select 1 from r),
  'artifact_status',(select artifact_status from r),
  'page_count_pass',coalesce((select page_count_pass from checks),false),
  'page_size_pass',coalesce((select page_size_pass from checks),false),
  'orientation_pass',coalesce((select orientation_pass from checks),false),
  'japanese_font_embedded_pass',coalesce((select japanese_font_embedded_pass from checks),false),
  'unicode_mapping_pass',coalesce((select unicode_mapping_pass from checks),false),
  'primary_render_pass',coalesce((select primary_render_pass from checks),false),
  'secondary_render_pass',coalesce((select secondary_render_pass from checks),false),
  'all_pages_inspected_pass',coalesce((select all_pages_inspected_pass from checks),false),
  'no_clipping_pass',coalesce((select no_clipping_pass from checks),false),
  'no_overlap_pass',coalesce((select no_overlap_pass from checks),false),
  'no_missing_glyphs_pass',coalesce((select no_glyph_pass from checks),false),
  'information_hierarchy_pass',coalesce((select hierarchy_pass from checks),false),
  'anchors_pass',coalesce((select anchors_pass from checks),false),
  'quality_score',(select quality_score from r),
  'report_gate_pass',
    exists(select 1 from checks)
    and coalesce((select artifact_status in ('QA_PASS','DELIVERED') from checks),false)
    and coalesce((select page_count_pass from checks),false)
    and coalesce((select page_size_pass from checks),false)
    and coalesce((select orientation_pass from checks),false)
    and coalesce((select japanese_font_embedded_pass from checks),false)
    and coalesce((select unicode_mapping_pass from checks),false)
    and coalesce((select primary_render_pass from checks),false)
    and coalesce((select secondary_render_pass from checks),false)
    and coalesce((select all_pages_inspected_pass from checks),false)
    and coalesce((select no_clipping_pass from checks),false)
    and coalesce((select no_overlap_pass from checks),false)
    and coalesce((select no_glyph_pass from checks),false)
    and coalesce((select hierarchy_pass from checks),false)
    and coalesce((select anchors_pass from checks),false)
    and coalesce((select quality_score >= 80 from checks),false)
);
$$;

revoke all on function public.company_os_get_morning_report_gate(date,text)
  from public,anon,authenticated;
