"""Render exact pre-generation planning diagrams; no AI or candidate photograph."""
from pathlib import Path
import json, math, hashlib
from PIL import Image, ImageDraw, ImageFont
root = Path('editorial/prepublication/2026-10-18-contract-checklist/v31-r8')
report = json.loads((root / 'FREE_PREFLIGHT.json').read_text())
brief = json.loads((root / 'CREATIVE_BRIEF.json').read_text())
source = Image.open(brief['source']['path']).convert('RGB')
scale = max(1536/source.width, 1024/source.height)
source = source.resize((round(source.width*scale), round(source.height*scale)), Image.Resampling.LANCZOS)
left, top = (source.width-1536)//2, (source.height-1024)//2
scene = source.crop((left,top,left+1536,top+1024))
font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
panels=[]
for geo in report['geometry']:
    w,h = geo['width'],geo['height']
    scale=max(w/1536,h/1024)
    im=scene.resize((round(1536*scale),round(1024*scale)),Image.Resampling.LANCZOS)
    x,y=(im.width-w)//2,(im.height-h)//2
    im=im.crop((x,y,x+w,y+h)).convert('RGBA')
    veil=Image.new('RGBA',im.size)
    draw=ImageDraw.Draw(veil)
    for x in range(w):
        alpha=255 if x<w*.44 else max(0,round(255*(.61-x/w)/.17))
        draw.line((x,0,x,h),fill=(248,245,237,alpha))
    im=Image.alpha_composite(im,veil)
    overlay=Image.new('RGBA',im.size);d=ImageDraw.Draw(overlay)
    def box(r):return (r['x'],r['y'],r['x']+r['width'],r['y']+r['height'])
    face=geo['face'];hands=geo['hands'];paper=geo['paper']
    d.rounded_rectangle((face['x']-35,face['y']+face['height']*.8,w-40,h-45),radius=50,fill=(36,125,162,65),outline=(7,93,120,255),width=3)
    d.ellipse(box(face),fill=(36,125,162,100),outline=(7,93,120,255),width=3)
    d.rectangle(box(hands),outline=(7,93,120,255),width=3)
    d.rounded_rectangle(box(paper),radius=4,fill=(255,248,229,245),outline=(7,93,120,255),width=3)
    for t in [.3,.5,.7]:
        yy=paper['y']+paper['height']*t
        d.line((paper['x']+15,yy,paper['x']+paper['width']-15,yy),fill=(150,150,150,255),width=3)
    start=(face['x']+face['width']*.55,face['y']+face['height']*.6)
    end=(paper['x']+paper['width']/2,paper['y']+paper['height']/2)
    d.line((*start,*end),fill=(206,71,59,255),width=6)
    angle=math.atan2(end[1]-start[1],end[0]-start[0])
    d.polygon([end,(end[0]-20*math.cos(angle-.45),end[1]-20*math.sin(angle-.45)),(end[0]-20*math.cos(angle+.45),end[1]-20*math.sin(angle+.45))],fill=(206,71,59,255))
    for name,r in [('FACE',face),('HANDS',hands)]:d.text((r['x'],r['y']-24),name,font=ImageFont.truetype(font,20),fill=(6,61,81,255))
    d.text((55,h*.36),'APPROVED JP COPY AREA',font=ImageFont.truetype(font,25),fill=(39,40,39,255))
    d.text((55,h*.44),'Final type: existing renderer',font=ImageFont.truetype(font,24),fill=(115,83,32,255))
    d.rectangle((0,h-40,w,h),fill=(16,44,62,255))
    d.text((15,h-31),f"PLANNING ONLY | {geo['variant']} {w}x{h} | BLUE: human footprint / RED: gaze",font=ImageFont.truetype(font,19),fill='white')
    im=Image.alpha_composite(im,overlay).convert('RGB')
    thumb=im.resize((720,round(h*720/w)),Image.Resampling.LANCZOS)
    panels.append(thumb)
contact=Image.new('RGB',(720,sum(x.height for x in panels)+32*(len(panels)-1)),(255,255,255))
yy=0
for p in panels:contact.paste(p,(0,yy));yy+=p.height+32
contact.save(root/'LAYOUT_REVIEW.jpg',quality=90,optimize=True)
report['planning_preview']={'path':str(root/'LAYOUT_REVIEW.jpg'),'sha256':hashlib.sha256((root/'LAYOUT_REVIEW.jpg').read_bytes()).hexdigest(),'width':contact.width,'height':contact.height,'not_generated_image':True,'not_visual_qc_pass':True}
(root/'FREE_PREFLIGHT.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print(root/'LAYOUT_REVIEW.jpg')
