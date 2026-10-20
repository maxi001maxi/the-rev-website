import {createHash} from 'node:crypto';
import {getFile,putFile} from './githubContent.mjs';

// A server-side CAS reservation is written BEFORE each OpenAI request. A local
// runner crash, HTTP timeout, rerun or a second operator cannot reset the budget.
// A STARTED call is intentionally ambiguous; only a human may reconcile it.
export function createImageApiLedger({job,read=getFile,write=putFile,now=()=>new Date().toISOString()}={}) {
  if(!/^[a-z0-9-]+$/.test(job?.slug||'') || !/^[a-zA-Z0-9._-]+$/.test(job?.asset_version||''))throw new Error('API_LEDGER_ID_INVALID');
  const path=`editorial/image-api-ledger/${job.slug}-${job.asset_version}.json`;
  const contract={slug:job.slug,asset_version:job.asset_version,source_sha256:job.scene_plan?.source_sha256,
    scene_plan:job.scene_plan,headline:job.image_headline_short,thumbnail:job.thumbnail,og:job.og_image,gbp:job.gbp_image};
  const digest=createHash('sha256').update(JSON.stringify(contract)).digest('hex');
  const load=async()=>{
    const file=await read(path);
    if(!file.exists)return {file,state:{schema:'editorial-image-api-ledger-v1',...contract,contract_sha256:digest,calls:[],confirmed_cost:null}};
    let state;try{state=JSON.parse(file.content);}catch{throw new Error('API_LEDGER_CORRUPT');}
    if(state.contract_sha256!==digest || !Array.isArray(state.calls))throw new Error('API_LEDGER_CONTRACT_CHANGED');
    return {file,state};
  };
  const save=async(file,state)=>write({path,sha:file.exists?file.sha:null,content:JSON.stringify(state,null,2)+'\n',message:`Record editorial image API reservation: ${job.slug}`});
  return {
    path,
    async snapshot(){return (await load()).state;},
    async reserve(kind) {
      if(!['generation','qc'].includes(kind))throw new Error('API_LEDGER_KIND_INVALID');
      const {file,state}=await load();
      if(state.calls.some(c=>c.status==='STARTED'))throw new Error('AMBIGUOUS_API_REQUEST_REQUIRES_RECONCILIATION');
      const limit=kind==='generation'?1:2;
      if(state.calls.filter(c=>c.kind===kind).length>=limit)throw new Error(kind==='generation'?'GENERATION_CALL_LIMIT':'QC_CALL_LIMIT');
      const call={sequence:state.calls.length+1,kind,status:'STARTED',at:now(),confirmed_cost:null};
      state.calls.push(call);
      await save(file,state); // Conflict/failure => no provider request.
      return call.sequence;
    },
    async complete(sequence,result) {
      const {file,state}=await load(), call=state.calls.find(c=>c.sequence===sequence);
      if(!call || call.status!=='STARTED')throw new Error('API_LEDGER_RESERVATION_MISMATCH');
      Object.assign(call,result,{status:result.http_status>=200&&result.http_status<300?'COMPLETED':'FAILED',completed_at:now(),confirmed_cost:null});
      await save(file,state); // Failure => remote STARTED remains and reruns stop.
      return state;
    }
  };
}
