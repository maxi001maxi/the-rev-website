import test from 'node:test';
import assert from 'node:assert/strict';
import {guardedPhotoEditPlan,inspectRawProtectedPixels} from '../lib/editorialGuardedPhotoEdit.mjs';
const plan={width:1024,height:1536,edit:{x:560,y:410,width:440,height:1100},meaning:[{x:680,y:500,width:190,height:190},{x:640,y:800,width:270,height:200}],formats:[{name:'thumbnail',width:1200,height:675,photo_width_fraction:.66},{name:'og',width:1200,height:630,photo_width_fraction:.66},{name:'gbp',width:1200,height:900,photo_width_fraction:1}]};
test('same source scene retains face and clock gesture through actual renderer panel crops',()=>{const r=guardedPhotoEditPlan(plan);assert(r.pass);assert.equal(r.visual_qc_pass,false);const bad=structuredClone(plan);bad.meaning[1].y=1450;assert(!guardedPhotoEditPlan(bad).pass);});
test('R9-style escaped subject and clipping cannot become a restored-room PASS',()=>{const before=new Uint8Array(40*40*4),after=before.slice(),edit={x:10,y:5,width:20,height:30};after[(15*40+20)*4]=255;assert(inspectRawProtectedPixels({before,after,width:40,height:40,edit}).pass);after[(15*40+30)*4]=255;const raw=inspectRawProtectedPixels({before,after,width:40,height:40,edit});assert(!raw.pass);assert.equal(raw.reason,'RAW_BACKGROUND_DRIFT');assert.equal(raw.compositor_used,false);after[(15*40+30)*4]=0;after[(5*40+20)*4]=255;assert.equal(inspectRawProtectedPixels({before,after,width:40,height:40,edit}).reason,'SUBJECT_OR_SHADOW_TOUCHES_EDIT_EDGE');assert.throws(()=>inspectRawProtectedPixels({before,after:after.slice(4),width:40,height:40,edit}),/DIMENSIONS/);});

test('real guarded edit path uses one fixed provider response, preserves raw failures and never hard-restores',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const {chromium}=await import('playwright');
 const {editGuardedPhoto}=await import('../lib/editorialGuardedPhotoEdit.mjs');
 const sourcePath='assets/images/photo-evolgear.jpg',dir=fs.mkdtempSync(path.join(os.tmpdir(),'guarded-edit-'));
 const {createHash}=await import('node:crypto');
 const job={layout_variant:'human-first-v1',max_generation_attempts:1,article_title:'Synthetic night training',generated_scene_path:path.join(dir,'raw.png'),v3:{background_lock:'masked_openai_raw_guard_v2',guarded_edit:{...plan,source_sha256:createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')}}};
 const b=await chromium.launch({headless:true,args:['--no-sandbox']});let calls=0;
 try{
  const p=await b.newPage();
  const fixed=escaped=>async payload=>{
    calls++;assert.equal(payload.max_tool_calls,1);assert.equal(payload.tools.length,1);assert.equal(payload.tools[0].model,'gpt-image-1.5');
    const png=await p.evaluate(async({url,escaped})=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);ctx.fillStyle='#ff00ff';ctx.fillRect(escaped?100:700,600,30,30);return c.toDataURL('image/png').split(',')[1];},{url:payload.input[0].content[1].image_url,escaped});
    return {id:'synthetic',output:[{type:'image_generation_call',result:png}]};
  };
  assert.equal(await editGuardedPhoto({job,sourcePath,generateResponse:fixed(false)}),job.generated_scene_path);
  const good=JSON.parse(fs.readFileSync(job.generated_scene_path+'.raw-guard.json'));assert(good.pass);assert.equal(good.visual_qc_pass,false);
  await assert.rejects(()=>editGuardedPhoto({job,sourcePath,generateResponse:fixed(true)}),/RAW_BACKGROUND_DRIFT/);
  const bad=JSON.parse(fs.readFileSync(job.generated_scene_path+'.raw-guard.json'));assert(!bad.pass);assert(bad.changedPixels>0);assert.equal(bad.compositor_used,false);assert.equal(calls,2,'one synthetic provider call per explicitly separate test case, no retries');
  await assert.rejects(()=>editGuardedPhoto({job:{...job,max_generation_attempts:2},sourcePath,generateResponse:()=>{throw Error('must not call');}}),/FREE_PREFLIGHT/);
 }finally{await b.close();fs.rmSync(dir,{recursive:true,force:true});}
});
