# THE REV. Editorial AI | Content Role / Portfolio Review | 2026-10-14

Status: VERIFIED AUDIT + RECOMMENDED POLICY. **NOT INTEGRATED INTO DAILY GAS/PRODUCTION SELECTION**. No production drafts/approvals/publications changed in this audit.

## Why this audit was requested
Owner observed ~70% of articles read as informational, wants a greater range of articles showing the actual THE REV. facility, offerings and value, with category/frequency review BEFORE selecting an article, not afterward.

## Source of truth
- Master Sheet 29_CONTENT_PILLAR_POLICY, 30_CONTENT_CLUSTER_POLICY, 33_EDITORIAL_PORTFOLIO_POLICY: existing rolling 12-post *topic* mix is OXYGEN_ROOM=3; DENBA=1; FACILITY_THE_REV=2; TRAINING=2; START_CONTINUE=1; BOXING=1; PERFORMANCE=1; FLEX_SEO=1. Soft targets, not hard quotas.
- Supabase admin_article_drafts at audit: 16 PUBLISHED, 1 PUBLISH_COMMITTED without authoritative publish timestamp, 2 NOT_PUBLISHED.
- Of 16 PUBLISHED, only 1 primarily showcases the physical THE REV. facility.
- The last 12 PUBLISHED, ordered by published_at DESC and created_at DESC, were manually classified *by primary editorial role*, NOT merely by topic:
  - KNOWLEDGE/PROBLEM SOLVING (7): BLOG-20261011-36b42e, BLOG-20261007-f72bfb, BLOG-20261005-dd6e13, BLOG-20261005-ea92d0, BLOG-20261004-c44065, BLOG-20260927-a84c31, BLOG-20260924-6c2f31.
  - COMPARISON/DECISION (2): BLOG-20261008-1c14cf, BLOG-20260926-3e7a52.
  - SERVICE EXPERIENCE/USE (2): BLOG-20261006-a3f714, BLOG-20260930-oxy02.
  - DIRECT FACILITY SHOWCASE (1): BLOG-20261003-570c55.
- Interpretation: strict knowledge role 7/12=58%, but 2 comparison guides and service explainers have explanatory tone; an impression of 70%+ informational writing is reasonable. Labels are qualitative, not an automated ground truth.
- A category such as OXYGEN_ROOM or DENBA may produce either an educational explainer or a hands-on experience article. Existing 12-topic portfolio cannot by itself assure content-format balance.
- 2026-10-14 topic retry three options are all primarily KNOWLEDGE/DISCOVERY; user had not selected any as of this audit. Do NOT silently alter owner-pending candidate choices.

## Recommendation: two independent axes
**Axis 1: Editorial role**, reviewed each new proposal on rolling 12 *verified published* posts. Initial SOFT model: KNOWLEDGE=5, SERVICE_EXPERIENCE=3, FACILITY_AND_TRUST=2, COMPARISON_DECISION=2. Adjust based on verified demand, changing service priorities, and actual creative quality. This is a proposed policy, not approved numeric enforcement.
**Axis 2: Topic/service**, retaining the existing 33_EDITORIAL_PORTFOLIO_POLICY soft goals for oxygen room, DENBA, training, boxing, local/facility etc.

## Proposed pre-creation gate
1. Fetch real published statuses/URLs; exclude NOT_PUBLISHED and unverified PUBLISH_COMMITTED, count last 12 verified PUBLISHED by both axes.
2. Look at 3-5 upcoming proposals BEFORE sending LINE. Each must state reader stage, *role*, topic/cluster, unique answer and whether first-party facts/photos are verified. Reject mere repetition of existing articles.
3. Prefer underrepresented roles (currently facility/showcase and service-experience) where a real audience question and source evidence exist. Never fill a quota with thin advertorial content. Don't conflate content topic with article role.
4. Preview the expected mix after the next 1-3 posts; show the owner an intuitive advisory such as "店内・体験を伝える記事が不足". Preserve owner topic and publish approval.
5. Measure over rolling windows and adjust targets using observed performance, not invented GSC search demand.
6. If required facts/photos are missing, hold for verification rather than fabricating employees, client endorsements, service instructions, outcomes, or offers.

## Immediate editorial opportunities to research and validate
- FACILITY/TRUST: What actually happens in a 60-minute trial? Verified check-in, explanation, assessment, training and departure; use actual facility photography and current store operating rules.
- SERVICE_EXPERIENCE: What does an oxygen-room visit *feel like operationally* (where to sit/lie, what to bring, what is explained, how it ends), differentiating from the existing "inside the room" article with a genuinely new question.
- FACILITY/TRUST: A first-person photo walkthrough of the actual THE REV. rooms and equipment, or who the experience suits; verify every depicted item.
- DECISION: For someone comparing fitness options, explain when full-reservation training is appropriate and when DIY gym/at-home routines are sufficient; avoid rephrasing the two existing Shin-Omiya gym-selection articles.

## Implementation state
- Rolling 12-topic targets exist in the Master Sheet, but the production topic API (lib/editorialTopicApproval.mjs) ranks Audience Discovery + novelty/score without an independent role-mix budget.
- As of this audit, no code wiring, GAS deployment or live portfolio gate has been executed.
- Keep the one-time Oct 15 owner proposals intact until the next explicit owner decision.
