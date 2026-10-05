import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

function trigger(name) {
  return { getHandlerFunction: () => name };
}

function topologySandbox({ approval, initial = [] } = {}) {
  const triggers = initial.slice();
  const created = [];
  const deleted = [];
  const context = {
    console: { log: () => {} },
    String, Number, Boolean, Object, Array, JSON, Error,
    V069_GATE_HOUR: 4,
    V069_WATCHDOG_HOUR: 8,
    v069Settings_: () => ({ daily_editorial_topic_approval_required: approval ? 'TRUE' : 'FALSE' }),
    scheduledDailyEditorialGateV069: () => {},
    scheduledDailyEditorialCreatorV069: () => {},
    scheduledDailyEditorialWatchdogV069: () => {},
    scheduledDailyEditorialTopicApprovalV070: () => {},
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => {
        const i = triggers.indexOf(t);
        if (i >= 0) triggers.splice(i, 1);
        deleted.push(t.getHandlerFunction());
      },
      newTrigger: (name) => {
        const builder = {
          timeBased: () => builder,
          atHour: () => builder,
          everyDays: () => builder,
          everyHours: () => builder,
          everyMinutes: () => builder,
          inTimezone: () => builder,
          create: () => {
            const t = trigger(name);
            triggers.push(t);
            created.push(name);
            return t;
          }
        };
        return builder;
      }
    }
  };
  vm.createContext(context);
  const source = fs.readFileSync(new URL('../editorial/gas/DailyEditorialTriggerTopology_v0.7.3.gs', import.meta.url), 'utf8');
  vm.runInContext(source, context);
  return { context, triggers, created, deleted };
}

test('Topic Approval mode has one Gate + one Topic Approval trigger, no Creator/Watchdog', () => {
  const h = topologySandbox({
    approval: true,
    initial: [
      trigger('scheduledDailyEditorialGateV069'),
      trigger('scheduledDailyEditorialGateV069'),
      trigger('scheduledDailyEditorialCreatorV069'),
      trigger('scheduledDailyEditorialWatchdogV069'),
      trigger('scheduledDailyEditorialWatchdogV069'),
      trigger('scheduledDailyEditorialTopicApprovalV070'),
      trigger('scheduledDailyEditorialTopicApprovalV070'),
      trigger('scheduledDailyEditorialSupervisorV065')
    ]
  });
  const out = h.context.reconcileDailyEditorialTriggerTopologyV073();
  assert.equal(out.mode, 'TOPIC_APPROVAL');
  assert.deepEqual(
    JSON.parse(JSON.stringify(out.after.controlled)),
    {
      scheduledDailyEditorialGateV069: 1,
      scheduledDailyEditorialCreatorV069: 0,
      scheduledDailyEditorialWatchdogV069: 0,
      scheduledDailyEditorialTopicApprovalV070: 1
    }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(out.after.supervisors)), ['scheduledDailyEditorialSupervisorV065']);
  assert.equal(h.triggers.filter(t => t.getHandlerFunction() === 'scheduledDailyEditorialSupervisorV065').length, 1);
});

test('Legacy Creator mode has Gate + Creator + Watchdog and no Topic Approval trigger', () => {
  const h = topologySandbox({
    approval: false,
    initial: [
      trigger('scheduledDailyEditorialTopicApprovalV070'),
      trigger('scheduledDailyEditorialSupervisorV067')
    ]
  });
  const out = h.context.reconcileDailyEditorialTriggerTopologyV073();
  assert.equal(out.mode, 'LEGACY_CREATOR');
  assert.deepEqual(
    JSON.parse(JSON.stringify(out.after.controlled)),
    {
      scheduledDailyEditorialGateV069: 1,
      scheduledDailyEditorialCreatorV069: 1,
      scheduledDailyEditorialWatchdogV069: 1,
      scheduledDailyEditorialTopicApprovalV070: 0
    }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(out.after.supervisors)), ['scheduledDailyEditorialSupervisorV067']);
});

test('Creator and Watchdog do not execute Topic tick when approval is enabled', () => {
  const creator = fs.readFileSync(new URL('../editorial/gas/DailyEditorialCreator_v0.6.9.gs', import.meta.url), 'utf8');
  const gate = fs.readFileSync(new URL('../editorial/gas/DailyEditorialGate_v0.6.9.gs', import.meta.url), 'utf8');
  assert.match(
    creator,
    /DELEGATED_TO_TOPIC_APPROVAL_TRIGGER[^]*scheduledDailyEditorialTopicApprovalV070/
  );
  assert.doesNotMatch(
    creator.match(/function scheduledDailyEditorialCreatorV069Unlocked_\(force\) \{[^]*?\n\}/)?.[0] || '',
    /v070TopicTick_\(force\)/
  );
  assert.match(
    gate,
    /DELEGATED_TO_TOPIC_APPROVAL_TRIGGER[^]*scheduledDailyEditorialTopicApprovalV070/
  );
  assert.doesNotMatch(
    gate.match(/function scheduledDailyEditorialWatchdogV069Unlocked_\(\) \{[^]*?\n\}/)?.[0] || '',
    /v070TopicTick_\(false\)/
  );
});

test('Topology source keeps Supervisor outside controlled trigger deletion set', () => {
  const source = fs.readFileSync(new URL('../editorial/gas/DailyEditorialTriggerTopology_v0.7.3.gs', import.meta.url), 'utf8');
  assert.doesNotMatch(source.match(/var V073_TRIGGER_HANDLERS = \[[^]*?\];/)?.[0] || '', /Supervisor/);
  assert.match(source, /supervisor_untouched:\s*true/);
  assert.match(source, /auto_publish:\s*false/);
  assert.match(source, /human_approval:\s*true/);
});
