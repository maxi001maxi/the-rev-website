// Explainable answer/intent guard. Categories alone never cause rejection.
// All history is supplied by the authenticated collector or connector adapter.
const fields = ['topic','title_candidate','title','primary_query','target_keyword',
  'audience_question','unique_angle','main_claim','angle','search_intent','description','meta_description','body_summary'];
function parse(value) { try { return JSON.parse(value || '{}'); } catch { return {}; } }
function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/健康診断/g,'健診').replace(/筋力トレーニング|筋トレ/g,'運動')
    .replace(/無理せず|無理をしない/g,'無理なく').replace(/開始|スタート/g,'始める')
    .replace(/[\s\p{P}\p{S}]/gu,'');
}
function dice(a,b) {
  const grams = s => new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));
  const x=grams(normalize(a)),y=grams(normalize(b));
  return x.size && y.size ? 2*[...x].filter(v=>y.has(v)).length/(x.size+y.size) : 0;
}
function profile(row) {
  const gate=parse(row.topic_gate_json), knowledge=parse(row.knowledge_context_json);
  const r={...gate,...knowledge,...row};
  const core=[r.title_candidate,r.title,r.topic,r.primary_query,r.target_keyword,r.audience_question,r.unique_angle,r.main_claim].filter(Boolean).join(' ');
  const text=fields.map(k=>r[k] || '').join(' ');
  // Use the reader question (not incidental safety advice in the body) for intent.
  let intent='';
  if (/測定.*(?:方法|やり方)|(?:血圧|血糖).*(?:測り方|測定方法)/.test(core)) intent='measurement-method';
  else if (/治療中|服薬中|降圧薬/.test(core)) intent='treatment-exercise-consultation';
  else if (/(?:健診|健康診断).*(?:結果の見方|読み方|数値の意味)/.test(core)) intent='report-interpretation';
  else if (/健診|健康診断|血圧|血糖|脂質/.test(core) && /運動|筋トレ/.test(core) && /始め|開始|して.*いい|受診|確認|サイン/.test(core)) intent='health-exercise-start-safety';
  else if (/筋トレ|筋肉量|筋量/.test(core) && /増えない|変わらない|無駄|成果/.test(core) && /体重(?:計)?.*(?:以外|出ない)|数字だけ|進捗|進歩/.test(core)) intent='training-progress-beyond-weight';
  return {r,text,core,intent};
}
export function evaluateArticleOverlap(candidate, history=[]) {
  const a=profile(candidate); const matches=[];
  for (const past of history) {
    if (!past || /^(SKIPPED|ERROR_BLOCKED)/.test(String(past.queue_status || ''))) continue;
    const b=profile(past);
    if (a.intent && b.intent && a.intent!==b.intent) continue;
    const answerA=[a.r.audience_question,a.r.unique_angle,a.r.main_claim].filter(Boolean).join(' ');
    const answerB=[b.r.audience_question,b.r.unique_angle,b.r.main_claim,b.r.body_summary,b.r.description,b.r.meta_description].filter(Boolean).join(' ');
    const coreScore=dice(a.core,b.core), answerScore=dice(answerA,answerB);
    const sameQuery=Boolean(a.r.primary_query && normalize(a.r.primary_query)===normalize(b.r.primary_query || b.r.target_keyword));
    const sameTitle=Boolean((a.r.title_candidate || a.r.title) && normalize(a.r.title_candidate || a.r.title)===normalize(b.r.title_candidate || b.r.title));
    const intentMatch=['health-exercise-start-safety','training-progress-beyond-weight'].includes(a.intent) && a.intent===b.intent;
    // Both a reader question/answer and a topic signal are needed for generic cases.
    const overlap=sameQuery || sameTitle || intentMatch || (answerScore>=0.67 && coreScore>=0.32) || coreScore>=0.82;
    if (!overlap) continue;
    matches.push({candidate_id:candidate.candidate_id || '',status:'SKIPPED_OVERLAP',
      duplicate_of_content_id:past.content_id || past.editorial_content_id || past.slug || '',
      duplicate_of_title:b.r.title || b.r.title_candidate || b.r.topic || '',
      duplicate_reason:intentMatch ? (a.intent==='training-progress-beyond-weight' ? '体重や筋肉量以外の動作・日常の変化で進歩を見るという読者の答えが既存記事と重なる' : '健診・検査値を踏まえた運動開始前の確認／受診判断という読者の答えが既存記事と重なる') : '検索意図・読者の疑問・答えの重複',
      similarity_evidence:{rule_version:'answer-overlap-v1',intent:a.intent,existing_intent:b.intent,
        same_query:sameQuery,same_title:sameTitle,core_similarity:coreScore,answer_similarity:answerScore,
        candidate_question:answerA,existing_answer:answerB,existing_slug:past.slug || '',
        article_type:candidate.article_type || '',content_cluster:candidate.content_cluster || '',content_pillar:candidate.content_pillar || ''}});
  }
  return {overlap:matches.length>0,matches};
}
export function articleHistoryFromRows(...groups) {
  // Keep source variants: a draft may have a richer answer than its Queue row.
  return groups.flat().filter(r=>r && (r.content_id || r.editorial_content_id || r.slug));
}
