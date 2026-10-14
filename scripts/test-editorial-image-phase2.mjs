import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildP2Case,buildP2ComparisonManifest,assessP2PairedResults,validateP2Cohort,P2_AXES} from '../lib/editorialImagePhase2.mjs';

const cohort=JSON.parse(fs.readFileSync('editorial/experiments/image-quality-p2/cohort.json','utf8'));
const run=args=>JSON.parse(execFileSync(process.execPath,['scripts/prepare-editorial-image-p2.mjs',...args],{encoding:'utf8',maxBuffer:10*1024*1024}));
const manifest=run([]);

test('five approved real articles are locked, separate topics, and baseline assets verified',()=>{
  assert.equal(validateP2Cohort(cohort),true);
  assert.equal(cohort.cases.length,5);
  assert.equal(manifest.subject_count,5);
  assert.equal(manifest.mode,'OFFLINE_ONLY');
  assert.equal(manifest.image_generation_status,'NOT_GENERATED');
  assert.equal(manifest.adoption_status,'NOT_EVALUATED');
  assert.equal(manifest.auto_publish,false);
  assert.equal(new Set(manifest.cases.map(c=>c.slug)).size,5);
  assert.deepEqual(manifest.cases.map(c=>c.slug),cohort.cases.map(c=>c.slug));
});

test('baseline A has actual approved image and checked source provenance, B is never faked as generated',()=>{
  for(const c of manifest.cases){
    assert.equal(c.original.verified_independent_qa_pass,true);
    assert.match(c.original.thumbnail_sha256,/^[0-9a-f]{64}$/);
    assert.match(c.comparison.source_sha256,/^[0-9a-f]{64}$/);
    assert.equal(c.comparison.generation_status,'NOT_GENERATED');
    assert.equal(c.comparison.independent_visual_qc_status,'NOT_RUN');
    assert.equal(c.comparison.publication_allowed,false);
    assert.equal(c.comparison.image_headline_short,JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/'+c.slug+'.json')).image_headline_short);
    assert.notDeepEqual(c.original.fingerprint,c.comparison.target_fingerprint);
    assert.notEqual(c.comparison.target_fingerprint.location_type,'non_existing_area');
    assert.equal(c.comparison.full_grounded_scene_plan.source_sha256,c.comparison.source_sha256);
  }
});

test('comparing five B images before B generation and QC cannot reach a decision',()=>{
  const status=assessP2PairedResults(manifest);
  assert.equal(status.status,'NOT_EVALUABLE');
  assert.equal(status.adopt,false);
  assert.equal(status.failures.length,5);
  assert(status.failures.every(f=>f.includes('REVIEW_MISSING')));
  assert.equal(status.comparisons.length,0);
});

test('a five-case fake high rating cannot override absence of real visual QC',()=>{
  const scores=Object.fromEntries(P2_AXES.map(axis=>[axis,5]));
  const submissions=manifest.cases.map(c=>({
    case_id:c.case_id,
    ratings:{baseline:Object.fromEntries(P2_AXES.map(axis=>[axis,2])),improved:scores},
    hard_gates:{source_structure:true,allowed_action:true,single_customer_no_trainer:true,realism_lighting:true}
  }));
  const status=assessP2PairedResults(manifest,submissions);
  assert.equal(status.status,'NOT_EVALUABLE');
  assert.equal(status.adopt,false);
  assert(status.failures.every(f=>f.includes('IMPROVED_IMAGE_QC_NOT_VERIFIED')));
});

test('no human ratings alone may promote to main or publish even after a simulated experiment completion',()=>{
  const ready=structuredClone(manifest);
  ready.cases.forEach(c=>{c.comparison.generation_status='QC_PASS';c.comparison.independent_visual_qc_status='PASS';});
  const low=Object.fromEntries(P2_AXES.map(axis=>[axis,2]));
  const high=Object.fromEntries(P2_AXES.map(axis=>[axis,5]));
  const submissions=ready.cases.map(c=>({
    case_id:c.case_id,
    ratings:{baseline:low,improved:high},
    hard_gates:{source_structure:true,allowed_action:true,single_customer_no_trainer:true,realism_lighting:true}
  }));
  const report=assessP2PairedResults(ready,submissions);
  assert.equal(report.status,'EXPERIMENT_REVIEW_COMPLETE');
  assert.equal(report.recommendation,'ELIGIBLE_FOR_OWNER_REVIEW');
  assert.equal(report.improved_cases,5);
  assert.equal(report.adopt,false);
  assert.equal(report.requires_owner_approval,true);
  submissions[0].hard_gates.source_structure=false;
  assert.equal(assessP2PairedResults(ready,submissions).status,'NOT_EVALUABLE');
});

test('baseline tampering and QA bypass are rejected',()=>{
  const job=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/'+cohort.cases[0].slug+'.json'));
  const qa=JSON.parse(fs.readFileSync(job.qa_report_path));
  const source=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json')).sources.find(s=>s.source_id===job.automation.selected_source_id);
  const hashes={source:source.scene_inventory.source_sha256,thumbnail:'a'.repeat(64)};
  const params={configuration:cohort.cases[0],job,qa,source,baselineAssetHashes:hashes};
  assert.throws(()=>buildP2Case({...params,job:{...job,asset_version:'fake'}}),/VERSION_CHANGED/);
  assert.throws(()=>buildP2Case({...params,qa:{...qa,pass:false}}),/INDEPENDENT_QC_NOT_PASS/);
  assert.throws(()=>buildP2Case({...params,source:{...source,drive_file_id:'fabricated'}}),/DRIVE_PROVENANCE_DRIFT/);
  assert.throws(()=>buildP2Case({...params,source:{...source,scene_inventory:{...source.scene_inventory,source_sha256:'bad'}}}),/SOURCE_HASH_DRIFT/);
  assert.throws(()=>buildP2Case({...params,configuration:{...cohort.cases[0],target_fingerprint:{scene_type:'exercise',human_action:'strength_exercise',composition_type:'wide_full_body',visual_role:'training_execution'}}}),/VARIATION_NOT_ALLOWED/);
});

test('five-case manifest is read-only and score sheets remain blank',()=>{
  const before=fs.readFileSync('editorial/experiments/image-quality-p2/cohort.json','utf8');
  const template=run(['--review-template']);
  assert.equal(template.case_reviews.length,5);
  assert(template.case_reviews.every(x=>x.blind_pair_ready===false&&x.anonymous_slot_1===null&&x.anonymous_slot_2===null));
  assert.equal(template.case_reviews[0].ratings.baseline.article_meaning,null);
  assert.equal(fs.readFileSync('editorial/experiments/image-quality-p2/cohort.json','utf8'),before);
});

test('cohort cannot silently expand or deduplicate',()=>{
  assert.throws(()=>validateP2Cohort({...cohort,cases:cohort.cases.slice(1)}),/EXACTLY_FIVE/);
  assert.throws(()=>validateP2Cohort({...cohort,cases:[...cohort.cases.slice(0,4),cohort.cases[0]]}),/DUPLICATE/);
});

test('offline Hybrid job materialization has a distinct slug/asset and strict one-attempt limit',()=>{
  const caseId='p2-03';
  const candidate=manifest.cases.find(c=>c.case_id===caseId);
  const run=execFileSync(process.execPath,['scripts/materialize-editorial-image-p2-job.mjs',caseId],{encoding:'utf8'}).trim();
  assert(run.startsWith('editorial/experiments/image-quality-p2/offline-output/jobs/'));
  const job=JSON.parse(fs.readFileSync(run,'utf8'));
  const original=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/'+candidate.slug+'.json','utf8'));
  assert.notEqual(job.slug,original.slug);
  assert.equal(job.max_generation_attempts,1);
  assert.equal(job.automation.mode,'OFFLINE_P2_DO_NOT_PUBLISH');
  assert.equal(job.publish_requires_human_approval,true);
  assert.equal(job.policy.publish_boundary,'REVIEW_AND_PUBLISH');
  assert.equal(job.article_title,original.article_title);
  assert.equal(job.image_headline_short,original.image_headline_short);
  assert.equal(job.customer_presentation,original.customer_presentation);
  assert.equal(job.automation.selected_source_id,original.automation.selected_source_id);
  assert.deepEqual(job.scene_plan.required_equipment,original.scene_plan.required_equipment);
  assert.equal(job.scene_plan.composition_type,'medium_side_portrait');
  assert.equal(job.scene_plan.source_sha256,original.scene_plan.source_sha256);
  assert(job.qa_report_path.startsWith('editorial/experiments/image-quality-p2/offline-output/'));
  assert(job.generated_scene_path.startsWith('editorial/experiments/image-quality-p2/offline-output/'));
  assert(!fs.existsSync(job.thumbnail));
  assert(!fs.existsSync(job.qa_report_path));
  assert.throws(()=>execFileSync(process.execPath,['scripts/materialize-editorial-image-p2-job.mjs',caseId],{encoding:'utf8',stdio:'pipe'}));
  fs.unlinkSync(run);
});

test('manual P2 workflow has no push trigger, production sync, or write token',()=>{
  const flow=fs.readFileSync('.github/workflows/editorial-image-p2-offline-pilot.yml','utf8');
  assert.match(flow,/workflow_dispatch:/);
  assert.doesNotMatch(flow,/^  push:/m);
  assert.doesNotMatch(flow,/^  schedule:/m);
  assert.match(flow,/permissions:\s*\n  contents: read/);
  assert.match(flow,/max_generation_attempts|EDITORIAL_IMAGE_MAX_ATTEMPTS/);
  assert.doesNotMatch(flow,/git push|lftp|XSERVER_FTP|SUPABASE_URL|publish-preview|AUTO_PUBLISH_ENABLED/i);
  assert.match(flow,/upload-artifact@v4/);
});

test('P2 evidence packager leaves missing B images unreviewable and never forges QC',()=>{
  const raw=execFileSync(process.execPath,['scripts/package-editorial-image-p2-results.mjs','p2-03'],{encoding:'utf8'});
  const status=JSON.parse(raw);
  assert.equal(status.selected,1);
  assert.equal(status.ready,0);
  assert.equal(status.status,'PARTIAL_OR_QC_REJECTED');
  const base='editorial/experiments/image-quality-p2/offline-output/';
  const evidence=JSON.parse(fs.readFileSync(base+'reports/evidence.json','utf8'));
  const reviewer=JSON.parse(fs.readFileSync(base+'reviewer/review-sheet.json','utf8'));
  const key=JSON.parse(fs.readFileSync(base+'private-answer-key/answer-key.json','utf8'));
  assert.equal(evidence.all_requested_pairs_ready,false);
  assert.equal(evidence.publish_eligible,false);
  assert.equal(evidence.results[0].qa_pass,false);
  assert.equal(reviewer.cases.length,0);
  assert.equal(key.keys.length,0);
  assert(!fs.existsSync(base+'reviewer/p2-03/image-01.jpg'));
});

test('blind P2 review package excludes private answer key and production side effects',()=>{
  const flow=fs.readFileSync('.github/workflows/editorial-image-p2-offline-pilot.yml','utf8');
  assert.match(flow,/name: p2-blind-review-/);
  assert.match(flow,/name: p2-unblind-key-/);
  assert.match(flow,/scripts\/package-editorial-image-p2-results\.mjs/);
  const reporter=fs.readFileSync('scripts/package-editorial-image-p2-results.mjs','utf8');
  assert(!/XSERVER_FTP|SUPABASE_URL|git push/.test(reporter));
  assert(reporter.includes('unblind_only_after_review:true'));
  assert(reporter.includes('qa.scene_grounding?.asset_hashes'));
});

test('offline review packaging without accepted B cannot falsely make a blind comparison ready',()=>{
  const output=execFileSync(process.execPath,['scripts/package-editorial-image-p2-results.mjs','p2-01'],{encoding:'utf8'});
  const status=JSON.parse(output);
  assert.equal(status.selected,1);
  assert.equal(status.ready,0);
  assert.equal(status.status,'PARTIAL_OR_QC_REJECTED');
  const evidence=JSON.parse(fs.readFileSync('editorial/experiments/image-quality-p2/offline-output/reports/evidence.json','utf8'));
  assert.equal(evidence.publish_eligible,false);
  assert.equal(evidence.production_assets_modified,false);
  assert.equal(evidence.all_requested_pairs_ready,false);
  const reviewer=JSON.parse(fs.readFileSync('editorial/experiments/image-quality-p2/offline-output/reviewer/review-sheet.json','utf8'));
  assert.equal(reviewer.cases.length,0);
});

test('reviewer and private key are separated into different upload-artifacts',()=>{
  const flow=fs.readFileSync('.github/workflows/editorial-image-p2-offline-pilot.yml','utf8');
  assert.match(flow,/package-editorial-image-p2-results.mjs/);
  const evidenceStart=flow.indexOf('- name: Upload offline evidence ONLY');
  const reviewerStart=flow.indexOf('- name: Upload anonymous gallery for blind human scoring');
  const privateStart=flow.indexOf('- name: Upload separate answer key (do not open until after scoring)');
  const end=flow.indexOf('- name: Fail closed if any case is rejected');
  assert(evidenceStart>=0 && reviewerStart>evidenceStart && privateStart>reviewerStart && end>privateStart);
  const evidenceBlock=flow.slice(evidenceStart,reviewerStart);
  const reviewerBlock=flow.slice(reviewerStart,privateStart);
  const privateBlock=flow.slice(privateStart,end);
  assert.match(reviewerBlock,/offline-output\/reviewer\/\*\*/);
  assert.doesNotMatch(reviewerBlock,/private-answer-key/);
  assert.match(privateBlock,/offline-output\/private-answer-key\/\*\*/);
  assert.doesNotMatch(evidenceBlock,/private-answer-key|offline-output\/reviewer\/\*\*/);
});

test('manual P2 workflow packages each randomized blind comparison exactly once',()=>{
  const flow=fs.readFileSync('.github/workflows/editorial-image-p2-offline-pilot.yml','utf8');
  assert.equal(flow.split('node scripts/package-editorial-image-p2-results.mjs').length-1,1,'rerandomization of A/B key forbidden');
  assert.equal(flow.split('name: p2-blind-review-').length-1,1,'duplicate blinded reviewer artifact forbidden');
  assert.equal(flow.split('name: p2-unblind-key-').length-1,1,'duplicate private key artifact forbidden');
  assert.equal(flow.split('name: p2-offline-image-comparison-').length-1,1,'duplicate operational evidence forbidden');
  const evidence=flow.slice(flow.indexOf('- name: Upload offline evidence ONLY'),flow.indexOf('- name: Upload anonymous gallery'));
  assert.equal(evidence.includes('private-answer-key'),false);
  assert.equal(evidence.includes('offline-output/reviewer/**'),false);
});

test('Phase 2 no-cost preflight verifies ALL five article cases and leaves no scratch production files',()=>{
  const out=JSON.parse(execFileSync(process.execPath,['scripts/preflight-editorial-image-p2.mjs','all'],{encoding:'utf8',maxBuffer:10*1024*1024}));
  assert.equal(out.case_count,5);
  assert.equal(out.mode,'OFFLINE_PREFLIGHT');
  assert.equal(out.no_api_calls,true);
  assert.equal(out.provider_credits_verified,false);
  assert.equal(out.image_generation_status,'NOT_RUN');
  assert.equal(out.all_pass,true);
  assert.equal(out.preflight_failures,0);
  for(const item of out.results){
    assert.equal(item.preflight,'PASS');
    assert.equal(item.candidate_isolated,true);
    assert.equal(item.baseline_qa_pass,true);
    assert.equal(item.baseline_image_verified,true);
    assert.equal(item.source_sha256_verified,true);
    assert.equal(item.missing_recent_images.length,0);
    assert.equal(item.estimated_image_scene_attempts,1);
    const jobPath='editorial/experiments/image-quality-p2/offline-output/jobs/p2-'+item.case_id+'-'+item.slug+'.json';
    assert.equal(fs.existsSync(jobPath),false);
  }
});

test('Phase 2 manual workflow runs preflight before dependencies, API calls and imagery',()=>{
  const yaml=fs.readFileSync('.github/workflows/editorial-image-p2-offline-pilot.yml','utf8');
  const pre=yaml.indexOf('node scripts/preflight-editorial-image-p2.mjs');
  const dep=yaml.indexOf('      - name: Install renderer and review dependencies');
  const render=yaml.indexOf('      - name: Render B scenes and check independent QC');
  assert(pre>0&&dep>pre&&render>dep);
  assert.match(yaml,/name: p2-preflight-/);
});

test('p2-01 failed R1 is preserved and new R2 is the only changed scene brief',()=>{
  const evidence=JSON.parse(fs.readFileSync('editorial/experiments/image-quality-p2/p2-01-r1-qc-evidence.json','utf8'));
  assert.equal(evidence.status,'IMAGE_GENERATED_BUT_INDEPENDENT_VISUAL_QC_REJECTED');
  assert.equal(evidence.source_scene_grounding_pass,true);
  assert.equal(evidence.human_visual_attention_share,42);
  assert.equal(evidence.improved_candidate_asset_version,'p2-offline-v1');
  assert.equal(evidence.manual_visual_rejection,true);
  const plan=JSON.parse(fs.readFileSync('editorial/experiments/image-quality-p2/cohort.json','utf8'));
  const p=plan.cases.find(c=>c.case_id==='p2-01');
  assert.equal(p.revision,'p2-01-r2-after-qc-fail-38540625251');
  assert.equal(p.target_fingerprint.composition_type,'medium_seated_portrait');
  assert.match(p.improved_brief,/NOT a wide full-body shot/);
  assert.match(p.improved_brief,/60–70%/);
  assert.match(p.improved_brief,/GBP 4:3/);
  const file=execFileSync(process.execPath,['scripts/materialize-editorial-image-p2-job.mjs','p2-01'],{encoding:'utf8'}).trim();
  try{
    const job=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(job.asset_version,'p2-offline-r2');
    assert.equal(job.max_generation_attempts,1);
    assert.equal(job.automation.mode,'OFFLINE_P2_DO_NOT_PUBLISH');
    assert.match(job.composition_hint,/NOT a wide full-body shot/);
    assert.equal(job.image_headline_short,'初回体験、\\n何を選ぶ？');
    assert.equal(job.scene_plan.composition_type,'medium_seated_portrait');
  }finally{fs.unlinkSync(file);}
  assert.equal(plan.cases.filter(c=>c.revision).length,1);
  assert(plan.cases.slice(1).every(c=>!c.previous_rejected_asset_version));
});

test('P2 remains a five case trial and r2 metadata never reduces image QC thresholds',()=>{
  const code=fs.readFileSync('scripts/package-editorial-image-p2-results.mjs','utf8');
  assert.match(code,/p2-offline-r2/);
  assert.match(code,/qa\\.pass===true/);
  assert.match(code,/qa\\.scene_grounding\\?\\.pass===true/);
  const flow=fs.readFileSync('.github/workflows/editorial-image-p2-offline-pilot.yml','utf8');
  assert.match(flow,/EDITORIAL_IMAGE_MAX_ATTEMPTS: '1'/);
  assert.match(flow,/workflow_dispatch:/);
});
