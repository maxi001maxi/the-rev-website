// Free design + actual offline renderer + adversarial pixel-lock verification.
// This never calls a model and never changes the canonical job, body or DB.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {R9_VERSION,R9_DIR,R9_SOURCE_SHA,r9BriefPreflight,prepareR9Source,lockR9Response,editR9LockedScene} from '../lib/editorialOct18R9.mjs';
import {briefDigest,recoveryJobDigest} from '../lib/editorialOct18V31Recovery.mjs';
import {semanticSimilarity,articleSceneIntent} from '../lib/editorialSceneGrounding.mjs';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
import {hybridAssetPaths} from '../lib/editorialHybridImageFormat.mjs';
globalThis.fetch=()=>{throw Error('FREE_DESIGN_MODEL_API_FORBIDDEN');};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const write=(p,data)=>fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');
fs.mkdirSync(R9_DIR,{recursive:true});
const registry=read('editorial/automated-image-sources.json');
const source=registry.sources.find(x=>x.repo_path==='assets/images/photo-evolgear.jpg');
if(sha(fs.readFileSync(source.repo_path))!==R9_SOURCE_SHA)throw Error('REAL_SOURCE_HASH_CHANGED');
const job=read('editorial/prepublication/2026-10-18-contract-checklist/v31-r8/PROPOSED_JOB.json');
const action='One ordinary adult male first-time visitor stands in the clear CAMERA-SIDE FOREGROUND, in front of the rack and bench, never inside the machine. Waist-up editorial portrait. He holds one plain unlettered A5 information sheet with both hands at lower chest height and looks DOWN at it, actively checking trial conditions before choosing. Face remains readable in three-quarter view. The sheet has three faint grey unlettered rules only: no generated prices, terms, signatures, QR or logos. No sleeve adjustment, phone, staff, exercise, equipment contact or fictional furniture. This is an illustrative reader situation, not a claim about the actual store explanation procedure. Keep the entire head, hands and paper inside the reviewed edit region; body continues beyond the bottom crop, with no closed oval or waist seam.';
const edit={mode:'polygon_foreground_source_lock_v1',size:'1024x1536',quality:'medium',source_fit:'uniform_cover',optical_blur_px:.8,feather_px:8,
  polygon_bounds:[.68,.26,1,1],polygon:[[.80,.26],[.91,.26],[.96,.32],[.96,.44],[.99,.49],[1,1],[.70,1],[.70,.69],[.68,.64],[.68,.56],[.72,.51],[.75,.46],[.75,.32]],
  protected_anchors:[{id:'rack_main_upright',box:[.48,.20,.56,.80]},{id:'cable_and_inner_frame',box:[.40,.26,.46,.72]},{id:'weight_stack',box:[.43,.70,.60,.80]}]};
const asset=hybridAssetPaths(job.slug,R9_VERSION);
Object.assign(job,{asset_version:R9_VERSION,generated_scene_path:`assets/images/editorial-generated/${job.slug}-${R9_VERSION}-scene.png`,thumbnail:asset.thumbnailRepoPath,og_image:asset.ogRepoPath,gbp_image:asset.gbpRepoPath,qa_report_path:`editorial/image-qa/${job.slug}-${R9_VERSION}.json`,scene_semantics_revision:'trial-terms-v1',visible_action:action,scene_intent:action,visual_claim:'A visitor checks fees, booking and leaving before a gym trial, with the real gym visibly recognizable.',composition_hint:'R4 direction: recognizable actual rack/cables and real room. Foreground visitor is separate from equipment. Exact source projection; no reimagined room.',style_references:[job.style_references.at(-1)]});
job.source_scene_inventory=source.scene_inventory;
job.scene_plan={...job.scene_plan,source_id:source.source_id,source_sha256:R9_SOURCE_SHA,scene_type:'personal_choice',location_type:'training_area',subject_zone:'training_area',human_action:'review_paper',composition_type:'medium_three_quarter_portrait',visual_role:'deciding_own_start',article_intent:articleSceneIntent({title:job.article_title,semantic_revision:'trial-terms-v1'}),article_specific_directive:action};
job.scene_plan.similarity=semanticSimilarity(job.scene_plan,job.automation.recent_semantic_articles);
job.background_source={drive_file_id:source.drive_file_id,selection_reason:'Owner prefers R4 equipment-visible direction only. Registered real rack photograph, original equipment geometry retained; old R4 pixels are never reused.',treatment:'Uniform cover plus deterministic 0.8px optical softness; person-only polygon edit and exact source-plate restoration outside region. No AI-redrawn facility.'};
Object.assign(job.automation,{mode:'OWNER_APPROVAL_REQUIRED_NOT_QUEUED',selected_source_id:source.source_id,source_repo_path:source.repo_path,repeated_due_to_relevance:false,repeat_distance:null,recovery_reason:'R4 composition direction; new source-locked foreground sheet-review action; all old failed media remain rejected.'});
job.v31={version:'THE_REV_IMAGE_V31',recovery_proposal:true,owner_spend_approval:'PENDING',creative_brief_path:R9_DIR+'/CREATIVE_BRIEF.json',max_qc_calls:2,locked_edit_plan:edit,gbp_photo_width_fraction:.8};
const shot={subject_action:action,eyeline:'down from the visible pupils [0.85,0.37] to the actual sheet [0.84,0.64]',face_box:[.79,.29,.92,.43],hands_box:[.72,.57,.95,.69],paper_box:[.74,.58,.94,.70],torso_box:[.76,.45,.97,1],gaze_from:[.85,.37],gaze_to:[.84,.64],text_lines:job.image_headline_short.split('\n'),camera:'exact original uniform cover projection; do not invent a focal length or camera height',background:'real EVOLGEAR rack, plate storage, cables and room remain visibly recognizable; no equipment touching; natural shallow depth judged only after generation',crop_safe:'head, both hands and paper visible in Thumbnail 16:9, OGP and GBP 4:3'};
const qc=read('editorial/prepublication/2026-10-18-contract-checklist/FINAL_QC_RESULT.json');
if(!qc.pass||qc.score_total!==20||sha(fs.readFileSync('editorial/prepublication/2026-10-18-contract-checklist/ARTICLE_DRAFT.md'))!==qc.source_sha256)throw Error('APPROVED_COPY_CHANGED');
const brief={schema:'the-rev-image-v31-r9-source-lock-v1',content_id:'BLOG-20261018-082d82',asset_version:R9_VERSION,status:'DESIGN_READY_SPEND_APPROVAL_PENDING',owner_direction:'R4 equipment-visible composition only; R4 itself remains rejected',source:{path:source.repo_path,sha256:R9_SOURCE_SHA},shot_contract:shot,locked_edit_plan:edit,quality_reference:job.style_references[0],semantic_contract:{revision:'trial-terms-v1',article_intent:'facility_selection',reason:'料金・予約・退会を体験前に比較確認する意思決定。運動実技ではない。Saved R8 observations/QA are not reclassified.'},body_qc_retained:{pass:true,score:20,source_sha256:qc.source_sha256},quality_requirements:{realism_each_min:9,human_first_unchanged:true,independent_qc:true,foreground_equipment_occlusion_qc:true,edge_seam_qc:true,actual_gaze_hand_sheet_qc:true,R7_comparison_required:true},spend_policy:{provider:'OpenAI',max_generation_calls:1,max_qc_calls:2,automatic_retry:false,owner_approval:'PENDING',confirmed_cost:null},publication:{main_merge:false,production_staging:false,supabase_mutation:false,article_publish:false,gbp_post:false},not_a_visual_pass:'Synthetic footprint and pixel-lock tests cannot verify a future person, shadows, anatomy, foreground depth or R7 parity.'};
write(R9_DIR+'/PROPOSED_JOB.json',job);write(R9_DIR+'/CREATIVE_BRIEF.json',brief);
const structural=preflightEditorialImage(job,registry),errors=[...structural.errors];
if(errors.length)throw Error(errors.join(','));
const browser=await chromium.launch({headless:true}),temp=fs.mkdtempSync(path.join(os.tmpdir(),'oct18-r9-design-'));
try {
  const page=await browser.newPage(),prepared=await prepareR9Source(page,source.repo_path,edit);
  job.v31.source_plate_sha256=brief.source.source_plate_sha256=sha(Buffer.from(prepared.sourceDataUrl.split(',')[1],'base64'));
  job.v31.edit_mask_sha256=brief.source.edit_mask_sha256=sha(Buffer.from(prepared.maskDataUrl.split(',')[1],'base64'));
  write(R9_DIR+'/PROPOSED_JOB.json',job);write(R9_DIR+'/CREATIVE_BRIEF.json',brief);
  const contract=r9BriefPreflight(job,brief);if(!contract.pass)throw Error(contract.errors.join(','));
  fs.writeFileSync(R9_DIR+'/EDIT_MASK.png',Buffer.from(prepared.maskDataUrl.split(',')[1],'base64'));
  const footprint=await page.evaluate(({shot})=>{
    const {canvas,W,H}=window.r9Source,c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0);
    const box=b=>[b[0]*W,b[1]*H,(b[2]-b[0])*W,(b[3]-b[1])*H];
    ctx.fillStyle='rgba(25,125,170,.40)';ctx.fillRect(...box(shot.torso_box));
    const f=box(shot.face_box);ctx.beginPath();ctx.ellipse(f[0]+f[2]/2,f[1]+f[3]/2,f[2]/2,f[3]/2,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#075d78';ctx.lineWidth=3;ctx.strokeRect(...box(shot.hands_box));ctx.fillStyle='#fff6de';ctx.fillRect(...box(shot.paper_box));ctx.strokeRect(...box(shot.paper_box));
    const p=box(shot.paper_box);ctx.strokeStyle='#aaa';for(const t of [.3,.5,.7]){ctx.beginPath();ctx.moveTo(p[0]+12,p[1]+p[3]*t);ctx.lineTo(p[0]+p[2]-12,p[1]+p[3]*t);ctx.stroke();}
    ctx.strokeStyle='#cc3028';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(shot.gaze_from[0]*W,shot.gaze_from[1]*H);ctx.lineTo(shot.gaze_to[0]*W,shot.gaze_to[1]*H);ctx.stroke();
    return c.toDataURL('image/png');
  },{shot});
  let syntheticRequests=0;
  await editR9LockedScene({job:{...job,generated_scene_path:path.join(temp,'planning.png')},sourcePath:source.repo_path,prompt:action,generateResponse:async payload=>{
    syntheticRequests++;
    if(payload.max_tool_calls!==1||payload.tools[0].input_image_mask.image_url!==prepared.maskDataUrl)throw Error('R9_LOCKED_REQUEST_NOT_CONNECTED');
    return {id:'SYNTHETIC_FREE_DESIGN_NO_MODEL',output:[{type:'image_generation_call',id:'SYNTHETIC',result:footprint.split(',')[1]}]};
  }});
  // Adversarial renderer paints EVERY pixel magenta. Protected original pixels
  // must survive exactly, including the 8px feather boundary, with no sampling.
  const adversary=await page.evaluate(()=>{const {W,H}=window.r9Source,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#ff00ff';x.fillRect(0,0,W,H);return c.toDataURL();});
  const hardLock=await lockR9Response(page,adversary,edit);
  if(hardLock.changed_protected_pixels!==0)throw Error('PROTECTED_SOURCE_LEAK');
  const geometry=[];
  for(const [variant,W,H] of [['thumbnail',1200,675],['og',1200,630],['gbp',1200,900]]) {
    const left=variant==='gbp'?W*.2:W*.34,photoW=W-left,scale=Math.max(photoW/1024,H/1536),ox=left+(photoW-1024*scale)/2,oy=(H-1536*scale)/2;
    const rect=b=>({x:ox+b[0]*1024*scale,y:oy+b[1]*1536*scale,width:(b[2]-b[0])*1024*scale,height:(b[3]-b[1])*1536*scale});
    const boxes=Object.fromEntries(['face_box','hands_box','paper_box'].map(k=>[k,rect(shot[k])]));
    const safe=Object.values(boxes).every(r=>r.x>W*(variant==='gbp'?.54:.58)+12&&r.x+r.width<W-12&&r.y>12&&r.y+r.height<H-12);
    const anchors=edit.protected_anchors.map(a=>{const r=rect(a.box);const visibleW=Math.max(0,Math.min(W,r.x+r.width)-Math.max(W*(variant==='gbp'?.54:.58),r.x)),visibleH=Math.max(0,Math.min(H,r.y+r.height)-Math.max(0,r.y));return {id:a.id,visible_width:visibleW,visible_height:visibleH,visible:visibleW>=25&&visibleH>=25};});
    if(!safe||!anchors.every(a=>a.visible))errors.push('R9_CROP_OR_EQUIPMENT_NOT_VISIBLE:'+variant);
    geometry.push({variant,width:W,height:H,person_action_safe:safe,protected_equipment:anchors,boxes});
  }
  const tmpJob={...job,generated_scene_path:path.join(temp,'planning.png')};write(path.join(temp,'job.json'),tmpJob);
  const rendered=spawnSync(process.execPath,[path.resolve('scripts/render-hybrid-editorial-overlay.mjs'),path.join(temp,'job.json')],{cwd:temp,encoding:'utf8'});
  if(rendered.status!==0)throw Error(rendered.stderr);
  const out=JSON.parse(rendered.stdout);
  if(!out.typography.pass)errors.push('CANONICAL_TYPOGRAPHY_FAILED');
  const variants=[];
  for(const g of geometry) {
    const target=R9_DIR+`/planning-${g.variant}.jpg`;fs.copyFileSync(out[g.variant],target);
    variants.push({variant:g.variant,path:target,width:g.width,height:g.height,sha256:sha(fs.readFileSync(target)),typography_measurements_pass:out.typography.variants[g.variant].pass,planning_only:true});
  }
  // Reproducible review diagrams, visibly distinct from accepted photography.
  const reviews=await page.evaluate(async({plan,variants})=>{
    const region=document.createElement('canvas');region.width=1024;region.height=1600;
    const x=region.getContext('2d');x.drawImage(window.r9Source.canvas,0,64);
    x.beginPath();plan.polygon.forEach(([a,b],i)=>x[i?'lineTo':'moveTo'](a*1024,b*1536+64));x.closePath();
    x.fillStyle='rgba(25,125,170,.30)';x.fill();x.strokeStyle='#12628c';x.lineWidth=5;x.stroke();
    x.strokeStyle='#00884e';x.fillStyle='#00884e';x.font='19px sans-serif';
    for(const a of plan.protected_anchors){const b=a.box;x.strokeRect(b[0]*1024,b[1]*1536+64,(b[2]-b[0])*1024,(b[3]-b[1])*1536);x.fillText(a.id,b[0]*1024,b[1]*1536+85);}
    const header=(ctx,w,h,label)=>{ctx.fillStyle='#112f40';ctx.fillRect(0,0,w,h);ctx.fillStyle='#fff';ctx.font='19px sans-serif';ctx.fillText(label,10,27);};
    header(x,1024,64,'PLANNING ONLY / BLUE: editable foreground / GREEN: protected rack');
    x.fillText('Original projection retained. No generated person or Visual QC PASS.',10,53);
    const images=[];for(const v of variants){const im=new Image();im.src=v.url;await im.decode();images.push({...v,im,height:Math.round(im.naturalHeight*720/im.naturalWidth)});}
    const board=document.createElement('canvas');board.width=720;board.height=images.reduce((n,v)=>n+v.height+40+16,0)-16;
    const y=board.getContext('2d');y.fillStyle='#fff';y.fillRect(0,0,720,board.height);let top=0;
    for(const v of images){y.save();y.translate(0,top);header(y,720,40,`PLANNING ONLY / ${v.variant} / BLUE: visitor footprint; RED: gaze`);y.drawImage(v.im,0,40,720,v.height);y.restore();top+=v.height+56;}
    return {region:region.toDataURL('image/jpeg',.9),layout:board.toDataURL('image/jpeg',.9)};
  },{plan:edit,variants:variants.map(v=>({variant:v.variant,url:'data:image/jpeg;base64,'+fs.readFileSync(v.path).toString('base64')}))});
  for(const [key,file] of [['region','EDIT_REGION_REVIEW.jpg'],['layout','LAYOUT_REVIEW.jpg']])fs.writeFileSync(R9_DIR+'/'+file,Buffer.from(reviews[key].split(',')[1],'base64'));
  const report={content_id:brief.content_id,asset_version:R9_VERSION,status:errors.length?'BLOCKED_FREE_DESIGN':'FREE_DESIGN_PREFLIGHT_PASS',errors,structural,contract,geometry,canonical_renderer:{pass:out.typography.pass,variants},source_lock:{source_sha256:R9_SOURCE_SHA,source_plate_sha256:sha(Buffer.from(prepared.sourceDataUrl.split(',')[1],'base64')),fit:'uniform_cover_no_stretch',optical_blur_px:.8,editable_polygon:edit.polygon,feather:'8px inward only; bottom continues beyond crop',protected_pixels:hardLock.protected_pixels,changed_protected_pixels:hardLock.changed_protected_pixels,adversarial_all_pixels_repainted:true,synthetic_generation_wrapper_calls:syntheticRequests,actual_model_calls:0,raw_checkpoint_exercised:fs.existsSync(path.join(temp,'planning.png.raw.png')),scope:'exact protected pixels against the deterministic source plate; person realism remains unverified'},body_qc_retained:brief.body_qc_retained,job_contract_sha256:recoveryJobDigest(job),brief_contract_sha256:briefDigest(brief),regression_manifest:'editorial/fixtures/oct18-image-rejections/manifest.json',model_api_calls:0,production_mutations:0,paid_execution:'OWNER_APPROVAL_REQUIRED_R9_NEW_BUDGET',actual_person_visual_qc:'NOT_RUN',actual_accepted_image:false,ready_for_owner_publish:false};
  write(R9_DIR+'/FREE_PREFLIGHT.json',report);
  console.log(JSON.stringify({status:report.status,errors,protected_pixels:hardLock.protected_pixels,changed_protected_pixels:hardLock.changed_protected_pixels,paid_execution:report.paid_execution}));
  if(errors.length)process.exitCode=1;
}finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
