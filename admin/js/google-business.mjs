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
    if(data.locationResolved){
      $('status').textContent='接続済み：'+locationName+' / 最終確認 '+verified;
      $('connect-btn').textContent='Google接続をやり直す';
      $('connect-btn').dataset.action='connect';
      return;
    }
    $('connect-btn').textContent='店舗情報を再確認';
    $('connect-btn').dataset.action='rediscover';
    if(data.lastError==='oauth_refresh_invalid_grant'){
      $('status').textContent='認証記録はありますが、Googleの再利用用トークンが期限切れまたは無効です。OAuth同意画面が「テスト中」の場合、原則7日で期限切れになります。Google認証を更新した後、店舗APIの許可状況を確認してください。';
      $('connect-btn').textContent='Google認証を更新する';
      $('connect-btn').dataset.action='connect';
    }else if(['api_access_quota_zero','quota_or_access_required'].includes(data.lastError)){
      $('status').textContent='認証情報は保存されていますが、Google Business Profile APIの利用枠が足りないか、APIアクセス承認が必要です。Google CloudのAPIとサービス→割り当てで、Account Management APIとBusiness Information APIの利用枠を確認してください。0の場合、再ログインでは直りません。';
      const link=document.createElement('a');
      link.href='https://developers.google.com/my-business/reference/accountmanagement/rest';
      link.target='_blank';link.rel='noopener noreferrer';
      link.textContent='Google公式のAPI利用枠案内';
      $('status').append(document.createTextNode(' '),link);
    }else if(data.lastError==='required_api_disabled'){
      $('status').textContent='Google認証は接続済みですが、店舗情報APIが無効または未承認のため、店舗を特定できません。Google Cloudで「My Business Account Management API」と「My Business Business Information API」を有効化し、API利用枠が0でないことを確認してください。再度Googleログインする必要はありません。';
      const link=document.createElement('a');
      link.href='https://console.cloud.google.com/apis/library';
      link.target='_blank';link.rel='noopener noreferrer';
      link.textContent='Google Cloud APIライブラリを開く';
      $('status').append(document.createTextNode(' '),link);
    }else{
      $('status').textContent='Google認証の記録あり（有効性は未確認）。店舗特定待ちです。状態: '+(data.lastError||'確認中');
    }
  }catch(e){
    showError(e.message||'接続状態を取得できませんでした。');
  }
}
async function connect(){
  const rediscover=$('connect-btn').dataset.action==='rediscover';
  $('connect-btn').disabled=true;
  $('error').classList.add('admin-hidden');
  history.replaceState(null,'',location.pathname);
  $('status').textContent=rediscover?'店舗情報を再確認しています…':'Google認証を開始しています…';
  try{
    if(rediscover){
      await AdminApi.rediscoverGoogleBusiness();
      await renderStatus();
      $('connect-btn').disabled=false;
      return;
    }
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
