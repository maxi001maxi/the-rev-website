import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {directGa4Dataset,directGa4Configured} from '../lib/siteInsights/providers/directGa4.mjs';
import {directGscRaw,directGscAnchor} from '../lib/siteInsights/providers/directGsc.mjs';
import {searchDaily,searchTotal,searchDimension} from '../lib/siteInsights/providers/search.mjs';

const meta=(dimensions,metrics,values)=>({
  dimensionHeaders:dimensions.map(name=>({name})),
  metricHeaders:metrics.map(name=>({name})),
  rowCount:values.length,
  rows:values.map(([keys,nums])=>({
    dimensionValues:keys.map(value=>({value})),
    metricValues:nums.map(value=>({value:String(value)}))
  }))
});
function ga4Fixture(body){
  const dimensions=(body.dimensions||[]).map(x=>x.name);
  const metrics=body.metrics.map(x=>x.name);
  const key=dimensions.join(',');
  if(!key)return meta(dimensions,metrics,[[[],[11,9,22,5,.75,.25]]]);
  const records={
    date:[[['20261014'],[11,22]]],
    eventName:[[['reserve_click'],[3]]],
    pagePath:[[['/price.html'],[7,4]]],
    landingPage:[[['/price.html'],[5]]],
    sessionSourceMedium:[[['google / organic'],[4,3]]],
    deviceCategory:[[['mobile'],[8,7]]]
  };
  assert.ok(key in records,'unexpected GA4 dimensions: '+key);
  return meta(dimensions,metrics,records[key]);
}

test('Site Insights direct GA4 accepts verified reports without Wizard credentials',async()=>{
  assert.equal(directGa4Configured({GA4_PROPERTY_ID:'123',GA4_SERVICE_ACCOUNT_JSON:'dummy'}),true);
  const queries=[];
  const data=await directGa4Dataset({startDate:'2026-10-14',endDate:'2026-10-14'},
    {executeReport:async body=>{queries.push(body);return ga4Fixture(body);}});
  assert.equal(queries.length,7);
  assert.equal(data.provider,'google-analytics-data-api-direct');
  assert.equal(data.total.sessions,11);
  assert.equal(data.events.reserve_click,3);
  assert.equal(data.pages[0].path,'/price.html');
  assert.equal(data.landing[0].sessions,5);
  assert.equal(data.days[0].date,'2026-10-14');
  assert.equal(data.total.engagementRate,.75);
});

test('Direct GA4 rejects partial, thresholded or mismatched data instead of inventing zero',async()=>{
  const range={startDate:'2026-10-14',endDate:'2026-10-14'};
  await assert.rejects(()=>directGa4Dataset(range,{executeReport:async body=>{
    const sample=ga4Fixture(body);
    sample.metadata={subjectToThresholding:true};
    return sample;
  }}),/ga4_incomplete_report/);
  await assert.rejects(()=>directGa4Dataset(range,{executeReport:async body=>{
    const sample=ga4Fixture(body);
    sample.rowCount+=1;
    return sample;
  }}),/ga4_truncated_report/);
});

test('Direct GSC reports actual final aggregate without converting absent days to zero',async()=>{
  const read=async(_start,_end,dimensions)=>{
    if(!dimensions.length)return {rows:[{clicks:4,impressions:80,ctr:.05,position:6}]};
    return {rows:[{keys:['2026-10-14'],clicks:4,impressions:80,ctr:.05,position:6}]};
  };
  const raw=await directGscRaw('2026-10-13','2026-10-14','date',400,{anchor:'2026-10-14',read});
  const days=searchDaily(raw,'2026-10-13','2026-10-14');
  assert.equal(days[0].clicks,null);
  assert.equal(days[0].observed,false);
  assert.equal(days[1].clicks,4);
  assert.equal(searchTotal(days).clicks,4);
  assert.equal(searchTotal(days).ctr,.05);
  const queries=searchDimension({...raw,rows:[{keys:['奈良 ジム'],clicks:4,impressions:80,ctr:.05,position:6}]},'query');
  assert.equal(queries[0].ctr,.05);
});

test('GSC anchor requires a real final observed date, not assumed freshness',async()=>{
  await assert.rejects(()=>directGscAnchor({
    now:new Date('2026-10-17T02:00:00Z'),read:async()=>({rows:[]})
  }),/unsettled/);
});

test('GBP recovery UI uses existing OAuth and never exposes refresh credentials',()=>{
  const server=fs.readFileSync(new URL('../api/admin/google-business.mjs',import.meta.url),'utf8');
  const api=fs.readFileSync(new URL('../admin/js/admin-api.mjs',import.meta.url),'utf8');
  const browser=fs.readFileSync(new URL('../admin/js/google-business.mjs',import.meta.url),'utf8');
  assert.match(server,/handleRediscover/);
  assert.match(server,/rediscoverConnection\(ctx\.user\.id\)/);
  assert.match(api,/rediscoverGoogleBusiness/);
  assert.match(browser,/Google Cloud/);
  assert.match(browser,/店舗情報を再確認/);
  assert.doesNotMatch(browser,/refresh_token|GBP_GOOGLE_CLIENT_SECRET/);
});

test('Site Insights adapter is direct-first and keeps missing sources nonzero',()=>{
  const ga4=fs.readFileSync(new URL('../lib/siteInsights/providers/ga4.mjs',import.meta.url),'utf8');
  const search=fs.readFileSync(new URL('../lib/siteInsights/providers/search.mjs',import.meta.url),'utf8');
  const assemble=fs.readFileSync(new URL('../lib/siteInsights/assemble.mjs',import.meta.url),'utf8');
  assert.match(ga4,/directGa4Configured\(\)/);
  assert.match(search,/directGscConfigured\(\)/);
  assert.match(assemble,/directSources\?Promise\.resolve\(null\)/);
  assert.match(search,/clicks:null,impressions:null/);
});
