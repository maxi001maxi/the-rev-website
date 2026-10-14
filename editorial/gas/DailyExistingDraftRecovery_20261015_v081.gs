/**
 * Resume ONLY the owner-selected 2026-10-15 article from its existing draft.
 * Preserves Writer output / topic approval; reruns Editor + independent QC.
 * CMS/GBP publishing is never invoked.
 */
function repairApprovedDailyExistingDraftV081(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1500))throw new Error('DAILY_RECOVERY_LOCKED');
 const id='BLOG-20261015-fac1fd', key='THE_REV_EXISTING_DRAFT_RECOVERY_'+id;
 const props=PropertiesService.getScriptProperties();
 try{
  const st=getSettings_();if(v065Token_(st.auto_publish)==='TRUE')throw new Error('AUTO_PUBLISH_MUST_BE_OFF');
  const qsh=ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE'),bsh=ss_().getSheetByName('21_WEB_BLOG_OUTPUT'),gsh=ss_().getSheetByName('22_GBP_POST');
  const q=getObjectsWithRow_(qsh).find(r=>String(r.content_id||'')===id);
  const old=getObjectsWithRow_(bsh).find(r=>String(r.content_id||'')===id);
  if(!q||!old)throw new Error('EXISTING_APPROVED_DRAFT_MISSING');
  const gate=v065Json_(q.topic_gate_json,{}),knowledge=v065Json_(q.knowledge_context_json,{});
  if(q.topic_candidate_id!=='BT-20261014-AUD08-LIVE-3'||!knowledge.topic_approval||!knowledge.topic_approval.approved_at)throw new Error('OWNER_TOPIC_APPROVAL_MISSING');
  if(props.getProperty(key)==='SUCCESS'&&old.status==='READY'){Logger.log(JSON.stringify({status:'EXISTING_SUCCESS_PRESERVED',content_id:id}));return;}
  const approvedAnswers=Array.isArray(knowledge.interview)?knowledge.interview:[];
  const interview=gate.first_party_interview||(knowledge.source_id==='TP-20261015'&&knowledge.topic_approval.proposal_id==='TP-20261015'&&approvedAnswers.length===2&&approvedAnswers.every(x=>String(x.answer||'').trim())?{source_id:knowledge.source_id,raw_answer:approvedAnswers.map((x,i)=>String(i+1)+'. '+String(x.question||'')+'\n'+String(x.answer)).join('\n\n'),main_claim:knowledge.main_claim||'',topic_candidate_id:q.topic_candidate_id,extracted_insights:[],usable_quotes:[]}:null);
  if(!interview||!interview.raw_answer||interview.source_id!=='TP-20261015')throw new Error('APPROVED_FIRST_PARTY_EVIDENCE_MISSING');
  const ctx=buildM6Context_(v065WeekDate_(q.week_start||q.run_date));ctx.first_party_interview=interview;
  const parse=v=>v065Json_(v,[]);
  const refs=parse(old.source_refs),urls=parse(old.source_urls);
  const safetyUrl='https://kennet.mhlw.go.jp/information/information/exercise/s-00-008.html';
  if(!refs.some(r=>String(r).indexOf(safetyUrl)!==-1))refs.push('厚生労働省「身体活動・運動を安全に行うためのポイント」 '+safetyUrl);
  if(!urls.includes(safetyUrl))urls.push(safetyUrl);
  const narrow=v080QcEvidence_({source_refs:refs},ctx);
  ctx.verified_public_facts=(ctx.verified_public_facts||[]).concat(narrow.verified_official_excerpts.map(s=>({source_type:s.source_type,source_url:s.url,verified_at:s.verified_at||'2026-10-14',verified_points:s.verified_points,scope:s.scope})));
  let body=String(old.body_markdown||'');
  if(body.indexOf('### 運動を続けず、まず止めるサイン')===-1){
   const safety='### 運動を続けず、まず止めるサイン\n\n胸の痛み、動悸、めまいやふらつき、冷や汗、いつもと違う強い疲れ、関節や筋肉の強い痛みが出たら、軽く試して様子を見る場面ではありません。直ちに運動を中止し、スタッフに伝えてください。必要に応じて医療機関に相談します。これは厚生労働省が案内する一般的な注意点であり、ジムで病名や治療の必要性を判断するものではありません。([運動を安全に行うためのポイント]('+safetyUrl+'))\n\n';
   body=body.replace('## 運動が苦手だった経験も、隠さなくていい',safety+'## 運動が苦手だった経験も、隠さなくていい');
  }
  if(body.indexOf('## THE REV.で初回を迎える前に')===-1)body+='\n\n## THE REV.で初回を迎える前に\n\nTHE REV.では、運動との関係が自分では分からない小さな痛みや違和感も、できれば共有してほしいと考えています。予約前に「気になる場所」「気になる動き」「当日の体調」を短くメモしておくと、言い出すきっかけになります。初回にすべてを話し切ることは強制していません。動いてから気になったことや思い出したことがあれば、その時点でお伝えください。体験では運動の内容に加え、自分の疑問を相談しやすいかも確かめてみてください。';
  gate.article_type='STANDARD';gate.target_char_count=1800;gate.style_standard_version='v2';
  const draft={should_publish:true,skip_reason:'',title:String(old.title||''),slug_suggestion:String(old.slug_suggestion||''),search_intent:String(old.search_intent||''),target_keyword:String(old.target_keyword||''),meta_description:String(old.meta_description||''),lead:String(old.lead||''),body_markdown:body,cta:String(old.cta||''),internal_link_suggestions:parse(old.internal_link_suggestions),source_refs:refs,article_type:'STANDARD',target_char_count:1800,notes:String(old.notes||'')+' | Existing Writer preserved; safety/format/evidence recovery v081',_source_urls:urls,_topic_gate:gate};
  const evidence={owner_source:interview.source_id,official_sources:narrow.verified_official_excerpts.map(s=>s.url),writer_preserved:true};
  Logger.log(JSON.stringify({event:'EXISTING_DRAFT_EDITOR_QC_BEGIN',content_id:id,chars:String(body).replace(/\s/g,'').length,evidence:evidence}));
  const final=finalizeWebBlog_(draft,ctx);final._source_urls=urls;final._topic_gate=gate;
  const details=v065Json_(final._editor_notes,{}),quality=details.quality_v080;
  const ready=final._editor_decision==='READY'&&final._fact_check_status==='PASS'&&quality&&quality.passed===true&&quality.independent&&quality.independent.pass===true;
  const doc=createOrUpdateBlogDoc_(old,final,id);
  const patch={generated_at:new Date(),title:final.title,slug_suggestion:final.slug_suggestion,search_intent:final.search_intent,target_keyword:final.target_keyword,meta_description:final.meta_description,lead:final.lead,body_markdown:final.body_markdown,cta:final.cta,internal_link_suggestions:final.internal_link_suggestions,source_refs:final.source_refs,source_urls:urls,doc_url:doc,status:ready?'READY':'REVIEW_REQUIRED',editor_score:final._editor_score,editor_decision:final._editor_decision,editor_passes:final._editor_passes,editor_notes:final._editor_notes,compression_percent:final._compression_percent,fact_check_status:final._fact_check_status,article_type:'STANDARD',target_char_count:1800,topic_gate_notes:JSON.stringify(gate),style_standard_version:'v2',notes:draft.notes};
  setObjectRow_(bsh,old.__row,patch);
  if(!ready){setObjectRow_(qsh,q.__row,{queue_status:'REVIEW_REQUIRED',draft_status:'REVIEW_REQUIRED',failed_stage:'INDEPENDENT_QC',next_stage:'REPAIR_QC',last_error:JSON.stringify(quality&&quality.independent||details),updated_at:new Date()});Logger.log(JSON.stringify({status:'QC_NOT_PASSED',content_id:id,quality:quality}));return;}
  const gbp=generateGBPFromBlog_(final,ctx),gex=getObjectsWithRow_(gsh).find(r=>r.parent_blog_id===id);
  const gid=gex?gex.content_id:'GBP-'+id;
  const gobj={generated_at:new Date(),week_start:q.week_start,content_id:gid,parent_blog_id:id,title:gbp.title,body_copy_paste:gbp.body_copy_paste,cta_text:gbp.cta_text,local_context:gbp.local_context,blog_url_placeholder:'[BLOG_URL]',status:'READY',post_ready:'BLOCKED_URL',notes:gbp.notes+' | Owner-approved daily article / Google posting requires human review'};
  if(gex)setObjectRow_(gsh,gex.__row,gobj);else appendObjectRow_(gsh,gobj);
  setObjectRow_(qsh,q.__row,{queue_status:'BRIDGE_SYNCING',draft_status:'READY',editor_score:final._editor_score,gbp_id:gid,last_successful_stage:'BLOG_QC_PASSED',failed_stage:'',next_stage:'WEB_BRIDGE',last_error:'',updated_at:new Date()});
  try{
   const blog=Object.assign({},old,patch),bridge=v065SyncBridgeDirect_(q,blog);
   setObjectRow_(qsh,q.__row,{queue_status:bridge.bridge_status==='PREVIEW_READY'?'REVIEW_READY':'IMAGE_PREPARING',draft_status:'READY',image_status:bridge.image_status||'PREPARING',review_url:bridge.review_url,web_bridge_status:bridge.bridge_status,last_successful_stage:'WEB_BRIDGE',next_stage:'IMAGE_QC',last_error:'',updated_at:new Date()});
   props.setProperty(key,'SUCCESS');
   Logger.log(JSON.stringify({status:'EDITOR_QC_PASSED_AND_CMS_SYNCED',content_id:id,quality:quality,gbp_id:gid,bridge:bridge,auto_publish:false,google_post_sent:false,evidence:evidence}));
  }catch(e){setObjectRow_(qsh,q.__row,{queue_status:'BRIDGE_ERROR',draft_status:'READY',failed_stage:'WEB_BRIDGE',next_stage:'WEB_BRIDGE',last_error:String(e),updated_at:new Date()});throw e;}
 }finally{lock.releaseLock();}
}

