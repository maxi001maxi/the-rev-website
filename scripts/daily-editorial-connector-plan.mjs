// Temporary connector fallback. Runs the SAME pure Gate/Creator as the Bridge.
// No credentials, LLM selection, writes, publication, or replacement rules.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { planDailyCreation } from '../lib/dailyEditorialCreator.mjs';

export function connectorDailyPlan(input) {
  if (!input || !Array.isArray(input.rows) || !Array.isArray(input.shortlist)) {
    throw new Error('rows and shortlist must be arrays from the live Master sheet');
  }
  if (!input.now || !Number.isFinite(new Date(input.now).getTime())) {
    throw new Error('now must be an explicit valid timestamp');
  }
  const result = planDailyCreation({
    rows: input.rows,
    shortlist: input.shortlist,
    settings: input.settings || {},
    evidenceByContentId: input.evidenceByContentId || {},
    now: new Date(input.now)
  });
  return { ...result, execution_mode: 'CONNECTOR_CANONICAL_PLAN', writes_performed: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = connectorDailyPlan(JSON.parse(readFileSync(0, 'utf8')));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`Daily connector plan failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
