import { change, isObserved } from './facts.mjs';

function firstBy(signals, types) {
  return signals.find((item) => types.includes(item.type));
}

export function buildExecutiveBrief({ period, facts, signals, priorities }) {
  const revenueChange = change(facts.revenue.current, facts.revenue.previousComparable);
  let status = '経営データは一部未取得です。';
  if (isObserved(facts.revenue.current)) {
    status = period.partial
      ? `${period.label}は途中期間です。売上は前期間総額と単純比較しません。`
      : revenueChange.direction === 'UP' ? '売上は比較期間を上回っています。'
        : revenueChange.direction === 'DOWN' ? '売上は比較期間を下回っています。'
          : '売上は比較期間と同水準です。';
  }
  const changeSignal = firstBy(signals, ['CHANGE', 'OPPORTUNITY']);
  const riskSignal = firstBy(signals, ['RISK', 'DATA']);
  return {
    status,
    mostImportantChange: changeSignal?.observation || '比較可能な大きな変化はまだ確認できません。',
    bottleneckOrOpportunity: riskSignal?.observation || '明確なボトルネックは検出されていません。',
    nextMove: priorities[0]?.action || 'Data Healthを保ちながら現在の運用を継続してください。',
    evidence: [...new Set([...(changeSignal?.evidence || []), ...(riskSignal?.evidence || [])].map((item) => item.key))]
  };
}

export function buildPulse({ facts, signals, dataHealth }) {
  const has = (id) => signals.some((item) => item.id === id);
  const unknown = (items) => items.every((item) => !isObserved(item));
  const revenue = unknown([facts.revenue.current]) ? 'UNKNOWN'
    : has('CUSTOMER_PIPELINE_RISK') || has('CUSTOMER_FOLLOWUP_WATCH') ? 'WATCH' : 'STABLE';
  const growth = unknown([facts.growth.searchClicks, facts.growth.sessions]) ? 'UNKNOWN'
    : has('TRAFFIC_NOT_CONVERTING') || has('WEB_TRAFFIC_DECLINE') ? 'RISK'
      : has('SEARCH_CTR_OPPORTUNITY') ? 'WATCH' : 'STABLE';
  const customer = unknown([facts.customers.followUp, facts.customers.nextBooking]) ? 'UNKNOWN'
    : has('CUSTOMER_PIPELINE_RISK') ? 'RISK' : has('CUSTOMER_FOLLOWUP_WATCH') ? 'WATCH' : 'STABLE';
  const content = unknown([facts.editorial.ready, facts.editorial.published]) ? 'UNKNOWN'
    : has('EDITORIAL_EXECUTION_RISK') ? 'RISK' : facts.editorial.errors.value > 0 ? 'WATCH' : 'STABLE';
  const unhealthy = dataHealth.filter((item) => item.status !== 'OK');
  const data = unhealthy.some((item) => item.status === 'ERROR') ? 'RISK'
    : unhealthy.length ? 'WATCH' : 'GOOD';
  const reasonFor = (category) => signals.find((item) => {
    const map = {
      Revenue: ['CUSTOMER_PIPELINE_RISK', 'CUSTOMER_FOLLOWUP_WATCH'],
      Growth: ['TRAFFIC_NOT_CONVERTING', 'WEB_TRAFFIC_DECLINE', 'SEARCH_CTR_OPPORTUNITY'],
      Customer: ['CUSTOMER_PIPELINE_RISK', 'CUSTOMER_FOLLOWUP_WATCH'],
      Content: ['EDITORIAL_EXECUTION_RISK'], Data: ['DATA_QUALITY_RISK']
    };
    return map[category].includes(item.id);
  });
  return Object.entries({ Revenue: revenue, Growth: growth, Customer: customer, Content: content, Data: data }).map(([category, state]) => ({
    category, state, reason: reasonFor(category)?.observation || (state === 'UNKNOWN' ? '判断できるデータがありません。' : '重大な異常は検出されていません。'),
    evidence: reasonFor(category)?.evidence || []
  }));
}
