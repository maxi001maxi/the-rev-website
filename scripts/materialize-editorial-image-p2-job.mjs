#!/usr/bin/env node
/**
 * Materialize ONE offline P2 image job in the ephemeral checkout.
 * Never pushes, publishes, or rewrites an existing canonical Hybrid job.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {groundedSceneBrief,semanticSimilarity} from '../lib/editorialSceneGrounding.mjs';
import {hybridAssetPaths} from '../lib/editorialHybridImageFormat.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const caseId=String(process.argv[2]||'');
if(process.argv.length!==3||!/^p2-0[1-5]$/.test(caseId))throw new Error('Usage: node scripts/materialize-editorial-image-p2-job.mjs p2-01...p2-05');
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const c=json('editorial/experiments/image-quality-p2/cohort.json').cases.find(x=>x.case_id===caseId);
if(!c)throw new Error('P2_CASE_NOT_FOUND');
const original=json('editorial/hybrid-image-jobs/'+c.slug+'.json');
const registry=json('editorial/automated-image-sources.json');
const source=registry.sources.find(x=>x.source_id===original.automation?.selected_source_id);
if(!source||!original.scene_plan||original.asset_version!==c.baseline_asset_version)throw new Error('P2_ORIGINAL_BASELINE_DRIFT');
const hash=createHash('sha256').update(fs.readFileSync(path.join(root,source.repo_path))).digest('hex');
if(hash!==source.scene_inventory?.source_sha256||hash!==original.scene_plan.source_sha256)throw new Error('P2_SOURCE_BYTES_DRIFT');
const planOutput=JSON.parse(execFileSync(process.execPath,['scripts/prepare-editorial-image-p2.mjs'],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024}));
const casePlan=planOutput.cases.find(x=>x.case_id===caseId);
if(!casePlan||casePlan.slug!==c.slug||casePlan.comparison.generation_status!=='NOT_GENERATED')throw new Error('P2_VALIDATED_PLAN_MISSING');
const trialSlug='p2-'+caseId+'-'+c.slug;
const trialVersion='p2-offline-v1';
const paths=hybridAssetPaths(trialSlug,trialVersion);
const b=structuredClone(original);
b.slug=trialSlug;
b.asset_version=trialVersion;
b.thumbnail=paths.thumbnailRepoPath;
b.og_image=paths.ogRepoPath;
b.gbp_image=paths.gbpRepoPath;
b.generated_scene_path='editorial/experiments/image-quality-p2/offline-output/scenes/'+trialSlug+'.png';
b.qa_report_path='editorial/experiments/image-quality-p2/offline-output/qa/'+trialSlug+'.json';
b.max_generation_attempts=1;
b.scene_plan=casePlan.comparison.full_grounded_scene_plan;
b.scene_plan.similarity=semanticSimilarity(b.scene_plan,original.automation?.recent_semantic_articles||[]);
if(b.scene_plan.similarity.pass!==true)throw new Error('P2_IMPROVED_SCENE_RECENT_COLLISION');
b.source_scene_inventory=source.scene_inventory;
b.scene_intent=groundedSceneBrief(b.scene_plan,source.scene_inventory);
b.automation={
  ...original.automation,
  mode:'OFFLINE_P2_DO_NOT_PUBLISH',
  source_repo_path:source.repo_path,
  selected_source_id:source.source_id
};
b.composition_hint='Strictly preserve verified THE REV. source architecture, floors, walls, windows, equipment positions and scale. One natural customer in the planned source zone. No new objects or props unless verified. Soft natural background, faithful shadows. '+c.improved_brief;
b.visible_action=c.improved_brief;
b.recovery_note='OFFLINE_ONLY P2 experiment; no deployment, no GitHub publishing, 1 attempt maximum. Compare with '+original.asset_version;
b.publish_requires_human_approval=true;
b.policy={...b.policy,publish_boundary:'REVIEW_AND_PUBLISH'};
const outfile='editorial/experiments/image-quality-p2/offline-output/jobs/'+trialSlug+'.json';
const outputPath=path.join(root,outfile);
if(fs.existsSync(outputPath))throw new Error('P2_OFFLINE_JOB_ALREADY_EXISTS');
if([b.thumbnail,b.og_image,b.gbp_image,b.generated_scene_path,b.qa_report_path].some(p=>fs.existsSync(path.join(root,p))))
  throw new Error('P2_OFFLINE_ASSET_EXISTS');
if(b.automation.mode==='unattended-github-actions-v1'||b.slug===original.slug)throw new Error('P2_PRODUCTION_JOB_NOT_ISOLATED');
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(b,null,2)+'\n');
process.stdout.write(outfile+'\n');
