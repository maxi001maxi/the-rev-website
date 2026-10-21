import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {guardedPhotoEditSettings} from './editorialGuardedPhotoEdit.mjs';

export const FINISH_VERSION='owner-japanese-night-finish-v1';
export const shaFile=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// Explicit new edit lifecycle. The rejected R3 is an input, never an accepted asset.
// Relighting changes pixels by definition; verify structure independently rather
// than claim an impossible exact-pixel lock. Legacy raw-pixel gates stay intact.
export function finishAdmission(job,{hash=shaFile}={}) {
  const f=job?.v3?.owner_finish;
  const depth=job?.asset_version==='reference-v082-evolgear-japanese-night-depth-20261020-r5';
  if(job?.v3?.background_lock!==FINISH_VERSION||job?.execution?.content_id!=='BLOG-20261021-4ac8fd'||
    job.execution.review_only!==true||job.execution.owner_approval?.status!=='APPROVED'||
    job.execution.generation_max_calls!==1||job.execution.independent_qc_max_calls!==2||
    job.max_generation_attempts!==1||job.layout_variant!=='human-first-v1'||
    Object.values(job.execution.production_authorization||{}).some(Boolean)||
    f?.input_path!=='.operator-finish-input/'+(depth?'r4':'r3')+'-scene.png'||f?.input_sha256!==(depth?'49f9a1d119bcf9907df8f5ee7364abfbf330bbfe05dd94222d36a638a74fb8c0':'a996f1e46d8f1f65abfeb99a4888e36674c15c8d1627450e0d2b1b88dbdd64b4')||
    f.source_sha256!=='437836aedf2116c7f051276d30aefb73e295f5f4481c8aa0c3b165f57d52f8ea'||
    (!depth&&job.asset_version!=='reference-v082-evolgear-japanese-night-finish-20261020-r4')||f.owner_direction_approval_only!==true)
    throw Error('OWNER_FINISH_SCOPE_INVALID');
  guardedPhotoEditSettings(job);
  if(hash(f.input_path)!==f.input_sha256||hash(job.automation.source_repo_path)!==f.source_sha256)throw Error('OWNER_FINISH_INPUT_DRIFT');
  return {pass:true,input_sha256:f.input_sha256,source_sha256:f.source_sha256,final_visual_qc_pass:false,production_writes:false};
}

export function finishVisualPass(q) {
  return ['japanese_customer_brief_matches','night_atmosphere_visible','approved_composition_preserved',
    'room_geometry_preserved','equipment_layout_preserved','hands_watch_gaze_natural','no_cutout_or_hard_restore',
    'all_three_formats_readable'].every(k=>q?.[k]===true);
}

export const FINISH_QC_GUIDANCE='This is a NEW Japanese-customer/night finishing edit. Owner approved the previous equipment-visible composition as a direction ONLY, not final acceptance. Keep every existing numeric, typography, Human First, realism and R7 quality requirement. Compare the actual source structure, not RGB equality: nighttime relighting may change colors/exposure but cannot move/rebuild equipment, windows, floor, mirrors or ceiling. Evaluate Japanese adult male customer brief without claiming identity or nationality verification. Require natural evening indoor light and visibly dark exterior behind the same blinds, with face/watch readable. Reject stereotyped or distorted faces, fake gym reconstruction, pasted people, awkward hands/gaze, implausible shadows, crushed dark previews or excessive blur hiding the actual gym. R7 is photographic-quality evidence, not a requirement to reproduce its different lobby composition. Return owner_finish_qc:{japanese_customer_brief_matches:boolean,night_atmosphere_visible:boolean,approved_composition_preserved:boolean,room_geometry_preserved:boolean,equipment_layout_preserved:boolean,hands_watch_gaze_natural:boolean,no_cutout_or_hard_restore:boolean,all_three_formats_readable:boolean,comments:string}. Any missing/false criterion fails. Do not use Owner direction approval as a QC vote.';

export async function editOwnerFinish({job,sourcePath,generateResponse}) {
  const admission=finishAdmission(job), settings=guardedPhotoEditSettings(job),f=job.v3.owner_finish;
  const url=p=>'data:image/'+(p.endsWith('.png')?'png':'jpeg')+';base64,'+fs.readFileSync(p).toString('base64');
  const depth=job.asset_version.endsWith('-r5');
  const prompt=depth?[
    'Use case: precise photographic depth correction. EDIT IMAGE 1 ONLY. Preserve this exact Japanese man, his face, hair, clothes, wristwatch gesture, anatomy, camera/framing, evening color and dark exterior. The ethnicity/night refinement is already complete; do not redo it.',
    'The ONLY remaining defect is that the background machinery is in the same sharp focus as the foreground customer. Give the existing photo convincing shallow optical depth of field: the man, face, eyes, hands, watch, clothing and body stay fully crisp; the rack, pulleys, bolts, cables and plates BEHIND him become naturally softly out of focus, with a smooth spatial focus transition. The gym must remain recognizable, not erased. Background bolts and cable details must NOT remain tack sharp.',
    'Simulate premium full-frame portrait photography with focus on the customer, f/1.8 optical background falloff, natural edge transitions and coherent existing indoor light. Person carries 60-70% attention in card crops. No cutout halo, pasted person, blur painted across skin or clothing, artificial outline, miniature tilt-shift band or indiscriminate whole-frame blur.',
    'IMAGE 2 is the real THE REV equipment/room spatial truth: retain every rack, plate, window, floor seam, mirror and beam in its current location. Do not rebuild geometry, create equipment, alter floor contact or add lamps. IMAGE 3 is accepted R7 photographic quality and depth reference ONLY; never copy its woman, reception room, pose or composition.',
    'Keep the already achieved natural Japanese male customer, dark exterior behind the same blinds and warm-neutral evening indoor illumination. Keep the current composition, equipment visibility, face/watch crop positions and time-checking story. Subtle authentic photographic finishing, not a new scene.',
    'Portrait 1024x1536. No generated text or watermark. Preserve the exact prior composition and customer identity; only depth/photographic integration may change.'
  ].join('\n'):[
    'Use case: lighting-weather and precise person edit. Make only a restrained final refinement to image 1, not a new composition.',
    'IMAGE 1 is the EDIT TARGET: retain exactly the current camera, framing, one male customer position, gray shirt/black shorts, full body scale, wristwatch-checking gesture and all visible equipment. IMAGE 2 is the actual THE REV gym spatial truth, not another target to regenerate from.',
    'Change the fictional customer to an ordinary Japanese adult man in his 30s with natural short dark hair, realistic skin texture and calm neutral expression. No exaggerated stereotype, model posing, trainer or additional people. Keep his gaze naturally on the wristwatch and hands/fingers anatomically correct.',
    'Add a subtle convincing NIGHT mood: outside behind the EXISTING window blinds is dark, no visible daytime greenery. Use the existing warm-neutral ceiling spotlights and soft ambient indoor fill. Natural coherent illumination/contact shadows; keep face and watch bright enough at 320px. No invented lamps, windows, night-sky graphics, moon, city view, blue filter or dramatically dark room.',
    'Keep the actual EVOLGEAR rack, cables, plates, bench, floor seams, ceiling beams, mirrors and window proportions/positions. No re-building, equipment movement, bar through the body, or equipment contact. The customer stands in front of the machine. Preserve the gym recognizability the Owner likes.',
    'Quiet premium editorial photography with subtle natural optical depth: customer face/gesture crisp, background gently subordinate but the equipment and type of room still clearly recognizable. Avoid hyper-sharp reconstructed machinery or heavy blur. Maintain the same composition and clothing, with subject attention around 60-70% in final card crops.',
    'Article meaning: after evening strength training, checking the time to decide when to finish before sleep. No claim to prove a sleep effect. No sleeping person or bedding.',
    'Portrait 1024x1536; no generated text, titles, numbers, logos or watermark. Later typography is deterministic. Preserve the face/watch within the existing crop positions. No cutout composite or hard restoration of source pixels.'
  ].join('\n');
  const response=await generateResponse({model:process.env.EDITORIAL_IMAGE_GENERATION_MODEL||'gpt-5.6',max_tool_calls:1,max_output_tokens:2048,
    input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:url(f.input_path),detail:'high'},{type:'input_image',image_url:url(sourcePath),detail:'high'},...(depth?[{type:'input_image',image_url:url(job.quality_references[0].path),detail:'high'}]:[])]}],
    tools:[{type:'image_generation',action:'edit',...settings,size:'1024x1536'}]});
  const out=(response.output||[]).filter(x=>x.type==='image_generation_call'&&x.result);
  if(out.length!==1)throw Error('OWNER_FINISH_EXPECTED_ONE_IMAGE');
  fs.mkdirSync(path.dirname(job.generated_scene_path),{recursive:true});fs.writeFileSync(job.generated_scene_path,Buffer.from(out[0].result,'base64'));
  fs.writeFileSync(job.generated_scene_path+'.raw-guard.json',JSON.stringify({mode:FINISH_VERSION,input_admission:admission,
    source_sha256:f.source_sha256,input_sha256:f.input_sha256,raw_sha256:shaFile(job.generated_scene_path),
    exact_pixel_preservation_claimed:false,independent_structural_qc_required:true,compositor_used:false,visual_qc_pass:false,response_id:response.id||null},null,2)+'\n');
  return job.generated_scene_path;
}
