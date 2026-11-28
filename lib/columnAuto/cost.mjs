// 費用の記録と上限。1回の実行で呼んだAPIを1件ずつ記録し、円の概算を出す。
import { PRICES_USD_PER_MTOK, USD_JPY } from './config.mjs';

export class BudgetExceededError extends Error {
  constructor(message, detail = {}) { super(message); this.code = 'BUDGET_EXCEEDED'; this.detail = detail; }
}

const round2 = (n) => Math.round(n * 100) / 100;

export function priceFor(model) {
  const key = String(model || '');
  if (PRICES_USD_PER_MTOK[key]) return PRICES_USD_PER_MTOK[key];
  const base = Object.keys(PRICES_USD_PER_MTOK).find((k) => key.startsWith(k));
  return base ? PRICES_USD_PER_MTOK[base] : null;
}

// usage は Anthropic 形式（input_tokens / output_tokens / cache_*）と OpenAI 形式の両方を受ける。
export function usageCostUsd(model, usage = {}) {
  const p = priceFor(model);
  if (!p || !usage) return null;
  const cacheRead = Number(usage.cache_read_input_tokens || usage.input_tokens_details?.cached_tokens || 0);
  const cacheWrite = Number(usage.cache_creation_input_tokens || usage.input_tokens_details?.cache_write_tokens || 0);
  let input = Number(usage.input_tokens || 0);
  // OpenAI の input_tokens はキャッシュ分を含む。Anthropic は含まない。
  if (usage.input_tokens_details) input = Math.max(0, input - cacheRead - cacheWrite);
  const output = Number(usage.output_tokens || 0);
  return (input * p.input + output * p.output + cacheRead * p.cache_read + cacheWrite * p.cache_write) / 1e6;
}

export function usdToJpy(usd) { return usd == null ? null : round2(usd * USD_JPY); }

export function createCostMeter({ capJpy = Infinity, label = 'run' } = {}) {
  const entries = [];
  const total = () => round2(entries.reduce((s, e) => s + (e.jpy || 0), 0));
  return {
    entries,
    total,
    record({ api, model, purpose, usage, usd = null, note = '' }) {
      const costUsd = usd != null ? usd : usageCostUsd(model, usage);
      const entry = {
        api, model, purpose, note,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        usd: costUsd == null ? null : Math.round(costUsd * 10000) / 10000,
        jpy: usdToJpy(costUsd),
        price_known: costUsd != null,
        at: new Date().toISOString()
      };
      entries.push(entry);
      return entry;
    },
    // 次の呼び出しの最大見込みを足しても上限を超えないか、呼ぶ前に確かめる。
    assertRoom(nextMaxJpy = 0, what = '') {
      if (total() + nextMaxJpy > capJpy) {
        throw new BudgetExceededError(`${label}の費用上限（${capJpy}円）を超える見込みのため停止: ${what}`,
          { spent_jpy: total(), next_max_jpy: nextMaxJpy, cap_jpy: capJpy });
      }
    },
    byApi() {
      const out = {};
      for (const e of entries) {
        const k = `${e.api}:${e.model}`;
        out[k] ||= { api: e.api, model: e.model, calls: 0, jpy: 0, unknown_price_calls: 0 };
        out[k].calls += 1;
        out[k].jpy = round2(out[k].jpy + (e.jpy || 0));
        if (!e.price_known) out[k].unknown_price_calls += 1;
      }
      return Object.values(out);
    },
    toJSON() { return { total_jpy: total(), by_api: this.byApi(), entries }; }
  };
}

// 画像ジョブの台帳（editorial/image-api-ledger/*.json）から費用を概算する。
export function ledgerCost(ledger) {
  const rows = [];
  for (const c of ledger?.calls || []) {
    if (c.status === 'STARTED') { rows.push({ api: c.provider || 'openai', model: c.model, purpose: `image-${c.kind}`, usd: null, note: 'STARTED(未完了)' }); continue; }
    let usd = usageCostUsd(c.model, c.usage);
    // 画像生成ツールの出力トークン（usage に含まれる場合のみ）
    for (const g of c.image_generation_calls || []) {
      const out = Number(g.usage?.output_tokens || 0);
      if (out) usd = (usd || 0) + usageCostUsd('openai-image-output', { output_tokens: out });
    }
    if (c.kind === 'generation' && !(c.image_generation_calls || []).some((g) => g.usage)) {
      // 画像出力トークンが返らない場合の概算（medium 1536x1024 ≒ 1,600 tokens）
      usd = (usd || 0) + usageCostUsd('openai-image-output', { output_tokens: 1600 });
    }
    rows.push({ api: c.provider || (String(c.model || '').startsWith('claude') ? 'anthropic' : 'openai'), model: c.model, purpose: `image-${c.kind}`, usage: c.usage, usd });
  }
  return rows;
}
