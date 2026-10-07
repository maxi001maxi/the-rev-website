import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { normalizeDailyReports, normalizeGa4Date, fetchDirectGa4Dataset, syncDirectGa4ToCompanyOs } from '../lib/ga4CompanyOsSync.mjs';
import { resolveDateRange, parseServiceAccount } from '../lib/ga4Data.mjs';
const header={metricHeaders:[{name:'count'}],metadata:{timeZone:'Asia/Tokyo'}};
const row=(date,values,event)=>({dimensionValues:[{value:date},...(event?[{value:event}]:[])],metricValues:values.map(value=>({value:String(value)}))});
const input={dailyReport:{...header,rows:[row('20261005',[3,2,4,1])]},eventReport:{...header,rows:[row('20261006',[2],'reserve_click')]},startDate:'2026-10-05',endDate:'2026-10-07',today:'2026-10-07'};
const result=normalizeDailyReports(input);
assert.equal(result.rows.length,3);
assert.equal(result.rows[0].reserve_click,null);
assert.equal(result.rows[1].reserve_click,2);
assert.equal(result.rows[2].reserve_click,0);
assert.equal(result.rows[2].line_click,null);
assert.equal(result.rows[2].data_status,'DELAYED');
assert.equal(result.rows[1].sessions,0);
assert.throws(()=>normalizeGa4Date('20260230'),/INVALID_DATE/);
assert.throws(()=>normalizeDailyReports({...input,eventReport:{...header,rowCount:3,rows:[]}}),/TRUNCATED/);
assert.throws(()=>normalizeDailyReports({...input,dailyReport:{...header,metadata:{subjectToThresholding:true}}}),/INCOMPLETE/);
assert.throws(()=>normalizeDailyReports({...input,dailyReport:{...header,rows:[row('20261005',['oops',2,4,1])]}}),/INVALID_METRIC/);
assert.equal(resolveDateRange('7d').current.endDate,'yesterday');
assert.equal(resolveDateRange('28d').current.startDate,'28daysAgo');
const key=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const raw=JSON.stringify({client_email:'test@example.invalid',private_key:key});
assert.equal(parseServiceAccount(Buffer.from(raw).toString('base64')).client_email,'test@example.invalid');
assert.equal(parseServiceAccount(JSON.stringify({client_email:'test@example.invalid',private_key:key.replace(/\n/g,'\\n')})).private_key,key);
const requests=[];
const fetchImpl=async (url,options)=>{
  if(url.includes('oauth2'))return {ok:true,json:async()=>({access_token:'test-only'})};
  const body=JSON.parse(options.body);requests.push(body);
  const report=body.dimensions?.length===2?input.eventReport:body.dimensions?input.dailyReport:{...header,rows:[{metricValues:[{value:'2'}]}]};
  return {ok:true,json:async()=>report};
};
const data=await fetchDirectGa4Dataset({propertyId:'552679302',serviceAccountRaw:raw,today:'2026-10-07',fetchImpl});
assert.equal(data.rows.length,13);
assert.equal(data.windowMetrics.recent_7_complete_days.active_users,2);
assert.equal(data.windowMetrics.recent_28_complete_days.active_users,null);
assert.equal(requests.at(-1).dateRanges[0].endDate,'2026-10-06');
let sourceUpdate=null;
const supabase={from(table){return {
  select(){return {eq(){return {maybeSingle:async()=>({data:{metadata:{}},error:null})}}}},
  upsert:async()=>({error:null}),
  update(payload){sourceUpdate=payload;return {eq(){return {select:async()=>({data:[{source_id:'ga4-direct-read'}],error:null}),then(resolve){resolve({error:null})}}}}}
};}};
const synced=await syncDirectGa4ToCompanyOs({supabase,env:{GA4_PROPERTY_ID:'552679302',GA4_SERVICE_ACCOUNT_JSON:raw},fetchImpl});
assert.equal(synced.ok,true);assert.equal(sourceUpdate.status,'ACTIVE');assert.equal(sourceUpdate.last_error,null);
const failed=await syncDirectGa4ToCompanyOs({supabase,env:{GA4_PROPERTY_ID:'552679302',GA4_SERVICE_ACCOUNT_JSON:raw},fetchImpl:async()=>{throw new Error('GA4_TEST_FAILURE')}});
assert.equal(failed.ok,false);assert.equal(sourceUpdate.status,'DEGRADED');assert.equal(sourceUpdate.last_observed_at,undefined);
console.log('Measurement Gate contract PASS: unknown/zero, incomplete reports, credential formats, completed windows, unique users, source success/failure');
