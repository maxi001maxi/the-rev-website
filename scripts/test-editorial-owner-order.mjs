import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {sortArticleList,articleListState} from '../admin/js/article-list-order.mjs';

test('real publication reconciliation cannot bury the newer drafts',()=>{
 const rows=[
  {id:'posture',status:'draft',publish_status:'PUBLISHED',publish_verified_at:'2026-10-21',created_at:'2026-10-13',updated_at:'2026-10-21T04:06:53Z'},
  {id:'oct18',publish_status:'NOT_PUBLISHED',created_at:'2026-10-17',updated_at:'2026-10-21T04:05:33Z'},
  {id:'oct21',publish_status:'NOT_PUBLISHED',created_at:'2026-10-20',updated_at:'2026-10-21T04:05:27Z'},
  {id:'inflight',publish_status:'PUBLISH_COMMITTED',created_at:'2026-10-14'}];
 assert.deepEqual(sortArticleList(rows).map(x=>x.id),['oct21','oct18','inflight','posture']);
 assert.equal(rows[0].id,'posture','caller records are not reordered');
 assert.equal(articleListState({publish_status:'PUBLISHED'}),'DRAFT','no verified publication is inferred');
});

test('stable ties and invalid dates keep every article without using sync time',()=>{
 const rows=[{id:'b'},{id:'a'},{id:'c',created_at:'bad',updated_at:'2099-01-01'}];
 assert.deepEqual(sortArticleList(rows).map(x=>x.id),['a','b','c']);
});

function sheetHarness(){
 const source=fs.readFileSync('editorial/gas/Phase9_CurrentAssetRefresh_v081.gs','utf8');
 let formula='old',writes=0;const bridge=[{content_id:'legacy',title:'posture',bridge_status:'PUBLISHED'},{content_id:'legacy',bridge_status:'PUBLISHED'}],copies=[];
 const cell={getFormula:()=>formula,setFormula:f=>{formula=f;writes++;},setNote:()=>{}};
 const view={getRange:()=>cell,setFrozenRows:()=>{}};
 const context={ss_:()=>({getSheetByName:n=>n==='Googleビジネス投稿'?view:n==='25_WEB_PUBLISH_BRIDGE'?bridge:n==='22_GBP_POST'?copies:null}),getObjectsWithRow_:s=>s};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,copies,writes:()=>writes,formula:()=>formula};
}
test('GBP view repair is idempotent and reports missing legacy copy without paid generation',()=>{
 const h=sheetHarness();assert.equal(h.context.v081RepairGbpView_().status,'REPAIRED');
 assert.equal(h.context.v081RepairGbpView_().status,'VERIFIED');assert.equal(h.writes(),1);
 const gap=h.context.v081GbpCoverage_();assert.equal(gap.missing.length,1);assert.equal(gap.missing[0].content_id,'legacy');
 h.copies.push({parent_blog_id:'legacy',body_copy_paste:'accepted existing copy'});
 assert.equal(h.context.v081GbpCoverage_().status,'COMPLETE');
 assert.equal(h.context.v081GbpCoverage_().posted,false);
 const f=h.formula();assert.match(f,/ISNUMBER/);assert.match(f,/"T"," "/);assert.match(f,/9\/24/);assert.match(f,/13,FALSE/);assert.match(f,/12,TRUE/);
});
