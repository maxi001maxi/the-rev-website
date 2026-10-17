import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../editorial/gas/DailyEditorialQuality_v0.8.0.gs',import.meta.url),'utf8');
let passed=0;
function check(value,message){assert.ok(value,message);passed++;}
function harness(mode, {dropSafety=false, invalidScore=false, qcUnverified=false,ownerInterview=false,officialSource=false}={}) {
  const scores={title_hook:12,seo_intent:12,human_voice:12,readability:12,length_efficiency:8,originality:8,brand_fit:8,fact_safety:invalidScore?15:9};
  const original='減圧を確認。'+ '安全に過ごす。'.repeat(230);
  const edited=(dropSafety?'準備を確認。':'減圧を確認。')+'具体的に進める。'.repeat(210);
  let apiCalls=0, requests=[];
  const ctx={
    console,isFinite,PropertiesService:{getScriptProperties:()=>({getProperty:()=>mode})},
    getSettings_:()=>({blog_editor_model:'test-only'}),
    parseStructuredResponse_:()=>({scores:{question_resolution:4,understanding_gain:4,decision_support:4,concreteness_evidence:3,originality_readability:3},issues:[],source_unverified:qcUnverified,reason:'test response'}),
    openAIRequest_:(endpoint,payload)=>{apiCalls++;requests.push(payload);return {status:'completed'};},
    finalizeWebBlog_:()=>({title:'体験の流れ',body_markdown:edited,article_type:'STANDARD',source_refs:officialSource?['https://www.caa.go.jp/policies/council/csic/report/report_024/assets/csic_cms201_260527_11.pdf']:['S001'],_editor_score:Object.values(scores).reduce((a,b)=>a+b,0),_editor_notes:JSON.stringify({score_breakdown:scores}),_editor_decision:'READY',_fact_check_status:'PASS'})
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);
  const result=ctx.finalizeWebBlog_({article_type:'STANDARD',body_markdown:original},{verified_public_facts:[],blocked_facts:[],first_party_interview:ownerInterview?{source_id:'TP-20261015',raw_answer:'小さな違和感も伝えてほしい。'}:null});
  return {ctx,result,apiCalls,requests};
}
for(const mode of ['OFF','SHADOW','ENFORCE']){
  const h=harness(mode);
  check(h.result._editor_decision==='READY',mode+': clean article remains READY');
  check(h.apiCalls===(mode==='ENFORCE'?1:0),mode+': independent QC calls expected number');
  check(mode==='OFF'?!JSON.parse(h.result._editor_notes).quality_v080:JSON.parse(h.result._editor_notes).quality_v080.mode===mode,mode+': audit metadata');
}
check(harness('ENFORCE',{invalidScore:true}).result._editor_decision==='REVIEW_REQUIRED','invalid legacy score is blocked');
check(harness('ENFORCE',{dropSafety:true}).result._editor_decision==='REVIEW_REQUIRED','missing safety wording blocked');
check(harness('ENFORCE',{qcUnverified:true}).result._editor_decision==='REVIEW_REQUIRED','independent QC source uncertainty blocks');
check(harness('SHADOW',{invalidScore:true}).result._editor_decision==='READY','shadow does not change READY');
{
  const h=harness('ENFORCE'), template=name=>({text:{format:{name}},input:[{content:[{type:'input_text',text:'base'}]}]});
  const writer=template('web_blog_draft_v1'),editor=template('web_blog_final_editor_v1'),gbp=template('gbp_post_output');
  h.ctx.openAIRequest_('responses',writer);h.ctx.openAIRequest_('responses',editor);h.ctx.openAIRequest_('responses',gbp);
  check(writer.input[0].content.length===2,'writer prompt enhanced');
  check(editor.input[0].content.length===2,'editor prompt enhanced');
  check(gbp.input[0].content.length===1,'GBP prompt untouched');
}

{
  const h=harness('ENFORCE',{ownerInterview:true,officialSource:true});
  const payload=JSON.parse(h.requests[0].input[1].content[0].text);
  check(payload.qc_evidence.first_party_owner_interview.source_id==='TP-20261015','owner interview provenance passed to independent QC');
  check(payload.qc_evidence.first_party_owner_interview.raw_answer.includes('違和感'),'approved primary-source answer supplied');
  check(payload.qc_evidence.verified_official_excerpts.length===1,'exact official PDF unlocks narrow evidence');
  const missing=harness('ENFORCE');
  const none=JSON.parse(missing.requests[0].input[1].content[0].text).qc_evidence;
  check(none.first_party_owner_interview===null && none.verified_official_excerpts.length===0,'no interview or exact PDF does not inherit evidence');
}


{
  let mutations=[];
  const queue={name:'queue',rows:[{
    __row:23,content_id:'BLOG-20261015-fac1fd',
    queue_status:'REVIEW_REQUIRED',draft_status:'REVIEW_REQUIRED',
    last_error:'Final Editor / Fact / Topic Gate requires review',
    knowledge_context_json:JSON.stringify({topic_approval:{proposal_id:'TP-20261015'},interview:[{answer:'小さい痛みも共有する'},{answer:'運動中の違和感を優先して伝える'}]}),notes:'Original owner topic approval'
  }]};
  const blog={name:'blog',rows:[{content_id:'BLOG-20261015-fac1fd',status:'REVIEW_REQUIRED',editor_notes:JSON.stringify({quality_v080:{mode:'ENFORCE',independent:{pass:false}}})}]};
  const lock={tryLock:()=>true,releaseLock:()=>{}};
  const ctx={console,isFinite,Date,JSON,
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'ENFORCE'})},
    LockService:{getScriptLock:()=>lock},
    ss_:()=>({getSheetByName:n=>n==='26_DAILY_EDITORIAL_QUEUE'?queue:n==='21_WEB_BLOG_OUTPUT'?blog:null}),
    getObjectsWithRow_:s=>s.rows,
    setObjectRow_:(s,i,patch)=>{mutations.push({i,patch});Object.assign(s.rows[0],patch);},
    getSettings_:()=>({blog_editor_model:'test-only'}),
    parseStructuredResponse_:()=>({scores:{question_resolution:4,understanding_gain:4,decision_support:4,concreteness_evidence:4,originality_readability:4},issues:[],source_unverified:false,reason:'test'}),
    openAIRequest_:()=>({status:'completed'}),
    finalizeWebBlog_:()=>({title:'test',body_markdown:'安全な記事',source_refs:['S001'],_editor_score:0,_editor_notes:'{}'})
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);
  const first=ctx.requeueOct15EditorialIndependentQcReview();
  check(first.status==='REQUEUED_FOR_CANONICAL_QC'&&mutations.length===1,'scoped QC fail requeued without approval override');
  check(queue.rows[0].queue_status==='PATCHING'&&queue.rows[0].draft_status==='NOT_STARTED','canonical retriable queue state recorded');
  const again=ctx.requeueOct15EditorialIndependentQcReview();
  check(again.status==='NOOP_NOT_QC_REVIEW'&&mutations.length===1,'duplicate call is a no-op');
}

console.log('Phase5I tests:',passed,'PASS');
