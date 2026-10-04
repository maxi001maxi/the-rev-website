// THE REV. Daily Editorial Knowledge Sufficiency registry (versioned source of truth).
//
// The Daily Creator may start a no-interview article only when a verified
// first-party knowledge source is registered here for the candidate's lane,
// cluster or pillar. Anything not covered needs a human Interview first; the
// Creator never guesses that knowledge is sufficient.
//
// Sources mirror what the manual operator relied on in 26_DAILY_EDITORIAL_QUEUE
// (source_knowledge / knowledge_context_json) and 17_FACT_REGISTRY. Change this
// file through a PR when new manuals or Interviews are verified.

export const DAILY_KNOWLEDGE_REGISTRY_VERSION = 'v1';

export const DAILY_KNOWLEDGE_SOURCES = Object.freeze([
  {
    id: 'OXYGEN_ROOM',
    match: { lanes: ['OXYGEN_ROOM'], clusters: ['OXYGEN_ROOM'] },
    fact_ids: ['F003', 'F006', 'F007'],
    source_refs: [
      '酸素ルーム理解・説明・提案 完全マニュアル (17_FACT_REGISTRY S003)',
      'OXYROOM操作・運用マニュアル'
    ],
    reason: '酸素ルームの仕様・THE REV.での位置づけ・禁止表現が店舗一次資料に記載済み。'
  },
  {
    id: 'DENBA',
    match: { lanes: ['DENBA'], clusters: ['DENBA'] },
    fact_ids: ['F004', 'F007'],
    source_refs: [
      'DENBA Health 従業員向け完全マニュアル (17_FACT_REGISTRY S004)',
      'Drive:10CC52EWdNNxDYuXinMLFTbMgFOlkHC7e'
    ],
    reason: 'DENBA Healthの製品仕様・標準説明・禁止表現が店舗一次資料に記載済み。'
  },
  {
    id: 'FACILITY_THE_REV',
    match: { lanes: ['FACILITY_THE_REV'], clusters: ['FACILITY_SHOWCASE'] },
    fact_ids: ['F001', 'F002', 'F005', 'F006'],
    source_refs: ['ブランド・店舗運営方針書 Ver2.0 (17_FACT_REGISTRY S002)'],
    reason: 'THE REV.の正式名称・完全予約制・更衣/シャワー・設備が検証済みFactとして登録済み。'
  },
  {
    id: 'GYM_LOCAL',
    match: { pillars: ['GYM_LOCAL'] },
    fact_ids: ['F001', 'F002', 'F005'],
    source_refs: ['BLOG-20260919-9016a3 (First-party Interview)', 'ブランド・店舗運営方針書 Ver2.0 (S002)'],
    reason: '運動開始の摩擦と施設条件について既存Interviewと検証済みFactで説明できる。'
  },
  {
    id: 'BODY_RECOVERY',
    match: { pillars: ['BODY_RECOVERY'] },
    fact_ids: [],
    source_refs: ['BLOG-20260914-b64a18 (First-party Interview)'],
    reason: '疲労の種類を見極め、軽く始めて再評価する現場判断が既存Interviewに記録済み。'
  },
  {
    id: 'START_CONTINUE',
    match: { pillars: ['START_CONTINUE'] },
    fact_ids: ['F001', 'F002'],
    source_refs: ['BLOG-20260914-b64a18 (First-party Interview)', 'BLOG-20260919-9016a3 (First-party Interview)'],
    reason: '開始負担・継続設計の現場判断が既存Interviewに記録済み。'
  },
  {
    id: 'TRAINING',
    match: { pillars: ['TRAINING'] },
    fact_ids: [],
    source_refs: ['BLOG-20260922-4d8f2a (First-party Interview)'],
    reason: '限界まで追い込まない負荷設計・フォーム・翌日の疲労の現場判断が既存Interviewに記録済み。'
  }
]);

function token(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

// Lane/cluster entries win over pillar entries so strategic lanes use their
// dedicated manuals. Returns null when no verified source is registered.
export function resolveKnowledgeSource(candidate = {}, sources = DAILY_KNOWLEDGE_SOURCES) {
  const lane = token(candidate.editorial_lane);
  const cluster = token(candidate.content_cluster);
  const pillar = token(candidate.content_pillar);
  const byLaneOrCluster = sources.find((s) => (
    (s.match.lanes || []).includes(lane) || (s.match.clusters || []).includes(cluster)
  ));
  if (byLaneOrCluster) return byLaneOrCluster;
  return sources.find((s) => (s.match.pillars || []).includes(pillar)) || null;
}

export function knowledgeDecisionFor(candidate = {}, sources = DAILY_KNOWLEDGE_SOURCES) {
  if (candidate.topic_specific_interview_required === true) {
    return { decision: 'INTERVIEW_REQUIRED', sufficient: false, reason: 'TOPIC_SPECIFIC_FIRST_PARTY_CONFIRMATION_REQUIRED', source_id: null, source_refs: [], fact_ids: [] };
  }
  const source = resolveKnowledgeSource(candidate, sources);
  if (!source) {
    return {
      decision: 'INTERVIEW_REQUIRED',
      sufficient: false,
      reason: 'NO_REGISTERED_FIRST_PARTY_KNOWLEDGE',
      source_id: null,
      source_refs: [],
      fact_ids: []
    };
  }
  return {
    decision: 'SUFFICIENT',
    sufficient: true,
    reason: source.reason,
    source_id: source.id,
    source_refs: [...source.source_refs],
    fact_ids: [...source.fact_ids],
    registry_version: DAILY_KNOWLEDGE_REGISTRY_VERSION
  };
}
