// Free recovery admission using the existing canonical history/planner/gates.
// No provider calls, GitHub writes, state resets or production job registration.
import fs from 'node:fs';
import {getFile,listDirectory} from '../lib/githubContent.mjs';
import {recentHybridHistory,ensureCopy} from '../lib/editorialAutomatedHybridImage.mjs';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
import {planGroundedScene} from '../lib/editorialSceneGrounding.mjs';
const root='editorial/prepublication/2026-10-21-evening-strength-sleep';
const existing=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/night-workout-sleep-timing-intensity.json'));
const registry=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json'));
const design=JSON.parse(fs.readFileSync(root+'/IMAGE_FREE_PREFLIGHT_V082.json'));
const source=registry.sources.find(s=>s.source_id===design.source_id);
if(!source)throw Error('FREE_DESIGN_SOURCE_MISSING');
const title=fs.readFileSync(root+'/ARTICLE_DRAFT.md','utf8').split('\n')[0].replace(/^#\s*/,'');
const allHistory=(await recentHybridHistory(Infinity)).filter(r=>r.slug!==existing.slug);
const copies=[];
for(const entry of (await listDirectory('editorial/hybrid-image-jobs')).filter(e=>e.type==='file'&&e.name.endsWith('.json')&&e.name!=='_template.json')){
 const f=await getFile(entry.path);if(!f.exists)throw Error('RESERVED_COPY_UNREADABLE');const j=JSON.parse(f.content);if(j.slug!==existing.slug&&j.image_headline_short)copies.push({imageHeadlineShort:j.image_headline_short});
}
const plannedCopy='夜の筋トレ、\\n何時まで？'.replace('\\n','\n');
const selectedCopy=ensureCopy({title,image_headline_short:plannedCopy},[...allHistory,...copies]);
const copyMatchesBrief=selectedCopy===plannedCopy;
const seen=new Set(),history=allHistory.filter(r=>!seen.has(r.slug)&&seen.add(r.slug)).slice(0,12);
const plan=planGroundedScene({title,slug:existing.slug},source,history);
const candidate={...existing,article_title:title,asset_version:'PROPOSAL_ONLY_v082_oct21',
 max_generation_attempts:1,image_headline_short:selectedCopy,scene_plan:plan,generated_customer_count:1,
 automation:{...existing.automation,require_complete_semantic_preflight:true,selected_source_id:source.source_id,source_repo_path:source.repo_path,recent_semantic_articles:history,recent_articles:history.slice(0,4),require_consistent_recent_history:true}};
const admission=preflightEditorialImage(candidate,registry,{requireStrict:true});
if(!copyMatchesBrief){admission.pass=false;admission.errors.push('CREATIVE_BRIEF_COPY_CHANGED');admission.status='BLOCKED_BEFORE_MODEL';}
const keys=[source.drive_file_id,source.origin_video_file_id,source.repo_path].filter(Boolean);
const recent4=history.slice(0,4).filter(r=>[r.driveFileId,r.originVideoFileId,r.contentReference].some(v=>keys.includes(v)));
if(recent4.length){admission.pass=false;admission.errors.push('RECENT4_SOURCE_REUSE');admission.status='BLOCKED_BEFORE_MODEL';}
const report={content_id:'BLOG-20261021-4ac8fd',measured_at:new Date().toISOString(),exact_checkout_sha:process.env.GITHUB_SHA||null,
 status:admission.pass&&design.geometry.pass?'FREE_ADMISSION_PASS_PAID_APPROVAL_REQUIRED':'FREE_ADMISSION_BLOCKED',
 admission,recent4_source_matches:recent4.map(r=>r.slug),
 history:history.map(r=>({slug:r.slug,qa_at:r.checkedAt,content_reference:r.contentReference,asset_version:r.assetVersion,scene_fingerprint:r.sceneFingerprint,observation_reference:r.observationReference||null})),
 copy_matches_brief:copyMatchesBrief,planned_copy:plannedCopy,selected_copy:selectedCopy,all_history_count:allHistory.length,reserved_copies_checked:copies.length,
 geometry_pass:design.geometry.pass,raw_edit_actual_openai_fidelity_verified:false,
 existing_failed_asset_version:existing.asset_version,existing_attempts_preserved:true,production_job_changed:false,canonical_job_registered:false,paid_execution_authorized:false,model_calls:0,visual_qc_pass:false};
fs.writeFileSync(root+'/IMAGE_ADMISSION_READBACK.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,admission:report.admission,copy_matches_brief:copyMatchesBrief,selected_copy:selectedCopy,model_calls:0,canonical_job_registered:false}));

export {candidate,source,history,admission};
