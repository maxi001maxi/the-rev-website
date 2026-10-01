import { change, isObserved } from './facts.mjs';

const CONFIDENCE = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' });

function evidence(...facts) {
  return facts.filter(Boolean).map((item) => ({
    key: item.key, status: item.status, value: item.value, unit: item.unit,
    source: item.source, updatedAt: item.updatedAt, quality: item.quality
  }));
}

function signal(id, type, title, observation, hypothesis, impact, action, confidence, facts, priority = null) {
  return { id, type, title, observation, hypothesis, impact, action, confidence, evidence: evidence(...facts), priority };
}

function metricChange(facts, key) {
  return change(facts.growth[key], facts.growth[`${key}Previous`]);
}

function ctaTotal(facts, suffix = '') {
  const values = ['reserveCta', 'lineCta', 'priceCta', 'articleCta'].map((key) => facts.growth[`${key}${suffix}`]);
  if (!values.every(isObserved)) return null;
  return values.reduce((total, item) => total + item.value, 0);
}

export function buildSignals({ facts, editorialSchedule = [], dataHealth = [], searchRange = '28d', now = new Date() }) {
  const signals = [];
  const clickChange = metricChange(facts, 'searchClicks');
  const sessionChange = metricChange(facts, 'sessions');
  const currentCta = ctaTotal(facts);
  const previousCta = ctaTotal(facts, 'Previous');

  if (clickChange.direction === 'UP' && sessionChange.direction === 'UP' && currentCta !== null && previousCta !== null && currentCta <= previousCta) {
    signals.push(signal(
      'TRAFFIC_NOT_CONVERTING', 'RISK', '流入増がCTAへ波及していません',
      `検索クリックと訪問は増えていますが、CTAは${currentCta === previousCta ? '横ばい' : '減少'}です。`,
      '訪問後の導線、訴求、計測のいずれかにボトルネックがある可能性があります。',
      '集客増が問い合わせ・予約につながらない状態が続く可能性があります。',
      '予約・LINE導線を実機で確認し、流入上位ページから優先して改善してください。',
      CONFIDENCE.HIGH,
      [facts.growth.searchClicks, facts.growth.searchClicksPrevious, facts.growth.sessions, facts.growth.sessionsPrevious, facts.growth.reserveCta, facts.growth.lineCta],
      { class: 'NOW', impact: 5, urgency: 5, actionability: 5 }
    ));
  }

  const impressions = facts.growth.searchImpressions;
  const ctr = facts.growth.searchCtr;
  const impressionFloor = searchRange === '90d' ? 2400 : searchRange === '28d' ? 800 : 250;
  if (isObserved(impressions) && isObserved(ctr) && impressions.value >= impressionFloor && ctr.value < 0.025) {
    signals.push(signal(
      'SEARCH_CTR_OPPORTUNITY', 'OPPORTUNITY', '検索表示をクリックへ変える余地があります',
      `検索表示 ${impressions.value.toLocaleString('ja-JP')}回に対しCTRは${(ctr.value * 100).toFixed(1)}%です。`,
      '検索意図に対してタイトルまたは説明文の訴求が弱い可能性があります。',
      '同じ表示回数でもクリック数を増やせる余地があります。',
      'Site Insightsで表示回数の多い低CTRクエリを確認し、対象ページを1件だけ改善してください。',
      CONFIDENCE.MEDIUM, [impressions, ctr],
      { class: signals.length ? 'NEXT' : 'NOW', impact: 3, urgency: 2, actionability: 4 }
    ));
  }

  const followUp = facts.customers.followUp;
  const nextBooking = facts.customers.nextBooking;
  if (isObserved(followUp) && followUp.value > 0 && isObserved(nextBooking) && nextBooking.value === 0) {
    signals.push(signal(
      'CUSTOMER_PIPELINE_RISK', 'RISK', 'フォロー対象が次回予約へ進んでいません',
      `要フォロー ${followUp.value}件に対し、次回予約ありは0件です。`,
      'フォローの未実施、タイミング、記録遅延のいずれかが考えられます。',
      '売上に最も近い顧客転換が止まる可能性があります。',
      'フォロー対象を確認し、今日連絡する対象を確定してください。',
      CONFIDENCE.HIGH, [followUp, nextBooking],
      { class: 'NOW', impact: 5, urgency: 5, actionability: 5 }
    ));
  } else if (isObserved(followUp) && followUp.value >= 3) {
    signals.push(signal(
      'CUSTOMER_FOLLOWUP_WATCH', 'RISK', 'フォロー対象が積み上がっています',
      `現在の要フォローは ${followUp.value}件です。`,
      '対応待ちが増えると次回予約までの時間が延びる可能性があります。',
      '既存顧客からの売上機会を失う可能性があります。',
      '優先順位を付けて、期限の近い対象からフォローしてください。',
      CONFIDENCE.MEDIUM, [followUp, nextBooking],
      { class: 'NOW', impact: 5, urgency: 4, actionability: 5 }
    ));
  }

  const nowMs = now.getTime();
  const overdue = editorialSchedule.find((item) => {
    if (!item?.schedule || /完了|公開済|PUBLISHED/i.test(String(item.state || ''))) return false;
    const due = Date.parse(String(item.schedule).replace(/\//g, '-'));
    return Number.isFinite(due) && due < nowMs;
  });
  if (overdue) {
    signals.push(signal(
      'EDITORIAL_EXECUTION_RISK', 'RISK', '公開予定を過ぎたEditorialがあります',
      `${overdue.title || 'Editorial項目'}が予定時刻を過ぎています。`,
      '制作・確認・同期のいずれかで停止している可能性があります。',
      '計画した検索・集客施策の実行が遅れます。',
      'Editorial Adminで状態と同期エラーを確認してください。',
      CONFIDENCE.HIGH, [facts.editorial.ready, facts.editorial.errors],
      { class: 'NEXT', impact: 2, urgency: 4, actionability: 5 }
    ));
  }

  const unhealthy = dataHealth.filter((item) => item.status !== 'OK');
  if (unhealthy.length) {
    const named = unhealthy.slice(0, 3).map((item) => item.label).join('、');
    signals.push(signal(
      'DATA_QUALITY_RISK', 'DATA', '判断に必要なデータが一部不完全です',
      `${named}${unhealthy.length > 3 ? 'ほか' : ''}を最新値として確認できません。`,
      '接続未設定、更新遅延、取得エラーのいずれかです。',
      '経営判断の確度が下がるため、欠損を0として扱えません。',
      'Data Healthの該当Sourceと更新時刻を確認してください。',
      CONFIDENCE.HIGH, unhealthy.flatMap((item) => item.evidence || []),
      { class: 'WATCH', impact: 2, urgency: 2, actionability: 3 }
    ));
  }

  if (sessionChange.direction === 'DOWN') {
    signals.push(signal(
      'WEB_TRAFFIC_DECLINE', 'CHANGE', 'Web訪問が前期間を下回っています',
      `Sessionsは前期間比 ${Math.abs(sessionChange.percent || 0) * 100 >= 0.1 ? `${(sessionChange.percent * 100).toFixed(1)}%` : `${Math.abs(sessionChange.absolute)}件`}の変化です。`,
      '検索流入、指名流入、計測状態の変化が候補です。',
      'CTA母数が減り、問い合わせ機会が減少する可能性があります。',
      'Search / Web Opportunitiesで落ちた指標とページを確認してください。',
      CONFIDENCE.MEDIUM, [facts.growth.sessions, facts.growth.sessionsPrevious],
      { class: signals.length ? 'WATCH' : 'NEXT', impact: 3, urgency: 3, actionability: 3 }
    ));
  }

  return signals;
}

const priorityWeight = { NOW: 30, NEXT: 20, WATCH: 10 };
export function buildPriorities(signals = []) {
  return signals
    .filter((item) => item.priority)
    .sort((a, b) => {
      const aScore = priorityWeight[a.priority.class] + a.priority.impact + a.priority.urgency + a.priority.actionability;
      const bScore = priorityWeight[b.priority.class] + b.priority.impact + b.priority.urgency + b.priority.actionability;
      return bScore - aScore;
    })
    .slice(0, 3)
    .map((item) => ({ class: item.priority.class, signalId: item.id, title: item.title, action: item.action, confidence: item.confidence, evidence: item.evidence }));
}
