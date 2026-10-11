// Canonical source/scene contract. Image observations are evidence, never a PASS vote.
export const SCENE_GROUNDING_VERSION = 'the-rev-source-scene-v1';
export const SEMANTIC_RECENT_WINDOW = 12;
export const FINGERPRINT_FIELDS = ['scene_type','location_type','human_action','composition_type','visual_role','article_intent'];
export const SCENE_ONTOLOGY = Object.freeze({
  scene_type:['before_start','personal_choice','arrival','equipment_orientation','exercise','recovery_transition','workday_break'],
  location_type:['reception','training_area','boxing_area','recovery_area'],
  human_action:['enter','prepare','rest','compare_notes','review_paper','observe_facility','observing_real_equipment','boxing_stance','rack_adjustment','cable_operation','barbell_operation','strength_exercise','standing_break'],
  composition_type:['medium_seated_portrait','medium_side_portrait','medium_three_quarter_portrait','wide_full_body','close_action_portrait'],
  visual_role:['deciding_own_start','first_visit_reassurance','safe_first_step','considering_health_report','recovery_time','checking_readiness','facility_inspection','component_relationship','training_execution','movement_progress','workday_movement_break'],
  article_intent:['facility_selection','health_before_start','equipment_explanation','recovery','boxing_start','readiness','training_start','training_execution','training_progress','daily_movement','habit_start']
});
const trainingActions = new Set(['rack_adjustment','cable_operation','barbell_operation','strength_exercise']);
const fingerprintComplete = f => FINGERPRINT_FIELDS.every(k => SCENE_ONTOLOGY[k].includes(f?.[k]));

function warmupArticle(article = {}) {
  const text = [article.title,article.description,article.primary_query].join(' ');
  return /(ストレッチ|ウォームアップ|準備運動)/.test(text) && /(運動前|筋トレ|ボクシング|ランニング)/.test(text);
}

export function articleSceneIntent(article = {}) {
  const text = [article.title,article.description,article.primary_query].join(' ');
  if (/ジム/.test(text) && /選|比較|違い/.test(text)) return 'facility_selection';
  if (/健診|健康診断|血圧|血糖|脂質/.test(text)) return 'health_before_start';
  if (/DENBA/i.test(text) && /機器|本体|マット|構成|役割|何をする/.test(text)) return 'equipment_explanation';
  if (/酸素|DENBA|回復|リカバリー/i.test(text)) return 'recovery';
  if (warmupArticle(article)) return 'training_start';
  if (/ボクシング/.test(text)) return 'boxing_start';
  if (/疲労|疲れ|仕事終わり/.test(text)) return 'readiness';
  if (/フォーム|種目|筋トレ.*回数|追い込|強度|スクワット/.test(text)) return 'training_execution';
  if (/筋肉量|進歩|筋力/.test(text)) return 'training_progress';
  return 'training_start';
}

export function canonicalizeRecentFingerprint(article = {}, observedFingerprint = null) {
  if (!observedFingerprint || typeof observedFingerprint !== 'object') return observedFingerprint;
  const title = article.articleTitle || article.title || article.slug || '';
  const description = article.imageHeadlineShort || article.description || '';
  return {
    ...observedFingerprint,
    // Historical article intent is canonical editorial meaning, not a free-form
    // visual guess. This prevents a new ontology label from being retroactively
    // assigned to unrelated older articles merely because the same product is visible.
    article_intent: articleSceneIntent({title, description})
  };
}

export function semanticSimilarity(fingerprint, recent = []) {
  if (!fingerprintComplete(fingerprint)) return {pass:false,reason:'fingerprint_missing',matches:[]};
  // Deduplicate versions by article. Unknown history is reported, never scored as zero.
  const seen = new Set();
  const rows = recent.filter(r => { if (seen.has(r.slug)) return false; seen.add(r.slug); return true; }).slice(0,SEMANTIC_RECENT_WINDOW);
  const matches = rows.map(r => {
    const f = r.scene_fingerprint || r.sceneFingerprint;
    if (!fingerprintComplete(f)) return {slug:r.slug,unknown:true};
    const equal = FINGERPRINT_FIELDS.filter(k => f[k] === fingerprint[k]);
    // Location alone never excludes a necessary scene. Role + action + composition is redundant.
    const redundant = ['human_action','composition_type','visual_role','article_intent'].every(k => equal.includes(k));
    return {slug:r.slug,score:equal.length / FINGERPRINT_FIELDS.length,equal,hard_exclusion:redundant};
  });
  return {pass:!matches.some(m=>m.hard_exclusion),window:SEMANTIC_RECENT_WINDOW,compared:rows.length,
    unknown_count:matches.filter(m=>m.unknown).length,penalty:Math.max(0,...matches.filter(m=>!m.unknown).map(m=>m.score)),matches};
}

export function planGroundedScene(article, source, recent = []) {
  const inventory = source?.scene_inventory;
  if (inventory?.version !== SCENE_GROUNDING_VERSION) throw new Error('source_scene_inventory_missing');
  const intent = articleSceneIntent(article);
  if (!inventory.suitable_article_intents.includes(intent)) throw new Error('source_article_intent_mismatch');
  const location = inventory.primary_location;
  const isWarmup = warmupArticle(article);
  if (isWarmup && !['training_area','boxing_area'].includes(location)) throw new Error('warmup_requires_activity_area');
  const candidates = intent === 'facility_selection'
    ? location === 'training_area'
      ? [['equipment_orientation','observing_real_equipment','medium_side_portrait','safe_first_step'],['before_start','prepare','medium_seated_portrait','deciding_own_start']]
      : [['personal_choice','compare_notes','medium_seated_portrait','deciding_own_start'],['arrival','enter','medium_three_quarter_portrait','first_visit_reassurance']]
    : ['training_execution','training_progress'].includes(intent)
      ? [['exercise','strength_exercise','medium_three_quarter_portrait',intent==='training_progress'?'movement_progress':'training_execution']]
    : intent === 'health_before_start'
      ? [['before_start','review_paper','medium_seated_portrait','considering_health_report']]
      : intent === 'boxing_start'
        ? [['before_start','boxing_stance','medium_three_quarter_portrait','safe_first_step']]
        : intent === 'equipment_explanation'
          ? [
              ['equipment_orientation','observing_real_equipment','close_action_portrait','component_relationship'],
              ['equipment_orientation','observing_real_equipment','medium_side_portrait','component_relationship']
            ]
        : intent === 'recovery'
          ? [['recovery_transition','rest','medium_seated_portrait','recovery_time']]
          : [['before_start','prepare','medium_three_quarter_portrait','checking_readiness'],['before_start','rest','medium_seated_portrait','checking_readiness']];
  const plans = candidates.filter(c=>inventory.allowed_generated_actions.includes(c[1])).map(c=>({
    version:SCENE_GROUNDING_VERSION,source_id:source.source_id,source_sha256:inventory.source_sha256,
    scene_type:c[0],location_type:location,human_action:c[1],composition_type:c[2],visual_role:c[3],article_intent:intent,
    // No equipment manipulation is needed for a beginner's comparison article.
    required_equipment:intent==='equipment_explanation' ? ['denba_device'] : [],
    subject_zone:inventory.subject_zone,
    article_specific_directive:isWarmup
      ? 'Customer performs a light dynamic warm-up before exercise: controlled arm/shoulder and hip movement, full-body but low intensity, no static end-range hold, no equipment operation, no boxing stance, no trainer.'
      : ''
  })).map(p=>({...p,similarity:semanticSimilarity(p,recent)})).filter(p=>p.similarity.pass);
  plans.sort((a,b)=>a.similarity.penalty-b.similarity.penalty);
  if (!plans.length) throw new Error('no_relevant_diverse_scene');
  return plans[0];
}

export function groundedSceneBrief(plan, inventory) {
  const equipmentDirective = plan?.article_intent === 'equipment_explanation'
    ? 'Equipment explainer framing: customer is the dominant foreground subject at roughly 60-70% visual attention, in a close or medium side portrait, calmly looking at the verified real equipment. Keep the real device clearly recognizable as a secondary anchor. Use shallow depth and soft background blur; avoid wide empty walls or logo-dominant composition. Do not invent a mat or hidden component.'
    : '';
  return [
    `ARTICLE INTENT -> APPROVED SCENE: ${JSON.stringify(plan)}`,
    `CANONICAL SOURCE INVENTORY (absolute spatial constraint): ${JSON.stringify(inventory)}`,
    'Equipment in a background zone must STAY in that zone. Never copy, move, enlarge or add a rack/cable/bench into reception or foreground.',
    'No equipment absent from this inventory. Style references supply mood only, never objects or spatial layout.',
    `Customer action MUST be ${plan.human_action} in ${plan.subject_zone}; visual role ${plan.visual_role}.`,
    plan.article_specific_directive || '',
    'For compare_notes: one seated customer considering a small blank personal checklist/phone, calm thoughtful expression; no equipment touching. For observing_real_equipment: a customer studies the real equipment already present in the source from a safe distance, empty hands, no touching, adjusting, loading or operating. Do not invent a mat or any component not visible in the source.',
    'Preserve the room geometry, floor zones and furniture. Blur does not excuse moved/invented equipment.'
  ].filter(Boolean).join('\n');
}

export function evaluateSceneGrounding({inventory,plan,sourceRecognition,observation,recent=[]}={}) {
  const errors=[];
  const add=(ok,e)=>{if(!ok) errors.push(e);};
  add(inventory?.version===SCENE_GROUNDING_VERSION && plan?.version===SCENE_GROUNDING_VERSION,'contract_missing');
  add(Boolean(inventory?.source_sha256) && inventory?.source_sha256===plan?.source_sha256,'source_hash_mismatch');
  add(fingerprintComplete(plan),'plan_fingerprint_missing');
  add(sourceRecognition?.complete===true && Array.isArray(sourceRecognition?.equipment),'source_recognition_missing');
  add(observation?.complete===true && Array.isArray(observation?.equipment),'scene_observation_missing');
  const equipment=inventory?.visible_equipment || [];
  // Recognition must not invent a canonical allowance. Canon beats model observations.
  for(const [name,obs] of [['source',sourceRecognition],['generated',observation]]) {
    for(const e of Array.isArray(obs?.equipment) ? obs.equipment : []) add(equipment.some(real=>real.object===e.object && real.zone===e.zone),`${name}_unsupported_equipment:${e.object}@${e.zone}`);
  }
  const principal = equipment[0];
  if (principal) add(Array.isArray(sourceRecognition?.equipment) && sourceRecognition.equipment.some(e=>e.object===principal.object && e.zone===principal.zone),'canonical_source_principal_equipment_unconfirmed');
  for(const required of plan?.required_equipment || []) add(equipment.some(e=>e.object===required),'planned_equipment_not_grounded');
  for(const required of plan?.required_equipment || []) add(Array.isArray(observation?.equipment) && observation.equipment.some(e=>e.object===required && e.zone===plan.subject_zone),'required_equipment_not_visible');
  add(observation?.location_type===plan?.location_type,'scene_location_consistency');
  add(observation?.subject_zone===plan?.subject_zone,'subject_zone_mismatch');
  add(observation?.human_action===plan?.human_action,'article_scene_match');
  add(inventory?.allowed_generated_actions?.includes(observation?.human_action),'action_location_consistency');
  add(!(plan?.location_type==='reception' && trainingActions.has(observation?.human_action)),'training_action_in_reception');
  add(observation?.equipment_relocated===false && observation?.room_geometry_preserved===true,'spatial_plausibility');
  add(observation?.article_scene_match===true,'article_scene_match_visual');
  add(fingerprintComplete(observation?.scene_fingerprint),'observed_fingerprint_missing');
  if (fingerprintComplete(observation?.scene_fingerprint)) {
    for(const k of ['location_type','human_action','visual_role','article_intent']) add(observation.scene_fingerprint[k]===plan?.[k],`observed_plan_mismatch:${k}`);
  }
  const similarity=semanticSimilarity(observation?.scene_fingerprint,recent);
  add(similarity.pass,'recent_semantic_similarity');
  add(similarity.unknown_count===0,'semantic_history_observation_missing');
  return {version:SCENE_GROUNDING_VERSION,pass:errors.length===0,errors,inventory,plan,sourceRecognition,observation,similarity};
}

export function sceneGroundingRequired(qa={}) {
  return qa.scene_grounding_version===SCENE_GROUNDING_VERSION || String(qa.asset_version || '').includes('grounded-');
}
export function sceneGroundingPass(qa={}) {
  const e=qa.scene_grounding;
  if (!e || qa.manual_visual_rejection===true) return false;
  const evaluated=evaluateSceneGrounding({...e,recent:e.recent || []});
  return evaluated.pass && e.pass===true && e.asset_version===qa.asset_version && e.asset_hashes?.source===e.inventory?.source_sha256 && Boolean(e.asset_hashes?.scene) &&
    ['thumbnail','og','gbp'].every(k=>Boolean(e.asset_hashes?.[k]));
}
