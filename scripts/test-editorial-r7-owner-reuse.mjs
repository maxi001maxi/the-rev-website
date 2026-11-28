import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {r7OwnerApprovedDistinctSceneReuse} from '../lib/editorialR7ApprovedReuse.mjs';
import {hybridQaReady,shouldPreserveHybridImageOnEditorialSync} from '../lib/editorialHybridImageFormat.mjs';
import {evaluateEditorialImageReview} from '../lib/editorialImageReviewGate.mjs';

const slug='personal-gym-first-session-pain-health-history';
const version='reference-v26-grounded-lobbysp-20261015-pain-r7-depth-portrait-offline';
const report='editorial/image-qa/'+slug+'-'+version+'.json';
const source=fs.readFileSync(report);
const qa=JSON.parse(source);
const draft={
  slug, title:'パーソナルジム初回、痛みや体調はどこまで伝える？小さな違和感も話していい理由',
  category:'health',
  image_render_version:'rev-column-reference-v2.3-hybrid',
  image_strategy:'reference-v2-gpt-image-hybrid-drive-source',
  image_asset_version:version,gbp_image_asset_version:version,
  image_status:'READY',image_asset_ready:true,
  image_headline_short:'痛みや体調は、\nどこまで伝える？',
  image_qa:qa
};
const clone=(v)=>structuredClone(v);
test('immutable R7 QA file is exactly the independently QC-approved original',()=>{
  assert.equal(createHash('sha256').update(source).digest('hex'),'760ea97e085f8f1336fe2b27cd54f8b46ba9c4c235f93c56851d902d9eb8472f');
  assert.equal(qa.pass,true);
});
test('full canonical Hybrid and review gates accept only this owner-approved distinct R7 scene',()=>{
  assert.equal(r7OwnerApprovedDistinctSceneReuse(draft,qa),true);
  assert.equal(hybridQaReady(draft,qa),true);
  const r=evaluateEditorialImageReview({draft,qa});
  assert.deepEqual(r.errors,[]);
  assert.equal(r.ok,true);
  assert.equal(r.narrowApprovedR7,true);
});
test('a normal old generated-copy resync cannot erase exact QC-pass R7',()=>{
  const incoming={slug,title:draft.title,category:'health',imageHeadlineShort:'最初の一回で、\n相性を確かめる。'};
  assert.equal(shouldPreserveHybridImageOnEditorialSync(draft,incoming),true);
  assert.equal(shouldPreserveHybridImageOnEditorialSync(draft,{...incoming,title:'違う記事'}),false);
});
test('different slug, asset version, image hash and scene evidence fail closed',()=>{
  const mutations=[
    [(d,q)=>{d.slug='another-article';}],
    [(d,q)=>{d.image_asset_version='other-image';}],
    [(d,q)=>{q.scene_grounding.asset_hashes.thumbnail='0'.repeat(64);}],
    [(d,q)=>{q.contextual_verified_facility_source_reuse.scene_repeated=true;}],
    [(d,q)=>{q.scene_grounding.observation.scene_fingerprint.article_intent='training_start';}],
    [(d,q)=>{q.trainer_present=true;}],
    [(d,q)=>{q.pass=false;}],
    [(d,q)=>{q.manual_visual_rejection=true;}]
  ];
  for(const [mutate] of mutations){
    const d=clone(draft),q=clone(qa);
    mutate(d,q);d.image_qa=q;
    assert.equal(r7OwnerApprovedDistinctSceneReuse(d,q),false);
    assert.equal(hybridQaReady(d,q),false);
    assert.equal(evaluateEditorialImageReview({draft:d,qa:q}).ok,false);
  }
});
