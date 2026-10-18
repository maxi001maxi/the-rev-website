import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {BRANCH,CLAIM,DIR,guardPrivateEnvironment,claimPrivateRun,verifyR8Approval,imageDimensions} from './oct18-r8-private-run.mjs';

const good={GITHUB_REPOSITORY:'maxi001maxi/the-rev-website',GITHUB_REF:'refs/heads/'+BRANCH,GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',GITHUB_SHA:'a'.repeat(40)};
test('wrong repository, main, manual events and Actions reruns cannot claim a paid run',()=>{
  guardPrivateEnvironment(good);
  for(const changes of [{GITHUB_REPOSITORY:'other/repo'},{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_RUN_ATTEMPT:'2'}])assert.throws(()=>guardPrivateEnvironment({...good,...changes}),/R8_/);
});
test('latest real approved brief and free Preflight match, without calling an external API',()=>{
  const v=verifyR8Approval();
  assert.equal(v.job.v31.owner_spend_approval,'APPROVED');
  assert.equal(v.approval.prohibited_operations.xserver,true);
  assert.equal(v.approval.prohibited_operations.supabase,true);
});
test('budget is committed before execution and cannot reopen on a fresh runner or run ID',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'r8-claim-'));
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
