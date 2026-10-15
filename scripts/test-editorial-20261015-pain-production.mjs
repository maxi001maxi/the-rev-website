import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {semanticSimilarity,SCENE_ONTOLOGY,articleSceneIntent} from '../lib/editorialSceneGrounding.mjs';
import {HYBRID_IMAGE_FORMAT,hybridAssetPaths} from '../lib/editorialHybridImageFormat.mjs';
import {validateImageHeadlineShort,imageHeadlineIsRecentRepeat} from '../lib/editorialImageCopy.mjs';

const slug='personal-gym-first-session-pain-health-history';
const job=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/'+slug+'.json','utf8'));
const registry=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json','utf8'));
const fileHash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('today article is restored to the actual GitHub production auto operator, one paid attempt',()=>{
 assert.equal(job.slug,slug);
 assert.match(job.article_title,/痛みや体調/);
 assert.equal(job.automation.mode,'unattended-github-actions-v1');
 assert.equal(job.asset_version,'reference-v26-grounded-lobbysp-20261015-pain-r4');
 assert.equal(job.max_generation_attempts,1);
 assert.equal(job.automation.require_complete_semantic_preflight,true);
 assert.equal(job.automation.recent_semantic_articles.filter(x=>!x.scene_fingerprint).length,0);
 assert.equal(job.publish_requires_human_approval,true);
 assert.equal(job.policy.publish_boundary,'REVIEW_AND_PUBLISH');
 const workflow=fs.readFileSync('.github/workflows/auto-editorial-hybrid-images.yml','utf8');
 assert.match(workflow,/editorial\/hybrid-image-jobs\/\*\*\.json/);
 assert.match(workflow,/node scripts\/auto-editorial-hybrid-image.mjs "\$job"/);
 assert.match(workflow,/Stage READY image assets to Xserver/);
 assert.match(workflow,/Verify Xserver assets are byte-identical/);
});

test('real THE REV reception source has independently registered SHA and allowed action',()=>{
 const source=registry.sources.find(x=>x.source_id===job.automation.selected_source_id);
 assert(source);
 assert.equal(source.source_id,'the-rev-lobby-sp-20260927');
 assert.equal(job.automation.source_repo_path,source.repo_path);
 assert.equal(job.background_source.drive_file_id,source.drive_file_id);
 assert.equal(job.scene_plan.source_sha256,fileHash(source.repo_path));
 assert.equal(job.source_scene_inventory.source_sha256,fileHash(source.repo_path));
 assert.equal(job.scene_plan.location_type,'reception');
 assert.equal(job.scene_plan.human_action,'prepare');
 assert.equal(job.scene_plan.article_intent,'health_before_start');
 assert.equal(articleSceneIntent({title:job.article_title}),job.scene_plan.article_intent);
 assert.equal(articleSceneIntent({title:'運動前のストレッチは何分？'}),'training_start');
 assert.equal(articleSceneIntent({title:'パーソナルジムの体験はどれを選ぶ？'}),'facility_selection');
 assert.equal(job.scene_plan.composition_type,'medium_side_portrait');
 assert.equal(job.scene_plan.subject_zone,source.scene_inventory.subject_zone);
 assert(source.scene_inventory.allowed_generated_actions.includes(job.scene_plan.human_action));
 assert(source.scene_inventory.suitable_article_intents.includes(job.scene_plan.article_intent));
 for(const [key,value] of Object.entries(job.scene_plan)){
   if(SCENE_ONTOLOGY[key])assert(SCENE_ONTOLOGY[key].includes(value));
 }
 assert.equal(semanticSimilarity(job.scene_plan,job.automation.recent_semantic_articles).pass,true);
});

test('no stranger-trainer, fake room, medical acting, or unchecked person count',()=>{
 assert.equal(job.generated_customer_count,1);
 assert.equal(job.customer_presentation,'female');
 assert.equal(job.policy.trainer_present_forbidden,true);
 assert.equal(job.policy.unknown_trainer_forbidden,true);
 assert.equal(job.policy.non_customer_people_forbidden,true);
 assert.equal(job.policy.real_the_rev_background_required,true);
 assert.equal(job.policy.generated_customer_required,true);
 assert.match(job.scene_plan.article_specific_directive,/NO trainer/);
 assert.match(job.scene_plan.article_specific_directive,/exactly one/i);
 assert.match(job.scene_plan.article_specific_directive,/ABSOLUTE REAL-ROOM ANCHOR/);
 assert.match(job.scene_plan.article_specific_directive,/rear_training_area/);
 assert.match(job.scene_plan.article_specific_directive,/NO paper/);
});

test('new file paths for all three required formats, copy and original failed QC remain independent',()=>{
 assert.equal(validateImageHeadlineShort(job.image_headline_short).ok,true);
 assert.equal(imageHeadlineIsRecentRepeat(job.image_headline_short,job.automation.recent_thumbnail_headlines),false);
 const p=hybridAssetPaths(slug,job.asset_version);
 assert.equal(job.thumbnail,p.thumbnailRepoPath);
 assert.equal(job.og_image,p.ogRepoPath);
 assert.equal(job.gbp_image,p.gbpRepoPath);
 assert.equal(job.gbp_image_required,true);
 assert.equal(job.gbp_image_width,HYBRID_IMAGE_FORMAT.output.gbp.width);
 assert.equal(job.gbp_image_height,HYBRID_IMAGE_FORMAT.output.gbp.height);
 assert.equal(job.gbp_image_aspect_ratio,'4:3');
 assert.notEqual(job.asset_version,job.automation.repair.previous_asset_version);
 assert(!fs.existsSync(job.qa_report_path),'new QA may only be written by a real generation run');
 assert(!fs.existsSync(job.thumbnail),'new thumbnail may only be written by a real generation run');
 assert(!fs.existsSync(job.og_image),'new OGP may only be written by a real generation run');
 assert(!fs.existsSync(job.gbp_image),'new GBP may only be written by a real generation run');
});
