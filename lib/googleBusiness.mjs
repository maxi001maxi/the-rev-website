import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const GBP_SCOPE='https://www.googleapis.com/auth/business.manage';
const STATE_TTL_MS=10*60*1000;
const MATCH_PATTERNS=[/the\s*rev/i,/therev-lab\.com/i];

function cfg(env=process.env){
  const missing=[];
  for(const key of ['GBP_GOOGLE_CLIENT_ID','GBP_GOOGLE_CLIENT_SECRET','GBP_GOOGLE_REDIRECT_URI','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']){
    if(!String(env[key]||'').trim())missing.push(key);
  }
  if(missing.length)throw Object.assign(new Error('google_business_not_configured'),{code:'not_configured',missing});
  return {
    clientId:env.GBP_GOOGLE_CLIENT_ID.trim(),
    clientSecret:env.GBP_GOOGLE_CLIENT_SECRET.trim(),
    redirectUri:env.GBP_GOOGLE_REDIRECT_URI.trim(),
    supabaseUrl:env.SUPABASE_URL.trim(),
    serviceRole:env.SUPABASE_SERVICE_ROLE_KEY.trim()
  };
}
const b64=s=>Buffer.from(s).toString('base64url');
const unb64=s=>Buffer.from(s,'base64url').toString('utf8');
function sig(payload,secret){return crypto.createHmac('sha256',secret).update(payload).digest('base64url');}
function safeEq(a,b){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
export function createOAuthState(userId,now=Date.now()){
  const {clientSecret}=cfg();
  const payload=b64(JSON.stringify({v:1,userId,exp:now+STATE_TTL_MS,nonce:crypto.randomBytes(16).toString('hex')}));
  return `${payload}.${sig(payload,clientSecret)}`;
}
export function verifyOAuthState(state,now=Date.now()){
  const {clientSecret}=cfg();
  const [payload,signature,extra]=String(state||'').split('.');
  if(!payload||!signature||extra||!safeEq(signature,sig(payload,clientSecret)))throw Object.assign(new Error('invalid_oauth_state'),{code:'invalid_state'});
  let data;try{data=JSON.parse(unb64(payload));}catch{throw Object.assign(new Error('invalid_oauth_state'),{code:'invalid_state'});}
  if(data?.v!==1||typeof data?.userId!=='string'||typeof data?.exp!=='number'||data.exp<now)throw Object.assign(new Error('expired_oauth_state'),{code:'invalid_state'});
  return data;
}
export function authorizationUrl(userId){
  const {clientId,redirectUri}=cfg();
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id',clientId);
  u.searchParams.set('redirect_uri',redirectUri);
  u.searchParams.set('response_type','code');
  u.searchParams.set('scope',GBP_SCOPE);
  u.searchParams.set('access_type','offline');
  u.searchParams.set('prompt','consent');
  u.searchParams.set('include_granted_scopes','true');
  u.searchParams.set('state',createOAuthState(userId));
  return u.toString();
}
async function readJson(res){
  const text=await res.text();
  let data={};try{data=text?JSON.parse(text):{};}catch{data={raw:text};}
  if(!res.ok){
    const message=data?.error?.message||data?.error_description||data?.error||`HTTP ${res.status}`;
    throw Object.assign(new Error(message),{code:'google_api_error',status:res.status,data});
  }
  return data;
}
export async function exchangeCode(code){
  const {clientId,clientSecret,redirectUri}=cfg();
  const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:'authorization_code',redirect_uri:redirectUri});
  return readJson(await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body}));
}
export async function refreshAccessToken(refreshToken){
  const {clientId,clientSecret}=cfg();
  const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'});
  const data=await readJson(await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body}));
  if(!data?.access_token)throw Object.assign(new Error('missing_access_token'),{code:'google_api_error'});
  return data.access_token;
}
function serviceClient(){
  const {supabaseUrl,serviceRole}=cfg();
  return createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function getConnection(userId){
  const {data,error}=await serviceClient().from('google_business_connections').select('*').eq('user_id',userId).maybeSingle();
  if(error)throw Object.assign(new Error('connection_read_failed'),{code:'storage_error',cause:error});
  return data||null;
}
export async function saveConnection(userId,tokenData,discovery={}){
  const existing=await getConnection(userId);
  const refreshToken=tokenData?.refresh_token||existing?.refresh_token;
  if(!refreshToken)throw Object.assign(new Error('missing_refresh_token'),{code:'missing_refresh_token'});
  const now=new Date().toISOString();
  const payload={
    user_id:userId,
    refresh_token:refreshToken,
    token_scope:tokenData?.scope||existing?.token_scope||GBP_SCOPE,
    account_resource:discovery.accountResource??existing?.account_resource??null,
    account_name:discovery.accountName??existing?.account_name??null,
    location_resource:discovery.locationResource??existing?.location_resource??null,
    location_title:discovery.locationTitle??existing?.location_title??null,
    connected_at:existing?.connected_at||now,
    updated_at:now,
    last_verified_at:discovery.verified?now:(existing?.last_verified_at||null),
    last_error:discovery.error||null
  };
  const {error}=await serviceClient().from('google_business_connections').upsert(payload,{onConflict:'user_id'});
  if(error)throw Object.assign(new Error('connection_write_failed'),{code:'storage_error',cause:error});
  return payload;
}
async function googleGet(url,accessToken){
  return readJson(await fetch(url,{headers:{authorization:`Bearer ${accessToken}`,accept:'application/json'}}));
}
function locationScore(loc){
  const hay=`${loc?.title||''} ${loc?.websiteUri||''}`;
  return MATCH_PATTERNS.reduce((n,re)=>n+(re.test(hay)?1:0),0);
}
export async function discoverBusiness(accessToken){
  const accountsData=await googleGet('https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20',accessToken);
  const accounts=Array.isArray(accountsData?.accounts)?accountsData.accounts:[];
  const found=[];
  for(const account of accounts){
    const name=account?.name;
    if(!/^accounts\//.test(name||''))continue;
    const u=new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${name}/locations`);
    u.searchParams.set('pageSize','100');
    u.searchParams.set('readMask','name,title,storeCode,websiteUri');
    const data=await googleGet(u.toString(),accessToken);
    for(const location of data?.locations||[])found.push({account,location,score:locationScore(location)});
  }
  if(!found.length)return {accountResource:null,accountName:null,locationResource:null,locationTitle:null,candidates:[],error:'no_location_found'};
  const ranked=[...found].sort((a,b)=>b.score-a.score);
  const chosen=(ranked[0].score>0&&ranked.filter(x=>x.score===ranked[0].score).length===1)?ranked[0]:(ranked.length===1?ranked[0]:null);
  return {
    accountResource:chosen?.account?.name||null,
    accountName:chosen?.account?.accountName||null,
    locationResource:chosen?.location?.name||null,
    locationTitle:chosen?.location?.title||null,
    candidates:ranked.map(x=>({accountResource:x.account?.name||null,accountName:x.account?.accountName||null,locationResource:x.location?.name||null,locationTitle:x.location?.title||null,websiteUri:x.location?.websiteUri||null})),
    error:chosen?null:'location_not_resolved',
    verified:Boolean(chosen)
  };
}
function dateParts(d){const [year,month,day]=String(d).split('-').map(Number);return {year,month,day};}
export async function fetchPerformance(accessToken,locationResource,range){
  if(!/^locations\//.test(locationResource||''))throw Object.assign(new Error('location_not_resolved'),{code:'not_configured'});
  const metrics=['BUSINESS_IMPRESSIONS_DESKTOP_MAPS','BUSINESS_IMPRESSIONS_DESKTOP_SEARCH','BUSINESS_IMPRESSIONS_MOBILE_MAPS','BUSINESS_IMPRESSIONS_MOBILE_SEARCH','BUSINESS_DIRECTION_REQUESTS','CALL_CLICKS','WEBSITE_CLICKS','BUSINESS_BOOKINGS'];
  const u=new URL(`https://businessprofileperformance.googleapis.com/v1/${locationResource}:fetchMultiDailyMetricsTimeSeries`);
  for(const metric of metrics)u.searchParams.append('dailyMetrics',metric);
  const s=dateParts(range.startDate),e=dateParts(range.endDate);
  for(const [k,v] of Object.entries(s))u.searchParams.set(`daily_range.start_date.${k}`,String(v));
  for(const [k,v] of Object.entries(e))u.searchParams.set(`daily_range.end_date.${k}`,String(v));
  const data=await googleGet(u.toString(),accessToken);
  const series=(data?.multiDailyMetricTimeSeries||[]).flatMap(x=>x?.dailyMetricTimeSeries||[]);
  const totals={};
  const present=new Set();
  const daily={};
  for(const row of series){
    const metric=row?.dailyMetric;
    if(!metric)continue;
    present.add(metric);
    let total=0;
    for(const point of row?.timeSeries?.datedValues||[]){
      const d=point?.date;const date=d?.year&&d?.month&&d?.day?`${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`:null;
      const value=Number(point?.value||0);
      if(!Number.isFinite(value))continue;
      total+=value;
      if(date){daily[date]??={};daily[date][metric]=value;}
    }
    totals[metric]=total;
  }
  const searchReady=present.has('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH')&&present.has('BUSINESS_IMPRESSIONS_MOBILE_SEARCH');
  const mapsReady=present.has('BUSINESS_IMPRESSIONS_DESKTOP_MAPS')&&present.has('BUSINESS_IMPRESSIONS_MOBILE_MAPS');
  const searchImpressions=searchReady?totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH+totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH:null;
  const mapsImpressions=mapsReady?totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS+totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS:null;
  return {totals:{...totals,SEARCH_IMPRESSIONS:searchImpressions,MAPS_IMPRESSIONS:mapsImpressions},daily,present:[...present]};
}
export async function fetchSearchKeywords(accessToken,locationResource,range){
  const sm=dateParts(range.startDate),em=dateParts(range.endDate);
  const u=new URL(`https://businessprofileperformance.googleapis.com/v1/${locationResource}/searchkeywords/impressions/monthly`);
  u.searchParams.set('monthly_range.start_month.year',String(sm.year));
  u.searchParams.set('monthly_range.start_month.month',String(sm.month));
  u.searchParams.set('monthly_range.end_month.year',String(em.year));
  u.searchParams.set('monthly_range.end_month.month',String(em.month));
  u.searchParams.set('pageSize','100');
  const data=await googleGet(u.toString(),accessToken);
  return (data?.searchKeywordsCounts||[]).map(row=>({
    keyword:String(row?.searchKeyword||''),
    impressions:row?.insightsValue?.value!==undefined?Number(row.insightsValue.value):null,
    threshold:row?.insightsValue?.threshold!==undefined?Number(row.insightsValue.threshold):null
  })).filter(x=>x.keyword).sort((a,b)=>(b.impressions??-1)-(a.impressions??-1));
}
export async function loadGoogleBusinessData(userId,range,{keywords=true}={}){
  const connection=await getConnection(userId);
  if(!connection?.refresh_token)throw Object.assign(new Error('not_connected'),{code:'not_configured'});
  const accessToken=await refreshAccessToken(connection.refresh_token);
  let current=connection;
  if(!current.location_resource){
    const discovered=await discoverBusiness(accessToken);
    current=await saveConnection(userId,{},discovered);
    if(!current.location_resource)throw Object.assign(new Error(discovered.error||'location_not_resolved'),{code:'not_configured',detail:discovered});
  }
  const performance=await fetchPerformance(accessToken,current.location_resource,range);
  let keywordRows=[],keywordStatus='NOT_REQUESTED';
  if(keywords){
    try{keywordRows=await fetchSearchKeywords(accessToken,current.location_resource,range);keywordStatus=keywordRows.length?'VALUE':'ZERO';}
    catch{keywordStatus='ERROR';}
  }
  await saveConnection(userId,{},{
    accountResource:current.account_resource,accountName:current.account_name,locationResource:current.location_resource,locationTitle:current.location_title,verified:true,error:null
  });
  return {connection:{accountResource:current.account_resource,accountName:current.account_name,locationResource:current.location_resource,locationTitle:current.location_title},performance,keywords:keywordRows,keywordStatus};
}
