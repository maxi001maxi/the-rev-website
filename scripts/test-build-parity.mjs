// Rebuild both environments and compare every published byte except robots policy.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const out=path.resolve(process.env.QA_OUT || 'qa-out');fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function snapshot(){
 const files={};
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,e.name),rel=path.relative('dist',full);
  if(e.isDirectory()){walk(full);continue;}
  const bytes=fs.readFileSync(full);
  const normalized=rel.endsWith('.html')?Buffer.from(bytes.toString().replace(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/gi,'')):bytes;
  files[rel]={sha256:hash(bytes),normalizedSha256:hash(normalized),bytes:bytes.length};
 }}walk('dist');return files;
}
const builds={};
for(const mode of ['production','preview']){
 const log=execFileSync('npm',['run','vercel-build'],{env:{...process.env,VERCEL:'0',VERCEL_ENV:mode,REV_STAGE_FULL_SITE:'0'},encoding:'utf8'});
 fs.writeFileSync(path.join(out,'build-'+mode+'.log'),log);builds[mode]=snapshot();
 const top=fs.readFileSync('dist/index.html','utf8'),rec=fs.readFileSync('dist/solution.html','utf8');
 assert.match(top,/ちゃんと向き合う時間/);assert.match(rec,/DENBA/);
 assert.ok(!/<x-dc|\{\{|text\/x-dc|rev-integrated-navigate/.test(top+rec));
 assert.ok((fs.readFileSync('dist/robots.txt','utf8').includes('Disallow: /\n'))===(mode==='preview'));
}
assert.deepEqual(Object.keys(builds.production).sort(),Object.keys(builds.preview).sort());
const different=[];
for(const file of Object.keys(builds.production)){
 if(file==='robots.txt')continue;
 if(builds.production[file].normalizedSha256!==builds.preview[file].normalizedSha256)different.push(file);
}
const result={status:different.length?'FAIL':'PASS',comparedFiles:Object.keys(builds.production).length,normalization:'Only robots meta tags removed; robots.txt intentionally differs.',different,builds};
fs.writeFileSync(path.join(out,'build-parity.json'),JSON.stringify(result,null,2));
assert.deepEqual(different,[],'Environment-specific page content drift');
console.log('Build parity PASS:',result.comparedFiles,'files; only preview robots differs.');
