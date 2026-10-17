/**
 * ONE-TIME 2026-10-14 fresh Audience v0.8 generation.
 * Paste this function into the existing bound DailyEditorialAutonomy_v069_Consistency
 * project and run runTodayEditorialAudienceV08Once manually.
 * NEVER deletes or overwrites existing candidates, triggers or owner approval.
 */
function runTodayEditorialAudienceV08Once() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('TODAY_V08_LOCK_BUSY');
  try {
    var date = v069TodayKey_();
    if (date !== '2026-10-14') throw new Error('TODAY_V08_WRONG_DATE ' + date);
    var props = PropertiesService.getScriptProperties();
    if (String(props.getProperty('THE_REV_AUDIENCE_DISCOVERY_MODE')).toUpperCase() !== 'ENFORCE')
      throw new Error('AUDIENCE_MODE_NOT_ENFORCE');
    var prefix = 'BT-20261014-AUD08-LIVE-';
    var key = 'THE_REV_AUDIENCE_LIVE_RUN_20261014';
    var sheet = ss_().getSheetByName('23_BLOG_TOPIC_SHORTLIST');
    var existing = getObjectsWithRow_(sheet).filter(function(r) {
      return String(r.candidate_id || '').indexOf(prefix) === 0;
    });
    if (existing.length === 5) {
      var result = {status:'ALREADY_SAVED',ids:existing.map(function(c) {return c.candidate_id;})};
      Logger.log(JSON.stringify(result));return result;
    }
    if (existing.length !== 0) throw new Error('AUDIENCE_LIVE_PARTIAL_WRITE_MANUAL_REVIEW_REQUIRED count=' + existing.length);
    if (props.getProperty(key) === 'SUCCESS') throw new Error('AUDIENCE_LIVE_ACK_MISMATCH');
    var week = getTargetWeekStart_(),ctx=buildM6Context_(week);
    ctx.weekly_editorial_brief = {
      brief:ctx.weekly_editorial_brief,
      direction:v080AudienceDirection_(props),
      blog_history:getObjectsWithRow_(ss_().getSheetByName('21_WEB_BLOG_OUTPUT'))
        .slice(-100).map(function(r) {return {title:r.title,query:r.target_keyword,status:r.status};})
    };
    var candidates = generateBlogTopicCandidates_(ctx,5);
    if (!Array.isArray(candidates) || candidates.length !== 5)
      throw new Error('AUDIENCE_LIVE_CANDIDATE_COUNT_INVALID');
    var roles={};
    candidates.forEach(function(c,i) {
      if (!String(c.title_candidate || '').trim() || !String(c.why_now || '').trim())
        throw new Error('AUDIENCE_LIVE_REQUIRED_FIELDS_' + (i+1));
      var note=String(c.notes || '');
      if (note.indexOf('AUDIENCE_V08:') !== 0) throw new Error('AUDIENCE_V08_NOTES_MISSING_'+(i+1));
      var m;
      try {m=JSON.parse(note.slice('AUDIENCE_V08:'.length));}
      catch (e) {throw new Error('AUDIENCE_V08_JSON_INVALID_'+(i+1));}
      if (['KNOWLEDGE','SERVICE_EXPERIENCE','FACILITY_AND_TRUST','COMPARISON_DECISION','COMMUNITY_STORY'].indexOf(m.editorial_role)<0 ||
        !m.editorial_role_reason || !m.reader_scene || !m.reader_job || !m.reader_question ||
        !m.new_reader_takeaway || !m.incremental_answer || !m.natural_service_fit ||
        !m.search_signal_type || !Array.isArray(m.evidence_items) || m.evidence_items.length===0 ||
        !['NEW_ARTICLE','HOLD_FOR_FACTS','UPDATE_EXISTING','REJECT'].includes(m.content_action) || m.unverified_health_claim === true)
        throw new Error('AUDIENCE_V08_CONTRACT_FAILED_'+(i+1));
      if (m.content_action === 'NEW_ARTICLE') roles[m.editorial_role]=true;
    });
    if (Object.keys(roles).length<3)
      throw new Error('AUDIENCE_LIVE_ROLE_DIVERSITY_INSUFFICIENT');
    candidates.forEach(function(c,i) {
      var scores=c.score_breakdown || {};
      var row=Object.assign({},c,scores,{
        candidate_id:prefix+(i+1),generated_at:new Date(),
        week_start:new Date(),rank:i+1,status:'CANDIDATE',decision:'PUBLISH',route_lane:'WEB_BLOG',
        total_score:Object.keys(scores).reduce(function(n,k){return n+Number(scores[k]||0);},0),
        selection_reason:'AUD08_LIVE_GAS_RUN_20261014'
      });
      appendObjectRow_(sheet,row);
    });
    var back=getObjectsWithRow_(sheet).filter(function(r){return String(r.candidate_id || '').indexOf(prefix)===0;});
    if (back.length!==5) throw new Error('AUDIENCE_LIVE_READBACK_FAILED count='+back.length);
    props.setProperty(key,'SUCCESS');
    var result={status:'GENERATED_AND_VERIFIED',count:back.length,roles:Object.keys(roles),
      ids:back.map(function(c){return c.candidate_id;})};
    Logger.log(JSON.stringify(result));return result;
  } finally {lock.releaseLock();}
}
