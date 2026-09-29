import {canonicalPath} from '../normalize.mjs';
// Aggregate all known GSC and GA4 landing paths; absence on one side is a measured zero only when that source succeeded.
export function blend(gsc,ga4){
  const rows=new Map();
  for(const p of gsc){if(p.key)rows.set(p.key,{path:p.key,search:{clicks:p.clicks,impressions:p.impressions,ctr:p.ctr,position:p.position},ga4:null,sourceFlags:['gsc']});}
  for(const p of ga4){const key=canonicalPath(p.path);if(!key)continue;const row=rows.get(key)||{path:key,search:null,ga4:null,sourceFlags:[]};row.ga4={sessions:p.sessions};row.sourceFlags.push('ga4');rows.set(key,row);}
  return [...rows.values()].sort((a,b)=>(b.search?.clicks||0)-(a.search?.clicks||0));
}
