export const SCENE_PLAUSIBILITY_VERSION = 'the-rev-scene-plausibility-v1';
export const SCENE_PLAUSIBILITY_FIELDS = Object.freeze([
  'location_behavior_plausible','service_misrepresentation_absent',
  'unsupported_equipment_absent','scene_plausible_at_the_rev'
]);
export function scenePlausibilityPass(qa) {
  return SCENE_PLAUSIBILITY_FIELDS.every(k=>qa?.[k]===true);
}
export const SCENE_PLAUSIBILITY_GUIDANCE = 'Show a natural reader situation or a before/after moment in the supplied THE REV space. The photo need not literally demonstrate a diagnosis or every article claim. For health-check topics, one customer considering a health-report-like paper on a real lobby seat or bench is sufficient; tiny paper text need not be readable. Never add blood-pressure cuffs, monitors, examination, medical devices or unverified services/equipment. Verified oxygen-room/DENBA facilities remain allowed only when supported by the source registry. Reject any scene implying THE REV provides medical measurement or diagnosis.';
