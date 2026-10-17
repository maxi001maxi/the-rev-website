// Live SHA256 gate for exact BLOG_FAST writes. Never trust a 200 response alone.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const safe=p=>/^[a-zA-Z0-9_.\/-]+$/.test(p)&&!p.split('/').includes('..')&&!p.startsWith('/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function verifyBlogDeltaLive(manifest,{
  root='deploy/blog',origin='https://therev-lab.com',fetchImpl=fetch,attempts=10,delayMs=4000
}={}){
  for(const p of [...manifest.changed,...manifest.deleted]){
    if(!safe(p))throw Error('UNSAFE_BLOG_PATH');
    if(p==='.htaccess')continue;
    const deleted=manifest.deleted.includes(p);
    const expected=deleted?null:sha(fs.readFileSync(path.join(root,p)));
    const u=new URL('/blog/'+p,origin);u.searchParams.set('delta-check',Date.now().toString());
    let verified=false;
    for(let i=1;i<=attempts;i++){
      try{
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);
        let res;try{res=await fetchImpl(u,{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timeout);}
        if(deleted?res.status===404:(res.ok&&sha(Buffer.from(await res.arrayBuffer()))===expected)){
          verified=true;break;
        }
      }catch{/* transient network errors retry without claiming success */}
      if(i<attempts)await sleep(delayMs);
    }
    if(!verified)throw Error('BLOG_DELTA_LIVE_SHA_OR_REMOVAL_FAILED: '+p);
  }
  return true;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
  const m=JSON.parse(fs.readFileSync('.blog-delta-summary.json','utf8'));
  await verifyBlogDeltaLive(m);
  console.log('BLOG_DELTA_SHA256_LIVE_PASS',m.changed.length,'changed',m.deleted.length,'deleted');
}
