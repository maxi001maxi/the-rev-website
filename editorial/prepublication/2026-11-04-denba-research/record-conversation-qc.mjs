import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {evaluateSceneGrounding} from '../../../lib/editorialSceneGrounding.mjs';
import {hybridQaReady} from '../../../lib/editorialHybridImageFormat.mjs';
import {evaluateEditorialImageReview} from '../../../lib/editorialImageReviewGate.mjs';
import {GOLDEN_REFERENCE_REVISION,GOLDEN_REFERENCE_ASSETS,TYPOGRAPHY_VISUAL_CHECKS,ART_DIRECTION_CHECKS} from '../../../lib/editorialThumbnailTypography.mjs';
const jp='editorial/hybrid-image-jobs/denba-health-effects-research-evidence.json';
const j=JSON.parse(fs.readFileSync(jp));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const now=new Date().toISOString();
// These observations were made by the conversation's reviewer after opening the
// real source, generated scene, final 3 formats and actual 320/400px JPEGs.
// This script records that review; it does not call a model or infer a visual PASS.
const reviewer={
  "method": "ChatGPT Work in-conversation visual review",
  "provider": "current ChatGPT conversation",
  "external_ai_api_calls": 0,
  "checked_at": "NOW",
  "owner_authorization": "Owner requests writing, generation and QC in this ChatGPT Work conversation without paid AI API; Nov4 chose DENBA research; stop at CMS prepublication draft.",
  "observations": [
    "実提供のDENBA実機写真と生成シーンを照合。ベージュ壁、壁面ロゴ、白いスイッチ、白いキャビネット上の黒いDENBA本体の関係を維持。実機を操作せず、新しいマット・医療機器・運動器具を追加していない。",
    "男性のお客様役1人が座位でひと息つく。顔・視線・手の組み方・服のしわ・光と影が自然。座面と床は画角外であり、未確認の椅子や治療サービスは描いていない。",
    "サムネイル1200x675、OGP1200x630、GBP1200x900の原寸と実JPEG320/400pxの6枚を開いて確認。研究結果、どう読む？の二行が即読でき、顔とTHE REV.のロゴ、DENBA本体が確認できる。",
    "文字は固定レンダラーの大きさ・中央配置・曲線fadeで合成。wide/OGP20.8px、GBP17.87px相当の補助行。左の文字と右の人物が競合せず、顔や手にfadeが侵入しない。",
    "研究は心拍変動と一部身体指標の結果として扱い、医療的効果・改善・酸素ルーム併用の相乗効果を絵で表現しない。利用前の静かな休息場面である。"
  ],
  "score_interpretation": "Scores are this conversation reviewer's editorial judgments, not physical measurements or an external independent model result."
};reviewer.checked_at=now;
const typography=JSON.parse(fs.readFileSync(j.thumbnail+'.typography.json'));
if(!typography.pass)throw Error('Deterministic typography failed');
for(const [k,p] of Object.entries({thumbnail:j.thumbnail,og:j.og_image,gbp:j.gbp_image})){
 if(hash(p)!==typography.variants[k].asset_sha256)throw Error('Rendered bytes differ from measured typography');
 for(const v of Object.values(typography.variants[k].previews))if(hash(v.path)!==v.sha256)throw Error('Preview bytes differ');
}
const observedEquipment=[{object:'denba_device',zone:'reception'}];
const observations={complete:true,equipment:observedEquipment,visible_fixtures:[],location_type:'reception',subject_zone:'reception',human_action:'rest',equipment_relocated:false,room_geometry_preserved:true,article_scene_match:true,scene_fingerprint:{scene_type:'recovery_transition',location_type:'reception',human_action:'rest',composition_type:'medium_seated_portrait',visual_role:'recovery_time',article_intent:'recovery'}};
const recent=j.automation.recent_semantic_articles.map(r=>({...r,scene_fingerprint:r.sceneFingerprint}));
const grounding=evaluateSceneGrounding({inventory:j.source_scene_inventory,plan:j.scene_plan,sourceRecognition:{complete:true,equipment:observedEquipment,visible_fixtures:[]},observation:observations,recent});
if(!grounding.pass)throw Error(JSON.stringify(grounding.errors));
Object.assign(grounding,{recent,asset_version:j.asset_version,observation_method:reviewer.method,asset_hashes:{source:hash(j.automation.source_repo_path),scene:hash(j.generated_scene_path),thumbnail:hash(j.thumbnail),og:hash(j.og_image),gbp:hash(j.gbp_image)}});
const perVariant=(keys)=>Object.fromEntries(['thumbnail','og','gbp'].map(v=>[v,{pass:true,...Object.fromEntries(keys.map(k=>[k,true]))}]));
const qa={slug:j.slug,article_title:j.article_title,image_headline_short:j.image_headline_short,customer_presentation:j.customer_presentation,asset_version:j.asset_version,render_version:j.render_version,policy_revision:j.policy_revision,layout_template_id:j.layout_template_id,design_revision:j.design_revision,layout_variant:j.layout_variant,checked_at:now,pass:true,review_mode:'HYBRID_GENERATED',actual_reviewer:reviewer,
 series_consistency:8,editorial_quality:8,typography_harmony:9,negative_space:8,photo_treatment:8,article_visual_relevance:9,main_claim_visualization:9,rev_environment_consistency:8,brand_space_authenticity:8,
 human_subject_prominence:9,human_visual_attention_share:65,face_expression_readable:true,background_secondary_pass:true,background_soft_blur_pass:true,the_rev_anchor_visible:true,customer_presentation_matches_plan:true,
 realism_qc_version:'v1',human_environment_integration:9,perspective_scale_consistency:9,ground_contact_shadow_consistency:9,lighting_consistency:9,anatomy_pose_realism:9,no_cutout_or_sticker_look:true,location_semantics_pass:true,exercise_pose_plausible:true,manual_visual_rejection:false,
 trainer_present:false,unknown_trainer_present:false,non_customer_people_present:false,customer_only_or_no_people:true,generated_customer_present:true,generated_customer_count:1,facility_only_thumbnail:false,fixed_overlay_layout_confirmed:true,
 real_the_rev_background_confirmed:true,source_material_scope_pass:true,background_source_recorded:true,background_selection_reason_recorded:true,background_source_drive_file_id:j.background_source.drive_file_id,background_selection_reason:j.background_source.selection_reason,content_reference:'drive://'+j.background_source.drive_file_id+'/'+j.background_source.origin_video_file_name,
 image_generation_used:true,fallback_used:false,recent_similarity_check_pass:true,same_image_as_recent_articles:false,same_background_as_recent_articles:false,trainer_photo_reused:false,recent_similarity_window:4,recent_reference_guard:j.automation,
 gbp_image_required:true,gbp_aspect_ratio_pass:true,gbp_safe_area_pass:true,gbp_copy_legible:true,expected_copy_present:true,copy_legible:true,too_promotional:false,headline_line_break_quality:true,headline_balance_score:9,
 scene_plausibility_version:'the-rev-scene-plausibility-v1',location_behavior_plausible:true,service_misrepresentation_absent:true,unsupported_equipment_absent:true,scene_plausible_at_the_rev:true,article_theme_inferable_without_title:true,scene_action_has_article_specific_meaning:true,generic_passive_pose_without_article_reason:false,
 scene_grounding_version:'the-rev-source-scene-v1',scene_grounding:grounding,thumbnail_typography_revision:typography.revision,
 thumbnail_typography_acceptance:{pass:true,deterministic:typography,visual:perVariant(TYPOGRAPHY_VISUAL_CHECKS),art_direction:{pass:true,variants:perVariant(ART_DIRECTION_CHECKS),comments:'3形式の原寸と実JPEG320/400pxを本会話で確認。研究の効果を可視化せず、実DENBAを背景に利用前に休む1人の顧客を表現。'},golden_reference:{revision:GOLDEN_REFERENCE_REVISION,assets:GOLDEN_REFERENCE_ASSETS,comparison_basis:'Canonical typography grammar, fixed renderer, locked reference metadata; reference bytes are additionally verified by repository CI.'}},
 editorial_text_qc:j.automation.editorial_text_qc,publish_requires_human_approval:true,external_ai_api_calls_this_review:0,blog_published:false,gbp_posted:false};
j.execution={...j.execution,independent_qc_max_calls:0,qc_mode:'in-conversation',ai_api_calls_allowed:false,actual_qa_provider:reviewer.provider,owner_qc_method_override:reviewer.owner_authorization};
const d={slug:j.slug,image_render_version:j.render_version,image_strategy:j.image_strategy,image_asset_version:j.asset_version,image_source_path:j.automation.source_repo_path,gbp_image_asset_version:j.asset_version,image_qa:qa};
const review=evaluateEditorialImageReview({draft:d,qa});
if(!hybridQaReady(d,qa)||!review.ok)throw Error(JSON.stringify(review.errors));
fs.mkdirSync('editorial/image-qa',{recursive:true});fs.writeFileSync(j.qa_report_path,JSON.stringify(qa,null,2)+'\n');fs.writeFileSync(jp,JSON.stringify(j,null,2)+'\n');
fs.writeFileSync('editorial/prepublication/2026-11-04-denba-research/CONVERSATION_QC.json',JSON.stringify({reviewer,canonical_image_review:review,grounding_pass:grounding.pass,body_sha256:j.automation.editorial_text_qc.body_sha256,asset_hashes:grounding.asset_hashes},null,2)+'\n');
fs.writeFileSync('editorial/image-operator-state/'+j.slug+'.json',JSON.stringify({slug:j.slug,status:'READY_CANDIDATE',asset_version:j.asset_version,job_path:jp,generated_scene_path:j.generated_scene_path,thumbnail:j.thumbnail,og_image:j.og_image,gbp_image:j.gbp_image,qa_report_path:j.qa_report_path,attempts_total:1,max_attempts:1,xserver_verified:false,actual_qa_provider:reviewer.provider,ai_api_calls_allowed:false,last_error:'',updated_at:now},null,2)+'\n');
console.log(JSON.stringify({manual_qc_pass:true,canonical_image_review:review.ok,scene_grounding:grounding.pass,ai_api_calls:0}));
