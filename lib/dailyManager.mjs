import { ga4Dataset } from './siteInsights/providers/ga4.mjs';
import { searchAnchor, searchRaw, searchDaily, searchTotal } from './siteInsights/providers/search.mjs';
import { dateShift } from './siteInsights/normalize.mjs';

const JST = 'Asia/Tokyo';
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function jstDateKey(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: JST, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isBusinessDay(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: JST, weekday: 'short' }).format(date);
  return !['Mon', 'Fri'].includes(weekday);
}

export function validBusinessDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export function normalizeDailyInput(row) {
  if (!row) return {
    planned_sessions: null, cancel_count: 0, same_day_additions: 0,
    actual_sessions: null, trial_sessions: null, notes: null
  };
  return {
    planned_sessions: numberOrNull(row.planned_sessions),
    cancel_count: numberOrNull(row.cancel_count) ?? 0,
    same_day_additions: numberOrNull(row.same_day_additions) ?? 0,
    actual_sessions: numberOrNull(row.actual_sessions),
    trial_sessions: numberOrNull(row.trial_sessions),
    notes: row.notes ? String(row.notes).slice(0, 1000) : null
  };
}

export function sessionSummary(input) {
  if (input.actual_sessions !== null) {
    return { completed: Math.max(0, input.actual_sessions), quality: 'MANUAL_ACTUAL' };
  }
  if (input.planned_sessions !== null) {
    return {
      completed: Math.max(0, input.planned_sessions - input.cancel_count + input.same_day_additions),
      quality: 'ESTIMATED_FROM_INPUT'
    };
  }
  return { completed: null, quality: 'UNKNOWN' };
}

function sourceSum(rows, matcher) {
  return (rows || []).reduce((sum, row) => matcher(String(row.name || '')) ? sum + Number(row.sessions || 0) : sum, 0);
}

export function buildManagerAssessment(snapshot) {
  const priorities = [];
  const notes = [];

  if (snapshot.planned_sessions === null) {
    notes.push('予定セッション数が未入力のため、営業量の評価は保留です。');
    priorities.push({ key: 'session_input', label: '翌営業日の予定セッション数を朝に入力', owner: 'OWNER' });
  } else {
    notes.push(`セッションは${snapshot.completed_sessions ?? '—'}件（予定${snapshot.planned_sessions}件、キャンセル${snapshot.cancel_count ?? 0}件）です。`);
  }

  if ((snapshot.cancel_count || 0) > 0 && (snapshot.planned_sessions || 0) >= 3) {
    const rate = snapshot.cancel_count / snapshot.planned_sessions;
    if (rate >= 0.25) {
      notes.push('キャンセル比率が単日では高めです。原因断定はせず、週次で再発有無を確認します。');
    }
  }

  const highIntent = snapshot.high_intent_events;
  if (typeof highIntent === 'number' && highIntent > 0) {
    notes.push(`Webでは予約画面/LINEへの高意図行動が${highIntent}件ありました。クリックは予約完了・問い合わせ完了とは別です。`);
  } else if ((snapshot.web_sessions || 0) >= 10 && highIntent === 0) {
    notes.push('Web訪問はありますが高意図行動は0件です。単日で施策変更せず、7日単位で導線を確認します。');
  }

  if (snapshot.snapshot_status === 'PRELIMINARY') {
    priorities.push({ key: 'finalize', label: '日次締め後にFINAL更新', owner: 'OWNER' });
  }

  if ((snapshot.reserve_click || 0) + (snapshot.line_click || 0) > 0) {
    priorities.push({ key: 'intent_followthrough', label: '高意図クリックと実際の予約・問い合わせを週次で照合', owner: 'AI_WEEKLY' });
  }

  if (!notes.length) notes.push('大きな日次異常は検出していません。単日の小さな変動では戦略を変えません。');
  notes.push('売上・顧客詳細はGYM’sが外部正本のため、日次自動評価では未計測として扱います。');

  return {
    manager_comment: notes.join('\n'),
    priorities: priorities.slice(0, 3)
  };
}

async function collectGa4(date, ga4Provider) {
  const data = await ga4Provider({ startDate: date, endDate: date }, { details: true });
  const sources = data.sources || [];
  return {
    sessions: data.total.sessions,
    activeUsers: data.total.activeUsers,
    views: data.total.screenPageViews,
    engagementRate: data.total.engagementRate,
    organicSessions: sourceSum(sources, (s) => /\/ organic$/i.test(s)),
    organicSocialSessions: sourceSum(sources, (s) => /(instagram|threads|facebook|tiktok)/i.test(s)),
    aiAssistantSessions: sourceSum(sources, (s) => /(chatgpt|perplexity|copilot|gemini|claude)/i.test(s)),
    reserveClick: Number(data.events?.reserve_click || 0),
    lineClick: Number(data.events?.line_click || 0),
    priceClick: Number(data.events?.price_click || 0),
    articleCtaClick: Number(data.events?.article_cta_click || 0)
  };
}

async function collectGsc7d(searchProviders) {
  const anchor = await searchProviders.anchor();
  const start = dateShift(anchor, -6);
  const raw = await searchProviders.raw(start, anchor);
  const rows = searchDaily(raw, start, anchor);
  const total = searchTotal(rows);
  return { settledThrough: anchor, clicks: total.clicks, impressions: total.impressions };
}

async function publishedToday(supabase, date) {
  const next = dateShift(date, 1);
  const { count, error } = await supabase
    .from('admin_article_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('publish_status', 'PUBLISHED')
    .gte('published_at', `${date}T00:00:00+09:00`)
    .lt('published_at', `${next}T00:00:00+09:00`);
  if (error) throw error;
  return count || 0;
}

export async function buildDailyManagerSnapshot({
  supabase,
  businessDate = jstDateKey(),
  finalize = false,
  providers = {}
}) {
  if (!validBusinessDate(businessDate)) throw new Error('invalid_date');

  const { data: inputRow, error: inputError } = await supabase
    .from('daily_manager_inputs')
    .select('*')
    .eq('business_date', businessDate)
    .maybeSingle();
  if (inputError) throw inputError;

  const input = normalizeDailyInput(inputRow);
  const sessions = sessionSummary(input);

  const ga4Provider = providers.ga4 || ga4Dataset;
  const searchProviders = providers.search || { anchor: searchAnchor, raw: searchRaw };
  const articleProvider = providers.publishedToday || publishedToday;

  const [ga4Result, gscResult, articleResult] = await Promise.allSettled([
    collectGa4(businessDate, ga4Provider),
    collectGsc7d(searchProviders),
    articleProvider(supabase, businessDate)
  ]);

  const ga4 = ga4Result.status === 'fulfilled' ? ga4Result.value : null;
  const gsc = gscResult.status === 'fulfilled' ? gscResult.value : null;
  const articleCount = articleResult.status === 'fulfilled' ? articleResult.value : null;

  const base = {
    business_date: businessDate,
    snapshot_status: finalize ? 'FINAL' : 'PRELIMINARY',
    generated_at: new Date().toISOString(),
    finalized_at: finalize ? new Date().toISOString() : null,
    planned_sessions: input.planned_sessions,
    cancel_count: input.cancel_count,
    same_day_additions: input.same_day_additions,
    actual_sessions: input.actual_sessions,
    completed_sessions: sessions.completed,
    session_data_quality: sessions.quality,
    trial_sessions: input.trial_sessions,
    gross_sales_today: null,
    paid_transactions_today: null,
    followup_due_count: null,
    followup_attention_count: null,
    web_sessions: ga4?.sessions ?? null,
    web_active_users: ga4?.activeUsers ?? null,
    web_views: ga4?.views ?? null,
    web_engagement_rate: ga4?.engagementRate ?? null,
    organic_sessions: ga4?.organicSessions ?? null,
    organic_social_sessions: ga4?.organicSocialSessions ?? null,
    ai_assistant_sessions: ga4?.aiAssistantSessions ?? null,
    reserve_click: ga4?.reserveClick ?? null,
    line_click: ga4?.lineClick ?? null,
    price_click: ga4?.priceClick ?? null,
    article_cta_click: ga4?.articleCtaClick ?? null,
    high_intent_events: ga4 ? ga4.reserveClick + ga4.lineClick : null,
    consideration_events: ga4 ? ga4.priceClick + ga4.articleCtaClick : null,
    gsc_settled_through: gsc?.settledThrough ?? null,
    gsc_clicks_7d: gsc?.clicks ?? null,
    gsc_impressions_7d: gsc?.impressions ?? null,
    published_articles_today: articleCount,
    data_quality: {
      session_input: sessions.quality,
      sales: 'UNMEASURED_GYMS_EXTERNAL',
      customer_followup: 'WEEKLY_SOURCE_ONLY',
      ga4: ga4 ? 'VALUE_PARTIAL_DAY' : 'ERROR',
      gsc: gsc ? 'VALUE_SETTLED' : 'ERROR',
      editorial: articleCount === null ? 'ERROR' : 'VALUE'
    },
    updated_at: new Date().toISOString()
  };

  const assessment = buildManagerAssessment(base);
  const snapshot = { ...base, ...assessment };

  const { data, error } = await supabase
    .from('daily_manager_snapshots')
    .upsert(snapshot, { onConflict: 'business_date' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
