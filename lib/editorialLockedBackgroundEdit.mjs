import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// THE REV v3 locked-background editing.
// Opt-in only. The verified real room is the source of truth, NOT an OpenAI-generated new gym.
// API mask provides guidance. Final deterministic compositor restores all non-edit pixels
// from the authentic source, so rack/mirrors/floor outside the person silhouette are immutable.
export function coverSourceRect(sw, sh, width, height) {
  const scale=Math.max(width/sw,height/sh);
  return {x:(width-sw*scale)/2,y:(height-sh*scale)/2,width:sw*scale,height:sh*scale};
}
export function lockedEditPlan(job) {
  const plan=job.v31?.locked_edit_plan;
  if (!plan || !['1536x1024','1024x1536'].includes(plan.size) || plan.quality!=='medium') throw Error('LOCKED_BACKGROUND_PLAN_REQUIRED: reviewed geometry and spend settings required');
  const [W,H]=plan.size.split('x').map(Number), MASK=plan.mask;
  if (!MASK || !['cx','cy','rx','ry'].every(k=>Number.isFinite(MASK[k])) || MASK.rx<=15 || MASK.ry<=15 || MASK.cx-MASK.rx<0 || MASK.cy-MASK.ry<0 || MASK.cx+MASK.rx>W || MASK.cy+MASK.ry>H) throw Error('LOCKED_BACKGROUND_MASK_INVALID');
  return {W,H,MASK,quality:plan.quality,size:plan.size};
}
function asDataUrl(bytes,mime='image/png'){return 'data:'+mime+';base64,'+bytes.toString('base64')}
function sha256(b){return createHash('sha256').update(b).digest('hex')}

async function prepareSourceAndMask(originalFile,{W,H,MASK}){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
    const sourceData=asDataUrl(fs.readFileSync(originalFile),'image/jpeg');
    return await page.evaluate(async({url,W,H,mask})=>{
      const load=async src=>{const img=new Image();img.src=src;await img.decode();return img};
      const im=await load(url);
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
      const ctx=canvas.getContext('2d');const scale=Math.max(W/im.naturalWidth,H/im.naturalHeight);
      ctx.drawImage(im,(W-im.naturalWidth*scale)/2,(H-im.naturalHeight*scale)/2,im.naturalWidth*scale,im.naturalHeight*scale);
      const resized=canvas.toDataURL('image/png');
      const m=document.createElement('canvas');m.width=W;m.height=H;const mc=m.getContext('2d');
      // 255 outside => protected. Transparent interior => GPT may insert exactly one person.
      mc.fillStyle='#000';mc.fillRect(0,0,W,H);
      mc.save();mc.beginPath();mc.ellipse(mask.cx,mask.cy,mask.rx,mask.ry,0,0,Math.PI*2);mc.clip();
      mc.clearRect(0,0,W,H);mc.restore();
      return {sourceDataUrl:resized,maskDataUrl:m.toDataURL('image/png'),sourceWidth:im.naturalWidth,sourceHeight:im.naturalHeight};
    },{url:sourceData,W,H,mask:MASK});
  }finally{await browser.close()}
}

async function lockRoomOutsideEdit({sourceDataUrl,editedDataUrl},{W,H,MASK}){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
    return await page.evaluate(async({src,edit,W,H,mask})=>{
      const load=async d=>{const im=new Image();im.src=d;await im.decode();return im};
      const [orig,updated]=await Promise.all([load(src),load(edit)]);
      if (updated.naturalWidth!==W || updated.naturalHeight!==H) throw Error('EDIT_OUTPUT_DIMENSION_MISMATCH');
      const c=document.createElement('canvas');c.width=W;c.height=H;const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(orig,0,0,W,H);
      const out=document.createElement('canvas');out.width=W;out.height=H;const oc=out.getContext('2d');oc.drawImage(updated,0,0,W,H);
      const matte=document.createElement('canvas');matte.width=W;matte.height=H;const mc=matte.getContext('2d');
      // Feathered silhouette edge prevents a sticker cutout, while hard preserving the original facility elsewhere.
      mc.filter='blur(15px)';mc.fillStyle='#fff';mc.beginPath();mc.ellipse(mask.cx,mask.cy,mask.rx-15,mask.ry-15,0,0,Math.PI*2);mc.fill();mc.filter='none';
      oc.globalCompositeOperation='destination-in';oc.drawImage(matte,0,0);oc.globalCompositeOperation='source-over';
      cx.drawImage(out,0,0);
      // Pixel-identity audit on representative protected stripes.
      const a=document.createElement('canvas');a.width=W;a.height=H;const ac=a.getContext('2d',{willReadFrequently:true});ac.drawImage(orig,0,0,W,H);
      const before=ac.getImageData(0,0,W,H).data,after=cx.getImageData(0,0,W,H).data;
      let total=0,diff=0;for(let y=0;y<H;y+=6){for(let x=0;x<W;x+=6){
        const nx=(x-mask.cx)/mask.rx,ny=(y-mask.cy)/mask.ry;
        if(nx*nx+ny*ny>1.2){let k=(y*W+x)*4;total++;if(before[k]!==after[k]||before[k+1]!==after[k+1]||before[k+2]!==after[k+2])diff++;}
      }}
      return {imageDataUrl:c.toDataURL('image/png'),protectedSamples:total,protectedChangedSamples:diff};
    },{src:sourceDataUrl,edit:editedDataUrl,W,H,mask:MASK});
  }finally{await browser.close()}
}

export async function editV3PhotoWithLockedBackground({job,sourcePath,generateResponse,prompt}){
  if(job.v3?.background_lock!=='masked_openai_edit_hard_restore_v1')throw Error('Background lock not activated');
  const plan=lockedEditPlan(job);
  const {W,H,MASK}=plan;
  const {sourceDataUrl,maskDataUrl,sourceWidth,sourceHeight}=await prepareSourceAndMask(sourcePath,plan);
  const input=[{type:'input_text',text:[
   'You are EDITING an authentic THE REV gym photograph, not generating a new gym. ',
   'Use the ORIGINAL input room as exact physical reality. The transparent mask is the only area allowed for a new human.',
   `Insert exactly one customer. Follow the reviewed article action and gaze below. Keep the subject inside the approved mask: ${JSON.stringify(MASK)} at ${W}x${H}.`,
   'At the boundary blend actual lighting/shadows and perspective with the source. DO NOT invent, move, reshape, or redraw rack/plates/mirror/windows.',
   'Original real THE REV rack must be visible outside the human-shaped insert. ',
   'This is a premium candid editorial moment, not a posed muscular model, no trainer, no text, no cellphone, no invented equipment.',
   prompt
  ].join('\n')},{type:'input_image',image_url:sourceDataUrl,detail:'high'}];
  const response=await generateResponse({
   model:process.env.EDITORIAL_IMAGE_GENERATION_MODEL||'gpt-5.6',input:[{role:'user',content:input}],
   tools:[{type:'image_generation',action:'edit',model:'gpt-image-1.5',quality:plan.quality,size:plan.size,
           input_image_mask:{image_url:maskDataUrl}}]
  });
  const call=(response.output||[]).find(x=>x?.type==='image_generation_call'&&x?.result);
  if(!call)throw Error('OpenAI masked edit returned no image_generation_call');
  const editedDataUrl='data:image/png;base64,'+call.result;
  const combined=await lockRoomOutsideEdit({sourceDataUrl,editedDataUrl},plan);
  if(combined.protectedChangedSamples>0)throw Error('ROOM_BACKGROUND_LOCK_FAILED: protected real room pixels altered');
  const out=path.resolve(job.generated_scene_path);fs.mkdirSync(path.dirname(out),{recursive:true});
  const resultBytes=Buffer.from(combined.imageDataUrl.split(',')[1],'base64');fs.writeFileSync(out,resultBytes);
  const report={source_real_photo_sha256:sha256(fs.readFileSync(sourcePath)),output_sha256:sha256(resultBytes),
    mask_policy:'approved ellipse editable; protected exterior restored; interior geometry requires independent QC',
    source_fit:'cover_uniform_scale_no_stretch',quality:plan.quality,request_size:plan.size,
    edit_model:'gpt-image-1.5',parent_model:process.env.EDITORIAL_IMAGE_GENERATION_MODEL||'gpt-5.6',
    output_size:[W,H],source_size:[sourceWidth,sourceHeight],mask:MASK,protected_samples:combined.protectedSamples,
    protected_changed_samples:combined.protectedChangedSamples,
    response_id:response.id||null,generation_call_id:call.id||null,
    usage:response.usage||null};
  fs.writeFileSync(out+'.locked-background.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({stage:'V3_LOCKED_BACKGROUND_EDIT_COMPLETE',asset_version:job.asset_version,...report,usage:report.usage?{total_tokens:report.usage.total_tokens}:null}));
  return out;
}
