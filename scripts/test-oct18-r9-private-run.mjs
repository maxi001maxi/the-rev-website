import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import yaml from 'js-yaml';
import {BRANCH,CLAIM,DIR,guardPrivateEnvironment,claimPrivateRun,verifyR9Approval,imageDimensions} from './oct18-r9-private-run.mjs';
import {hybridQaReady} from '../lib/editorialHybridImageFormat.mjs';

const good={GITHUB_REPOSITORY:'maxi001maxi/the-rev-website',GITHUB_REF:'refs/heads/'+BRANCH,GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',GITHUB_SHA:'a'.repeat(40)};
test('workflow parses and only an approval push to the isolated branch can trigger it',()=>{
  const w=yaml.load(fs.readFileSync('.github/workflows/editorial-oct18-r9-private.yml','utf8'));
  assert.deepEqual(w.on.push.branches,[BRANCH]);assert.deepEqual(w.on.push.paths,[DIR+'/OWNER_SPEND_APPROVAL.json']);
  assert.equal(w.on.workflow_dispatch,undefined);assert.equal(w.jobs['private-r9'].steps.some(s=>String(s.run||'').includes('git push origin HEAD:refs/heads/main')),false);
});
test('wrong repository, main, manual events and Actions reruns cannot claim a paid run',()=>{
  guardPrivateEnvironment(good);
  for(const changes of [{GITHUB_REPOSITORY:'other/repo'},{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_RUN_ATTEMPT:'2'}])assert.throws(()=>guardPrivateEnvironment({...good,...changes}),/R9_/);
});
test('latest real approved brief and free Preflight match, without calling an external API',()=>{
  const v=verifyR9Approval();
  assert.equal(v.job.v31.owner_spend_approval,'APPROVED');
  assert.equal(v.approval.prohibited_operations.xserver,true);
  assert.equal(v.approval.prohibited_operations.supabase,true);
});
test('budget is committed before execution and cannot reopen on a fresh runner or run ID',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'r9-claim-'));
  const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  try {
    const remote=path.join(temp,'remote.git'),root=path.join(temp,'worker');fs.mkdirSync(root);
    git(temp,'init','--bare',remote);git(root,'init','-b',BRANCH);
    fs.writeFileSync(path.join(root,'fixture'),'synthetic no API');git(root,'add','fixture');
    git(root,'-c','user.name=test','-c','user.email=test@example.invalid','commit','-m','fixture');
    git(root,'remote','add','origin',remote);git(root,'push','origin','HEAD');
    const env={...good,GITHUB_SHA:git(root,'rev-parse','HEAD')};
    const verify=()=>({approval:{synthetic:true}});
    const claimed=claimPrivateRun({root,env,verify});assert.equal(claimed.status,'RESERVED_BEFORE_API');
    const remoteBytes=git(temp,'--git-dir',remote,'show',`refs/heads/${BRANCH}:${CLAIM}`);
    assert.equal(JSON.parse(remoteBytes).run_id,'123');
    const fresh=path.join(temp,'fresh');git(temp,'clone','--branch',BRANCH,remote,fresh);
    assert.throws(()=>claimPrivateRun({root:fresh,env:{...env,GITHUB_RUN_ID:'456',GITHUB_SHA:git(fresh,'rev-parse','HEAD')},verify}),/SPEND_ALREADY_CLAIMED/);
    assert.equal(fs.existsSync(path.join(root,'api-payload.json')),false);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('file dimensions are read from real bytes and corrupted input fails closed',()=>{
  for(const [name,height] of [['thumbnail',675],['og',630],['gbp',900]])assert.deepEqual(imageDimensions(fs.readFileSync(`${DIR}/planning-${name}.jpg`)),{width:1200,height});
  assert.throws(()=>imageDimensions(Buffer.from('not an image')),/INVALID_IMAGE/);
});

test('actual R9 pixels stay rejected and the closed budget cannot authorize another attempt',()=>{
  const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
  if(!fs.existsSync(DIR+'/PRIVATE_RESULT/RESULT.json'))return;
  const r=read(DIR+'/PRIVATE_RESULT/RESULT.json'),q=read(DIR+'/PRIVATE_RESULT/independent-visual-qc.json');
  assert.equal(r.status,'REJECTED_AND_QUARANTINED');assert.equal(q.pass,false);
  assert.deepEqual([r.api_usage.generation_requests,r.api_usage.qc_requests,r.api_usage.image_generation_tool_calls],[1,2,1]);
  assert.equal(read(CLAIM).status,'CLOSED_NO_AUTOMATIC_RETRY');
  for(const f of r.files)assert.equal(createHash('sha256').update(fs.readFileSync(f.path)).digest('hex'),f.sha256);
  assert.equal(read(DIR+'/PRIVATE_RESULT/source-pixel-lock.json').changed_protected_pixels,0);
  assert.equal(q.manual_visual_rejection,true);
  assert.equal(hybridQaReady({slug:q.slug,image_asset_version:q.asset_version,image_render_version:q.render_version,image_strategy:'reference-v2-gpt-image-hybrid-drive-source'},q),false,'background pixel equality cannot override a cut-off face');
  assert.throws(()=>claimPrivateRun({env:{...good,GITHUB_RUN_ID:'999'}}),/SPEND_ALREADY_CLAIMED/);
});
