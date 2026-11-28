// GSC Wizard's documented Streamable HTTP MCP transport. Fixed host, fixed read-tool allowlist.
const ENDPOINT='https://mcp.gscwizard.com/mcp';
const ALLOWED=new Set(['query_search_analytics','get_ga4_overview','query_ga4_report','get_blended_landing_pages','list_annotations']);
function parseEventStream(text) {
  const messages=text.split(/\r?\n\r?\n/).flatMap(chunk=>chunk.split(/\r?\n/).filter(line=>line.startsWith('data: ')).map(line=>line.slice(6)));
  for(const message of messages){try{const parsed=JSON.parse(message);if(parsed?.result||parsed?.error)return parsed;}catch{}}
  throw Object.assign(new Error('invalid_response'),{code:'invalid_response'});
}
export async function wizard(name,args,{fetchImpl=fetch,key=process.env.GSC_WIZARD_API_KEY}={}) {
  if(!ALLOWED.has(name)) throw new TypeError('unsupported_tool');
  if(!key) throw Object.assign(new Error('not_configured'),{code:'not_configured'});
  const common={Authorization:`Bearer ${key}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
  async function send(payload,session='') {
    let response;
    for(let attempt=0;attempt<2;attempt++) {
      try {response=await fetchImpl(ENDPOINT,{method:'POST',headers:{...common,...(session?{'Mcp-Session-Id':session,'MCP-Protocol-Version':'2025-03-26'}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});}
      catch {throw Object.assign(new Error('upstream_unavailable'),{code:'upstream_unavailable'});}
      if(attempt===0&&(response.status===429||response.status>=500)){await new Promise(resolve=>setTimeout(resolve,150));continue;}
      break;
    }
    if(!response.ok)throw Object.assign(new Error('upstream_error'),{code:response.status===401||response.status===403?'permission_denied':response.status===429?'rate_limited':'upstream_error'});
    if(!('id' in payload))return {session:response.headers.get('mcp-session-id')};
    let envelope;
    try {const text=await response.text();envelope=response.headers.get('content-type')?.includes('text/event-stream')?parseEventStream(text):JSON.parse(text);}
    catch {throw Object.assign(new Error('invalid_response'),{code:'invalid_response'});}
    if(envelope?.error)throw Object.assign(new Error('upstream_error'),{code:'upstream_error'});
    return {result:envelope?.result,session:response.headers.get('mcp-session-id')};
  }
  const init=await send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'the-rev-site-insights',version:'2.0'}}});
  if(!init.result?.protocolVersion)throw Object.assign(new Error('invalid_response'),{code:'invalid_response'});
  await send({jsonrpc:'2.0',method:'notifications/initialized'},init.session);
  const {result}=await send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args}},init.session);
  if(result?.isError)throw Object.assign(new Error('upstream_error'),{code:'upstream_error'});
  // Presentation payloads omit fields needed by the data contract, including
  // overview timeseries and blended impressions. Prefer the complete JSON text.
  const blocks=result?.content?.filter(x=>x.type==='text');
  if(blocks?.length){try{return JSON.parse(blocks[0].text);}catch{}}
  if(result?.structuredContent)return result.structuredContent;
  throw Object.assign(new Error('invalid_response'),{code:'invalid_response'});
}
