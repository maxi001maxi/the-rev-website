import { collectGithubMaterialChanges } from '../../lib/companyTimelineGithubCollector.mjs';
import { collectArticleHistory } from '../../lib/editorialArticleHistory.mjs';
import { syncDirectGa4ToCompanyOs } from '../../lib/ga4CompanyOsSync.mjs';
import { syncDirectGscToCompanyOs } from '../../lib/gscCompanyOsSync.mjs';
import { probeGscDirect } from '../../lib/gscDirect.mjs';
// GET /api/integrations/editorial-status?content_id={id}
// Server-to-server status probe for THE REV. Editorial AI.
// It never publishes. It only checks whether Phase 10 image assets are ready,
// updates the Supabase draft image readiness fields, and returns Review URLs.
//
// POST /api/integrations/editorial-status  { "action": "daily_plan" | "daily_create", "rows": [...] }
// Deterministic Daily Editorial gate and Creator for the GAS scheduler.
//   daily_plan   : reconciles publication evidence for the supplied
//                  26_DAILY_EDITORIAL_QUEUE rows and returns Queue patches plus
//                  today's creation decision.
//   daily_create : daily_plan + deterministic topic selection from the supplied
//                  23_BLOG_TOPIC_SHORTLIST rows; returns the exact Queue row to
//                  append, stuck-row findings and shortlist pool health.
// Neither action writes Sheets or publishes.

import { createClient } from '@supabase/supabase-js';
import {
  BRIDGE_SOURCE,
  bridgeConfig,
  extractBearerSecret,
  originFromRequest,
  safeSecretEqual
} from '../../lib/editorialBridge.mjs';
import { checkEditorialImageOperatorState, checkEditorialImageReady } from '../../lib/editorialImage.mjs';
import { ensureAutomatedHybridImageJob } from '../../lib/editorialAutomatedHybridImage.mjs';
import { PUBLISH_STATUS } from '../../lib/editorialPublication.mjs';
import { reconcilePublication } from '../../lib/editorialPublicationStatus.mjs';
import { planDailyEditorial } from '../../lib/dailyEditorialStateMachine.mjs';
import { detectStuckRows, planDailyCreation } from '../../lib/dailyEditorialCreator.mjs';
import { autoPublishGate } from '../../lib/editorialAutoPublishGate.mjs';
import lineEditorialWebhook from '../../lib/editorialLineWebhook.mjs';
import { topicResponse } from '../../lib/editorialTopicApi.mjs';
import { socialBridgeResponse } from '../../lib/socialBridgeApi.mjs';
import crypto from 'node:crypto';

const DAILY_PLAN_MAX_ROWS = 500;
const DAILY_SHORTLIST_MAX_ROWS = 200;
const DAILY_PLAN_MAX_RECONCILE = 10;

export const config = { api: { bodyParser: false }, maxDuration: 300 };

export function topicStuckFindings(body = {}) {
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, DAILY_PLAN_MAX_ROWS) : [];
  const parsedNow = body.now ? new Date(body.now) : new Date();
  const now = Number.isNaN(parsedNow.getTime()) ? new Date() : parsedNow;
  const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};
  return detectStuckRows({ rows, now, settings });
}


export async function readEditorialJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const parts = []; let length = 0;
  for await (const part of req) {
    const buffer = Buffer.from(part); length += buffer.length;
    if (length > 2 * 1024 * 1024) throw new Error('EDITORIAL_BODY_TOO_LARGE');
    parts.push(buffer);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

export default async function handler(req, res) {
  if (req.query?.mode === 'company_timeline_github_cron') {
    const secret=String(process.env.CRON_SECRET||'');
    const auth=String(req.headers?.authorization||'');
    if(!secret||auth!==`Bearer ${secret}`) {
      return res.status(401).json({error:'unauthorized'});
    }
    try {
      const result=await collectGithubMaterialChanges();
      res.setHeader('Cache-Control','no-store');
      return res.status(result.ok?200:502).json(result);
    } catch(e) {
      return res.status(500).json({ok:false,error:String(e?.message||e)});
    }
  }
  if (req.query?.mode === 'company_os_gsc_bootstrap_probe') {
    const supplied=String(req.query?.token||'');
    const suppliedHash=crypto.createHash('sha256').update(supplied).digest('hex');
    const expectedHash='a1651817ba3ece755d6a24c64eeee911ab035908b823133768b910b4921b04aa';
    if(!supplied||suppliedHash!==expectedHash)return res.status(401).json({ok:false,error:'unauthorized'});
    const raw=process.env.GOOGLE_READONLY_SERVICE_ACCOUNT_JSON||process.env.GA4_SERVICE_ACCOUNT_JSON;
    try{
      const result=await probeGscDirect({serviceAccountRaw:raw});
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json(result);
    }catch(error){
      console.error('[gsc-direct-probe]',error?.code||'error',error?.status||0,error?.message||'');
      res.setHeader('Cache-Control','no-store');
      return res.status(error?.status===403?403:502).json({
        ok:false,
        error:error?.code||'gsc_direct_probe_failed',
        status:error?.status||0,
        message:String(error?.message||'Google Search Console direct probe failed.').slice(0,300)
      });
    }
  }

  if (req.query?.mode === 'company_os_ga4_bootstrap_once') {
    const supplied = String(req.headers?.['x-ga4-bootstrap-token'] || '');
    const suppliedHash = crypto.createHash('sha256').update(supplied).digest('hex');
    const expectedHash = 'a6810d2d015f990da9f64cb0ae0f4b43bb46908994c3048fe5bc97fd03c31412';
    if (!supplied || suppliedHash !== expectedHash) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!String(process.env.SUPABASE_URL || '').trim() || !String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
      return res.status(503).json({ ok: false, error: 'company_os_supabase_not_configured' });
    }
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const existing = await supabase
      .from('company_os_ga4_daily_metrics')
      .select('*', { count: 'exact', head: true });
    if (existing.error) return res.status(502).json({ ok: false, error: 'ga4_bootstrap_count_failed' });
    if ((existing.count || 0) > 0) {
      return res.status(409).json({ ok: false, error: 'ga4_bootstrap_already_completed', rows: existing.count });
    }
    const result = await syncDirectGa4ToCompanyOs({ supabase });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.status || (result.ok ? 200 : 502)).json({
      ok: Boolean(result.ok),
      provider: result.provider || 'google-analytics-data-api-direct',
      rowsUpserted: result.rowsUpserted || 0,
      minDate: result.minDate || null,
      maxDate: result.maxDate || null,
      observedAt: result.observedAt || null,
      error: result.error || null
    });
  }
  if (req.query?.mode === 'company_os_gsc_cron') {
    const secret=String(process.env.CRON_SECRET||'');
    const auth=String(req.headers?.authorization||'');
    if(!secret||auth!==`Bearer ${secret}`)return res.status(401).json({error:'unauthorized'});
    if(!String(process.env.SUPABASE_URL||'').trim()||!String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim()){
      return res.status(503).json({ok:false,error:'company_os_supabase_not_configured'});
    }
    const supabase=createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {auth:{persistSession:false,autoRefreshToken:false}}
    );
    const result=await syncDirectGscToCompanyOs({supabase});
    res.setHeader('Cache-Control','no-store');
    return res.status(result.status||(result.ok?200:502)).json(result);
  }

  if (req.query?.mode === 'company_os_ga4_cron') {
    const secret = String(process.env.CRON_SECRET || '');
    const auth = String(req.headers?.authorization || '');
    if (!secret || auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!String(process.env.SUPABASE_URL || '').trim() || !String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
      return res.status(503).json({ ok: false, error: 'company_os_supabase_not_configured' });
    }
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const result = await syncDirectGa4ToCompanyOs({ supabase });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.status || (result.ok ? 200 : 502)).json(result);
  }
  // Same Vercel function, separate authentication. LINE needs untouched bytes;
  // all existing Bridge operations still require the existing Bearer secret.
  if (req.query?.mode === 'line_webhook') return lineEditorialWebhook(req, res);
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed', message: 'GET / POSTのみサポートしています。' });
  }

  const cfg = bridgeConfig();
  if (!cfg.configured) {
    return res.status(503).json({
      error: 'bridge_not_configured',
      message: `Editorial Bridgeの環境変数が不足しています: ${cfg.missing.join(', ')}`
    });
  }

  const suppliedSecret = extractBearerSecret(req);
  if (!safeSecretEqual(suppliedSecret, process.env.EDITORIAL_BRIDGE_SECRET)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Editorial Bridgeの認証に失敗しました。' });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await readEditorialJson(req); }
    catch (e) { return res.status(e.message === 'EDITORIAL_BODY_TOO_LARGE' ? 413 : 400).json({error:'invalid_request_body'}); }
    if (/^topic_(prepare|poll|choose|answer|notification_ack|queue_ack)$/.test(body.action || '')) {
      const supabase = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
      try {
        const payload = await topicResponse({...body,action:body.action.slice(6)},supabase);
        const stuck = topicStuckFindings(body);
        res.setHeader('Cache-Control','no-store');
        return res.status(200).json({ok:true,...payload,stuck,capabilities:{
          line_receiver_configured:Boolean(process.env.THE_REV_LINE_CHANNEL_SECRET && process.env.THE_REV_LINE_USER_ID),
          line_owner_fingerprint:process.env.THE_REV_LINE_USER_ID ? crypto.createHash('sha256').update(process.env.THE_REV_LINE_USER_ID).digest('hex') : null
        }});
      } catch(e) { return res.status(/DB_|UNAVAILABLE|FAILED/.test(e.message) ? 502 : 422).json({error:e.message}); }
    }
    if (/^social_(history_(upsert|list)|candidates_(prepare|poll|choose|notification_ack)|production_(finalize|event)|publication_link|learning_(upsert|list|context)|stories_(prepare|list)|story_(created|publication_link)|customer_signals_(ingest|list)|threads_(prepare|poll|choose|list|publication_link|context))$/.test(body.action || '')) {
      const supabase = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
      try {
        const payload = await socialBridgeResponse({body,supabase});
        res.setHeader('Cache-Control','no-store');
        return res.status(200).json(payload);
      } catch(e) {
        const message=String(e?.message||e||'SOCIAL_BRIDGE_FAILED');
        return res.status(/READ_FAILED|UPSERT_FAILED|INSERT_FAILED|SELECT_FAILED|RESET_FAILED/.test(message)?502:422).json({error:message});
      }
    }
    return handleDailyPlan(req, res, body);
  }

  const contentId = String(req.query?.content_id || '').trim();
  if (!contentId) {
    return res.status(400).json({ error: 'bad_request', message: 'content_id は必須です。' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const found = await supabase
    .from('admin_article_drafts')
    .select('*')
    .eq('editorial_source', BRIDGE_SOURCE)
    .eq('editorial_content_id', contentId)
    .maybeSingle();

  if (found.error) {
    return res.status(500).json({ error: 'db_error', message: 'Draftの確認に失敗しました。' });
  }
  if (!found.data) {
    return res.status(404).json({ error: 'not_found', message: '対象Draftが見つかりません。' });
  }

  let article = found.data;
  let readiness = null;
  let operator = null;

  // Publication evidence is independent of image readiness. Reconcile it first
  // so an image probe failure can never hide a verified production publish.
  const publication = await reconcilePublication({ supabase, article });
  if (publication.article) article = publication.article;

  try {
    // Self-heal legacy PREPARING drafts created before the unattended Hybrid
    // operator existed. A planned path string alone is not a GitHub Job.
    if (
      String(article.image_status || '').toUpperCase() === 'PREPARING' &&
      String(article.image_strategy || '') === 'reference-v2-gpt-image-hybrid-drive-source' &&
      (
        !String(article.image_asset_version || '').trim() ||
        !String(article.thumbnail || '').trim() ||
        !String(article.og_image || '').trim()
      )
    ) {
      const planned = await ensureAutomatedHybridImageJob(article);
      if (planned?.status !== 'EXISTS') {
        const plannedUpdate = await supabase
          .from('admin_article_drafts')
          .update({
            thumbnail: planned.thumbnail || article.thumbnail || null,
            og_image: planned.ogImage || article.og_image || null,
            gbp_image: planned.gbpImage || article.gbp_image || null,
            gbp_image_status: planned.gbpImage ? 'PREPARING' : (article.gbp_image_status || null),
            gbp_image_asset_version: planned.gbpImageAssetVersion || article.gbp_image_asset_version || null,
            gbp_image_checked_at: new Date().toISOString(),
            gbp_image_last_error: null,
            image_status: 'PREPARING',
            image_asset_ready: false,
            image_render_version: planned.renderVersion || article.image_render_version,
            image_strategy: planned.strategy || article.image_strategy,
            image_source_path: planned.sourcePath || article.image_source_path,
            image_checked_at: new Date().toISOString(),
            image_style_template: planned.styleTemplate || article.image_style_template,
            image_headline_short: planned.imageHeadlineShort || article.image_headline_short,
            image_category_label: planned.categoryLabel || article.image_category_label,
            image_series_label: planned.seriesLabel || article.image_series_label,
            image_asset_version: planned.assetVersion || article.image_asset_version,
            image_job_path: planned.jobPath || article.image_job_path,
            image_qa_report_path: planned.qaReportPath || article.image_qa_report_path,
            image_generation_model: planned.generationModel || article.image_generation_model,
            image_qa_model: planned.qaModel || article.image_qa_model,
            image_last_error: null
          })
          .eq('id', article.id)
          .select('*')
          .single();

        if (plannedUpdate.error) {
          throw new Error('Automated Hybrid image planのDraft反映に失敗しました。');
        }
        article = plannedUpdate.data;
      }
    }

    operator = await checkEditorialImageOperatorState(article);

    if (operator?.matched === true && operator?.blocking === true) {
      const blockedStatus = operator.state === 'BLOCKED' ? 'BLOCKED' : 'ERROR';
      const operatorMessage = [
        'IMAGE_OPERATOR_' + String(operator.status || operator.state || 'BLOCKED'),
        operator.code ? 'code=' + operator.code : '',
        operator.last_error || ''
      ].filter(Boolean).join(' / ').slice(0, 1000);
      const operatorUpdate = await supabase
        .from('admin_article_drafts')
        .update({
          image_status: blockedStatus,
          image_asset_ready: false,
          image_checked_at: new Date().toISOString(),
          image_attempts: operator.attempts_total,
          image_last_error: operatorMessage,
          gbp_image_status: article.gbp_image_asset_version ? blockedStatus : article.gbp_image_status,
          gbp_image_checked_at: article.gbp_image_asset_version ? new Date().toISOString() : article.gbp_image_checked_at,
          gbp_image_attempts: article.gbp_image_asset_version ? operator.attempts_total : article.gbp_image_attempts,
          gbp_image_last_error: article.gbp_image_asset_version ? operatorMessage : article.gbp_image_last_error
        })
        .eq('id', article.id)
        .select('*')
        .single();

      if (!operatorUpdate.error && operatorUpdate.data) article = operatorUpdate.data;
      readiness = { ready: false, reason: 'image_operator_' + String(operator.state || 'blocked').toLowerCase() };
    } else {
      readiness = await checkEditorialImageReady(article);
    }

    if (readiness.ready) {
      const updated = await supabase
        .from('admin_article_drafts')
        .update({
          image_status: 'READY',
          image_asset_ready: true,
          image_checked_at: new Date().toISOString(),
          image_qa: readiness.qa,
          gbp_image_status: article.gbp_image_asset_version ? 'READY' : (article.gbp_image_status || null),
          gbp_image_checked_at: article.gbp_image_asset_version ? new Date().toISOString() : article.gbp_image_checked_at,
          gbp_image_qa: article.gbp_image_asset_version ? {
            pass: readiness.qa?.gbp_aspect_ratio_pass === true && readiness.qa?.gbp_safe_area_pass === true && readiness.qa?.gbp_copy_legible === true,
            aspect_ratio_pass: readiness.qa?.gbp_aspect_ratio_pass === true,
            safe_area_pass: readiness.qa?.gbp_safe_area_pass === true,
            copy_legible: readiness.qa?.gbp_copy_legible === true,
            width: readiness.qa?.gbp_image_width ?? 1200,
            height: readiness.qa?.gbp_image_height ?? 900,
            ratio: readiness.qa?.gbp_image_aspect_ratio || '4:3'
          } : article.gbp_image_qa,
          gbp_image_attempts: article.gbp_image_asset_version ? (article.gbp_image_attempts ?? article.image_attempts ?? 1) : article.gbp_image_attempts,
          gbp_image_last_error: null,
          image_brand_qa_score: Math.min(
            Number(readiness.qa?.series_consistency ?? 0),
            Number(readiness.qa?.article_visual_relevance ?? readiness.qa?.series_consistency ?? 0)
          ) || null,
          image_last_error: null
        })
        .eq('id', article.id)
        .select('*')
        .single();

      if (updated.error) {
        return res.status(500).json({ error: 'db_error', message: '画像READY状態の保存に失敗しました。' });
      }
      article = updated.data;
    } else if (!(operator?.matched === true && operator?.blocking === true)) {
      const updated = await supabase
        .from('admin_article_drafts')
        .update({
          image_status: 'PREPARING',
          image_asset_ready: false,
          image_checked_at: new Date().toISOString(),
          image_last_error: null,
          gbp_image_status: article.gbp_image_asset_version ? 'PREPARING' : article.gbp_image_status,
          gbp_image_checked_at: article.gbp_image_asset_version ? new Date().toISOString() : article.gbp_image_checked_at,
          gbp_image_last_error: null
        })
        .eq('id', article.id)
        .select('*')
        .single();

      if (!updated.error && updated.data) article = updated.data;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown image status error';
    await supabase
      .from('admin_article_drafts')
      .update({
        image_status: 'ERROR',
        image_asset_ready: false,
        image_checked_at: new Date().toISOString(),
        image_last_error: String(message).slice(0, 1000),
        gbp_image_status: article.gbp_image_asset_version ? 'ERROR' : article.gbp_image_status,
        gbp_image_checked_at: article.gbp_image_asset_version ? new Date().toISOString() : article.gbp_image_checked_at,
        gbp_image_last_error: article.gbp_image_asset_version ? String(message).slice(0, 1000) : article.gbp_image_last_error
      })
      .eq('id', article.id);

    return res.status(502).json({
      error: 'image_status_failed',
      message: '画像準備状況の確認に失敗しました。',
      publication
    });
  }

  const origin = originFromRequest(req);
  res.setHeader('Cache-Control', 'no-store');

  return res.status(200).json({
    ok: true,
    content_id: contentId,
    article: {
      id: article.id,
      title: article.title,
      slug: article.slug,
      image_status: article.image_status || null,
      image_asset_ready: article.image_asset_ready === true,
      image_brand_qa_score: article.image_brand_qa_score ?? null,
      image_asset_version: article.image_asset_version || null,
      image_updated_at: article.image_checked_at || article.editorial_synced_at || null,
      image_render_version: article.image_render_version || null,
      image_strategy: article.image_strategy || null,
      image_style_template: article.image_style_template || null,
      image_headline_short: article.image_headline_short || null,
      image_qa: article.image_qa || null,
      image_attempts: article.image_attempts ?? null,
      image_last_error: article.image_last_error || null,
      thumbnail: article.thumbnail || null,
      og_image: article.og_image || null,
      gbp_image: article.gbp_image || null,
      gbp_image_status: article.gbp_image_status || null,
      gbp_image_asset_version: article.gbp_image_asset_version || null,
      gbp_image_checked_at: article.gbp_image_checked_at || null,
      gbp_image_qa: article.gbp_image_qa || null,
      gbp_image_attempts: article.gbp_image_attempts ?? null,
      gbp_image_last_error: article.gbp_image_last_error || null,
      publish_status: article.publish_status || PUBLISH_STATUS.NOT_PUBLISHED,
      publish_commit_sha: article.publish_commit_sha || null,
      published_content_sha: article.published_content_sha || null,
      published_url: article.published_url || null,
      publish_committed_at: article.publish_committed_at || null,
      published_at: article.published_at || null,
      publish_verified_at: article.publish_verified_at || null
    },
    publication,
    operator,
    readiness: {
      ready: readiness?.ready === true,
      reason: readiness?.reason || null
    },
    review_url: origin
      ? `${origin}/admin/articles/review/?id=${encodeURIComponent(article.id)}`
      : null,
    editor_url: origin
      ? `${origin}/admin/articles/editor/?id=${encodeURIComponent(article.id)}`
      : null,
    publish_requires_human_approval: true
  });
}

async function handleDailyPlan(req, res, parsedBody) {
  const body = parsedBody || (typeof req.body === 'string' ? safeParse(req.body) : (req.body || {}));
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const result = await buildDailyResponse({ body, supabase });
  if (result.error) {
    return res.status(result.status).json({ error: result.error, message: result.message });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result.payload);
}

// Shared by the HTTP handler and the integration tests. `supabase` and
// `reconcileFn` are injectable so the full evidence -> plan -> creation path is
// testable without network access.
export async function buildDailyResponse({ body = {}, supabase, reconcileFn = reconcilePublication, historyCollector = collectArticleHistory }) {
  const invalid = validateDailyBody(body);
  if (invalid) return invalid;

  const evidence = await collectPublicationEvidence({
    supabase,
    rows: body.rows.slice(0, DAILY_PLAN_MAX_ROWS),
    reconcileFn
  });
  if (evidence.error) {
    return { error: evidence.error, status: 502, message: 'Supabaseの公開状態を取得できませんでした。' };
  }
  if (body.action === 'daily_create') {
    if (!Array.isArray(body.outputRows)) return {error:'sheet_article_history_missing',status:422,
      message:'21_WEB_BLOG_OUTPUT全件のoutputRowsが必要です。GAS installed sourceを更新してください。'};
    try { body = {...body, articleHistory: await historyCollector({supabase})}; }
    catch { return {error:'article_history_unavailable',status:502,message:'全記事履歴を確認できないため候補選定を停止しました。'}; }
  }
  return { payload: computeDailyPayload({ body, evidenceByContentId: evidence.byContentId, checked: evidence.checked }) };
}

function validateDailyBody(body) {
  const action = body?.action;
  if (action !== 'daily_plan' && action !== 'daily_create') {
    return { error: 'bad_request', status: 400, message: 'action=daily_plan または daily_create が必要です。' };
  }
  if (!Array.isArray(body.rows)) return { error: 'bad_request', status: 400, message: 'rows は配列で指定してください。' };
  if (body.rows.length > DAILY_PLAN_MAX_ROWS) return {error:'queue_history_limit_exceeded',status:422,
    message:'Queue履歴を切り捨てて選定しません。全件読取の上限を更新してください。'};
  if (action === 'daily_create' && !Array.isArray(body.shortlist)) {
    return { error: 'bad_request', status: 400, message: 'shortlist は配列で指定してください。' };
  }
  return null;
}

// Pure and synchronous: Gate + Creator for an already-validated request.
export function computeDailyPayload({ body, evidenceByContentId = {}, checked = [] }) {
  const rows = body.rows.slice(0, DAILY_PLAN_MAX_ROWS);
  const parsedNow = body.now ? new Date(body.now) : new Date();
  const now = Number.isNaN(parsedNow.getTime()) ? new Date() : parsedNow;
  const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};

  // Informational only: nothing in this API publishes. Reported so the
  // scheduler log always shows which Safety Gate keeps Final Publish human.
  const publishGate = autoPublishGate({ settings });

  if (body.action === 'daily_plan') {
    const plan = planDailyEditorial({ rows, now, settings, evidenceByContentId });
    return { ok: true, plan, publish_gate: publishGate, evidence_checked: checked, publish_requires_human_approval: !publishGate.allowed };
  }

  const { plan, creation, stuck } = planDailyCreation({
    rows,
    shortlist: body.shortlist.slice(0, DAILY_SHORTLIST_MAX_ROWS),
    articleHistory: body.articleHistory || [],
    outputRows: body.outputRows || [],
    now,
    settings,
    evidenceByContentId
  });
  return { ok: true, plan, creation, stuck, publish_gate: publishGate, evidence_checked: checked, publish_requires_human_approval: !publishGate.allowed };
}

// Loads Supabase publication evidence for non-terminal Queue rows. Drafts that
// were already committed by Human Publish are re-verified against the exact
// Deploy to Xserver run + production URL before they can count as PUBLISHED.
export async function collectPublicationEvidence({ supabase, rows, reconcileFn = reconcilePublication }) {
  const contentIds = [...new Set(rows
    .filter((row) => !['PUBLISHED', 'SKIPPED'].includes(String(row?.queue_status || '').trim().toUpperCase()))
    .map((row) => String(row?.content_id || '').trim())
    .filter(Boolean))];
  if (!contentIds.length) return { byContentId: {}, checked: [] };

  const found = await supabase
    .from('admin_article_drafts')
    .select('*')
    .eq('editorial_source', BRIDGE_SOURCE)
    .in('editorial_content_id', contentIds);
  if (found.error) return { error: 'db_error' };

  const byContentId = {};
  const checked = [];
  let reconciled = 0;
  for (const draft of found.data || []) {
    let article = draft;
    const state = String(draft.publish_status || PUBLISH_STATUS.NOT_PUBLISHED);
    if (state === PUBLISH_STATUS.PUBLISH_COMMITTED && reconciled < DAILY_PLAN_MAX_RECONCILE) {
      reconciled += 1;
      const publication = await reconcileFn({ supabase, article: draft });
      if (publication.article) article = publication.article;
    }
    byContentId[draft.editorial_content_id] = {
      publish_status: article.publish_status || PUBLISH_STATUS.NOT_PUBLISHED,
      published_url: article.published_url || null,
      publish_verified_at: article.publish_verified_at || null,
      publish_commit_sha: article.publish_commit_sha || null
    };
    checked.push({ content_id: draft.editorial_content_id, publish_status: byContentId[draft.editorial_content_id].publish_status });
  }
  return { byContentId, checked };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
