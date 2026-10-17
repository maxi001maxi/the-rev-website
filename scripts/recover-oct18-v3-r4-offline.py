#!/usr/bin/env python3
"""THE REV. Oct18: no new image generation. Recover existing authentic OpenAI R4
human pixels and the original real THE REV. room, adjust crop and optical depth,
then pass the entire RESULT to normal independent QA. No model/billing in this script.
"""
import hashlib,json,glob
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter,ImageEnhance

SLUG='personal-gym-trial-three-checks'
OLD='reference-v3-masked-evolgear-20261018-contract-r4'
NEW='reference-v3-authentic-room-recovery-20261018-contract-r5'
JOB=Path('editorial/hybrid-image-jobs')/(SLUG+'.json')
SOURCE=Path('assets/images/photo-evolgear.jpg')
STATE=Path('editorial/image-operator-state')/(SLUG+'.json')
ARTROOT=Path('.offline-r4-evidence')
OUT_EVIDENCE=Path('editorial/prepublication/2026-10-18-contract-checklist/V3_R5_OFFLINE_RECOVERY.json')

files=list(ARTROOT.glob(f'**/assets/images/editorial-generated/{SLUG}-{OLD}-scene.png'))
assert len(files)==1,('Quarantined previous approved-via-OpenAI generation must exist uniquely',files)
quarantined=files[0]
j=json.loads(JOB.read_text(encoding='utf-8'))
assert j['asset_version']==OLD and j['v3']['provider']=='OpenAI'
assert j['max_generation_attempts']==1
source_sha=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
assert source_sha==j['scene_plan']['source_sha256']==j['source_scene_inventory']['source_sha256']

W,H=1024,1536
original=Image.open(SOURCE).convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
generated=Image.open(quarantined).convert('RGB')
assert generated.size==(W,H)
# Real geometry from original pixels. Mild real-lens-style softness keeps human primary
# without redrawing any machine or adding unsupported equipment.
true_room=ImageEnhance.Brightness(original.filter(ImageFilter.GaussianBlur(2.6))).enhance(1.035)
person_matte=Image.new('L',(W,H),0); pen=ImageDraw.Draw(person_matte)
pen.ellipse((518,345,982,1178),fill=255)
person_matte=person_matte.filter(ImageFilter.GaussianBlur(19))
composite=Image.composite(generated,true_room,person_matte)
# Discard original lower half beyond foreground person's visible editorial portrait.
# Renderer crop position is moved upward for BOTH human prominence and clipping correction.
for key in ['asset_version','generated_scene_path','thumbnail','og_image','gbp_image','qa_report_path']:
    j[key]=j[key].replace(OLD,NEW)
j['scene_object_position']={'thumbnail':'center 24%','og':'center 24%','gbp':'center 24%'}
j['v3']['offline_recovery_of']=OLD
j['v3']['background_lock']='original_room_pixel_source_plus_soft_depth_outside_subject'
j['v3']['no_new_image_generation']=True
j['v3']['offline_recovery_provenance']='github_actions_quarantine_run_38998995589'
j['v3']['offline_qa_independent']=True
j['v3']['cost_policy']='No new GPT image_generation; only independent GPT QA billed'
j['background_source']['treatment']='Verified THE REV real gym geometry restored outside quarantined OpenAI-generated human. Authentic original with subtle deterministic optical depth, no fictional rack.'
j['composition_hint']+=' OFFLINE R5 recovery: foreground face and natural sleeve action retained, crop top=24% to exclude waist/floor mask seams; restored real room exterior with subtle blur.'
out_scene=Path(j['generated_scene_path']);out_scene.parent.mkdir(parents=True,exist_ok=True)
composite.save(out_scene,'PNG',optimize=True)
JOB.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
state={'slug':SLUG,'status':'OVERLAY_RERENDER_REQUESTED','attempts_total':1,'max_attempts':1,
  'asset_version':NEW,'job_path':str(JOB),'generated_scene_path':str(out_scene),
  'xserver_verified':False,'recovery_provenance':j['v3']['offline_recovery_provenance']}
STATE.parent.mkdir(parents=True,exist_ok=True)
STATE.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report={'status':'IMAGE_GENERATION_NOT_REPEATED','source_image_sha256':source_sha,
  'openai_original_scene_sha256':hashlib.sha256(quarantined.read_bytes()).hexdigest(),
  'scene_output_sha256':hashlib.sha256(out_scene.read_bytes()).hexdigest(),
  'source_assets':[str(SOURCE),str(quarantined)],'output_scene':str(out_scene),
  'new_asset_version':NEW,'photo_background_original_source':True,
  'optical_room_blur_radius_px':2.6,'mask_rect_original_generated_person':[518,345,982,1178],
  'model_origin':'OpenAI masked edit R4 single image_generation call',
  'new_paid_image_generation_calls':0,'publish':False,'gbp_post':False,
  'current_qc':'PENDING independent multimodal visual QC; no PASS claimed'}
OUT_EVIDENCE.parent.mkdir(parents=True,exist_ok=True)
OUT_EVIDENCE.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
