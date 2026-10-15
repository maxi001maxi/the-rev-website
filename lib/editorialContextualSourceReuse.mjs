/**
 * THE REV Editorial: using the same authenticated room photo is NOT the same
 * as repeating an article scene. Narrow evidence-only exception for an
 * isolated QA-only recovery; never relaxes the visual scores/scene grounding.
 */
const keys=['scene_type','location_type','human_action','composition_type','visual_role','article_intent'];
const eqFingerprint=(a,b)=>keys.every(k=>a?.[k]===b?.[k]);
const essential=['location_type','human_action','visual_role','article_intent'];
const observedCoreMatches=(a,b)=>essential.every(k=>a?.[k]===b?.[k]);

export function verifyDistinctContextualFacilitySourceReuse({job,sourceIds=[],recentIds=[],grounding}={}){
 const errors=[];
 const check=(condition,error)=>{if(!condition)errors.push(error);};
 const approval=job?.automation?.contextual_facility_source_reuse;
 const inv=job?.source_scene_inventory||{};
 const plan=job?.scene_plan||{};
 const rows=job?.automation?.recent_semantic_articles||[];
 const observed=grounding?.observation?.scene_fingerprint;
 const reference=job?.automation?.recent_articles||[];
 check(job?.automation?.mode==='OFFLINE_RECOVERED_R5_QC_ONLY_NOT_PUBLISH','NOT_PRIVATE_QC_MODE');
 check(job?.recovery_provenance?.kind==='SOURCE_HASH_VERIFIED_QUARANTINED_R5_DEPTH_FILTER','NO_ORIGINAL_QUARANTINE_SHA');
 check(approval?.review_scope==='OFFLINE_R7_ONLY_NO_PUBLICATION','NOT_EXPLICITLY_SCOPED');
 check(approval?.reason==='AUTHENTIC_RECEPTION_REQUIRED_DISTINCT_HEALTH_STORY','NOT_DOCUMENTED_CONTEXTUAL_REASON');
 check(job?.policy?.publish_boundary==='REVIEW_AND_PUBLISH','PUBLISH_BOUNDARY_CHANGED');
 check(job?.policy?.real_the_rev_background_required===true,'REAL_FACILITY_NOT_REQUIRED');
 check(job?.policy?.trainer_present_forbidden===true&&job?.generated_customer_count===1,'CUSTOMER_ONLY_NOT_ENFORCED');
 check(plan?.location_type==='reception'&&plan?.subject_zone==='reception'&&plan?.article_intent==='health_before_start','HEALTH_RECEPTION_SCOPE_MISMATCH');
 check(inv?.version===plan?.version&&!!inv?.source_sha256&&inv.source_sha256===plan.source_sha256,'SOURCE_SHA_MISMATCH');
 check(!!job?.automation?.selected_source_id&&plan.source_id===job.automation.selected_source_id,'SOURCE_ID_MISMATCH');
 check(sourceIds.some(x=>recentIds.includes(x)),'SOURCE_IS_NOT_A_REPEAT');
 check(reference.length>=4&&rows.length>=4,'HISTORY_INCOMPLETE');
 check(rows.slice(0,4).every(x=>!!x.scene_fingerprint),'RECENT_VISUAL_FINGERPRINT_MISSING');
 check(grounding?.pass===true&&grounding?.errors?.length===0,'INDEPENDENT_SOURCE_SCENE_QC_REJECTED');
 check(grounding?.similarity?.pass===true&&grounding?.similarity?.unknown_count===0,'SCENE_SEMANTIC_QC_REJECTED');
 check(!!observed&&observedCoreMatches(observed,plan),'OBSERVED_SCENE_CORE_MISMATCH');
 check(rows.slice(0,4).every(x=>!eqFingerprint(x.scene_fingerprint,observed)),'IDENTICAL_RECENT_SCENE');
 check(reference[0]?.slug!==job.slug&&reference[0]?.sceneFingerprint?.article_intent!==plan.article_intent,'LAST_ARTICLE_NOT_DISTINCT');
 check(job?.automation?.repeated_due_to_relevance===true,'RELEVANCE_REUSE_UNRECORDED');
 return {
  allowed:errors.length===0,
  policy:'authentic-real-reception-unique-health-action-qc-only-v1',
  source_repeated:true,
  scene_repeated:rows.slice(0,4).some(x=>eqFingerprint(x.scene_fingerprint,observed)),
  published:false,errors
 };
}
