// Claude API 呼び出し（公式SDK）。費用を必ず記録する。鍵は環境変数 ANTHROPIC_API_KEY のみ。
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('ANTHROPIC_API_KEY が未設定です（GitHub Secrets に登録が必要）'), { kind: 'TERMINAL' });
  client ||= new Anthropic({ maxRetries: 3, timeout: 10 * 60 * 1000 });
  return client;
}

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
let fallbacksSupported = true;

export function imageBlock(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const media_type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return { type: 'image', source: { type: 'base64', media_type, data: fs.readFileSync(filePath).toString('base64') } };
}

export function extractJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(cleaned); } catch {}
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
  if (s >= 0 && e > s) return JSON.parse(cleaned.slice(s, e + 1));
  throw new Error('Claude の応答が JSON ではありません');
}

/**
 * @param {object} o
 * @param {string} o.model
 * @param {string} o.system
 * @param {Array}  o.content   user content blocks（text / image）
 * @param {object} [o.schema]  JSON Schema（構造化出力）。無ければテキストから JSON を取り出す
 * @param {string} [o.effort]
 * @param {number} [o.maxTokens]
 * @param {object} o.meter     createCostMeter() の戻り値
 * @param {string} o.purpose
 * @param {number} [o.maxJpy]  呼ぶ前の上限確認に使う最大見込み
 */
export async function claudeJson({ model, system, content, schema = null, effort = 'medium', maxTokens = 32000, meter, purpose, maxJpy = 80 }) {
  meter?.assertRoom(maxJpy, purpose);
  const params = {
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: typeof content === 'string' ? [{ type: 'text', text: content }] : content }],
    output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) }
  };
  const call = async (withFallback) => {
    const body = withFallback ? { ...params, betas: [FALLBACK_BETA], fallbacks: 'default' } : params;
    const stream = withFallback ? getClient().beta.messages.stream(body) : getClient().messages.stream(body);
    return stream.finalMessage();
  };
  let msg;
  try {
    msg = await call(fallbacksSupported);
  } catch (err) {
    // 古い環境で fallbacks が受け付けられない場合だけ、外して1回やり直す
    if (fallbacksSupported && err?.status === 400 && /fallback|beta/i.test(String(err?.message))) {
      fallbacksSupported = false;
      msg = await call(false);
    } else {
      err.kind ||= (err?.status === 429 || err?.status >= 500 || !err?.status) ? 'TRANSIENT' : 'TERMINAL';
      throw err;
    }
  }
  meter?.record({ api: 'anthropic', model: msg.model || model, purpose, usage: msg.usage });
  if (msg.stop_reason === 'refusal') throw Object.assign(new Error(`Claude が応答を辞退しました（${purpose}）`), { kind: 'TERMINAL' });
  if (msg.stop_reason === 'max_tokens') throw Object.assign(new Error(`出力が上限で切れました（${purpose}）`), { kind: 'TRANSIENT' });
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return { data: extractJson(text), model: msg.model || model, usage: msg.usage };
}
