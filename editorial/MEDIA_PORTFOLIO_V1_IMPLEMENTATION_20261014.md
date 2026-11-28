# THE REV. Editorial AI | Media Portfolio v1 | 2026-10-14

## Principle
The REV. blog is a publication, not a daily sequence of loosely related SEO explainers. Readers should have multiple entrances: curiosity, practical learning, the reality of the actual facility, the experience of its services, credible people and the local community. No article may invent customer stories, results, facility details or medical efficacy to fill a quota.

## Independent axes
**Editorial role / reader value:** KNOWLEDGE (soft rolling-12 target 5), SERVICE_EXPERIENCE (3), FACILITY_AND_TRUST (2), COMPARISON_DECISION (2), plus COMMUNITY_STORY (flexible, no required quota). One primary role per candidate, with `editorial_role_reason` and `reader_scene`.
**Topic/service:** Keep existing `29_CONTENT_PILLAR_POLICY`, `30_CONTENT_CLUSTER_POLICY`, `33_EDITORIAL_PORTFOLIO_POLICY` as the separate lens for training, boxing, oxygen room, DENBA, facility, local etc. A DENBA article may be KNOWLEDGE or SERVICE_EXPERIENCE; those fields must not be conflated.

## Published baseline, 2026-10-14
- Supabase `admin_article_drafts.publish_status=PUBLISHED` is the authoritative source for rolling media role counts. Duplicate canonical markdown is not counted twice. `PUBLISH_COMMITTED` and `NOT_PUBLISHED` are excluded.
- Verified 16 PUBLISHED at audit. Among most recent 12 by `published_at` then `created_at`: 7 knowledge, 2 comparison, 2 service experience, 1 direct facility showcase. These are initial human-inferred role labels; review and revise via explicit `editorial_role` when editorial metadata is available.
- Portfolio deficits are soft. Shortage increases ranking priority by at most 12 points **after** original topic qualification and Audience Discovery quality hard gates. It cannot approve unsupported health claims, duplicated articles, invented first-party facts, or thin advertising.
- If there are fewer than 6 verified published articles, the system does not infer a reliable deficit.

## Production code introduced
- `lib/editorialMediaPortfolio.mjs`: published-only rolling-12 snapshot, independent editorial role inference + explicit role contract, softened deficit ranking, reader-role-diverse three-options, projected mix and compact LINE notice.
- `lib/editorialArticleHistory.mjs`: same single Supabase history query returns status and dates for reliable categorization, no extra model request.
- `lib/editorialTopicApproval.mjs`: real proposal selection uses audience eligibility first, then the portfolio for the final 3. LINE shows editorial role + subject lane + mix gaps. Topic approval -> interview -> quality -> independent QC -> human Publish remain intact. Human choice stores `media_portfolio` in the queue knowledge context.
- `editorial/gas/DailyEditorialTopicApproval_v0.7.0.gs` and canonical ONE_PASTE: when Audience Discovery is explicitly ENFORCE, one existing candidate-generation model call is also instructed to cover at least 3 real article roles across five candidates, including facility and service experience, compare and community subjects; output `editorial_role` + `editorial_role_reason` inside `AUDIENCE_V08`. If fewer than 3 eligible NEW_ARTICLE roles are generated, fail before writing Sheet rows. No extra LLM per candidate. OFF retains existing prompt.
- No schema changes. Existing portfolio and topic policies retained.

## Story formats / editorial discovery bank (examples, NOT independently verified article facts)
- FACILITY: A photographic journey from arriving at THE REV. to leaving: what happens when and where. Verify floor plan, actual images and 60-minute experience procedure.
- FACILITY: "What does complete reservation mean on the day?" Verify check-in, schedule and privacy claims before drafting.
- PEOPLE: A coach's thinking process for why the day's exercise is modified. Include actual trainer interview, not invented testimonials.
- SERVICE: A personal boxing first visit from non-expert's perspective, with real coaching detail and without making every client a sports fan.
- SERVICE: Oxygen room from reception to finishing the session, distinguishing a neutral visit guide from the existing inside-the-room article.
- KNOWLEDGE: Beginner question with a genuinely new answer, concrete evidence and non-diagnostic language.
- DECISION: Is a 24h gym enough, or should someone ask for individualized training? Avoid duplicating existing Shin-Omiya comparison articles.
- COMMUNITY: A locally relevant activity or event, with dates, venue and participation facts checked against current first-party sources.
- BEHIND THE SCENES: Facility preparation, safety checks or the way a session is arranged, but only with verified operations records.
- PROJECT: A season-led fitness experiment or transparent mini-series with consent and measured results, never fabricated outcomes.

## Acceptance / operational truth
- Regression tests: `scripts/test-editorial-media-portfolio.mjs`, legacy Topic Approval, Audience Discovery, Fresh Daily Topics. Human choice and final Publish untouched.
- New proposal `portfolio` fields remain soft editorial explanation and are not measured engagement, GSC performance or proof of lead conversion.
- GitHub main / Vercel backend can be deployed and verified independently; **bound Apps Script cannot be updated by the available connector**, so never claim GAS automatic role-diverse generation is live until canonical bundle is installed, Script Property `THE_REV_AUDIENCE_DISCOVERY_MODE=ENFORCE` is set, real generation is read back and saved/LINE reflected. Leave production owner-pending choices intact.
- Next checks: 3-5 real consecutive daily batches; measured role spread; 12-post window; actual article readership / inquiries if Analytics or GSC become connected. Calibrate soft targets; never auto-fill weak content.
