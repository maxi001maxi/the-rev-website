import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const quality=fs.readFileSync('editorial/gas/DailyEditorialQuality_v0.8.0.gs','utf8');
const recovery=fs.readFileSync('editorial/gas/DailyEditorialProductionRecovery_v0.8.2.gs','utf8');
const topic=fs.readFileSync('editorial/gas/DailyEditorialTopicApproval_v0.7.0.gs','utf8');
export function recoverySandbox({rejectFirst=true,rejectRepair=false,apiError=false,evidence=true,primary=null}={}) {
  const records=new Map(),requests=[],bridgeRequests=[];
  const gbpRows=[];
  let qcCalls=0,editorCalls=0,writerCalls=0,held=false;
  const scores={title_hook:15,seo_intent:15,human_voice:14,readability:14,length_efficiency:8,originality:8,brand_fit:8,fact_safety:9};
  const article={title:'検証用の記事',slug_suggestion:'synthetic-recovery',article_type:'STANDARD',
    body_markdown:'安全に運動を選び、体調に合わせて調整する。'.repeat(90)+'\n\nTHE REV.では、無理なく運動を続ける形を大切にします。',
    source_refs:evidence?['https://pubmed.ncbi.nlm.nih.gov/34416428/']:[],_editor_notes:JSON.stringify({score_breakdown:scores}),_editor_score:91,_editor_decision:'READY',_fact_check_status:'PASS'};
  const sandbox={JSON,Date,console,V069_STATUS_URL:'https://example.test/status',
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='THE_REV_EDITORIAL_RECOVERY_V082_MODE'||k==='THE_REV_EDITORIAL_QUALITY_V08_MODE'?'ENFORCE':records.get(k)||null,setProperty:(k,v)=>records.set(k,v)})},
    LockService:{getScriptLock:()=>({hasLock:()=>held,tryLock:()=>{held=true;return true;},releaseLock:()=>{held=false;}})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,x)=>[...createHash('sha256').update(x).digest()]},
    v065LengthGate_:(type,body)=>({pass:String(body).replace(/\s/g,'').length>=1600}),
    ss_:()=>({getSheetByName:n=>n==='22_GBP_POST'?gbpRows:null}),getObjectsWithRow_:s=>s,
    appendObjectRow_:(s,v)=>s.push(v),setObjectRow_:(s,row,v)=>Object.assign(s[row-1],v),
    buildM6Context_:()=>({}),v065WeekDate_:x=>x,generateGBPFromBlog_:()=>({title:'synthetic GBP',body_copy_paste:'synthetic',cta_text:'test'}),
    getSettings_:()=>({blog_editor_model:'synthetic-model'}),
    parseStructuredResponse_:x=>x.output,
    openAIRequest_:(endpoint,payload)=>{
      requests.push(structuredClone(payload));
      if(payload.text?.format?.name==='web_blog_final_editor_v1'){editorCalls++;return {id:'edit-'+editorCalls,usage:{total_tokens:10},output:{}};}
      qcCalls++;
      if(apiError)throw new Error('SYNTHETIC_API_TIMEOUT');
      const rejected=rejectRepair || rejectFirst&&qcCalls===1;
      return {id:'qc-'+qcCalls,usage:{total_tokens:20},output:{scores:{question_resolution:4,understanding_gain:4,decision_support:4,concreteness_evidence:4,originality_readability:4},issues:rejected?['研究の対象と結果の限界を説明する必要があります。']:[],source_unverified:rejected,reason:'synthetic fixture'}};
    },
    generateWebBlogDraft_:()=>{writerCalls++;return structuredClone(article);},
    finalizeWebBlog_:(draft,ctx)=>{
      sandbox.openAIRequest_('responses',{text:{format:{name:'web_blog_final_editor_v1'}},input:[{content:[]},{content:[{text:JSON.stringify({article:draft})}]}]});
      return {...draft,_editor_notes:JSON.stringify({score_breakdown:scores}),_editor_score:91,source_refs:Array.isArray(draft.source_refs)?draft.source_refs:JSON.parse(draft.source_refs||'[]'),body_markdown:draft.body_markdown+(editorCalls>1?'\n観察研究は因果関係を保証しません。':''),_editor_decision:'READY',_fact_check_status:'PASS'};
    },
    v065FetchJson_:(url,options)=>{bridgeRequests.push(JSON.parse(options.payload));return {code:200,json:{ok:true}};},
    v065SyncBridgeDirect_:(q,b)=>sandbox.v065FetchJson_('https://the-rev-website.vercel.app/api/integrations/editorial',{payload:JSON.stringify({content_id:q.content_id,body_markdown:b.body_markdown})})
  };
  if(primary)sandbox.v065GeneratePendingArticle_=function(){return primary(sandbox);};
  vm.createContext(sandbox);vm.runInContext(topic,sandbox);vm.runInContext(quality,sandbox);vm.runInContext(recovery,sandbox);
  return {sandbox,article,records,requests,bridgeRequests,counts:()=>({qcCalls,editorCalls,writerCalls})};
}
export function memoryDb(initial=[]) {
  const tables={editorial_topic_proposals:structuredClone(initial),editorial_line_receipts:[],editorial_gpt_operator_requests:[]};
  return {tables,from(table){let filters=[],op='select',patch,conflict,single=false,max=Infinity;
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},neq(k,v){filters.push(r=>r[k]!==v);return q;},order(){return q;},limit(n){max=n;return q;},or(){filters.push(r=>r.status!=='QUEUE_CREATED'||r.notification_status!=='SENT');return q;},maybeSingle(){single=true;return q;},update(p){op='update';patch=p;return q;},upsert(p,c){op='upsert';patch=p;conflict=c;return q;},then(resolve,reject){try{let rows=tables[table].filter(r=>filters.every(f=>f(r))).slice(0,max);if(op==='update')rows.forEach(r=>Object.assign(r,structuredClone(patch)));if(op==='upsert'){const found=tables[table].find(r=>r[conflict.onConflict]===patch[conflict.onConflict]);if(!found)tables[table].push(structuredClone(patch));else if(!conflict.ignoreDuplicates)Object.assign(found,structuredClone(patch));rows=[];}resolve({data:single?structuredClone(rows[0]||null):structuredClone(rows),error:null});}catch(e){reject(e);}}};return q;}};
}
