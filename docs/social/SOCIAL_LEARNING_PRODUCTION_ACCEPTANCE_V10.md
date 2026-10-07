# THE REV. Social Director v1.0 — Phase 4 Learning & Production Acceptance

Status: ENGINEERING / DB IMPLEMENTED
Production cutover: gated

## Goal

Close the full loop:

Evidence
-> Opportunity
-> Social Director
-> Channel specialist
-> Human Approval
-> Verified Publication
-> Performance
-> Learning Observation
-> Production Learning
-> next Evidence / Director context

Then decide whether the v1.0 runtime is safe to replace the current v0.7 05:30 planner.

## Human approval lifecycle

### Reel
READY_FOR_APPROVAL
-> explicit choose
-> SELECTED
-> optional CREATED
-> verified platform post
-> PUBLISHED_VERIFIED

### Stories
READY_FOR_APPROVAL
-> explicit approve
-> APPROVED
-> optional CREATED
-> verified platform post
-> PUBLISHED_VERIFIED

### Threads
READY_FOR_APPROVAL
-> existing explicit choose
-> SELECTED
-> verified platform post
-> PUBLISHED_VERIFIED

There is still no auto-publish action.

## Verified publication lineage

A verified published post can now link to:
- reel_evidence_candidate_id
- story_evidence_item_id
- thread_candidate_id
- director_assignment_id
- opportunity_id

A publication link is rejected unless:
1. the platform/media ID already exists in canonical published history;
2. the output was explicitly human-approved;
3. Director Assignment matches channel and Opportunity.

## Learning Observation

New store:
- social_learning_observations

Each observation is unique by:
- learning_key
- source_post_id

Therefore repeated metric refreshes for one post do not count as independent evidence.

Observation:
- source verified post
- Opportunity
- Director Assignment
- Channel
- SUPPORT / COUNTER / NEUTRAL
- rationale
- confidence
- latest performance snapshot
- comparison context

## Performance Learning activation

Automatic activation is intentionally conservative.

PERFORMANCE learning becomes ACTIVE only when:
- at least 2 distinct verified posts support the same learning;
- zero counter observations exist;
- average observation confidence >= 0.65.

One post never becomes a reusable rule.

Any COUNTER observation blocks automatic activation.

Non-PERFORMANCE learnings are not automatically promoted by this loop.
Owner / explicit human decisions remain the authority for preference or policy learnings.

## Next-run integration

Social Director context now separates:
- ACTIVE learnings
- CANDIDATE learnings

ACTIVE:
- reusable operating prior with moderate evidence authority.

CANDIDATE:
- lower-weight evidence only;
- cannot act like a hard operating rule.

Phase 1 Evidence retrieval already includes both with different decision relevance.

## Production Acceptance

New store:
- social_production_acceptance_runs

### PRE_CUTOVER gates

All must pass:
- final website deployment READY
- live Bridge verified
- Director Cross-channel QC PASS
- Learning Loop schema/runtime ready
- Human Approval gate verified
- v1.0 Task prompt prepared
- scheduled Task version matches v1.0
- no auto-publish

PASS result:
- READY_FOR_CUTOVER

This does not automatically switch production.

### POST_CUTOVER gates

All PRE_CUTOVER gates plus:
- first live v1.0 scheduled run PASS

PASS result:
- ACCEPTED

If any gate fails:
- BLOCKED

## Bridge

- social_reel_evidence_choose
- social_story_evidence_approve
- social_output_created
- social_output_publication_link
- social_learning_observe
- social_learning_loop_context
- social_production_acceptance

## Current operational truth

Until Production Acceptance passes:
- current 05:30 production planner remains v0.7;
- v1.0 code may exist in main without becoming the active planner;
- Vercel READY and live Bridge verification are mandatory;
- Human Approval remains mandatory.
