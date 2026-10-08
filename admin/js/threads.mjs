import {requireSession,signOut} from './admin-auth.mjs';
import {AdminApi} from './admin-api.mjs';

const $=id=>document.getElementById(id);

function showError(message){
  $('error').textContent=message;
  $('error').classList.remove('admin-hidden');
}
function clearError(){
  $('error').textContent='';
  $('error').classList.add('admin-hidden');
}
function formatStatus(data){
  if(!data?.connected){
    return '未接続です。Meta Threads Token Generatorで発行したUser Access Tokenを下から1回だけ登録してください。';
  }
  const verified=data.lastVerifiedAt?new Date(data.lastVerifiedAt).toLocaleString('ja-JP'):'未確認';
  const expiry=data.expiresAt?new Date(data.expiresAt).toLocaleString('ja-JP'):'未登録';
  return '接続済み：@'+(data.username||'unknown')+' / Server Token / 最終確認 '+verified+' / Token期限 '+expiry;
}

async function renderStatus(){
  try{
    const data=await AdminApi.getThreadsStatus();
    $('status').textContent=formatStatus(data);
    return data;
  }catch(e){
    showError(e.message||'Threads接続状態を取得できませんでした。');
    return null;
  }
}

async function saveDirectToken(){
  const input=$('token-input');
  const token=String(input.value||'').trim();
  if(!token){
    showError('Threads User Access Tokenを入力してください。');
    return;
  }
  clearError();
  $('save-token-btn').disabled=true;
  $('probe-btn').disabled=true;
  $('status').textContent='Tokenをサーバー側で検証しています…';
  try{
    const result=await AdminApi.saveThreadsDirectToken(token);
    input.value='';
    $('status').textContent='Direct Tokenを登録しました：@'+(result.username||'unknown');
    await renderStatus();
  }catch(e){
    showError(e.message||'Direct Tokenを登録できませんでした。');
    $('status').textContent='Direct Tokenの登録に失敗しました。';
  }finally{
    input.value='';
    $('save-token-btn').disabled=false;
    $('probe-btn').disabled=false;
  }
}

async function probeDirectToken(){
  clearError();
  $('probe-btn').disabled=true;
  $('probe-result').classList.add('admin-hidden');
  $('status').textContent='Threads APIのread-only接続を確認しています…';
  try{
    const result=await AdminApi.probeThreadsDirectToken();
    const caps=result.capabilities||{};
    const lines=[
      'PROFILE: '+(result.profile?.username?'@'+result.profile.username:'unknown'),
      'SOURCE: '+(result.conversationSourceStatus||'UNKNOWN'),
      'OWN_REPLIES: '+(caps.OWN_REPLIES?.status||'UNKNOWN'),
      'MENTIONS: '+(caps.MENTIONS?.status||'UNKNOWN'),
      'KEYWORD_SEARCH: '+(caps.KEYWORD_SEARCH?.status||'UNKNOWN'),
      'COUNTS: '+JSON.stringify(result.counts||{}),
      ...(Array.isArray(result.errors)&&result.errors.length?['ERRORS: '+JSON.stringify(result.errors)]:[])
    ];
    $('probe-result').textContent=lines.join('\n');
    $('probe-result').classList.remove('admin-hidden');
    $('status').textContent='Direct Token read-only probeが完了しました。';
  }catch(e){
    showError(e.message||'Threads APIの接続確認に失敗しました。');
    $('status').textContent='Threads APIの接続確認に失敗しました。';
  }finally{
    $('probe-btn').disabled=false;
  }
}

(async()=>{
  const auth=await requireSession();
  if(!auth)return;
  $('user-email').textContent=auth.session.user.email||'';
  $('checking').classList.add('admin-hidden');
  $('app').classList.remove('admin-hidden');
  history.replaceState(null,'',location.pathname);
  await renderStatus();
})();

$('save-token-btn').addEventListener('click',saveDirectToken);
$('probe-btn').addEventListener('click',probeDirectToken);
$('logout-btn').addEventListener('click',()=>signOut());
