# THE REV. Social Director v0.6 — Production Learning

Status: implementation
Runtime store: Supabase
Curated long-term canon: GitHub
Daily generation: ChatGPT Task
Instagram auto-publish: DISABLED

## Goal

Turn completed Reel B production and verified Instagram performance into reusable learning without polluting long-term context with every draft.

The system separates:

1. **work-in-progress**
   - candidate ideas
   - script revisions
   - temporary preferences
   - not long-term learning

2. **finalized production**
   - selected Reel
   - final storyboard / edit / caption package
   - eligible source for learning extraction

3. **verified performance**
   - Metricool / platform evidence
   - linked back to the actual candidate
   - eligible source for Performance Learning

## Runtime tables

Existing:
- `social_reel_candidate_batches`
- `social_reel_candidates`
- `social_published_posts`
- `social_post_metrics`

v0.6:
- `social_production_events`
- `social_production_learnings`

Added:
- `social_published_posts.candidate_id`
- production timestamps / learning summary on `social_reel_candidates`

## Production lifecycle

```text
CANDIDATE
  -> SELECTED
  -> READY       final Production Package saved
  -> CREATED     asset/video actually created
  -> SHOT        filming completed
  -> PUBLISHED   only after verified platform evidence
```

Operational facts are written to `social_production_events`.

## Learning lifecycle

```text
draft conversation
    -> no persistence
FINALIZE
    -> extract reusable learning candidates
CANDIDATE learning
    -> repeated evidence or explicit durable owner rule
ACTIVE learning
    -> loaded into future Social production context
SUPERSEDED / RETIRED
    -> history only
```

### Learning types

- USER_PREFERENCE
- CREATIVE
- EDITORIAL
- QC
- PERFORMANCE
- BRAND

### Role scopes

- SHARED
- STRATEGIST
- CREATIVE_DIRECTOR
- EDITOR
- QC

One-post performance observations are not automatically treated as universal truth.
Performance learning auto-promotion requires repeated observation and sufficient confidence.

## Runtime vs GitHub Canon

Supabase is the high-frequency runtime memory.

GitHub is the distilled, versioned long-term context.

Do not commit every Reel comment or metric observation to GitHub.
Promote only durable patterns, for example:
- repeated across multiple productions;
- explicitly stated by the owner as a stable preference/rule;
- repeatedly supported by performance;
- important safety / brand correction.

## Bridge actions

Existing authenticated endpoint:
`POST /api/integrations/editorial-status`

v0.6 actions:

- `social_production_finalize`
- `social_production_event`
- `social_publication_link`
- `social_learning_upsert`
- `social_learning_list`
- `social_learning_context`

### Finalize

`social_production_finalize`:
- selects the chosen candidate;
- rejects unused candidates;
- saves the complete Production Package;
- marks the candidate READY;
- writes FINALIZED event;
- stores reusable learning candidates.

### Created / Shot / Feedback

`social_production_event` records:
- CREATED
- SHOT
- FEEDBACK

It cannot claim PUBLISHED.

### Publication verification

`social_publication_link` requires an actual row in `social_published_posts`.
Only then:
- candidate becomes PUBLISHED;
- published post gets `candidate_id`;
- PUBLISHED_VERIFIED event is written.

planned != published remains mandatory.

## Morning learning context

`social_learning_context` returns:
- ACTIVE learnings;
- CANDIDATE learnings;
- published productions linked to candidates;
- baseline/latest metric snapshots.

The ChatGPT Task uses ACTIVE learning as context.
CANDIDATE learning is evidence to consider, not a hard rule.

## Role architecture

v0.6 production uses four functional contexts:

1. Social Strategist
2. Creative Director
   - script
   - direction
   - caption
3. Editor
4. Independent QC

This intentionally avoids multiplying role-play agents without distinct context or output contracts.

## Safety

- no automatic Instagram publish;
- user report alone does not create canonical PUBLISHED state;
- a single post does not become a universal performance rule;
- draft revisions do not pollute long-term learning;
- current fact / medical / privacy / brand guardrails remain authoritative.
