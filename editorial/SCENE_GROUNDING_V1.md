# Source / Scene Grounding v1

Effective for newly prepared/generated images. Engine V2.3, safety V2.4, Human First V2.6 and Golden Typography remain unchanged. Final Publish and GBP posting remain human-only.

## Diagnosis: BLOG-20261008-1c14cf

Baseline main: `cdad0488b60d4092ed30027bbe9c103983fcab89`.

FACT: `sceneIntentFor()` selected a gym-comparison scene instructing an adult customer to inspect grips/settings and simultaneously show reception and EVOLGEAR equipment, regardless of selected source location. The r3 job contains this instruction. Source registry keyword matching favored the lobby photo for equipment/comparison/commuting topics.

FACT: the real lobby source contains a rack only in the rear training area. The actual r3 scene contains an additional foreground rack next to the reception area, operated by the customer. This is not merely an unsupported equipment type: it is an unsupported equipment placement and duplicate. The lossless source/scene hashes and the original PASS report are retained in `fixtures/scene-grounding-r3-rejection.json`.

FACT: `scenePlausibilityPass()` checks four model-provided booleans. The broad Visual QA prompt compares many typography/realism conditions at once, with no canonical zone inventory and no independent equipment observation. Recent checks compare source/provenance IDs, not actions/roles/composition. r3 passed those old gates and Supabase stored READY; it was never published.

INTERPRETATION: article intent and source capabilities were disconnected; the model had a positive equipment-operation instruction and permission to recompose a softly blurred background. Boolean self-assessment lacked a grounded contradiction check.

HYPOTHESIS: model attention to photographic polish and typography, combined with a plausible-looking THE REV logo/background, contributed to the false-positive QA. Model internals cannot be proven from these files. No claim is made that overlay rendering added the rack: the rack is already in the generated scene.

## Canonical contract

- `lib/editorialSceneGrounding.mjs`: intent -> eligible inventory -> allowed action -> scene plan; equipment zones; fixed fingerprint ontology; deterministic acceptance and semantic scoring.
- `automated-image-sources.json`: extend the existing scoped source registry, rather than another source system. Each source has canonical location, visible equipment with zones, allowed actions, suitable intents and a SHA-256 lock. Bootstrap inventories were inspected against the real repo mirrors; source recognition runs automatically during each QA. New sources require canonical approval once; uncertain model classification never creates a new equipment allowance.
- The operator independently observes source/generated equipment and locations in a narrow multimodal call without prior PASS votes or style references. Code intersects observations with canonical metadata and validates actions/subject zone/geometry. Missing observations fail closed.
- A rack visible in `rear_training_area` must stay there. Recognition of that rack does not permit copying or moving it to `reception`.
- All new jobs carry `scene_grounding_version`, `scene_plan`, `source_scene_inventory`; all new QA carries observations, compared history and source/scene/three-output hashes. Review, Hybrid readiness and Queue readiness recompute deterministic acceptance. CI checks evidence hashes against actual files. Old accepted assets are compatible; the user-rejected r3 is explicitly rejected and reversioned.
- Existing Visual QA, source/provenance recent-4 exclusion, customer-only rules, realism, typography and derivative layout gates are additive and unchanged.

## Semantic diversity

Recent 12 **distinct articles**, excluding the current slug; multiple retry versions do not occupy extra slots. The independent observer classifies actual historical images using one fixed vocabulary: scene, location, human action, composition, visual role, article intent. Job/QA fingerprints are retained for subsequent planning. Different file IDs, clothing or gender do not make a scene diverse.

Relevance remains first. Similarity is a penalty within equally relevant source/scene choices. Same action + composition + visual role + article intent is a hard exclusion. Same location alone, or a necessary similar action with a different role/composition, is not. Unknown historical evidence is explicitly reported and blocks grounded acceptance until observed; no silent zero similarity.

## Target recovery

r4 uses `AI_SOURCE_photo-evolgear_20260922.jpg`, with actual rack and bench visible. One customer seated on the existing training bench prepares to begin at their own pace, checking a shoelace. This replaces standing facility inspection with personal preparedness. Copy is unchanged; no new equipment, trainer or staff is allowed.

The target operator also runs an actual-image r3 negative control with the independent observer. Acceptance requires detection of unsupported foreground training equipment; a synthetic unit-test FAIL alone cannot satisfy that runtime control. Evidence is committed as `image-qa/scene-grounding-r3-negative-control.json` with the successful replacement set.

## Regression / remaining limits

`node --test scripts/test-editorial-scene-grounding.mjs` verifies the actual rejected r3 fixture, safe lobby, grounded training-area rack, different-file semantic duplication, relevance-preserving alternatives, missing evidence, source-byte locks and retry deduplication. Run the existing AGENTS-required tests as well.

Multimodal object/zone recognition can still miss an object or misclassify a subtle spatial defect. Canonical constraints, independent observation, actual negative control and human rejection reduce that risk; they do not prove perfect vision. Human review remains the final authority. No QC result may be rewritten to achieve PASS.
