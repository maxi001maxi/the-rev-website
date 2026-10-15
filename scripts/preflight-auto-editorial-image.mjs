#!/usr/bin/env node
import fs from 'node:fs';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';

const paths=process.argv.slice(2);
if(paths.length===0){console.error('Usage: node scripts/preflight-auto-editorial-image.mjs <job.json> [...jobs]');process.exit(2);}
const registry=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json','utf8'));
let failures=0;
for(const path of paths){
  const job=JSON.parse(fs.readFileSync(path,'utf8'));
  const report=preflightEditorialImage(job,registry);
  console.log(JSON.stringify({job:path,slug:job.slug,asset_version:job.asset_version,...report}));
  if(!report.pass){console.error('::error::Blocked billable editorial image generation: '+job.slug+' '+report.errors.join(','));failures++;}
}
if(failures)process.exitCode=1;
