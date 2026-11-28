import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  normalizeEvidenceReelCandidate,
  normalizeEvidenceStoryItem,
  validateReelCreativeContextV2,
  validateStoryAssetPolicy,
  validateStoryCreativeContext
} from '../lib/socialEvidenceCreative.mjs';

function opportunity(overrides={}){
  return {
    id:'11111111-1111-4111-8111-111111111111',
    opportunity_no:1,
    title:'Trainer judgment as visual proof',
    business_job:'TRUST_ABILITY',
    audience_state:'EVALUATING',
    interpretation:'THE REV. value is the live adjustment, not only the menu.',
    hypothesis:'Concrete judgment may improve service understanding.',
    expected_behavior:'Profile interest',
    confidence:'MEDIUM',
    evidence_strength:'GROUNDED',
    evidence_gaps:['Customer Signal sparse'],
    possible_channels:['REEL','STORIES'],
    test_metrics:['24h reach','profile action'],
    qc_decision:'READY',
    evidence:[
      {
        role:'PRIMARY',
        evidence:{
          evidence_key:'fp:reps',
          source_type:'OPERATOR_FIRST_PARTY',
          evidence_text:'10 planned reps may stop at 8 when form changes.'
        }
      },
      {
        role:'COUNTEREVIDENCE',
        evidence:{
          evidence_key:'constraint:no-human',
          source_type:'PRODUCTION_LEARNING',
          evidence_text:'New human filming is not assumed.'
        }
      }
    ],
    ...overrides
  };
}

test('v0.8 Phase 2 migration adds isolated Reel and Stories evidence runtimes',()=>{
  const sql=fs.readFileSync(
    new URL('../supabase/migrations/20261007023843_social_reel_stories_evidence_shadow_v08.sql',import.meta.url),
    'utf8'
  );
  for(const table of [
    'social_reel_evidence_runs',
    'social_reel_evidence_candidates',
    'social_story_evidence_runs',
    'social_story_evidence_items'
  ]){
    assert.match(sql,new RegExp(table));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql,new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
    assert.match(sql,new RegExp(`grant select,insert,update,delete on table public\\.${table} to service_role`));
  }
  assert.match(sql,/opportunity_id uuid not null references public\.social_opportunities/);
  assert.match(sql,/run_mode in \('SHADOW','PRODUCTION'\)/);
});

test('bridge exposes Phase 2 context and shadow actions',()=>{
  const bridge=fs.readFileSync(new URL('../lib/socialBridgeApi.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  for(const action of [
    'social_creative_evidence_context',
    'social_reel_evidence_prepare',
    'social_reel_evidence_poll',
    'social_stories_evidence_prepare',
    'social_stories_evidence_poll'
  ])assert.match(bridge,new RegExp(action));
  assert.match(endpoint,/creative_evidence_context/);
  assert.match(endpoint,/reel_evidence_\(prepare\|poll\)/);
  assert.match(endpoint,/stories_evidence_\(prepare\|poll\)/);
});

test('READY Reel must reference real Evidence from its Opportunity',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  assert.throws(
    ()=>normalizeEvidenceReelCandidate({
      opportunity_id:op.id,
      creative_direction:'VISUAL_PROOF',
      title:'Stop at eight',
      why_this_execution:'Show the exact trainer judgment.',
      qc_decision:'READY_FOR_APPROVAL',
      claim_refs:['invented:evidence']
    },1,map),
    /SOCIAL_CREATIVE_CLAIM_REF_OUTSIDE_OPPORTUNITY/
  );
});

test('READY Reel cannot upgrade exploratory Opportunity into grounded creative',()=>{
  const op=opportunity({evidence_strength:'EXPLORATORY',qc_decision:'REVIEW_REQUIRED'});
  const map=new Map([[op.id,op]]);
  assert.throws(
    ()=>normalizeEvidenceReelCandidate({
      opportunity_id:op.id,
      creative_direction:'PROCESS',
      title:'A process idea',
      why_this_execution:'Explore the service process.',
      qc_decision:'READY_FOR_APPROVAL',
      claim_refs:['fp:reps']
    },1,map),
    /SOCIAL_CREATIVE_READY_REQUIRES_GROUNDED/
  );
});

test('READY Reel inherits strategic reasoning and cannot overstate confidence',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  const row=normalizeEvidenceReelCandidate({
    opportunity_id:op.id,
    creative_direction:'VISUAL_PROOF',
    title:'10回予定でも、8回で止める。',
    hook:'10回やることが正解とは限りません。',
    core_message:'回数より、その日の質を見る。',
    why_this_execution:'A concrete number makes the trainer judgment visible.',
    difference_from_history:'Recent posts were equipment/knowledge heavy.',
    fact:'10 planned reps may stop at 8 when form changes.',
    confidence:'HIGH',
    qc_decision:'READY_FOR_APPROVAL',
    claim_refs:['fp:reps'],
    test_metrics:['24h reach']
  },1,map);
  assert.equal(row.evidence_strength,'GROUNDED');
  assert.equal(row.confidence,'MEDIUM');
  assert.equal(row.interpretation,op.interpretation);
  assert.equal(row.hypothesis,op.hypothesis);
  assert.deepEqual(row.claim_refs,['fp:reps']);
});

test('generalization flag blocks READY Reel',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  assert.throws(
    ()=>normalizeEvidenceReelCandidate({
      opportunity_id:op.id,
      creative_direction:'WILDCARD',
      title:'Generic psychology',
      why_this_execution:'A generic assumption.',
      qc_decision:'READY_FOR_APPROVAL',
      claim_refs:['fp:reps'],
      generalization_flags:['GENERIC_PSYCHOLOGY']
    },1,map),
    /SOCIAL_CREATIVE_GENERALIZATION_REQUIRES_REVIEW/
  );
});

test('READY Story requires why-today lineage and recent-pattern difference',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  assert.throws(
    ()=>normalizeEvidenceStoryItem({
      opportunity_id:op.id,
      role:'DECISION_SUPPORT',
      frame_text:'30分しかない日は、30分用に変える。',
      source_signal:'First-party says session content is adjusted to available time.',
      why_today:'This is linked to today\'s life-fit Opportunity.',
      qc_decision:'READY_FOR_APPROVAL',
      claim_refs:['fp:reps']
    },1,map),
    /SOCIAL_STORY_EVIDENCE_RECENT_DIFFERENCE_REQUIRED/
  );
});

test('READY Story stays grounded through Opportunity Evidence',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  const row=normalizeEvidenceStoryItem({
    opportunity_id:op.id,
    role:'DECISION_SUPPORT',
    pattern:'ONE_FRAME_DECISION',
    frame_text:'予定回数より、フォームを見る。',
    source_signal:'Trainer first-party gives a concrete 10-to-8 adjustment.',
    why_today:'Supports the same Opportunity without repeating the Reel execution.',
    recent_pattern_difference:'Recent Stories were quiet-space / first-visit reassurance.',
    qc_decision:'READY_FOR_APPROVAL',
    claim_refs:['fp:reps']
  },1,map);
  assert.equal(row.status,'PLANNED');
  assert.equal(row.evidence_strength,'GROUNDED');
  assert.deepEqual(row.claim_refs,['fp:reps']);
});


test('asset-first Stories prefer 2-3 items and existing-library footage',()=>{
  const rows=[
    {
      interaction:'NONE',
      asset_plan:'Use stored boxing vertical clip',
      metadata:{asset_source:'EXISTING_LIBRARY',asset_category:'BOXING'}
    },
    {
      interaction:'NONE',
      asset_plan:'Use stored training vertical clip',
      metadata:{asset_source:'EXISTING_LIBRARY',asset_category:'TRAINING'}
    },
    {
      interaction:'NONE',
      asset_plan:'Use stored store-detail vertical clip',
      metadata:{asset_source:'EXISTING_LIBRARY',asset_category:'STORE'}
    }
  ];
  const out=validateStoryAssetPolicy(rows,{
    asset_first_required:true,
    interaction_deprioritized:true
  });
  assert.equal(out.asset_first,true);
  assert.equal(out.story_count,3);
  assert.deepEqual(out.categories,['BOXING','TRAINING','STORE']);
  assert.equal(out.existing_asset_count,3);
  assert.equal(out.new_shoot_count,0);
  assert.equal(out.interaction_none_count,3);
});

test('asset-first Stories allow one item only with an explicit reason',()=>{
  const row={
    interaction:'NONE',
    asset_plan:'Use one verified stored clip',
    metadata:{asset_source:'EXISTING_LIBRARY',asset_category:'BOXING'}
  };
  assert.throws(
    ()=>validateStoryAssetPolicy([row],{asset_first_required:true}),
    /SOCIAL_STORY_ASSET_FIRST_PREFERS_TWO_TO_THREE/
  );
  assert.doesNotThrow(
    ()=>validateStoryAssetPolicy([row],{
      asset_first_required:true,
      single_story_reason:'Only one verified reusable asset is available without creating filler.'
    })
  );
});

test('Poll or Question is opt-in when interaction is deprioritized',()=>{
  const poll={
    interaction:'POLL',
    asset_plan:'Use stored clip',
    metadata:{asset_source:'EXISTING_LIBRARY',asset_category:'STORE'}
  };
  assert.throws(
    ()=>validateStoryAssetPolicy([poll,poll],{
      asset_first_required:true,
      interaction_deprioritized:true
    }),
    /SOCIAL_STORY_INTERACTION_REQUIRES_EXCEPTION/
  );

  const allowed={
    ...poll,
    metadata:{
      ...poll.metadata,
      interaction_exception_reason:'This poll directly resolves a documented customer-signal gap for the next decision.'
    }
  };
  assert.doesNotThrow(
    ()=>validateStoryAssetPolicy([allowed,allowed],{
      asset_first_required:true,
      interaction_deprioritized:true
    })
  );
});

test('three asset-first Stories need at least two visual categories',()=>{
  const row={
    interaction:'NONE',
    asset_plan:'Use stored boxing clip',
    metadata:{asset_source:'EXISTING_LIBRARY',asset_category:'BOXING'}
  };
  assert.throws(
    ()=>validateStoryAssetPolicy([row,row,row],{asset_first_required:true}),
    /SOCIAL_STORY_ASSET_CATEGORY_DIVERSITY_TOO_LOW/
  );
});


test('Stories Creative Context requires residue, recent-history check, asset search, divergence and anti-LLM QC',()=>{
  const good={
    creative_context_required:true,
    creative_context_version:'STORIES_CREATIVE_CONTEXT_V1',
    daily_residue:'THE REV.の日常とサービス幅を、説明しすぎず実素材で残す。',
    recent_story_lookback_checked:true,
    cross_channel_overlap_checked:true,
    asset_search_completed:true,
    divergent_directions:[
      'real moment',
      'daily atmosphere',
      'useful observation',
      'human thinking',
      'service proof'
    ],
    anti_llm_qc_completed:true
  };
  const out=validateStoryCreativeContext(good);
  assert.equal(out.required,true);
  assert.equal(out.creative_context_version,'STORIES_CREATIVE_CONTEXT_V1');
  assert.equal(out.divergent_direction_count,5);

  assert.throws(
    ()=>validateStoryCreativeContext({...good,daily_residue:''}),
    /SOCIAL_STORY_DAILY_RESIDUE_REQUIRED/
  );
  assert.throws(
    ()=>validateStoryCreativeContext({...good,recent_story_lookback_checked:false}),
    /SOCIAL_STORY_RECENT_LOOKBACK_REQUIRED/
  );
  assert.throws(
    ()=>validateStoryCreativeContext({...good,cross_channel_overlap_checked:false}),
    /SOCIAL_STORY_CROSS_CHANNEL_CHECK_REQUIRED/
  );
  assert.throws(
    ()=>validateStoryCreativeContext({...good,asset_search_completed:false}),
    /SOCIAL_STORY_ASSET_SEARCH_REQUIRED/
  );
  assert.throws(
    ()=>validateStoryCreativeContext({...good,divergent_directions:['one','two','three','four']}),
    /SOCIAL_STORY_DIVERGENCE_FIVE_REQUIRED/
  );
  assert.throws(
    ()=>validateStoryCreativeContext({...good,anti_llm_qc_completed:false}),
    /SOCIAL_STORY_ANTI_LLM_QC_REQUIRED/
  );
});

test('Stories Creative Context remains additive until explicitly required',()=>{
  assert.deepEqual(validateStoryCreativeContext({}),{required:false});
});


test('asset-first Stories may request a new shoot after existing asset search',()=>{
  const rows=[
    {
      interaction:'NONE',
      asset_plan:'Use verified stored reception clip',
      metadata:{asset_source:'EXISTING_LIBRARY',asset_category:'STORE'}
    },
    {
      interaction:'NONE',
      asset_plan:'Shoot 5 seconds of opening preparation at the real store.',
      metadata:{
        asset_source:'NEW_SHOOT',
        asset_category:'DAILY_ATMOSPHERE',
        new_shoot_reason:'No verified existing asset captures the specific opening-preparation moment planned for today.'
      }
    }
  ];
  const out=validateStoryAssetPolicy(rows,{
    asset_first_required:true,
    asset_search_completed:true
  });
  assert.equal(out.existing_asset_count,1);
  assert.equal(out.new_shoot_count,1);

  assert.throws(
    ()=>validateStoryAssetPolicy(rows,{asset_first_required:true}),
    /SOCIAL_STORY_NEW_SHOOT_REQUIRES_ASSET_SEARCH/
  );
});

test('new Story shoot requires an explicit reason',()=>{
  const rows=[
    {
      interaction:'NONE',
      asset_plan:'Shoot a new store clip',
      metadata:{
        asset_source:'NEW_SHOOT',
        asset_category:'STORE',
        new_shoot_reason:'new'
      }
    },
    {
      interaction:'NONE',
      asset_plan:'Use stored training clip',
      metadata:{asset_source:'EXISTING_LIBRARY',asset_category:'TRAINING'}
    }
  ];
  assert.throws(
    ()=>validateStoryAssetPolicy(rows,{
      asset_first_required:true,
      asset_search_completed:true
    }),
    /SOCIAL_STORY_NEW_SHOOT_REASON_REQUIRED/
  );
});


test('Reel B V2 requires belief, positioning, proof, sequence and brand residue for every candidate',()=>{
  const rows=[1,2,3,4,5].map(candidateNo=>({
    candidate_no:candidateNo,
    metadata:{
      positioning_relationship:candidateNo===3?'ENRICH':'PROVE',
      current_belief:'パーソナルジムはメニュー通りに運動する場所だと思っている。',
      desired_belief:'THE REV.では身体の状態を見ながら、その場で内容を判断している。',
      proof_type:candidateNo===3?'PHYSICAL_EVIDENCE':'PEOPLE',
      sequence_archetype:candidateNo===3
        ?'SITUATION_PROCESS_MEANING'
        :'PERSON_JUDGMENT_SPACE',
      brand_residue:'身体を理解してから鍛える THE REV.',
      micro_action:'NONE',
      ...(candidateNo===3?{supporting_value:'OXYGEN_ROOM'}:{})
    }
  }));

  const out=validateReelCreativeContextV2(rows,{
    reel_creative_context_required:true,
    reel_creative_context_version:'SOCIAL_REEL_B_PRODUCTION_CONTEXT_V2',
    positioning_baseline_checked:true,
    positioning_evidence_strength:'MEDIUM',
    research_review_checked:true
  });

  assert.equal(out.required,true);
  assert.equal(out.reel_creative_context_version,'SOCIAL_REEL_B_PRODUCTION_CONTEXT_V2');
  assert.equal(out.candidate_contracts.length,5);
  assert.equal(out.candidate_contracts[2].positioning_relationship,'ENRICH');
});

test('Reel B V2 does not allow a candidate to be ready without a belief change',()=>{
  const rows=[{
    candidate_no:1,
    metadata:{
      positioning_relationship:'PROVE',
      current_belief:'同じ',
      desired_belief:'同じ',
      proof_type:'PROCESS',
      sequence_archetype:'POV_ENTRY_PROCESS_EXIT',
      brand_residue:'THE REV.',
      micro_action:'NONE'
    }
  }];
  assert.throws(
    ()=>validateReelCreativeContextV2(rows,{
      reel_creative_context_required:true,
      reel_creative_context_version:'SOCIAL_REEL_B_PRODUCTION_CONTEXT_V2',
      positioning_baseline_checked:true,
      positioning_evidence_strength:'MEDIUM',
      research_review_checked:true
    }),
    /SOCIAL_REEL_V2_CURRENT_BELIEF_REQUIRED|SOCIAL_REEL_V2_DESIRED_BELIEF_REQUIRED/
  );
});

test('Reel B V2 requires justification when a supporting value is used outside ENRICH',()=>{
  const rows=[{
    candidate_no:1,
    metadata:{
      positioning_relationship:'PROVE',
      current_belief:'酸素ルームは珍しい設備が置いてあるだけだと思っている。',
      desired_belief:'酸素ルームはTHE REV.のサービス体験を支える役割として置かれている。',
      proof_type:'PHYSICAL_EVIDENCE',
      sequence_archetype:'DEMONSTRATION_CLAIM_BOUNDARY',
      brand_residue:'THE REV.のサービス設計',
      micro_action:'NONE',
      supporting_value:'OXYGEN_ROOM'
    }
  }];
  assert.throws(
    ()=>validateReelCreativeContextV2(rows,{
      reel_creative_context_required:true,
      reel_creative_context_version:'SOCIAL_REEL_B_PRODUCTION_CONTEXT_V2',
      positioning_baseline_checked:true,
      positioning_evidence_strength:'MEDIUM',
      research_review_checked:true
    }),
    /SOCIAL_REEL_V2_SUPPORTING_VALUE_POSITIONING_JUSTIFICATION_REQUIRED/
  );
});

test('Reel B V2 remains additive until explicitly required',()=>{
  assert.deepEqual(validateReelCreativeContextV2([],{}),{required:false});
});
