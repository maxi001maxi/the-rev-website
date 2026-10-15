#!/usr/bin/env node
/**
 * One-off R5 -> R6 non-generative depth review.
 * A trusted GitHub R5 quarantine artifact is the only permitted visual source.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {hybridAssetPaths} from '../lib/editorialHybridImageFormat.mjs';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';

const slug='personal-gym-first-session-pain-health-history';
const R5='reference-v26-grounded-lobbysp-20261015-pain-r5';
const R6='reference-v26-grounded-lobbysp-20261015-pain-r6-depth-offline';
const root=path.resolve('.offline-review');
const jobPath=path.join(root,'r6-image-job.json');
const sourceRoot=path.join(root,'rejected-source');
const previous=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/'+slug+'.json','utf8'));
const registry=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json','utf8'));
const expectedSceneSHA='6ce3d1df4c1111ce63856bbdc83e2f1521ddd67cbff7c96ee47f0d2704635303';
const originalSceneRel='assets/images/editorial-generated/'+slug+'-'+R5+'-scene.png';
const qdir=path.join(sourceRoot,'.operator-rejected-evidence',slug,R5);
const manifest=JSON.parse(fs.readFileSync(path.join(qdir,'evidence-manifest.json'),'utf8'));
const sourceFile=path.join(qdir,originalSceneRel);
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const row=manifest.files?.find(x=>x.path===originalSceneRel);
if(previous.asset_version!==R5)throw new Error('ORIGINAL_ASSET_VERSION_CHANGED');
if(manifest.slug!==slug||manifest.asset_version!==R5||manifest.approved_for_publishing!==false||
  row?.sha256!==expectedSceneSHA||sha(sourceFile)!==expectedSceneSHA)throw new Error('REJECTED_SCENE_SHA_MISMATCH');
const priorPreflight=preflightEditorialImage(previous,registry);
if(!priorPreflight.pass)throw new Error('CANONICAL_R5_FREE_PREFLIGHT_FAILED: '+priorPreflight.errors.join(','));
const paths=hybridAssetPaths(slug,R6);
const job={
  ...previous,
  asset_version:R6,
  generated_scene_path:'assets/images/editorial-generated/'+slug+'-'+R6+'-scene.png',
  thumbnail:paths.thumbnailRepoPath,
  og_image:paths.ogRepoPath,
  gbp_image:paths.gbpRepoPath,
  qa_report_path:'editorial/image-qa/'+slug+'-'+R6+'.json',
  max_generation_attempts:1,
  automation:{
    ...previous.automation,
    mode:'OFFLINE_RECOVERED_R5_QC_ONLY_NOT_PUBLISH',
    recovery_from_run:38673164344,
    paid_image_generation_allowed:false
  },
  policy:{...previous.policy,publish_boundary:'REVIEW_AND_PUBLISH'},
  recovery_provenance:{
    kind:'SOURCE_HASH_VERIFIED_QUARANTINED_R5_DEPTH_FILTER',
    original_scene_sha256:expectedSceneSHA,
    image_generation_api_calls:0,
    offsite_upload_permitted:false,
    requires_independent_visual_QC:true,
    source_commit:process.env.GITHUB_SHA||'unknown'
  }
};
if(job.policy.trainer_present_forbidden!==true||job.policy.unknown_trainer_forbidden!==true||
  job.generated_customer_count!==1)throw new Error('CUSTOMER_ONLY_RULE_NOT_PRESERVED');
fs.mkdirSync(root,{recursive:true});
fs.mkdirSync(path.dirname('editorial/image-operator-state/'+slug+'.json'),{recursive:true});
fs.writeFileSync(jobPath,JSON.stringify(job,null,2)+'\n');
const statePath='editorial/image-operator-state/'+slug+'.json';
fs.writeFileSync(statePath,JSON.stringify({
 slug,asset_version:R6,status:'OVERLAY_RERENDER_REQUESTED',attempts_total:1,
 max_attempts:1,job_path:jobPath,generated_scene_path:job.generated_scene_path,
 xserver_verified:false,publish_approved:false
},null,2)+'\n');
const response={
 status:'OFFLINE_REVIEW_PREPARED',job_path:jobPath,slug,asset_version:R6,
 scene_path:job.generated_scene_path,source_sha256:expectedSceneSHA,
 no_image_generation:true,public_release:false,
 canonical_original_job_modified:false
};
fs.writeFileSync(path.join(root,'preflight.json'),JSON.stringify({...response,prior_preflight:priorPreflight},null,2)+'\n');
console.log(JSON.stringify(response));
