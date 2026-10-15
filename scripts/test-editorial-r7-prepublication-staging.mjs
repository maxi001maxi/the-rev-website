import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const script=fs.readFileSync('scripts/stage-verified-editorial-r7-candidate.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/editorial-r7-prepublication-staging.yml','utf8');

test('staging is tied to exact independently approved R7 run, SHA hashes and real THE REV source',()=>{
 assert(script.includes('const RUN_ID=38677888686;'));
 const fixed=Object.fromEntries([...script.matchAll(/'([^']+\\.(?:jpg|png|json))':'([a-f0-9]+)'/g)].map(x=>[x[1],x[2]]));
 assert.equal(Object.keys(fixed).length,6);
 for(const [name,sha] of Object.entries(fixed))assert.equal(sha.length,64,'SHA256 must be 64 hex chars: '+name);
 assert.equal(fixed['gbp_image.jpg'],'b9663c392be7e849c35e2321479d6cbaae3c8050204983b4d3c3ad5888407505');
 assert(script.includes("const VERSION='reference-v26-grounded-lobbysp-20261015-pain-r7-depth-portrait-offline';"));
 assert(script.includes("const SOURCE_SHA='ca64249d26efba5cf664c955ce7e00e9280e72c29bfb148e74ba59296e408662';"));
 assert(script.includes("qa.pass===true"));
 assert(script.includes("qa.scene_grounding?.pass===true"));
 assert(script.includes("qa.gbp_safe_area_pass===true"));
 assert(script.includes("qa.visual_art_direction?.pass===true"));
 assert(script.includes("qa.thumbnail_typography_acceptance?.pass===true"));
 assert(script.includes("exception?.allowed===true && exception.scene_repeated===false"));
 assert(script.includes("qa.scene_grounding.asset_hashes[key]===FILE_SHA[name]"));
 assert(script.includes("qa.background_secondary_pass===true && qa.background_soft_blur_pass===true"));
 assert(script.includes("digest(source)===SOURCE_SHA"));
 assert(!script.includes("qa.pass=true"));
});

test('release is images-only, still requires owner approval, and does not change canonical article job',()=>{
 assert(script.includes("actual_blog_published:false,gbp_posted:false"));
 assert(script.includes("canonical_job_modified:false,reviewed_by_owner:false"));
 assert(script.includes("approval_boundary:'OWNER_APPROVAL_REQUIRED_BEFORE_ANY_ARTICLE_OR_GBP_PUBLICATION'"));
 assert(script.includes("status:'IMAGE_ASSETS_PREPARED_FOR_XSERVER_VERIFICATION'"));
 assert(workflow.includes("R7_QC_RUN: '38677888686'"));
 assert(workflow.includes('editorial-20261015-portrait-r7-review-38677888686'));
 assert(workflow.includes('git add -- "$file"'));
 assert(workflow.includes('Stage only the three R7 JPEGs'));
 assert(workflow.includes('Verify Xserver image SHA256 exact byte match'));
 assert(workflow.includes("j.status='XSERVER_BYTE_VERIFIED_OWNER_REVIEW_PENDING'"));
 assert(workflow.includes('reviewed_by_owner!==false'));
 assert(!workflow.includes('publish-blog'));
 assert(!workflow.includes('post-to-gbp'));
 assert(!workflow.includes('curl --request POST'));
 assert(!workflow.includes('OPENAI_API_KEY'));
 assert(!workflow.includes('image_generation'));
});

test('no artifact or unrecognized SHA is a hard failure before writing an image',()=>{
 const p=spawnSync(process.execPath,['scripts/stage-verified-editorial-r7-candidate.mjs','no-real-artifact-here'],{encoding:'utf8'});
 assert.notEqual(p.status,0);
 assert.match(p.stderr,/ENOENT|R7_PREPUBLICATION_BLOCKED/);
});

test('all other production pipelines remain untouched by R7 staging action',()=>{
 assert(workflow.includes("paths:\n      - '.github/workflows/editorial-r7-prepublication-staging.yml'"));
 assert(workflow.includes("GH_TOKEN: ${{ github.token }}"));
 assert(workflow.includes("XSERVER_FTP_USER: ${{ secrets.XSERVER_FTP_USER }}"));
 assert(workflow.includes('contents: write'));
 assert(workflow.includes('actions: read'));
 const regular=fs.readFileSync('.github/workflows/auto-editorial-hybrid-images.yml','utf8');
 assert(regular.includes("name: Auto Editorial Hybrid Images"));
 assert(regular.includes("Fail closed if any operator job was rejected"));
});
