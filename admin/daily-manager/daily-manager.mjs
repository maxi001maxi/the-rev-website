import { requireSession, signOut } from '/admin/js/admin-auth.mjs';
import { AdminApi } from '/admin/js/admin-api.mjs';

const $ = (id) => document.getElementById(id);
const fields = ['planned-sessions','cancel-count','same-day-additions','actual-sessions','trial-sessions','notes'];
let current = { input: null, snapshot: null };

function jstToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function n(v){ return v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('ja-JP'); }
function val(id){ const v=$(id).value.trim(); return v===''?null:Number(v); }
function message(text, error=false){
  const el=$('message'); el.textContent=text; el.className='daily-message '+(error?'is-error':'is-ok');
}
function clearMessage(){ $('message').className='daily-message admin-hidden'; $('message').textContent=''; }
function fillInput(input){
  $('planned-sessions').value=input?.planned_sessions ?? '';
  $('cancel-count').value=input?.cancel_count ?? 0;
  $('same-day-additions').value=input?.same_day_additions ?? 0;
  $('actual-sessions').value=input?.actual_sessions ?? '';
  $('trial-sessions').value=input?.trial_sessions ?? '';
  $('notes').value=input?.notes ?? '';
}
function renderSnapshot(s){
  current.snapshot=s;
  if(!s){ $('brief').classList.add('admin-hidden'); $('empty-brief').classList.remove('admin-hidden'); $('snapshot-meta').textContent='まだ生成されていません。'; return; }
  $('brief').classList.remove('admin-hidden'); $('empty-brief').classList.add('admin-hidden');
  const generated=s.generated_at?new Date(s.generated_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'—';
  $('snapshot-meta').textContent=`${s.snapshot_status} / ${generated} / セッション品質: ${s.session_data_quality || 'UNKNOWN'}`;
  $('kpi-sessions').textContent=n(s.completed_sessions);
  $('kpi-cancels').textContent=n(s.cancel_count);
  $('kpi-web').textContent=n(s.web_sessions);
  $('kpi-intent').textContent=n(s.high_intent_events);
  $('web-summary').textContent=`訪問 ${n(s.web_sessions)} / Active ${n(s.web_active_users)} / PV ${n(s.web_views)} / Organic Search ${n(s.organic_sessions)} / Organic Social ${n(s.organic_social_sessions)} / AI Assistant ${n(s.ai_assistant_sessions)}\n予約画面クリック ${n(s.reserve_click)} / LINE ${n(s.line_click)} / 料金 ${n(s.price_click)} / 記事CTA ${n(s.article_cta_click)}`;
  $('search-summary').textContent=s.gsc_settled_through?`確定日 ${s.gsc_settled_through}まで / 直近7日 Click ${n(s.gsc_clicks_7d)} / Impression ${n(s.gsc_impressions_7d)}。GSCは遅延データなので当日評価には使いません。`:'GSC取得不可。0とは扱いません。';
  $('content-summary').textContent=`本日公開記事 ${n(s.published_articles_today)}。日次では制作戦略を再設計せず、公開・未完了の確認に留めます。`;
  $('manager-comment').textContent=s.manager_comment || '—';
  $('priorities').replaceChildren(...((s.priorities||[]).map(p=>{const li=document.createElement('li');li.textContent=p.label||String(p);return li;})));
  if(!(s.priorities||[]).length){const li=document.createElement('li');li.textContent='追加対応なし';$('priorities').replaceChildren(li);}
  $('quality-summary').textContent=Object.entries(s.data_quality||{}).map(([k,v])=>`${k}: ${v}`).join(' / ') || '—';
}
async function load(){
  clearMessage();
  const date=$('business-date').value;
  try{
    const data=await AdminApi.getDailyManager(date);
    current=data; fillInput(data.input); renderSnapshot(data.snapshot);
  }catch(e){ message(e.message||'読み込みに失敗しました。',true); }
}
async function saveInput(){
  clearMessage(); $('save-input').disabled=true;
  try{
    const data=await AdminApi.saveDailyManagerInput({
      business_date:$('business-date').value,
      planned_sessions:val('planned-sessions'),
      cancel_count:val('cancel-count')??0,
      same_day_additions:val('same-day-additions')??0,
      actual_sessions:val('actual-sessions'),
      trial_sessions:val('trial-sessions'),
      notes:$('notes').value
    });
    current.input=data.input; fillInput(data.input); message('日次入力を保存しました。');
  }catch(e){ message(e.message||'保存に失敗しました。',true); }
  finally{$('save-input').disabled=false;}
}
async function run(finalize=false){
  clearMessage();
  const btn=finalize?$('finalize-brief'):$('refresh-brief'); btn.disabled=true;
  try{
    await saveInput();
    const data=await AdminApi.runDailyManager($('business-date').value,finalize);
    renderSnapshot(data.snapshot);
    message(finalize?'FINALへ更新しました。':'Daily Managerを再生成しました。');
  }catch(e){ message(e.message||'集計に失敗しました。',true); }
  finally{btn.disabled=false;}
}

(async()=>{
  const auth=await requireSession(); if(!auth)return;
  $('user-email').textContent=auth.session.user.email;
  $('business-date').value=jstToday();
  $('checking').classList.add('admin-hidden'); $('app').classList.remove('admin-hidden');
  await load();
})();
$('business-date').addEventListener('change',load);
$('save-input').addEventListener('click',saveInput);
$('refresh-brief').addEventListener('click',()=>run(false));
$('finalize-brief').addEventListener('click',()=>run(true));
$('logout-btn').addEventListener('click',signOut);
