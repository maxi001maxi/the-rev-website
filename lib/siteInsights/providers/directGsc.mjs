import {listGscSites,chooseGscSite,queryGscSearchAnalytics,pacificDate} from '../../gscDirect.mjs';
import {cached} from '../cache.mjs';

const fail=(code)=>Object.assign(new Error(code),{code});
export function directGscConfigured(env=process.env){
  return Boolean(String(env.GOOGLE_READONLY_SERVICE_ACCOUNT_JSON||env.GA4_SERVICE_ACCOUNT_JSON||'').trim());
}
export async function directGscContext({env=process.env}={}){
  if(!directGscConfigured(env))throw fail('not_configured');
  return cached('gsc-direct:authorized-site',20*60000,async()=>{
    const serviceAccountRaw=env.GOOGLE_READONLY_SERVICE_ACCOUNT_JSON||env.GA4_SERVICE_ACCOUNT_JSON;
    const account=await listGscSites({serviceAccountRaw});
    const selected=chooseGscSite(account.sites);
    if(!selected)throw fail('property_not_authorized');
    return {siteUrl:selected.siteUrl,accessToken:account.accessToken};
  });
}
export async function directGscAnchor({now=new Date(),read=null}={}){
  const settledTarget=pacificDate(-3,now);
  const start=pacificDate(-17,now);
  const request=read|| (async(startDate,endDate,dimensions)=>{
    const c=await directGscContext();
    return queryGscSearchAnalytics({siteUrl:c.siteUrl,accessToken:c.accessToken,startDate,endDate,dimensions,rowLimit:100});
  });
  const result=await request(start,settledTarget,['date']);
  if(!result||typeof result!=='object')throw fail('invalid_response');
  const observedRows=Array.isArray(result.rows)?result.rows:[];
  const dates=observedRows.map(r=>r.keys?.[0]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&d<=settledTarget).sort();
  const observed=dates.at(-1);
  if(!observed)throw fail('unsettled');
  if((Date.parse(settledTarget)-Date.parse(observed))/86400000>5)throw fail('stale');
  return observed;
}
export async function directGscRaw(startDate,endDate,dimension='date',limit=400,{read=null,anchor=null}={}){
  if(!['date','query','page'].includes(dimension))throw fail('invalid_dimension');
  const settledThrough=anchor||await cached('gsc-direct:anchor',15*60000,()=>directGscAnchor());
  if(endDate>settledThrough)throw fail('unsettled');
  const request=read|| (async(a,b,dimensions,rowLimit)=>{
    const c=await directGscContext();
    return queryGscSearchAnalytics({siteUrl:c.siteUrl,accessToken:c.accessToken,startDate:a,endDate:b,dimensions,rowLimit});
  });
  const dimensionData=await request(startDate,endDate,[dimension],limit+1);
  if(!dimensionData||typeof dimensionData!=='object')throw fail('invalid_response');
  // GSC omits the rows field entirely on a legitimate empty result.
  // It is not a verified zero for daily metrics; absent days remain UNKNOWN.
  const observedRows=Array.isArray(dimensionData.rows)?dimensionData.rows:[];
  let aggregate=null;
  if(dimension==='date'){
    const result=await request(startDate,endDate,[],1);
    const a=result?.rows?.[0];
    if(a && Number.isFinite(a.clicks)&&Number.isFinite(a.impressions)&&Number.isFinite(a.position))aggregate={
      clicks:a.clicks,impressions:a.impressions,ctr:a.ctr,position:a.position
    };
  }
  return {
    provider:'google-search-console-api-direct',
    ctrUnit:'fraction',
    settledThrough,
    pagination:{hasMore:observedRows.length>limit},
    rows:observedRows.slice(0,limit),
    aggregate
  };
}
