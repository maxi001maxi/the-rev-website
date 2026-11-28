import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  getThreadsConversationConfiguration,
  getThreadsConversationContext,
  THREADS_CONVERSATION_SOURCE_VERSION
} from '../lib/socialThreadsConversationSource.mjs';
import {
  THREADS_OPERATIONS_V11,
  validateThreadsOperationsV11
} from '../lib/socialThreadParticipationV11.mjs';

function response(status,payload){
  return {ok:status>=200&&status<300,status,async json(){return payload;}};
}

test('Threads conversation source fails closed when token is missing',async()=>{
  let calls=0;
  const context=await getThreadsConversationContext({
    env:{},
    fetchImpl:async()=>{calls++;throw new Error('should not call');}
  });
  assert.equal(context.version,THREADS_CONVERSATION_SOURCE_VERSION);
  assert.equal(context.conversation_source_status,'NOT_CONFIGURED');
  assert.equal(context.capabilities.OWN_REPLIES.status,'NOT_CONFIGURED');
  assert.equal(calls,0);
});

test('Threads conversation source reads own replies, mentions and keyword results',async()=>{
  const seen=[];
  const fetchImpl=async(url)=>{
    const u=new URL(String(url)); seen.push(u.pathname+u.search);
    if(u.pathname==='/me' && !u.pathname.includes('/threads')) return response(200,{id:'u1',username:'therev'});
    if(u.pathname==='/me/threads') return response(200,{data:[{id:'p1',username:'therev',text:'post',timestamp:'2026-10-08T00:00:00+0000',permalink:'https://threads.net/p/1',has_replies:true}]});
    if(u.pathname==='/p1/replies') return response(200,{data:[{id:'r1',username:'someone',text:'reply',timestamp:'2026-10-08T01:00:00+0000',permalink:'https://threads.net/p/r1',is_reply:true,is_reply_owned_by_me:false,root_post:{id:'p1'},replied_to:{id:'p1'}}]});
    if(u.pathname==='/me/mentions') return response(200,{data:[{id:'m1',username:'local',text:'@therev 奈良',timestamp:'2026-10-08T02:00:00+0000',permalink:'https://threads.net/p/m1'}]});
    if(u.pathname==='/keyword_search') return response(200,{data:[{id:'k1',username:'nara_user',text:'奈良で運動',timestamp:'2026-10-08T03:00:00+0000',permalink:'https://threads.net/p/k1'}]});
    return response(404,{error:{message:'not found'}});
  };
  const context=await getThreadsConversationContext({
    env:{THREADS_ACCESS_TOKEN:'secret'},
    fetchImpl,
    queryTerms:['奈良']
  });
  assert.equal(context.conversation_source_status,'FRESH');
  assert.equal(context.capabilities.OWN_REPLIES.status,'FRESH');
  assert.equal(context.capabilities.MENTIONS.status,'FRESH');
  assert.equal(context.capabilities.KEYWORD_SEARCH.status,'FRESH');
  assert.equal(context.own_replies.length,1);
  assert.equal(context.mentions.length,1);
  assert.equal(context.keyword_results.length,1);
  assert.ok(seen.some(x=>x.includes('access_token=secret')));
  assert.equal(JSON.stringify(context).includes('secret'),false);
});

test('permission-denied capabilities are explicit while available source stays FRESH',async()=>{
  const fetchImpl=async(url)=>{
    const u=new URL(String(url));
    if(u.pathname==='/me') return response(200,{id:'u1',username:'the.rev.nara'});
    if(u.pathname==='/me/threads') return response(200,{data:[
      {id:'p1',username:'the.rev.nara',text:'one',timestamp:'2026-10-08T00:00:00+0000',permalink:'https://threads.com/p/1',has_replies:false},
      {id:'p2',username:'the.rev.nara',text:'two',timestamp:'2026-10-08T01:00:00+0000',permalink:'https://threads.com/p/2',has_replies:false},
      {id:'p3',username:'the.rev.nara',text:'three',timestamp:'2026-10-08T02:00:00+0000',permalink:'https://threads.com/p/3',has_replies:false}
    ]});
    if(u.pathname==='/me/mentions'||u.pathname==='/keyword_search'){
      return response(403,{error:{message:'Application does not have permission for this action',code:10}});
    }
    return response(404,{error:{message:'not found'}});
  };
  const context=await getThreadsConversationContext({
    env:{THREADS_ACCESS_TOKEN:'secret'},
    fetchImpl,
    queryTerms:['奈良']
  });
  assert.equal(context.conversation_source_status,'FRESH');
  assert.equal(context.capabilities.OWN_REPLIES.status,'FRESH');
  assert.equal(context.capabilities.OWN_REPLIES.own_post_count,3);
  assert.equal(context.capabilities.MENTIONS.status,'PERMISSION_NOT_GRANTED');
  assert.equal(context.capabilities.KEYWORD_SEARCH.status,'PERMISSION_NOT_GRANTED');
  assert.equal(context.own_replies.length,0);
  assert.equal(context.mentions.length,0);
  assert.equal(context.keyword_results.length,0);
});

test('v1.1 selected participation requires its exact capability to be FRESH',()=>{
  const base={
    version:THREADS_OPERATIONS_V11,
    run_mode:'SHADOW',
    conversation_source_status:'FRESH',
    conversation_capabilities:{
      OWN_REPLIES:{status:'FRESH'},
      MENTIONS:{status:'UNKNOWN'},
      KEYWORD_SEARCH:{status:'FRESH'}
    },
    daily_mode:'PARTICIPATION_ONLY',
    participation_opportunities:[{
      opportunity_key:'reply-1',surface:'REPLY',decision:'SELECT',
      source_capability:'MENTIONS',
      source_ref:'threads:m1',source_observed_at:'2026-10-08T02:00:00+09:00',
      source_summary:'mention',why_this_conversation:'relevant',THE_REV_role:'PERSPECTIVE',
      draft_text:'draft'
    }],
    original_required:false,
    measurement_windows:[7,30],
    one_post_rule_promotion:false,
    human_approval_required:true,
    auto_reply:false,
    auto_publish:false
  };
  assert.throws(()=>validateThreadsOperationsV11(base),/SOURCE_CAPABILITY_NOT_FRESH/);
  base.conversation_capabilities.MENTIONS.status='FRESH';
  assert.equal(validateThreadsOperationsV11(base).selected_participation_count,1);
});

test('Bridge exposes read-only Threads conversation action',()=>{
  const bridge=fs.readFileSync(new URL('../lib/socialBridgeApi.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  assert.match(bridge,/social_threads_conversation_context/);
  assert.match(bridge,/getThreadsConversationContext/);
  assert.match(endpoint,/conversation_context/);
});
