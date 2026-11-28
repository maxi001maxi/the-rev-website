import {getFile} from './githubContent.mjs';
import {editorialBodySha,validateEditorialTextQc} from './editorialProductionRecovery.mjs';
import {HYBRID_IMAGE_FORMAT,hybridImageInfoFromDraft,hybridQaReady} from './editorialHybridImageFormat.mjs';
import {evaluateEditorialImageReview} from './editorialImageReviewGate.mjs';
import {verifyLiveEditorialAsset,sha256Bytes} from './editorialAssetBytes.mjs';

// Reconcile an explicitly accepted, independently checked existing image through
// the normal Bridge. This route has no generator, write, retry or publish call.
export async function acceptedEditorialImage(article,existing,{contentId,textProof,getFileFn=getFile,verifyLive=verifyLiveEditorialAsset}={}) {
  const slug=String(article.slug||'');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return null;
  const manifestFile=await getFileFn(`editorial/image-acceptance/${slug}.json`);
  if(!manifestFile.exists)return null;
  const fail=reason=>{throw new Error('ACCEPTED_IMAGE_NOT_VERIFIED: '+reason);};
  const read=async path=>{
    if(!/^editorial\/[a-zA-Z0-9/_\-.]+\.json$/.test(path||'')||path.includes('..'))fail('unsafe evidence path');
    const file=await getFileFn(path);if(!file.exists||!file.content)fail('missing evidence');return {file,value:JSON.parse(file.content)};
  };
  const m=JSON.parse(manifestFile.content);
  if(m.schema!=='editorial-accepted-image-v1'||m.content_id!==contentId||m.draft_id!==existing?.id||
     m.title!==article.title||m.body_sha256!==editorialBodySha(article.body_markdown)||
     m.owner_adoption_authorized!==true||m.automatic_publish!==false||existing?.image_qa?.manual_visual_rejection===true||
     !validateEditorialTextQc(article.body_markdown,textProof,{contentId}).pass)fail('identity, Owner approval or accepted body mismatch');
  const {value:job}=await read(m.job_path),{file:qaFile,value:qa}=await read(job.qa_report_path);
  if(sha256Bytes(Buffer.from(qaFile.content))!==m.qa_sha256||job.slug!==slug||job.article_title!==article.title||
     job.execution?.body_sha256!==m.body_sha256||job.asset_version!==m.asset_version||qa.asset_version!==m.asset_version||
     job.publish_requires_human_approval!==true||qa.r7_comparison?.pass!==true||
     Object.values(qa.owner_finish_qc||{}).some(v=>v===false))fail('QC, job or R7 mismatch');
  const draft={...article,image_status:'READY',image_asset_ready:true,image_render_version:job.render_version,
    image_strategy:job.image_strategy,image_style_template:job.image_style_template,
    image_source_path:job.automation?.source_repo_path,image_headline_short:job.image_headline_short,
    image_category_label:job.category_label,image_series_label:job.column_label,
    image_asset_version:job.asset_version,image_job_path:m.job_path,image_qa_report_path:job.qa_report_path,
    image_generation_model:job.generation_model,image_qa_model:job.qa_model,image_qa:qa,
    thumbnail:'/'+job.thumbnail,og_image:'/'+job.og_image,gbp_image:'/'+job.gbp_image,
    gbp_image_status:'READY',gbp_image_asset_version:job.asset_version,gbp_image_qa:qa};
  if(job.render_version!==HYBRID_IMAGE_FORMAT.id||!hybridQaReady(draft,qa)||!evaluateEditorialImageReview({draft,qa}).ok)fail('canonical quality gate');
  const assets=[['source',job.automation?.source_repo_path],['scene',job.generated_scene_path],['thumbnail',job.thumbnail],['og',job.og_image],['gbp',job.gbp_image]];
  await Promise.all(assets.map(async([kind,path])=>{
    if(!/^assets\/[a-zA-Z0-9/_\-.]+$/.test(path||'')||path.includes('..'))fail('unsafe asset path');
    const f=await getFileFn(path),expected=qa.scene_grounding?.asset_hashes?.[kind];
    if(!/^[a-f0-9]{64}$/.test(expected||'')||!f.exists||f.sha256!==expected)fail('GitHub SHA mismatch: '+kind);
    if(['thumbnail','og','gbp'].includes(kind)&&!await verifyLive('/'+path,f))fail('delivery SHA mismatch: '+kind);
  }));
  return {...hybridImageInfoFromDraft(draft),acceptedExisting:true,operatorRequired:false};
}
