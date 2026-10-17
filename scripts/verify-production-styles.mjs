import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
export async function verifyStyles({root='dist',origin='https://therev-lab.com',fetcher=fetch,pages=['index.html','solution.html','trainer.html','price.html','blog/index.html','access.html']}={}) {
 const checks=[],seen=new Set();
 for(const file of pages){
  const local=fs.readFileSync(path.join(root,file),'utf8');
  const pageUrl=new URL('/'+file,origin);
  const response=await fetcher(pageUrl);assert.equal(response.status,200,file);
  const live=await response.text();assert.equal(live,local,file+' complete expected HTML');
  const links=[...local.matchAll(/<link\b[^>]*>/gi)].filter(m=>/rel=["']stylesheet["']/i.test(m[0]));assert.ok(links.length,file+' has stylesheets');
  for(const [tag] of links){
   const href=tag.match(/href=["']([^"']+)["']/i)?.[1];assert.ok(href,tag);
   const url=new URL(href,pageUrl);assert.equal(url.origin,origin,'stylesheet stays on official origin');
   if(seen.has(url.href))continue;seen.add(url.href);
   const result=await fetcher(url);assert.equal(result.status,200,url.href);
   const actual=Buffer.from(await result.arrayBuffer()),expected=fs.readFileSync(path.join(root,url.pathname));
   const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
   assert.equal(hash(actual),hash(expected),url.href+' stylesheet bytes');
   checks.push({url:url.href,sha256:hash(actual),match:true});
  }
 }
 return checks;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const checks=await verifyStyles({origin:process.env.PRODUCTION_URL||'https://therev-lab.com'});
 fs.mkdirSync('qa-out/production',{recursive:true});fs.writeFileSync('qa-out/production/styles.json',JSON.stringify({observedAt:new Date().toISOString(),checks},null,2));
 console.log('Production referenced stylesheet bytes PASS: '+checks.length);
}
