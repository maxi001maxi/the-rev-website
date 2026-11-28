import {createHash} from 'node:crypto';
const digest=v=>createHash('sha256').update(v).digest('hex');
const ids=['req_5132beae5d104cfb807c551661e7ae18','req_885cd030abb642d784f4c82adebcbb26'];
export function authorizeOct21AdditionalQc({plan,prior,body,payload}){
 const a=plan?.additional_approval;
 if(plan?.content_id!=='BLOG-20261021-4ac8fd'||plan.max_requests!==2||plan.mode!=='APPROVED_ADDITIONAL_TEXT_QC'||a?.status!=='APPROVED'||a.scope!=='ONE_ADDITIONAL_INDEPENDENT_TEXT_QC'||a.max_additional_requests!==1||a.ceiling_usd!==0.25||!a.approved_at||!a.approval_id)throw Error('ADDITIONAL_QC_APPROVAL_INVALID');
 if(a.body_sha256!==digest(body)||a.request_sha256!==digest(JSON.stringify(payload)))throw Error('ADDITIONAL_QC_APPROVAL_CONTENT_DRIFT');
 if(prior?.status!=='COMPLETED'||prior.pass!==false||prior.total_requests!==2||prior.calls?.length!==2||ids.some((id,i)=>prior.calls[i].request_id!==id||prior.calls[i].status!=='COMPLETED'))throw Error('ADDITIONAL_QC_HISTORY_NOT_REUSABLE');
 if(payload.model!=='gpt-5.6'||payload.max_output_tokens!==4000)throw Error('ADDITIONAL_QC_MODEL_OR_LIMIT_DRIFT');
 // UTF-8 bytes overestimate content tokens; include schema/role overhead and
 // use the higher cache-write input price for the complete input bound.
 const inputBound=Buffer.byteLength(JSON.stringify(payload),'utf8')+1000;
 const maxEstimate=inputBound*5/1e6+payload.max_output_tokens*20/1e6;
 if(maxEstimate>a.ceiling_usd)throw Error('ADDITIONAL_QC_BUDGET_EXCEEDED');
 return {approval_id:a.approval_id,ceiling_usd:a.ceiling_usd,max_additional_requests:1,conservative_max_estimate_usd:maxEstimate,
  automatic_retry:false,owner_permits_retry:true,chosen_policy:'one recommended-setting QC; no blind resend or quality retry',prior_calls_preserved:2};
}
export function estimatedQcCost(usage,model){
 if(model!=='gpt-5.6-sol'||!usage)return null;
 const input=Number(usage.input_tokens)||0,output=Number(usage.output_tokens)||0;
 const cached=Number(usage.input_tokens_details?.cached_tokens)||0,write=Number(usage.input_tokens_details?.cache_write_tokens)||0;
 if(cached+write>input)return null;
 return ((input-cached-write)*4+cached*0.4+write*5+output*20)/1e6;
}
