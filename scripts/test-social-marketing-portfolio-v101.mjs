import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildSocialPortfolioSnapshot,
  classifyPublishedPostPortfolio,
  normalizeOpportunityPortfolioRanking,
  normalizePortfolioDecision
} from '../lib/socialPortfolio.mjs';

const inventory=[
  {inventory_key:'OXYGEN_ROOM',label:'酸素ルーム',inventory_type:'OFFERING',priority_band:'CORE',evidence_policy:'FACT_OR_FIRST_PARTY'},
  {inventory_key:'DENBA',label:'DENBA Health',inventory_type:'OFFERING',priority_band:'CORE',evidence_policy:'FACT_OR_FIRST_PARTY'},
  {inventory_key:'BOXING',label:'パーソナルボクシング',inventory_type:'OFFERING',priority_band:'CORE',evidence_policy:'FACT_OR_FIRST_PARTY'},
  {inventory_key:'STORE_SPACE_EQUIPMENT',label:'店内・設備・空間',inventory_type:'EXPERIENCE',priority_band:'CORE',evidence_policy:'FACT_OR_FIRST_PARTY'},
  {inventory_key:'ACCESS_CONVENIENCE',label:'通いやすさ',inventory_type:'ACCESS',priority_band:'SECONDARY',evidence_policy:'FACT_OR_FIRST_PARTY'}
];

function post(id,date,{title='',topic='',lane='EXTERNAL_DISCOVERY_KNOWLEDGE',territory='KNOWLEDGE',caption=''}={}){
  return {id,published_at:`${date}T12:00:00+09:00`,title,topic,content_lane:lane,territory,caption,format:'REEL'};
}

test('v1.0.1 migration adds Marketing Inventory, Portfolio Snapshot and Opportunity rankings',()=>{
  const sql=fs.readFileSync(
    new URL('../supabase/migrations/20261007034713_social_marketing_portfolio_v101.sql',import.meta.url),
    'utf8'
  );
  for(const table of [
    'social_marketing_inventory',
    'social_portfolio_daily_snapshots',
    'social_portfolio_snapshot_items',
    'social_opportunity_portfolio_rankings'
  ]){
    assert.match(sql,new RegExp(table));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql,new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }
  assert.match(sql,/portfolio_snapshot_id/);
  assert.match(sql,/portfolio_decision/);
});

test('portfolio classifier recognizes concrete store offerings without turning generic knowledge into store content',()=>{
  const oxygen=classifyPublishedPostPortfolio({
    title:'何もしない時間をつくる',
    topic:'酸素ルームの位置づけ',
    caption:'THE REV.では酸素ルームを休む時間として使っています。'
  },inventory);
  assert.ok(oxygen.some(x=>x.inventory_key==='OXYGEN_ROOM'));

  const knowledge=classifyPublishedPostPortfolio({
    title:'ダイエット中に選びたい食材5選',
    topic:'食事豆知識',
    caption:'たんぱく質や食事について解説します。'
  },inventory);
  assert.equal(knowledge.length,0);
});

test('recent knowledge-heavy publishing becomes a strategic signal, not a forced quota',()=>{
  const posts=[
    post('1','2026-10-05',{title:'運動後まで、通いやすく。',topic:'シャワー・更衣スペース',lane:'STORE_EXPERIENCE',territory:'STORE_SERVICE_EXPERIENCE',caption:'シャワーと更衣スペース'}),
    post('2','2026-09-26',{title:'初回体験、何を準備して行けばいい？',topic:'初回体験',lane:'STORE_EXPERIENCE_PROOF',territory:'FIRST_VISIT_PROCESS'}),
    post('3','2026-10-03',{title:'疲れた日に取り入れたい飲み物5選'}),
    post('4','2026-10-02',{title:'睡眠を整えたい人におすすめの食材5選'}),
    post('5','2026-09-30',{title:'トレーナーがダイエット中に買うもの5選'}),
    post('6','2026-09-29',{title:'ダイエット中、何を食べる？'}),
    post('7','2026-09-26',{title:'ダイエットを続けるために知っておきたい9つ'}),
    post('8','2026-09-25',{title:'若々しい身体づくりに取り入れたい食べ物9選'}),
    post('9','2026-09-24',{title:'筋肉がつく習慣9選'}),
    post('10','2026-09-14',{title:'DENBA Health、結局どう使う？',topic:'DENBAの利用シーン',lane:'STORE_EXPERIENCE_PROOF',territory:'SERVICE_EXPERIENCE',caption:'DENBA Health'}),
    post('11','2026-09-15',{title:'ボクシング、やってみたいけど少し怖い。',lane:'STORE_EXPERIENCE_PROOF',territory:'FIRST_VISIT_PROCESS',caption:'ボクシング ミット'})
  ];
  const out=buildSocialPortfolioSnapshot({
    targetDate:'2026-10-07',
    inventory,
    posts,
    metrics:[]
  });
  assert.equal(out.portfolio_signal,'KNOWLEDGE_HEAVY');
  assert.equal(out.summary.window_14d.knowledge_posts,7);
  assert.equal(out.summary.window_14d.store_experience_posts,2);
  assert.equal(out.items.find(x=>x.inventory_key==='DENBA').exposure_signal,'ABSENT_14D');
  assert.equal(out.items.find(x=>x.inventory_key==='BOXING').exposure_signal,'ABSENT_14D');
  assert.match(out.recommendation.strategic_rule,/never replace Evidence|never.*force/i);
});

test('Opportunity portfolio ranking may promote attention but cannot upgrade Evidence state',()=>{
  const op={
    id:'11111111-1111-4111-8111-111111111111',
    evidence_strength:'EXPLORATORY',
    qc_decision:'REVIEW_REQUIRED'
  };
  const out=normalizeOpportunityPortfolioRanking({
    opportunity_id:op.id,
    inventory_keys:['OXYGEN_ROOM'],
    priority_signal:'PROMOTE',
    phase_fit:'STORE_AWARENESS_BUILDに合う。',
    underexposure_signal:'最近の露出が薄い。',
    rationale:'商材理解の不足を補う候補として優先的に再検討する。',
    confidence:0.8
  },new Map([[op.id,op]]),new Set(['OXYGEN_ROOM']));
  assert.equal(out.priority_signal,'PROMOTE');
  assert.equal(out.metadata.evidence_strength,'EXPLORATORY');
  assert.equal(out.metadata.opportunity_qc_decision,'REVIEW_REQUIRED');
  assert.match(out.metadata.guard,/never upgrades/i);
});

test('Portfolio Decision requires marketing reasoning but does not require a store slot',()=>{
  const out=normalizePortfolioDecision({
    considered_inventory_keys:['OXYGEN_ROOM','DENBA','BOXING'],
    selected_mix:{REEL:['TRAINER_JUDGMENT'],STORIES:['FIRST_VISIT_EXPERIENCE']},
    recent_balance:'直近は知識系が多いが、昨日は店舗利便性を出している。',
    why_store_service_now_or_not:'今日は施設紹介を無理に入れず、次の商材候補のEvidenceを先に集める。',
    marketing_rationale:'固定枠ではなく、直近重複・商材露出・Evidence・撮影現実性を合わせて判断する。'
  },new Set(['OXYGEN_ROOM','DENBA','BOXING']));
  assert.match(out.note,/not a fixed content quota/i);
  assert.match(out.why_store_service_now_or_not,/無理に入れず/);
});

test('Social Director requires Portfolio Snapshot + rankings only when portfolio_required is enabled',()=>{
  const director=fs.readFileSync(new URL('../lib/socialDirector.mjs',import.meta.url),'utf8');
  assert.match(director,/portfolio_required/);
  assert.match(director,/SOCIAL_PORTFOLIO_SNAPSHOT_REQUIRED/);
  assert.match(director,/SOCIAL_PORTFOLIO_RANKINGS_REQUIRED/);
  assert.match(director,/normalizePortfolioDecision/);
  assert.match(director,/portfolio_is_strategic_signal_not_quota/);
});

test('Bridge exposes Portfolio context, prepare, poll and ranking actions',()=>{
  const bridge=fs.readFileSync(new URL('../lib/socialBridgeApi.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  for(const action of [
    'social_portfolio_context',
    'social_portfolio_prepare',
    'social_portfolio_poll',
    'social_portfolio_rankings_prepare'
  ]) assert.match(bridge,new RegExp(action));
  assert.match(endpoint,/portfolio_\(context\|prepare\|poll\|rankings_prepare\)/);
});
