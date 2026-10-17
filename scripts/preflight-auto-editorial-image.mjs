#!/usr/bin/env node
import fs from 'node:fs';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
import {v3BriefPreflight} from './preflight-v3-image-brief.mjs';

const paths=process.argv.slice(2);
if(paths.length===0){console.error('Usage: node scripts/preflight-auto-editorial-image.mjs <job.json> [...jobs]');process.exit(2);}
const registry=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json','utf8'));
let failures=0;
for(const path of paths){
  const job=JSON.parse(fs.readFileSync(path,'utf8'));
  const existing=preflightEditorialImage(job,registry);
  // Zero-cost v3 contract runs BEFORE any request to OpenAI, only on explicit v3 opt-in.
  const v3=v3BriefPreflight(job,registry);
  const pass=existing.pass&&v3.pass;
  console.log(JSON.stringify({job:path,slug:job.slug,asset_version:job.asset_version,...existing,v3,pass,
    errors:[...existing.errors,...v3.errors]}));
  if(!pass){console.error('::error::Blocked billable editorial image generation: '+job.slug+' '+[...existing.errors,...v3.errors].join(','));failures++;}
}
if(failures)process.exitCode=1;
