import test from 'node:test';
import assert from 'node:assert/strict';
import {isExactOct15RecoveryTarget,matchesVerifiedOct15RecoveryRun,reconcilePublication} from '../lib/editorialPublicationStatus.mjs';
const sha='7913093151419e8732498e7096442f8590328f2f';
const blob='b65cd92d19f690c768eac07dbc354e44eff06536';
const recoverySha='e098ac22c294d8a900f104acbae67b109de330e1';
const wf='.github/workflows/recover-oct15-blogfast-publish.yml';
const path='content/blog/personal-gym-first-session-pain-health-history.md';
const article={
 id:'9a1fd56a-be01-4687-9474-f2377dc7e978',
 slug:'personal-gym-first-session-pain-health-history',source_path:path,
 publish_commit_sha:sha,published_content_sha:blob,
 publish_status:'PUBLISH_COMMITTED',
 published_url:'https://therev-lab.com/blog/personal-gym-first-session-pain-health-history/'
};
const file={exists:true,content:'---\nstatus: published\n---\ntext',sha:blob,path};
const failed={found:true,id:38690436919,headSha:sha,status:'completed',conclusion:'failure'};
const recovered={found:true,id:38692106617,headSha:recoverySha,workflowPath:wf,status:'completed',conclusion:'success'};
const stubDb=()=>{
 let patch=null;
 return {
   from(table){assert.equal(table,'admin_article_drafts');return {
      update(v){patch=v;return {eq(k,id){assert.equal(k,'id'); assert.equal(id,article.id);return {
        select(){return {async single(){return{data:{...article,...patch},error:null}}};}
      }}};}
   }},
   get patch(){return patch}
 };
};
async function run({a=article,f=file,r=recovered,live={ok:true,status:200}}={}){
 const db=stubDb();
 let queries=[];
 const result=await reconcilePublication({
    supabase:db,article:a,
    getFileFn:async()=>f,
    getWorkflowRunForCommitFn:async(s,opts)=>{queries.push({s,opts});return s===sha?failed:r;},
    verifyLiveArticleFn:async()=>live
 });
 return {result,db,queries};
}
test('exact successful SHA-pinned recovery promotes owner-published article only',async()=>{
 assert.equal(isExactOct15RecoveryTarget(article,file),true);
 assert.equal(matchesVerifiedOct15RecoveryRun(recovered),true);
 const {result,db,queries}=await run();
 assert.equal(queries.length,2);
 assert.equal(queries[1].s,recoverySha);
 assert.equal(queries[1].opts.workflowPath,wf);
 assert.equal(result.state,'PUBLISHED');
 assert.equal(result.published,true);
 assert.equal(db.patch.publish_status,'PUBLISHED');
 assert.equal(result.deployment.recoveryForCommitSha,sha);
 assert.equal(result.deployment.originalFailedDeployRunId,38690436919);
});
test('wrong blob/slug, missing recovery evidence, wrong head, or non-200 live NEVER promotes',async()=>{
 const candidates=[
   {a:{...article,slug:'different-article'}},
   {a:{...article,published_content_sha:'0'.repeat(40)}},
   {f:{...file,sha:'0'.repeat(40)}},
   {r:{...recovered,id:0}},
   {r:{...recovered,headSha:'0'.repeat(40)}},
   {r:{...recovered,conclusion:'failure'}},
   {live:{ok:false,status:404}}
 ];
 for(const option of candidates){
  const {result,db}=await run(option);
  assert.equal(result.published,false,JSON.stringify(option));
  assert.equal(result.state,'PUBLISH_COMMITTED');
  assert.equal(db.patch,null);
 }
});
