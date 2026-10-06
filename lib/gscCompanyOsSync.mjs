import {
  listGscSites,
  chooseGscSite,
  queryGscSearchAnalytics,
  pacificDate
} from './gscDirect.mjs';

function shiftDate(date,days){
  const d=new Date(date+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}

function dateList(start,end){
  const out=[];
  for(let d=start;d<=end;d=shiftDate(d,1)){
    out.push(d);
    if(out.length>400)throw new RangeError('gsc_date_range');
  }
  return out;
}

function n(value){
  const v=Number(value);
  return Number.isFinite(v)?v:0;
}

export async function fetchDirectGscDailyMetrics({
  serviceAccountRaw,
  startDate,
  endDate,
  fetchImpl=fetch
}={}){
  const listed=await listGscSites({serviceAccountRaw,fetchImpl});
  const selected=chooseGscSite(listed.sites);
  if(!selected){
    const e=new Error('Service account has no Search Console access for therev-lab.com.');
    e.code='property_not_authorized';e.status=403;throw e;
  }
  const finalEnd=endDate||pacificDate(-3);
  const finalStart=startDate||shiftDate(finalEnd,-55);
  const raw=await queryGscSearchAnalytics({
    siteUrl:selected.siteUrl,
    startDate:finalStart,
    endDate:finalEnd,
    dimensions:['date'],
    rowLimit:500,
    accessToken:listed.accessToken,
    fetchImpl
  });

  const byDate=new Map();
  for(const row of raw?.rows||[]){
    const date=String(row?.keys?.[0]||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const clicks=n(row.clicks), impressions=n(row.impressions);
    byDate.set(date,{
      metric_date:date,
      site_url:selected.siteUrl,
      clicks,
      impressions,
      ctr:impressions>0?clicks/impressions:null,
      position:impressions>0&&Number.isFinite(Number(row.position))?Number(row.position):null,
      source:'google-search-console-api-direct',
      data_status:impressions>0||clicks>0?'VALUE':'ZERO'
    });
  }

  const rows=dateList(finalStart,finalEnd).map(date=>byDate.get(date)||({
    metric_date:date,
    site_url:selected.siteUrl,
    clicks:0,
    impressions:0,
    ctr:null,
    position:null,
    source:'google-search-console-api-direct',
    data_status:'ZERO'
  }));

  return {
    rows,
    siteUrl:selected.siteUrl,
    permissionLevel:selected.permissionLevel,
    settledThrough:finalEnd
  };
}

export async function syncDirectGscToCompanyOs({
  supabase,
  env=process.env,
  fetchImpl=fetch
}={}){
  const serviceAccountRaw=env.GOOGLE_READONLY_SERVICE_ACCOUNT_JSON||env.GA4_SERVICE_ACCOUNT_JSON;
  if(!String(serviceAccountRaw||'').trim()){
    return {ok:false,status:503,error:'gsc_direct_not_configured'};
  }
  const startedAt=new Date().toISOString();
  try{
    const result=await fetchDirectGscDailyMetrics({serviceAccountRaw,fetchImpl});
    const observedAt=new Date().toISOString();
    const payload=result.rows.map(row=>({...row,observed_at:observedAt,updated_at:observedAt}));
    const up=await supabase.from('company_os_gsc_daily_metrics').upsert(payload,{onConflict:'metric_date'});
    if(up.error)throw new Error(`GSC_DAILY_UPSERT_FAILED: ${up.error.message}`);

    const source=await supabase.from('company_os_source_registry').upsert({
      source_id:'gsc-direct-read',
      domain:'search_analytics',
      system:'google_search_console_api',
      resource:result.siteUrl,
      role:'Morning Meeting direct Search Console read model',
      canonicality:'READ_MODEL',
      sensitivity:'INTERNAL',
      freshness_policy:'daily before Morning Meeting; final Search Console data uses a conservative 3-day lag',
      owner:'Company OS',
      retrieval_method:'Vercel Cron -> Google Search Console API -> Supabase',
      fallback_sources:['site-insights'],
      allowed_context_profiles:['COMPANY_OVERVIEW_SAFE','MANAGEMENT_PRIVATE','WEBSITE_ANALYTICS'],
      status:'ACTIVE',
      last_observed_at:observedAt,
      last_error:null,
      metadata:{
        provider:'google-search-console-api-direct',
        dependency_on_gsc_wizard:false,
        site_url:result.siteUrl,
        permission_level:result.permissionLevel,
        settled_through:result.settledThrough,
        rows_upserted:payload.length,
        min_metric_date:payload[0]?.metric_date||null,
        max_metric_date:payload.at(-1)?.metric_date||null,
        started_at:startedAt,
        completed_at:observedAt
      },
      updated_at:observedAt
    },{onConflict:'source_id'});
    if(source.error)throw new Error(`GSC_SOURCE_REGISTRY_UPDATE_FAILED: ${source.error.message}`);

    return {
      ok:true,status:200,provider:'google-search-console-api-direct',
      rowsUpserted:payload.length,siteUrl:result.siteUrl,
      settledThrough:result.settledThrough,
      minDate:payload[0]?.metric_date||null,maxDate:payload.at(-1)?.metric_date||null,
      observedAt
    };
  }catch(error){
    const observedAt=new Date().toISOString();
    const message=String(error?.message||error||'GSC_DIRECT_SYNC_FAILED').slice(0,500);
    await supabase.from('company_os_source_registry').upsert({
      source_id:'gsc-direct-read',
      domain:'search_analytics',
      system:'google_search_console_api',
      resource:'therev-lab.com',
      role:'Morning Meeting direct Search Console read model',
      canonicality:'READ_MODEL',
      sensitivity:'INTERNAL',
      freshness_policy:'daily before Morning Meeting',
      owner:'Company OS',
      retrieval_method:'Vercel Cron -> Google Search Console API -> Supabase',
      fallback_sources:['site-insights'],
      allowed_context_profiles:['COMPANY_OVERVIEW_SAFE','MANAGEMENT_PRIVATE','WEBSITE_ANALYTICS'],
      status:error?.code==='property_not_authorized'?'NOT_CONFIGURED':'DEGRADED',
      last_observed_at:observedAt,last_error:message,
      metadata:{
        provider:'google-search-console-api-direct',
        dependency_on_gsc_wizard:false,
        error_code:error?.code||'gsc_direct_sync_failed',
        error_status:error?.status||0,
        started_at:startedAt,failed_at:observedAt
      },
      updated_at:observedAt
    },{onConflict:'source_id'});
    return {ok:false,status:error?.status||502,error:error?.code||'gsc_direct_sync_failed'};
  }
}
