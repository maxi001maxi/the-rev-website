-- Match the existing stale-pool failure branch in editorialTopicApi.mjs.
-- An unselected proposal may wait or fail closed for human review.
-- Interview, approval and Queue creation still require an explicit selection.
alter table public.editorial_topic_proposals
  drop constraint editorial_topic_proposals_check,
  add constraint editorial_topic_proposals_check
    check (
      status in ('TOPIC_SELECTION_WAITING', 'REVIEW_REQUIRED')
      or selected_candidate_id is not null
    );
