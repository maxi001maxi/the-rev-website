import {getAuthedContext,sendError} from '../../../lib/supabaseAdmin.mjs';
import {getConnection} from '../../../lib/googleBusiness.mjs';

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendError(res,405,'method_not_allowed','GETのみ利用できます。');}
  const ctx=await getAuthedContext(req);
  if(ctx.error)return sendError(res,ctx.status,ctx.error,ctx.error==='unauthorized'?'ログインが必要です。':'Admin認証が未設定です。');
  const membership=await ctx.supabase.from('admin_members').select('active').eq('user_id',ctx.user.id).maybeSingle();
  if(membership.error||!membership.data?.active)return sendError(res,403,'forbidden','Google Business Profileの閲覧権限がありません。');
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
