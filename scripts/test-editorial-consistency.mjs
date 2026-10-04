import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {evaluateArticleOverlap} from '../lib/editorialArticleOverlap.mjs';
import {evaluateCandidates} from '../lib/dailyEditorialCreator.mjs';
import {selectUniqueImageHeadlineShort} from '../lib/editorialImageCopy.mjs';
import {sceneIntentFor} from '../lib/editorialAutomatedHybridImage.mjs';
import {evaluateEditorialImageReview} from '../lib/editorialImageReviewGate.mjs';
import {SCENE_PLAUSIBILITY_VERSION,SCENE_PLAUSIBILITY_FIELDS} from '../lib/editorialScenePlausibility.mjs';
import {evaluateEditorialLength,evaluateEditorialReviewReady} from '../lib/editorialReadiness.mjs';
import {imageSheetViewFormulas,googleBusinessSheetViewFormulas} from '../lib/editorialImageSheetView.mjs';
import {collectArticleHistory} from '../lib/editorialArticleHistory.mjs';
import {checkEditorialImageReady} from '../lib/editorialImage.mjs';
import {hybridQaReady} from '../lib/editorialHybridImageFormat.mjs';
import {buildDailyResponse} from '../api/integrations/editorial-status.mjs';

const existing={content_id:'BLOG-20260924-6c2f31',title:'健康診断の結果を見て運動を始める前に。受診を優先したいサインと最初の一歩',primary_query:'健康診断 結果 運動 始める'};
const candidate={candidate_id:'HEALTH-OVERLAP',title_candidate:'健康診断で血圧が高めと言われたら、筋トレはしていい？始める前の3つの確認',primary_query:'健康診断 血圧 高め 筋トレ してもいい'};
test('1 health exercise start overlaps across query and any history age',()=>{
  const r=evaluateArticleOverlap(candidate,[{...existing,generated_at:'2020-01-01'}]);
  assert.equal(r.overlap,true);assert.equal(r.matches[0].duplicate_of_content_id,existing.content_id);
  assert.equal(r.matches[0].similarity_evidence.same_query,false);
});
test('2 different query but same reader answer overlaps',()=>{
  const r=evaluateArticleOverlap({title:'初心者の回数',primary_query:'初心者 筋トレ 日数',audience_question:'最初の週に何回通うか',main_claim:'翌日の疲労を見て週2回から始める'},
    [{content_id:'OLD',title:'初心者は週何回ジムに通う？',primary_query:'ジム 週何回',audience_question:'最初の週に何回通うか',main_claim:'翌日の疲労を見て週2回から始める'}]);
  assert.equal(r.overlap,true);
});
test('3 health category distinct reader questions pass',()=>{
  for(const title of ['血圧測定の方法と測り方','高血圧治療中の運動相談','健康診断結果の見方と数値の意味'])
    assert.equal(evaluateArticleOverlap({title},[existing]).overlap,false,title);
});
test('Queue selection excludes semantic overlap and records evidence',()=>{
  const c={...candidate,week_start:'2026-10-04',route_lane:'WEB_BLOG',decision:'PUBLISH',status:'NEW',total_score:80};
  const r=evaluateCandidates({shortlist:[c],articleHistory:[existing],now:new Date('2026-10-04T02:00:00Z')})[0];
  assert.equal(r.eligible,false);assert(r.reasons.includes('SKIPPED_OVERLAP'));assert(r.duplicate.matches[0].duplicate_reason);
});
test('4 exact copy outside near window cannot be reselected',()=>{
  const used='健診のあとこそ、\n無理なく始める。';
  const history=[...Array.from({length:30},(_,i)=>'過去の別テーマ'+i),used];
  assert.equal(selectUniqueImageHeadlineShort({image_headline_short:'健診のあとこそ、無理なく始める。'},history).copy,null);
  assert.notEqual(selectUniqueImageHeadlineShort({title:'健診後の運動'},history).copy,used);
});
test('5 scene uses paper context, not blood-pressure equipment',()=>{
  const intent=sceneIntentFor({title:candidate.title_candidate},{});
  assert.match(intent,/紙/);assert.match(intent,/文字は読めなくてよい/);assert.match(intent,/医療機器.*描かない/);
});
test('6 equipment and service misrepresentation fail shared image gate',()=>{
  const qa={pass:true,scene_plausibility_version:SCENE_PLAUSIBILITY_VERSION,...Object.fromEntries(SCENE_PLAUSIBILITY_FIELDS.map(k=>[k,true]))};
  for(const key of ['unsupported_equipment_absent','service_misrepresentation_absent']) {
    const result=evaluateEditorialImageReview({qa:{...qa,[key]:false}});assert.equal(result.checks[key],false);
  }
  const missing=evaluateEditorialImageReview({qa:{pass:true,scene_plausibility_version:SCENE_PLAUSIBILITY_VERSION}});
  assert.equal(missing.checks.scene_plausible_at_the_rev,false);
});
test('7 view formula contract follows append, dedupes and joins GBP by parent',()=>{
  const f=imageSheetViewFormulas();assert.equal(f.length,14);
  assert.match(f[2],/FILTER.*C2:C/);assert.match(f[2],/SORTN/);assert.match(f[2],/FALSE/);
  assert.match(f[11],/22_GBP_POST.*\$D\$2:\$D/);
  assert(!f.join('').match(/BRIDGE'!\$?[A-Z]+\$?(?:4|8|21)\b/));
  assert.match(f[11],/\$M\$2:\$M<>""/);
  const g=googleBusinessSheetViewFormulas();
  assert.match(g[0],/SORTN/);assert.match(g[0],/BLOCKED_URL/);assert.match(g[1],/MAP\(I2:I/);
});
test('natural context passes full image QA without literal medical explanation',()=>{
  const qa=JSON.parse(fs.readFileSync('editorial/image-qa/beginner-strength-training-few-exercises-frequency-reference-v26-auto-evolgear-20260922-6bf9953b.json','utf8'));
  const natural={...qa,scene_plausibility_version:SCENE_PLAUSIBILITY_VERSION,
    ...Object.fromEntries(SCENE_PLAUSIBILITY_FIELDS.map(k=>[k,true])),
    main_claim_visualization:4,article_theme_inferable_without_title:false};
  const draft={image_render_version:'rev-column-reference-v2.3-hybrid',image_strategy:'reference-v2-gpt-image-hybrid-drive-source',image_asset_version:qa.asset_version};
  assert.equal(evaluateEditorialImageReview({draft,qa:natural}).ok,true);
  assert.equal(hybridQaReady(draft,natural),true);
  assert.equal(hybridQaReady(draft,{...natural,unsupported_equipment_absent:false}),false);
});
test('human rejection cannot be overwritten by a repository QA refresh',async()=>{
  const qa={manual_visual_rejection:true,pass:true};
  const r=await checkEditorialImageReady({image_qa:qa});
  assert.equal(r.ready,false);assert.equal(r.reason,'manual_visual_rejection');assert.equal(r.qa,qa);
});
test('daily API fails closed on missing Sheet history or unreadable canonical history',async()=>{
  const body={action:'daily_create',rows:[],shortlist:[]};
  assert.equal((await buildDailyResponse({body})).error,'sheet_article_history_missing');
  const unavailable=await buildDailyResponse({body:{...body,outputRows:[]},historyCollector:async()=>{throw Error('offline');}});
  assert.equal(unavailable.error,'article_history_unavailable');
});
test('installed Supervisor wrapper blocks missing GBP and recovers before promotion',()=>{
  const sheets={'26_DAILY_EDITORIAL_QUEUE':[{content_id:'BLOG',__row:2}],
    '21_WEB_BLOG_OUTPUT':[{...good.blog,content_id:'BLOG',__row:2}],
    '22_GBP_POST':[],'25_WEB_PUBLISH_BRIDGE':[]};
  const article={image_status:'READY',image_asset_ready:true,image_qa:good.qa,gbp_image_qa:good.gbpQa,
    gbp_image_status:'READY',gbp_image:'/gbp.jpg'};
  let recover=false;
  const context={getSettings_:()=>({}),ss_:()=>({getSheetByName:n=>sheets[n]}),
    getObjectsWithRow_:s=>s||[],setObjectRow_:(s,row,p)=>Object.assign(s.find(x=>x.__row===row),p),
    appendObjectRow_:(s,p)=>s.push({...p,__row:s.length+2}),buildM6Context_:()=>({}),v065WeekDate_:x=>x,
    generateGBPFromBlog_:()=>recover ? {body_copy_paste:'本文'}:null,
    v065CheckImageDirect_:()=>({ready:true}),
    v065FetchJson_:()=>({json:{content_id:'BLOG',article,readiness:{ready:true},review_url:good.bridge.review_url}}),
    v065LengthGate_:()=>({pass:true})};
  vm.createContext(context);vm.runInContext(fs.readFileSync('editorial/gas/DailyEditorialCreator_v0.6.9.gs','utf8'),context);
  assert.equal(context.v065LengthGate_('EXPERT_DEEP_DIVE','文'.repeat(929)).pass,false);
  assert.equal(context.v065CheckImageDirect_(sheets['26_DAILY_EDITORIAL_QUEUE'][0]).ready,false);
  sheets['25_WEB_PUBLISH_BRIDGE'].push({...good.bridge,content_id:'BLOG'});
  assert.equal(context.v065CheckImageDirect_(sheets['26_DAILY_EDITORIAL_QUEUE'][0]).ready,true);
  assert.equal(context.v065FetchJson_('https://example.test/api/integrations/editorial-status?content_id=BLOG').json.readiness.ready,false);
  recover=true;
  assert.equal(context.v065FetchJson_('https://example.test/api/integrations/editorial-status/?content_id=BLOG').json.readiness.ready,true);
  assert.equal(sheets['22_GBP_POST'].length,1);assert.equal(sheets['22_GBP_POST'][0].post_ready,'BLOCKED_URL');
  context.v065FetchJson_('https://example.test/api/integrations/editorial-status/?content_id=BLOG');
  assert.equal(sheets['22_GBP_POST'].length,1);
});
const good={contentId:'BLOG',blog:{status:'READY',article_type:'STANDARD',body_markdown:'本文'.repeat(900)},
  gbp:{parent_blog_id:'BLOG',status:'READY',image_status:'READY',gbp_image_path:'/gbp.jpg'},
  bridge:{bridge_status:'PREVIEW_READY',review_url:'https://example.test/review'},
  qa:{pass:true,xserver_live_verify_passed:true,gbp_xserver_live_verify_passed:true},gbpQa:{pass:true,ratio:'4:3',width:1200,height:900}};
test('8 Blog READY without GBP canonical row cannot reach REVIEW_READY',()=>{
  assert.equal(evaluateEditorialReviewReady({...good,gbp:null}).ok,false);
  assert.equal(evaluateEditorialReviewReady({...good,gbp:{...good.gbp,parent_blog_id:'OTHER'}}).ok,false);
  assert.equal(evaluateEditorialReviewReady({...good,qa:{...good.qa,unsupported_equipment_absent:false}}).ok,false);
});
test('9 normal pipeline stays ready, expert compression fails',()=>{
  assert.equal(evaluateEditorialReviewReady(good).ok,true);
  assert.equal(evaluateEditorialLength('EXPERT_DEEP_DIVE','文'.repeat(929)).pass,false);
  assert.equal(evaluateEditorialLength('EXPERT_DEEP_DIVE','文'.repeat(1681)).pass,true);
  assert.equal(evaluateEditorialLength('STANDARD','文'.repeat(900)).pass,false);
});
test('GAS contract has same missing-row and length behavior',()=>{
  const context={getSettings_:()=>({})};vm.createContext(context);
  vm.runInContext(fs.readFileSync('editorial/gas/DailyEditorialCreator_v0.6.9.gs','utf8'),context);
  assert.equal(context.v069cLengthGate_('EXPERT_DEEP_DIVE','文'.repeat(929)).pass,false);
  const article={image_status:'READY',image_asset_ready:true,image_qa:good.qa,gbp_image_qa:good.gbpQa};
  assert.equal(context.v069cReviewContract_({content_id:'BLOG'},good.blog,null,article,good.bridge.review_url).ok,false);
  assert.equal(context.v069cReviewContract_({content_id:'BLOG'},good.blog,good.gbp,article,good.bridge.review_url).ok,true);
});
test('history collector includes all published files and paginated drafts, fails closed',async()=>{
  const data=Array.from({length:501},(_,i)=>({editorial_content_id:'D'+i,title:'title',body_markdown:'body'}));
  const sb={from:()=>({select:()=>({order:()=>({range:async(a,b)=>({data:data.slice(a,b+1)})})})})};
  const history=await collectArticleHistory({supabase:sb,list:async()=>[{type:'file',name:'old.md',path:'content/blog/old.md'}],read:async()=>({exists:true,content:'---\ntitle: Old\nslug: old\n---\n本文'})});
  assert.equal(history.length,502);
  await assert.rejects(collectArticleHistory({supabase:sb,list:async()=>[]}),/unavailable/);
});
