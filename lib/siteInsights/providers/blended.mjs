import {wizard} from './wizard.mjs';
import {cached} from '../cache.mjs';
import {strictNumber,canonicalPath} from '../normalize.mjs';

const SITE='https://therev-lab.com/';
const PROPERTY='properties/552679302';
const fail=(code='invalid_response')=>Object.assign(new Error(code),{code});
const n=(value,field)=>{const parsed=strictNumber(value);if(parsed===null)throw fail(`invalid_${field}`);return parsed;};

export async function blendedLanding(range,gscPages=[]) {
  const request={siteUrl:SITE,startDate:range.startDate,endDate:range.endDate,organicOnly:true,dateGranularity:'none',limit:100};
  const raw=await cached(`wizard:get_blended_landing_pages:${JSON.stringify(request)}`,3*3600000,()=>wizard('get_blended_landing_pages',request));
  if(raw?.notConfigured)throw fail('not_configured');
  if(raw?.propertyId!==PROPERTY||!Array.isArray(raw?.rows)||raw?.organicOnly!==true)throw fail();
  const knownGsc=new Set(gscPages.map(row=>row.key));
  return raw.rows.map(row=>{
    const path=canonicalPath(row.key);
    if(!path)throw fail('invalid_path');
    const ga4Matched=row.ga4Matched===true;
    const impressions=n(row.impressions,'impressions'),clicks=n(row.clicks,'clicks');
    const gscMatched=knownGsc.has(path)||impressions>0||clicks>0;
    const search=gscMatched?{clicks,impressions,ctr:n(row.ctr,'ctr')/100,position:n(row.position,'position')}:null;
    const ga4=ga4Matched?{sessions:n(row.sessions,'sessions'),activeUsers:n(row.activeUsers,'activeUsers'),bounceRate:n(row.bounceRate,'bounceRate'),keyEvents:n(row.keyEvents,'keyEvents')}:null;
    return {path,search,ga4,sourceFlags:[...(gscMatched?['gsc']:[]),...(ga4Matched?['ga4']:[])]};
  });
}

// Pure helper retained for contract fixtures.
export function blend(gsc,ga4){
  const rows=new Map();
  for(const p of gsc){if(p.key)rows.set(p.key,{path:p.key,search:{clicks:p.clicks,impressions:p.impressions,ctr:p.ctr,position:p.position},ga4:null,sourceFlags:['gsc']});}
  for(const p of ga4){const key=canonicalPath(p.path);if(!key)continue;const row=rows.get(key)||{path:key,search:null,ga4:null,sourceFlags:[]};row.ga4={sessions:p.sessions};row.sourceFlags.push('ga4');rows.set(key,row);}
  return [...rows.values()].sort((a,b)=>(b.search?.clicks||0)-(a.search?.clicks||0));
}
