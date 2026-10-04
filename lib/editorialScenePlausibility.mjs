export const SCENE_PLAUSIBILITY_VERSION = 'the-rev-scene-plausibility-v1';
export const SCENE_PLAUSIBILITY_FIELDS = Object.freeze([
  'location_behavior_plausible','service_misrepresentation_absent',
  'unsupported_equipment_absent','scene_plausible_at_the_rev'
]);
export function scenePlausibilityPass(qa) {
  return SCENE_PLAUSIBILITY_FIELDS.every(k=>qa?.[k]===true);
}
export const SCENE_PLAUSIBILITY_GUIDANCE = 'Show a natural reader situation or a before/after moment in the supplied THE REV space. The photo need not literally demonstrate a diagnosis or every article claim. For health-check topics, one customer considering a health-report-like paper on a real lobby seat or bench is sufficient; tiny paper text need not be readable. Never add blood-pressure cuffs, monitors, examination, medical devices or unverified services/equipment. Verified oxygen-room/DENBA facilities remain allowed only when supported by the source registry. Reject any scene implying THE REV provides medical measurement or diagnosis.';

export const SCENE_ACTION_VERSION = 'the-rev-scene-action-v1';
export const SCENE_ACTION_FIELDS = Object.freeze([
  'action_contract_satisfied',
  'subject_object_relationship_readable'
]);
export function sceneActionPass(qa) {
  return (
    SCENE_ACTION_FIELDS.every(k=>qa?.[k]===true) &&
    qa?.passive_observation_only===false
  );
}
export const SCENE_ACTION_GUIDANCE = 'A person merely standing, looking down, or posing next to equipment is not a meaningful editorial scene. The subject must perform a natural, article-specific low-risk action that makes the relationship to the verified object/place immediately readable. Quiet scenes are allowed, but the action must still be visible. Do not invent controls, treatment steps, seats, mats, accessories, services or effects that are not supported by the verified source. For equipment-explanation articles, prefer a slight body lean, clear eye-line to the exact device, and a natural open-hand indication near the device without pressing controls or pretending to receive treatment.';
