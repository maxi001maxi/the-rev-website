import { createClient } from '@supabase/supabase-js';
import { checkEditorialImageReady } from '../../lib/editorialImage.mjs';
import { runPreflight, readinessFromPreflight } from '../../lib/publishFlow.mjs';

const ARTICLE_ID='881b5441-5a60-40ec-b1d1-9fa32806c332';
const TOKEN='r5-e5af-881b-acceptance-20261010';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  if(String(req.query?.token||'')!==TOKEN) return res.status(404).json({ok:false,error:'not_found'});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY){
    return res.status(503).json({ok:false,error:'supabase_not_configured'});
  }

  process.env.GITHUB_REPO='maxi001maxi/the-rev-website';
  process.env.GITHUB_BRANCH='main';

  const supabase=createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {auth:{persistSession:false,autoRefreshToken:false}}
  );

  const found=await supabase.from('admin_article_drafts').select('*').eq('id',ARTICLE_ID).maybeSingle();
  if(found.error||!found.data) return res.status(404).json({ok:false,error:'draft_not_found'});

  const image=await checkEditorialImageReady(found.data);
  if(!image.ready){
    return res.status(409).json({
      ok:false,
      stage:'image_readiness',
      reason:image.reason||'not_ready',
      publish_requires_human_approval:true
    });
  }

  const saved=await supabase.from('admin_article_drafts').update({
    image_status:'READY',
    image_asset_ready:true,
    image_checked_at:new Date().toISOString(),
    image_qa:image.qa,
    image_brand_qa_score:Math.min(
      Number(image.qa?.series_consistency??0),
      Number(image.qa?.article_visual_relevance??image.qa?.series_consistency??0)
    )||null,
    image_last_error:null,
    gbp_image_status:found.data.gbp_image_asset_version?'READY':found.data.gbp_image_status,
    gbp_image_checked_at:found.data.gbp_image_asset_version?new Date().toISOString():found.data.gbp_image_checked_at,
    gbp_image_last_error:null
  }).eq('id',ARTICLE_ID).select('*').single();

  if(saved.error) return res.status(500).json({ok:false,error:'ready_state_save_failed'});

  const preflight=await runPreflight({
    supabase,
    user:null,
    articleId:ARTICLE_ID,
    actor:'automation'
  });
  const readiness=readinessFromPreflight(preflight);

  return res.status(readiness.ready?200:409).json({
    ok:readiness.ready,
    content_id:saved.data.editorial_content_id,
    image_status:saved.data.image_status,
    image_asset_ready:saved.data.image_asset_ready===true,
    gbp_image_status:saved.data.gbp_image_status,
    asset_version:saved.data.image_asset_version,
    readiness,
    checks:(preflight.checks||[]).map(x=>({id:x.id,status:x.status,message:x.message||null})),
    blocker:preflight.blocker||null,
    targetPath:preflight.targetPath||null,
    publicUrl:preflight.publicUrl||null,
    publish_requires_human_approval:true,
    publish_executed:false
  });
}
