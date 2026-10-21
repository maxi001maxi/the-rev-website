import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// THE REV v3 locked-background editing.
// Opt-in only. The verified real room is the source of truth, NOT an OpenAI-generated new gym.
// API mask provides guidance. Final deterministic compositor restores all non-edit pixels
// from the authentic source, so rack/mirrors/floor outside the person silhouette are immutable.
const W=1024,H=1536;
const MASK={cx:757,cy:940,rx:248,ry:552};
function asDataUrl(bytes,mime='image/png'){return 'data:'+mime+';base64,'+bytes.toString('base64')}
function sha256(b){return createHash('sha256').update(b).digest('hex')}

async function prepareSourceAndMask(originalFile){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
    const sourceData=asDataUrl(fs.readFileSync(originalFile),'image/jpeg');
    return await page.evaluate(async({url,W,H,mask})=>{
      const load=async src=>{const img=new Image();img.src=src;await img.decode();return img};
      const im=await load(url);
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
      const ctx=canvas.getContext('2d');ctx.drawImage(im,0,0,W,H);
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

async function lockRoomOutsideEdit({sourceDataUrl,editedDataUrl}){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
    return await page.evaluate(async({src,edit,W,H,mask})=>{
      const load=async d=>{const im=new Image();im.src=d;await im.decode();return im};
      const [orig,updated]=await Promise.all([load(src),load(edit)]);
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
  throw Error('HARD_RESTORE_ROUTE_PAUSED: actual R9 clipped face/paper after subject escaped mask; a validated subject-support compositor is required before another paid edit');
  const {sourceDataUrl,maskDataUrl,sourceWidth,sourceHeight}=await prepareSourceAndMask(sourcePath);
  const input=[{type:'input_text',text:[
   'You are EDITING an authentic THE REV gym photograph, not generating a new gym. ',
   'Use the ORIGINAL input room as exact physical reality. The transparent mask is the only area allowed for a new human.',
   'Insert exactly one ordinary adult Japanese male visitor on the RIGHT foreground, calm optimistic expression, natural anatomically correct hands. ',
   'He is standing at a natural pause and casually straightens his T-shirt sleeve, looking slightly to the left at the existing gym rack.',
   'Head and body must be inside the edit ellipse (roughly x 510..1000 and y 388..1492 on 1024x1536 image). ',
   'His face near x 750 y 650; keep face and hands in central vertical band for a 16:9 middle crop. ',
   'At the boundary blend actual lighting/shadows and perspective with the source. DO NOT invent, move, reshape, or redraw rack/plates/mirror/windows.',
   'Original real THE REV rack must be visible outside the human-shaped insert. ',
   'This is a premium candid editorial moment, not a posed muscular model, no trainer, no text, no cellphone, no invented equipment.',
   prompt
  ].join('\n')},{type:'input_image',image_url:sourceDataUrl,detail:'high'}];
  const response=await generateResponse({
   model:process.env.EDITORIAL_IMAGE_GENERATION_MODEL||'gpt-5.6',input:[{role:'user',content:input}],
   tools:[{type:'image_generation',action:'edit',model:'gpt-image-1.5',quality:'high',size:'1024x1536',
           input_image_mask:{image_url:maskDataUrl}}]
  });
  const call=(response.output||[]).find(x=>x?.type==='image_generation_call'&&x?.result);
  if(!call)throw Error('OpenAI masked edit returned no image_generation_call');
  const editedDataUrl='data:image/png;base64,'+call.result;
  const combined=await lockRoomOutsideEdit({sourceDataUrl,editedDataUrl});
  if(combined.protectedChangedSamples>0)throw Error('ROOM_BACKGROUND_LOCK_FAILED: protected real room pixels altered');
  const out=path.resolve(job.generated_scene_path);fs.mkdirSync(path.dirname(out),{recursive:true});
  const resultBytes=Buffer.from(combined.imageDataUrl.split(',')[1],'base64');fs.writeFileSync(out,resultBytes);
  const report={source_real_photo_sha256:sha256(fs.readFileSync(sourcePath)),output_sha256:sha256(resultBytes),
    mask_policy:'opaque pixels preserved; transparent ellipse editable; exact hard restore outside ellipse',
    edit_model:'gpt-image-1.5',parent_model:process.env.EDITORIAL_IMAGE_GENERATION_MODEL||'gpt-5.6',
    output_size:[W,H],source_size:[sourceWidth,sourceHeight],mask:MASK,protected_samples:combined.protectedSamples,
    protected_changed_samples:combined.protectedChangedSamples,
    response_id:response.id||null,generation_call_id:call.id||null,
    usage:response.usage||null};
  fs.writeFileSync(out+'.locked-background.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({stage:'V3_LOCKED_BACKGROUND_EDIT_COMPLETE',asset_version:job.asset_version,...report,usage:report.usage?{total_tokens:report.usage.total_tokens}:null}));
  return out;
}
