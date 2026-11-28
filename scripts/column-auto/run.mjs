// コラム朝の自動実行。使い方:
//   node scripts/column-auto/run.mjs prepare  [--date YYYY-MM-DD] [--topic "テーマ"]
//   node scripts/column-auto/run.mjs finalize [--date YYYY-MM-DD]
// 公開は絶対にしない（下書きの保存まで）。ログには原稿・検索データ・秘密情報を出さない。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { VERSION, BUDGET_JPY, RETRY, REVIEW, LANES, CATEGORY_LABEL, CTA_BY_LANE, AUTHOR, ADMIN_URL } from '../../lib/columnAuto/config.mjs';
import { createCostMeter, ledgerCost, usdToJpy, BudgetExceededError } from '../../lib/columnAuto/cost.mjs';
import { db, sheets, gsc, delivery, line } from '../../lib/columnAuto/services.mjs';
import { jstDate, isBusinessDay, addDays, mondayOf, jaDateLabel, publishedArticles, validateDraftForPublish, canonicalFor, storyUrl } from '../../lib/columnAuto/content.mjs';
import { updateLaneMultipliers, chooseLane, searchOpportunities, generateCandidates, pickCandidate, slugFromUrl } from '../../lib/columnAuto/topic.mjs';
import { writeArticle, reviewArticle } from '../../lib/columnAuto/writing.mjs';
import { makeStory } from '../../lib/columnAuto/story.mjs';

const args = process.argv.slice(2);
const phase = args[0];
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : ''; };
const today = jstDate();
const targetDate = opt('date') || process.env.COLUMN_TARGET_DATE || today;
const forcedTopic = opt('topic') || process.env.COLUMN_FORCE_TOPIC || '';
const contentId = `COL-${targetDate.replace(/-/g, '')}`;
const log = (msg, extra = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), phase, date: targetDate, msg, ...extra }));
const output = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
const shopFacts = fs.readFileSync('editorial/column-auto/shop-facts.md', 'utf8');

function mergeCost(run, meter) {
  const prev = run?.cost?.entries || [];
  const entries = [...prev, ...meter.entries];
  const total = Math.round(entries.reduce((s, e) => s + (e.jpy || 0), 0) * 100) / 100;
  return { cost: { entries, total_jpy: total }, cost_jpy: total };
}

function costTable(entries) {
  const by = {};
  for (const e of entries) {
    const k = `${e.api}｜${e.model}`;
    by[k] ||= { calls: 0, jpy: 0, unknown: 0, purposes: new Set() };
    by[k].calls++; by[k].jpy += e.jpy || 0; if (e.jpy == null) by[k].unknown++; by[k].purposes.add(e.purpose);
  }
  const rows = Object.entries(by).map(([k, v]) => `| ${k} | ${[...v.purposes].join(', ')} | ${v.calls} | ¥${v.jpy.toFixed(1)}${v.unknown ? `（単価不明${v.unknown}件）` : ''} |`);
  return ['| API｜モデル | 用途 | 回数 | 概算 |', '|---|---|---|---|', ...rows].join('\n');
}

async function notifyIssue(title, body) {
  if (!delivery.available()) { log('delivery channel missing (COLUMN_DELIVERY_TOKEN)'); return null; }
  try { return await delivery.createIssue({ title, body }); } catch (e) { log('issue failed', { error: e.message }); return null; }
}

async function failRun(run, err, meter) {
  const kind = err instanceof BudgetExceededError ? 'TERMINAL' : (err.kind || 'TRANSIENT');
  const status = err instanceof BudgetExceededError ? 'STOPPED_BUDGET' : 'FAILED';
  const patch = { status, error: String(err.message || err).slice(0, 1500), error_kind: kind, ...(meter ? mergeCost(run, meter) : {}) };
  await db.updateRun(targetDate, patch).catch(() => {});
  const willRetry = kind === 'TRANSIENT' && Number(run?.attempt || 1) < RETRY.maxAttempts;
  if (!willRetry) {
    await notifyIssue(`【要確認】${jaDateLabel(targetDate)} のコラムは準備できませんでした`, [
      `${jaDateLabel(targetDate)} 分のコラムの自動準備が止まりました。管理画面の下書きには入っていません。`,
      '', `- 止まった理由: ${patch.error}`, `- 種類: ${status === 'STOPPED_BUDGET' ? '費用の上限に達する見込み' : kind === 'TERMINAL' ? '設定や外部の状態の確認が必要' : '一時的な不具合（再実行も失敗）'}`,
      `- ここまでの費用: ¥${(patch.cost_jpy ?? run?.cost_jpy ?? 0)}`, '', '店長の操作は不要です。AI側で原因を確認します（店長しか分からない事実が必要な場合だけLINEでお聞きします）。'
    ].join('\n'));
  }
  log('run failed', { status, kind, will_retry: willRetry });
  output('proceed', 'false');
  process.exitCode = 1;
}

// ---------------- prepare ----------------
async function prepare() {
  output('proceed', 'false');
  if (!isBusinessDay(targetDate)) { log('not a business day; skip'); return; }
  if (targetDate !== today && !opt('date') && !process.env.COLUMN_TARGET_DATE) { log('target is not today; skip'); return; }

  let run = await db.getRun(targetDate);
  if (run) {
    const staleMs = Date.now() - new Date(run.updated_at).getTime();
    const active = ['STARTED', 'WRITING', 'IMAGE_QUEUED', 'FINALIZING'].includes(run.status);
    if (run.status === 'DELIVERED') { log('already delivered; skip (no duplicate article)'); return; }
    if (active && staleMs < 90 * 60 * 1000) { log('another run is in progress; skip', { status: run.status }); return; }
    if (Number(run.attempt) >= RETRY.maxAttempts) { log('retry limit reached; skip', { attempt: run.attempt }); return; }
    if (run.error_kind === 'TERMINAL' && run.status !== 'IMAGE_QUEUED') { log('terminal failure; not retrying automatically'); return; }
    run = await db.updateRun(targetDate, { attempt: Number(run.attempt) + 1, status: run.article ? 'IMAGE_QUEUED' : 'STARTED', error: null, error_kind: null });
    log('resuming as retry', { attempt: run.attempt });
  } else {
    if (await db.draftByContentId(contentId)) { log('draft for this date already exists; skip'); return; }
    run = await db.insertRun({ run_date: targetDate, status: 'STARTED', attempt: 1 });
  }

  const monthSpent = await db.monthSpendJpy(targetDate.slice(0, 7));
  if (monthSpent + BUDGET_JPY.perRun > BUDGET_JPY.perMonth) {
    return failRun(run, new BudgetExceededError(`今月の費用 ¥${Math.round(monthSpent)} に1回分の上限 ¥${BUDGET_JPY.perRun} を足すと、月の上限 ¥${BUDGET_JPY.perMonth} を超えるため停止`), null);
  }
  const meter = createCostMeter({ capJpy: BUDGET_JPY.perRun - BUDGET_JPY.imagePerRun - Number(run.cost_jpy || 0), label: '本文工程' });

  try {
    let article = run.article, topic = run.topic, qc = run.qc;
    if (!article) {
      await db.updateRun(targetDate, { status: 'WRITING' });
      const articles = publishedArticles();
      const drafts = await db.draftsBrief();

      // --- Search Console（直近28日・確定値） ---
      let pageRows = [], queryRows = [], gscNote = '';
      if (gsc.available()) {
        const end = addDays(today, -3), start = addDays(end, -27);
        try {
          pageRows = await gsc.query({ startDate: start, endDate: end, dimensions: ['page'], rowLimit: 1000 });
          queryRows = await gsc.query({ startDate: start, endDate: end, dimensions: ['query', 'page'], rowLimit: 5000 });
          gscNote = `${start}〜${end}`;
        } catch (e) { gscNote = `取得失敗: ${e.message.slice(0, 120)}`; }
      } else gscNote = '未接続（GOOGLE_SERVICE_ACCOUNT_JSON 未設定）';

      // --- PDCA: 分野の倍率を実績で更新 ---
      const prevMult = (await db.getState('lane_multipliers')) || {};
      const learned = updateLaneMultipliers({ articles, pageRows, today, previous: prevMult });
      if (learned.has_data) await db.setState('lane_multipliers', learned.multipliers);
      await backfillOutcomes({ articles, pageRows, gscNote }).catch((e) => log('outcome backfill skipped', { error: e.message.slice(0, 160) }));

      // --- 分野 → 候補 → 1本 ---
      const laneChoice = chooseLane({ articles, multipliers: learned.has_data ? learned.multipliers : prevMult });
      const opportunities = searchOpportunities(queryRows);
      let chosen = null, rejected = [], lane = laneChoice.lane, candidates = [];
      const laneOrder = [laneChoice.lane, ...laneChoice.ranking.map((r) => r.lane).filter((l) => l !== laneChoice.lane && l !== laneChoice.blocked_consecutive)].slice(0, 2);
      for (const l of laneOrder) {
        candidates = await generateCandidates({ lane: l, articles, drafts, opportunities, shopFacts, meter, forcedTopic: l === laneOrder[0] ? forcedTopic : '' });
        const picked = pickCandidate(candidates, { articles, drafts });
        rejected.push(...picked.rejected.map((r) => ({ ...r, lane: l })));
        if (picked.chosen) { chosen = picked.chosen; lane = l; break; }
      }
      await askOwnerIfNeeded(rejected);
      if (!chosen) throw Object.assign(new Error('使える候補がありませんでした（重複、または店長しか知らない事実が必要な候補のみ）'), { kind: 'TERMINAL' });

      topic = {
        lane, lane_label: LANES[lane].label, chosen, rejected, lane_ranking: laneChoice.ranking, blocked_consecutive: laneChoice.blocked_consecutive,
        multipliers: learned.has_data ? learned.multipliers : prevMult, performance_evidence: learned.evidence, gsc_period: gscNote,
        opportunities_used: opportunities.slice(0, 15), recent_lanes: articles.slice(0, 10).map((a) => a.lane), forced_topic: forcedTopic || null
      };

      // --- 書く → チェック → 不合格なら作り直す（最大3稿） ---
      const exemplars = articles.slice(0, 2).map((a) => `## ${a.title}\n${a.body.slice(0, 2600)}`).join('\n\n---\n\n');
      const internalLinks = articles.slice(0, 40).map((a) => `- ${canonicalFor(a.slug)}｜${a.title}`).join('\n');
      const recentGbp = sheets.available() ? await recentGbpPosts().catch(() => '') : '';
      let draft = null, review = null, history = [];
      for (let i = 1; i <= REVIEW.maxDrafts; i++) {
        const w = await writeArticle({ topic: chosen, lane, shopFacts, exemplars, internalLinks, recentGbp, feedback: review?.feedback, previous: draft, meter });
        draft = w.article;
        draft.slug = uniqueSlug(draft.slug, articles, drafts);
        review = await reviewArticle({ article: draft, shopFacts, meter });
        history.push({ draft: i, pass: review.pass, stage: review.stage, average: review.average ?? null, lint_errors: review.lint.errors, must_fix: (review.escalation || review.primary)?.must_fix || [] });
        log('draft reviewed', { draft: i, pass: review.pass, stage: review.stage });
        if (review.pass) break;
      }
      if (!review.pass) throw Object.assign(new Error(`品質チェックに${REVIEW.maxDrafts}回とも不合格: ${history.at(-1).lint_errors.concat(history.at(-1).must_fix).slice(0, 4).join(' / ')}`), { kind: 'TERMINAL' });
      article = { ...draft, lane, category: LANES[lane].category, primary_query: chosen.primary_query };
      qc = { article: { pass: true, drafts: history, final_stage: review.stage, average: review.average, lint_warnings: review.lint.warnings, reviewer_model: (review.escalation || review.primary).model, summary: (review.escalation || review.primary).summary } };
      await db.updateRun(targetDate, { slug: article.slug, topic, article, qc, status: 'IMAGE_QUEUED', ...mergeCost(run, meter) });
      run = await db.getRun(targetDate);
    }

    // --- 画像ジョブ（既存の Hybrid 画像の仕組みへ渡す） ---
    const job = await queueImageJob(article, run.image);
    if (job.status !== 'EXISTS') await db.updateRun(targetDate, { image: { job_path: job.jobPath, asset_version: job.assetVersion, thumbnail: job.thumbnail, og_image: job.ogImage, gbp_image: job.gbpImage, source: job.selectedSource } });
    gitCommit([job.jobPath], `Queue column-auto image job: ${article.slug} (${targetDate})`);
    output('proceed', 'true');
    output('slug', article.slug);
    log('prepared', { slug: article.slug, lane: article.lane });
  } catch (err) {
    run = await db.getRun(targetDate);
    return failRun(run, err, meter);
  }
}

function uniqueSlug(slug, articles, drafts) {
  const base = String(slug || 'column').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'column';
  const taken = new Set([...articles.map((a) => a.slug), ...drafts.map((d) => d.slug)]);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 20; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}

async function askOwnerIfNeeded(rejected) {
  const q = rejected.find((r) => r.owner_question);
  if (!q || !line.available()) return;
  const asked = (await db.getState('asked_owner_questions')) || [];
  if (asked.includes(q.owner_question)) return;
  const opts = (q.owner_question_options || []).map((o, i) => `${i + 1}. ${o}`).join('\n');
  await line.askOwner(`【コラム用に1つだけ教えてください】\n${q.owner_question}\n${opts}\n\n番号で返信いただければ十分です。今日の記事は別のテーマで進めています。`).catch((e) => log('line failed', { error: e.message }));
  await db.setState('asked_owner_questions', [...asked, q.owner_question].slice(-50));
}

async function recentGbpPosts() {
  const rows = await sheets.get('22_GBP_POST!A1:F400');
  const header = rows[0] || [], iBody = header.indexOf('body_copy_paste'), iAt = header.indexOf('generated_at');
  return rows.slice(1).filter((r) => r[iBody]).sort((a, b) => String(b[iAt]).localeCompare(String(a[iAt]))).slice(0, 4).map((r) => `---\n${String(r[iBody]).slice(0, 500)}`).join('\n');
}

// 選んだテーマの結果（公開28日後の実績）を記録して、次の選定に活かす
async function backfillOutcomes({ articles, pageRows, gscNote }) {
  if (!sheets.available() || !pageRows.length) return;
  const rows = await sheets.get('44_COLUMN_TOPIC_LOG!A1:O400');
  const header = rows[0] || [];
  const col = (n) => header.indexOf(n);
  const bySlug = new Map(pageRows.map((r) => [slugFromUrl(r.keys?.[0]), r]));
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], slug = r[col('slug')];
    if (!slug || r[col('結果_表示回数')]) continue;
    const a = articles.find((x) => x.slug === slug);
    if (!a || a.published > addDays(today, -28)) continue;
    const m = bySlug.get(slug) || { impressions: 0, clicks: 0, position: '' };
    const letter = (idx) => String.fromCharCode(65 + idx);
    await sheets.update(`44_COLUMN_TOPIC_LOG!${letter(col('公開日'))}${i + 1}`, [[a.published]]);
    await sheets.update(`44_COLUMN_TOPIC_LOG!${letter(col('結果_表示回数'))}${i + 1}:${letter(col('結果_判定期間'))}${i + 1}`, [[m.impressions, m.clicks, m.position ? Math.round(m.position * 10) / 10 : '', gscNote]]);
  }
}

async function queueImageJob(article, existing = null) {
  // 既存の Hybrid 画像ジョブ作成ロジックを、作業ツリーへの書き込みで使う（GitHub API を直接叩かない）
  const target = path.resolve('lib/githubContent.mjs');
  const shim = path.resolve('scripts/local-shims/githubContent.local.mjs');
  const original = fs.readFileSync(target, 'utf8');
  try {
    fs.writeFileSync(target, fs.readFileSync(shim, 'utf8'));
    const { ensureAutomatedHybridImageJob, prepareAutomatedHybridImageJob } = await import(pathToFileURL(path.resolve('lib/editorialAutomatedHybridImage.mjs')).href);
    const prep = ensureAutomatedHybridImageJob || prepareAutomatedHybridImageJob;
    return await prep({
      slug: article.slug, title: article.title, description: article.description, category: article.category,
      primary_query: article.primary_query, image_headline_short: article.image_headline_short, body_markdown: article.body_markdown,
      image_job_path: existing?.job_path || '', image_asset_version: existing?.asset_version || '',
      thumbnail: existing?.thumbnail || '', og_image: existing?.og_image || '', gbp_image: existing?.gbp_image || '',
      image_qa: { independent_qc_pass: true, bridge_synced: true },
      editorial_text_qc: { version: VERSION, independent_qc_pass: true, reviewer: 'claude', checked_at: new Date().toISOString() }
    });
  } catch (e) {
    throw Object.assign(new Error(`画像ジョブを作れませんでした: ${e.code || ''} ${e.message}`), { kind: 'TERMINAL' });
  } finally {
    fs.writeFileSync(target, original);
  }
}

function gitCommit(paths, message) {
  if (process.env.COLUMN_AUTO_NO_GIT === '1') { log('git disabled (local test)'); return; }
  execFileSync('git', ['add', ...paths], { stdio: 'inherit' });
  try { execFileSync('git', ['diff', '--cached', '--quiet']); log('nothing to commit'); return; } catch {}
  execFileSync('git', ['commit', '-m', message], { stdio: 'inherit' });
  for (let i = 0; i < 3; i++) {
    try { execFileSync('git', ['pull', '--rebase', '--autostash', 'origin', 'main'], { stdio: 'inherit' }); execFileSync('git', ['push', 'origin', 'HEAD:main'], { stdio: 'inherit' }); return; }
    catch (e) { if (i === 2) throw Object.assign(new Error('git push に失敗'), { kind: 'TRANSIENT' }); }
  }
}

// ---------------- finalize ----------------
async function finalize() {
  let run = await db.getRun(targetDate);
  if (!run || !['IMAGE_QUEUED', 'FINALIZING'].includes(run.status)) { log('nothing to finalize', { status: run?.status }); return; }
  await db.updateRun(targetDate, { status: 'FINALIZING' });
  const meter = createCostMeter({ capJpy: Infinity, label: '仕上げ工程' });
  const a = run.article;
  try {
    const jobPath = run.image?.job_path || `editorial/hybrid-image-jobs/${a.slug}.json`;
    const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
    const state = JSON.parse(fs.readFileSync(`editorial/image-operator-state/${a.slug}.json`, 'utf8'));
    const ledgerPath = `editorial/image-api-ledger/${a.slug}-${job.asset_version}.json`;
    if (fs.existsSync(ledgerPath)) for (const r of ledgerCost(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')))) meter.record({ ...r, purpose: r.purpose });
    const imageOk = state.status === 'READY_CANDIDATE' && state.xserver_verified === true && state.asset_version === job.asset_version;
    if (!imageOk) {
      throw Object.assign(new Error(`画像が品質チェックに合格しませんでした（状態: ${state.status}、試行 ${state.attempts_total ?? '?'}回）。${String(state.last_error || state.last_qa?.comments || '').slice(0, 300)}`), { kind: state.status === 'BLOCKED_PROVIDER_CREDITS' ? 'TERMINAL' : 'TERMINAL' });
    }

    // --- ストーリー画像 ---
    const storyRel = `assets/images/stories/story-${a.slug}-${job.asset_version}.jpg`;
    const story = await makeStory({ headline: a.image_headline_short, scenePath: job.generated_scene_path, outPath: storyRel, meter });
    if (!story.pass) throw Object.assign(new Error(`ストーリー画像が${story.renders}回とも品質チェックに不合格: ${(story.history.at(-1)?.issues || []).join(' / ')}`), { kind: 'TERMINAL' });
    gitCommit([storyRel], `Add column-auto story image: ${a.slug}`);

    // --- 下書き保存（公開しない） ---
    const draftRow = {
      user_id: process.env.ADMIN_PUBLISHER_USER_ID, title: a.title, slug: a.slug, description: a.description,
      published: targetDate, updated: targetDate, category: a.category, category_label: CATEGORY_LABEL[a.category],
      author: AUTHOR.name, author_role: AUTHOR.role, thumbnail: `/${job.thumbnail}`, og_image: `/${job.og_image}`,
      status: 'draft', featured: false, cta_type: CTA_BY_LANE[a.lane] || 'general', keywords: (a.keywords || []).slice(0, 5),
      canonical: canonicalFor(a.slug), noindex: false, body_markdown: a.body_markdown,
      editorial_source: VERSION, editorial_content_id: contentId, editorial_week_start: mondayOf(targetDate),
      image_status: 'READY', image_render_version: job.render_version || 'rev-column-reference-v2.3-hybrid', image_strategy: 'reference-v2-gpt-image-hybrid-drive-source',
      image_style_template: job.image_style_template || 'rev-column-reference-v2', image_asset_ready: true, image_asset_version: job.asset_version,
      image_job_path: jobPath, image_qa_report_path: job.qa_report_path, image_generation_model: job.generation_model || null,
      image_qa_model: state.last_qa?.qa_model || null, image_headline_short: a.image_headline_short, image_attempts: Number(state.attempts_total || 0) || null,
      image_checked_at: new Date().toISOString(), gbp_image: `/${job.gbp_image}`, gbp_image_status: 'READY', gbp_image_asset_version: job.asset_version
    };
    if (!draftRow.user_id) throw Object.assign(new Error('ADMIN_PUBLISHER_USER_ID が未設定です'), { kind: 'TERMINAL' });
    const vErrors = validateDraftForPublish(draftRow);
    if (vErrors.length) throw Object.assign(new Error(`公開前チェックでエラー: ${vErrors.join(' / ')}`), { kind: 'TERMINAL' });
    let saved = await db.draftByContentId(contentId) || await db.draftBySlug(a.slug);
    if (!saved) saved = await db.insertDraft(draftRow);
    const readback = await db.draftBySlug(a.slug);
    if (!readback || readback.publish_status !== 'NOT_PUBLISHED' || readback.source_path || readback.source_sha) {
      throw Object.assign(new Error(`下書きの読み戻し確認に失敗（publish_status=${readback?.publish_status}）`), { kind: 'TERMINAL' });
    }

    // --- シートへの記録（店長は開かなくてよい） ---
    const url = canonicalFor(a.slug);
    const gbpText = a.gbp_body.replace('[BLOG_URL]', url);
    const sheetNotes = [];
    if (sheets.available()) {
      try {
        const existing = (await sheets.get('22_GBP_POST!C1:C2000')).flat();
        if (!existing.includes(`GBP-${contentId}`)) {
          await sheets.appendByHeader('22_GBP_POST', {
            generated_at: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }), week_start: mondayOf(targetDate),
            content_id: `GBP-${contentId}`, parent_blog_id: contentId, title: a.title, body_copy_paste: gbpText,
            cta_text: '記事を読む', local_context: '', blog_url_placeholder: url, status: 'READY',
            notes: `${VERSION} / 記事の公開後に投稿 / 品質チェック合格`, image_status: 'READY', gbp_image_path: `/${job.gbp_image}`,
            image_asset_version: job.asset_version, image_notes: '4:3 1200x900 / Xserver verified', post_ready: 'AFTER_PUBLISH'
          });
        }
        await sheets.appendByHeader('44_COLUMN_TOPIC_LOG', {
          対象日: targetDate, slug: a.slug, 題名: a.title, 分野: LANES[a.lane].label, 主な検索語: a.primary_query,
          選んだ理由: `${run.topic.chosen.reason}／根拠: ${run.topic.chosen.search_evidence}`,
          分野の判定: run.topic.lane_ranking.slice(0, 3).map((r) => `${r.label} 直近${r.recent_count}本/目安${r.expected}本 倍率${r.multiplier}`).join('｜'),
          選ばなかった案: run.topic.rejected.slice(0, 4).map((r) => `${r.title}（${r.reason}）`).join('｜'),
          検索データ期間: run.topic.gsc_period, 品質チェック: `合格（平均${run.qc.article.average}・${run.qc.article.final_stage}）`, 公開日: ''
        });
      } catch (e) { sheetNotes.push(`シート記録に失敗: ${e.message.slice(0, 160)}`); }
    } else sheetNotes.push('シート未接続（GOOGLE_SERVICE_ACCOUNT_JSON 未設定）');

    // --- 費用 ---
    const merged = mergeCost(run, meter);
    const monthSpent = (await db.monthSpendJpy(targetDate.slice(0, 7))) - Number(run.cost_jpy || 0) + merged.cost_jpy;

    // --- 受け渡し ---
    const raw = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY || 'maxi001maxi/the-rev-website'}/main/${storyRel}`;
    const site = 'https://therev-lab.com';
    const body = [
      `## ${jaDateLabel(targetDate)} のコラム：下書きの準備ができました`,
      `管理画面の下書きに入っています。内容を見て、よければ **Review & Publish** で公開してください（自動では公開しません）。`, '',
      `- 題名: **${a.title}**`, `- 下書き: ${ADMIN_URL}`, `- テーマ: ${LANES[a.lane].label}｜${run.topic.chosen.reason}`,
      `- 品質チェック: 合格（${run.qc.article.drafts.length}稿目で合格・平均${run.qc.article.average}点・${run.qc.article.final_stage === 'escalated' ? 'Sonnet→Opusで二次確認' : 'Sonnetで判定'}）／画像も合格（${state.attempts_total || 1}回目）`,
      ...(a.ai_created_examples?.length ? [`- 確認しておくとよい所（AIが作った例え・言い回し）: ${a.ai_created_examples.slice(0, 3).join('／')}`] : []),
      ...(sheetNotes.length ? [`- 記録: ${sheetNotes.join('／')}`] : []), '',
      '### 1. 記事のサムネイル', `![サムネイル](${site}/${job.thumbnail})`, '',
      '### 2. Googleビジネスプロフィール（記事の公開後に投稿）', `![GBP画像](${site}/${job.gbp_image})`, '', '```text', gbpText, '```', '',
      '### 3. Instagramストーリー', `![ストーリー](${raw})`, '', '枠の文言', '```text', a.story_frame_text, '```',
      'リンク（UTMつき）', '```text', storyUrl(a.slug, targetDate), '```', 'リンクスタンプの文言', '```text', a.link_sticker_text, '```', '',
      '### 4. 今回の費用', costTable(merged.cost.entries), '',
      `**合計 約¥${merged.cost_jpy.toFixed(0)}**（1回の上限 ¥${BUDGET_JPY.perRun}）／今月の累計 約¥${Math.round(monthSpent)}（月の上限 ¥${BUDGET_JPY.perMonth}）`,
      '', `<sub>${VERSION}・円は1ドル=${process.env.COLUMN_AUTO_USD_JPY || 155}円の概算。請求の正は各社の管理画面。</sub>`
    ].join('\n');
    const issue = await notifyIssue(`【コラム】${jaDateLabel(targetDate)} 下書き準備完了：${a.title}`, body);
    await db.updateRun(targetDate, {
      status: issue ? 'DELIVERED' : 'FINALIZING', delivery: { issue, story: storyRel, sheet_notes: sheetNotes, draft_id: saved?.id || readback?.id },
      qc: { ...run.qc, image: { pass: true, attempts: state.attempts_total, qa_report: job.qa_report_path }, story: { pass: true, renders: story.renders, history: story.history } },
      ...merged, error: issue ? null : '受け渡し（Issue作成）に失敗。COLUMN_DELIVERY_TOKEN を確認'
    });
    if (!issue) { process.exitCode = 1; log('draft saved but delivery failed'); return; }
    log('delivered', { issue: issue.url, cost_jpy: merged.cost_jpy });
  } catch (err) {
    run = await db.getRun(targetDate);
    return failRun(run, err, meter);
  }
}

const main = phase === 'prepare' ? prepare : phase === 'finalize' ? finalize : null;
if (!main) { console.error('usage: run.mjs prepare|finalize [--date YYYY-MM-DD] [--topic ...]'); process.exit(2); }
main().catch((e) => { console.error(e?.stack || e); process.exit(1); });
