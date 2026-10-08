import {requireSession,signOut} from './admin-auth.mjs';
import {AdminApi} from './admin-api.mjs';

const $=id=>document.getElementById(id);

function showError(message){
  $('error').textContent=message;
  $('error').classList.remove('admin-hidden');
}

function outcomeMessage(){
  const value=new URL(location.href).searchParams.get('status');
  if(value==='connected')return 'Threads APIのOAuth接続が完了しました。';
  if(value==='cancelled')return 'Threads認証はキャンセルされました。';
  if(value==='invalid')return 'Threads認証状態を確認できませんでした。もう一度接続してください。';
  if(value==='error')return 'Threads認証処理でエラーが発生しました。接続状態を再確認してください。';
  return '';
}

async function renderStatus(){
  try{
    const data=await AdminApi.getThreadsStatus();
    if(!data.connected){
      $('status').textContent='未接続です。下のボタンからTHE REV.のThreadsアカウントを1回だけ認証してください。';
      $('connect-btn').textContent='THE REV. Threadsを接続';
      return;
    }
    const verified=data.lastVerifiedAt?new Date(data.lastVerifiedAt).toLocaleString('ja-JP'):'未確認';
    const expiry=data.expiresAt?new Date(data.expiresAt).toLocaleString('ja-JP'):'期限未確認';
    $('status').textContent='接続済み：@'+(data.username||'unknown')+' / 最終確認 '+verified+' / Token期限 '+expiry;
    $('connect-btn').textContent='Threads接続をやり直す';
  }catch(e){
    showError(e.message||'Threads接続状態を取得できませんでした。');
  }
}

async function connect(){
  $('connect-btn').disabled=true;
  $('error').classList.add('admin-hidden');
  history.replaceState(null,'',location.pathname);
  $('status').textContent='Threads認証を開始しています…';
  try{
    const data=await AdminApi.getThreadsConnect();
    const target=new URL(data?.authorizationUrl||'');
    if(target.protocol!=='https:'||target.hostname!=='www.threads.com'||target.pathname!=='/oauth/authorize'){
      throw new Error('Threads認証URLを検証できませんでした。');
    }
    window.location.href=target.toString();
  }catch(e){
    $('connect-btn').disabled=false;
    showError(e.message||'Threads認証を開始できませんでした。');
  }
}

(async()=>{
  const auth=await requireSession();
  if(!auth)return;
  $('user-email').textContent=auth.session.user.email||'';
  $('checking').classList.add('admin-hidden');
  $('app').classList.remove('admin-hidden');
  await renderStatus();
  const message=outcomeMessage();
  if(message)$('status').textContent=message;
})();

$('connect-btn').addEventListener('click',connect);
$('logout-btn').addEventListener('click',()=>signOut());

$('diagnose-btn').addEventListener('click',async()=>{
  $('diagnose-btn').disabled=true;
  try{
    const result=await AdminApi.diagnoseThreads();
    $('diagnostic-result').textContent=JSON.stringify(result,null,2);
    $('diagnostic-result').classList.remove('admin-hidden');
  }catch(error){showError(error.message||'接続設定の診断に失敗しました。');}
  finally{$('diagnose-btn').disabled=false;}
});
