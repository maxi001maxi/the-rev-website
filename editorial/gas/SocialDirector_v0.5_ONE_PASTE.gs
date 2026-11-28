/**
 * THE REV. Social Director v0.5
 * ONE-PASTE add-on for the existing Editorial Apps Script project.
 *
 * Requires the existing Editorial bundle helpers:
 * - ss_ / getObjectsWithRow_
 * - buildM6Context_ / generateBlogTopicCandidates_
 * - v069PostJson_ / V069_STATUS_URL
 *
 * What it does:
 * 1) syncs actual published Social history from 01_POST_HISTORY / 04_PERFORMANCE
 * 2) creates exactly five Reel B candidates for today
 * 3) stores them in Supabase via the existing authenticated Bridge
 * 4) mirrors them to 39_SOCIAL_REEL_CANDIDATES
 * 5) sends the five choices to the existing official LINE recipient
 *
 * It never publishes Instagram content.
 */

var SOCIAL_V05_VERSION = 'v0.5';
var SOCIAL_V05_SHEET = '39_SOCIAL_REEL_CANDIDATES';
var SOCIAL_V05_PHASE = 'STORE_AWARENESS_BUILD';
var SOCIAL_V05_HOUR = 8;
var SOCIAL_V05_MINUTE = 30;
var SOCIAL_V05_MAX_HISTORY_DAYS = 7;
var SOCIAL_V05_TERRITORIES = [
  'FIRST_VISIT_PROCESS',
  'TRAINER_JUDGMENT',
  'STORE_SERVICE_EXPERIENCE',
  'PEOPLE_SPACE_LOCAL',
  'WILDCARD'
];

function socialV05Rows_(sheetName) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh) return [];
  return getObjectsWithRow_(sh);
}

function socialV05Bridge_(body) {
  if (typeof v069PostJson_ !== 'function' || !V069_STATUS_URL) throw new Error('SOCIAL_BRIDGE_HELPERS_MISSING');
  var r = v069PostJson_(V069_STATUS_URL, body);
  if (!r || r.code < 200 || r.code >= 300 || !r.json || r.json.ok !== true) {
    throw new Error('SOCIAL_BRIDGE_FAILED HTTP ' + String(r && r.code) + ' ' + String(r && r.body).slice(0,300));
  }
  return r.json;
}

function socialV05MetricMap_() {
  var map = {};
  socialV05Rows_('04_PERFORMANCE').forEach(function(r) {
    var id = String(r.post_id || '').trim();
    if (!id) return;
    map[id] = {
      reach: r.reach,
      views: r.views,
      likes: r.likes,
      saves: r.saves,
      shares: r.shares,
      comments: r.comments,
      profile_visits: r.profile_visits,
      website_clicks: r.website_clicks,
      source: '04_PERFORMANCE'
    };
  });
  return map;
}

function syncSocialPublishedHistoryV050() {
  var perf = socialV05MetricMap_();
  var posts = socialV05Rows_('01_POST_HISTORY')
    .filter(function(r) { return String(r.status || '').toUpperCase() === 'PUBLISHED' && String(r.post_id || '').trim(); })
    .slice(-200)
    .map(function(r) {
      return {
        platform: r.platform || 'Instagram',
        platform_media_id: String(r.post_id),
        permalink: r.post_url || '',
        publish_date: r.publish_date || '',
        format: r.format || '',
        title: r.title || '',
        topic: r.topic || '',
        angle: r.angle || '',
        hook: r.hook || '',
        main_claim: r.main_claim || '',
        caption: r.caption_or_script || '',
        content_lane: (perf[String(r.post_id)] && socialV05Rows_('04_PERFORMANCE').filter(function(x){return String(x.post_id)===String(r.post_id);})[0].content_lane) || '',
        source: r.source || '01_POST_HISTORY',
        source_ref: '01_POST_HISTORY',
        semantic_status: 'VERIFIED',
        metrics: perf[String(r.post_id)] || {}
      };
    });

  if (!posts.length) return {status:'NO_HISTORY',count:0};
  var total = 0;
  for (var i=0;i<posts.length;i+=50) {
    var result = socialV05Bridge_({action:'social_history_upsert',posts:posts.slice(i,i+50)});
    total += Number(result.result && result.result.count || 0);
  }
  return {status:'SYNCED',count:total};
}

function socialV05CanonicalHistory_() {
  var response = socialV05Bridge_({
    action:'social_history_list',
    days:120,
    limit:120
  });
  return Array.isArray(response.posts) ? response.posts : [];
}

function socialV05LatestPublishDate_() {
  var rows = socialV05CanonicalHistory_().filter(function(r){ return r && r.published_at; });
  if (!rows.length) return null;
  rows.sort(function(a,b){ return String(b.published_at).localeCompare(String(a.published_at)); });
  return new Date(rows[0].published_at);
}

function socialV05HistoryFreshness_() {
  var latest = socialV05LatestPublishDate_();
  if (!latest || isNaN(latest.getTime())) return {ok:false,days:null,reason:'PUBLISHED_HISTORY_MISSING'};
  var today = new Date();
  var days = Math.floor((today.getTime()-latest.getTime())/86400000);
  return {ok:days<=SOCIAL_V05_MAX_HISTORY_DAYS,days:days,latest:latest,reason:days<=SOCIAL_V05_MAX_HISTORY_DAYS?'FRESH':'PUBLISHED_HISTORY_STALE'};
}

function socialV05ResearchLens_() {
  return [
    'RESEARCH_CANON=v0.4.5_CONVERSION_CREATIVE_PLAYBOOK',
    '原則: Research is a lens, not a recipe. 固定テンプレート化せず、研究知見を判断レンズとして使う。',
    '候補ごとに主要な意思決定段階を1つ選ぶ: ATTENTION / INTEREST / TRUST / SELF_RELEVANCE / PREDICTABILITY_RISK_REDUCTION / VERIFICATION / TRIAL_CONSIDERATION。',
    '高関与サービスの不安を見る: 時間、身体、恥ずかしさ、人間関係、失敗、金銭。全部を1本に詰め込まない。',
    'TrustはABILITYだけでなくBENEVOLENCEとINTEGRITYも扱う。知識を語るより、観察・調整・止める判断・誠実な境界を見せる。',
    '「良さそう」と「自分も行けそう」は別。初心者の最初の一歩、予測できる流れ、無理にさせないProcessで自己関連性と自己効力感を作る。',
    'Service EvidenceはPeople / Process / Physical Evidenceで可視化する。設備名だけのカタログ投稿は禁止。',
    'Equipmentは equipment→why it exists→when used→service role→what is not claimed の順で考える。',
    'Localは地名を入れるだけにしない。仕事前後、来店動線、生活への入りやすさなどlife fitとして扱う。未確認の利便性は作らない。',
    'Brand Responseを狙う。黒・木目・間接照明、静けさ、トレーナーの手や観察、環境音などのブランド記憶と、プロフィール確認等の自然な次行動を両立させる。',
    'CTAはAudience Stateに合わせる。毎回予約CTAやDM誘導を置かない。CTAなしも正解。',
    'Performanceは可能性を狭める命令ではなく確率を更新する材料。高再生フォーマットをそのままコピーし続けない。',
    '候補を収束する前に内部で心理-led / service-proof-led / human-first-party-led / creative-wildcard-led を発散し、5案が意味的に異なることを確認する。',
    'Research用語や理論名はユーザー向け候補文に出さない。研究は企画の質にだけ反映する。'
  ].join('\n');
}

function socialV05Direction_(historyFreshness) {
  return [
    'THE REV.のSocial Directorとして、今日撮るReel B候補だけを5件提案する。本文や完成台本はまだ作らない。',
    '現在フェーズは STORE_AWARENESS_BUILD。Reel Aの豆知識・食事・一般トレーニング知識は外部委託ラインが担当しているため、同じ役割を作らない。',
    'Reel BはTHE REV.という店、人、サービス、初回来店、実際の判断、空間、地域との生活接続を見せる。',
    'Blogを短く要約した企画は禁止。同じテーマを使う場合も、Blog=説明、Reel B=実際の店・人・Process・Visual Proofに分ける。',
    '過去投稿とMain Claim / Visual / Serviceの重複を避ける。',
    '5案は必ず大きく違う方向にする。',
    '番号ごとの役割を守る: 1 FIRST_VISIT_PROCESS / 2 TRAINER_JUDGMENT / 3 STORE_SERVICE_EXPERIENCE / 4 PEOPLE_SPACE_LOCAL / 5 WILDCARD。',
    '各案はtitle_candidate、why_now、unique_angleを具体的に書く。15〜25秒程度で撮れる現実的な映像企画を想定する。',
    '未確認の顧客実績、現在の来店状況、健康効果を作らない。医療効果を断定しない。',
    '以下のResearch Canonを候補生成の判断に必ず使う。単なる一般LLM発想で穴埋めしない。',
    socialV05ResearchLens_(),
    '履歴鮮度=' + historyFreshness.reason + ' days=' + String(historyFreshness.days)
  ].join('\n');
}

function socialV05GenerateFive_() {
  if (typeof buildM6Context_ !== 'function' || typeof generateBlogTopicCandidates_ !== 'function') {
    throw new Error('SOCIAL_CANDIDATE_GENERATOR_MISSING');
  }
  var freshness = socialV05HistoryFreshness_();
  if (!freshness.ok) {
    return {status:'HISTORY_STALE',freshness:freshness,candidates:[]};
  }

  var ctx = buildM6Context_(getTargetWeekStart_());
  var canonicalHistory = socialV05CanonicalHistory_();
  var socialHistory = canonicalHistory.slice(0,80).map(function(r){
    var metrics = r.latest_metrics || {};
    return {
      publish_date:r.published_at,
      format:r.format || r.media_type,
      title:r.title,
      topic:r.topic,
      angle:r.angle,
      main_claim:r.main_claim,
      caption:r.caption,
      content_lane:r.content_lane,
      territory:r.territory,
      ownership:r.ownership,
      views:metrics.views,
      reach:metrics.reach,
      likes:metrics.likes,
      saves:metrics.saves,
      shares:metrics.shares,
      comments:metrics.comments,
      follows:metrics.follows,
      source:r.source
    };
  });
  var blogHistory = socialV05Rows_('21_WEB_BLOG_OUTPUT').slice(-80).map(function(r){
    return {title:r.title,target_keyword:r.target_keyword,status:r.status};
  });

  ctx.weekly_editorial_brief = {
    brief: ctx.weekly_editorial_brief,
    direction: socialV05Direction_(freshness),
    social_history: socialHistory,
    blog_history: blogHistory
  };

  var raw = generateBlogTopicCandidates_(ctx,5);
  if (!Array.isArray(raw) || raw.length !== 5) throw new Error('SOCIAL_FIVE_CANDIDATES_INVALID');

  return {
    status:'GENERATED',
    freshness:freshness,
    candidates:raw.map(function(c,i){
      var shoot = [6,6,7,6,8][i];
      return {
        title:c.title_candidate || c.topic || ('Reel候補 '+(i+1)),
        territory:SOCIAL_V05_TERRITORIES[i],
        business_job:i===0?'OBJECTION_REDUCTION':(i===1?'TRUST':'SERVICE_UNDERSTANDING'),
        audience_state:i===4?'AWARE':'EVALUATING',
        hook:c.preview_lead || c.audience_question || c.title_candidate || '',
        why_now:c.why_now || c.selection_reason || '',
        difference_from_history:c.unique_angle || c.local_angle || c.notes || '',
        asset_plan:'SELECTION_AFTER_CHOICE',
        estimated_shoot_minutes:shoot,
        score:Number(c.total_score || c.portfolio_final_score || 0)
      };
    })
  };
}

function socialV05WriteView_(payload) {
  var sh = ss_().getSheetByName(SOCIAL_V05_SHEET) || ss_().insertSheet(SOCIAL_V05_SHEET);
  var values = [['対象日','番号','状態','候補','Territory','なぜ今','過去投稿との差','撮影目安(分)']];
  (payload.candidates || []).forEach(function(c){
    values.push([
      payload.batch.target_date,
      c.candidate_no,
      c.status,
      c.title,
      c.territory,
      c.why_now || '',
      c.difference_from_history || '',
      c.estimated_shoot_minutes || ''
    ]);
  });
  if (sh.getMaxRows() < values.length) sh.insertRowsAfter(sh.getMaxRows(), values.length-sh.getMaxRows());
  sh.clearContents();
  sh.getRange(1,1,values.length,8).setValues(values).setWrap(true).setVerticalAlignment('top');
  sh.setFrozenRows(1);
  sh.getRange(1,1,1,8).setFontWeight('bold').setBackground('#d9e5dd');
  sh.setColumnWidth(1,110);sh.setColumnWidth(2,60);sh.setColumnWidth(3,110);
  sh.setColumnWidth(4,320);sh.setColumnWidth(5,180);sh.setColumnWidth(6,360);sh.setColumnWidth(7,360);sh.setColumnWidth(8,100);
}

function socialV05LineText_(payload) {
  var lines = ['THE REV.｜今日のReel B候補',''];
  (payload.candidates || []).forEach(function(c){
    lines.push(c.candidate_no + '｜' + c.title);
    lines.push('役割: ' + c.territory);
    if (c.why_now) lines.push('理由: ' + c.why_now);
    if (c.difference_from_history) lines.push('差分: ' + c.difference_from_history);
    lines.push('撮影目安: ' + String(c.estimated_shoot_minutes || '?') + '分');
    lines.push('');
  });
  lines.push('選択はChatGPTへ: SOCIAL-' + String(payload.batch.target_date).replace(/-/g,'') + ' 3');
  lines.push('選ぶまで完成台本・撮影指示は作りません。');
  return lines.join('\n').slice(0,4900);
}

function socialV05PushLine_(payload) {
  var props = PropertiesService.getScriptProperties();
  var token = String(props.getProperty('THE_REV_LINE_CHANNEL_ACCESS_TOKEN') || '').trim();
  var owner = String(props.getProperty('THE_REV_LINE_USER_ID') || '').trim();
  if (!token || !owner) throw new Error('SOCIAL_LINE_CONFIG_MISSING');

  var key = 'SOCIAL_V05_PUSH_' + payload.batch.target_date;
  if (props.getProperty(key)==='SENT') return {status:'ALREADY_SENT'};

  var r = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push',{
    method:'post',
    contentType:'application/json',
    muteHttpExceptions:true,
    headers:{Authorization:'Bearer '+token},
    payload:JSON.stringify({to:owner,messages:[{type:'text',text:socialV05LineText_(payload)}]})
  });
  var code = r.getResponseCode();
  if (code<200 || code>=300) throw new Error('SOCIAL_LINE_HTTP_'+code);
  props.setProperty(key,'SENT');
  socialV05Bridge_({
    action:'social_candidates_notification_ack',
    target_date:payload.batch.target_date,
    status:'SENT'
  });
  return {status:'SENT'};
}

function refreshSocialReelCandidatesV050() {
  // Legacy Sheet backfill remains safe, but canonical freshness and candidate context
  // are read back from Supabase so Metricool-synced posts are included.
  syncSocialPublishedHistoryV050();

  var target = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
  var existing = socialV05Bridge_({action:'social_candidates_poll',target_date:target});
  if (existing.batch && existing.candidates && existing.candidates.length===5) {
    socialV05WriteView_(existing);
    socialV05PushLine_(existing);
    return {status:'EXISTING',batch:existing.batch.id};
  }

  var generated = socialV05GenerateFive_();
  if (generated.status==='HISTORY_STALE') {
    var sh = ss_().getSheetByName(SOCIAL_V05_SHEET) || ss_().insertSheet(SOCIAL_V05_SHEET);
    sh.clearContents();
    sh.getRange(1,1,3,2).setValues([
      ['状態','HISTORY_STALE'],
      ['最終投稿からの日数',generated.freshness.days],
      ['対応','最新Instagram投稿の同期が完了するまで候補生成を停止']
    ]);
    return generated;
  }

  var prepared = socialV05Bridge_({
    action:'social_candidates_prepare',
    target_date:target,
    phase:SOCIAL_V05_PHASE,
    candidates:generated.candidates,
    source_context:{
      version:SOCIAL_V05_VERSION,
      history_freshness:generated.freshness,
      canonical_history_source:'SUPABASE_SOCIAL_PUBLISHED_POSTS',
      reel_a:'EXTERNAL_DISCOVERY_KNOWLEDGE',
      reel_b:'OWNED_STORE_EXPERIENCE_PROOF',
      research_canon:'V0.4.5_CONVERSION_CREATIVE_PLAYBOOK',
      research_mode:'LENS_NOT_RECIPE'
    }
  });
  socialV05WriteView_(prepared);
  socialV05PushLine_(prepared);
  return {status:'PREPARED',batch:prepared.batch.id};
}

function chooseSocialCandidateV050(candidateNo) {
  var target = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
  var result = socialV05Bridge_({
    action:'social_candidates_choose',
    target_date:target,
    candidate_no:Number(candidateNo)
  });
  var current = socialV05Bridge_({action:'social_candidates_poll',target_date:target});
  socialV05WriteView_(current);
  return result;
}

function scheduledSocialReelCandidatesV050() {
  try { return refreshSocialReelCandidatesV050(); }
  catch(e) {
    Logger.log('SOCIAL_V05_ERROR '+String(e));
    return {status:'ERROR',error:String(e)};
  }
}

function installSocialDirectorV050() {
  var existing = ScriptApp.getProjectTriggers().filter(function(t){
    return t.getHandlerFunction()==='scheduledSocialReelCandidatesV050';
  });
  if (!existing.length) {
    ScriptApp.newTrigger('scheduledSocialReelCandidatesV050')
      .timeBased().atHour(SOCIAL_V05_HOUR).nearMinute(SOCIAL_V05_MINUTE).everyDays(1).create();
  }
  return inspectSocialDirectorV050();
}

function inspectSocialDirectorV050() {
  var target = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
  var freshness = socialV05HistoryFreshness_();
  var poll = null;
  try { poll=socialV05Bridge_({action:'social_candidates_poll',target_date:target}); } catch(e) {}
  return {
    version:SOCIAL_V05_VERSION,
    target_date:target,
    timezone:Session.getScriptTimeZone(),
    history_freshness:freshness,
    canonical_history_count:socialV05CanonicalHistory_().length,
    trigger_count:ScriptApp.getProjectTriggers().filter(function(t){
      return t.getHandlerFunction()==='scheduledSocialReelCandidatesV050';
    }).length,
    batch:poll&&poll.batch?{id:poll.batch.id,status:poll.batch.status}:null,
    candidates:poll&&poll.candidates?poll.candidates.length:0,
    auto_publish:false
  };
}
