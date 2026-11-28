/** Owner-authorized v0.8.2 rollout, 2026-10-21. No paid calls, triggers or publishing. */
function inspectEditorialProductionV082(){
  var p=PropertiesService.getScriptProperties(),st=getSettings_();
  var result={event:'EDITORIAL_V082_PRODUCTION_READBACK',at:new Date().toISOString(),
    recovery_mode:p.getProperty('THE_REV_EDITORIAL_RECOVERY_V082_MODE'),
    quality_mode:p.getProperty('THE_REV_EDITORIAL_QUALITY_V08_MODE'),
    loaded_quality_mode:V080_QUALITY_MODE,recovery_adapter:V082_PRIMARY_ADAPTER,
    auto_publish:String(st.auto_publish),human_approval:String(st.human_approval),
    bridge_secret_present:Boolean(v065BridgeSecret_()),
    triggers:ScriptApp.getProjectTriggers().map(function(t){return {handler:t.getHandlerFunction(),id:t.getUniqueId(),event:String(t.getEventType()),source:String(t.getTriggerSource())};}),
    imported_qc_calls:v082ImportedQcCalls_('TP-20261021').length,
    article:getObjectsWithRow_(ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE')).filter(function(q){return q.content_id==='BLOG-20261021-4ac8fd';}).map(function(q){return {content_id:q.content_id,queue_status:q.queue_status,draft_status:q.draft_status,image_status:q.image_status,failed_stage:q.failed_stage,next_stage:q.next_stage,human_action_required:q.human_action_required};}),
    generation_calls:0,publish_invoked:false,gbp_posted:false};
  Logger.log(JSON.stringify(result));return result;
}
function enableEditorialProductionV082(){
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw Error('ROLLOUT_BUSY');
  try{
    var before=inspectEditorialProductionV082(),p=PropertiesService.getScriptProperties();
    if(String(before.auto_publish).toUpperCase()!=='FALSE'||String(before.human_approval).toUpperCase()!=='TRUE')throw Error('HUMAN_PUBLISH_GATE_UNSAFE');
    if(before.triggers.filter(function(t){return t.handler==='scheduledDailyEditorialSupervisorV065';}).length!==1)throw Error('PRIMARY_SUPERVISOR_COUNT_INVALID');
    var journal=v082Journal_({slug_suggestion:'night-workout-sleep-timing-intensity'},{first_party_interview:{source_id:'TP-20261021'}},function(){});
    if(journal.calls.filter(function(c){return c.imported===true;}).length<3)throw Error('SPENT_QC_HISTORY_NOT_PRESERVED');
    p.setProperty('THE_REV_EDITORIAL_QUALITY_V08_MODE','ENFORCE');
    p.setProperty('THE_REV_EDITORIAL_RECOVERY_V082_MODE','ENFORCE');
    var after=inspectEditorialProductionV082();
    if(after.quality_mode!=='ENFORCE'||after.recovery_mode!=='ENFORCE')throw Error('ROLLOUT_READBACK_FAILED');
    if(JSON.stringify(before.triggers)!==JSON.stringify(after.triggers))throw Error('UNEXPECTED_TRIGGER_CHANGE');
    Logger.log(JSON.stringify({event:'EDITORIAL_V082_ENABLED',at:new Date().toISOString(),trigger_count:after.triggers.length,existing_qc_calls:journal.calls.length,additional_api_calls:0,loaded_mode_recheck_required:true}));
    return after;
  }finally{lock.releaseLock();}
}
