import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  normalizeExperimentReports,
  syncGa4ExperimentCapture
} from '../lib/ga4ExperimentCapture.mjs';

const html = fs.readFileSync('price.html','utf8');
assert.match(
  html,
  /id="cat-trial" data-track-section="pricing_trial" data-experiment-id="REV-EXP-2026-001" data-experiment-variant="control" data-experiment-surface="pricing_trial"/
);
assert.match(html,/各 ¥3,300（税込）／入会金不要。予約枠はいずれも60分です。最新の内容は予約画面でご確認ください。/);
assert.match(
  html,
  /utm_content=pricing_trial" data-track="reserve_click" data-placement="pricing_trial"/
);

const main = fs.readFileSync('assets/js/main.js','utf8');
const tracking = main.slice(
  main.indexOf("  var TRACK_EVENT_VERSION"),
  main.indexOf('  /* ---------- 起動')
);

function runtime({path='/price.html',surface=true,observer=true}={}) {
  const callbacks=[], listeners={}, dataLayer=[];
  const target={
    dataset:{
      trackSection:'pricing_trial',
      experimentId:'REV-EXP-2026-001',
      experimentVariant:'control',
      experimentSurface:'pricing_trial'
    }
  };
  const window={location:{pathname:path,hostname:'therev-lab.com'},dataLayer};
  function IO(cb,opts){
    callbacks.push({cb,opts});
    this.observe=()=>{};
    this.unobserve=()=>{};
  }
  if(observer) window.IntersectionObserver=IO;
  const document={
    documentElement:{getAttribute:()=>null},
    querySelector:s=>s.startsWith('#cat-trial')&&surface?target:null,
    addEventListener:(name,cb)=>{listeners[name]=cb;}
  };
  const ctx={window,document,IntersectionObserver:IO,Map};
  vm.createContext(ctx);
  vm.runInContext(tracking+'\ninitTrackingDataLayer();',ctx);
  return {callbacks,listeners,dataLayer,target};
}

const r=runtime();
assert.equal(r.dataLayer.length,0);
assert.equal(JSON.stringify(r.callbacks[0].opts.threshold),"[0.25]");
const fire=ratio=>r.callbacks[0].cb([
  {target:r.target,isIntersecting:true,intersectionRatio:ratio}
]);
fire(.249);
assert.equal(r.dataLayer.length,0);
fire(.25);
fire(0);
fire(1);
assert.equal(r.dataLayer.length,1);
assert.equal(r.dataLayer[0].event,'section_view');
assert.equal(r.dataLayer[0].section_id,'pricing_trial');
assert.equal(r.dataLayer[0].experiment_id,'REV-EXP-2026-001');
assert.equal(r.dataLayer[0].experiment_variant,'control');
assert.equal(r.dataLayer[0].experiment_surface,'pricing_trial');

assert.equal(runtime({path:'/trainer.html'}).dataLayer.length,0);
assert.equal(runtime({surface:false}).dataLayer.length,0);
assert.equal(runtime({observer:false}).dataLayer.length,0);

const link={
  dataset:{track:'reserve_click',placement:'pricing_trial'},
  href:'https://cl.gyms.jp/t/CC2237480443/?utm_content=pricing_trial',
  hostname:'cl.gyms.jp',
  textContent:'初回体験を予約する'
};
r.listeners.click({target:{closest:()=>link}});
assert.equal(r.dataLayer.at(-1).event,'reserve_click');
assert.equal(r.dataLayer.at(-1).placement,'pricing_trial');
assert.equal(r.dataLayer.at(-1).experiment_id,undefined);

for(const eventName of ['line_click','price_click','article_cta_click']){
  link.dataset={track:eventName,placement:'test'};
  link.href='/price.html';
  link.hostname='therev-lab.com';
  r.listeners.click({target:{closest:()=>link}});
  assert.equal(r.dataLayer.at(-1).event,eventName);
}

const report=names=>({
  metricHeaders:names.map(name=>({name})),
  metadata:{timeZone:'Asia/Tokyo'},
  rows:[]
});
const input={
  exposure:report(['sessions','eventCount']),
  reserve:report(['eventCount']),
  startDate:'2026-10-07',
  endDate:'2026-10-08',
  today:'2026-10-08'
};
let rows=normalizeExperimentReports(input);
assert.equal(rows[0].eligible_sessions,0);
assert.equal(rows[0].reserve_click,0);
assert.equal(rows[1].eligible_sessions,null);
assert.equal(rows[1].data_status,'DELAYED');

input.exposure.rows=[{
  dimensionValues:[{value:'20261007'}],
  metricValues:[{value:'2'},{value:'5'}]
}];
input.reserve.rows=[{
  dimensionValues:[{value:'20261007'}],
  metricValues:[{value:'1'}]
}];
rows=normalizeExperimentReports(input);
assert.equal(rows[0].eligible_sessions,2);
assert.equal(rows[0].exposure_event_count,5);
assert.equal(rows[0].reserve_click,1);
assert.throws(
  ()=>normalizeExperimentReports({...input,exposure:{...input.exposure,metadata:{subjectToThresholding:true}}}),
  /INCOMPLETE/
);
assert.throws(
  ()=>normalizeExperimentReports({...input,exposure:{...input.exposure,metricHeaders:[{name:'eventCount'},{name:'sessions'}]}}),
  /HEADERS/
);
assert.equal((await syncGa4ExperimentCapture({config:null})).status,'NOT_STARTED');

const exp=fs.readFileSync('lib/ga4ExperimentCapture.mjs','utf8');
assert.match(exp,/exposureEvent: 'section_view'/);
assert.doesNotMatch(exp,/customEvent:/);
const migration=fs.readFileSync('supabase/migrations/20261007072053_rev_exp_control_capture.sql','utf8');
assert.match(migration,/create table if not exists public\.company_os_experiment_daily_metrics/);

console.log(
  'Control Capture PASS: existing section_view; #cat-trial 25% once; GTM unchanged; P0 preserved; sessions != eventCount; UNKNOWN != ZERO; today DELAYED'
);
