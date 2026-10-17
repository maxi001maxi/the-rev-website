#!/usr/bin/env node
// Offline, NO CREDENTIAL, NO PUBLISH check for owner-approved 2026-10-18 editorial draft.
// This is NOT the authenticated production /api/admin/publish-preview and NOT the
// paid independent Editorial text QC. Fail closed on missing actual repo artifacts.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateDraftForPublish, buildBlogMarkdown } from '../lib/blogMarkdown.mjs';
import { hybridQaReady } from '../lib/editorialHybridImageFormat.mjs';
import { evaluateEditorialImageReview } from '../lib/editorialImageReviewGate.mjs';

const root='editorial/prepublication/2026-10-18-contract-checklist';
const source=fs.readFileSync(root+'/ARTICLE_DRAFT.md','utf8');
const title=source.split('\n')[0].replace(/^#\s*/, '').trim();
const articleStart=source.indexOf('\n\n',source.indexOf('> **未公開'));
if(articleStart<0)throw Error('Source editorial header missing');
const body=source.slice(articleStart+2).trim();
const job=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/personal-gym-trial-three-checks.json','utf8'));
const state=JSON.parse(fs.readFileSync('editorial/image-operator-state/personal-gym-trial-three-checks.json','utf8'));
const qa=JSON.parse(fs.readFileSync(job.qa_report_path,'utf8'));
const assetVersion=job.asset_version;
const resultPath=root+'/OFFLINE_STATIC_PREFLIGHT.json';
const checks=[];
const add=(id,pass,detail='')=>checks.push({id,pass:pass===true,detail});
const livePaths=['thumbnail','og_image','gbp_image'].map(k=>({type:k,path:job[k]}));
const draft={
  title,slug:job.slug,description:'パーソナルジムの体験前に、料金・予約・退会の3つを気軽に確認。THE REV.の料金表と規約を例に、通い始める前の疑問を整理します。',
  published:'2026-10-18',updated:'2026-10-18',category:'gym-guide',
  author:'THE REV. CONDITIONING LAB.',author_role:'編集部',
  thumbnail:'/'+job.thumbnail,og_image:'/'+job.og_image,gbp_image:'/'+job.gbp_image,
  status:'draft',cta_type:'personal-training',keywords:['パーソナルジム 契約前 確認すること','パーソナルジム 体験前 料金 予約 退会'],noindex:false,
  body_markdown:body,editorial_source:'the-rev-editorial-ai',editorial_content_id:'BLOG-20261018-082d82',
  image_status:'READY',image_asset_ready:true,image_style_template:job.image_style_template,
  image_render_version:job.render_version,image_strategy:job.image_strategy,image_asset_version:assetVersion,
  image_headline_short:job.image_headline_short,image_qa_report_path:job.qa_report_path,
  image_qa:qa,gbp_image_status:'READY',gbp_image_asset_version:assetVersion
};
const errs=validateDraftForPublish(draft);
add('production_validateDraftForPublish',errs.length===0,errs.join('; '));
const review=evaluateEditorialImageReview({draft,qa});
add('production_evaluateEditorialImageReview',review.ok,review.errors.join('; '));
add('production_hybridQaReady',hybridQaReady(draft));
add('image_operator_xserver_verified',state.xserver_verified===true&&state.asset_version===assetVersion);
add('qa_image_model_pass',qa.pass===true&&qa.asset_version===assetVersion);
for(const {type,path} of livePaths)add('repo_'+type+'_exists',Boolean(path&&fs.existsSync(path)),path||'missing');
add('owner_approved_short_copy',/3つ/.test(title)&&body.includes('12月末')&&body.includes('ジムによって料金')&&body.includes('## 3.'));
add('anonymous_public_author',draft.author==='THE REV. CONDITIONING LAB.'&&!body.includes('服部 真騎士'));
add('not_already_published_in_repo',!fs.existsSync('content/blog/'+draft.slug+'.md'));
const markdown=buildBlogMarkdown(draft);
add('generated_front_matter_valid',markdown.startsWith('---\n')&&markdown.includes('status: "published"')&&markdown.includes(draft.thumbnail));
const report={
  status:checks.every(x=>x.pass)?'OFFLINE_STATIC_READY':'OFFLINE_STATIC_BLOCKED',
  source_sha256:crypto.createHash('sha256').update(source).digest('hex'),
  content_id:draft.editorial_content_id,slug:draft.slug,image_asset_version:assetVersion,
  intended_public_url:'https://therev-lab.com/blog/'+draft.slug+'/',
  checked_at:new Date().toISOString(),
  checks,
  explicit_exclusions:{
    actual_authenticated_production_preflight_not_performed:true,
    independent_editorial_text_qc_pass_not_observed:true,
    admin_domain_tls_not_verified:true,
    actual_human_publisher_permission_not_verified:true,
    real_time_xserver_bytes_not_rechecked_in_this_script:true,
    blog_published:false,
    gbp_posted:false
  }
};
fs.writeFileSync(resultPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,passes:checks.filter(x=>x.pass).length,total:checks.length,failures:checks.filter(x=>!x.pass)}));
if(report.status!=='OFFLINE_STATIC_READY')process.exitCode=1;
