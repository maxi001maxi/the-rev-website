// Read-only Oct18 Canonical Publish Preflight, actor=automation.
// Uses PRODUCTION lib/publishFlow.mjs, GitHub API and public Xserver bytes.
// The Supabase article input is reconstructed from owner-approved source + verified
// image job, NOT read from the production database; authenticated UI not tested.
// No Publishing, no DB updates and no GBP actions.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {runPreflight} from '../lib/publishFlow.mjs';
const root='editorial/prepublication/2026-10-18-contract-checklist';
const name=root+'/CANONICAL_PREFLIGHT_AUTOMATION.json';
const sha=s=>createHash('sha256').update(s).digest('hex');
const source=fs.readFileSync(root+'/ARTICLE_DRAFT.md','utf8');
const qc=JSON.parse(fs.readFileSync(root+'/FINAL_QC_RESULT.json','utf8'));
const off=JSON.parse(fs.readFileSync(root+'/OFFLINE_STATIC_PREFLIGHT.json','utf8'));
const job=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/personal-gym-trial-three-checks.json','utf8'));
const imageQa=JSON.parse(fs.readFileSync(job.qa_report_path,'utf8'));
const operator=JSON.parse(fs.readFileSync('editorial/image-operator-state/personal-gym-trial-three-checks.json','utf8'));
const articleId='2519f5a1-2ed9-4397-8a85-153354b4421a',contentId='BLOG-20261018-082d82';
const title=source.split('\n')[0].replace(/^#\s*/,'').trim();
const i=source.indexOf('\n\n',source.indexOf('> **未公開'));
const body=i>=0?source.slice(i+2).trim():'';
const evidenceValid=qc.pass===true&&qc.issue_count===0&&!qc.error&&qc.source_sha256===sha(source)
  &&off.status==='OFFLINE_STATIC_READY'&&off.source_sha256===sha(source)
  &&imageQa.pass===true&&imageQa.asset_version===job.asset_version
  &&operator.xserver_verified===true&&operator.asset_version===job.asset_version;
if(!evidenceValid)throw Error('Approved source or model/image evidence not current: fail-closed');
const draft={
 id:articleId,title,slug:job.slug,description:'パーソナルジムの体験前に、料金・予約・退会の3つを気軽に確認。THE REV.の料金表と規約を例に、通い始める前の疑問を整理します。',
 published:'2026-10-18',updated:'2026-10-18',category:'gym-guide',category_label:'GYM GUIDE',
 author:'THE REV. CONDITIONING LAB.',author_role:'編集部',status:'draft',
 thumbnail:'/'+job.thumbnail,og_image:'/'+job.og_image,gbp_image:'/'+job.gbp_image,
 cta_type:'personal-training',keywords:['パーソナルジム 契約前 確認すること','パーソナルジム 体験前 料金 予約 退会'],
 featured:false,noindex:false,body_markdown:body,
 editorial_source:'the-rev-editorial-ai',editorial_content_id:contentId,
 image_status:'READY',image_asset_ready:true,image_style_template:'rev-column-reference-v2',
 image_render_version:'rev-column-reference-v2.3-hybrid',
 image_strategy:'reference-v2-gpt-image-hybrid-drive-source',
 image_asset_version:job.asset_version,image_headline_short:'体験前に、\n3つだけ。',
 image_job_path:'editorial/hybrid-image-jobs/personal-gym-trial-three-checks.json',
 image_qa_report_path:job.qa_report_path,image_qa:imageQa,
 gbp_image_status:'READY',gbp_image_qa:imageQa,gbp_image_asset_version:job.asset_version,
 source_path:null,source_sha:null,publish_status:'NOT_PUBLISHED',published_url:null
};
const db={from(table){if(table!=='admin_article_drafts')throw Error('Unexpected DB table request');
 return {select(s){if(s!=='*')throw Error('Unexpected DB column set');return this},
 eq(k,v){if(k!=='id'||v!==articleId)throw Error('Unexpected draft lookup');return this},
 async maybeSingle(){return {data:draft,error:null}}};
}};
let pre;
try{pre=await runPreflight({supabase:db,user:null,articleId,actor:'automation'})}
catch(e){pre={ok:false,blocker:{code:'PREVIEW_EXCEPTION',message:String(e)},checks:[]}}
const report={
 schema:'the-rev-owner-oct18-readonly-canonical-preflight-v1',
 checked_at:new Date().toISOString(),article_id:articleId,content_id:contentId,
 verified_input_sha256:sha(source),verified_image_asset_version:job.asset_version,
 publish_executed:false,gbp_posted:false,
 evidence_current:evidenceValid,
 canonical_preflight_ok:pre.ok===true,
 checks:pre.checks||[],blocker:pre.blocker,
 public_url:pre.publicUrl,
 target_path:pre.targetPath,
 github_context:pre.github?.repo,
 limitations:{
   authenticated_human_preflight_not_run:true,
   actual_publisher_ui_session_not_checked:true,
   database_draft_reconstructed_from_verified_owner_source:true,
   actual_production_article_user_id_not_read:true,
   admin_domain_ssl_unchanged:true
 }
};
fs.writeFileSync(name,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.canonical_preflight_ok,checks:report.checks,blocker:report.blocker}).slice(0,6000));
