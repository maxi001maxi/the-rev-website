# THE REV. Social Director v0.9 — Phase 3 Cross-channel Integration

Status: SHADOW RUNTIME
Production planner: v0.7 remains active until deployment + live acceptance.

## Goal

Move from three channel planners to one Social Director decision layer:

Evidence
-> Opportunity
-> Social Director
-> Channel Assignment
-> Reel / Stories / Threads specialist execution
-> Cross-channel QC
-> Human Approval

The Social Director decides **who should say what, and why this channel**.
Channel specialists decide **how to execute it well**.

## Runtime tables

- social_director_daily_plans
- social_director_channel_assignments

Existing channel outputs gain Director lineage:
- social_reel_evidence_candidates.director_assignment_id
- social_story_evidence_items.director_assignment_id
- social_thread_candidates.opportunity_id
- social_thread_candidates.director_assignment_id

## Assignment contract

Each active assignment has:
- opportunity_id
- channel
- assignment_role: LEAD / SUPPORT
- channel_job
- angle_key
- message_key
- claim_focus
- rationale
- expected_behavior
- priority
- estimated_work_minutes
- evidence_keys
- qc_decision

Evidence keys must already belong to that Opportunity.

## Channel jobs

### Reel
- VISUAL_PROOF
- PROCESS_DEMO
- STORE_EXPERIENCE
- SERVICE_PROOF
- DISCOVERY_KNOWLEDGE

### Stories
- RELATIONSHIP
- FAMILIARITY
- UNCERTAINTY_REDUCTION
- PARTICIPATION
- DECISION_SUPPORT

### Threads
- PERSPECTIVE_JUDGMENT
- FIELD_NOTE_OBSERVATION
- MINI_KNOWLEDGE_THROUGH_JUDGMENT
- HUMAN_TEXTURE
- CONVERSATION
- LOCAL_CONTEXT
- STORE_PROCESS_EXPERIENCE
- LIGHT_PROMOTION

## Cross-channel rules

1. Every used Opportunity has exactly one LEAD channel.
2. Other channels may SUPPORT or HOLD.
3. A channel may be HOLD. Quota filling is not required.
4. Same Opportunity across multiple channels must use distinct:
   - channel job
   - angle_key
   - message_key
   - claim_focus
5. READY assignment requires GROUNDED + READY Opportunity.
6. Evidence must be inside Opportunity lineage.
7. Channel caps:
   - Reel max 2 Opportunities/day
   - Stories max 3
   - Threads max 2
8. Optional workload budget is fail-closed.
9. Human approval remains mandatory.

## Example

Opportunity:
Trainer judgment: planned 10 reps may stop at 8.

Director:
- Reel LEAD / VISUAL_PROOF
  - show 10 -> 8 as visible judgment
- Stories SUPPORT / DECISION_SUPPORT
  - one-frame: planned reps < form quality
- Threads may HOLD
  - do not repeat the same claim simply because the channel exists

Another day the same Opportunity may instead assign:
- Threads LEAD / PERSPECTIVE_JUDGMENT
- Reel SUPPORT / PROCESS_DEMO
- Stories HOLD

Channel assignment is situational, not permanent.

## Bridge actions

- social_director_context
- social_director_prepare
- social_director_poll
- social_director_qc

## Specialist enforcement

When a channel generation request sets:
`source_context.director_required = true`

Reel / Stories:
- only assigned Opportunities are eligible
- director_assignment_id is persisted

Threads:
- opportunity_id required through Director assignment
- director_assignment_id persisted
- Thread content_job must equal Director channel_job

## Cross-channel output QC

`social_director_qc` verifies READY outputs:
- output assignment exists
- channel matches
- Opportunity matches
- Director lineage is preserved

A READY creative without valid Director lineage is a BLOCKER.

## Production safety

- No auto publish added.
- Existing v0.7 05:30 planner is not switched by schema deployment.
- Phase 3 defaults to SHADOW.
- Vercel deployment quota from Phase 2 may still block server runtime deployment.
