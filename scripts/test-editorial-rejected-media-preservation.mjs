import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const operator=fs.readFileSync('scripts/auto-editorial-hybrid-image.mjs','utf8');
const overlay=fs.readFileSync('scripts/render-hybrid-editorial-overlay.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/auto-editorial-hybrid-images.yml','utf8');
const job=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/personal-gym-first-session-pain-health-history.json','utf8'));

test('rejected actual image bytes are copied before the operator deletes publicly named assets',()=>{
 const fn=operator.indexOf('function preserveRejectedCandidate(');
 const qc=operator.indexOf("preserveRejectedCandidate('INDEPENDENT_VISUAL_QC_REJECTED')");
 const clean=operator.indexOf('// Never leave a rejected image where a later commit step can accidentally stage it.');
 assert(fn>0&&qc>fn&&clean>qc);
 const exception=operator.indexOf("preserveRejectedCandidate('GENERATION_OR_OVERLAY_EXCEPTION')");
 const catchClean=operator.indexOf('for (const p of [job.generated_scene_path, job.thumbnail, job.og_image, job.gbp_image].filter(Boolean)) {',exception);
 assert(exception>0&&catchClean>exception);
 assert(operator.includes(".operator-rejected-evidence"));
 assert(operator.includes('fs.copyFileSync(abs,dest)'));
 assert(operator.includes("job.generated_scene_path,job.thumbnail,job.og_image,job.gbp_image"));
 assert(operator.includes("approved_for_publishing:false"));
 assert(operator.includes("original_media_retained_only_in_quarantine:true"));
});

test('GitHub rejected artifact contains actual quarantined media but is never included in production manifests',()=>{
 const evidence=workflow.indexOf('Preserve rejected actual images for cost-free review and repair');
 const preserve=workflow.indexOf('find .operator-rejected-evidence -type f -print >> .rejected-paths');
 const upload=workflow.indexOf('name: editorial-rejected-image-evidence-');
 const stage=workflow.indexOf('- name: Stage READY image assets to Xserver');
 assert(evidence>0&&preserve>evidence&&upload>preserve&&stage>upload);
 assert(workflow.includes("steps.generate.outputs.failed == '1'"));
 assert(workflow.includes("if: steps.select.outputs.has_pending == 'true' && steps.generate.outputs.failed == '0'"));
 assert(!workflow.slice(stage).includes('.operator-rejected-evidence'));
 assert(!workflow.slice(workflow.indexOf('- name: Commit operator output to main'),stage).includes('.operator-rejected-evidence'));
});

test('portrait GBP fades actual photo alpha without white translucent board and leaves all other formats unchanged',()=>{
 assert.equal(job.gbp_fade_variant,'portrait-safe-mask-v1');
 assert(overlay.includes("gbp && job.gbp_fade_variant === 'portrait-safe-mask-v1'"));
 assert(overlay.includes("paperBackground = portraitSafeGbp"));
 assert(overlay.includes("? 'transparent'"));
 assert(overlay.includes("-webkit-mask-image:"));
 assert(overlay.includes("mask-image:"));
 assert(overlay.includes("const sceneCss = portraitSafeGbp"));
 assert(overlay.includes(': gbp'));
 assert(overlay.includes('humanFirstLayout'));
 assert(overlay.includes('thumbnail-golden-typography'));
 assert.equal(job.policy.publish_boundary,'REVIEW_AND_PUBLISH');
 assert.equal(job.max_generation_attempts,1);
});
