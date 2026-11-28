import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(`editorial/gas/${name}`, 'utf8');
const parent = {publish_status:'PUBLISHED',publish_verified_at:'2026-10-27T11:50:36.293Z',published_url:'https://therev-lab.com/blog/boxing-trial-what-to-bring/'};
function context(extra={}) {
 const ctx={Date,Logger:{log(){}},...extra};vm.createContext(ctx);
 vm.runInContext(read('GoogleBusinessVoice_v081.gs'),ctx);
 vm.runInContext(read('Phase9_CurrentAssetRefresh_v081.gs'),ctx);
 return ctx;
}

test('actual generation wrapper delivers warm emoji guidance and retains one URL slot even when omitted',()=>{
 const requests=[];let ctx;
 ctx=context({ss_:()=>({getSheetByName:()=>[]}),getObjectsWithRow_:()=>[],
  openAIRequest_:(_path,payload)=>{requests.push(payload);return {body_copy_paste:'息を合わせるところから。🌿',notes:''};},
  generateGBPFromBlog_:()=>ctx.openAIRequest_('responses',{text:{format:{name:'gbp_post_output'}},input:[{role:'system',content:[{type:'input_text',text:'old'}]}]})});
 const made=ctx.generateGBPFromBlog_({},{});
 assert.match(requests[0].input[0].content[0].text,/親しみ/);
 assert.match(requests[0].input[0].content[0].text,/1〜2か所/);
 assert.match(requests[0].input[0].content[0].text,/医療・安全上の注意/);
 assert.match(requests[0].input[0].content[0].text,/架空の接客体験/);
 assert.equal(made.body_copy_paste,'息を合わせるところから。🌿\n\n[BLOG_URL]');
 assert.equal(requests.length,1,'local stub only; wrapper never adds a generation call');
});

test('URL normalization never turns an empty copy into a nonempty post',()=>{
 const ctx=context();assert.equal(ctx.v081PrepareGbpCopy_('  '),'');
 assert.equal(ctx.v081PrepareGbpCopy_('案内\\n\\n［BLOG_URL］\n[BLOG_URL]'),'案内\n\n[BLOG_URL]');
});

test('published parent repairs a recreated copy even after Queue was already PUBLISHED',()=>{
 const copies=[{__row:22,parent_blog_id:'BLOG-20261027-5dcf17',body_copy_paste:'貸出品を記事で確認。\n\n[BLOG_URL]',blog_url_placeholder:'[BLOG_URL]',post_ready:'BLOCKED_URL',image_status:'READY'},
  {__row:24,parent_blog_id:'OTHER',body_copy_paste:'untouched',post_ready:'BLOCKED_URL'}];
 const ctx=context({ss_:()=>({getSheetByName:n=>n==='22_GBP_POST'?copies:null}),getObjectsWithRow_:s=>s,
  setObjectRow_:(sheet,row,patch)=>Object.assign(sheet.find(r=>r.__row===row),patch)});
 assert.equal(ctx.v081ReconcileGbpPublication_('BLOG-20261027-5dcf17',parent).updated,1);
 assert.equal(copies[0].blog_url_placeholder,parent.published_url);
 assert.equal(copies[0].post_ready,'READY');
 assert.equal(copies[0].body_copy_paste,'貸出品を記事で確認。\n\n'+parent.published_url);
 assert.equal(copies[1].body_copy_paste,'untouched');
 assert.equal(ctx.v081ReconcileGbpPublication_('BLOG-20261027-5dcf17',parent).updated,0,'repeated ledger ticks are idempotent');
});

test('body missing URL is repaired once, independently of the already resolved URL cell',()=>{
 const ctx=context(),copy={body_copy_paste:'記事で詳しくご案内します。📖',blog_url_placeholder:parent.published_url,image_status:'READY',post_ready:'BLOCKED_URL'};
 const patch=ctx.v081GbpPublicationPatch_(copy,parent);assert.equal(patch.body_copy_paste.split(parent.published_url).length-1,1);
 assert.equal(Object.keys(ctx.v081GbpPublicationPatch_({...copy,...patch},parent)).length,0);
});

test('commit, timestamp absence, invalid timestamp and a different host cannot resolve an unpublished link',()=>{
 const ctx=context(),copy={body_copy_paste:'原稿\n[BLOG_URL]',post_ready:'BLOCKED_URL',image_status:'READY'};
 for(const article of [{...parent,publish_status:'PUBLISH_COMMITTED'},{...parent,publish_status:'NOT_PUBLISHED'},
  {...parent,publish_verified_at:null},{...parent,publish_verified_at:'bad'},
  {...parent,published_url:'https://example.com/blog/boxing-trial-what-to-bring/'}]) {
  assert.equal(Object.keys(ctx.v081GbpPublicationPatch_(copy,article)).length,0);
 }
});

test('URL repair preserves visual rejection, image holds and an existing unrelated link',()=>{
 const ctx=context(),base={body_copy_paste:'案内\n[BLOG_URL]',image_status:'READY',post_ready:'BLOCKED_OWNER_VISUAL_REJECT'};
 assert.equal(ctx.v081GbpPublicationPatch_(base,parent).post_ready,undefined);
 assert.equal(ctx.v081GbpPublicationPatch_({...base,post_ready:'BLOCKED_URL',image_status:'PREPARING'},parent).post_ready,undefined);
 const wrong=ctx.v081GbpPublicationPatch_({...base,post_ready:'READY',body_copy_paste:'別記事 https://therev-lab.com/blog/another/'},parent);
 assert.equal(wrong.post_ready,'BLOCKED_URL');assert.match(wrong.notes,/URL review required/);
 assert.equal(wrong.body_copy_paste,undefined,'different links are held for review rather than silently rewritten');
});

test('a correct existing URL keeps the owner-approved sentence and paragraph placement intact',()=>{
 const ctx=context(),body='詳しくはこちら：'+parent.published_url;
 const patch=ctx.v081GbpPublicationPatch_({body_copy_paste:body,blog_url_placeholder:'[BLOG_URL]',image_status:'READY',post_ready:'BLOCKED_URL'},parent);
 assert.equal(patch.body_copy_paste,undefined);assert.equal(patch.blog_url_placeholder,parent.published_url);
});

test('manual correction of a mismatching copy clears its stale diagnostic without publishing',()=>{
 const ctx=context(),copy={body_copy_paste:'修正済み\n[BLOG_URL]',image_status:'READY',post_ready:'BLOCKED_URL',
  notes:'Owner hold history | GBP URL review required: copy contains a different URL; verified parent '+parent.published_url};
 const patch=ctx.v081GbpPublicationPatch_(copy,parent);assert.equal(patch.post_ready,'READY');
 assert.doesNotMatch(patch.notes,/URL review required/);assert.match(patch.notes,/Owner hold history/);
});

test('read-only voice inspection and owner view explain unpublished links without a guessed URL',()=>{
 const ctx=context();assert.equal(ctx.inspectGoogleBusinessVoiceV081().generation_api_called,false);
 const formula=ctx.v081GbpViewFormula_();assert.match(formula,/記事公開待ち（公開後にURLを自動反映）/);
 assert.match(formula,/記事URL要確認/);
 assert.match(formula,/12,TRUE/);assert.match(formula,/13,FALSE/);
});
