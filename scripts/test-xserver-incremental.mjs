import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEPLOY_MODE, classifyXserverDeploy } from './xserver-deploy-plan.mjs';
import { planAssetDelta } from './xserver-asset-delta.mjs';
import { planBlogDelta } from './xserver-blog-delta.mjs';
import { verifyBlogDeltaLive } from './verify-blog-delta-live.mjs';
import { githubDeployProgressFromJobs } from '../lib/githubContent.mjs';
const before='a'.repeat(40);
test('image-only known base uses exact delta, while unsafe changes stay FULL',()=>{
 const img=['assets/images/blog/new-thumb.jpg'];
 assert.equal(classifyXserverDeploy({changedFiles:img,hasBeforeSha:true}).mode,DEPLOY_MODE.FULL_DELTA);
 assert.equal(classifyXserverDeploy({changedFiles:img,hasBeforeSha:false}).mode,DEPLOY_MODE.FULL);
 assert.equal(classifyXserverDeploy({changedFiles:img,deletedFiles:img,hasBeforeSha:true}).mode,DEPLOY_MODE.FULL);
 assert.equal(classifyXserverDeploy({changedFiles:[...img,'assets/css/blog.css'],hasBeforeSha:true}).mode,DEPLOY_MODE.FULL);
 assert.equal(classifyXserverDeploy({changedFiles:['templates/blog-post.html'],hasBeforeSha:true}).mode,DEPLOY_MODE.FULL);
 assert.equal(classifyXserverDeploy({changedFiles:['content/blog/hello.md'],hasBeforeSha:true}).mode,DEPLOY_MODE.BLOG_FAST);
 assert.equal(classifyXserverDeploy({changedFiles:[...img,'content/blog/hello.md'],hasBeforeSha:true}).mode,DEPLOY_MODE.FULL);
 assert.equal(classifyXserverDeploy({changedFiles:img,eventName:'workflow_dispatch',hasBeforeSha:true}).mode,DEPLOY_MODE.FULL);
 assert.equal(classifyXserverDeploy({changedFiles:['.github/workflows/deploy-xserver.yml','admin/articles/review/index.html','scripts/xserver-blog-delta.mjs','lib/githubContent.mjs'],hasBeforeSha:true}).mode,DEPLOY_MODE.SKIP);
});
test('asset delta requires verified preimage, saves rollback bytes and orders FTPS',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xdelta-')),prev=process.cwd();
 try{
 process.chdir(dir);
 fs.mkdirSync('dist/assets/images/blog',{recursive:true});
 fs.writeFileSync('dist/assets/images/blog/photo.jpg','NEW_IMAGE');
 let r=planAssetDelta({files:['assets/images/blog/photo.jpg'],before,oldBlob:()=>Buffer.from('OLD_IMAGE'),liveBlob:()=>Buffer.from('OLD_IMAGE')});
 assert.equal(r.length,1);assert(fs.readFileSync('delta-backup/assets/images/blog/photo.jpg','utf8')==='OLD_IMAGE');
 assert(fs.readFileSync('.delta-rollback.lftp','utf8').includes('OLD_IMAGE')===false);
 assert(fs.readFileSync('.delta-upload.lftp','utf8').includes('put -O "/assets/images/blog"'));
 assert.throws(()=>planAssetDelta({files:['assets/images/blog/photo.jpg'],before,oldBlob:()=>Buffer.from('OLD_IMAGE'),liveBlob:()=>Buffer.from('MISMATCH')}),/PREIMAGE_MISMATCH/);
 assert.throws(()=>planAssetDelta({files:['assets/css/style.css'],before,oldBlob:()=>null,liveBlob:()=>null}),/DELTA_PATH_UNSAFE/);
 }finally{process.chdir(prev);fs.rmSync(dir,{recursive:true,force:true});}
});
test('pre-staged exact new assets survive resume and rollback without overwrite or deletion',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xdelta-staged-')),prev=process.cwd();
 try{
  process.chdir(dir);fs.mkdirSync('dist/assets/images/blog',{recursive:true});
  const p='assets/images/blog/already-staged.jpg',bytes=Buffer.from('VERIFIED_PIXELS');fs.writeFileSync('dist/'+p,bytes);
  const r=planAssetDelta({files:[p],before,oldBlob:()=>null,liveBlob:()=>bytes});
  assert.equal(r[0].already_staged,true);assert.equal(r[0].old_sha256,r[0].new_sha256);
  assert.equal(fs.readFileSync('.delta-upload.lftp','utf8').trim(),'');
  assert.equal(fs.readFileSync('.delta-rollback.lftp','utf8').trim(),'');
  const bad=Buffer.from(bytes);bad[0]^=1;
  assert.throws(()=>planAssetDelta({files:[p],before,oldBlob:()=>null,liveBlob:()=>bad}),/UNEXPECTED_REMOTE_FILE/);
  assert.throws(()=>planAssetDelta({files:[p],before,oldBlob:()=>Buffer.from('OLD'),liveBlob:()=>bytes}),/PREIMAGE_MISMATCH/);
 }finally{process.chdir(prev);fs.rmSync(dir,{recursive:true,force:true});}
});
test('blog exact delta includes only affected pages and removes stale pages after puts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blogdelta-')),a=path.join(dir,'old'),b=path.join(dir,'new');
 try{
 for(const root of [a,b]){fs.mkdirSync(path.join(root,'topic'),{recursive:true});fs.writeFileSync(path.join(root,'.htaccess'),'cache');fs.writeFileSync(path.join(root,'index.html'),'index');fs.writeFileSync(path.join(root,'topic/index.html'),'old');}
 fs.writeFileSync(path.join(b,'topic/index.html'),'NEW_ARTICLE');
 fs.writeFileSync(path.join(b,'index.html'),'NEW_INDEX');
 const result=planBlogDelta({oldRoot:a,newRoot:b});
 assert.deepEqual(result.changed,['topic/index.html','index.html']);
 assert.deepEqual(result.slugs,['topic']);
 assert(result.commands.some(x=>x==='mkdir -pf "/blog/topic"'));
 assert(result.commands.some(x=>x==='mkdir -pf "/blog/"'));
 assert(!result.commands.some(x=>x.startsWith('mkdir -p ')));
 assert(result.commands.every(x=>!x.startsWith('rm -r ')));
 assert(result.commands.findIndex(x=>x.includes('topic/index.html'))<result.commands.findIndex(x=>x.includes('"deploy/blog/index.html"')));
 fs.mkdirSync(path.join(a,'orphan'),{recursive:true});fs.writeFileSync(path.join(a,'orphan/index.html'),'REMOVED');
 const removed=planBlogDelta({oldRoot:a,newRoot:b});
 assert(removed.deleted.includes('orphan/index.html'));
 assert(removed.commands.at(-2).includes('orphan/index.html'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Github Actions stage progress is grounded in completed and in-progress step states',()=>{
 const output=githubDeployProgressFromJobs([{name:'Build → Deploy → Verify (BLOG_FAST)',status:'in_progress',steps:[
 {name:'Build production files',status:'completed',conclusion:'success'},
 {name:'Build previous Blog snapshot for exact BLOG_FAST delta',status:'completed',conclusion:'success'},
 {name:'Deploy Blog LAST',status:'in_progress',conclusion:null},
 {name:'Verify live production',status:'queued',conclusion:null}
 ]}]);
 assert.equal(output.stage,'upload');assert.equal(output.mode,'BLOG_FAST');assert.equal(output.completedSteps,2);
 assert.equal(output.label,'Deploy Blog LAST');
 assert.equal(githubDeployProgressFromJobs([]).stage,'workflow_queued');
});

test('BLOG_FAST live gate requires exact new bytes and removed pages to be absent',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bloglive-'));
 try{
 fs.mkdirSync(path.join(root,'topic'),{recursive:true});fs.writeFileSync(path.join(root,'topic/index.html'),'NEW');
 let calls=0;
 const fake=async(url)=>{calls++;return String(url).includes('deleted/index.html')?{status:404,ok:false}:{status:200,ok:true,arrayBuffer:async()=>Buffer.from('NEW')};};
 assert.equal(await verifyBlogDeltaLive({changed:['topic/index.html'],deleted:['deleted/index.html']},{root,fetchImpl:fake,attempts:1}),true);
 assert.equal(calls,2);
 await assert.rejects(()=>verifyBlogDeltaLive({changed:['topic/index.html'],deleted:[]},{root,fetchImpl:async()=>({ok:true,status:200,arrayBuffer:async()=>Buffer.from('STALE')}),attempts:1}),/BLOG_DELTA_LIVE_SHA/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
