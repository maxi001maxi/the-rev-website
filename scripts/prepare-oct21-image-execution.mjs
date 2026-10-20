// Article-specific recovery adapter: canonical compiler, free admission and operator.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildHybridImageJob} from '../lib/editorialHybridImageFormat.mjs';
import {candidate,source,admission} from './preflight-oct21-image-admission.mjs';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
import {guardedPhotoEditPlan,guardedPhotoEditSettings} from '../lib/editorialGuardedPhotoEdit.mjs';
const root='editorial/prepublication/2026-10-21-evening-strength-sleep';
const read=p=>JSON.parse(fs.readFileSync(p));
const contract=read(root+'/IMAGE_EXECUTION_CONTRACT.json');
const design=read(root+'/IMAGE_FREE_PREFLIGHT_V082.json');
const qc=read(root+'/INDEPENDENT_QC_V082_ADDITIONAL.json');
if(contract.owner_approval?.status!=='APPROVED'||contract.content_id!=='BLOG-20261021-4ac8fd'||contract.generation_max_calls!==1||contract.independent_qc_max_calls!==2||contract.review_only!==true||Object.values(contract.production_authorization).some(Boolean))throw Error('IMAGE_EXECUTION_SCOPE_INVALID');
if(!admission.pass||!guardedPhotoEditPlan(design.plan).pass)throw Error('FREE_ADMISSION_FAILED');
const md=fs.readFileSync(root+'/ARTICLE_DRAFT.md','utf8');
const body=md.replace(/^# [^\n]+\n+/,'').trim();
const hash=s=>createHash('sha256').update(s).digest('hex');
if(hash(body)!==contract.body_sha256||qc.pass!==true||qc.total!==20||qc.body_sha256!==contract.body_sha256)throw Error('ACCEPTED_TEXT_QC_DRIFT');
const r7=read('editorial/image-review/2026-10-15-health-pain-r7-prepublication.json');
const job=buildHybridImageJob({slug:candidate.slug,title:candidate.article_title,categoryLabel:'TRAINING',columnLabel:'COLUMN',
 imageHeadlineShort:candidate.image_headline_short,assetVersion:contract.asset_version,
 qaReportPath:root+'/IMAGE_INDEPENDENT_QC.json',
 sceneIntent:'One ordinary adult customer pauses at the end of training and checks their wristwatch to decide when to finish; no equipment operation.',
 generatedCustomerCount:1,customerPresentation:'male',
 backgroundSource:{driveFileId:source.drive_file_id,cachedFrameDriveFileId:source.drive_file_id,selectionReason:'Approved real EVOLGEAR space; article-specific timing/strength decision; preserve original equipment and room.'}});
job.generated_scene_path=job.generated_scene_path.replace(/\.jpg$/,'.png');
job.max_generation_attempts=1;
job.scene_plan=candidate.scene_plan;
job.scene_plan.article_specific_directive=job.scene_intent;
job.visual_claim='A calm end-of-session decision: look at wristwatch and choose to finish rather than keep pushing; the photo does not prove sleep benefit.';
job.visible_action='Look at a wristwatch naturally, relaxed shoulders; not touching the rack or bench.';
job.execution=contract;
job.automation={...candidate.automation,mode:'owner-approved-branch-review-only',editorial_text_qc:{pass:true,total:20,body_sha256:contract.body_sha256,report:root+'/INDEPENDENT_QC_V082_ADDITIONAL.json'}};
job.v3={background_lock:'masked_openai_raw_guard_v2',guarded_edit:{...design.plan,source_sha256:design.source_sha256},
 openai_edit:{model:contract.model,quality:contract.quality},diagnostic_qc_on_raw_reject:true};
job.quality_references=[{...r7.images['scene-depth.png'],role:'R7 accepted photographic scene'},{...r7.images['thumbnail.jpg'],role:'R7 accepted final Thumbnail'}];
guardedPhotoEditSettings(job);
for(const ref of job.quality_references)if(hash(fs.readFileSync(ref.path))!==ref.sha256)throw Error('R7_REFERENCE_DRIFT');
const free=preflightEditorialImage(job,read('editorial/automated-image-sources.json'),{requireStrict:true});
if(!free.pass)throw Error('EXACT_IMAGE_JOB_PREFLIGHT: '+free.errors.join(','));
fs.writeFileSync(root+'/IMAGE_JOB.json',JSON.stringify(job,null,2)+'\n');
fs.writeFileSync(root+'/IMAGE_EXECUTION_FREE_PREFLIGHT.json',JSON.stringify({at:new Date().toISOString(),pass:true,free,body_sha256:contract.body_sha256,raw_edit_coverage:guardedPhotoEditPlan(design.plan),r7_references_sha_verified:true,source_sha256:design.source_sha256,existing_failed_job_unchanged:true,paid_calls:0,production_writes:false},null,2)+'\n');
console.log(JSON.stringify({status:'APPROVED_IMAGE_FREE_PREFLIGHT_PASS',asset_version:job.asset_version,model:contract.model,quality:contract.quality,paid_calls:0}));
