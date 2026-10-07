create index if not exists social_thread_candidate_evidence_evidence_idx on public.social_thread_candidate_evidence (evidence_id);
create index if not exists social_thread_daily_plans_selected_idx on public.social_thread_daily_plans (selected_candidate_id) where selected_candidate_id is not null;
