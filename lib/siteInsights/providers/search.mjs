import {wizard} from './wizard.mjs';
import {directGscConfigured,directGscAnchor,directGscRaw} from './directGsc.mjs';
import {strictNumber,wizardCtr,canonicalPath,dateList} from '../normalize.mjs';
import {cached} from '../cache.mjs';
const SITE='https://therev-lab.com/';
export const searchSite=SITE;
export async function searchRaw(startDate,endDate,dimension='date',limit=400) {
  if(directGscConfigured())return cached(`gsc-direct:${startDate}:${endDate}:${dimension}:${limit}`,15*60000,()=>directGscRaw(startDate,endDate,dimension,limit));
  return cached(`gsc:${startDate}:${endDate}:${dimension}:${limit}`,3*3600000,()=>wizard('query_search_analytics',{siteUrl:SITE,startDate,endDate,dimensions:[dimension],searchType:'web',rowLimit:limit}));
}
export async function searchAnchor() {
  if(directGscConfigured())return cached('gsc-direct:anchor',15*60000,()=>directGscAnchor());
  const data=await cached('gsc:anchor',15*60000,()=>wizard('query_search_analytics',{siteUrl:SITE,dimensions:['date'],searchType:'web',rowLimit:30}));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data?.settledThrough||'')) throw Object.assign(new Error('unsettled'),{code:'unsettled'});
  if((Date.now()-Date.parse(`${data.settledThrough}T12:00:00Z`))/86400000>5.5) throw Object.assign(new Error('stale'),{code:'stale'});
  return data.settledThrough;
}
export function searchDaily(raw,start,end) {
  if(!Array.isArray(raw?.rows)||!raw?.settledThrough||raw.settledThrough<end||raw?.pagination?.hasMore||raw.rows.length>=400) throw new Error('incomplete_search');
  const byDate=new Map();
  for(const row of raw.rows) {
    const d=row.keys?.[0], clicks=strictNumber(row.clicks), impressions=strictNumber(row.impressions), position=strictNumber(row.position);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||clicks===null||impressions===null||impressions<0||clicks<0||byDate.has(d)) throw new Error('invalid_search');
    byDate.set(d,{date:d,clicks,impressions,ctr:impressions>0?clicks/impressions:null,position:impressions>0?position:null});
  }
  const days=dateList(start,end).map(d=>byDate.get(d)||(raw.provider==='google-search-console-api-direct'
    ? {date:d,clicks:null,impressions:null,ctr:null,position:null,observed:false}
    : {date:d,clicks:0,impressions:0,ctr:null,position:null}));
  if(raw.provider==='google-search-console-api-direct')days.aggregate=raw.aggregate;
  return days;
}
export function searchTotal(rows){
  if(Object.hasOwn(rows,'aggregate'))return rows.aggregate;
  const clicks=rows.reduce((n,r)=>n+r.clicks,0),impressions=rows.reduce((n,r)=>n+r.impressions,0);
  const weighted=rows.reduce((n,r)=>n+(r.position??0)*r.impressions,0);
  return {clicks,impressions,ctr:impressions?clicks/impressions:null,position:impressions&&rows.every(r=>r.impressions===0||r.position!==null)?weighted/impressions:null};
}
export function searchDimension(raw,dimension){
  if(!Array.isArray(raw?.rows)) throw new Error('invalid_search');
  return raw.rows.map(r=>({key:dimension==='page'?canonicalPath(r.keys?.[0]):r.keys?.[0],clicks:strictNumber(r.clicks),impressions:strictNumber(r.impressions),ctr:raw.ctrUnit==='fraction'?strictNumber(r.ctr):wizardCtr(r.ctr),position:strictNumber(r.position)})).filter(r=>r.key&&r.clicks!==null&&r.impressions!==null);
}
