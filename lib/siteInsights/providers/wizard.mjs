// GSC Wizard's documented Streamable HTTP MCP transport. Fixed host, fixed read-tool allowlist.
const ENDPOINT = 'https://mcp.gscwizard.com/mcp';
const ALLOWED = new Set(['query_search_analytics', 'get_ga4_overview', 'query_ga4_report', 'get_blended_landing_pages', 'list_annotations']);
const ATTEMPTS = 3;
const TIMEOUT_MS = 8000;
const BACKOFF_MS = 150;
const failure = code => Object.assign(new Error(code), { code });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function transportCode(error) {
  const codes = [error?.code, error?.cause?.code];
  if (error?.name === 'TimeoutError' || codes.some(code => ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code))) return 'wizard_timeout';
  if (codes.some(code => ['ENOTFOUND', 'EAI_AGAIN'].includes(code))) return 'wizard_dns_error';
  return 'wizard_connection_error';
}

function httpCode(status) {
  if (status === 401 || status === 403) return 'wizard_permission_denied';
  if (status === 429) return 'wizard_rate_limited';
  if (status >= 500) return 'wizard_upstream_5xx';
  return 'wizard_upstream_error';
}

function parseEventStream(text) {
  const messages = text.split(/\r?\n\r?\n/).flatMap(chunk => chunk.split(/\r?\n/).filter(line => line.startsWith('data: ')).map(line => line.slice(6)));
  for (const message of messages) {
    try { const parsed = JSON.parse(message); if (parsed?.result || parsed?.error) return parsed; } catch {}
  }
  throw failure('invalid_response');
}

export async function wizard(name, args, { fetchImpl = fetch, key = process.env.GSC_WIZARD_API_KEY, waitImpl = wait } = {}) {
  if (!ALLOWED.has(name)) throw new TypeError('unsupported_tool');
  if (!key) throw failure('not_configured');
  const common = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  async function send(payload, session = '') {
    let response;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        response = await fetchImpl(ENDPOINT, {
          method: 'POST', headers: { ...common, ...(session ? { 'Mcp-Session-Id': session, 'MCP-Protocol-Version': '2025-03-26' } : {}) },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT_MS)
        });
      } catch (error) {
        const code = transportCode(error);
        if (attempt < ATTEMPTS - 1 && code !== 'wizard_dns_error') { await waitImpl(BACKOFF_MS * (attempt + 1)); continue; }
        throw failure(code);
      }
      if (!response || typeof response.status !== 'number') throw failure('invalid_response');
      if (!response.ok && attempt < ATTEMPTS - 1 && (response.status === 429 || response.status >= 500)) {
        await waitImpl(BACKOFF_MS * (attempt + 1));
        continue;
      }
      break;
    }
    if (!response.ok) throw failure(httpCode(response.status));
    if (!('id' in payload)) return { session: response.headers.get('mcp-session-id') };
    let envelope;
    try {
      const text = await response.text();
      envelope = response.headers.get('content-type')?.includes('text/event-stream') ? parseEventStream(text) : JSON.parse(text);
    } catch { throw failure('invalid_response'); }
    if (envelope?.error) throw failure('wizard_upstream_error');
    return { result: envelope?.result, session: response.headers.get('mcp-session-id') };
  }
  const init = await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'the-rev-site-insights', version: '2.0' } } });
  if (!init.result?.protocolVersion) throw failure('invalid_response');
  await send({ jsonrpc: '2.0', method: 'notifications/initialized' }, init.session);
  const { result } = await send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }, init.session);
  if (result?.isError) throw failure('wizard_upstream_error');
  // Presentation payloads omit fields needed by the data contract, including
  // overview timeseries and blended impressions. Prefer the complete JSON text.
  const blocks = result?.content?.filter(x => x.type === 'text');
  if (blocks?.length) { try { return JSON.parse(blocks[0].text); } catch {} }
  if (result?.structuredContent) return result.structuredContent;
  throw failure('invalid_response');
}
