import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {acceptedEditorialImage} from '../lib/editorialAcceptedImage.mjs';
import bridge from '../api/integrations/editorial.mjs';
import {editorialTestServices,invokeEditorialRoute as invoke} from './helpers/editorial-e2e-services.mjs';
const root='editorial/prepublication/2026-10-21-evening-strength-sleep/';
const read=p=>JSON.parse(fs.readFileSync(p));
const hash=b=>createHash('sha256').update(b).digest('hex');
function setup(){
  const svc=editorialTestServices();svc.install();
  const job=read(root+'image-qc-context-20261021/IMAGE_JOB.json');
  const qa=read(job.qa_report_path),qc=read(root+'INDEPENDENT_QC_V082_ADDITIONAL.json');
  const body=fs.readFileSync(root+'ARTICLE_DRAFT.md','utf8').replace(/^# .+\r?\n/,'').trim();
  const contentId='BLOG-20261021-4ac8fd',id='ac869d7c-c6b8-4d15-b3a0-e8b6c0963f47';
  const article={slug:job.slug,title:job.article_title,body_markdown:body};
  const proof={schema:'editorial-text-qc-v1',content_id:contentId,body_sha256:hash(body),evidence_sha256:qc.evidence_sha256,pass:true,total:20,source_unverified:false,issues:[]};
  const manifest={schema:'editorial-accepted-image-v1',content_id:contentId,draft_id:id,title:article.title,body_sha256:hash(body),asset_version:job.asset_version,job_path:root+'image-qc-context-20261021/IMAGE_JOB.json',qa_sha256:hash(fs.readFileSync(job.qa_report_path)),owner_adoption_authorized:true,automatic_publish:false};
  const manifestPath=`editorial/image-acceptance/${job.slug}.json`;
  const put=(p,o)=>svc.files.set(p,Buffer.isBuffer(o)?o:Buffer.from(JSON.stringify(o)));
  put(manifestPath,manifest);put(manifest.job_path,job);svc.files.set(job.qa_report_path,fs.readFileSync(job.qa_report_path));
  const selected=read(root+'OWNER_SELECTED_ASSET_STAGING.json');
  for(const [kind,p] of [['scene',job.generated_scene_path],['thumbnail',job.thumbnail],['og',job.og_image],['gbp',job.gbp_image]]){
    const a=selected.assets.find(a=>a.sha256===qa.scene_grounding.asset_hashes[kind]);assert(a);
    const bytes=fs.readFileSync(a.path);put(p,bytes);svc.live.set('/'+p,bytes);
  }
  const existing={id,user_id:'test-owner',...article,status:'draft',editorial_source:'the-rev-editorial-ai',editorial_content_id:contentId,image_status:'ERROR',image_asset_ready:false,image_qa:{bridge_synced:false,independent_qc_pass:false},publish_status:'NOT_PUBLISHED'};
  svc.tables.admin_article_drafts.push(existing);
  return {svc,job,qa,article,proof,contentId,existing,manifest,manifestPath,put,run:()=>acceptedEditorialImage(article,existing,{contentId,textProof:proof})};
}
test('accepted immutable actual image: normal authenticated Bridge updates the same Working Draft, preserves 20/20, no generation or duplicate',async()=>{
  const h=setup();try{
    // Reproduce the real Contents API omission for this 1.75 MiB scene.
    const original=globalThis.fetch,scene=h.svc.files.get(h.job.generated_scene_path),blob='856faa7a78f2278cedf75e8832c6a49ab19d0074';
    let blobReads=0;
    globalThis.fetch=async(input,options)=>{
      const u=new URL(typeof input==='string'?input:input.url);
      if(u.hostname==='api.github.com'&&u.pathname.endsWith('/contents/'+h.job.generated_scene_path))return Response.json({path:h.job.generated_scene_path,size:scene.length,sha:blob,encoding:'none',content:''});
      if(u.hostname==='api.github.com'&&u.pathname.endsWith('/git/blobs/'+blob)){blobReads++;return Response.json({encoding:'base64',content:scene.toString('base64')});}
      return original(input,options);
    };
    const payload={...h.article,description:'夜の筋トレと睡眠。就寝までの時間、運動の強さ、無理のない調整例を整理します。',category:'training',content_id:h.contentId,week_start:'2026-10-19',editorial_status:'READY',fact_check_status:'PASS',topic_gate_decision:'PUBLISH',production_recovery_version:'v0.8.2',editorial_text_qc:h.proof};
    const res=await invoke(bridge,{method:'POST',body:payload});assert.equal(res.statusCode,200,JSON.stringify(res.data));
    assert.equal(res.data.action,'updated');assert.equal(res.data.article.id,h.existing.id);
    assert.equal(h.existing.image_status,'READY');assert.equal(h.existing.gbp_image_status,'READY');
    assert.equal(h.existing.image_qa.editorial_text_qc.body_sha256,h.proof.body_sha256);
    assert.equal(h.svc.tables.admin_article_drafts.length,1);assert(h.existing.editorial_sync_hash);
    const again=await invoke(bridge,{method:'POST',body:payload});assert.equal(again.statusCode,200);assert.equal(again.data.action,'unchanged');
    assert.equal(h.svc.calls.some(c=>c.host==='api.openai.com'||c.method==='PUT'),false);
    assert.equal(blobReads,2,'both idempotent Bridge calls verify the real large scene blob');
    assert.equal(h.existing.publish_status,'NOT_PUBLISHED');
  }finally{h.svc.restore();}
});
for(const defect of ['body','draft','approval','human-reject','qa','r7','file','live'])test('accepted image stops on '+defect,async()=>{
  const h=setup();try{
    if(defect==='body')h.article.body_markdown+='changed';
    if(defect==='draft')h.existing.id='another-draft';
    if(defect==='approval'){h.manifest.owner_adoption_authorized=false;h.put(h.manifestPath,h.manifest);}
    if(defect==='human-reject')h.existing.image_qa.manual_visual_rejection=true;
    if(defect==='qa'||defect==='r7'){
      if(defect==='qa')h.qa.pass=false;else h.qa.r7_comparison.pass=false;
      const bytes=Buffer.from(JSON.stringify(h.qa));h.put(h.job.qa_report_path,bytes);h.manifest.qa_sha256=hash(bytes);h.put(h.manifestPath,h.manifest);
    }
    if(defect==='file')h.put(h.job.gbp_image,Buffer.from('wrong pixels'));
    if(defect==='live'){const b=h.svc.live.get('/'+h.job.thumbnail);const bad=Buffer.from(b);bad[100]^=1;h.svc.live.set('/'+h.job.thumbnail,bad);}
    await assert.rejects(h.run,/ACCEPTED_IMAGE_NOT_VERIFIED/);
    assert.equal(h.existing.image_status,'ERROR');assert.equal(h.existing.publish_status,'NOT_PUBLISHED');
  }finally{h.svc.restore();}
});
