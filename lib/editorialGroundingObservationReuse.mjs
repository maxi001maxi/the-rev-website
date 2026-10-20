import {evaluateSceneGrounding} from './editorialSceneGrounding.mjs';
// Reuse only independent observations of unchanged source/raw pixels. A cached
// failed verdict is never changed or imported as PASS. Reevaluate canonical
// semantics and require a new independent final QC after any layout change.
export function reuseGroundingObservation({job,qa,inventory,hashes}) {
 if(job?.execution?.review_only!==true||job.execution.content_id!=='BLOG-20261021-4ac8fd'||job.execution.owner_approval?.status!=='APPROVED'||job.execution.generation_max_calls!==0||job.execution.independent_qc_max_calls!==1)throw Error('OBSERVATION_REUSE_SCOPE_INVALID');
 const old=qa?.scene_grounding;
 if(qa.asset_version!=='reference-v082-evolgear-japanese-night-depth-20261020-r5'||
    hashes.scene!=='6f3b19d4a15565bce5d5399a6e85cbb0443b410285911d6c2f94188975fb70b7'||
    hashes.source!==inventory.source_sha256||old?.asset_hashes?.scene!==hashes.scene||old?.asset_hashes?.source!==hashes.source||
    old.observation?.complete!==true||old.sourceRecognition?.complete!==true)throw Error('OBSERVATION_REUSE_PIXEL_DRIFT');
 const evaluated=evaluateSceneGrounding({inventory,plan:job.scene_plan,sourceRecognition:old.sourceRecognition,observation:old.observation,recent:old.recent});
 return {...evaluated,recent:old.recent,asset_version:job.asset_version,asset_hashes:hashes,
   observation_method:'unchanged RAW/source SHA-bound independent R5 observations + corrected canonical semantic plan; new independent final QC required',
   reuse:{from_asset_version:qa.asset_version,original_overall_pass:qa.pass,original_grounding_pass:old.pass,original_errors:old.errors,
    observation_api_request_id:qa.api_usage?.calls?.find(c=>c.kind==='qc')?.request_id||null,raw_pixels_unchanged:true,new_visual_qc_required:true}};
}
