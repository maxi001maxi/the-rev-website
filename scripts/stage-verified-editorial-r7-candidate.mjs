#!/usr/bin/env node
/**
 * Promote only SHA-pinned, independently QC-passed R7 media as PRE-PUBLICATION
 * review assets. Does NOT edit canonical Editorial job, publish blog/GBP,
 * relax source repetition rules, or approve release on behalf of owner.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const ARTIFACT_DIR=process.argv[2]||'.r7-approved-source';
const SLUG='personal-gym-first-session-pain-health-history';
const VERSION='reference-v26-grounded-lobbysp-20261015-pain-r7-depth-portrait-offline';
const RUN_ID=38677888686;
const SOURCE_SHA='ca64249d26efba5cf664c955ce7e00e9280e72c29bfb148e74ba59296e408662';
const FILE_SHA=Object.freeze({
  'thumbnail.jpg':'ed41051a375fb46c780d640698fb5a36392d3e70be65bbc4302b2015cef70670',
  'og_image.jpg':'e5a29df585189a77ef25af812d256ae55cf870b3b9d55b45d85e74183a928c7b',
  'gbp_image.jpg':'b9663c392be7e849c35e2321479d6cbaae3c8050204983b4d3ad5888407505',
  'scene-depth.png':'f4626ed4af71a51e6c358482c151225edfc49d419b3c25cfa20f18d0e0f513b1',
  'independent-visual-qa.json':'760ea97e085f8f1336fe2b27cd54f8b46ba9c4c235f93c56851d902d9eb8472f',
  'r6-image-job.json':'5729ced40bb97734b2bfe3450336cb6da32a2e9c183887885ecbb2f48623622c'
});
// Files use fixed hashes obtained from the separately QC-accepted GitHub run.
const digest=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const fail=message=>{throw new Error('R7_PREPUBLICATION_BLOCKED: '+message);};
const read=p=>JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR,p),'utf8'));
const expect=(cond,message)=>{if(!cond)fail(message);};
const evaluation=read('evaluation.json');
const qa=read('independent-visual-qa.json');
const job=read('r6-image-job.json');
const source=job.automation?.source_repo_path;
const manifestFile='editorial/image-review/2026-10-15-health-pain-r7-prepublication.json';

expect(evaluation.qc_pass_and_three_images_present===true,'R7 artifact is not ready for owner review');
expect(evaluation.independent_qc_result===true && evaluation.qa_source_grounding_pass===true,'independent QA/grounding not PASS');
expect(evaluation.image_generation_api_calls===0 && evaluation.xserver_staging_performed===false && evaluation.published===false,'QC artifact not isolated');
expect(qa.pass===true && qa.manual_visual_rejection!==true && qa.scene_grounding?.pass===true && qa.scene_grounding?.errors?.length===0,'fail closed on any visual/scene QC');
expect(job.slug===SLUG && qa.slug===SLUG && job.asset_version===VERSION && qa.asset_version===VERSION,'wrong article or version');
expect(job.automation?.mode==='OFFLINE_RECOVERED_R5_QC_ONLY_NOT_PUBLISH' && job.policy?.publish_boundary==='REVIEW_AND_PUBLISH','cannot silently convert QA-only output into publisher');
expect(job.recovery_provenance?.image_generation_api_calls===0,'unexpected new generative image');
expect(job.generated_customer_count===1 && job.policy?.unknown_trainer_forbidden===true && qa.generated_customer_count===1 && qa.unknown_trainer_present===false && qa.trainer_present===false,'no fabricated trainer allowed');
expect(qa.visual_art_direction?.pass===true && qa.thumbnail_typography_acceptance?.pass===true,'all three layouts must pass');
expect(qa.gbp_safe_area_pass===true && qa.gbp_copy_legible===true && qa.gbp_aspect_ratio_pass===true,'GBP safe-area rejected');
expect(Number(qa.human_visual_attention_share)>=58 && Number(qa.human_visual_attention_share)<=75 && qa.background_secondary_pass===true && qa.background_soft_blur_pass===true,'human first QC regressed');
expect(Number(qa.rev_environment_consistency)>=8 && Number(qa.brand_space_authenticity)>=8 && qa.real_the_rev_background_confirmed===true,'real THE REV facility authenticity failed');
expect(qa.same_image_as_recent_articles===false && qa.scene_grounding?.similarity?.pass===true && qa.scene_grounding?.similarity?.unknown_count===0,'reused scene or unknown history');
const exception=qa.contextual_verified_facility_source_reuse;
expect(exception?.allowed===true && exception.scene_repeated===false && exception.errors?.length===0 &&
  exception.policy==='authentic-real-reception-unique-health-action-qc-only-v1' && exception.published===false,'source repetition exception not independently justified');
expect(qa.source_material_scope_pass===true && qa.scene_grounding?.asset_hashes?.source===SOURCE_SHA,'source material changed');
expect(source==='assets/images/photo-lobby-sp.jpg' && fs.existsSync(source) && digest(source)===SOURCE_SHA,'real original source missing or SHA changed');

const outputs={
 'thumbnail.jpg':job.thumbnail,'og_image.jpg':job.og_image,
 'gbp_image.jpg':job.gbp_image,'scene-depth.png':job.generated_scene_path,
 'independent-visual-qa.json':job.qa_report_path
};
const reportHashes=evaluation.file_sha256||{};
for(const [name,sha] of Object.entries(FILE_SHA)){
  const file=path.join(ARTIFACT_DIR,name);
  expect(fs.existsSync(file),'missing artifact file '+name);
  expect(digest(file)===sha,'pinned SHA mismatch '+name);
  expect(reportHashes[name]===sha,'independent evaluation SHA mismatch '+name);
}
const assetKey={'thumbnail.jpg':'thumbnail','og_image.jpg':'og','gbp_image.jpg':'gbp','scene-depth.png':'scene'};
for(const [name,key] of Object.entries(assetKey)){
  expect(qa.scene_grounding.asset_hashes[key]===FILE_SHA[name],'QA hash/actual media mismatch '+name);
}
for(const [name,dest] of Object.entries(outputs)){
  expect(dest.startsWith(name==='independent-visual-qa.json'?'editorial/image-qa/':'assets/images/'),'unexpected publish path '+dest);
  expect(dest.includes(SLUG) && dest.includes(VERSION),'path not scoped to this R7 only');
  if(fs.existsSync(dest))expect(digest(dest)===FILE_SHA[name],'cannot overwrite different existing media '+dest);
}
for(const [name,dest] of Object.entries(outputs)){
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.copyFileSync(path.join(ARTIFACT_DIR,name),dest);
}
const manifest={
 version:'r7-verified-prepublication-review-only-v1',
 slug:SLUG,asset_version:VERSION,source_run_id:RUN_ID,
 status:'IMAGE_ASSETS_PREPARED_FOR_XSERVER_VERIFICATION',
 approval_boundary:'OWNER_APPROVAL_REQUIRED_BEFORE_ANY_ARTICLE_OR_GBP_PUBLICATION',
 independent_qc_pass:true,source_scene_qc_pass:true,images_verified_by_sha256:true,
 genuine_source_sha256:SOURCE_SHA,
 distinct_scene_evidence:exception,
 images:Object.fromEntries(Object.entries(outputs).map(([name,dest])=>[name,{path:dest,sha256:FILE_SHA[name]}])),
 actual_blog_published:false,gbp_posted:false,
 canonical_job_modified:false,reviewed_by_owner:false,
 staging_on_xserver_verified:false,
 notes:'Reuses the verified real THE REV reception; repetition exception remains limited to QC-only evidence. Staged file availability is NOT human approval or article publication.'
};
fs.mkdirSync(path.dirname(manifestFile),{recursive:true});
fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync('.r7-image-assets',Object.entries(outputs).filter(([name])=>name.endsWith('.jpg')).map(([,dest])=>dest).join('\n')+'\n');
fs.writeFileSync('.r7-prepublish-paths',[...Object.values(outputs),manifestFile].join('\n')+'\n');
console.log(JSON.stringify({status:manifest.status,slug:SLUG,asset_version:VERSION,images:Object.values(outputs),manifest:manifestFile,no_publishing:true}));
