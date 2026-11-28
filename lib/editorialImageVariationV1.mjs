/**
 * Editorial Image Quality V1: diagnostic-only scene variation.
 *
 * OFF by default. SHADOW produces a read-only report on an existing canonical
 * image job. It NEVER selects a new scene, modifies source inventories,
 * changes the output contract, or votes on multimodal image QC.
 */
import {
  SCENE_GROUNDING_VERSION,
  SCENE_ONTOLOGY,
  FINGERPRINT_FIELDS,
  articleSceneIntent,
  semanticSimilarity
} from './editorialSceneGrounding.mjs';

export const IMAGE_VARIATION_VERSION = 'editorial-image-quality-v1-shadow';
export const IMAGE_VARIATION_ENV = 'EDITORIAL_IMAGE_VARIATION_V1_MODE';

const clean = x => String(x ?? '').trim();
const isFingerprint = f => FINGERPRINT_FIELDS.every(k => SCENE_ONTOLOGY[k]?.includes(f?.[k]));
const uniqueBySlug = (recent = [],limit = 12) => {
  const seen = new Set();
  return recent.filter(row => {
    const slug = clean(row?.slug);
    if (!slug || seen.has(slug)) return false;
    seen.add(slug);return true;
  }).slice(0,limit);
};

export function imageVariationMode(value = '') {
  return clean(value).toUpperCase() === 'SHADOW' ? 'SHADOW' : 'OFF';
}

export function auditEditorialCopy(copy) {
  const lines = clean(copy).split(/\r?\n/).map(x => x.trim());
  const warnings = [];
  if (lines.length > 2) warnings.push('COPY_TOO_MANY_LINES');
  if (lines.some(x => !x)) warnings.push('COPY_EMPTY_LINE');
  if (lines.some(x => [...x].length > 16)) warnings.push('COPY_LONG_LINE');
  if (lines.slice(0,-1).some(x => /(?:小さな|大きな|初めての|自分の|その日の|気になる)$/.test(x)))
    warnings.push('COPY_MODIFIER_ORPHAN');
  // A natural two-line headline is only a hypothesis; the real 16:9 / 4:3
  // rendering and typography visual QC remain separately mandatory.
  return {checked:true,warnings,requires_visual_check:true};
}

export function diagnoseSceneRepetition(plan, recent = []) {
  if (!isFingerprint(plan)) throw new Error('scene_plan_fingerprint_invalid');
  const rows = uniqueBySlug(recent,6);
  const known = rows.filter(r => isFingerprint(r.scene_fingerprint || r.sceneFingerprint));
  const unknownCount = rows.length - known.length;
  const count = field => known.filter(r => (r.scene_fingerprint || r.sceneFingerprint)[field] === plan[field]).length;
  const actionRepeats = count('human_action');
  const compositionRepeats = count('composition_type');
  const roleRepeats = count('visual_role');
  const sceneRepeats = count('scene_type');
  const flags = [];
  if (rows.length === 0) flags.push('HISTORY_MISSING');
  if (unknownCount > 0) flags.push('HISTORY_FINGERPRINT_INCOMPLETE');
  if (actionRepeats >= 3) flags.push('ACTION_REPEAT_3_OF_RECENT_6');
  if (compositionRepeats >= 3) flags.push('COMPOSITION_REPEAT_3_OF_RECENT_6');
  if (roleRepeats >= 3) flags.push('VISUAL_ROLE_REPEAT_3_OF_RECENT_6');
  if (known[0] && ['human_action','composition_type','visual_role'].every(k => (known[0].scene_fingerprint || known[0].sceneFingerprint)[k] === plan[k]))
    flags.push('CONSECUTIVE_SAME_ACTION_COMPOSITION_ROLE');
  const similarity=semanticSimilarity(plan,uniqueBySlug(recent));
  if (!similarity.pass) flags.push('CANONICAL_SEMANTIC_SIMILARITY_BLOCK');
  return {
    window:6,observed:rows.length,known:known.length,unknown:unknownCount,
    repeated:{human_action:actionRepeats,composition_type:compositionRepeats,visual_role:roleRepeats,scene_type:sceneRepeats},
    flags,semantic_similarity_pass:similarity.pass,
    interpretation:'Descriptive repetition diagnostics only; NOT a human quality score or publish clearance.'
  };
}

function definitions(intent,location) {
  if (intent === 'facility_selection') return location === 'training_area'
    ? [['equipment_orientation','observing_real_equipment','medium_side_portrait','safe_first_step'],
       ['before_start','prepare','medium_seated_portrait','deciding_own_start']]
    : [['personal_choice','compare_notes','medium_seated_portrait','deciding_own_start'],
       ['arrival','enter','medium_three_quarter_portrait','first_visit_reassurance']];
  if (intent === 'training_start' || intent === 'readiness' || intent === 'habit_start') return [
    ['before_start','prepare','medium_three_quarter_portrait','checking_readiness'],
    ['before_start','prepare','medium_side_portrait','checking_readiness'],
    ['before_start','rest','medium_seated_portrait','checking_readiness']
  ];
  if (intent === 'health_before_start') return [
    ['before_start','review_paper','medium_seated_portrait','considering_health_report']
  ];
  if (intent === 'recovery') return [
    ['recovery_transition','rest','medium_seated_portrait','recovery_time'],
    ['recovery_transition','rest','medium_side_portrait','recovery_time']
  ];
  if (intent === 'boxing_start') return [
    ['before_start','boxing_stance','medium_three_quarter_portrait','safe_first_step'],
    ['before_start','boxing_stance','medium_side_portrait','safe_first_step']
  ];
  if (intent === 'equipment_explanation') return [
    ['equipment_orientation','observing_real_equipment','close_action_portrait','component_relationship'],
    ['equipment_orientation','observing_real_equipment','medium_side_portrait','component_relationship']
  ];
  return [];
}

/**
 * Alternative scenes are suggestions for a controlled paired test, not
 * authorization for the unattended runner. The approved canonical plan is
 * always returned unchanged as baseline.
 */
export function proposeSafeSceneVariations({article,source,canonicalPlan,recent=[]} = {}) {
  const inventory=source?.scene_inventory;
  if (inventory?.version !== SCENE_GROUNDING_VERSION || !isFingerprint(canonicalPlan))
    throw new Error('verified_scene_inventory_and_plan_required');
  const intent=articleSceneIntent(article);
  if (intent !== canonicalPlan.article_intent || !inventory.suitable_article_intents?.includes(intent))
    throw new Error('scene_article_intent_mismatch');
  if (canonicalPlan.source_id !== source.source_id || canonicalPlan.source_sha256 !== inventory.source_sha256 ||
      canonicalPlan.location_type !== inventory.primary_location || canonicalPlan.subject_zone !== inventory.subject_zone)
    throw new Error('source_or_location_mismatch');

  const seen=new Set();
  const proposals=[];
  for (const [scene_type,human_action,composition_type,visual_role] of definitions(intent,inventory.primary_location)) {
    if (!inventory.allowed_generated_actions?.includes(human_action)) continue;
    const candidate={
      ...canonicalPlan,scene_type,human_action,composition_type,visual_role,
      article_intent:intent,source_id:source.source_id,source_sha256:inventory.source_sha256,
      location_type:inventory.primary_location,subject_zone:inventory.subject_zone,
      // Never grant equipment permissions or invent a different zone.
      required_equipment:[...(canonicalPlan.required_equipment||[])],
      article_specific_directive:canonicalPlan.article_specific_directive || ''
    };
    const key=FINGERPRINT_FIELDS.map(k=>candidate[k]).join('|');
    if (seen.has(key) || !isFingerprint(candidate)) continue;
    seen.add(key);
    const similarity=semanticSimilarity(candidate,uniqueBySlug(recent));
    const repetition=diagnoseSceneRepetition(candidate,recent);
    proposals.push({
      fingerprint:Object.fromEntries(FINGERPRINT_FIELDS.map(k=>[k,candidate[k]])),
      eligible_for_offline_test:similarity.pass && similarity.unknown_count===0,
      history_coverage_complete:similarity.unknown_count===0,
      novelty_penalty:similarity.penalty,
      repetition_flags:repetition.flags,
      is_current: FINGERPRINT_FIELDS.every(k=>candidate[k]===canonicalPlan[k]),
      caution:'SHADOW only; needs source-grounding, actual image generation, full visual QC and human paired review.'
    });
  }
  return proposals.sort((a,b)=>
    Number(b.eligible_for_offline_test)-Number(a.eligible_for_offline_test) ||
    a.novelty_penalty-b.novelty_penalty ||
    Number(b.is_current)-Number(a.is_current)
  );
}

export function buildImageVariationShadowReport({article,source,canonicalPlan,recent=[],imageCopy} = {}) {
  const diagnosis=diagnoseSceneRepetition(canonicalPlan,recent);
  const proposals=proposeSafeSceneVariations({article,source,canonicalPlan,recent});
  return {
    version:IMAGE_VARIATION_VERSION,
    mode:'SHADOW',
    changes_production_scene:false,
    baseline_scene_fingerprint:Object.fromEntries(FINGERPRINT_FIELDS.map(k=>[k,canonicalPlan[k]])),
    production_scene_unchanged:true,
    source_id:source.source_id,
    source_sha256:source.scene_inventory.source_sha256,
    repetitions:diagnosis,
    copy_audit:auditEditorialCopy(imageCopy),
    offline_candidate_fingerprints:proposals,
    readiness:'RESEARCH_ONLY_NOT_PUBLISH_GATE',
    method_note:'Metadata-based diagnostic; 75/85-point visual quality claims require blind human image comparison and verified image QC.'
  };
}
