import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {R9_DIR,R9_VERSION,r9PixelAlpha,r9ComposePixels,auditR9ProtectedPixels,r9BriefPreflight} from '../lib/editorialOct18R9.mjs';
import {articleSceneIntent} from '../lib/editorialSceneGrounding.mjs';
import {imageAcceptanceIssues} from '../lib/editorialImageAcceptance.mjs';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
import {hybridQaReady} from '../lib/editorialHybridImageFormat.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const job=read(R9_DIR+'/PROPOSED_JOB.json'),brief=read(R9_DIR+'/CREATIVE_BRIEF.json');
const r7='personal-gym-first-session-pain-health-history-reference-v26-grounded-lobbysp-20261015-pain-r7-depth-portrait-offline';

test('R9 registered source/action, explicit trial-terms intent and unchanged 20/20 copy pass free contracts',()=>{
  assert.equal(preflightEditorialImage(job,read('editorial/automated-image-sources.json')).pass,true);
  assert.equal(r9BriefPreflight(job,brief).pass,true);
  assert.equal(hash(brief.source.path),brief.source.sha256);
  const q=read('editorial/prepublication/2026-10-18-contract-checklist/FINAL_QC_RESULT.json');
  assert.equal(hash('editorial/prepublication/2026-10-18-contract-checklist/ARTICLE_DRAFT.md'),q.source_sha256);
  assert.equal(q.score_total,20);
});
test('R8 taxonomy and rejection are immutable; only the explicit pre-generation R9 semantic revision changes intent',()=>{
  assert.equal(articleSceneIntent({title:job.article_title}),'training_start');
  assert.equal(articleSceneIntent({title:job.article_title,semantic_revision:job.scene_semantics_revision}),'facility_selection');
  assert.equal(read('editorial/prepublication/2026-10-18-contract-checklist/v31-r8/PRIVATE_RESULT/independent-visual-qc.json').pass,false);
  const broken=structuredClone(brief);broken.shot_contract.eyeline='look at the logo';
  assert(r9BriefPreflight(job,broken).errors.includes('R9_ACTION_GAZE_NOT_CONNECTED'));
});
test('an adversary repainting every pixel cannot change even a single protected or feather-exterior pixel',()=>{
  const W=64,H=96,plan={...job.v31.locked_edit_plan,size:'64x96',feather_px:1};
  const source=new Uint8ClampedArray(W*H*4),edited=new Uint8ClampedArray(W*H*4);
  for(let i=0;i<source.length;i+=4){source.set([19,31,47,255],i);edited.set([255,0,255,255],i);}
  assert.equal(auditR9ProtectedPixels(source,edited,W,H,plan).pass,false);
  const result=r9ComposePixels(source,edited,W,H,plan);
  const audit=auditR9ProtectedPixels(source,result.pixels,W,H,plan);
  assert.equal(audit.changed_protected_pixels,0);assert(audit.protected_pixels>W*H*.75);
  assert.equal(r9PixelAlpha(55,61,plan),1);assert.equal(result.pixels[(61*W+55)*4],255,'editable person interior is retained');
  assert.equal(r9PixelAlpha(55,H-.5,plan),1,'body continues past bottom crop, no R4 oval waist seam');
});
test('R4 elliptical closure, protected-equipment overlap and hand/matte clipping are rejected before billing',()=>{
  const ellipse=structuredClone(job);delete ellipse.v31.locked_edit_plan.polygon;
  assert(r9BriefPreflight(ellipse,brief).errors.includes('R9_MASK_GEOMETRY_INVALID'));
  const overlap=structuredClone(job);overlap.v31.locked_edit_plan.protected_anchors[0].box=[.8,.3,.9,.7];
  assert(r9BriefPreflight(overlap,brief).errors.includes('R9_EDIT_INTERSECTS_PROTECTED_RACK'));
  const clipped=structuredClone(brief);clipped.shot_contract.paper_box=[.5,.5,.6,.6];
  assert(r9BriefPreflight(job,clipped).errors.includes('R9_ACTION_CROSSES_EDIT_EDGE'));
});
test('actual R3/R4/R6/R8 evidence remains rejected even with fake PASS, high scores or a renamed asset version',()=>{
  for(const fixture of read('editorial/fixtures/oct18-image-rejections/manifest.json').fixtures) {
    assert.equal(hash(fixture.qa_path),fixture.qa_sha256);assert.equal(hash(fixture.thumbnail_path),fixture.thumbnail_sha256);
    const q=read(fixture.qa_path);assert.equal(q.pass,false);
    const forged={...structuredClone(q),pass:true,manual_visual_rejection:false,asset_version:'renamed-to-hide-rejection'};
    for(const k of ['human_environment_integration','perspective_scale_consistency','ground_contact_shadow_consistency','lighting_consistency','anatomy_pose_realism'])forged[k]=10;
    assert(imageAcceptanceIssues({},forged).some(x=>x.startsWith('OWNER_REJECTED_ASSET')),fixture.name);
  }
});
test('R7 still passes unchanged; an R9 candidate requires a current full protected-pixel audit',()=>{
  const qa=read('editorial/image-qa/'+r7+'.json');
  assert.equal(hybridQaReady({slug:'personal-gym-first-session-pain-health-history',image_asset_version:qa.asset_version,image_render_version:'rev-column-reference-v2.3-hybrid',image_strategy:'reference-v2-gpt-image-hybrid-drive-source'},qa),true);
  const q={...qa,asset_version:R9_VERSION};
  assert(imageAcceptanceIssues({},q).includes('R9_SOURCE_PIXEL_LOCK_NOT_VERIFIED'));
  q.source_pixel_lock={changed_protected_pixels:1,protected_pixels:100,source_fit:'uniform_cover',optical_blur_px:.8,source_sha256:q.scene_grounding.asset_hashes.source,scene_sha256:q.scene_grounding.asset_hashes.scene};
  assert(imageAcceptanceIssues({},q).includes('R9_SOURCE_PIXEL_LOCK_NOT_VERIFIED'));
});
test('the real operator spends zero calls with pending R9 or an old R8 approval',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'r9-no-spend-'));
  try {
    const marker=path.join(temp,'calls');fs.writeFileSync(path.join(temp,'mock.mjs'),`import fs from 'node:fs';globalThis.fetch=async()=>{fs.writeFileSync(${JSON.stringify(marker)},'FORBIDDEN');throw Error('No model calls allowed');};`);
    const run=j=>{const p=path.join(temp,'job.json');fs.writeFileSync(p,JSON.stringify(j));return spawnSync(process.execPath,['--import',path.join(temp,'mock.mjs'),'scripts/auto-editorial-hybrid-image.mjs',p],{encoding:'utf8',env:{...process.env,OPENAI_API_KEY:'synthetic-only'},timeout:10000});};
    assert.match(run(job).stderr,/OWNER_SPEND_APPROVAL_REQUIRED/);
    const stale=structuredClone(job);stale.v31.owner_spend_approval='APPROVED';stale.v31.owner_approval=read('editorial/prepublication/2026-10-18-contract-checklist/v31-r8/OWNER_SPEND_APPROVAL.json');
    assert.match(run(stale).stderr,/OWNER_SPEND_APPROVAL_REQUIRED/);assert.equal(fs.existsSync(marker),false);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('saved actual renderer output keeps all three protected equipment anchors and action boxes visible',()=>{
  const report=read(R9_DIR+'/FREE_PREFLIGHT.json');
  assert.equal(report.status,'FREE_DESIGN_PREFLIGHT_PASS');assert.equal(report.model_api_calls,0);
  assert.equal(report.actual_accepted_image,false);assert.equal(report.source_lock.changed_protected_pixels,0);
  assert(report.source_lock.protected_pixels>1024*1536*.75);
  for(const g of report.geometry){assert(g.person_action_safe);assert(g.protected_equipment.every(a=>a.visible));}
  for(const v of report.canonical_renderer.variants){assert.equal(hash(v.path),v.sha256);assert.equal(v.typography_measurements_pass,true);}
});
