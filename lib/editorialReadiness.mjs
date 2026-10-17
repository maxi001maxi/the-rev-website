import {SCENE_PLAUSIBILITY_VERSION,SCENE_PLAUSIBILITY_FIELDS,scenePlausibilityPass} from './editorialScenePlausibility.mjs';
import {validateEditorialClosingForPublish} from './blogMarkdown.mjs';
import {sceneGroundingRequired,sceneGroundingPass} from './editorialSceneGrounding.mjs';

export function evaluateEditorialLength(articleType,body,settings={}) {
  const type=String(articleType || 'STANDARD').toUpperCase();
  const count=String(body || '').replace(/\s/g,'').length;
  const min=type==='EXPERT_DEEP_DIVE' ? Math.max(1400,Number(settings.blog_expert_min_chars || 1400))
    : type==='STANDARD' ? Math.max(1200,Number(settings.blog_standard_min_chars || 1600)) : 0;
  // A minimum is an anomaly detector, never an instruction to add padding.
  return {pass:count>=min,count,min,type};
}
export function evaluateEditorialReviewReady({contentId,blog,gbp,bridge,qa={},gbpQa={},settings={}}={}) {
  const closingErrors=validateEditorialClosingForPublish({editorial_source:'the-rev-editorial-ai',body_markdown:blog?.body_markdown || ''});
  const checks={
    blog_ready:blog?.status==='READY',
    length_pass:evaluateEditorialLength(blog?.article_type,blog?.body_markdown,settings).pass,
    editorial_closing:closingErrors.length===0,
    gbp_row_exists:Boolean(gbp),
    gbp_parent_matches:gbp?.parent_blog_id===contentId,
    gbp_ready:gbp?.status==='READY',
    gbp_image_ready:gbp?.image_status==='READY',
    gbp_image_path:Boolean(gbp?.gbp_image_path),
    gbp_ratio:gbpQa.pass===true && gbpQa.ratio==='4:3' && Number(gbpQa.width)===1200 && Number(gbpQa.height)===900,
    visual_qa:qa.pass===true && qa.manual_visual_rejection!==true,
    source_scene_grounding:!sceneGroundingRequired(qa) || sceneGroundingPass(qa),
    scene_plausibility:qa.scene_plausibility_version===SCENE_PLAUSIBILITY_VERSION
      ? scenePlausibilityPass(qa) : !SCENE_PLAUSIBILITY_FIELDS.some(k=>qa[k]===false),
    xserver_verified:qa.xserver_live_verify_passed===true && qa.gbp_xserver_live_verify_passed===true,
    bridge_ready:bridge?.bridge_status==='PREVIEW_READY',
    review_url:Boolean(bridge?.review_url)
  };
  return {ok:Object.values(checks).every(Boolean),checks,missing:Object.keys(checks).filter(k=>!checks[k])};
}
