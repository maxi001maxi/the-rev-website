import {getAuthedContext,sendError} from '../../lib/supabaseAdmin.mjs';
import {
  authorizationUrl,
  exchangeCode,
  verifyOAuthState,
  discoverBusiness,
  saveConnection,
  getConnection,
  rediscoverConnection
} from '../../lib/googleBusiness.mjs';

function redirect(res,path){
  res.statusCode=302;
  res.setHeader('Location',path);
  res.end();
}
export function classify(error){
  const provider=typeof error?.data?.error==='string'?error.data.error:
    String(error?.data?.error?.status||'').toLowerCase();
  const message=String(error?.data?.error?.message||error?.data?.error_description||error?.message||'').toLowerCase();
  const stage=['oauth_refresh','accounts_list','locations_list'].includes(error?.stage)?error.stage:'unknown';
  if(error?.code==='not_connected')return 'not_connected';
  if(provider==='invalid_grant')return stage==='oauth_refresh'?'oauth_refresh_invalid_grant':'oauth_grant_invalid';
  if(provider==='invalid_client'||provider==='unauthorized_client')return 'oauth_client_invalid';
  if(message.includes('has not been used')||message.includes('disabled')||provider==='service_disabled')return 'required_api_disabled';
  if((message.includes('quota')||provider==='resource_exhausted')&&
     /(?:limit|value|quota)[^0-9]{0,25}0(?:\\D|$)/i.test(message))return 'api_access_quota_zero';
  if(message.includes('quota')||error?.status===429)return 'quota_or_access_required';
  if(message.includes('permission')||error?.status===403)return 'permission_denied';
  if(error?.status===401)return 'oauth_access_denied';
  if(error?.status===400)return stage==='accounts_list'?'accounts_api_invalid_request':
    stage==='locations_list'?'locations_api_invalid_request':'google_api_invalid_request';
  if(error?.status===404)return 'google_api_resource_not_found';
  return error?.code||'discovery_failed';
}
async function requireAdmin(req,res){
  const ctx=await getAuthedContext(req);
  if(ctx.error){
    sendError(res,ctx.status,ctx.error,ctx.error==='unauthorized'?'ログインが必要です。':'Admin認証が未設定です。');
    return null;
  }
  const membership=await ctx.supabase.from('admin_members').select('active').eq('user_id',ctx.user.id).maybeSingle();
  if(membership.error||!membership.data?.active){
    sendError(res,403,'forbidden','Google Business Profileの操作権限がありません。');
    return null;
  }
  return ctx;
}
async function handleConnect(req,res){
  const ctx=await requireAdmin(req,res);
  if(!ctx)return;
  try{return res.status(200).json({authorizationUrl:authorizationUrl(ctx.user.id)});}
  catch(e){
    const suffix=e?.missing?.length?': '+e.missing.join(', '):'';
    return sendError(res,503,'google_business_not_configured','Google Business Profile接続設定が不足しています'+suffix+'。');
  }
}
async function handleStatus(req,res){
  const ctx=await requireAdmin(req,res);
  if(!ctx)return;
  try{
    const c=await getConnection(ctx.user.id);
    return res.status(200).json({
      connected:Boolean(c),
      locationResolved:Boolean(c?.location_resource),
      accountName:c?.account_name||null,
      locationTitle:c?.location_title||null,
      locationResource:c?.location_resource||null,
      connectedAt:c?.connected_at||null,
      lastVerifiedAt:c?.last_verified_at||null,
      lastError:c?.last_error||null
    });
  }catch{
    return sendError(res,503,'google_business_status_unavailable','Google Business Profileの接続状態を確認できませんでした。');
  }
}
async function handleRediscover(req,res){
  const ctx=await requireAdmin(req,res);
  if(!ctx)return;
  try{
    const result=await rediscoverConnection(ctx.user.id);
    return res.status(200).json({
      connected:true,
      locationResolved:Boolean(result.locationResource),
      locationTitle:result.locationTitle||null,
      lastError:result.error||null
    });
  }catch(error){
    const code=classify(error);
    // Safe diagnostic: never log OAuth access/refresh tokens, IDs or Google raw messages.
    console.warn('[google-business/rediscover]',JSON.stringify({
      stage:['oauth_refresh','accounts_list','locations_list'].includes(error?.stage)?error.stage:'unknown',
      code,status:Number.isInteger(error?.status)?error.status:null
    }));
    if(code!=='not_connected'){
      try{await saveConnection(ctx.user.id,{}, {error:code,verified:false});}
      catch{ /* preserve original reason; never claim discovery succeeded */ }
    }
    const reason=code==='oauth_refresh_invalid_grant'
      ? '保存済みのGoogle認証の期限切れまたは失効が考えられます。Google認証を更新してください。'
      : code==='api_access_quota_zero'||code==='quota_or_access_required'
      ? 'Google Business Profile APIの利用枠・利用承認を確認してください。'
      : code==='required_api_disabled'
      ? 'Google Cloudで店舗情報APIを有効化してください。'
      : '店舗情報の再確認に失敗しました。エラーコードを確認してください。';
    return sendError(res,code==='not_connected'?409:502,code,reason);
  }
}
async function handleCallback(req,res){
  const query=req.query||{};
  if(query.error)return redirect(res,'/admin/google-business/?status=cancelled');
  if(!query.code||!query.state)return redirect(res,'/admin/google-business/?status=invalid');
  let state;
  try{state=verifyOAuthState(query.state);}
  catch{return redirect(res,'/admin/google-business/?status=invalid');}
  try{
    const tokenData=await exchangeCode(query.code);
    let discovery={error:null,verified:false};
    try{discovery=await discoverBusiness(tokenData.access_token);}
    catch(error){discovery={error:classify(error),verified:false};}
    await saveConnection(state.userId,tokenData,discovery);
    return redirect(res,discovery?.locationResource?'/admin/google-business/?status=connected':'/admin/google-business/?status=connected-needs-discovery');
  }catch(error){
    const providerError=typeof error?.data?.error==='string'?error.data.error:null;
    console.error('[google-business/callback]',JSON.stringify({code:error?.code||null,status:error?.status||null,providerError}));
    if(providerError==='invalid_client'||providerError==='unauthorized_client')return redirect(res,'/admin/google-business/?status=oauth-client-invalid');
    if(providerError==='invalid_grant')return redirect(res,'/admin/google-business/?status=oauth-grant-invalid');
    if(providerError==='redirect_uri_mismatch')return redirect(res,'/admin/google-business/?status=oauth-redirect-mismatch');
    return redirect(res,'/admin/google-business/?status=error');
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  const query=req.query||{};
  if(req.method==='POST'&&query.action==='rediscover')return handleRediscover(req,res);
  if(req.method!=='GET'){res.setHeader('Allow','GET, POST');return sendError(res,405,'method_not_allowed','GETまたは店舗再確認POSTのみ利用できます。');}
  // OAuth callback arrives through /api/admin/google-business/callback and is
  // rewritten to this consolidated function. Preserve the callback even when
  // Vercel does not carry an injected action query through the rewrite.
  const inferredCallback=Boolean(query.code||query.error)&&Boolean(query.state);
  const action=String(query.action||(inferredCallback?'callback':''));
  if(action==='callback')return handleCallback(req,res);
  if(action==='connect')return handleConnect(req,res);
  if(action==='status')return handleStatus(req,res);
  return sendError(res,400,'invalid_action','Google Business Profileの操作が不正です。');
}
