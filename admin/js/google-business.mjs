import {requireSession,signOut} from './admin-auth.mjs';
import {AdminApi} from './admin-api.mjs';

const $=id=>document.getElementById(id);
function showError(message){
  $('error').textContent=message;
  $('error').classList.remove('admin-hidden');
}
function outcomeMessage(){
  const value=new URL(location.href).searchParams.get('status');
  if(value==='connected')return 'Google Business ProfileのOAuth接続と店舗特定が完了しました。';
  if(value==='connected-needs-discovery')return 'OAuth接続は完了しました。店舗情報APIの確認が残っています。';
  if(value==='cancelled')return 'Google認証はキャンセルされました。';
  if(value==='invalid')return '認証状態を確認できませんでした。もう一度接続してください。';
  if(value==='oauth-client-invalid')return 'Google OAuthのクライアント設定が一致していません。Client ID / Client Secretの再設定が必要です。';
  if(value==='oauth-grant-invalid')return 'Googleの認証コードを交換できませんでした。OAuth設定の確認が必要です。';
  if(value==='oauth-redirect-mismatch')return 'Google OAuthのリダイレクト先設定が一致していません。';
  if(value==='error')return 'Google認証処理でエラーが発生しました。原因分類をサーバー側に記録しました。';
  return '';
}
async function renderStatus(){
  try{
    const data=await AdminApi.getGoogleBusinessStatus();
    if(!data.connected){
      $('status').textContent='未接続です。下のボタンからGoogleアカウントを1回だけ認証してください。';
      $('connect-btn').textContent='Google Business Profileを接続';
      return;
    }
    const locationName=data.locationTitle||data.locationResource||'店舗未特定';
    const verified=data.lastVerifiedAt?new Date(data.lastVerifiedAt).toLocaleString('ja-JP'):'未確認';
    $('status').textContent=data.locationResolved
      ? '接続済み：'+locationName+' / 最終確認 '+verified
      : 'OAuth接続済み。店舗特定待ちです。状態: '+(data.lastError||'確認中');
    $('connect-btn').textContent='Google接続をやり直す';
  }catch(e){
    showError(e.message||'接続状態を取得できませんでした。');
  }
}
async function connect(){
  $('connect-btn').disabled=true;
  $('error').classList.add('admin-hidden');
  history.replaceState(null,'',location.pathname);
  $('status').textContent='Google認証を開始しています…';
  try{
    const data=await AdminApi.getGoogleBusinessConnect();
    const target=new URL(data?.authorizationUrl||'');
    if(target.protocol!=='https:'||target.hostname!=='accounts.google.com'||target.pathname!=='/o/oauth2/v2/auth'){
      throw new Error('Google認証URLを検証できませんでした。');
    }
    window.location.href=target.toString();
  }catch(e){
    $('connect-btn').disabled=false;
    showError(e.message||'Google認証を開始できませんでした。');
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
