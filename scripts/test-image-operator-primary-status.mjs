import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { classifyImageOperatorState } from '../lib/editorialImageOperatorRecovery.mjs';
import { checkEditorialImageOperatorState } from '../lib/editorialImage.mjs';
import { detectStuckRows } from '../lib/dailyEditorialCreator.mjs';

test('provider credit block is explicit and does not consume automatic retries', () => {
  const r = classifyImageOperatorState({
    status:'BLOCKED_PROVIDER_CREDITS',
    attempts_total:0,
    max_attempts:2,
    last_error:'HTTP 429'
  });
  assert.equal(r.state,'BLOCKED');
  assert.equal(r.blocking,true);
  assert.equal(r.code,'PROVIDER_CREDITS');
  assert.equal(r.human_action_required,'RESTORE_PROVIDER_CREDITS');
  assert.equal(r.automatic_retry_allowed,false);
  assert.equal(r.attempts_total,0);
});

test('max attempts, QC rejection and operator error are Primary-visible failures', () => {
  for (const [status,code] of [
    ['BLOCKED_MAX_ATTEMPTS','MAX_ATTEMPTS_EXHAUSTED'],
    ['OVERLAY_QC_REJECTED','OVERLAY_QC_REJECTED'],
    ['ERROR','IMAGE_OPERATOR_ERROR']
  ]) {
    const r=classifyImageOperatorState({status,attempts_total:2,max_attempts:2});
    assert.equal(r.state,'FAILED');
    assert.equal(r.blocking,true);
    assert.equal(r.code,code);
    assert.equal(r.human_action_required,'REVIEW_IMAGE_OPERATOR');
  }
});

test('operator state is accepted only for the current asset version', async () => {
  const files = new Map([
    ['editorial/image-operator-state/test-slug.json', JSON.stringify({
      slug:'test-slug',status:'BLOCKED_PROVIDER_CREDITS',attempts_total:0,max_attempts:2,
      job_path:'editorial/hybrid-image-jobs/test-slug.json',asset_version:'asset-v2'
    })],
    ['editorial/hybrid-image-jobs/test-slug.json', JSON.stringify({slug:'test-slug',asset_version:'asset-v2'})]
  ]);
  const getFileFn=async(path)=>files.has(path)?{exists:true,content:files.get(path)}:{exists:false,content:null};
  const current=await checkEditorialImageOperatorState({
    slug:'test-slug',image_asset_version:'asset-v2',image_job_path:'editorial/hybrid-image-jobs/test-slug.json'
  },{getFileFn});
  assert.equal(current.matched,true);
  assert.equal(current.state,'BLOCKED');
  const stale=await checkEditorialImageOperatorState({
    slug:'test-slug',image_asset_version:'asset-v3',image_job_path:'editorial/hybrid-image-jobs/test-slug.json'
  },{getFileFn});
  assert.equal(stale.matched,false);
  assert.equal(stale.reason,'operator_job_asset_version_mismatch');
});

test('canonical stuck detection distinguishes operator blocked and failed from generic image stall', () => {
  const now=new Date('2026-10-05T08:00:00+09:00');
  const rows=[
    {content_id:'blocked',queue_status:'IMAGE_PREPARING',image_status:'BLOCKED',failed_stage:'IMAGE_OPERATOR',updated_at:'2026-10-05T07:59:00+09:00'},
    {content_id:'failed',queue_status:'IMAGE_PREPARING',image_status:'ERROR',failed_stage:'IMAGE_OPERATOR',updated_at:'2026-10-05T07:59:00+09:00'},
    {content_id:'stalled',queue_status:'IMAGE_PREPARING',image_status:'PREPARING',updated_at:'2026-10-05T01:00:00+09:00'}
  ];
  const found=detectStuckRows({rows,now,settings:{daily_editorial_image_stuck_hours:6}});
  assert.deepEqual(found.map(x=>x.reason),['IMAGE_OPERATOR_BLOCKED','IMAGE_OPERATOR_FAILED','IMAGE_STALLED']);
});

test('GAS Primary keeps blocked image pollable, records failure truth and de-dupes notice', () => {
  const source=fs.readFileSync(new URL('../editorial/gas/DailyEditorialImageOperatorStatus_v0.7.2.gs',import.meta.url),'utf8');
  const queue=[{
    __row:2,content_id:'BLOG-X',topic:'Boxing',queue_status:'IMAGE_PREPARING',draft_status:'READY',
    image_status:'PREPARING',failed_stage:'',last_error:''
  }];
  const bridge=[];
  const props={};
  const line=[];
  const response={
    code:200,
    json:{
      ok:true,
      article:{id:'draft-1',slug:'boxing-test',title:'x',image_status:'BLOCKED',image_asset_ready:false},
      readiness:{ready:false,reason:'image_operator_blocked'},
      operator:{
        matched:true,blocking:true,state:'BLOCKED',status:'BLOCKED_PROVIDER_CREDITS',
        code:'PROVIDER_CREDITS',asset_version:'asset-v1',attempts_total:0,max_attempts:2,
        last_error:'HTTP 429 no credits',human_action_required:'RESTORE_PROVIDER_CREDITS'
      },
      review_url:'https://example/review'
    },
    body:''
  };
  const context={
    Date,JSON,String,Number,Boolean,Array,Object,Error,encodeURIComponent,
    v065BridgeSecret_:()=> 'secret',
    v065FetchJson_:()=>response,
    v065Token_:(v)=>String(v??'').trim().toUpperCase(),
    v065UpsertBridgeSheet_:(contentId,patch)=>bridge.push({contentId,...patch}),
    v065CheckImageDirect_:()=>({}),
    v065PollImage_:()=>({}),
    v065LinePushText_:(text)=>{line.push(text);return {status:'SENT'};},
    ss_:()=>({getSheetByName:(name)=>name==='26_DAILY_EDITORIAL_QUEUE'?{data:queue}:null}),
    getObjectsWithRow_:(sh)=>sh.data.map((r,i)=>({...r,__row:i+2})),
    setObjectRow_:(sh,row,patch)=>Object.assign(sh.data[row-2],patch),
    errorText_:(e)=>String(e?.message||e),
    PropertiesService:{getScriptProperties:()=>({
      getProperty:(k)=>props[k]??null,
      setProperty:(k,v)=>{props[k]=String(v);}
    })}
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  const first=context.v065PollImage_();
  assert.equal(first.status,'IMAGE_OPERATOR_BLOCKED');
  assert.equal(queue[0].queue_status,'IMAGE_PREPARING');
  assert.equal(queue[0].image_status,'BLOCKED');
  assert.equal(queue[0].failed_stage,'IMAGE_OPERATOR');
  assert.equal(queue[0].human_action_required,'RESTORE_PROVIDER_CREDITS');
  assert.match(queue[0].last_error,/BLOCKED_PROVIDER_CREDITS/);
  assert.equal(line.length,1);
  const second=context.v065PollImage_();
  assert.equal(second.status,'IMAGE_OPERATOR_BLOCKED');
  assert.equal(line.length,1);
  assert.equal(bridge.at(-1).image_status,'BLOCKED');
});

test('GAS Primary automatically clears old operator marker when state recovers', () => {
  const source=fs.readFileSync(new URL('../editorial/gas/DailyEditorialImageOperatorStatus_v0.7.2.gs',import.meta.url),'utf8');
  const queue=[{
    __row:2,content_id:'BLOG-Y',queue_status:'IMAGE_PREPARING',draft_status:'READY',
    image_status:'BLOCKED',failed_stage:'IMAGE_OPERATOR',last_error:'old',human_action_required:'RESTORE_PROVIDER_CREDITS'
  }];
  const response={code:200,json:{ok:true,article:{id:'d',slug:'s',title:'x',image_status:'PREPARING',image_asset_ready:false},
    readiness:{ready:false,reason:'github_assets_missing'},operator:{matched:true,blocking:false,state:'RUNNING',status:'RUNNING'},review_url:''},body:''};
  const context={
    Date,JSON,String,Number,Boolean,Array,Object,Error,encodeURIComponent,
    v065BridgeSecret_:()=> 'secret',v065FetchJson_:()=>response,v065Token_:(v)=>String(v??'').trim().toUpperCase(),
    v065UpsertBridgeSheet_:()=>{},v065CheckImageDirect_:()=>({}),v065PollImage_:()=>({}),
    ss_:()=>({getSheetByName:(name)=>name==='26_DAILY_EDITORIAL_QUEUE'?{data:queue}:null}),
    getObjectsWithRow_:(sh)=>sh.data.map((r,i)=>({...r,__row:i+2})),
    setObjectRow_:(sh,row,patch)=>Object.assign(sh.data[row-2],patch),
    errorText_:(e)=>String(e?.message||e),
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>null,setProperty:()=>{}})}
  };
  vm.createContext(context);vm.runInContext(source,context);
  const result=context.v065PollImage_();
  assert.equal(result.status,'IMAGE_PREPARING');
  assert.equal(queue[0].image_status,'PREPARING');
  assert.equal(queue[0].failed_stage,'');
  assert.equal(queue[0].human_action_required,'NONE');
  assert.equal(queue[0].last_error,'');
});
