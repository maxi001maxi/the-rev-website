export const THREADS_CONVERSATION_SOURCE_VERSION='META_THREADS_API_V1';
export const THREADS_CONVERSATION_PROVIDER='META_THREADS_API';

const API_HOST='https://graph.threads.net';
const THREAD_FIELDS='id,username,text,timestamp,permalink,has_replies,is_quote_post';
const REPLY_FIELDS='id,text,timestamp,permalink,username,is_reply,is_reply_owned_by_me,root_post,replied_to,has_replies';
const CAPABILITY_SCOPES={
  OWN_REPLIES:['threads_basic','threads_read_replies'],
  MENTIONS:['threads_basic','threads_manage_mentions'],
  KEYWORD_SEARCH:['threads_basic','threads_keyword_search']
};

const text=v=>String(v??'').trim();
const arr=v=>Array.isArray(v)?v:[];
const clipped=(v,n=1000)=>text(v).slice(0,n);

function statusFromError(error){
  const status=Number(error?.status||0);
  if(status===401||status===403)return 'UNKNOWN';
  return 'UNKNOWN';
}

function safeError(error){
  return {
    code:clipped(error?.code||'THREADS_API_ERROR',120),
    status:Number(error?.status||0)||null,
    message:clipped(error?.message||'Threads API request failed',240)
  };
}

async function graphGet(path,{token,params={},fetchImpl=fetch}={}){
  const url=new URL(path,API_HOST);
  for(const [k,v] of Object.entries(params)){
    if(v===undefined||v===null||v==='')continue;
    url.searchParams.set(k,String(v));
  }
  url.searchParams.set('access_token',token);
  const response=await fetchImpl(url,{method:'GET',headers:{Accept:'application/json'}});
  let json={};
  try{json=await response.json();}catch{}
  if(!response.ok||json?.error){
    const error=new Error(clipped(json?.error?.message||`Threads API HTTP ${response.status}`,240));
    error.status=response.status;
    error.code=json?.error?.code||json?.error?.type||'THREADS_API_HTTP_ERROR';
    throw error;
  }
  return json;
}

function normalizeThread(item,kind){
  return {
    source_kind:kind,
    id:text(item?.id),
    username:clipped(item?.username,120)||null,
    text:clipped(item?.text,1200)||null,
    timestamp:text(item?.timestamp)||null,
    permalink:text(item?.permalink)||null,
    has_replies:item?.has_replies===true,
    is_reply:item?.is_reply===true,
    is_reply_owned_by_me:item?.is_reply_owned_by_me===true,
    root_post_id:text(item?.root_post?.id)||null,
    replied_to_id:text(item?.replied_to?.id)||null
  };
}

export function getThreadsConversationConfiguration(env=process.env,accessToken=null){
  const token=text(accessToken)||text(env?.THREADS_ACCESS_TOKEN);
  return {
    provider:THREADS_CONVERSATION_PROVIDER,
    version:THREADS_CONVERSATION_SOURCE_VERSION,
    configured:Boolean(token),
    conversation_source_status:token?'UNKNOWN':'NOT_CONFIGURED',
    required_env:['THREADS_ACCESS_TOKEN'],
    capabilities:{
      OWN_REPLIES:{status:token?'UNKNOWN':'NOT_CONFIGURED',required_scopes:CAPABILITY_SCOPES.OWN_REPLIES},
      MENTIONS:{status:token?'UNKNOWN':'NOT_CONFIGURED',required_scopes:CAPABILITY_SCOPES.MENTIONS},
      KEYWORD_SEARCH:{status:token?'UNKNOWN':'NOT_CONFIGURED',required_scopes:CAPABILITY_SCOPES.KEYWORD_SEARCH}
    }
  };
}

export async function getThreadsConversationContext({
  env=process.env,
  fetchImpl=fetch,
  since,
  until,
  queryTerms=[],
  maxOwnPosts=20,
  maxRepliesPerPost=50,
  accessToken=null
}={}){
  const token=text(accessToken)||text(env?.THREADS_ACCESS_TOKEN);
  const base=getThreadsConversationConfiguration(env,token);
  const retrievedAt=new Date().toISOString();

  if(!token)return {
    ...base,
    retrieved_at:retrievedAt,
    profile:null,
    own_posts:[],
    own_replies:[],
    mentions:[],
    keyword_results:[],
    errors:[]
  };

  const errors=[];
  let profile=null;
  let ownPosts=[];
  let ownReplies=[];
  let mentions=[];
  let keywordResults=[];

  try{
    const p=await graphGet('/me',{token,fetchImpl,params:{fields:'id,username,name'}});
    profile={id:text(p?.id)||null,username:clipped(p?.username,120)||null,name:clipped(p?.name,160)||null};
  }catch(error){
    const e=safeError(error);
    return {
      ...base,
      conversation_source_status:'UNKNOWN',
      retrieved_at:retrievedAt,
      profile:null,
      own_posts:[],own_replies:[],mentions:[],keyword_results:[],
      capabilities:{
        OWN_REPLIES:{...base.capabilities.OWN_REPLIES,status:'UNKNOWN'},
        MENTIONS:{...base.capabilities.MENTIONS,status:'UNKNOWN'},
        KEYWORD_SEARCH:{...base.capabilities.KEYWORD_SEARCH,status:'UNKNOWN'}
      },
      errors:[{capability:'AUTH',...e}]
    };
  }

  let ownRepliesStatus='UNKNOWN';
  try{
    const own=await graphGet('/me/threads',{
      token,fetchImpl,
      params:{fields:THREAD_FIELDS,limit:Math.max(1,Math.min(Number(maxOwnPosts)||20,50)),since,until}
    });
    ownPosts=arr(own?.data).map(x=>normalizeThread(x,'OWN_POST')).filter(x=>x.id);
    ownRepliesStatus='FRESH';

    for(const post of ownPosts.filter(x=>x.has_replies)){
      try{
        const replies=await graphGet(`/${encodeURIComponent(post.id)}/replies`,{
          token,fetchImpl,
          params:{fields:REPLY_FIELDS,reverse:'true',limit:Math.max(1,Math.min(Number(maxRepliesPerPost)||50,100))}
        });
        ownReplies.push(...arr(replies?.data).map(x=>({...normalizeThread(x,'OWN_POST_REPLY'),parent_post_id:post.id})));
      }catch(error){
        ownRepliesStatus=statusFromError(error);
        errors.push({capability:'OWN_REPLIES',post_id:post.id,...safeError(error)});
      }
    }
  }catch(error){
    ownRepliesStatus=statusFromError(error);
    errors.push({capability:'OWN_REPLIES',...safeError(error)});
  }

  let mentionsStatus='UNKNOWN';
  try{
    const data=await graphGet('/me/mentions',{
      token,fetchImpl,
      params:{fields:THREAD_FIELDS,limit:50,since,until}
    });
    mentions=arr(data?.data).map(x=>normalizeThread(x,'MENTION')).filter(x=>x.id);
    mentionsStatus='FRESH';
  }catch(error){
    mentionsStatus=statusFromError(error);
    errors.push({capability:'MENTIONS',...safeError(error)});
  }

  const terms=[...new Set(arr(queryTerms).map(v=>text(v)).filter(Boolean))].slice(0,10);
  let keywordStatus=terms.length?'UNKNOWN':'NOT_REQUESTED';
  if(terms.length){
    keywordStatus='FRESH';
    for(const q of terms){
      try{
        const data=await graphGet('/keyword_search',{
          token,fetchImpl,
          params:{q,search_type:'RECENT',fields:THREAD_FIELDS,limit:25}
        });
        keywordResults.push(...arr(data?.data).map(x=>({...normalizeThread(x,'KEYWORD_SEARCH'),query:q})));
      }catch(error){
        keywordStatus=statusFromError(error);
        errors.push({capability:'KEYWORD_SEARCH',query:q,...safeError(error)});
      }
    }
  }

  const capabilities={
    OWN_REPLIES:{status:ownRepliesStatus,required_scopes:CAPABILITY_SCOPES.OWN_REPLIES,count:ownReplies.length,own_post_count:ownPosts.length},
    MENTIONS:{status:mentionsStatus,required_scopes:CAPABILITY_SCOPES.MENTIONS,count:mentions.length},
    KEYWORD_SEARCH:{status:keywordStatus,required_scopes:CAPABILITY_SCOPES.KEYWORD_SEARCH,count:keywordResults.length,queries:terms}
  };
  const freshCount=Object.values(capabilities).filter(x=>x.status==='FRESH').length;

  return {
    provider:THREADS_CONVERSATION_PROVIDER,
    version:THREADS_CONVERSATION_SOURCE_VERSION,
    configured:true,
    conversation_source_status:freshCount?'FRESH':'UNKNOWN',
    retrieved_at:retrievedAt,
    profile,
    capabilities,
    own_posts:ownPosts,
    own_replies:ownReplies,
    mentions,
    keyword_results:keywordResults,
    errors
  };
}
