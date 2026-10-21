// A missing runner-local file is not evidence of zero API use.
export function imageUsageReceipt({durable=null,qa=null}={}) {
 const remote=Array.isArray(durable?.calls)?durable.calls:null;
 const observed=Array.isArray(qa?.api_usage?.calls)?qa.api_usage.calls:null;
 const calls=remote||observed;
 if(!calls)return {calls:[],generation_calls:null,qc_calls:null,verified:false,source:'UNAVAILABLE',mismatch:false,confirmed_cost:null};
 const signature=rows=>JSON.stringify(rows.map(c=>[c.sequence,c.kind,c.status,c.request_id||null]));
 const mismatch=!!(remote&&observed&&signature(remote)!==signature(observed));
 const valid=calls.every(c=>['generation','qc'].includes(c.kind)&&['STARTED','COMPLETED','FAILED','UNCERTAIN'].includes(c.status));
 return {calls,generation_calls:calls.filter(c=>c.kind==='generation').length,qc_calls:calls.filter(c=>c.kind==='qc').length,
 verified:valid&&!mismatch,source:remote?'DURABLE_GITHUB_LEDGER':'INDEPENDENT_QC_DURABLE_RECEIPT',mismatch,confirmed_cost:null};
}
