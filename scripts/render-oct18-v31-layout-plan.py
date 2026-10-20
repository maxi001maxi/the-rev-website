"""Render a deterministic planning footprint through the real offline renderer.
No AI calls, publication images, production job or DB mutations.
"""
from pathlib import Path
import hashlib, json, math, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont
repo = Path.cwd()
root = repo / 'editorial/prepublication/2026-10-18-contract-checklist/v31-r8'
report = json.loads((root / 'FREE_PREFLIGHT.json').read_text())
brief = json.loads((root / 'CREATIVE_BRIEF.json').read_text())
job = json.loads((root / 'PROPOSED_JOB.json').read_text())
source = Image.open(repo / brief['source']['path']).convert('RGB')
scale = max(1536/source.width, 1024/source.height)
source = source.resize((round(source.width*scale), round(source.height*scale)), Image.Resampling.LANCZOS)
left, top = (source.width-1536)//2, (source.height-1024)//2
scene = source.crop((left, top, left+1536, top+1024)).convert('RGBA')
layer = Image.new('RGBA', scene.size)
d = ImageDraw.Draw(layer)
shot = brief['shot_contract']
def box(key):
    x,y,x2,y2 = shot[key]
    return (x*1536,y*1024,x2*1536,y2*1024)
face,hands,paper = [box(k) for k in ['face_box','hands_box','paper_box']]
d.rounded_rectangle(box('torso_box'), radius=55, fill=(36,125,162,80), outline=(7,93,120,255), width=4)
d.ellipse(face, fill=(36,125,162,120), outline=(7,93,120,255), width=4)
d.rectangle(hands, outline=(7,93,120,255), width=4)
d.rounded_rectangle(paper, radius=5, fill=(255,248,229,250), outline=(7,93,120,255), width=4)
for t in [.3,.5,.7]:
    yy=paper[1]+(paper[3]-paper[1])*t
    d.line((paper[0]+15,yy,paper[2]-15,yy), fill=(150,150,150,255), width=4)
start=tuple(a*b for a,b in zip(shot['gaze_from'],[1536,1024]))
end=tuple(a*b for a,b in zip(shot['gaze_to'],[1536,1024]))
d.line((*start,*end), fill=(206,71,59,255), width=8)
a=math.atan2(end[1]-start[1],end[0]-start[0])
d.polygon([end,(end[0]-25*math.cos(a-.45),end[1]-25*math.sin(a-.45)),(end[0]-25*math.cos(a+.45),end[1]-25*math.sin(a+.45))],fill=(206,71,59,255))
scene=Image.alpha_composite(scene,layer).convert('RGB')
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
panels=[]
with tempfile.TemporaryDirectory(prefix='oct18-layout-') as work:
    temp=Path(work)
    scene.save(temp/'planning-scene.png')
    job['generated_scene_path']=str(temp/'planning-scene.png')
    (temp/'job.json').write_text(json.dumps(job))
    result=subprocess.run(['node',str(repo/'scripts/render-hybrid-editorial-overlay.mjs'),str(temp/'job.json')],cwd=temp,capture_output=True,text=True)
    if result.returncode:raise RuntimeError(result.stderr)
    rendered=json.loads(result.stdout)
    report['canonical_renderer']={'command':'node scripts/render-hybrid-editorial-overlay.mjs <isolated-planning-job.json>','pass':rendered['typography']['pass'],'real_model_calls':0,'production_paths_written':False,'synthetic_human_footprint':True,'variants':[]}
    if not rendered['typography']['pass']:raise ValueError('Canonical typography measurements failed')
    for geo in report['geometry']:
        variant=geo['variant']
        original=Path(rendered[variant])
        im=Image.open(original).convert('RGB')
        if im.size!=(geo['width'],geo['height']):raise ValueError('Canonical renderer size mismatch')
        dest=root/f'planning-{variant}.jpg'
        dest.write_bytes(original.read_bytes())
        metric=rendered['typography']['variants'][variant]
        report['canonical_renderer']['variants'].append({'variant':variant,'path':str(dest.relative_to(repo)),'width':im.width,'height':im.height,'sha256':sha(dest),'typography_measurements_pass':metric['pass'],'not_visual_qc_pass':True})
        thumb=im.resize((720,round(im.height*720/im.width)),Image.Resampling.LANCZOS)
        panel=Image.new('RGB',(720,thumb.height+32),(16,44,62))
        ImageDraw.Draw(panel).text((8,6),f"PLANNING ONLY / {variant} / BLUE: footprint / RED: gaze",font=font,fill='white')
        panel.paste(thumb,(0,32));panels.append(panel)
contact=Image.new('RGB',(720,sum(p.height for p in panels)+24*(len(panels)-1)),'white')
yy=0
for p in panels:contact.paste(p,(0,yy));yy+=p.height+24
contact.save(root/'LAYOUT_REVIEW.jpg',quality=90,optimize=True)
report['planning_preview']={'path':str((root/'LAYOUT_REVIEW.jpg').relative_to(repo)),'sha256':sha(root/'LAYOUT_REVIEW.jpg'),'width':contact.width,'height':contact.height,'not_generated_image':True,'not_visual_qc_pass':True}
(root/'FREE_PREFLIGHT.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'canonical_renderer_pass':report['canonical_renderer']['pass'],'variants':len(panels),'preview':report['planning_preview']['path']}))
