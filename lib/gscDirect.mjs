import crypto from 'node:crypto';

const TOKEN_URL='https://oauth2.googleapis.com/token';
const SITES_URL='https://searchconsole.googleapis.com/webmasters/v3/sites';
const SCOPE='https://www.googleapis.com/auth/webmasters.readonly';

function fail(code,message,status=0){
  const error=new Error(message||code);
  error.code=code;
  error.status=status;
  return error;
}

export function parseGoogleServiceAccount(raw){
  const value=String(raw||'').trim();
  if(!value) throw fail('not_configured','Google service account is not configured.');
  let text=value;
  if(!value.startsWith('{')){
    try{text=Buffer.from(value,'base64').toString('utf8');}
    catch{throw fail('invalid_credentials','Google service account is invalid.');}
  }
  let parsed;
  try{parsed=JSON.parse(text);}catch{throw fail('invalid_credentials','Google service account is invalid.');}
  if(parsed?.type!=='service_account'||!parsed?.client_email||!parsed?.private_key) throw fail('invalid_credentials','Google service account is incomplete.');
  return parsed;
}

const b64url=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');

export async function getGoogleAccessToken(serviceAccount,scope=SCOPE,fetchImpl=fetch){
  const now=Math.floor(Date.now()/1000);
  const unsigned=b64url({alg:'RS256',typ:'JWT'})+'.'+b64url({
    iss:serviceAccount.client_email,
    scope,
    aud:TOKEN_URL,
    iat:now,
    exp:now+3600
  });
  const assertion=unsigned+'.'+crypto.sign('RSA-SHA256',Buffer.from(unsigned),serviceAccount.private_key).toString('base64url');
  let response;
  try{
    response=await fetchImpl(TOKEN_URL,{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
      signal:AbortSignal.timeout(10000)
    });
  }catch{throw fail('oauth_unavailable','Google OAuth token exchange unavailable.');}
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body?.access_token) throw fail('oauth_failed','Google OAuth token exchange failed.',response.status);
  return body.access_token;
}

async function googleJson(url,options={},fetchImpl=fetch){
  let response;
  try{response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(12000)});}
  catch{throw fail('upstream_unavailable','Google Search Console API unavailable.');}
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    const reason=body?.error?.details?.find?.(x=>x?.reason)?.reason||body?.error?.status||'api_error';
    const message=String(body?.error?.message||'Google Search Console API error.');
    const code=reason==='SERVICE_DISABLED'?'service_disabled':response.status===403?'permission_denied':response.status===404?'not_found':'api_error';
    throw fail(code,message,response.status);
  }
  return body||{};
}

export async function listGscSites({serviceAccountRaw,fetchImpl=fetch}={}){
  const sa=parseGoogleServiceAccount(serviceAccountRaw);
  const accessToken=await getGoogleAccessToken(sa,SCOPE,fetchImpl);
  const data=await googleJson(SITES_URL,{headers:{authorization:`Bearer ${accessToken}`}},fetchImpl);
  return {
    clientEmail:sa.client_email,
    accessToken,
    sites:Array.isArray(data.siteEntry)?data.siteEntry:[]
  };
}

export function chooseGscSite(sites,host='therev-lab.com'){
  const normalized=(sites||[]).filter(x=>x?.siteUrl&&['siteOwner','siteFullUser','siteRestrictedUser'].includes(x.permissionLevel));
  return normalized.find(x=>x.siteUrl===`sc-domain:${host}`) ||
    normalized.find(x=>x.siteUrl===`https://${host}/`) ||
    normalized.find(x=>x.siteUrl===`https://www.${host}/`) ||
    null;
}

export async function queryGscSearchAnalytics({
  siteUrl,startDate,endDate,dimensions=['date'],rowLimit=25000,startRow=0,
  accessToken,serviceAccountRaw,fetchImpl=fetch
}){
  let token=accessToken;
  if(!token){
    const sa=parseGoogleServiceAccount(serviceAccountRaw);
    token=await getGoogleAccessToken(sa,SCOPE,fetchImpl);
  }
  const url=`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  return googleJson(url,{
    method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({startDate,endDate,dimensions,type:'web',dataState:'final',rowLimit,startRow})
  },fetchImpl);
}

export function pacificDate(offsetDays=0,now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const map=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const base=new Date(`${map.year}-${map.month}-${map.day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate()+offsetDays);
  return base.toISOString().slice(0,10);
}

export async function probeGscDirect({serviceAccountRaw,fetchImpl=fetch}={}){
  const listed=await listGscSites({serviceAccountRaw,fetchImpl});
  const selected=chooseGscSite(listed.sites);
  if(!selected) throw fail('property_not_authorized','Service account has no access to therev-lab.com Search Console property.',403);
  const endDate=pacificDate(-3);
  const startDate=pacificDate(-9);
  const sample=await queryGscSearchAnalytics({
    siteUrl:selected.siteUrl,startDate,endDate,dimensions:['date'],rowLimit:20,
    accessToken:listed.accessToken,fetchImpl
  });
  return {
    ok:true,
    selectedSite:selected.siteUrl,
    permissionLevel:selected.permissionLevel,
    startDate,endDate,
    rows:Array.isArray(sample.rows)?sample.rows:[]
  };
}
