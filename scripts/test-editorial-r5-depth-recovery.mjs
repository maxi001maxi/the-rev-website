import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const flow=fs.readFileSync('.github/workflows/editorial-r5-depth-recovery.yml','utf8');
const prepare=fs.readFileSync('scripts/prepare-editorial-r5-depth-review.mjs','utf8');
const depth=fs.readFileSync('scripts/offline-r5-depth-recovery.py','utf8');
const operator=fs.readFileSync('scripts/auto-editorial-hybrid-image.mjs','utf8');
const canonical=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/personal-gym-first-session-pain-health-history.json','utf8'));

test('R6 cannot fall through to any paid IMAGE generation when state is missing',()=>{
 assert(operator.includes("EDITORIAL_IMAGE_DISABLE_GENERATION === '1' && !forceOverlayRerender"));
 const guard=operator.indexOf("EDITORIAL_IMAGE_DISABLE_GENERATION === '1'");
 const loop=operator.indexOf('while (attemptsTotal < MAX_TOTAL_ATTEMPTS)');
 assert(guard>0&&loop>guard);
 assert(flow.includes("EDITORIAL_IMAGE_DISABLE_GENERATION: '1'"));
 assert(flow.includes("paid_image_generation_allowed"));
 assert(flow.includes('OVERLAY_RERENDER_REQUESTED')===false);
 assert(prepare.includes("status:'OVERLAY_RERENDER_REQUESTED'"));
});

test('R5 artifact must be authentic rejected SHA-bound run and no publish',()=>{
 assert(flow.includes("R5_QUARANTINE_RUN: '38673164344'"));
 assert(flow.includes('gh run download "$R5_QUARANTINE_RUN"'));
 assert(depth.includes('EXPECTED_SCENE_SHA'));
 assert(depth.includes('manifest.get("approved_for_publishing") is not False'));
 assert(prepare.includes('REJECTED_SCENE_SHA_MISMATCH'));
 assert(prepare.includes("approved_for_publishing!==false"));
 assert(prepare.includes('CANONICAL_R5_FREE_PREFLIGHT_FAILED'));
 assert(flow.includes('permissions:')&&flow.includes('contents: read'));
 assert(!flow.includes('XSERVER_FTP_'));
 assert(!flow.includes('git push origin'));
 assert(!flow.includes('git commit '));
 assert.equal(canonical.asset_version,'reference-v26-grounded-lobbysp-20261015-pain-r5');
});

test('no model image creation; the only paid model capability is independent QC',()=>{
 const blur=flow.indexOf('python3 scripts/offline-r5-depth-recovery.py');
 const qc=flow.indexOf('node scripts/auto-editorial-hybrid-image.mjs .offline-review/r6-image-job.json');
 assert(blur>0&&blur<qc);
 assert(flow.includes('QA_MODEL:')===false); // uses real operator model via environment
 assert(flow.includes('EDITORIAL_IMAGE_QA_MODEL:'));
 assert(flow.includes('independent_qa_model_may_be_billed'));
 assert(flow.includes('image_generation_api_calls'));
 assert(!flow.includes('workflow_call'));
});

test('three preview outputs always archived, never interpreted as approval unless source grounding and QA pass',()=>{
 for(const key of ['thumbnail','og_image','gbp_image'])assert(prepare.includes(key));
 assert(flow.includes("qc_pass_and_three_images_present"));
 assert(flow.includes("qa.get('scene_grounding',{}).get('pass') is True"));
 assert(flow.includes("qa.get('pass') is True"));
 assert(flow.includes("review_required"));
 assert(flow.includes("xserver_staging_performed"));
 assert(flow.includes("published"));
 assert(flow.includes("if: always()"));
 assert(operator.includes("preserveRejectedCandidate('OFFLINE_RERENDER_VISUAL_QC_REJECTED')"));
 assert(operator.includes("preserveRejectedCandidate('OFFLINE_RERENDER_EXCEPTION')"));
 assert(flow.includes('actions/upload-artifact@v4'));
});

test('source depth mask leaves person and base pixel positions while preserving original logo',()=>{
 assert(depth.includes('radius=5.8'));
 assert(depth.includes('radius=10.5'));
 assert(depth.includes('result.getpixel(xy) != im.getpixel(xy)'));
 assert(depth.includes('source_geometry_repainted":False'));
 assert(depth.includes('image_generation_api_calls":0'));
 assert(depth.includes('Image.composite(im,base,protect)'));
});
