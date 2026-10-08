# THE REV. Threads Operations v1.1 — Website Runtime Contract

Date: 2026-10-08
Status: SHADOW RUNTIME CONTRACT / NOT PRODUCTION ACTIVE
Scope: Threads operations only. v1.0 Creative Reasoning remains the creative grounding layer.

## Purpose

v1.1 changes the daily question from:

`What should we post on Threads today?`

to:

`How should THE REV. participate on Threads today?`

The system must decide whether the best daily action is:
- PARTICIPATION_ONLY
- ORIGINAL_PLUS_PARTICIPATION
- ORIGINAL_ONLY
- HOLD

Original posting is no longer assumed.

## Research boundary

Source Research:
- Drive / Social_AI_Research / 05_Threads / 05_Operations_Research
- THE_REV_Threads_Phase5_Operations_2026-10.md

Research is a lens, not a Production rule.

### CANON CANDIDATES

The following are strong enough to encode as operating constraints:
1. Conversation / Reply opportunity is checked before Original generation.
2. Reply / Original / Quote / Repost have different jobs and must not be treated as one content type.
3. Original may be HOLD even on an active day.
4. Posting frequency is not a quota.
5. One-post performance cannot promote a durable rule.
6. Learning is evaluated on rolling 7-day and 30-day windows.
7. Replies can contribute to Person Model / familiarity and are therefore part of creative history.
8. Human Approval remains mandatory.
9. No auto-reply and no auto-publish.

### EXPERIMENTS

Do not hard-code as universal rules:
- replies per day
- ideal reply length
- exact Original / Reply ratio
- posting time
- Quote frequency
- emoji count
- local conversation discovery method

These may be tested and learned from THE REV. data.

### UNKNOWN / NOT CANON

Do not claim:
- Replies cause bookings.
- Threads reliably causes store visits.
- A fixed local-business content ratio is optimal.
- A fixed daily posting count is optimal.
- A fixed posting time is optimal.

## Runtime order

Current Truth
→ Recent Threads / recent soft and hard history
→ Conversation Source Health
→ Participation Opportunity discovery
→ Daily Mode decision
→ if Original required: v1.0 Evidence-first Creative Reasoning
→ MAXI Voice Layer
→ Cross-channel / Safety / Privacy / Fact QC
→ Human Approval
→ verified publication / verified reply activity
→ 7-day / 30-day Learning

## Conversation Source Health

Overall conversation source health records one of:
- FRESH
- STALE
- UNKNOWN
- NOT_CONFIGURED

Each capability is evaluated separately and may also report:
- PERMISSION_NOT_GRANTED
- NOT_REQUESTED

The overall source may remain FRESH when at least one capability is FRESH. A capability that is PERMISSION_NOT_GRANTED must never support a selected participation item.

Selected Reply / Quote / Repost opportunities require FRESH evidence from the exact capability used by that item.

If source status is STALE / UNKNOWN / NOT_CONFIGURED:
- do not fabricate a conversation;
- do not invent an external post, author, quote, or reply target;
- Daily Mode may be ORIGINAL_ONLY or HOLD;
- absence of conversation data does not mean there were no conversations.

## Daily Modes

### PARTICIPATION_ONLY
Use when one or more grounded conversation opportunities are stronger than a new Original and no Original has a current reason.

Requirements:
- >=1 selected participation opportunity
- conversation_source_status = FRESH
- original_required = false

### ORIGINAL_PLUS_PARTICIPATION
Use when both a grounded Original reason and >=1 grounded participation opportunity exist.

Requirements:
- >=1 selected participation opportunity
- conversation_source_status = FRESH
- original_required = true
- v1.0 Original candidate path still passes all existing gates

### ORIGINAL_ONLY
Use when a grounded Original reason exists but valid conversation opportunities are unavailable or not strategically useful.

Requirements:
- original_required = true
- no selected participation opportunity

### HOLD
Use when neither Original nor participation is strong enough, or source/safety constraints prevent valid work.

Requirements:
- original_required = false
- no selected participation opportunity
- explicit hold_reason

## Participation Opportunity contract

Every selected participation item must include:
- opportunity_key
- surface: REPLY / QUOTE / REPOST
- source_ref
- source_observed_at
- source_summary
- why_this_conversation
- THE_REV_role
- risk_notes
- draft_text when a Human Approval draft is produced

The system must preserve:
- the source post's meaning;
- no invented context;
- no fabricated personal experience;
- no fabricated customer story;
- no medical overclaim;
- no privacy leak;
- no hidden promotion disguised as a reply.

## Reply / Quote / Repost roles

Reply:
- participate inside another conversation;
- add judgment, useful context, human reaction, or a real question;
- do not turn every reply into a mini-lecture.

Quote:
- bring an external conversation into THE REV.'s own audience context;
- requires a real reason to add a distinct perspective;
- avoid using Quote merely for reach.

Repost:
- amplify without adding a claim;
- use sparingly and only when amplification itself has a clear brand reason.

## HOLD is a valid operating result

HOLD is not failure.

Examples:
- today's Original is materially the same as recent content;
- only promotional content is available;
- participation source is unavailable;
- evidence is weak;
- cross-channel collision is too high;
- the system cannot safely preserve provenance.

## Voice

v1.1 does not change the MAXI Voice rule:
- content and claims are grounded first;
- wording is transformed afterward.

Speech pattern may be MAXI-like.
Emoji are an editorial decision, normally 0–2 when useful, not a MAXI imitation rule and not a quota.

## Measurement

Do not optimize primarily for Views.

Track where available:
- meaningful replies
- repeat interactions
- profile visits
- follows
- quote / repost activity
- external profile / site actions
- verified inquiry source when available

Learning windows:
- 7-day = near-term operating signal
- 30-day = stronger directional signal

A single post or reply never becomes a permanent rule.

## Automation boundary

Allowed:
- AUTO READ
- AI RECOMMEND
- AI DRAFT
- SHADOW DECISION
- performance analysis

Human Approval required:
- Reply send
- Quote publish
- Original publish
- Repost action

Not allowed in v1.1:
- auto-reply
- auto-post
- auto-follow
- mass engagement
- invented conversation targets

## Shadow rollout

v1.1 starts as SHADOW.

Production v1.0 result remains authoritative until cutover.

Shadow output is stored inside existing JSONB only. No new database table is required initially.

Suggested source_context key:
`threads_operations_v11`

Minimum SHADOW fields:
- version
- run_mode = SHADOW
- conversation_source_status
- daily_mode
- participation_opportunities
- original_required
- original_reason
- hold_reason
- research_refs
- measurement_windows = [7,30]
- human_approval_required = true
- auto_reply = false
- auto_publish = false

## Acceptance gates before cutover

1. No selected participation when Conversation Source is not FRESH.
2. No invented reply target.
3. HOLD works when Original is weak.
4. v1.0 Evidence / Creative gates remain mandatory for Original.
5. Reply / Quote source is traceable.
6. MAXI Voice cannot add new facts or personal experience.
7. LINE raw content never becomes Evidence.
8. Emoji is not quota-based.
9. One-post performance cannot change durable rules.
10. 7-day and 30-day learning are separate.
11. Human Approval remains mandatory.
12. No auto-reply / auto-publish.
13. Same-day rerun is idempotent.
14. v1.1 SHADOW cannot overwrite v1.0 Production work.
15. Failure falls back to v1.0 without relabeling v1.0 output as v1.1.

## Cutover rule

Do not change the scheduled 05:30 Production behavior to v1.1 until:
1. the corrected v1.0 unattended persistence path has a successful acceptance;
2. v1.1 Shadow tests pass;
3. real-data Shadow run is inspected;
4. no regression in Human Approval, Evidence lineage, privacy, cross-channel diversity, or duplicate prevention;
5. explicit Production Acceptance records the cutover.

END


## Phase 3 Conversation Source

Canonical live-source candidate: Meta Threads API.

Environment:
- `THREADS_ACCESS_TOKEN` is required.
- Token must be provisioned through a Meta App using the Threads use case.
- Do not store tokens in Supabase plan JSON, GitHub, logs, or acceptance artifacts.

Capabilities are evaluated separately:
- OWN_REPLIES -> `threads_basic` + `threads_read_replies`
- MENTIONS -> `threads_basic` + `threads_manage_mentions`
- KEYWORD_SEARCH -> `threads_basic` + `threads_keyword_search`

Read endpoints used by SHADOW:
- `GET /me/threads`
- `GET /{thread_id}/replies`
- `GET /me/mentions`
- `GET /keyword_search`

Runtime action:
- `social_threads_conversation_context`

Safety:
- this action is read-only;
- no reply, quote, repost, follow, hide, approve, or publish action is added;
- selected participation must cite a real source_ref;
- when capability health is not FRESH, that capability cannot support a selected participation item;
- missing token => NOT_CONFIGURED;
- HTTP 403 / Meta code 10 permission denial => PERMISSION_NOT_GRANTED for that capability;
- other auth/API failure => UNKNOWN;
- no result is not automatically a demand-zero or conversation-zero conclusion.

### 2026-10-08 current live capability state

Direct Token connection for `@the.rev.nara` is live and the token is valid.

Observed real-data probe:
- OWN_REPLIES = FRESH
- own posts observed = 3
- own replies observed = 0
- MENTIONS = PERMISSION_NOT_GRANTED
- KEYWORD_SEARCH = PERMISSION_NOT_GRANTED

The missing Mention / Keyword permissions are Meta access-level limitations, not a broken Threads connection. v1.1 must continue with available FRESH capabilities and degrade safely for unavailable ones.

Metricool remains useful for Threads analytics when connected, but it is not the canonical source for reply text / mention text / external keyword conversation discovery in this phase.
