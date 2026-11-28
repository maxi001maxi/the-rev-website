# Editorial AI | Old LINE topic recurrence | 2026-10-14 JST

## Production diagnosis
- Owner's morning LINE: 2026-10-14 05:01 JST, target 2026-10-15, `TP-20261015`, old IDs `BT-20261008-DAILY-1`, `IDEA-V070-001`, `IDEA-V070-007`. Notification SENT.
- Google Sheets generated FIVE *new* entries at 2026-10-14 05:01, but NONE contained `AUDIENCE_V08:` metadata. The backend selected the older high score and static topicSeeds, rather than today's reader interests.
- Vercel production's Audience Discovery mode env variable was absent, so the backend's opt-in default was OFF. GAS new script changes existed in GitHub but live bound GAS deployment and Script Properties cannot be confirmed or managed with the connected tools. Therefore automatic v0.8 generation is **not** claimed.
- 2026-10-14 edited owner preferences explicitly rejected same-style gym choice tips, technical mitt shoulder tension, and generic DENBA explanations.

## One-time correction (production records)
- Preserved old proposal IDs and state in `topic-refresh-20261014-audit.json`; no owner choice or prior approval was overwritten.
- Independently authored FIVE reader-first v0.8 topic hypotheses in `topic-refresh-20261014.json`. These are NOT misrepresented as an automatically executed GAS model call, nor as verified search demand.
- Appended FIVE new rows to 23_BLOG_TOPIC_SHORTLIST, ids `BT-20261014-AUD08-1..5`, preserving all historical candidates.
- Ran the **actual Audience Discovery v0.8 ENFORCE selector** in a sandbox using all available 19 live CMS article titles. Top three from distinct lanes: AUD08-1 (movement-as-play), AUD08-3 (sweat vs progress), AUD08-2 (rest environments). All passed original article overlap and editorial heuristic gates, no measured search volume asserted.
- Replaced only `TP-20261015` while it was `TOPIC_SELECTION_WAITING` and had no approved/selected candidate. Marked `TOPICS_RETRY_1` and `PENDING`. This is an outbox queued for **the existing GAS LINE sender**; not a claim of confirmed LINE delivery.
- No Queue/article creation or public publishing.

## Production code fix
- Production topic preparation considers the **JST current day's** audience-tagged candidates, with audited AUD08 entries outranking today's legacy daily pool. Neither old candidate IDs nor v0.7 fixed seeds can backfill the pool.
- New daily suggestions **without** complete Audience v0.8 reader contract are rejected. Fail closed when fewer than three eligible topics; blocked notice tells owner old topics were stopped without re-sending old options.
- Refresh only the matching target-date waiting proposal. Preserve older pending snapshots and owner state.
- Tests: 50/50 topic approval, audience v0.8 and freshness regression tests PASS. Site build PASS.

## Known limitation and genuine next step
- To have tomorrow and subsequent daily automated generation use v0.8, install current canonical GAS `editorial/gas/DailyEditorialAutonomy_v0.6.9_ONE_PASTE.gs` in the **actual bound Apps Script project** (after backup, preserving triggers), and set Apps Script property `THE_REV_AUDIENCE_DISCOVERY_MODE=ENFORCE`. Set backend Vercel Production mode ENFORCE only after 5 real daily candidate notes read back with valid Audience v0.8 contracts. These cross-system operations were NOT performed via connected tools.
- Until then, the backend safety gate intentionally blocks old-style topic LINE recommendations rather than pretending new discovery ran.
- Confirm new LINE delivery only from `TP-20261015.notification_status='SENT'` and `notification_kind='TOPICS_RETRY_1'` plus the sender log; a PENDING status alone is not proof.
