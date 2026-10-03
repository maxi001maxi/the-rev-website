import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  GBP_SCOPE,
  authorizationUrl,
  createOAuthState,
  verifyOAuthState,
  fetchPerformance
} from '../lib/googleBusiness.mjs';

function withEnv(fn){
  const keys=['GBP_GOOGLE_CLIENT_ID','GBP_GOOGLE_CLIENT_SECRET','GBP_GOOGLE_REDIRECT_URI','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  process.env.GBP_GOOGLE_CLIENT_ID='client-id.apps.googleusercontent.com';
  process.env.GBP_GOOGLE_CLIENT_SECRET='super-secret-value';
  process.env.GBP_GOOGLE_REDIRECT_URI='https://the-rev-website.vercel.app/api/admin/google-business/callback';
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-role-test';
  return Promise.resolve().then(fn).finally(()=>{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
}

test('OAuth URL is Google-only, offline, scoped, and never exposes client secret',()=>withEnv(()=>{
  const url=new URL(authorizationUrl('00000000-0000-0000-0000-000000000001'));
  assert.equal(url.origin,'https://accounts.google.com');
  assert.equal(url.pathname,'/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('scope'),GBP_SCOPE);
  assert.equal(url.searchParams.get('access_type'),'offline');
  assert.equal(url.searchParams.get('prompt'),'consent');
  assert.equal(url.searchParams.get('redirect_uri'),'https://the-rev-website.vercel.app/api/admin/google-business/callback');
  assert.ok(!url.toString().includes('super-secret-value'));
}));

test('OAuth state is signed, expires, and rejects tampering',()=>withEnv(()=>{
  const now=Date.parse('2026-09-29T08:40:00Z');
  const state=createOAuthState('user-123',now);
  assert.equal(verifyOAuthState(state,now+1000).userId,'user-123');
  assert.throws(()=>verifyOAuthState(state+'x',now+1000),/oauth_state/);
  assert.throws(()=>verifyOAuthState(state,now+11*60*1000),/oauth_state/);
}));

test('GBP performance keeps observed zero distinct from missing metrics',async()=>{
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const u=new URL(url);
    assert.equal(u.hostname,'businessprofileperformance.googleapis.com');
    assert.equal(u.searchParams.getAll('dailyMetrics').length,8);
    assert.equal(u.searchParams.get('daily_range.start_date.year'),'2026');
    assert.equal(u.searchParams.get('daily_range.end_date.day'),'28');
    assert.equal(u.searchParams.get('dailyRange.start_date.year'),null);
    return {
      ok:true,
      status:200,
      text:async()=>JSON.stringify({
        multiDailyMetricTimeSeries:[{
          dailyMetricTimeSeries:[
            {dailyMetric:'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',timeSeries:{datedValues:[{date:{year:2026,month:9,day:28},value:'2'}]}},
            {dailyMetric:'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',timeSeries:{datedValues:[{date:{year:2026,month:9,day:28},value:'3'}]}},
            {dailyMetric:'WEBSITE_CLICKS',timeSeries:{datedValues:[]}}
          ]
        }]
      })
    };
  };
  try{
    const data=await fetchPerformance('access-token','locations/123',{startDate:'2026-09-28',endDate:'2026-09-28'});
    assert.equal(data.totals.SEARCH_IMPRESSIONS,5);
    assert.equal(data.totals.WEBSITE_CLICKS,0);
    assert.equal(data.totals.MAPS_IMPRESSIONS,null);
  }finally{globalThis.fetch=oldFetch;}
});

test('browser and consolidated admin endpoint do not expose stored secrets',()=>{
  const browser=[
    '../admin/js/google-business.mjs',
    '../admin/google-business/index.html'
  ].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf8')).join('\n');
  assert.doesNotMatch(browser,/refresh_token/);
  assert.doesNotMatch(browser,/GBP_GOOGLE_CLIENT_SECRET/);
  const endpoint=fs.readFileSync(new URL('../api/admin/google-business.mjs',import.meta.url),'utf8');
  assert.match(endpoint,/verifyOAuthState/);
  assert.match(endpoint,/saveConnection/);
  assert.match(endpoint,/action==='callback'/);
  assert.doesNotMatch(endpoint,/refresh_token/);
});

test('GBP callback has an explicit Vercel function at the registered redirect path',()=>{
  const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(vercel.rewrites.some(row=>row.source==='/api/admin/google-business/callback'),false);
  const callback=fs.readFileSync(new URL('../api/admin/google-business/callback.mjs',import.meta.url),'utf8');
  assert.match(callback,/googleBusinessHandler/);
  assert.match(callback,/action:'callback'/);
});

test('Vercel API function count stays within the 12-function limit',()=>{
  const root=fileURLToPath(new URL('../api/',import.meta.url));
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
  const functions=walk(root).filter(file=>file.endsWith('.mjs'));
  assert.ok(functions.length<=12,'API function count is '+functions.length+', expected <= 12: '+functions.join(', '));
});
