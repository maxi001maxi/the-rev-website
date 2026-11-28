# THE REV. Social Director v0.8 — Phase 1 Evidence & Opportunity Core

Status: SHADOW / NOT YET PRODUCTION PLANNER
Owner: Social Director

## Purpose

Move the daily decision boundary from:

Context -> LLM Candidate

to:

Context -> Evidence Retrieval -> Shared Evidence Pool -> Opportunity -> Channel-specific Candidate

Phase 1 does not replace the current Reel / Stories / Threads production flow.
It adds the common reasoning layer beside the current production path.

## Shared Evidence

Canonical runtime tables:
- social_evidence_daily_pools
- social_evidence_items

Supported source types:
- CUSTOMER_SIGNAL
- PERFORMANCE
- OPERATOR_FIRST_PARTY
- STORE_EVENT
- FACT_REGISTRY
- RESEARCH_CANON
- RAW_RESEARCH
- LOCAL_SIGNAL
- TREND_SIGNAL
- PRODUCTION_LEARNING

Model prior is not an Evidence source.

Native Supabase retrieval:
- customer signals
- verified published-post performance
- production learnings

External retrieval is supplied by the ChatGPT Task when relevant:
- Operator / trainer First-party
- Fact Registry
- Research Canon
- Current store / operating truth

## Opportunity

Canonical runtime tables:
- social_opportunity_daily_plans
- social_opportunities
- social_opportunity_evidence

An Opportunity exists before Reel / Stories / Threads creative generation.

Minimum Opportunity contract:
- Title
- Business Problem
- Why now
- PRIMARY Evidence
- Audience State when known
- Observed Signal
- Interpretation
- Hypothesis
- Expected Behavior
- Evidence Strength
- Confidence
- Evidence Gaps
- Possible Channels
- Channel Scores
- Test Metrics
- Counterevidence summary
- Recent / source references

Evidence Strength:
- GROUNDED: THE REV.-specific evidence exists
- EXPLORATORY: relevant research/market evidence but own evidence is thin
- UNGROUNDED: model prior only; cannot be READY

## Bridge actions

- social_evidence_context
- social_evidence_prepare
- social_evidence_poll
- social_opportunities_prepare
- social_opportunities_poll

## Safety / truth boundary

- Human approval remains required.
- No publish action is added.
- anon/authenticated access is revoked.
- service_role only.
- RLS is enabled on all new public tables.
- Customer Signal is evidence of experience/perception/barrier, not scientific truth.
- Performance changes probabilities, not possibilities.
- Candidate generation must not search for a reason after the creative idea already exists.

## Phase 1 completion boundary

Phase 1 is complete when:
1. Shared evidence can be assembled from native + external canonical sources.
2. Evidence is persisted with source lineage.
3. Opportunity cannot be prepared without PRIMARY Evidence.
4. UNGROUNDED opportunity cannot be READY.
5. Opportunity -> Evidence is reverse traceable.
6. Existing v0.7 production path remains unchanged.

Phase 2 will consume these Opportunities to generate Evidence-first Reel and Stories candidates.
