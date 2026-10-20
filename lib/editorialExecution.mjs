// Evidence projection shared by the Console and recovery tools. Unknown is not
// success. No schema change: durable source records remain authoritative.
import { imageStopReason } from './editorialImageAcceptance.mjs';

export const EDITORIAL_STAGES = ['記事企画','テーマ選定','独自情報収集','リサーチ','記事制作','本文品質検査',
  '画像設計','画像生成','画像品質検査','画像3形式','データ連携','配信準備','管理画面','最終Preflight'];

export function editorialExecution({ article = {}, proposal = null, operator = null, preflight = null } = {}) {
  const events = article.image_qa?.editorial_execution?.stages || [];
  const stages = EDITORIAL_STAGES.map((label,i) => ({ stage:i+1,label,status:'UNVERIFIED',evidence:null }));
  const mark = (n,status,evidence) => Object.assign(stages[n-1], {status,evidence});
  // Stored checkpoints are diagnostics only. Never trust them as current QC.
  for (const e of events) if (e.stage >= 1 && e.stage <= 14) mark(e.stage, 'RECORDED', e.evidence);
  if (proposal?.options?.length) mark(1,'PASS',proposal.id);
  if (proposal?.approved_at && proposal?.selected_candidate_id) mark(2,'PASS',proposal.selected_candidate_id);
  if (proposal?.interview_answered_at) mark(3,'PASS',proposal.interview_answered_at);
  if (article.body_markdown) mark(5,'PASS','admin_article_drafts.body_markdown');
  if (article.editorial_sync_hash && article.editorial_synced_at) mark(11,'PASS',article.editorial_sync_hash);
  if (article.image_qa?.pass === true) mark(9,'RECORDED',article.image_qa_report_path);
  const reason = imageStopReason(article) || (operator?.blocking ? operator.last_error || operator.code : null);
  if (reason) mark(9,'BLOCKED',reason);
  if (preflight) {
    mark(13,'PASS','authenticated publish-preview response');
    mark(14,preflight.ok ? 'PASS' : 'BLOCKED', preflight.blocker?.message || 'canonical runPreflight');
  }
  const current = stages.find(x=>x.status==='BLOCKED') || stages.find(x=>x.status!=='PASS');
  const confirmed = stages.filter(x=>x.status==='PASS');
  const apiCalls = operator?.api_calls || [];
  return { version:'3.1', stages, current_stage:current?.stage || 14,
    last_successful_stage:confirmed.at(-1)?.stage || null,
    stopped_reason:reason || preflight?.blocker?.message || null,
    next_action:reason ? '保存済み本文を保持し、画像設計・不採用理由を確認。追加有料生成はOwner承認待ち。' : '未検証工程の根拠を確認し、既存成果物から再開。最終公開はOwner承認。',
    human_approval_required:Boolean(reason) || Boolean(preflight?.ok),
    retain:{content_id:article.editorial_content_id,job:article.image_job_path,qa:article.image_qa_report_path,asset_version:article.image_asset_version},
    api_calls:apiCalls, api_call_count:apiCalls.length || null, confirmed_cost:null,
    cost_note:'請求に帰属できる費用は未取得。未記録の呼出しを0円と扱わない。',
    publication_state:article.publish_status==='PUBLISHED' && article.publish_verified_at && article.published_url ? 'PUBLISHED_VERIFIED' : article.publish_status || 'NOT_PUBLISHED' };
}

export function validateSavedEditorialApproval(proposal) {
  if (!proposal?.approved_at || !proposal?.selected_candidate_id || !proposal?.content_id) return 'SAVED_TOPIC_APPROVAL_REQUIRED';
  const selected = proposal.options?.find(x=>x.candidate_id===proposal.selected_candidate_id);
  if (!selected) return 'SELECTED_CANDIDATE_MISSING';
  if (selected.interview_required && (!proposal.interview_answered_at || !proposal.interview_answers?.length)) return 'OWNER_INTERVIEW_REQUIRED';
  return null;
}
