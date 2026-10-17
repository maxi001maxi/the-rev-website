/** Live acceptance: existing status reconciliation + bounded evidence only.
 * No article creation, body rewrite, publication, posting or cadence change.
 */
function runEditorialConsistencyAcceptanceV1() {
  var id = 'BLOG-20261005-dd6e13';
  var queue = v069QueueRows_();
  var q = queue.rows.filter(function(r) { return r.content_id === id; })[0];
  if (!q) throw new Error('Acceptance article is missing');
  var image = v065CheckImageDirect_(q);
  var current = v069QueueRows_().rows.filter(function(r) { return r.content_id === id; })[0];
  var bridge = getObjectsWithRow_(ss_().getSheetByName('25_WEB_PUBLISH_BRIDGE')).filter(function(r) { return r.content_id === id; })[0];
  var gbp = getObjectsWithRow_(ss_().getSheetByName('22_GBP_POST')).filter(function(r) { return r.parent_blog_id === id; });
  var output = getObjectsWithRow_(ss_().getSheetByName('21_WEB_BLOG_OUTPUT'));
  var shortlist = v069cShortlist_();
  // Tomorrow's run prepares Tuesday's article. Probe the real inputs without
  // calling the Creator or writing a new Queue/candidate row.
  var probe = v069PostJson_(V069_STATUS_URL, {action:'daily_create',now:'2026-10-04T20:00:00.000Z',
    rows:v069QueueRows_().rows.map(function(r){return v069cSlim_(r,V069C_PLAN_FIELDS);}),
    shortlist:shortlist.rows.map(function(r){return v069cSlim_(r,V069C_SHORTLIST_FIELDS);}),
    outputRows:output.map(function(r){var x=v069cSlim_(r,['content_id','title','slug_suggestion','target_keyword','search_intent','meta_description','article_type']);
      x.body_summary=String(r.body_markdown||'').replace(/\s+/g,' ').slice(0,1800);return x;}),settings:v069Settings_()});
  var p=probe.json||{};
  var imageView=ss_().getSheetByName('記事別画像'),gbpView=ss_().getSheetByName('Googleビジネス投稿');
  var evidence={version:'consistency-v1',runtime:V069C_CONSISTENCY_RUNTIME,executed_at:new Date().toISOString(),
    source_rows:{queue:queue.rows.length,output:output.length,shortlist:shortlist.rows.length},
    human_rejection:{content_id:id,ready:image.ready,reason:image.reason,queue_status:current.queue_status,
      bridge_status:bridge.bridge_status,image_status:bridge.image_status,gbp_statuses:gbp.map(function(r){return r.image_status;})},
    length:{standard_short:v069cLengthGate_('STANDARD',Array(901).join('文')).pass,
      expert_short:v069cLengthGate_('EXPERT_DEEP_DIVE',Array(930).join('文')).pass,
      expert_valid:v069cLengthGate_('EXPERT_DEEP_DIVE',Array(1682).join('文')).pass},
    next_run_probe:{http:probe.code,ok:p.ok,run_date:p.plan&&p.plan.run_date,target_date:p.plan&&p.plan.target_date,
      cadence:p.plan&&p.plan.cadence,decision:p.plan&&p.plan.decision,creation_status:p.creation&&p.creation.status,
      creation_reason:p.creation&&p.creation.reason,candidate_id:p.creation&&p.creation.candidate_id,
      interview_candidates:p.creation&&p.creation.interview_candidates},
    views:{image_latest:imageView.getRange('C2:D2').getDisplayValues()[0],image_gbp:imageView.getRange('M2:N2').getDisplayValues()[0],
      gbp_latest:gbpView.getRange('A2:C2').getDisplayValues()[0],gbp_status:gbpView.getRange('G2:K2').getDisplayValues()[0],
      image_dynamic:!!imageView.getRange('C2').getFormula(),gbp_dynamic:!!gbpView.getRange('A2').getFormula()},
    triggers:ScriptApp.getProjectTriggers().map(function(t){return t.getHandlerFunction();})};
  console.log(JSON.stringify(evidence));
  return evidence;
}
