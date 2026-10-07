/**
 * THE REV. Editorial AI v0.7.3
 * Canonical trigger topology for Daily Editorial.
 *
 * Topic Approval ON:
 *   - Gate: 1/day
 *   - Topic Approval: every 10 minutes
 *   - Supervisor: existing trigger, untouched
 *   - Creator: 0
 *   - Watchdog: 0
 *
 * Topic Approval OFF:
 *   - Gate: 1/day
 *   - Creator: every hour
 *   - Watchdog: 1/day
 *   - Topic Approval: 0
 *
 * This file changes trigger topology only. It does not change cadence,
 * Auto Publish, Human Approval, Topic/Knowledge/Duplicate gates or content.
 */

var V073_TRIGGER_TOPOLOGY_VERSION = 'v0.7.3';
var V073_TOPIC_APPROVAL_POLL_MINUTES = 10;
var V073_TRIGGER_HANDLERS = [
  'scheduledDailyEditorialGateV069',
  'scheduledDailyEditorialCreatorV069',
  'scheduledDailyEditorialWatchdogV069',
  'scheduledDailyEditorialTopicApprovalV070'
];

function v073TopicApprovalEnabled_() {
  return String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() === 'TRUE';
}

function v073TriggerCounts_() {
  var counts = {};
  V073_TRIGGER_HANDLERS.forEach(function(h) { counts[h] = 0; });
  var supervisors = [];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var h = String(t.getHandlerFunction() || '');
    if (counts.hasOwnProperty(h)) counts[h] += 1;
    if (/^scheduledDailyEditorialSupervisorV0\d+$/.test(h)) supervisors.push(h);
  });
  return { controlled: counts, supervisors: supervisors };
}

function v073DeleteControlledTriggers_() {
  var removed = [];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var h = String(t.getHandlerFunction() || '');
    if (V073_TRIGGER_HANDLERS.indexOf(h) >= 0) {
      ScriptApp.deleteTrigger(t);
      removed.push(h);
    }
  });
  return removed;
}

function v073CreateCanonicalTriggers_(approval) {
  var created = [];
  ScriptApp.newTrigger('scheduledDailyEditorialGateV069')
    .timeBased().atHour(V069_GATE_HOUR).everyDays(1).inTimezone('Asia/Tokyo').create();
  created.push('scheduledDailyEditorialGateV069');

  if (approval) {
    if (typeof scheduledDailyEditorialTopicApprovalV070 !== 'function') {
      throw new Error('TOPIC_APPROVAL_SOURCE_NOT_INSTALLED');
    }
    ScriptApp.newTrigger('scheduledDailyEditorialTopicApprovalV070')
      .timeBased().everyMinutes(V073_TOPIC_APPROVAL_POLL_MINUTES).create();
    created.push('scheduledDailyEditorialTopicApprovalV070');
  } else {
    ScriptApp.newTrigger('scheduledDailyEditorialCreatorV069')
      .timeBased().everyHours(1).create();
    created.push('scheduledDailyEditorialCreatorV069');
    ScriptApp.newTrigger('scheduledDailyEditorialWatchdogV069')
      .timeBased().atHour(V069_WATCHDOG_HOUR).everyDays(1).inTimezone('Asia/Tokyo').create();
    created.push('scheduledDailyEditorialWatchdogV069');
  }
  return created;
}

function reconcileDailyEditorialTriggerTopologyV073() {
  if (typeof scheduledDailyEditorialGateV069 !== 'function') throw new Error('GATE_SOURCE_NOT_INSTALLED');
  if (typeof scheduledDailyEditorialCreatorV069 !== 'function') throw new Error('CREATOR_SOURCE_NOT_INSTALLED');
  if (typeof scheduledDailyEditorialWatchdogV069 !== 'function') throw new Error('WATCHDOG_SOURCE_NOT_INSTALLED');

  var approval = v073TopicApprovalEnabled_();
  var before = v073TriggerCounts_();
  var removed = v073DeleteControlledTriggers_();
  var created = v073CreateCanonicalTriggers_(approval);
  var after = v073TriggerCounts_();

  var expected = approval
    ? {
        scheduledDailyEditorialGateV069: 1,
        scheduledDailyEditorialCreatorV069: 0,
        scheduledDailyEditorialWatchdogV069: 0,
        scheduledDailyEditorialTopicApprovalV070: 1
      }
    : {
        scheduledDailyEditorialGateV069: 1,
        scheduledDailyEditorialCreatorV069: 1,
        scheduledDailyEditorialWatchdogV069: 1,
        scheduledDailyEditorialTopicApprovalV070: 0
      };

  Object.keys(expected).forEach(function(h) {
    if (Number(after.controlled[h] || 0) !== expected[h]) {
      throw new Error('TRIGGER_TOPOLOGY_READBACK_FAILED ' + h + '=' + after.controlled[h] + ' expected=' + expected[h]);
    }
  });

  var result = {
    status: 'RECONCILED',
    version: V073_TRIGGER_TOPOLOGY_VERSION,
    mode: approval ? 'TOPIC_APPROVAL' : 'LEGACY_CREATOR',
    removed: removed,
    created: created,
    before: before,
    after: after,
    supervisor_untouched: true,
    topic_approval_poll_minutes: approval ? V073_TOPIC_APPROVAL_POLL_MINUTES : null,
    auto_publish: false,
    human_approval: true
  };
  console.log(JSON.stringify(result));
  return result;
}

function inspectDailyEditorialTriggerTopologyV073() {
  var result = {
    version: V073_TRIGGER_TOPOLOGY_VERSION,
    mode: v073TopicApprovalEnabled_() ? 'TOPIC_APPROVAL' : 'LEGACY_CREATOR',
    triggers: v073TriggerCounts_(),
    topic_approval_poll_minutes: v073TopicApprovalEnabled_() ? V073_TOPIC_APPROVAL_POLL_MINUTES : null,
    auto_publish: false,
    human_approval: true
  };
  console.log(JSON.stringify(result));
  return result;
}
