#!/usr/bin/env node
/**
 * Offline P2: independently check generated B image bytes and official image QA,
 * then package anonymous review images. No API calls or production writes.
 *
 * Only called in ephemeral GitHub Actions checkout, never from production app.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomInt} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length!==1||!['p2-01','p2-02','p2-03','p2-04','p2-05','all'].includes(args[0]))
  throw new Error('Usage: node scripts/package-editorial-image-p2-results.mjs p2-01...p2-05|all');

const DATA_ROOT='editorial/experiments/image-quality-p2/offline-output';
const file=rel=>path.resolve(ROOT,rel);
const exists=rel=>fs.existsSync(file(rel));
const json=rel=>JSON.parse(fs.readFileSync(file(rel),'utf8'));
const digest=rel=>createHash('sha256').update(fs.readFileSync(file(rel))).digest('hex');
const write=(rel,obj)=>{fs.mkdirSync(path.dirname(file(rel)),{recursive:true});fs.writeFileSync(file(rel),JSON.stringify(obj,null,2)+'\n')};
const shaOk=(rel,expected)=>exists(rel)&&/^[0-9a-f]{64}$/.test(String(expected||''))&&digest(rel)===expected;
const cohort=json('editorial/experiments/image-quality-p2/cohort.json');
const selected=args[0]==='all'?cohort.cases:cohort.cases.filter(c=>c.case_id===args[0]);
if(selected.length!== (args[0]==='all'?5:1))throw new Error('P2_CASE_ID_MISMATCH');
const pairs=[];const answerKeys=[];
for(const c of selected){
  const trialSlug='p2-'+c.case_id+'-'+c.slug;
  const scratchRel=DATA_ROOT+'/jobs/'+trialSlug+'.json';
  const stateRel='editorial/image-operator-state/'+trialSlug+'.json';
  const original=json('editorial/hybrid-image-jobs/'+c.slug+'.json');
  const status={case_id:c.case_id,slug:c.slug,image_status:'NOT_GENERATED',qa_pass:false,sha256_verified:false};
  const sourcePath=original.automation?.source_repo_path;
  if(!exists(scratchRel)||!exists(stateRel)){pairs.push(status);continue;}
  let trial,state;
  try{trial=json(scratchRel);state=json(stateRel)}catch {status.image_status='INVALID_RUN_DATA';pairs.push(status);continue;}
  if(trial.slug!==trialSlug||trial.asset_version!=='p2-offline-v1'||trial.automation?.mode!=='OFFLINE_P2_DO_NOT_PUBLISH'
    ||original.slug!==c.slug||original.asset_version!==c.baseline_asset_version
    ||trial.automation?.source_repo_path!==sourcePath
    ||trial.automation?.selected_source_id!==original.automation?.selected_source_id
    ||trial.image_headline_short!==original.image_headline_short
    ||trial.article_title!==original.article_title
    ||trial.customer_presentation!==original.customer_presentation
    ||trial.policy?.publish_boundary!=='REVIEW_AND_PUBLISH'
    ||state?.asset_version!=='p2-offline-v1') {
    status.image_status='EXPERIMENT_ISOLATION_MISMATCH';pairs.push(status);continue;
  }
  status.image_status=String(state.status||'INVALID_STATE');
  if(status.image_status!=='READY_CANDIDATE'||!exists(trial.qa_report_path)||!exists(trial.thumbnail)
     ||!exists(trial.og_image)||!exists(trial.gbp_image)||!exists(trial.generated_scene_path)
     ||!exists(original.thumbnail)||!exists(sourcePath)){pairs.push(status);continue;}
  const qa=json(trial.qa_report_path);
  const h=qa.scene_grounding?.asset_hashes||{};
  const good=qa.pass===true&&qa.image_generation_used===true&&qa.manual_visual_rejection!==true&&qa.scene_grounding?.pass===true
    &&qa.source_material_scope_pass===true&&qa.slug===trial.slug&&qa.asset_version===trial.asset_version
    &&qa.background_source_drive_file_id===original.background_source.drive_file_id
    &&qa.scene_grounding.plan?.source_sha256===original.scene_plan.source_sha256
    &&shaOk(sourcePath,h.source)&&shaOk(trial.generated_scene_path,h.scene)
    &&shaOk(trial.thumbnail,h.thumbnail)&&shaOk(trial.og_image,h.og)&&shaOk(trial.gbp_image,h.gbp);
  status.qa_pass=qa.pass===true;
  status.sha256_verified=good;
  if(!good){status.image_status='QA_OR_HASH_REJECTED';pairs.push(status);continue;}
  // Randomize visible slot without disclosing A/B in the reviewer package.
  const reversed=randomInt(2)===1;
  const blindDir=DATA_ROOT+'/reviewer/'+c.case_id;
  fs.mkdirSync(file(blindDir),{recursive:true});
  const first=reversed?trial.thumbnail:original.thumbnail;
  const second=reversed?original.thumbnail:trial.thumbnail;
  fs.copyFileSync(file(first),file(blindDir+'/image-01.jpg'));
  fs.copyFileSync(file(second),file(blindDir+'/image-02.jpg'));
  status.image_status='BLIND_PAIR_READY';
  status.baseline_sha256=digest(original.thumbnail);
  status.improved_sha256=digest(trial.thumbnail);
  status.visual_qc_checked_at=qa.checked_at;
  answerKeys.push({case_id:c.case_id,slot_01:reversed?'IMPROVED':'BASELINE',slot_02:reversed?'BASELINE':'IMPROVED',
    image_01_sha256:digest(blindDir+'/image-01.jpg'),image_02_sha256:digest(blindDir+'/image-02.jpg')});
  pairs.push(status);
}
const reviewer={experiment_id:cohort.experiment_id,version:'blind-paired-v1',mode:'OFFLINE_ONLY',
  note:'Score each anonymized image without opening private answer key. Image order has been randomized independently per case.',
  categories:['article_meaning','scene_originality','human_naturalness','the_rev_authenticity','copy_readability'],
  cases:pairs.filter(p=>p.image_status==='BLIND_PAIR_READY').map(p=>{
    const c=cohort.cases.find(x=>x.case_id===p.case_id);
    return {case_id:p.case_id,title:json('editorial/hybrid-image-jobs/'+p.slug+'.json').article_title,
      picture_01:'./'+p.case_id+'/image-01.jpg',picture_02:'./'+p.case_id+'/image-02.jpg',
      image_01_scores:null,image_02_scores:null,
      required_checks:{actual_store_layout:null,safe_human_action:null,one_customer_no_staff:null,natural_light_shadows:null},
      qualitative_notes:''};
  })};
write(DATA_ROOT+'/reviewer/review-sheet.json',reviewer);
write(DATA_ROOT+'/private-answer-key/answer-key.json',{
  experiment_id:cohort.experiment_id,unblind_only_after_review:true,keys:answerKeys
});
write(DATA_ROOT+'/reports/evidence.json',{
  experiment_id:cohort.experiment_id,version:'p2-image-evidence-v1',
  selected_cases:selected.length,blind_pairs_ready:answerKeys.length,
  all_requested_pairs_ready:answerKeys.length===selected.length,
  results:pairs,production_assets_modified:false,publish_eligible:false,
  note:'A blind pair is reviewable evidence, not proof of 5-article quality improvement or owner approval.'
});
process.stdout.write(JSON.stringify({selected:selected.length,ready:answerKeys.length,
  status:answerKeys.length===selected.length?'PAIRS_READY_FOR_HUMAN_REVIEW':'PARTIAL_OR_QC_REJECTED'},null,2)+'\n');
