import crypto from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

export const THREADS_OAUTH_SCOPES=[
  'threads_basic',
  'threads_read_replies',
  'threads_manage_replies',
  'threads_manage_mentions',
  'threads_keyword_search'
];

const STATE_TTL_MS=10*60*1000;
const GRAPH='https://graph.threads.com';

const s=v=>String(v??'').trim();
const b64=v=>Buffer.from(v).toString('base64url');
const unb64=v=>Buffer.from(v,'base64url').toString('utf8');
const sig=(payload,secret)=>crypto.createHmac('sha256',secret).update(payload).digest('base64url');
const safeEq=(a,b)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);};

function cfg(env=process.env){
  const missing=[];
  for(const k of ['THREADS_APP_ID','THREADS_APP_SECRET','THREADS_REDIRECT_URI','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']){
    if(!s(env[k]))missing.push(k);
  }
  if(missing.length)throw Object.assign(new Error('threads_oauth_not_configured'),{code:'not_configured',missing});
  return {
    appId:s(env.THREADS_APP_ID),
    appSecret:s(env.THREADS_APP_SECRET),
    redirectUri:s(env.THREADS_REDIRECT_URI),
    supabaseUrl:s(env.SUPABASE_URL),
    serviceRole:s(env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

function client(env=process.env){
  const c=cfg(env);
  return createClient(c.supabaseUrl,c.serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
}

async function readJson(res,stage){
  const raw=await res.text();
  let data={}; try{data=raw?JSON.parse(raw):{};}catch{data={raw};}
  if(!res.ok||data?.error){
    const message=data?.error?.message||data?.error_description||data?.error||`HTTP ${res.status}`;
    throw Object.assign(new Error(String(message)),{code:'threads_api_error',status:res.status,stage,providerCode:typeof data?.error?.code==='number'?data.error.code:null,providerTraceId:typeof data?.error?.fbtrace_id==='string'?data.error.fbtrace_id:null,data});
  }
  return data;
}

export function createThreadsOAuthState(userId,now=Date.now(),env=process.env){
  const {appSecret,appId,redirectUri}=cfg(env);
  const payload=b64(JSON.stringify({v:2,redirectUri,appIdHash:crypto.createHash("sha256").update(appId).digest("hex"),userId,exp:now+STATE_TTL_MS,nonce:crypto.randomBytes(16).toString('hex')}));
  return `${payload}.${sig(payload,appSecret)}`;
}

export function verifyThreadsOAuthState(state,now=Date.now(),env=process.env){
  const {appSecret}=cfg(env);
  const [payload,signature,extra]=String(state||'').split('.');
  if(!payload||!signature||extra||!safeEq(signature,sig(payload,appSecret)))throw Object.assign(new Error('invalid_oauth_state'),{code:'invalid_state'});
  let data; try{data=JSON.parse(unb64(payload));}catch{throw Object.assign(new Error('invalid_oauth_state'),{code:'invalid_state'});}
  if(![1,2].includes(data?.v)||typeof data?.userId!=='string'||typeof data?.exp!=='number'||data.exp<now)throw Object.assign(new Error('expired_oauth_state'),{code:'invalid_state'});
  return data;
}

export function threadsAuthorizationUrl(userId,env=process.env){
  const {appId,redirectUri}=cfg(env);
  const u=new URL('https://www.threads.com/oauth/authorize');
  u.searchParams.set('client_id',appId);
  u.searchParams.set('redirect_uri',redirectUri);
  u.searchParams.set('scope',THREADS_OAUTH_SCOPES.join(','));
  u.searchParams.set('response_type','code');
  u.searchParams.set('state',createThreadsOAuthState(userId,Date.now(),env));
  return u.toString();
}

export function threadsOAuthDiagnostics(state,{env=process.env,callbackUrl=null}={}){
  const {appId,redirectUri}=cfg(env);
  const authorizationUri=state?.v===2?state.redirectUri:null;
  let callbackRequestUrl=null;
  try{const u=new URL(callbackUrl);callbackRequestUrl=u.origin+u.pathname;}catch{}
  return {
    authorization_redirect_uri:authorizationUri,
    exchange_redirect_uri:redirectUri,
    redirect_uri_equal:authorizationUri===null?null:Buffer.from(authorizationUri).equals(Buffer.from(redirectUri)),
    app_id_equal:state?.v===2?state.appIdHash===crypto.createHash('sha256').update(appId).digest('hex'):null,
    callback_request_url:callbackRequestUrl
  };
}

function codeExchangeRequest(code,env){
  const {appId,appSecret,redirectUri}=cfg(env);
  return {url:new URL(`${GRAPH}/oauth/access_token`),options:{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},
    body:new URLSearchParams({client_id:appId,client_secret:appSecret,grant_type:'authorization_code',redirect_uri:redirectUri,code:s(code)})
  }};
}

// Constructed by the same function as the actual exchange. Never expose secret/code/body.
export function threadsTokenExchangeRequestSummary(env=process.env){
  const {url,options}=codeExchangeRequest('',env);
  return {
    endpoint_hostname:url.hostname,endpoint_pathname:url.pathname,method:options.method,
    content_type:options.headers['content-type'],parameter_placement:'body',
    parameter_names:[...options.body.keys()],
    redirect_uri:options.body.get('redirect_uri'),client_id:options.body.get('client_id'),
    authorization_endpoint:'https://www.threads.com/oauth/authorize'
  };
}

// Official client_credentials probe: no user authorization code, no connection mutation.
// The app token is consumed only as a success signal and never leaves this server function.
export async function probeThreadsAppCredentials({env=process.env,fetchImpl=fetch}={}){
  const {appId,appSecret}=cfg(env);
  const url=new URL(`${GRAPH}/oauth/access_token`);
  url.search=new URLSearchParams({grant_type:'client_credentials',client_id:appId,client_secret:appSecret});
  try{
    const res=await fetchImpl(url,{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
    const data=await readJson(res,'app_credentials_probe');
    return {credentials_accepted:Boolean(s(data.access_token)),http_status:res.status,provider_code:null,provider_trace_id:null};
  }catch(error){
    return {credentials_accepted:error?.status?false:null,http_status:error?.status||null,provider_code:error?.providerCode||null,provider_trace_id:error?.providerTraceId||null};
  }
}

export async function exchangeThreadsCode(code,{env=process.env,fetchImpl=fetch,authorizationContext}={}){
  const {appId,appSecret,redirectUri}=cfg(env);
  if(authorizationContext){
    const diagnostic=threadsOAuthDiagnostics(authorizationContext,{env});
    if(diagnostic.redirect_uri_equal===false||diagnostic.app_id_equal===false)
      throw Object.assign(new Error('threads_oauth_configuration_changed'),{code:'oauth_configuration_changed'});
  }
  const request=codeExchangeRequest(code,env);
  console.info('[threads-oauth/exchange-request]',JSON.stringify(threadsTokenExchangeRequestSummary(env)));
  const short=await readJson(await fetchImpl(request.url,request.options),'short_token_exchange');
  if(!s(short?.access_token))throw Object.assign(new Error('threads_short_token_missing'),{code:'threads_api_error'});
  const longExchangeUrl=new URL(`${GRAPH}/access_token`);
  longExchangeUrl.searchParams.set('grant_type','th_exchange_token');
  longExchangeUrl.searchParams.set('client_secret',appSecret);
  longExchangeUrl.searchParams.set('access_token',short.access_token);
  const long=await readJson(await fetchImpl(longExchangeUrl,{method:'GET',headers:{accept:'application/json'}}),'long_token_exchange');
  const accessToken=s(long?.access_token);
  if(!accessToken)throw Object.assign(new Error('threads_long_token_missing'),{code:'threads_api_error'});
  const expiresIn=Number(long?.expires_in||0);
  return {
    access_token:accessToken,
    token_type:s(long?.token_type)||'bearer',
    expires_in:Number.isFinite(expiresIn)&&expiresIn>0?expiresIn:null,
    user_id:s(short?.user_id)||null
  };
}

export async function refreshThreadsLongLivedToken(accessToken,{fetchImpl=fetch}={}){
  const u=new URL(`${GRAPH}/refresh_access_token`);
  u.searchParams.set('grant_type','th_refresh_token');
  u.searchParams.set('access_token',s(accessToken));
  const data=await readJson(await fetchImpl(u,{method:'GET',headers:{accept:'application/json'}}));
  if(!s(data?.access_token))throw Object.assign(new Error('threads_refresh_token_missing'),{code:'threads_api_error'});
  return data;
}

export async function getThreadsProfile(accessToken,{fetchImpl=fetch}={}){
  const u=new URL(`${GRAPH}/me`);
  u.searchParams.set('fields','id,username,name');
  u.searchParams.set('access_token',s(accessToken));
  return readJson(await fetchImpl(u,{method:'GET',headers:{accept:'application/json'}}),'profile');
}

export async function getThreadsConnection({supabase,env=process.env}={}){
  const db=supabase||client(env);
  const {data,error}=await db.from('social_threads_api_connections').select('*').eq('connection_key','primary').maybeSingle();
  if(error)throw Object.assign(new Error('threads_connection_read_failed'),{code:'storage_error',cause:error});
  return data||null;
}

// Status is read after Admin authorization, using server credentials and metadata only.
export async function getThreadsConnectionStatus({supabase,env=process.env}={}){
  const db=supabase||client(env);
  const {data,error}=await db.from('social_threads_api_connections')
    .select('threads_user_id,username,scopes,expires_at,connected_at,last_verified_at,last_error')
    .eq('connection_key','primary').maybeSingle();
  if(error)throw Object.assign(new Error('threads_connection_read_failed'),{code:'storage_error'});
  return data||null;
}

export async function saveThreadsConnection({userId,tokenData,profile,supabase,env=process.env}){
  const db=supabase||client(env);
  const now=new Date();
  const expiresAt=tokenData?.expires_in?new Date(now.getTime()+Number(tokenData.expires_in)*1000).toISOString():null;
  const payload={
    connection_key:'primary',
    connected_by_user_id:userId,
    threads_user_id:s(profile?.id)||s(tokenData?.user_id)||null,
    username:s(profile?.username)||null,
    access_token:s(tokenData?.access_token),
    token_type:s(tokenData?.token_type)||'bearer',
    scopes:THREADS_OAUTH_SCOPES,
    expires_at:expiresAt,
    connected_at:now.toISOString(),
    updated_at:now.toISOString(),
    last_verified_at:now.toISOString(),
    last_error:null
  };
  if(!payload.access_token)throw Object.assign(new Error('threads_access_token_missing'),{code:'threads_api_error'});
  const {error}=await db.from('social_threads_api_connections').upsert(payload,{onConflict:'connection_key'});
  if(error)throw Object.assign(new Error('threads_connection_write_failed'),{code:'storage_error',cause:error});
  return {...payload,access_token:undefined};
}

export async function getActiveThreadsAccessToken({supabase,env=process.env,fetchImpl=fetch,now=new Date()}={}){
  const direct=s(env?.THREADS_ACCESS_TOKEN);
  if(direct)return {accessToken:direct,source:'ENV',connection:null};

  const row=await getThreadsConnection({supabase,env});
  if(!row?.access_token)return {accessToken:null,source:'NONE',connection:row||null};

  const expiresAt=row.expires_at?new Date(row.expires_at):null;
  const refreshSoon=expiresAt&&Number.isFinite(expiresAt.getTime())&&(expiresAt.getTime()-now.getTime()<7*24*60*60*1000);
  if(!refreshSoon)return {accessToken:row.access_token,source:'DB',connection:row};

  try{
    const refreshed=await refreshThreadsLongLivedToken(row.access_token,{fetchImpl});
    const nextExpires=Number(refreshed?.expires_in||0)>0?new Date(now.getTime()+Number(refreshed.expires_in)*1000).toISOString():row.expires_at;
    const db=supabase||client(env);
    const {error}=await db.from('social_threads_api_connections').update({
      access_token:refreshed.access_token,
      token_type:refreshed.token_type||row.token_type||'bearer',
      expires_at:nextExpires,
      updated_at:now.toISOString(),
      last_verified_at:now.toISOString(),
      last_error:null
    }).eq('connection_key','primary');
    if(error)throw error;
    return {accessToken:refreshed.access_token,source:'DB_REFRESHED',connection:{...row,expires_at:nextExpires}};
  }catch(error){
    const db=supabase||client(env);
    await db.from('social_threads_api_connections').update({last_error:String(error?.message||error).slice(0,500),updated_at:now.toISOString()}).eq('connection_key','primary');
    return {accessToken:null,source:'REFRESH_FAILED',connection:row,error:String(error?.message||error)};
  }
}
