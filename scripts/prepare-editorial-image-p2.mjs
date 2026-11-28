#!/usr/bin/env node
/**
 * P2: read-only, offline five-case pairing plan.
 * No model/API calls. No writes. No production job, QA, image or CMS changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildP2Case,buildP2ComparisonManifest,validateP2Cohort,P2_AXES} from '../lib/editorialImagePhase2.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cohortPath='editorial/experiments/image-quality-p2/cohort.json';
const json=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const sha256=rel=>createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex');
const fileExists=rel=>fs.existsSync(path.join(root,rel));
const cohort=json(cohortPath);
const registry=json('editorial/automated-image-sources.json');
validateP2Cohort(cohort);
const cases=cohort.cases.map(c=>{
  const jobPath='editorial/hybrid-image-jobs/'+c.slug+'.json';
  const job=json(jobPath);
  const qa=json(job.qa_report_path);
  const source=registry.sources.find(s=>s.source_id===job.automation?.selected_source_id);
  if(!source||!fileExists(job.thumbnail)||!fileExists(source.repo_path))
    throw new Error(c.case_id+':P2_APPROVED_SOURCE_OR_BASELINE_MISSING');
  const verified={
    source:sha256(source.repo_path),
    thumbnail:sha256(job.thumbnail)
  };
  return buildP2Case({configuration:c,job,qa,source,baselineAssetHashes:verified});
});
const report=buildP2ComparisonManifest(cohort,cases);
if(process.argv.length>3)throw new Error('Usage: node scripts/prepare-editorial-image-p2.mjs [--review-template]');
if(process.argv[2]==='--review-template'){
  const data={
    experiment_id:cohort.experiment_id,
    reminder:'No evaluation before all five improved assets pass real independent visual QA. Slots are not blinded until image assets are rendered and randomized.',
    case_reviews:cases.map(c=>({
      case_id:c.case_id,
      current_status:'AWAITING_B_RENDER_AND_QC',
      blind_pair_ready:false,
      anonymous_slot_1:null,
      anonymous_slot_2:null,
      ratings:{
        baseline:Object.fromEntries(P2_AXES.map(x=>[x,null])),
        improved:Object.fromEntries(P2_AXES.map(x=>[x,null]))
      },
      hard_gates:{source_structure:null,allowed_action:null,single_customer_no_trainer:null,realism_lighting:null},
      preference:null,reviewer_notes:''
    }))
  };
  process.stdout.write(JSON.stringify(data,null,2)+'\n');
}else if(!process.argv[2]){
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}else throw new Error('Usage: node scripts/prepare-editorial-image-p2.mjs [--review-template]');
