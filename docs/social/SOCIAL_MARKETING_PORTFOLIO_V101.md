# THE REV. Social Director v1.0.1 — Marketing Portfolio Layer

Status: SHADOW IMPLEMENTATION

## Why

v1.0 correctly prioritized strong Evidence, but this created a new failure mode:
strong First-party topics could dominate the daily Reel set while THE REV.'s actual store,
services and experiences became underrepresented.

The fix is **not** a mandatory "store Reel slot".

v1.0.1 adds a Marketing Portfolio Layer so the Social Director evaluates:
- what THE REV. has actually published recently;
- what offerings / experiences have been over- or under-exposed;
- the current business phase;
- Blog / Reel A collision;
- performance priors;
- asset feasibility;
- then explains why store/service content should or should not be prioritized today.

## Architecture

Current Truth + Published History
-> Marketing Inventory / Portfolio Snapshot
-> Evidence Retrieval
-> Opportunity
-> Portfolio Ranking
-> Social Director
-> Reel / Stories / Threads

Evidence gates remain unchanged.

## Marketing Inventory

Canonical keys:
- PERSONAL_TRAINING
- BOXING
- OXYGEN_ROOM
- DENBA
- TRAINER_JUDGMENT
- STORE_SPACE_EQUIPMENT
- FIRST_VISIT_EXPERIENCE
- ACCESS_CONVENIENCE
- RECOVERY_CONDITIONING
- SESSION_PROCESS

Inventory is not a posting calendar.
No item receives a mandatory daily/weekly quota.

## Portfolio Snapshot

Windows:
- rolling 14 days
- rolling 30 days

Signals:
- KNOWLEDGE_HEAVY
- STORE_HEAVY
- BALANCED
- SPARSE
- UNKNOWN

Per inventory item:
- count_14d
- count_30d
- last_published_at
- recent angles
- recent formats
- source post IDs
- lightweight performance summary
- exposure signal

Exposure signals:
- ABSENT_30D
- ABSENT_14D
- RECENT
- FREQUENT_14D
- UNKNOWN

These are strategic signals, not publishing rules.

## Evidence retrieval behavior

If an offering is underexposed, v1.0.1 does **not** invent an Opportunity.

Instead it emits an evidence retrieval target:
"retrieve canonical Fact / First-party only if this item could solve the current marketing problem."

Therefore:

Underexposed Oxygen Room
!=
"post Oxygen Room today"

It means:
"the Social Director should notice the gap, retrieve real Evidence if relevant, then decide."

## Opportunity Portfolio Ranking

Every Opportunity receives a Portfolio Ranking:
- inventory_keys
- priority_signal: PROMOTE / NEUTRAL / DEMOTE / REVIEW
- phase_fit
- recent_saturation
- underexposure_signal
- editorial_collision
- performance_prior
- asset_feasibility
- rationale
- confidence

A PROMOTE signal never upgrades:
- Evidence Strength
- Opportunity QC Decision

EXPLORATORY remains EXPLORATORY until stronger Evidence exists.

## Social Director Portfolio Decision

When v1.0.1 mode sets:
`source_context.portfolio_required=true`

Director preparation requires:
- READY Portfolio Snapshot
- Portfolio Ranking for every Opportunity
- explicit Marketing Portfolio Decision

Decision records:
- considered inventory
- selected mix
- recent balance
- why store/service content is or is not appropriate today
- marketing rationale

This gives the desired behavior:

"施設系を必ず入れる"
ではなく、

"最近は施設系が多いので今日は判断系へ"
or
"最近は知識系に寄り、酸素 / DENBA / Boxingの体験露出が薄いので商材Evidenceを取りに行く"

を毎日説明できる。

## Hard boundaries preserved

Unchanged:
- PRIMARY Evidence required
- UNGROUNDED cannot be READY
- Fact / Interpretation / Hypothesis separation
- Opportunity -> Director -> Creative lineage
- Human Approval
- no auto-publish
- performance changes probabilities, not possibilities
- planned != published
- Customer Signal missing != zero demand

## Bridge actions

- social_portfolio_context
- social_portfolio_prepare
- social_portfolio_poll
- social_portfolio_rankings_prepare

## Production status

v1.0.1 is additive.
Existing v1.0 / v0.7 production behavior does not switch merely because the schema/code exists.
