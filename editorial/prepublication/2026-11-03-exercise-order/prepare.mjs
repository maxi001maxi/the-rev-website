import fs from 'node:fs';import path from 'node:path';
import {normalizeArticleInput} from '../../../lib/supabaseAdmin.mjs';
import {validateBridgeEnvelope} from '../../../lib/editorialBridge.mjs';
import {validateEditorialTextQc} from '../../../lib/editorialProductionRecovery.mjs';
import {evaluateEditorialLength} from '../../../lib/editorialReadiness.mjs';
import {validateEditorialClosingForPublish} from '../../../lib/blogMarkdown.mjs';
const dir='editorial/prepublication/2026-11-03-exercise-order';
const body=JSON.parse(fs.readFileSync(dir+'/ARTICLE.json'));const env={...body,content_id:body.editorial_content_id,week_start:body.editorial_week_start,editorial_status:'READY',fact_check_status:'PASS',topic_gate_decision:'PUBLISH',article_type:'STANDARD'};
const gate=validateBridgeEnvelope(env),normalized=normalizeArticleInput(body),text=validateEditorialTextQc(body.body_markdown,body.editorial_text_qc,{contentId:body.editorial_content_id}),length=evaluateEditorialLength('STANDARD',body.body_markdown),closing=validateEditorialClosingForPublish(body);
if(gate.errors.length||normalized.errors||!text.pass||!length.pass||closing.length)throw Error(JSON.stringify({gate,normalized,text,length,closing}));
// Run unchanged canonical planning with its write boundary redirected to this checkout.
// Reads use the real main branch. No model/provider APIs or CMS writes are invoked.
const original=fs.readFileSync('lib/editorialAutomatedHybridImage.mjs','utf8');const token="'./githubContent.mjs'";if(original.split(token).length!==2)throw Error('Canonical import drift');
fs.writeFileSync('lib/.work-readonly-image-content.mjs',`export {getFile,listDirectory} from './githubContent.mjs';import fs from 'node:fs';import path from 'node:path';export async function putFile({path:p,content}){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content);return {local_only:true};}`);
fs.writeFileSync('lib/.work-image-planner.mjs',original.replace(token,"'./.work-readonly-image-content.mjs'"));
const {prepareAutomatedHybridImageJob}=await import('../../../lib/.work-image-planner.mjs');
const plan=await prepareAutomatedHybridImageJob({...normalized.value,primary_query:body.primary_query,editorial_text_qc:body.editorial_text_qc,image_headline_short:body.image_headline_short,image_category_label:body.image_category_label,image_series_label:body.image_series_label});
const j=JSON.parse(fs.readFileSync(plan.jobPath));j.automation.mode='manual-work-recovery-v1';j.execution={operator:'ChatGPT Work',content_id:body.editorial_content_id,ai_api_calls_allowed:false,qc_mode:'in-conversation',generation_max_calls:0,independent_qc_max_calls:0,owner_qc_method_override:'Owner requests all writing, generation and QC in this ChatGPT Work conversation; no paid AI API; stop at prepublication draft.'};fs.writeFileSync(plan.jobPath,JSON.stringify(j,null,2)+'\n');
fs.copyFileSync(j.automation.source_repo_path,dir+'/SOURCE.jpg');fs.writeFileSync(dir+'/PLAN.json',JSON.stringify({plan,canonical_text_gates:{text,length,closing},external_ai_api_calls:0,job_path:plan.jobPath},null,2)+'\n');console.log(JSON.stringify({source:j.automation.source_repo_path,job:plan.jobPath,asset:j.asset_version,customer:j.customer_presentation,scene:j.scene_plan},null,2));