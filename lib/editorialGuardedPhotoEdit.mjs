// Free validation only. No provider, compositor or publish dependency.
// Inspect RAW model pixels. Never repair rejected pixels by overwriting a person.
export function guardedPhotoEditPlan({width,height,edit,meaning,formats}) {
  const errors=[];
  const inside=(a,b)=>a.x>=b.x&&a.y>=b.y&&a.x+a.width<=b.x+b.width&&a.y+a.height<=b.y+b.height;
  const frame={x:0,y:0,width,height};
  if(![width,height,edit?.x,edit?.y,edit?.width,edit?.height].every(Number.isInteger)||width<1||height<1||!inside(edit,frame)||edit.width*edit.height>width*height*.45)errors.push('EDIT_REGION_INVALID');
  if(!meaning?.length||meaning.some(r=>!inside(r,edit)))errors.push('MEANING_OUTSIDE_EDIT');
  const crops=(formats||[]).map(f=>{
    const panelWidth=f.width*f.photo_width_fraction,scale=Math.max(panelWidth/width,f.height/height);
    const crop={x:(width-panelWidth/scale)/2,y:(height-f.height/scale)/2,width:panelWidth/scale,height:f.height/scale};
    if(meaning?.some(r=>!inside(r,crop)))errors.push('MEANING_CROPPED_'+f.name);
    return {...f,crop,scale};
  });
  if(crops.length!==3||new Set(crops.map(x=>x.name)).size!==3)errors.push('THREE_FORMATS_REQUIRED');
  return {pass:!errors.length,errors,crops,no_api_calls:true,visual_qc_pass:false};
}

export function inspectRawProtectedPixels({before,after,width,height,edit}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||before?.length!==width*height*4||after?.length!==before.length)throw Error('RAW_EDIT_DIMENSIONS_MISMATCH');
  let protectedPixels=0,changedPixels=0,edgeChangedPixels=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const allowed=x>=edit.x&&x<edit.x+edit.width&&y>=edit.y&&y<edit.y+edit.height;
    const p=(y*width+x)*4,changed=[0,1,2,3].some(k=>before[p+k]!==after[p+k]);
    if(!allowed){protectedPixels++;if(changed)changedPixels++;}
    // A subject or shadow reaching the mask edge cannot be safely clipped/restored.
    else if(changed&&(x===edit.x||y===edit.y||x===edit.x+edit.width-1||y===edit.y+edit.height-1))edgeChangedPixels++;
  }
  return {pass:changedPixels===0&&edgeChangedPixels===0,protectedPixels,changedPixels,edgeChangedPixels,
    reason:changedPixels?'RAW_BACKGROUND_DRIFT':edgeChangedPixels?'SUBJECT_OR_SHADOW_TOUCHES_EDIT_EDGE':null,
    compositor_used:false,visual_qc_pass:false};
}


// Explicit article-only precision model; legacy jobs retain their original engine.
export function guardedPhotoEditSettings(job) {
  const configured=job?.v3?.openai_edit;
  if(!configured)return {model:'gpt-image-1.5',quality:'high'};
  if(job?.execution?.review_only!==true ||
     job?.execution?.content_id!=='BLOG-20261021-4ac8fd' ||
     job?.execution?.owner_approval?.status!=='APPROVED' ||
     configured.model!=='gpt-image-2.5-sunburst-2026-09-08' ||
     configured.quality!=='max')throw Error('GUARDED_EDIT_MODEL_NOT_AUTHORIZED');
  return {model:configured.model,quality:configured.quality};
}

// Opt-in experimental route. The legacy hard-restore route remains paused.
// Caller supplies the canonical ledger-reserved OpenAI function; this module
// performs exactly one edit request and never promotes its result to QC PASS.
export async function editGuardedPhoto({job,sourcePath,generateResponse}) {
  const settings=guardedPhotoEditSettings(job);
  const fs=await import('node:fs');
  const {createHash}=await import('node:crypto');
  const {chromium}=await import('playwright');
  const plan=job?.v3?.guarded_edit;
  if(job?.v3?.background_lock!=='masked_openai_raw_guard_v2'||job.layout_variant!=='human-first-v1'||job.max_generation_attempts!==1||plan?.width!==1024||plan?.height!==1536||!guardedPhotoEditPlan(plan).pass)throw Error('GUARDED_EDIT_FREE_PREFLIGHT_FAILED');
  const source=fs.readFileSync(sourcePath);
  if(createHash('sha256').update(source).digest('hex')!==plan.source_sha256)throw Error('GUARDED_EDIT_SOURCE_DRIFT');
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const p=await browser.newPage();
    const prepared=await p.evaluate(async({url,plan})=>{
      const im=new Image();im.src=url;await im.decode();
      const c=document.createElement('canvas');c.width=plan.width;c.height=plan.height;const ctx=c.getContext('2d');
      const scale=Math.max(c.width/im.width,c.height/im.height);ctx.drawImage(im,(c.width-im.width*scale)/2,(c.height-im.height*scale)/2,im.width*scale,im.height*scale);
      const mask=document.createElement('canvas');mask.width=c.width;mask.height=c.height;const m=mask.getContext('2d');m.fillRect(0,0,c.width,c.height);m.clearRect(plan.edit.x,plan.edit.y,plan.edit.width,plan.edit.height);
      return {source:c.toDataURL('image/png'),mask:mask.toDataURL('image/png')};
    },{url:'data:image/jpeg;base64,'+source.toString('base64'),plan});
    const response=await generateResponse({model:process.env.EDITORIAL_IMAGE_GENERATION_MODEL||'gpt-5.6',max_tool_calls:1,max_output_tokens:2048,
      input:[{role:'user',content:[{type:'input_text',text:[
        'Edit the supplied actual THE REV gym photograph. Preserve all original room pixels outside the transparent mask exactly. No new gym, equipment, windows, lighting or night sky.',
        'Insert exactly one ordinary adult customer in the right foreground, in front of (never inside or operating) the actual rack. Neutral training clothes, no staff or trainer.',
        'A quiet pause at the end of training: the customer looks naturally at their wristwatch to decide whether to finish. One hand points loosely toward the watch; natural fingers, wrist, gaze and relaxed shoulders. Do not draw readable numerals or text.',
        'Keep the full person and contact shadow inside the edit region with unused margins. Face and watch gesture must each remain within their supplied meaning boxes. Preserve the original low camera angle, perspective, cool room light and floor contact. No strenuous cable exercise, pasted person, warm recoloring, or claim that the photo proves sleep improvement.',
        'Article: '+job.article_title,'Layout geometry: '+JSON.stringify(plan),
        'The raw result will be rejected if protected pixels change or if edits reach the region edge. It will NOT be clipped or repaired. No typography.'
      ].join('\n')},{type:'input_image',image_url:prepared.source,detail:'high'}]}],
      tools:[{type:'image_generation',action:'edit',...settings,size:'1024x1536',input_image_mask:{image_url:prepared.mask}}]});
    const outputs=(response.output||[]).filter(x=>x.type==='image_generation_call'&&x.result);
    if(outputs.length!==1)throw Error('GUARDED_EDIT_EXPECTED_ONE_IMAGE');
    const raw=Buffer.from(outputs[0].result,'base64');
    const path=await import('node:path');fs.mkdirSync(path.dirname(job.generated_scene_path),{recursive:true});
    fs.writeFileSync(job.generated_scene_path,raw); // Retained by the runner's quarantine path if guard fails.
    const audit=await p.evaluate(async({before,after,plan,guard})=>{
      const load=async url=>{const im=new Image();im.src=url;await im.decode();return im;};
      const a=await load(before),b=await load(after);
      if(b.width!==plan.width||b.height!==plan.height)throw Error('RAW_EDIT_DIMENSIONS_MISMATCH');
      const pixels=im=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,im.width,im.height).data;};
      return new Function('return ('+guard+')')()({before:pixels(a),after:pixels(b),width:plan.width,height:plan.height,edit:plan.edit});
    },{before:prepared.source,after:'data:image/png;base64,'+raw.toString('base64'),plan,guard:inspectRawProtectedPixels.toString()});
    fs.writeFileSync(job.generated_scene_path+'.raw-guard.json',JSON.stringify({...audit,source_sha256:plan.source_sha256,raw_sha256:createHash('sha256').update(raw).digest('hex'),response_id:response.id||null,usage:response.usage||null},null,2)+'\n');
    if(!audit.pass && !(job?.execution?.review_only===true && job?.v3?.diagnostic_qc_on_raw_reject===true))throw Error('GUARDED_EDIT_REJECTED:'+audit.reason);
    return job.generated_scene_path;
  }finally{await browser.close();}
}
