import {wizard} from './wizard.mjs';
import {cached} from '../cache.mjs';

const SITE='https://therev-lab.com/';
export async function annotations(range){
  const request={siteUrl:SITE,startDate:range.startDate,endDate:range.endDate};
  const raw=await cached(`wizard:list_annotations:${JSON.stringify(request)}`,24*3600000,()=>wizard('list_annotations',request));
  if(!Array.isArray(raw?.annotations))throw Object.assign(new Error('invalid_response'),{code:'invalid_response'});
  const rows=raw.annotations.filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row?.event_date||'')).map(row=>({date:row.event_date,label:String(row.label||''),description:String(row.description||''),category:String(row.category||''),source:String(row.external_source||row.scope||'gsc-wizard')}));
  return {status:rows.length?'VALUE':'ZERO',rows};
}
