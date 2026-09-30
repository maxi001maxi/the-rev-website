import {getAuthedContext,sendError} from '../../lib/supabaseAdmin.mjs';
import {assemble} from '../../lib/siteInsights/assemble.mjs';
import {assembleIntelligence} from '../../lib/intelligence/assemble.mjs';

export function createIntelligenceHandler({getContext=getAuthedContext,assembleData=assembleIntelligence}={}){
  return async function intelligenceHandler(req,res){
    res.setHeader('Cache-Control','private, no-store, max-age=0');
    if(req.method!=='GET'){res.setHeader('Allow','GET');return sendError(res,405,'method_not_allowed','GETのみ利用できます。');}
    const query=req.query||{};
    if(Object.keys(query).some(key=>key!=='range')||!['7d','28d','90d'].includes(query.range||'28d'))return sendError(res,400,'invalid_query','表示期間は7d、28d、90dのいずれかを指定してください。');
    const context=await getContext(req);
    if(context.error)return sendError(res,context.status,context.error,context.error==='unauthorized'?'ログインが必要です。':'Admin認証が未設定です。');
    const {data:member,error:memberError}=await context.supabase.from('admin_members').select('active').eq('user_id',context.user.id).maybeSingle();
    if(memberError||!member?.active)return sendError(res,403,'forbidden','Intelligenceの閲覧権限がありません。');
    try{
      const data=await assembleData(query.range||'28d',{supabase:context.supabase,userId:context.user.id});
      return res.status(200).json(data);
    }catch{return sendError(res,503,'intelligence_unavailable','Intelligenceを読み込めませんでした。');}
  };
}

const intelligenceHandler=createIntelligenceHandler();
export default async function handler(req,res){
  if(req.query?.mode==='intelligence'){
    const {mode,...query}=req.query;
    return intelligenceHandler({...req,query},res);
  }
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendError(res,405,'method_not_allowed','GETのみ利用できます。');}
  const ctx=await getAuthedContext(req);
  if(ctx.error)return sendError(res,ctx.status,ctx.error,ctx.error==='unauthorized'?'ログインが必要です。':'Admin認証が未設定です。');
  const {data:member,error:memberError}=await ctx.supabase.from('admin_members').select('active').eq('user_id',ctx.user.id).maybeSingle();
  if(memberError||!member?.active)return sendError(res,403,'forbidden','Site Insightsの閲覧権限がありません。');
  const q=req.query||{};
  if(Object.keys(q).some(k=>!['range','view','date'].includes(k))||!['7d','28d','90d'].includes(q.range||'28d')||(q.view&&!['search','content','funnel','technical'].includes(q.view))||(q.date&&!/^\d{4}-\d{2}-\d{2}$/.test(q.date)))return sendError(res,400,'invalid_query','指定された条件が不正です。');
  try{const data=await assemble(q.range||'28d',{date:q.date,userId:ctx.user.id});return res.status(200).json(data);}
  catch{return sendError(res,503,'insights_unavailable','データを読み込めませんでした。');}
}
