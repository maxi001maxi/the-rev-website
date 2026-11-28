import {createHash} from 'node:crypto';
export const editorialBodySha=body=>createHash('sha256').update(String(body||'').trim()).digest('hex');
export function validateEditorialTextQc(body,proof,{contentId=null}={}) {
  const checks={proof_present:proof?.schema==='editorial-text-qc-v1',
    evidence_recorded:/^[a-f0-9]{64}$/.test(proof?.evidence_sha256||''),
    content_id_matches:!contentId||proof?.content_id===contentId,
    independent_pass:proof?.pass===true && proof?.source_unverified===false && Array.isArray(proof?.issues)&&proof.issues.length===0 && Number(proof?.total)>=16,
    body_matches:proof?.body_sha256===editorialBodySha(body)};
  return {pass:Object.values(checks).every(Boolean),checks,missing:Object.keys(checks).filter(k=>!checks[k])};
}
// This is an observation of verified milestones, never an instruction to publish.
export function editorialProductionProgress(article={},preflight=null) {
  const proof=article.image_qa?.editorial_text_qc;
  const strict=Boolean(proof)||article.image_qa?.independent_qc_pass===false||article.image_qa?.bridge_synced===false;
  const text=validateEditorialTextQc(article.body_markdown,proof,{contentId:article.editorial_content_id});
  const textReady=strict?text.pass:Boolean(article.editorial_sync_hash);
  const images=article.image_asset_ready===true&&article.image_status==='READY'&&article.gbp_image_status==='READY'&&article.image_qa?.pass===true;
  const bridge=Boolean(article.editorial_sync_hash&&article.editorial_synced_at);
  const ready=textReady&&images&&bridge&&preflight?.ok===true;
  const published=article.publish_status==='PUBLISHED'&&Boolean(article.publish_verified_at&&article.published_url);
  const stage=published?'PUBLISHED':ready?'REVIEW_READY':textReady&&images&&bridge?'BRIDGE_SYNCED':textReady&&images?'IMAGE_READY':textReady?'QC_PASSED':'DRAFT';
  return {version:'v0.8.2',stage,last_successful_stage:stage,ready_for_owner_publish:ready&&!published,
    next_action:published?'NONE':!textReady?'REPAIR_AND_INDEPENDENT_TEXT_QC':!images?'COMPLETE_IMAGE_QC':!bridge?'CANONICAL_BRIDGE_SYNC':!ready?'PUBLISH_PREFLIGHT':'OWNER_PUBLISH',
    stopped_reason:published||ready?null:!textReady?'本文の独立QCと原稿の一致を確認できません。':!images?(article.image_last_error||'画像3形式とVisual QCが未完了です。'):!bridge?'正式Bridge同期が未確認です。':'公開前Preflightが未完了です。',
    human_publish_required:true,automatic_publish:false,text_qc:text,bridge_synced:bridge,
    reusable_artifacts:{body_sha256:editorialBodySha(article.body_markdown),image_asset_version:article.image_asset_version||null,image_job_path:article.image_job_path||null,thumbnail:article.thumbnail||null,og_image:article.og_image||null,gbp_image:article.gbp_image||null},
    api_usage:article.image_qa?.api_usage||{generation_attempts_reported:article.image_attempts??null,qc_calls:null,confirmed_cost:null}};
}
