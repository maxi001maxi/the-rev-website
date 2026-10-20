// Free recovery admission using the existing canonical history/planner/gates.
// No provider calls, GitHub writes, state resets or production job registration.
import fs from 'node:fs';
import {recentHybridHistory} from '../lib/editorialAutomatedHybridImage.mjs';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
import {planGroundedScene} from '../lib/editorialSceneGrounding.mjs';
const root='editorial/prepublication/2026-10-21-evening-strength-sleep';
const existing=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/night-workout-sleep-timing-intensity.json'));
const registry=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json'));
const design=JSON.parse(fs.readFileSync(root+'/IMAGE_FREE_PREFLIGHT_V082.json'));
const source=registry.sources.find(s=>s.source_id===design.source_id);
if(!source)throw Error('FREE_DESIGN_SOURCE_MISSING');
const title=fs.readFileSync(root+'/ARTICLE_DRAFT.md','utf8').split('\n')[0].replace(/^#\s*/,'');
const seen=new Set(),history=(await recentHybridHistory(Infinity)).filter(r=>r.slug!==existing.slug&&!seen.has(r.slug)&&seen.add(r.slug)).slice(0,12);
const plan=planGroundedScene({title,slug:existing.slug},source,history);
const candidate={...existing,article_title:title,asset_version:'PROPOSAL_ONLY_v082_oct21',
 max_generation_attempts:1,scene_plan:plan,generated_customer_count:1,
 automation:{...existing.automation,require_complete_semantic_preflight:true,selected_source_id:source.source_id,source_repo_path:source.repo_path,recent_semantic_articles:history}};
const admission=preflightEditorialImage(candidate,registry,{requireStrict:true});
const keys=[source.drive_file_id,source.origin_video_file_id,source.repo_path].filter(Boolean);
const recent4=history.slice(0,4).filter(r=>[r.driveFileId,r.originVideoFileId,r.contentReference].some(v=>keys.includes(v)));
if(recent4.length){admission.pass=false;admission.errors.push('RECENT4_SOURCE_REUSE');admission.status='BLOCKED_BEFORE_MODEL';}
const report={content_id:'BLOG-20261021-4ac8fd',measured_at:new Date().toISOString(),exact_checkout_sha:process.env.GITHUB_SHA||null,
 status:admission.pass&&design.geometry.pass?'FREE_ADMISSION_PASS_PAID_APPROVAL_REQUIRED':'FREE_ADMISSION_BLOCKED',
 admission,recent4_source_matches:recent4.map(r=>r.slug),
 history:history.map(r=>({slug:r.slug,qa_at:r.checkedAt,content_reference:r.contentReference,asset_version:r.assetVersion,scene_fingerprint:r.sceneFingerprint,observation_reference:r.observationReference||null})),
 geometry_pass:design.geometry.pass,raw_edit_actual_openai_fidelity_verified:false,
 existing_failed_asset_version:existing.asset_version,existing_attempts_preserved:true,production_job_changed:false,canonical_job_registered:false,paid_execution_authorized:false,model_calls:0,visual_qc_pass:false};
fs.writeFileSync(root+'/IMAGE_ADMISSION_READBACK.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,admission:report.admission,model_calls:0,canonical_job_registered:false}));
