# Phase 6B | Audience Discovery v0.8 Integration Acceptance
Date: 2026-10-13 JST
State: Source integration implemented and sandbox-tested; production runtime NOT switched.
Base: Phase 6A spec and fixtures in this branch.

## Actual files
- `lib/editorialAudienceDiscovery.mjs`: pure candidate reader-profile audit, score caps and sum, duplicate routing, verified-claim provenance warning, search demand evidence separation, early-audience preference, 3-option selection.
- `lib/editorialTopicApproval.mjs`: proposal option selection OFF/SHADOW/ENFORCE; enriched notifications; human choice and final queue-stage recheck.
- `lib/editorialTopicApi.mjs`: revalidate stale pending proposals under the new gate when explicitly in ENFORCE.
- `editorial/gas/DailyEditorialTopicApproval_v0.7.0.gs`: when an opt-in Script Property is ENFORCE, supply an audience-first research direction in the EXISTING single candidate-generation model call. Notes contain an `AUDIENCE_V08:` JSON structure in the existing column; no new Sheet columns, no additional model calls. Strict missing metadata fails closed before Sheet writing.
- `editorial/gas/DailyEditorialAutonomy_v0.6.9_ONE_PASTE.gs`: rebuilt from canonical source files.
- `scripts/test-editorial-audience-discovery.mjs`: 14 Node acceptance tests.
- `package.json`: `npm run test:audience-discovery`.

## Mode and activation
The backend reads `process.env.THE_REV_AUDIENCE_DISCOVERY_MODE` (OFF default); GAS reads its separate Script Property of the **same name** (OFF default).
- OFF: no new gate and unchanged generation prompt.
- SHADOW (backend): old ranking and approval flow intact; additional diagnostics are available; GAS still uses legacy prompt.
- ENFORCE (GAS): generates detailed reader contract within notes; validates minimal required fields before writing the 5 fresh candidates.
- ENFORCE (backend): only allows eligible candidates with a complete reader contract; ranks by reader value, novelty, SEO query fit, natural facility connection and evidence readiness; rejects same-answer rewrites and unsupported claims; requires 3 reasoned options or stops.
- Neither setting changes human topic approval or final publication approval.
- The server and GAS flags can differ. Treat mismatched flags as a rollout risk; first validate with backend SHADOW, then run a guarded GAS ENFORCE candidate generation, and finally backend ENFORCE after real notes readback.

## Verified sandbox checks
- `npm run test:audience-discovery` 14/14 PASS
- `npm run test:topic-approval` 29/29 PASS
- `npm run test:daily-editorial-state-machine` 73/73 PASS
- `npm run test:daily-creator` 120/120 PASS
- `npm run test:daily-editorial-contract` PASS
- `npm run test:supervisor-qc-recovery` 11/11 PASS
- `npm run test:trigger-topology` 4/4 PASS
- `npm run test:editorial-quality-v080` 16 internal checks PASS (wrapped in one Node test)
- `node scripts/build-gas-bundle.mjs --check`: PASS

## Known limitations and acceptance boundaries
1. The generator uses the legacy JSON schema and stores added reader metadata as JSON text in `notes`. **Actual model compliance and full Sheet readback were NOT tested**. Phase 6C must observe this and adjust if the model ignores/truncates notes.
2. The score is an explainable editorial heuristic, NOT a measured content preference or reliable human engagement model. Stronger semantic duplicate detection remains dependent on the prior overlap gate and candidate-provided answer contracts; distinct wording can still fool it. Phase 6C requires manual editorial check.
3. No Search Console real results were available. The measured segment of SEO scoring is zero unless trusted server-side GSC evidence is provided. Model assertions cannot inject measured query volume.
4. No live API call, no fresh Writer/Editor/independent QC invocation, no Apps Script production deployment, no Supabase or Sheets mutations, no verified notification delivery, no automatic publication happened in Phase 6B.
5. The Script Property and server Environment Variable must remain OFF until real-model acceptance succeeds. As previously noted, merging GitHub alone does not install a bound GAS script nor guarantee a Vercel Production deployment.
6. The previous approved/missing-interview states remain canonical and cannot be bypassed.

## Phase 6C single-phase finish line
- Confirm API quota/credit status with one small real request in the actual configured environment.
- Install CANONICAL bundled GAS only through the verified existing deployment path after backup; no duplicate triggers.
- Safe test of new candidate generation -> shortlist readback -> backend SHADOW audience diagnostics -> backend ENFORCE (only if 3 true eligible options).
- Choose a test topic through authenticated owner action and provide required first-party facts; verify new Writer -> Editor -> independent QC -> Sheet/Supabase save -> re-read -> LINE notification.
- No public publishing; human final approval stays mandatory. If fail, remain OFF and report the exact blocker.
