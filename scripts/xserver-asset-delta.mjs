// Safe, asset-only Xserver delta: verify publicly served old bytes first.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1];};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const safe=p=>/^assets\/[A-Za-z0-9_.\/-]+$/.test(p)&&!p.split('/').includes('..')&&!p.includes('//')&&!p.endsWith('/');
const quote=p=>'"'+p.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
export function planAssetDelta({files,distRoot='dist',before,oldBlob,liveBlob,backupDir='delta-backup'}){
  if(!/^[a-f0-9]{40}$/.test(before||''))throw Error('DELTA_PARENT_UNVERIFIED');
  const uniq=[...new Set(files.filter(Boolean))];
  if(!uniq.length||uniq.length>30||uniq.some(p=>!safe(p)))throw Error('DELTA_PATH_UNSAFE_OR_EMPTY');
  const out=[],upload=[],rollback=[];
  fs.mkdirSync(backupDir,{recursive:true});
  for(const p of uniq){
    const fresh=path.join(distRoot,p);
    if(!fs.statSync(fresh,{throwIfNoEntry:false})?.isFile())throw Error('DELTA_SOURCE_MISSING: '+p);
    const bytes=fs.readFileSync(fresh),prior=oldBlob(p),live=liveBlob(p);
    if(prior!==null){
      if(live===null||sha(prior)!==sha(live))throw Error('DELTA_PREIMAGE_MISMATCH: '+p);
      const dest=path.join(backupDir,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,prior);
      rollback.push('mkdir -p '+quote('/'+path.posix.dirname(p)), 'put -O '+quote('/'+path.posix.dirname(p))+' '+quote(dest));
    }else{
      if(live!==null)throw Error('DELTA_UNEXPECTED_REMOTE_FILE: '+p);
      rollback.push('rm -f '+quote('/'+p));
    }
    upload.push('mkdir -p '+quote('/'+path.posix.dirname(p)),'put -O '+quote('/'+path.posix.dirname(p))+' '+quote(fresh));
    out.push({path:p,new_sha256:sha(bytes),old_sha256:prior===null?null:sha(prior),bytes:bytes.length});
  }
  fs.writeFileSync(path.join(backupDir,'manifest.json'),JSON.stringify({before,items:out},null,2)+'\n');
  fs.writeFileSync('.delta-upload.lftp',upload.join('\n')+'\n');
  fs.writeFileSync('.delta-rollback.lftp',rollback.join('\n')+'\n');
  return out;
}
async function liveBlobHttps(p){
  const u=new URL('https://therev-lab.com/'+p);u.searchParams.set('preimage',String(Date.now()));
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{
    const res=await fetch(u,{cache:'no-store',signal:controller.signal,headers:{'Cache-Control':'no-cache'}});
    if(res.status===404)return null;
    if(!res.ok)throw Error('REMOTE_PREIMAGE_HTTP_'+res.status+': '+p);
    return Buffer.from(await res.arrayBuffer());
  }finally{clearTimeout(timeout);}
}
async function verifyCurrent(manifestPath){
  const j=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  for(const x of j.items){
    const live=await liveBlobHttps(x.path);
    if(!live||sha(live)!==x.new_sha256)throw Error('DELTA_LIVE_BYTES_MISMATCH: '+x.path);
  }
  console.log('DELTA_LIVE_VERIFY_PASS',j.items.length);
}
if(process.argv[1] && import.meta.url === new URL('file://'+path.resolve(process.argv[1])).href){
 const mode=arg('--mode'),before=arg('--before'),manifest=arg('--manifest')||'delta-backup/manifest.json';
 if(mode==='verify')await verifyCurrent(manifest);
 else if(mode==='prepare'){
   const files=fs.readFileSync(arg('--paths'),'utf8').trim().split(/\r?\n/).filter(Boolean);
   const oldBlob=p=>{try{return execFileSync('git',['show',before+':'+p],{maxBuffer:50*1024*1024});}catch(e){if(e.status===128)return null;throw e;}};
   const liveCache=new Map();
   for(const p of files)liveCache.set(p,await liveBlobHttps(p));
   const r=planAssetDelta({files,before,oldBlob,liveBlob:p=>liveCache.get(p)});
   console.log('DELTA_PREIMAGE_SAFE',JSON.stringify(r));
 }else throw Error('unknown --mode');
}
