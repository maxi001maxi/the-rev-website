// Read-only real-data replay through candidate canonical Preflight. The Draft
// snapshot is Supabase read-only evidence, not a substitute for a live Admin session.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {runPreflight} from '../lib/publishFlow.mjs';
import {getFile,putFile} from '../lib/githubContent.mjs';
const root='editorial/production-recovery/2026-10-20';
const snapshot=fs.readFileSync(root+'/REAL_DATA_BASELINE.json');
const article=JSON.parse(snapshot).draft;
if(article.editorial_source!=='the-rev-editorial-ai'||article.editorial_content_id!=='BLOG-20261021-4ac8fd')throw new Error('SNAPSHOT_EDITORIAL_IDENTITY_MISSING');
const branch=process.env.GITHUB_BRANCH;
process.env.GITHUB_BRANCH='main';
const preflight=await runPreflight({supabase:{from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:article,error:null})})},articleId:article.id,actor:'automation'});
const assets=[];
for(const [kind,p] of [['thumbnail',article.thumbnail],['og',article.og_image],['gbp',article.gbp_image]]){
 if(!/^\/assets\/images\/[a-zA-Z0-9/._-]+$/.test(p||''))throw new Error('UNSAFE_ASSET_PATH');
 let row={kind,path:p,github_exists:false,live_status:null,live_content_type:null,live_sha256:null};
 try{const file=await getFile(p.slice(1));row.github_exists=file.exists;row.github_sha256=file.sha256||null;const res=await fetch('https://therev-lab.com'+p,{cache:'no-store',signal:AbortSignal.timeout(15000)});row.live_status=res.status;row.live_content_type=res.headers.get('content-type');const bytes=Buffer.from(await res.arrayBuffer());row.live_bytes=bytes.length;row.live_sha256=createHash('sha256').update(bytes).digest('hex');row.matches=Boolean(res.ok&&row.live_content_type?.startsWith('image/')&&file.sha256&&file.sha256===row.live_sha256);}catch(e){row.error=String(e.message).slice(0,180);row.matches=false;}
 assets.push(row);
}
process.env.GITHUB_BRANCH=branch;
const report={scope:'CANDIDATE_CODE_REAL_DATA_CHECK',measured_at:new Date().toISOString(),content_id:article.editorial_content_id,draft_id:article.id,supabase_snapshot_sha256:createHash('sha256').update(snapshot).digest('hex'),snapshot_read_only:true,preflight:{ok:preflight.ok,checks:preflight.checks,blocker:preflight.blocker},assets,authenticated_console_verified:false,production_db_changed:false,xserver_written:false,ready_for_owner_publish:false,published:false};
const p=root+'/REAL_DATA_PREFLIGHT.json';
if(preflight.ok||!preflight.checks.some(x=>x.id==='independent_text_qc'&&x.status==='error'))throw new Error('REAL_DATA_REGRESSION_UNEXPECTED_PASS');fs.writeFileSync(p,JSON.stringify(report,null,2)+'\n');
const prior=await getFile(p);await putFile({path:p,sha:prior.exists?prior.sha:null,content:JSON.stringify(report,null,2)+'\n',message:'Record read-only Oct21 GitHub and production image probe'});
console.log(JSON.stringify({preflight_ok:preflight.ok,assets:assets.map(x=>({kind:x.kind,github_exists:x.github_exists,live_status:x.live_status,matches:x.matches})),authenticated_console_verified:false}));
