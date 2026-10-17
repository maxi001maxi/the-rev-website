// Temporary connector fallback. Runs the SAME pure Gate/Creator as the Bridge.
// No credentials, LLM selection, writes, publication, or replacement rules.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { planDailyCreation } from '../lib/dailyEditorialCreator.mjs';
import { evaluateEditorialReviewReady } from '../lib/editorialReadiness.mjs';

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
    articleHistory: input.articleHistory || [],
    outputRows: input.outputRows || [],
    evidenceByContentId: input.evidenceByContentId || {},
    now: new Date(input.now)
  });
  if (result.plan.decision.action === 'CREATE_NEW' &&
      (!Array.isArray(input.articleHistory) || !input.articleHistory.length || !Array.isArray(input.outputRows))) {
    throw new Error('complete articleHistory and outputRows are required before creating a candidate');
  }
  const review_readiness = Object.fromEntries(Object.entries(input.reviewInputsByContentId || {})
    .map(([id,value])=>[id,evaluateEditorialReviewReady({...value,contentId:id,settings:input.settings || {}})]));
  return { ...result, review_readiness, execution_mode: 'CONNECTOR_CANONICAL_PLAN', writes_performed: 0 };
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
