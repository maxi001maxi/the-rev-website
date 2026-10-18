import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {briefDigest,recoveryJobDigest} from './editorialOct18V31Recovery.mjs';
export const R9_VERSION='reference-v31-evolgear-terms-foreground-20261018-r9';
export const R9_DIR='editorial/prepublication/2026-10-18-contract-checklist/v31-r9';
export const R9_SOURCE_SHA='437836aedf2116c7f051276d30aefb73e295f5f4481c8aa0c3b165f57d52f8ea';

// Self-contained so the exact same geometry runs in Node tests and Canvas.
export function r9PixelAlpha(x,y,plan) {
  const [W,H]=plan.size.split('x').map(Number),px=x/W,py=y/H;
  if(px<plan.polygon_bounds[0]||px>plan.polygon_bounds[2]||py<plan.polygon_bounds[1]||py>plan.polygon_bounds[3])return 0;
  for(const a of plan.protected_anchors)if(px>=a.box[0]&&px<=a.box[2]&&py>=a.box[1]&&py<=a.box[3])return 0;
  const poly=plan.polygon;let inside=false,distance=Infinity;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const [ax,ay]=poly[j],[bx,by]=poly[i];
    if((ay>py)!==(by>py) && px<(bx-ax)*(py-ay)/(by-ay)+ax)inside=!inside;
    const dx=(bx-ax)*W,dy=(by-ay)*H,qx=x-ax*W,qy=y-ay*H;
    const t=Math.max(0,Math.min(1,(qx*dx+qy*dy)/(dx*dx+dy*dy||1)));
    // Continue the matte beyond the bottom crop: no R4 ellipse/waist arc.
    if(ay===1&&by===1)continue;
    distance=Math.min(distance,Math.hypot(qx-t*dx,qy-t*dy));
  }
  if(!inside)return 0;
  const t=Math.min(1,distance/plan.feather_px);
  return t*t*(3-2*t); // feather entirely INSIDE the approved editable polygon
}
export function r9ComposePixels(source,edited,W,H,plan,alphaAt=r9PixelAlpha) {
  if(source.length!==W*H*4||edited.length!==source.length)throw Error('R9_RGBA_DIMENSION_MISMATCH');
  const pixels=new Uint8ClampedArray(source);let protectedPixels=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++) {
    const alpha=alphaAt(x+.5,y+.5,plan),i=(y*W+x)*4;
    if(alpha===0){protectedPixels++;continue;}
    for(let k=0;k<3;k++)pixels[i+k]=Math.round(source[i+k]*(1-alpha)+edited[i+k]*alpha);
    pixels[i+3]=255;
  }
  return {pixels,protectedPixels};
}
export function auditR9ProtectedPixels(source,candidate,W,H,plan) {
  if(source.length!==W*H*4||candidate.length!==source.length)throw Error('R9_RGBA_DIMENSION_MISMATCH');
  let checked=0,changed=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(r9PixelAlpha(x+.5,y+.5,plan)===0) {
    checked++;const i=(y*W+x)*4;
    if([0,1,2,3].some(k=>source[i+k]!==candidate[i+k]))changed++;
  }
  return {pass:changed===0,protected_pixels:checked,changed_protected_pixels:changed};
}
export function r9BriefPreflight(job,brief,{requireApproval=false}={}) {
  const errors=[],check=(ok,e)=>{if(!ok)errors.push(e);};
  const plan=job.v31?.locked_edit_plan,shot=brief?.shot_contract;
  check(job.slug==='personal-gym-trial-three-checks'&&job.asset_version===R9_VERSION&&brief?.asset_version===R9_VERSION&&brief?.content_id==='BLOG-20261018-082d82','R9_SCOPE_MISMATCH');
  check(brief?.source?.sha256===R9_SOURCE_SHA&&job.scene_plan?.source_sha256===R9_SOURCE_SHA&&job.automation?.source_repo_path==='assets/images/photo-evolgear.jpg','R9_SOURCE_MISMATCH');
  check(/^[a-f0-9]{64}$/.test(job.v31?.source_plate_sha256||'')&&job.v31.source_plate_sha256===brief?.source?.source_plate_sha256&&/^[a-f0-9]{64}$/.test(job.v31?.edit_mask_sha256||'')&&job.v31.edit_mask_sha256===brief?.source?.edit_mask_sha256,'R9_SOURCE_PLATE_OR_MASK_NOT_BOUND');
  check(plan?.mode==='polygon_foreground_source_lock_v1'&&plan.size==='1024x1536'&&plan.feather_px===8&&plan.source_fit==='uniform_cover'&&plan.optical_blur_px===.8,'R9_LOCK_CONTRACT_MISSING');
  check(plan?.polygon?.length>=8&&plan.polygon.every(p=>p.length===2&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1))&&plan.polygon.filter(p=>p[1]===1).length>=2,'R9_MASK_GEOMETRY_INVALID');
  check(plan?.protected_anchors?.length>=3&&plan.protected_anchors.every(a=>a.box[2]<plan.polygon_bounds[0]),'R9_EDIT_INTERSECTS_PROTECTED_RACK');
  if(plan&&shot&&Array.isArray(plan.polygon))for(const name of ['face_box','hands_box','paper_box']) {
    const box=shot[name];check(Array.isArray(box)&&box.length===4,'R9_ACTION_BOX_MISSING');
    if(Array.isArray(box))for(const x of [box[0],(box[0]+box[2])/2,box[2]])for(const y of [box[1],(box[1]+box[3])/2,box[3]])check(r9PixelAlpha(x*1024,y*1536,plan)===1,'R9_ACTION_CROSSES_EDIT_EDGE');
  }
  check(shot?.subject_action===job.visible_action&&shot?.subject_action===job.scene_plan?.article_specific_directive&&/sheet/.test(shot?.eyeline||'')&&/down/.test(shot?.eyeline||''),'R9_ACTION_GAZE_NOT_CONNECTED');
  check(job.scene_semantics_revision==='trial-terms-v1'&&job.scene_plan?.article_intent==='facility_selection'&&job.scene_plan?.human_action==='review_paper','R9_TERMS_SEMANTICS_MISMATCH');
  check(job.design_revision==='editorial-thumbnail-v2.6-human-first'&&job.layout_variant==='human-first-v1'&&job.v31?.gbp_photo_width_fraction===.8&&shot?.text_lines?.join('\n')===job.image_headline_short,'R9_LAYOUT_CHANGED');
  check(job.max_generation_attempts===1&&job.v31?.max_qc_calls===2&&brief?.spend_policy?.provider==='OpenAI'&&brief?.spend_policy?.max_generation_calls===1&&brief?.spend_policy?.automatic_retry===false,'R9_SPEND_LIMIT_CHANGED');
  check(job.publish_requires_human_approval===true&&['main_merge','production_staging','supabase_mutation','article_publish','gbp_post'].every(k=>brief?.publication?.[k]===false),'R9_PUBLICATION_BOUNDARY_CHANGED');
  if(requireApproval) {
    const a=job.v31?.owner_approval;
    check(job.v31.owner_spend_approval==='APPROVED'&&a?.status==='APPROVED'&&a.approved_by==='OWNER'&&Number.isFinite(Date.parse(a.approved_at))&&a.content_id===brief.content_id&&a.asset_version===R9_VERSION&&a.source_sha256===R9_SOURCE_SHA&&a.scope==='SINGLE_GENERATION_AND_PRIVATE_QC'&&a.max_generation_calls===1&&a.max_qc_calls===2&&a.automatic_retry===false&&a.job_sha256===recoveryJobDigest(job)&&a.brief_sha256===briefDigest(brief),'OWNER_SPEND_APPROVAL_REQUIRED');
  }
  return {pass:errors.length===0,errors:[...new Set(errors)],requires_real_visual_qc:true};
}
const dataUrl=(bytes,type='image/png')=>'data:'+type+';base64,'+bytes.toString('base64');
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function prepareR9Source(page,sourcePath,plan) {
  await page.addScriptTag({content:`window.r9Alpha=${r9PixelAlpha.toString()};window.r9Compose=${r9ComposePixels.toString()};`});
  return page.evaluate(async({url,plan})=>{
    const [W,H]=plan.size.split('x').map(Number),im=new Image();im.src=url;await im.decode();
    const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#ddd';ctx.fillRect(0,0,W,H);ctx.filter=`blur(${plan.optical_blur_px}px)`;
    const scale=Math.max(W/im.naturalWidth,H/im.naturalHeight);
    ctx.drawImage(im,(W-im.naturalWidth*scale)/2,(H-im.naturalHeight*scale)/2,im.naturalWidth*scale,im.naturalHeight*scale);ctx.filter='none';
    const source=ctx.getImageData(0,0,W,H);
    const m=document.createElement('canvas');m.width=W;m.height=H;const mc=m.getContext('2d');const pixels=mc.createImageData(W,H);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)pixels.data[(y*W+x)*4+3]=Math.round(255*(1-window.r9Alpha(x+.5,y+.5,plan)));
    mc.putImageData(pixels,0,0);
    window.r9Source={canvas:c,rgba:source.data,W,H};
    return {sourceDataUrl:c.toDataURL('image/png'),maskDataUrl:m.toDataURL('image/png'),source_size:[im.naturalWidth,im.naturalHeight]};
  },{url:dataUrl(fs.readFileSync(sourcePath),'image/jpeg'),plan});
}
export async function lockR9Response(page,editedDataUrl,plan) {
  return page.evaluate(async({url,plan})=>{
    const {rgba,W,H}=window.r9Source,im=new Image();im.src=url;await im.decode();
    if(im.naturalWidth!==W||im.naturalHeight!==H)throw Error('R9_EDIT_DIMENSIONS_MISMATCH');
    const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);
    const merged=window.r9Compose(rgba,ctx.getImageData(0,0,W,H).data,W,H,plan,window.r9Alpha);
    ctx.putImageData(new ImageData(merged.pixels,W,H),0,0);
    // Audit all protected pixels, including boundary pixels, after Canvas write.
    const actual=ctx.getImageData(0,0,W,H).data;let checked=0,changed=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(window.r9Alpha(x+.5,y+.5,plan)===0){checked++;const i=(y*W+x)*4;if([0,1,2,3].some(k=>actual[i+k]!==rgba[i+k]))changed++;}
    return {imageDataUrl:c.toDataURL('image/png'),protected_pixels:checked,changed_protected_pixels:changed};
  },{url:editedDataUrl,plan});
}
export async function editR9LockedScene({job,sourcePath,generateResponse,prompt}) {
  const plan=job.v31.locked_edit_plan;
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage(),prepared=await prepareR9Source(page,sourcePath,plan);
    if(sha(Buffer.from(prepared.sourceDataUrl.split(',')[1],'base64'))!==job.v31.source_plate_sha256||sha(Buffer.from(prepared.maskDataUrl.split(',')[1],'base64'))!==job.v31.edit_mask_sha256)throw Error('R9_SOURCE_PLATE_OR_MASK_CHANGED_BEFORE_API');
    const content=[{type:'input_text',text:'Edit this real photograph ONLY inside the transparent foreground polygon. One visitor is IN FRONT OF the rack, never inside it. No equipment touching, no room reconstruction. Keep the complete person/action away from the mask edge. '+prompt},{type:'input_image',image_url:prepared.sourceDataUrl,detail:'high'}];
    if(job.style_references?.[0])content.push({type:'input_text',text:'R7 photographic quality reference only. Do not copy its room, person or pose.'},{type:'input_image',image_url:dataUrl(fs.readFileSync(job.style_references[0]),'image/jpeg'),detail:'high'});
    const response=await generateResponse({model:process.env.EDITORIAL_IMAGE_GENERATION_MODEL||'gpt-5.6',max_tool_calls:1,
      input:[{role:'user',content}],
      tools:[{type:'image_generation',action:'edit',model:'gpt-image-1.5',size:plan.size,quality:'medium',input_image_mask:{image_url:prepared.maskDataUrl}}]});
    const calls=(response.output||[]).filter(x=>x.type==='image_generation_call'&&x.result);
    if(calls.length!==1)throw Error('R9_EXACTLY_ONE_IMAGE_REQUIRED');
    // Retain the raw result before lock/QA; no successful generation is discarded.
    const raw=Buffer.from(calls[0].result,'base64');fs.mkdirSync(path.dirname(job.generated_scene_path),{recursive:true});fs.writeFileSync(job.generated_scene_path+'.raw.png',raw);
    const locked=await lockR9Response(page,dataUrl(raw),plan);
    if(locked.changed_protected_pixels!==0)throw Error('R9_BACKGROUND_LOCK_FAILED');
    const bytes=Buffer.from(locked.imageDataUrl.split(',')[1],'base64');fs.writeFileSync(job.generated_scene_path,bytes);
    fs.writeFileSync(job.generated_scene_path+'.locked-background.json',JSON.stringify({asset_version:R9_VERSION,source_sha256:sha(fs.readFileSync(sourcePath)),source_plate_sha256:sha(Buffer.from(prepared.sourceDataUrl.split(',')[1],'base64')),scene_sha256:sha(bytes),raw_sha256:sha(raw),source_fit:'uniform_cover',optical_blur_px:plan.optical_blur_px,protected_pixels:locked.protected_pixels,changed_protected_pixels:0,actual_person_integration_qc:'PENDING',response_id:response.id},null,2)+'\n');
    return job.generated_scene_path;
  }finally{await browser.close();}
}
