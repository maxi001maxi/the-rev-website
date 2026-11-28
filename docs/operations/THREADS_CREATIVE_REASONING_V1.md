# THE REV. Threads Director v1.0

Status: IMPLEMENTED / RELEASE ACCEPTANCE IN PROGRESS
Date: 2026-10-07
Scope: Threads only. Social Director overall v1.0/v1.0.1 cutover remains a separate gate.

## Source basis and precedence

Company Current Truth and active decisions override older snapshots. Research is a discovery lens, not proof that a post will cause trust, follows or visits.

- Strategy: https://docs.google.com/document/d/15aLlh-9GuTr-uQBZJB3E7KDHIWH48XhyBfnCdp22-qg/edit
  - §§1–4: Future Follow Value, Person Model, Instagram/Threads distinct roles.
  - §§5–6: eight content jobs; knowledge bot, recurring CTA and tidy three-part copy are failure modes.
- Voice: https://docs.google.com/document/d/1YeEnmKjyaDrlssmV_SEuCZTY4LVxp7Nv8vnyPYxUgGQ/edit
  - §§7–8: structure variation; genuine first-party and verified brand judgment.
  - §§17–18,23: layered posts, varied endings, feed-level diversity without equal quotas.
- Evidence: https://docs.google.com/document/d/11ahwJUF6PuMX41Ibf8VD09FnnciRpHo7CrUyQIFQQbo/edit
  - §§3–6: truth authority differs from decision relevance; model prior may diverge and generate retrieval queries, but is not evidence.
- Ops D-047–049: portfolio priority is not a quota; same-day evidence reuse is opt-in.

This implementation is an engineering interpretation of those canons and the owner's finalization instruction. Its thresholds are initial duplicate-detection heuristics, not externally validated psychological or platform laws.

## Runtime

Current Truth / research lenses / actual history / customer signals / first-party / performance / learning
→ broad Opportunity discovery, including model-generated hypotheses
→ targeted retrieval and counter-hypothesis search
→ SELECT / REJECT / RETRIEVE / HOLD with reasons
→ candidate grounding and claim packet
→ Writer
→ independent factual / voice / feed / cross-channel QC
→ existing prepare / choose / verified publication / learning lifecycle.

Divergence is not permission to draft an assertion first and rationalize it afterward. Record the research principle and available signals before selecting the direction. Creative-only directions may have no evidence yet; SELECT requires retrieved sources. If a direction is unsupported, retrieve, reject or hold. Do not mechanically turn every strong source into a post.

Internally consider several materially different angles, normally 3–6, without eight-job quotas. With fewer usable directions, record the actual limitation. Public output remains 1–3 or HOLD. Jobs and structure need not be uniformly balanced. A deliberate same-structure batch needs a reason.

Human Voice is sourced from what the operator notices, cares about, questions, hesitates over, chooses, declines or judges. Preserve meaning; do not invent a recent event, customer, emotion, failure or unfinished thought. A verified brand judgment may support perspective; it cannot fabricate a field note or human texture.

## Existing JSON contract

No tables, storage services, Vercel functions, model API calls or publishing jobs are added.

`social_thread_daily_plans.source_context`:

```json
{
  "threads_creative_required": true,
  "threads_creative_version": "THREADS_CREATIVE_REASONING_V1",
  "current_context_summary": "Current business and store context, with source dates",
  "source_health_summary": "Missing, unavailable and stale inputs; never zero demand",
  "research_lenses": [{"evidence_key":"canon-voice","source_ref":"retrieved source ref","principle":"Relevant canon principle","application":"How it changes discovery today","limitation":"What it does not prove"}],
  "divergent_opportunities": [{"opportunity_key":"direction-1","angle":"Specific angle","decision":"SELECT","evidence_keys":["first-party-1"],"selection_reason":"Concrete reason, including why alternatives lost"}],
  "divergence_limit_reason": "Required only if fewer than three directions",
  "feed_balance_reason": "Why this facet of the store/person belongs in the recent feed"
}
```

Research lens references must match retrieved `RESEARCH_CANON` / `RAW_RESEARCH` evidence. An arbitrary source URL or scalar direction count is insufficient.

`social_thread_candidates.evidence_packet.creative_reasoning`:

- version, opportunity_key, main_claim, angle;
- structure_type / ending_type;
- person_model_residue / future_follow_value / difference_from_recent;
- why_now_signal / why_now_evidence_keys;
- human_voice_source {source_key, dimension, detail};
- counterevidence_search {searched_evidence_keys, result, limitation};
- claims [{text, kind: FACT|OBSERVATION|INTERPRETATION|HYPOTHESIS, evidence_keys}];
- optional conversation_learning_question, local_context_source_key;
- optional reuse_exception {allowed:true, reason, content_refs, changed_value}.

Structure values: OBSERVATION_FIRST, JUDGMENT_FIRST, SMALL_STORY, FACT_TO_VIEW, UNFINISHED_THOUGHT, REPLY_CONTINUATION, LIGHT_NOTE, PROMOTION_WITH_CONTEXT.
Endings: CLOSED, OPEN, OBSERVATION, QUESTION, ACTION, NO_CONCLUSION.
Human dimensions: NOTICE, CARE, DISCOMFORT, HESITATION, CHOOSE, DECLINE, JUDGMENT.

Every public claim needs source lineage and public-use permission. Counterevidence search may find none; record scope and limits rather than inventing counterevidence. A hypothetical behavior is not a proven customer effect. Internal strategy evidence can guide discovery but must not become a public claim.

## Diversity gates

The server reads 14-day Threads work/history, current Reel/Story proposals and Director assignments, published Instagram/Threads, and recent Editorial drafts/verified publications. PROPOSED, SHADOW and PUBLISHED_VERIFIED are labeled separately. ACCEPTANCE runs are excluded.

Compare:
- primary evidence keys, source row refs and near-identical excerpts, including renamed keys;
- main claim similarity;
- candidate angle, structure, ending and job;
- feed balance and the person/store facet to remember.

Same-day cross-channel primary source reuse requires a documented campaign reason, exact conflicting content refs and changed value. The same claim cannot pass through an exception. Prior source reuse likewise requires a concrete new value; otherwise REVIEW_REQUIRED or additional retrieval. Freshness is not inferred from a new evidence key.

NFKC-normalized character-trigram containment is a bounded heuristic (claim >=0.72, excerpt >=0.85; non-identical texts under 12 chars skip fuzzy comparison). It cannot detect every semantic paraphrase or prove that claims faithfully represent source meaning. Independent QC and Human Approval remain mandatory.

Validation happens before plan writes and again before selection. A newer Reel/Story can block a previously drafted candidate. Verified publication also requires SELECTED status; an actual media ID alone cannot bypass approval.

## Idempotency and rollout

Existing complete READY/SELECTED/published same-day work is reused; v0.7 work is not relabeled as v1.0 acceptance. A new day uses the v1 contract. Today's completed plan is not replaced merely to demonstrate variety.

The 05:30 task keeps its identity, schedule, Reel/Story behavior and no-API-generation rule. Only Threads is upgraded after release verification. Do not claim the overall Social v1.0/v1.0.1 Director cutover from a Threads release.

Release gates:
1. Social regression, new behavioral tests, Phase 9 and release policy PASS.
2. Exact candidate Preview READY; read-only real Supabase acceptance in the Preview environment; authenticated handler boundary test; no production-plan writes.
3. Merge, exact current main Production READY; read-only production-environment acceptance.
4. Update the existing Task's Threads instructions and read back.
5. First unattended 05:30 run validates the v1 packet / HOLD and no auto-publish. Until then: PRODUCTION DEPLOYED / FIRST SCHEDULED ACCEPTANCE PENDING.

Authenticated live HTTP Bridge proof is reported separately from server-environment/handler proof. A successful build is not silently described as a live authenticated HTTP request.
