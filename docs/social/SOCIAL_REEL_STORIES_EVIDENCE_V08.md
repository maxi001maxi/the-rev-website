# THE REV. Social Director v0.8 — Phase 2 Reel / Stories Evidence-first

Status: SHADOW RUNTIME
Production planner: unchanged until acceptance

## Goal

Move Reel B and Stories from:

Context -> LLM creative idea -> post-hoc reason

to:

Shared Evidence
-> Opportunity
-> channel-specific creative execution
-> Evidence Gate
-> Human Approval

## Runtime

Phase 1 remains the strategic source of truth:
- social_evidence_daily_pools
- social_evidence_items
- social_opportunity_daily_plans
- social_opportunities
- social_opportunity_evidence

Phase 2 adds isolated shadow output stores:
- social_reel_evidence_runs
- social_reel_evidence_candidates
- social_story_evidence_runs
- social_story_evidence_items

The old Production Reel / Stories tables are not overwritten during shadow comparison.

## Reel contract

Every one of the five Reel candidates must contain:
- opportunity_id
- creative_direction
- title
- why_this_execution
- business_job / audience_state inherited from Opportunity
- Fact when used
- Interpretation / Hypothesis inherited from Opportunity
- Expected Behavior
- Evidence Strength inherited from Opportunity
- Confidence capped by Opportunity confidence
- Evidence Gaps
- claim_refs
- Test Metrics
- Generalization Flags
- QC Decision
- difference_from_history for strong production candidates

Rules:
1. Five candidates are still required.
2. At least four distinct creative directions are required.
3. If two or more GROUNDED + READY Reel Opportunities exist, the five candidates must cover at least two Opportunities.
4. READY_FOR_APPROVAL requires GROUNDED Opportunity.
5. READY_FOR_APPROVAL requires Opportunity qc_decision=READY.
6. claim_refs must point to Evidence already linked to that Opportunity.
7. Candidate cannot raise confidence above its Opportunity.
8. Generalization flags prohibit READY_FOR_APPROVAL.
9. Model prior is not Evidence.

## Stories contract

Every Story item must contain:
- opportunity_id
- source_signal
- why_today
- Story role
- creative content / asset plan
- Evidence Strength inherited from Opportunity
- Confidence capped by Opportunity
- Evidence Gaps
- recent_pattern_difference for READY_FOR_APPROVAL
- claim_refs
- Expected Behavior
- Test Metrics
- QC Decision

Stories remain lighter than Reel.
One to three items or HOLD is valid.

READY_FOR_APPROVAL still requires GROUNDED Opportunity and valid claim_refs.

## Bridge

- social_creative_evidence_context
- social_reel_evidence_prepare
- social_reel_evidence_poll
- social_stories_evidence_prepare
- social_stories_evidence_poll

## Production safety

- Current 05:30 production planner is unchanged.
- Phase 2 defaults to run_mode=SHADOW.
- No auto-publish path is added.
- Human approval remains mandatory.
- Shadow output can coexist with same-day legacy production output.
- RLS enabled; anon/authenticated revoked; service_role only.

## Phase 2 acceptance

PASS requires:
1. Real Phase 1 Opportunity Plan is consumed.
2. Five Reel candidates persist with Opportunity lineage.
3. Every READY Reel has valid claim_refs.
4. Reel creative diversity gate passes.
5. Stories persist with Opportunity lineage and why_today.
6. Every READY Story has valid claim_refs and recent-pattern difference.
7. GROUNDED / EXPLORATORY status cannot be silently upgraded.
8. Existing same-day Production Reel / Stories remain untouched.
9. Shadow outputs can be compared against legacy outputs.
