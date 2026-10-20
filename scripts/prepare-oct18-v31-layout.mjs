// Free, deterministic planning diagrams. These are NOT generated candidates.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
import {semanticSimilarity} from '../lib/editorialSceneGrounding.mjs';
import {hybridAssetPaths} from '../lib/editorialHybridImageFormat.mjs';
import {editorialShootingContract} from '../lib/editorialShootingContract.mjs';
import {oct18V31BriefPreflight,briefDigest,recoveryJobDigest} from '../lib/editorialOct18V31Recovery.mjs';
const snapshotPath=process.argv[2];
if (!snapshotPath) throw new Error('Usage: node scripts/prepare-oct18-v31-layout.mjs <read-only-db-snapshot.json>');
const dir='editorial/prepublication/2026-10-18-contract-checklist/v31-r8';
fs.mkdirSync(dir,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const previous=read('editorial/hybrid-image-jobs/personal-gym-trial-three-checks.json');
const job=structuredClone(previous),version='reference-v31-lobby-contract-review-20261018-r8';
const paths=hybridAssetPaths(job.slug,version);
const action='Exactly one ordinary adult male first-time visitor STANDS in the foreground reception, on the camera side of the existing stool/counter. He holds a plain A5 information sheet at lower chest height with both hands, briefly reviewing the trial conditions before deciding. Torso in a relaxed three-quarter angle towards image-left; FACE remains visible. Both pupils and head tilt point DOWN to the sheet in his own hands, not towards the logo or rear rack. No staff, no phone, no equipment contact, no training, no signing a contract. The sheet has only three faint unlettered grey rules; NO readable price, Japanese text, QR, logo or personal data. This is an illustrative editorial scene, not a claim that THE REV uses this document/procedure.';
job.asset_version=version;job.generated_scene_path=`assets/images/editorial-generated/${job.slug}-${version}-scene.png`;
Object.assign(job,{thumbnail:paths.thumbnailRepoPath,og_image:paths.ogRepoPath,gbp_image:paths.gbpRepoPath,qa_report_path:`editorial/image-qa/${job.slug}-${version}.json`,max_generation_attempts:1,visible_action:action,visual_claim:'A visitor actively checks trial information before committing; the article explains fees, booking and leaving.',composition_hint:'Use the real source camera projection. Foreground standing waist-up customer at image right. Face and hands/sheet must remain separated from the text veil in all three crops. Preserve real counter/stool/rack positions and original light. No artificial new table or equipment.',scene_intent:action});
job.scene_plan={...job.scene_plan,human_action:'review_paper',composition_type:'medium_three_quarter_portrait',article_specific_directive:action};
job.scene_plan.similarity=semanticSimilarity(job.scene_plan,job.automation.recent_semantic_articles);
job.design_revision=job.policy.design_revision='editorial-thumbnail-v2.6-human-first';
job.scene_object_position={thumbnail:'center',og:'center',gbp:'center'};
delete job.automation.repair;
job.background_source.selection_reason='R8 proposed authentic reception source for a visitor reviewing trial information; source reuse awaits explicit Owner approval, all independent visual gates remain mandatory.';
job.background_source.treatment='Source-guided OpenAI edit; customer reviews a plain sheet in the real reception foreground; preserve all authentic room anchors and furniture, no composite cutout.';
job.automation.mode='OWNER_APPROVAL_REQUIRED_NOT_QUEUED';
job.automation.recovery_reason='New action and gaze; original body retained; R2/R6 rejected; no paid authorization yet';
delete job.v3;delete job.offline_review_photo_zoom;
job.v31={version:'THE_REV_IMAGE_V31',recovery_proposal:true,owner_spend_approval:'PENDING',source_guided_edit:true,creative_brief_path:dir+'/CREATIVE_BRIEF.json',max_qc_calls:2};
const shot={lens_mm_equivalent:50,lens_note:'framing intent only; exact original projection is authoritative; not a measured source EXIF claim',source_projection:'uniform cover, never stretch or reconstruct room',camera_height_m:null,subject_action:action,eyeline:'down from face [0.68,0.30] to actual sheet centre [0.685,0.65]',mood:'attentive, calm, self-directed; candid, not advertising or a trainer',background:'authentic real THE REV entrance/reception with exact rear rack, counter, plant, stool and beams',face_box:[0.60,0.17,0.76,0.38],hands_box:[0.58,0.54,0.79,0.73],paper_box:[0.59,0.55,0.78,0.75],torso_box:[0.54,0.36,0.84,0.98],gaze_from:[0.68,0.30],gaze_to:[0.685,0.65],crop_safe:'Face, pupils, both hands and paper stay visible in 16:9, OGP and GBP 4:3; left overlay never crosses the face or sheet',text_lines:job.image_headline_short.split('\n')};
const brief={schema:'the-rev-image-v31-recovery-brief-v1',content_id:'BLOG-20261018-082d82',asset_version:version,status:'DESIGN_READY_OWNER_SPEND_APPROVAL_PENDING',body_sha256:'5335b6e3dd556e6ff1b19deecb14602ef435081622da09c7204772bf4323f467',source:{path:job.automation.source_repo_path,sha256:sha(fs.readFileSync(job.automation.source_repo_path))},shot_contract:shot,quality_reference:job.style_references.at(-1),quality_requirements:{article_relevance_min:8,realism_axes_min:9,independent_qc:true,human_rejection_overrides_pass:true,compare_actual_r7:true},spend_policy:{provider:'OpenAI',key_source:'existing GitHub Actions secret; no new key',parent_model:'existing gpt-5.6 route',quality:'medium',size:'1536x1024',max_generation_calls:1,max_qc_calls:2,automatic_retry:false,confirmed_cost:null,owner_approval:'PENDING'},source_reuse:{status:'OWNER_APPROVAL_PENDING',scope:'this article, source SHA, new R8 version, private generation/QC only',reason:'Verified reception is required for reviewing trial terms. New paper-review action differs from R6 passive stand and R7 pain discussion; all grounding, novelty and visual gates remain mandatory.'},publication:{main_merge:false,production_staging:false,supabase_mutation:false,article_publish:false,gbp_post:false},prior_rejections:['R2','R6'],not_a_quality_pass:'Planning geometry does not prove realistic anatomy, background fidelity or semantic success of a future generated image.'};
fs.writeFileSync(dir+'/CREATIVE_BRIEF.json',JSON.stringify(brief,null,2)+'\n');fs.writeFileSync(dir+'/PROPOSED_JOB.json',JSON.stringify(job,null,2)+'\n');
const bodyHash=sha(fs.readFileSync(snapshotPath,'utf8'));
const current=read(snapshotPath);
const geometries=[];
const photo=job.automation.source_repo_path;
// The scene canvas is a uniformly cropped real photo; blue shapes are a
// proposed human/action footprint, not a replacement for the real image QC.
for(const [variant,W,H] of [['thumbnail',1200,675],['og',1200,630],['gbp',1200,900]]){
 const photoLeft=variant==='gbp'?0:W*.34,photoWidth=W-photoLeft;
 const scale=Math.max(photoWidth/1536,H/1024),ox=photoLeft+(photoWidth-1536*scale)/2,oy=(H-1024*scale)/2;
 const point=([x,y])=>[x*1536*scale+ox,y*1024*scale+oy];
 const rect=(b)=>{const [x,y]=point(b),[x2,y2]=point([b[2],b[3]]);return{x,y,width:x2-x,height:y2-y}};
 const face=rect(shot.face_box),hands=rect(shot.hands_box),paper=rect(shot.paper_box),torso=rect(shot.torso_box);
 const textEdge=variant==='gbp'?W*.54:W*.58;
 const safe=[face,hands,paper].every(b=>b.x>textEdge+12&&b.x+b.width<W-12&&b.y>12&&b.y+b.height<H-12);
 const [gx,gy]=point(shot.gaze_from),[tx,ty]=point(shot.gaze_to);
 const boxes=[['face',face],['hands',hands],['paper',paper]];
 // 1600x1409 source cover -> 1536x1024 virtual scene: scale .96, y -164.32.
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><clipPath id="photo"><rect x="${photoLeft}" y="0" width="${photoWidth}" height="${H}"/></clipPath><linearGradient id="veil"><stop offset="0" stop-color="#f8f5ed"/><stop offset="0.44" stop-color="#f8f5ed" stop-opacity=".96"/><stop offset=".61" stop-color="#f8f5ed" stop-opacity="0"/></linearGradient><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#ce473b"/></marker></defs><rect width="${W}" height="${H}" fill="#f7f4ec"/><g clip-path="url(#photo)"><svg x="${ox}" y="${oy}" width="${1536*scale}" height="${1024*scale}" viewBox="0 0 1536 1024"><image x="0" y="-164.32" width="1536" height="1352.64" xlink:href="../../../../${photo}"/></svg></g><rect width="${W}" height="${H}" fill="url(#veil)"/><rect x="${torso.x}" y="${torso.y}" width="${torso.width}" height="${torso.height}" rx="60" fill="#247da2" fill-opacity=".28" stroke="#247da2" stroke-width="3"/><ellipse cx="${face.x+face.width/2}" cy="${face.y+face.height/2}" rx="${face.width/2}" ry="${face.height/2}" fill="#247da2" fill-opacity=".42"/>${boxes.map(([label,b])=>`<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="none" stroke="#075d78" stroke-width="3" stroke-dasharray="7 5"/><text x="${b.x}" y="${b.y-5}" font-size="18" fill="#063d51">${label}</text>`).join('')}<rect x="${paper.x}" y="${paper.y}" width="${paper.width}" height="${paper.height}" rx="4" fill="#fff8e5" stroke="#075d78" stroke-width="3"/>${[.3,.5,.7].map(v=>`<line x1="${paper.x+15}" y1="${paper.y+paper.height*v}" x2="${paper.x+paper.width-15}" y2="${paper.y+paper.height*v}" stroke="#a4a4a4" stroke-width="3"/>`).join('')}<path d="M${gx},${gy} L${tx},${ty}" fill="none" stroke="#ce473b" stroke-width="5" marker-end="url(#arrow)"/><text x="55" y="${H*.39}" font-family="DejaVu Sans" font-size="37" fill="#272827">Before the trial,</text><text x="55" y="${H*.51}" font-family="DejaVu Sans" font-size="50" fill="#735320">3 things to check.</text><rect x="0" y="${H-38}" width="${W}" height="38" fill="#102c3e"/><text x="18" y="${H-12}" font-family="DejaVu Sans" font-size="18" fill="white">PLANNING ONLY / ${variant} ${W}x${H} / blue = person footprint; red = gaze / NOT GENERATED OR QC APPROVED</text></svg>`;
 const p=dir+`/layout-${variant}.svg`;fs.writeFileSync(p,svg);
 geometries.push({variant,width:W,height:H,photo_left:photoLeft,photo_width:photoWidth,scene_scale:scale,scene_offset:{x:ox,y:oy},safe,face,hands,paper,svg:p,sha256:sha(svg)});
}
const structural=preflightEditorialImage(job,read('editorial/automated-image-sources.json'));
const v31Preflight=oct18V31BriefPreflight(job,brief);
const shotMatches=editorialShootingContract(brief)===brief.shot_contract;
const errors=[...structural.errors,...v31Preflight.errors];if(!geometries.every(x=>x.safe))errors.push('FACE_HANDS_PAPER_CROP_UNSAFE');if(sha(current.body_markdown)!==brief.body_sha256)errors.push('BODY_CHANGED');if(!shotMatches)errors.push('BRIEF_NOT_CONNECTED');
const report={content_id:brief.content_id,asset_version:version,design_preflight:errors.length?'BLOCKED':'PASS',no_paid_calls:true,production_data_mutations:0,existing_body_retained:sha(current.body_markdown)===brief.body_sha256,structural,geometry:geometries,errors,source_photo_seen:true,r7_reference_seen:true,semantic_design_review:'Downward gaze terminates at the actual information sheet held by the visitor; active term-checking rather than passive looking at the gym. Actual pixels/anatomy/room fidelity remain independent post-generation QC requirements.',paid_execution:'OWNER_APPROVAL_REQUIRED',main_merge:'OWNER_APPROVAL_REQUIRED',production_staging:'OWNER_APPROVAL_REQUIRED',v31_preflight:v31Preflight,job_contract_sha256:recoveryJobDigest(job),brief_contract_sha256:briefDigest(brief),runtime_note:'Source reuse is prepared but not authorized; approval-bound source reuse still requires independent grounding, distinct scene and all visual gates.',source_snapshot_sha256:bodyHash};
fs.writeFileSync(dir+'/FREE_PREFLIGHT.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({design_preflight:report.design_preflight,errors,paid_execution:report.paid_execution}));
if(errors.length)process.exitCode=1;
