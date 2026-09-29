import test from 'node:test';
import assert from 'node:assert/strict';
import {metric,unavailable,delta,overallStatus} from '../lib/siteInsights/status.mjs';
import {wizardCtr,ga4Rate,canonicalPath,dateList,ga4Rows} from '../lib/siteInsights/normalize.mjs';
import {searchDaily,searchTotal,searchDimension} from '../lib/siteInsights/providers/search.mjs';
import {blend,blendedLanding} from '../lib/siteInsights/providers/blended.mjs';
import {ga4Dataset} from '../lib/siteInsights/providers/ga4.mjs';
import {clearCache} from '../lib/siteInsights/cache.mjs';
import {insightRules,anomalies} from '../lib/siteInsights/rules.mjs';
import {wizard} from '../lib/siteInsights/providers/wizard.mjs';
import handler from '../api/admin/site-insights.mjs';
import fs from 'node:fs';
const m=v=>metric(v,'count','gsc');
test('status truth: zero is only an observed zero; unavailable never contains a value',()=>{
  assert.deepEqual([m(3).status,m(0).status,m(undefined).status],['VALUE','ZERO','UNKNOWN']);
  for(const status of ['UNKNOWN','NOT_CONFIGURED','DELAYED','ERROR','STALE']) assert.equal(unavailable(status,'count','gsc','test').value,null);
  assert.equal(delta(m(3),m(0)).percent.status,'UNKNOWN');
  assert.equal(delta(m(0),m(0)).absolute.value,0);
  assert.equal(delta(m(3),unavailable('ERROR','count','gsc')).absolute.status,'UNKNOWN');
});
test('partial provider failure preserves the healthy source',()=>{
  assert.equal(overallStatus({search:{status:'ERROR'},ga4:{status:'VALUE'}}),'PARTIAL');
  assert.equal(overallStatus({search:{status:'ZERO'},ga4:{status:'VALUE'}}),'OK');
  assert.equal(overallStatus({search:{status:'ERROR'},ga4:{status:'NOT_CONFIGURED'}}),'UNAVAILABLE');
});
test('GSC percent points and GA4 fraction stay distinct',()=>{
  assert.equal(wizardCtr(2),.02);assert.equal(ga4Rate(.348837),.348837);
  assert.equal(wizardCtr(null),null);assert.equal(ga4Rate(undefined),null);
});
test('complete GSC date rows, missing day zero, weighted position and incomplete pagination',()=>{
  const raw={settledThrough:'2026-09-26',pagination:{hasMore:false},rows:[{keys:['2026-09-25'],clicks:0,impressions:10,position:4},{keys:['2026-09-26'],clicks:5,impressions:90,position:2}]};
  const days=searchDaily(raw,'2026-09-24','2026-09-26');assert.equal(days[0].clicks,0);assert.equal(searchTotal(days).position,2.2);assert.equal(searchTotal(days).ctr,.05);
  assert.throws(()=>searchDaily({...raw,pagination:{hasMore:true}},'2026-09-24','2026-09-26'));
  assert.equal(searchTotal([{clicks:0,impressions:0,position:null}]).ctr,null);
});
test('path join preserves GSC-only and GA4-only and keeps arbitrary hosts out',()=>{
  assert.equal(canonicalPath('https://therev-lab.com//blog/x/?utm=1'),'/blog/x');
  assert.equal(canonicalPath('https://evil.example/blog/x'),null);
  const rows=blend([{key:'/blog/x',clicks:2,impressions:50}], [{path:'/price/',sessions:3}]);
  assert.deepEqual(rows.map(x=>x.sourceFlags),[['gsc'],['ga4']]);
  assert.equal(rows[0].ga4,null);
});
test('query top rows cannot replace site total and CTR semantics remain explicit',()=>{
  const q=searchDimension({rows:[{keys:['training'],clicks:2,impressions:100,ctr:2,position:5}]},'query');assert.equal(q[0].ctr,.02);
  assert.equal(q[0].clicks,2);
  assert.equal(ga4Rows({metricHeaders:[{name:'sessions'}],rows:[{metricValues:[]} ]})[0].metrics.sessions,null);
});
test('low volume anomaly suppression; high material weekday change only',()=>{
  const dates=dateList('2026-07-01','2026-08-10');
  const rows=dates.map((date,i)=>({date,searchClicks:m(i===35?3:1)}));
  assert.equal(anomalies(rows,'searchClicks').length,0);
  rows[35].searchClicks=m(20);assert.equal(anomalies(rows,'searchClicks').length,1);
  rows[28].searchClicks=unavailable('DELAYED','count','gsc');assert.equal(anomalies(rows,'searchClicks').length,0);
});
test('CTA pre-instrumentation and incomplete comparison suppress trend claims',()=>{
  const summary={sessions:{...m(40),previous:m(20)},searchClicks:{...m(30),previous:m(20)},bookingIntent:{...unavailable('NOT_CONFIGURED','count','ga4'),previous:m(0)},lineIntent:unavailable('UNKNOWN','count','ga4')};
  const result=insightRules(summary,28,{ga4:{status:'VALUE'},search:{status:'VALUE'}});
  assert.equal(result.header.ruleId,'H_DATA');assert.ok(result.insights.every(x=>!x.ruleId.startsWith('I_INTENT')));
});
test('incomplete GSC history is UNKNOWN rather than ERROR while observed dates remain usable',()=>{
  const source=fs.readFileSync(new URL('../lib/siteInsights/assemble.mjs',import.meta.url),'utf8');
  assert.match(source,/gcObserved=searchDaily\(get\(gCurrent\),firstObserved,anchor\)/);
  assert.match(source,/unavailable\('UNKNOWN',unit,'gsc','incomplete_history'\)/);
  assert.doesNotMatch(source,/g\?m\(g\.clicks[^\n]+:failure\(gError,'gsc'\)/);
});
test('operator UI identifies connection health and renders traceable insight evidence',()=>{
  const client=fs.readFileSync(new URL('../admin/js/site-insights.mjs',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../admin/css/site-insights.css',import.meta.url),'utf8');
  assert.match(client,/接続状態 \$\{data\.status\}/);
  assert.match(client,/根拠: \$\{changeEvidence\(insight\)\}/);
  assert.match(client,/前期間比/);
  assert.match(css,/overflow-wrap:anywhere/);
});
test('Wizard adapter fixes endpoint, uses key only in header, and parses structured response',async()=>{
  const calls=[];
  const response=(data,session='session')=>({ok:true,status:200,headers:{get:name=>name.toLowerCase()==='content-type'?'application/json':name.toLowerCase()==='mcp-session-id'?session:null},text:async()=>JSON.stringify(data)});
  const fetchImpl=async(url,options)=>{calls.push({url,options});const payload=JSON.parse(options.body);if(payload.method==='initialize')return response({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-03-26'}});if(payload.method==='tools/call')return response({jsonrpc:'2.0',id:2,result:{structuredContent:{rows:[],settledThrough:'2026-09-26'}}});return response({});};
  const result=await wizard('query_search_analytics',{siteUrl:'https://therev-lab.com/'},{fetchImpl,key:'test_secret'});
  assert.equal(result.settledThrough,'2026-09-26');assert.equal(calls.length,3);assert.ok(calls.every(c=>c.url==='https://mcp.gscwizard.com/mcp'));
  assert.ok(calls.every(c=>!c.options.body.includes('test_secret')));
  await assert.rejects(()=>wizard('arbitrary_outbound',{}, {fetchImpl,key:'test_secret'}));
});
test('Wizard is the sole v2 GA4 credential and normalizes overview, CTA and blended raw data',async()=>{
  const originalFetch=globalThis.fetch,oldKey=process.env.GSC_WIZARD_API_KEY,oldProperty=process.env.GA4_PROPERTY_ID,oldService=process.env.GA4_SERVICE_ACCOUNT_JSON;
  delete process.env.GA4_PROPERTY_ID;delete process.env.GA4_SERVICE_ACCOUNT_JSON;process.env.GSC_WIZARD_API_KEY='test_secret';clearCache();
  const reports={
    event:{propertyId:'properties/552679302',timeZone:'Asia/Tokyo',dimension:'event',rows:[{key:'reserve_click',eventCount:2}]},
    page:{propertyId:'properties/552679302',timeZone:'Asia/Tokyo',dimension:'page',rows:[{key:'/price.html',screenPageViews:4,activeUsers:3}]},
    landingPage:{propertyId:'properties/552679302',timeZone:'Asia/Tokyo',dimension:'landingPage',rows:[{key:'/price.html',sessions:2}]},
    sourceMedium:{propertyId:'properties/552679302',timeZone:'Asia/Tokyo',dimension:'sourceMedium',rows:[{key:'google / organic',sessions:2,activeUsers:2}]},
    device:{propertyId:'properties/552679302',timeZone:'Asia/Tokyo',dimension:'device',rows:[{key:'mobile',sessions:2,activeUsers:2}]}
  };
  const overview={propertyId:'properties/552679302',timeZone:'Asia/Tokyo',summary:{sessions:3,activeUsers:2,screenPageViews:4,newUsers:2,engagementRate:.5,bounceRate:.5},timeseries:[{date:'2026-09-29',sessions:3,screenPageViews:4}]};
  const blended={propertyId:'properties/552679302',organicOnly:true,rows:[{key:'/price.html',clicks:1,impressions:20,ctr:5,position:3,sessions:2,activeUsers:2,bounceRate:.5,keyEvents:0,ga4Matched:true}]};
  const response=data=>({ok:true,status:200,headers:{get:name=>name.toLowerCase()==='mcp-session-id'?'session':'application/json'},text:async()=>JSON.stringify(data)});
  globalThis.fetch=async(_url,options)=>{
    const payload=JSON.parse(options.body);
    if(payload.method==='initialize')return response({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-03-26'}});
    if(payload.method==='tools/call'){
      const {name,arguments:a}=payload.params;
      const raw=name==='get_ga4_overview'?overview:name==='query_ga4_report'?reports[a.dimension]:name==='get_blended_landing_pages'?blended:{annotations:[]};
      return response({jsonrpc:'2.0',id:2,result:{content:[{type:'text',text:JSON.stringify(raw)}],structuredContent:{kind:'presentation-only'}}});
    }
    return response({});
  };
  try {
    const range={startDate:'2026-09-29',endDate:'2026-09-29'};
    const ga4=await ga4Dataset(range);assert.equal(ga4.total.sessions,3);assert.equal(ga4.events.reserve_click,2);assert.equal(ga4.pages[0].path,'/price.html');
    const joined=await blendedLanding(range,[{key:'/price.html'}]);assert.equal(joined[0].search.ctr,.05);assert.deepEqual(joined[0].sourceFlags,['gsc','ga4']);
  } finally {
    globalThis.fetch=originalFetch;clearCache();
    if(oldKey===undefined)delete process.env.GSC_WIZARD_API_KEY;else process.env.GSC_WIZARD_API_KEY=oldKey;
    if(oldProperty===undefined)delete process.env.GA4_PROPERTY_ID;else process.env.GA4_PROPERTY_ID=oldProperty;
    if(oldService===undefined)delete process.env.GA4_SERVICE_ACCOUNT_JSON;else process.env.GA4_SERVICE_ACCOUNT_JSON=oldService;
  }
});
test('legacy Analytics shares the Wizard GA4 provider and no longer requires a service account',()=>{
  const api=fs.readFileSync(new URL('../api/admin/analytics.mjs',import.meta.url),'utf8');
  const client=fs.readFileSync(new URL('../admin/js/admin-analytics.mjs',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../admin/analytics/index.html',import.meta.url),'utf8');
  assert.match(api,/ga4Dataset/);
  assert.match(api,/GSC_WIZARD_API_KEY/);
  assert.doesNotMatch(api,/GA4_SERVICE_ACCOUNT_JSON|parseServiceAccount|getServiceAccountAccessToken/);
  assert.doesNotMatch(client,/GA4_PROPERTY_ID|サービスアカウント/);
  assert.match(html,/audience-active/);
  assert.doesNotMatch(html,/audience-returning/);
});
test('canonical API rejects anonymous and invalid methods before any provider call',async()=>{
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='dummy';
  const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
  try {
    const r=response();await handler({method:'GET',headers:{},query:{}},r);
    assert.equal(r.code,401);assert.equal(r.headers['Cache-Control'],'private, no-store, max-age=0');
    assert.ok(!JSON.stringify(r.body).includes('dummy'));
    const r2=response();await handler({method:'POST',headers:{},query:{}},r2);assert.equal(r2.code,405);
  } finally {if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=oldKey;}
});
