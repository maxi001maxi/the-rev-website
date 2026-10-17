// Compare TWO deterministic blog builds and upload only changed public outputs.
// For unavailable/unverifiable previous builds the workflow uses the old full
// mirrored Blog deploy. Both modes retain live all-article index checks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const arg=k=>{let i=process.argv.indexOf(k);return i<0?null:process.argv[i+1];};
const sum=b=>crypto.createHash('sha256').update(b).digest('hex');
const safe=p=>/^[a-zA-Z0-9_.\/-]+$/.test(p)&&!p.split('/').includes('..')&&!p.startsWith('/');
const quote=s=>'"'+String(s).replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
function walk(root,sub=''){
  const out=new Map();
  if(!fs.existsSync(path.join(root,sub)))return out;
  for(const ent of fs.readdirSync(path.join(root,sub),{withFileTypes:true})){
    const rel=path.posix.join(sub,ent.name);
    if(!safe(rel))throw Error('UNSAFE_BLOG_PATH: '+rel);
    if(ent.isDirectory()){for(const [k,v] of walk(root,rel))out.set(k,v);}
    else if(ent.isFile())out.set(rel,fs.readFileSync(path.join(root,rel)));
  }
  return out;
}
export function planBlogDelta({oldRoot,newRoot,maxChanged=50}){
 const a=walk(oldRoot),b=walk(newRoot),changed=[],deleted=[];
 if(!a.size||!b.size||!b.has('index.html')||!b.has('.htaccess'))throw Error('BLOG_DELTA_BUILDS_INCOMPLETE');
 for(const [p,v] of b)if(!a.has(p)||sum(a.get(p))!==sum(v))changed.push(p);
 for(const [p] of a)if(!b.has(p))deleted.push(p);
 if(changed.length+deleted.length>maxChanged)throw Error('BLOG_DELTA_TOO_LARGE');
 const order=p=>p==='index.html'?2:p==='.htaccess'?3:1;
 changed.sort((x,y)=>order(x)-order(y)||x.localeCompare(y));
 const cmds=[];
 for(const p of changed){let dir=path.posix.dirname(p);cmds.push('mkdir -pf '+quote('/blog/'+(dir==='.'?'':dir)), 'put -O '+quote('/blog/'+(dir==='.'?'':dir))+' '+quote(path.posix.join('deploy/blog',p)));}
 // Delete stale published pages only after replacements have been uploaded.
 for(const p of deleted)cmds.push('rm -f '+quote('/blog/'+p));
 // Always restore cache policy in the same session, and index was uploaded LAST.
 cmds.push('put -O "/blog/" "deploy/blog/.htaccess"');
 const slugs=[...new Set([...changed,...deleted].filter(x=>x.endsWith('/index.html')&&!x.includes('/page/')).map(x=>x.slice(0,-'/index.html'.length)).filter(x=>x&&!x.includes('/')))].sort();
 return {changed,deleted,slugs,commands:cmds,oldCount:a.size,newCount:b.size};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
 const plan=planBlogDelta({oldRoot:arg('--old-root'),newRoot:arg('--new-root')});
 fs.writeFileSync('.blog-delta.lftp',plan.commands.join('\n')+'\n');
 fs.writeFileSync('.deploy-changed-slugs',plan.slugs.join('\n')+(plan.slugs.length?'\n':''));
 fs.writeFileSync('.blog-delta-summary.json',JSON.stringify({changed:plan.changed,deleted:plan.deleted,slugs:plan.slugs,oldCount:plan.oldCount,newCount:plan.newCount},null,2)+'\n');
 console.log('BLOG_DELTA_PREPARED',plan.changed.length,'changed',plan.deleted.length,'deleted',plan.oldCount,'previous',plan.newCount,'current');
}
