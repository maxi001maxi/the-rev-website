// THE REV. Editorial AI -> Editorial Console bridge helpers (Phase 9)
//
// This module is intentionally side-effect free so it can be tested without
// touching Supabase, GitHub, or Vercel. The API route performs the I/O.
import crypto from 'node:crypto';

export const BRIDGE_SOURCE = 'the-rev-editorial-ai';
export const ALLOWED_CATEGORIES = ['training', 'boxing', 'recovery', 'body-knowledge'];
export const ALLOWED_CTA_TYPES = ['personal-training', 'boxing', 'recovery', 'general'];

// Editorial CTA policy: the article closing and the conversion CTA are separate concerns.
// Every Editorial AI article should close with a THE REV.-specific point of view, while
// the site CTA appears only when the reader's search intent naturally reaches a service
// comparison / visit / booking decision. Upstream may still send a legacy cta_type;
// AUTO policy deliberately ignores it for purely informational articles.
export function resolveEditorialCtaType(body, validated = {}) {
  const requestedRaw = validated?.ctaType ?? body?.cta_type ?? null;
  const requested = requestedRaw == null ? null : String(requestedRaw).trim();
  const mode = String(body?.cta_mode || 'AUTO').trim().toUpperCase();

  if (['NONE', 'OFF', 'DISABLED'].includes(mode)) return null;
  if (mode === 'FORCE') return requested && ALLOWED_CTA_TYPES.includes(requested) ? requested : null;

  const articleType = String(body?.article_type || '').trim().toUpperCase();
  const intentText = [
    body?.title,
    body?.primary_query,
    body?.search_intent,
    body?.description
  ].map((v) => String(v || '')).join(' ');

  const decisionStageArticle = [
    'COMPARISON_GUIDE',
    'SERVICE_GUIDE',
    'LOCATION_GUIDE',
    'PRICE_GUIDE'
  ].includes(articleType);
  const decisionStageIntent = /(予約|体験|入会|料金|価格|費用|比較|選び方|選ぶ|見学|問い合わせ|パーソナルジム|ジムを探|酸素ルーム|DENBA|パーソナルボクシング)/i.test(intentText);

  if (!decisionStageArticle && !decisionStageIntent) return null;
  return requested && ALLOWED_CTA_TYPES.includes(requested) ? requested : 'general';
}

export function bridgeConfig(env = process.env) {
  const missing = [];
  if (!env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!env.ADMIN_PUBLISHER_USER_ID) missing.push('ADMIN_PUBLISHER_USER_ID');
  if (!env.EDITORIAL_BRIDGE_SECRET) missing.push('EDITORIAL_BRIDGE_SECRET');
  return {
    configured: missing.length === 0,
    missing
  };
}

export function safeSecretEqual(actual, expected) {
  const a = Buffer.from(String(actual || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function extractBearerSecret(req) {
  const header = req?.headers?.authorization || req?.headers?.Authorization || '';
  if (!String(header).startsWith('Bearer ')) return '';
  return String(header).slice(7).trim();
}

export function validateBridgeEnvelope(body) {
  const errors = [];
  const contentId = typeof body?.content_id === 'string' ? body.content_id.trim() : '';
  const weekStart = typeof body?.week_start === 'string' ? body.week_start.trim() : '';
  const editorialStatus = String(body?.editorial_status || '').toUpperCase();
  const factCheckStatus = String(body?.fact_check_status || '').toUpperCase();
  const topicGateDecision = String(body?.topic_gate_decision || '').toUpperCase();
  const category = String(body?.category || '').trim();
  const ctaType = body?.cta_type == null ? null : String(body.cta_type).trim();

  if (!contentId) errors.push('content_id は必須です。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) errors.push('week_start は YYYY-MM-DD 形式で指定してください。');
  if (editorialStatus !== 'READY') errors.push('editorial_status が READY ではありません。');
  if (factCheckStatus !== 'PASS') errors.push('fact_check_status が PASS ではありません。');
  if (topicGateDecision !== 'PUBLISH') errors.push('topic_gate_decision が PUBLISH ではありません。');
  if (!ALLOWED_CATEGORIES.includes(category)) errors.push('category が不正です。');
  if (ctaType && !ALLOWED_CTA_TYPES.includes(ctaType)) errors.push('cta_type が不正です。');

  return {
    errors,
    value: {
      contentId,
      weekStart,
      editorialStatus,
      factCheckStatus,
      topicGateDecision,
      category,
      ctaType
    }
  };
}

export function normalizeBridgeMetadata(body) {
  return {
    content_id: String(body?.content_id || '').trim(),
    week_start: String(body?.week_start || '').trim(),
    editor_score: numberOrNull(body?.editor_score),
    fact_check_status: String(body?.fact_check_status || '').toUpperCase(),
    topic_gate_score: numberOrNull(body?.topic_gate_score),
    topic_gate_decision: String(body?.topic_gate_decision || '').toUpperCase(),
    primary_query: String(body?.primary_query || '').trim(),
    article_type: String(body?.article_type || '').trim(),
    source_doc_url: String(body?.source_doc_url || '').trim()
  };
}

// The Daily Creator encodes the content target day in content_id
// (BLOG-YYYYMMDD-xxxxxx). The deployed GAS Supervisor sends its run day as
// `published`, which is one lead-day early. Use the target day when it is
// later than the supplied date and at most MAX_TARGET_LEAD_DAYS ahead; never
// move a date backwards.
export const MAX_TARGET_LEAD_DAYS = 7;

export function resolveEditorialPublishedDate({ contentId, published } = {}) {
  const supplied = typeof published === 'string' ? published.trim() : '';
  const m = String(contentId || '').match(/^BLOG-(\d{4})(\d{2})(\d{2})-/);
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(supplied)) return published;
  const target = `${m[1]}-${m[2]}-${m[3]}`;
  const targetMs = Date.parse(`${target}T00:00:00Z`);
  const suppliedMs = Date.parse(`${supplied}T00:00:00Z`);
  if (Number.isNaN(targetMs) || Number.isNaN(suppliedMs)) return published;
  const days = (targetMs - suppliedMs) / 86400000;
  return days > 0 && days <= MAX_TARGET_LEAD_DAYS ? target : published;
}

export function computeEditorialSyncHash(articleValue, metadata) {
  const canonical = JSON.stringify({ article: stableObject(articleValue), metadata: stableObject(metadata) });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function originFromRequest(req) {
  const protoHeader = req?.headers?.['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : (protoHeader || 'https');
  const hostHeader = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!host) return '';
  return `${String(proto).split(',')[0].trim()}://${String(host).split(',')[0].trim()}`;
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = stableObject(value[key]);
    return out;
  }, {});
}
