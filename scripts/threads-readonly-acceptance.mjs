// Runs only when explicitly requested in a Vercel build acceptance command.
// Uses existing server-side env; never exports credentials, writes plans or calls LLM APIs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {getThreadsRuntimeContext,prepareThreadPlan} from '../lib/socialThreads.mjs';
import {normalizeThreadEvidence,normalizeThreadCandidate} from '../lib/socialThreadModel.mjs';
import {validateThreadCreativePlan,getThreadRecentContent,THREAD_CREATIVE_VERSION} from '../lib/socialThreadCreative.mjs';
import handler from '../api/integrations/editorial-status.mjs';
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let writes=0;
const supabase={from(table){const q=client.from(table);for(const method of ['insert','update','upsert','delete'])q[method]=()=>{writes++;throw new Error('READ_ONLY_ACCEPTANCE_WRITE_FORBIDDEN');};return q;}};
const input=JSON.parse(fs.readFileSync(new URL('../editorial/social/acceptance/threads-v1-candidate.json',import.meta.url),'utf8'));
const ctx=await getThreadsRuntimeContext({supabase,days:30});
assert.equal(ctx.creative_reasoning.supported_version,THREAD_CREATIVE_VERSION);
const evidence=input.evidence.map(normalizeThreadEvidence),keys=new Set(evidence.map(x=>x.evidence_key));
const candidates=input.candidates.map((x,i)=>normalizeThreadCandidate(x,i+1,keys).row);
const recent=await getThreadRecentContent({supabase,targetDate:input.target_date});
const qc=validateThreadCreativePlan({sourceContext:input.source_context,evidence,candidates,recentContent:recent,targetDate:input.target_date});
assert.equal(qc.candidate_count,2);
assert.equal(new Set(qc.summaries.map(x=>x.content_job)).size,2);
assert.equal(new Set(qc.summaries.map(x=>x.structure_type)).size,2);
// Invalid v1 packet must fail at the actual production API adapter before writes.
const invalid=structuredClone(input);invalid.source_context.research_lenses=[];
await assert.rejects(()=>prepareThreadPlan({supabase,targetDate:'2099-01-01',evidence:invalid.evidence,candidates:invalid.candidates,sourceContext:invalid.source_context}),/RESEARCH_LENS_REQUIRED/);
// Invoke the actual HTTP handler with its deployed env: auth then real DB reads.
if(process.env.EDITORIAL_BRIDGE_SECRET){
  const req={method:'POST',headers:{authorization:`Bearer ${process.env.EDITORIAL_BRIDGE_SECRET}`},body:{action:'social_threads_context',days:30}};
  const res={code:200,payload:null,setHeader(){},status(n){this.code=n;return this},json(v){this.payload=v;return this}};
  await handler(req,res);assert.equal(res.code,200);assert.equal(res.payload.context.creative_reasoning.supported_version,THREAD_CREATIVE_VERSION);
}
assert.equal(writes,0);
console.log(JSON.stringify({gate:'THREADS_V1_READ_ONLY_SERVER_ENV_ACCEPTANCE',status:'PASS',version:THREAD_CREATIVE_VERSION,
  customer_signal_count:ctx.customer_signals.length,verified_threads:ctx.published_threads.length,recent_content_count:recent.length,
  candidates:qc.summaries,findings:qc.findings,writes,authenticated_handler:process.env.EDITORIAL_BRIDGE_SECRET?'PASS':'NOT_CONFIGURED_IN_PREVIEW',
  proof_scope:'Exact source + real Supabase + server environment; handler invocation is not an authenticated live HTTP request.'}));
