// Engineering wireframe, NEVER an accepted article image. No AI calls.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {guardedPhotoEditPlan,inspectRawProtectedPixels} from '../lib/editorialGuardedPhotoEdit.mjs';
const root='editorial/prepublication/2026-10-21-evening-strength-sleep',out=root+'/image-design';fs.mkdirSync(out,{recursive:true});
const source='assets/images/photo-evolgear.jpg';
const bytes=fs.readFileSync(source),sha=createHash('sha256').update(bytes).digest('hex');
const registered=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json')).sources.find(x=>x.repo_path===source);
if(sha!==registered.scene_inventory.source_sha256)throw Error('SOURCE_DRIFT');
const plan={width:1024,height:1536,edit:{x:560,y:410,width:440,height:1100},meaning:[{name:'face',x:680,y:500,width:190,height:190},{name:'watch_gesture',x:640,y:800,width:270,height:200}],formats:[{name:'thumbnail',width:1200,height:675,photo_width_fraction:.66},{name:'og',width:1200,height:630,photo_width_fraction:.66},{name:'gbp',width:1200,height:900,photo_width_fraction:1}]};
const geometry=guardedPhotoEditPlan(plan);if(!geometry.pass)throw Error(geometry.errors.join(','));
const b=await chromium.launch({headless:true,args:['--no-sandbox']});let pixelProof;
try{const p=await b.newPage();pixelProof=await p.evaluate(async({data,plan,guard})=>{
 const im=new Image();im.src=data;await im.decode();const c=document.createElement('canvas');c.width=plan.width;c.height=plan.height;
 const ctx=c.getContext('2d',{willReadFrequently:true}),s=Math.max(c.width/im.width,c.height/im.height);
 ctx.drawImage(im,(c.width-im.width*s)/2,(c.height-im.height*s)/2,im.width*s,im.height*s);
 const before=ctx.getImageData(0,0,c.width,c.height).data;ctx.fillStyle='#ff00ff';ctx.fillRect(700,550,80,80);const after=ctx.getImageData(0,0,c.width,c.height).data;
 const inspect=new Function('return ('+guard+')')();return {proof:inspect({before,after,width:plan.width,height:plan.height,edit:plan.edit}),source_size:[im.width,im.height]};
 },{data:'data:image/jpeg;base64,'+bytes.toString('base64'),plan,guard:inspectRawProtectedPixels.toString()});
}finally{await b.close();}
const proof=pixelProof.proof;
// Only diagrams with the authentic photo and labeled boxes. No human is fabricated.
const sourceData='../../../../assets/images/photo-evolgear.jpg';
const scale=Math.max(plan.width/pixelProof.source_size[0],plan.height/pixelProof.source_size[1]);
const inner=`<image href="${sourceData}" x="${(plan.width-pixelProof.source_size[0]*scale)/2}" y="0" width="${pixelProof.source_size[0]*scale}" height="1536"/><rect x="560" y="410" width="440" height="1100" fill="none" stroke="#ffb300" stroke-width="8"/>${plan.meaning.map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="#12cdd4" fill-opacity=".3" stroke="#12cdd4" stroke-width="6"/><text x="${r.x}" y="${r.y+30}" font-size="26" fill="white">${r.name}</text>`).join('')}`;
for(const f of geometry.crops){
 const x=f.width*(1-f.photo_width_fraction);const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${f.width}" height="${f.height}" viewBox="0 0 ${f.width} ${f.height}"><defs><clipPath id="panel"><rect x="${x}" width="${f.width-x}" height="${f.height}"/></clipPath></defs><rect width="100%" height="100%" fill="#f7f4ec"/><g clip-path="url(#panel)"><g transform="translate(${x-f.crop.x*f.scale},${-f.crop.y*f.scale}) scale(${f.scale})">${inner}</g></g><text x="30" y="100" font-family="sans-serif" font-size="42" fill="#26221d">夜の筋トレ、</text><text x="30" y="160" font-family="sans-serif" font-size="42" fill="#26221d">何時まで？</text><rect y="${f.height-35}" width="100%" height="35" fill="#111"/><text x="20" y="${f.height-10}" font-family="sans-serif" font-size="20" fill="white">DESIGN WIREFRAME ONLY — NO HUMAN / NO VISUAL QC / NOT PUBLISHABLE</text></svg>`;fs.writeFileSync(out+'/'+f.name+'-wireframe.svg',svg);
}
const report={content_id:'BLOG-20261021-4ac8fd',status:'GEOMETRY_PASS_PRODUCTION_EDIT_BLOCKED',source_id:registered.source_id,source_path:source,source_sha256:sha,source_size:pixelProof.source_size,plan,geometry,pixel_guard_synthetic_proof:proof,uniform_cover_no_stretch:true,raw_edit_no_restore:true,
 unresolved:['Actual OpenAI mask fidelity is not verified; protected raw pixels must match exactly, otherwise quarantine.','No validated person/hand segmentation; edge guard alone cannot certify anatomy or occlusion.','Independent Visual QC and R7 comparison must assess full scene, hands/gaze, equipment occlusion, source authenticity and each actual JPEG.','Recent-12 complete semantic history and recent-4 source exclusion must be refreshed before paid job admission.'],paid_calls:0,visual_qc_pass:false,adopted:false,production_job_changed:false,paid_execution_authorized:false};
fs.writeFileSync(root+'/IMAGE_FREE_PREFLIGHT_V082.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,source_sha256:sha,guard_pass:proof.pass,no_paid_calls:true}));

fs.mkdirSync('qa-out/oct21-image-design',{recursive:true});
const previewBrowser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{const page=await previewBrowser.newPage();for(const f of geometry.crops){await page.setViewportSize({width:f.width,height:f.height});await page.goto('file://'+process.cwd()+'/'+out+'/'+f.name+'-wireframe.svg');await page.screenshot({path:'qa-out/oct21-image-design/'+f.name+'-wireframe.png'});}}finally{await previewBrowser.close();}
