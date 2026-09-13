// THE REV. — Vercel Preview 実機ビジュアルQA（GitHub Actionsランナー上で実行）
//
// Claude Codeのセッション環境からは *.vercel.app へ到達できないため、実機の
// レンダリング確認はここで行う。実ブラウザ（Playwright Chromium）で
// 390 / 430 / 768 / 1440 の4幅を開き、スクリーンショットと計測値を出す。
//
// Vercel Deployment Protection は x-vercel-protection-bypass ヘッダーで越える
// （値はSecret。このスクリプトはヘッダー値を一切出力しない）。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL?.replace(/\/$/, '');
const BYPASS = process.env.VERCEL_BYPASS_SECRET || '';
const OUT = process.env.OUT_DIR || 'qa-out';
if (!BASE) { console.error('BASE_URL is required'); process.exit(1); }

const VIEWPORTS = [
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '430', width: 430, height: 932, mobile: true },
  { name: '768', width: 768, height: 1024, mobile: false },
  { name: '1440', width: 1440, height: 900, mobile: false }
];
const PAGES = [
  { name: 'blog-index', url: '/blog/' },
  { name: 'training', url: '/blog/personal-training-frequency/' },
  { name: 'boxing', url: '/blog/boxing-beginner-first-step/' },
  { name: 'recovery', url: '/blog/recovery-after-training/' },
  { name: 'formcheck', url: '/blog/self-training-form-check/' }
];

const LITE = process.env.LITE_DIR || 'qa-lite';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile, hasTouch: vp.mobile,
    extraHTTPHeaders: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}
  });

  for (const pg of PAGES) {
    const page = await ctx.newPage();
    const consoleErrors = [], networkFailures = [], badResponses = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    page.on('requestfailed', r => networkFailures.push(`${r.failure()?.errorText} ${r.url().slice(0, 140)}`));
    page.on('response', r => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().slice(0, 140)}`); });

    const resp = await page.goto(BASE + pg.url, { waitUntil: 'load', timeout: 45000 });
    // イントロのローダーが消えるまで待つ（消えない場合も先へ進む）
    await page.waitForFunction(
      () => { const l = document.getElementById('site-loader'); return !l || getComputedStyle(l).display === 'none' || getComputedStyle(l).opacity === '0'; },
      { timeout: 15000}
    ).catch(() => {});
    await page.evaluate(async () => { await document.fonts.ready; });
    // スクロール連動の表示（.reveal）を発火させてから戻す
    await page.evaluate(() => new Promise(r => {
      let y = 0; const t = setInterval(() => {
        window.scrollTo(0, y += 500);
        if (y > document.body.scrollHeight) { clearInterval(t); window.scrollTo(0, 0); r(); }
      }, 30);
    }));
    await page.waitForTimeout(900);

    const m = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      const txt = s => q(s)?.textContent?.replace(/\s+/g, ' ').trim() || null;
      const lineCount = el => {
        const tn = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
        if (!tn) return null;
        const r = document.createRange(); r.selectNodeContents(tn);
        return r.getClientRects().length;
      };
      const de = document.documentElement;
      const overflow = [...document.querySelectorAll('body *')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); })
        .slice(0, 5).map(e => `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]}`);
      const hero = q('.blog-hero-media img');
      const imgs = [...document.querySelectorAll('main img, article img')];
      return {
        docTitle: document.title,
        metaDesc: q('meta[name="description"]')?.content || null,
        canonical: q('link[rel="canonical"]')?.href || null,
        h1: [...document.querySelectorAll('h1')].map(e => e.textContent.trim()),
        h1Lines: q('h1') ? lineCount(q('h1')) : null,
        lead: txt('.blog-article-lead') || txt('.blog-lp-lead'),
        heroImg: hero ? { src: hero.currentSrc || hero.src, alt: hero.alt, w: Math.round(hero.getBoundingClientRect().width), natural: hero.naturalWidth } : null,
        bodyChars: (txt('.blog-body') || '').length,
        headings: [...document.querySelectorAll('.blog-body h2, .blog-body h3')].map(e => e.tagName + ':' + e.textContent.trim().slice(0, 24)),
        imagesBroken: imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.slice(0, 120)),
        imagesTotal: imgs.length,
        cta: [...document.querySelectorAll('.blog-cta-actions > *')].map(a => ({
          text: ([...a.childNodes].find(n => n.nodeType === 3 && n.textContent.trim())?.textContent || '').trim(),
          w: Math.round(a.getBoundingClientRect().width),
          h: Math.round(a.getBoundingClientRect().height),
          lines: lineCount(a)
        })),
        ctaHeadlineLines: q('.blog-cta-headline') ? lineCount(q('.blog-cta-headline')) : null,
        author: txt('.blog-author') ? txt('.blog-author').slice(0, 80) : null,
        related: [...document.querySelectorAll('.blog-related-card')].map(c => c.querySelector('h3')?.textContent.trim()),
        footerLinks: document.querySelectorAll('footer a, .site-footer a').length,
        stickyCta: !!q('.fixed-cta, .sp-fixed-cta, [class*="fixed-cta"]'),
        horizontalOverflow: de.scrollWidth > de.clientWidth + 1,
        overflowElems: overflow,
        scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
        fontsLoaded: document.fonts.size,
        renderedFont: q('h1') ? getComputedStyle(q('h1')).fontFamily.split(',')[0] : null,
        // Webフォントが実際に適用されているかの判定。
        // document.fonts.check() は「その文字を描ける実体が読み込まれているか」を返す。
        // 併せて、同じ文字列を webfont 指定 / フォールバックのみ で描いた幅を比べる。
        // 幅が同じならフォールバックで描かれている（＝Webフォントが効いていない）。
        fontApplied: (() => {
          const sample = '身体づくりトレーニング';
          const check = {
            mincho: document.fonts.check('600 24px "Shippori Mincho"', sample),
            gothic: document.fonts.check('400 16px "Zen Kaku Gothic New"', sample),
            jost: document.fonts.check('400 16px "Jost"', 'READ ARTICLE')
          };
          const measure = (family) => {
            const c = document.createElement('canvas').getContext('2d');
            c.font = `600 24px ${family}`;
            return Math.round(c.measureText(sample).width * 100) / 100;
          };
          const wWebfont = measure('"Shippori Mincho", serif');
          const wFallback = measure('serif');
          const wGothic = measure('"Zen Kaku Gothic New", sans-serif');
          const wSans = measure('sans-serif');
          return {
            check,
            minchoWidth: wWebfont, serifFallbackWidth: wFallback, minchoDiffers: wWebfont !== wFallback,
            gothicWidth: wGothic, sansFallbackWidth: wSans, gothicDiffers: wGothic !== wSans
          };
        })()
      };
    });

    const base = `${pg.name}__${vp.name}`;
    await page.screenshot({ path: path.join(OUT, `${base}__full.png`), fullPage: true });
    await page.screenshot({ path: path.join(OUT, `${base}__fold.png`) });
    const cta = await page.$('.blog-cta');
    if (cta) await cta.screenshot({ path: path.join(OUT, `${base}__cta.png`) }).catch(() => {});

    // 軽量版（JPEG）。セッション環境からはArtifact（blob storage）へ到達できないため、
    // 一時ブランチへpushして持ち出せるようファイルサイズを抑えたコピーも出す。
    fs.mkdirSync(LITE, { recursive: true });
    await page.screenshot({ path: path.join(LITE, `${base}__fold.jpg`), type: 'jpeg', quality: 72 });
    await page.screenshot({ path: path.join(LITE, `${base}__full.jpg`), type: 'jpeg', quality: 45, fullPage: true });
    if (cta) await cta.screenshot({ path: path.join(LITE, `${base}__cta.jpg`), type: 'jpeg', quality: 80 }).catch(() => {});

    results.push({ page: pg.name, url: pg.url, vp: vp.name, status: resp?.status(), consoleErrors, networkFailures, badResponses, ...m });
    await page.close();
  }
  await ctx.close();
}
await browser.close();

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
fs.mkdirSync(LITE, { recursive: true });
fs.writeFileSync(path.join(LITE, 'results.json'), JSON.stringify(results, null, 2));

// ---- サマリー出力 ----
const S = [];
const w = (s) => { S.push(s); console.log(s); };
w(`# Preview 実機ビジュアルQA`);
w('');
w(`Target: \`${BASE}\``);
w('');
w('| Page | VP | HTTP | h1 | Hero | 本文字数 | CTA行数 | Related | Footer links | 横スクロール | Console err | Network fail | 4xx/5xx | 壊れ画像 |');
w('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
let fail = 0;
for (const r of results) {
  const fontFails = r.networkFailures.filter(x => x.includes('fonts.gstatic.com')).length;
  const otherNetFails = r.networkFailures.length - fontFails;
  const bad = r.horizontalOverflow || otherNetFails || r.badResponses.length || r.imagesBroken.length || r.h1.length !== 1;
  if (bad) fail = 1;
  w(`| ${r.page} | ${r.vp} | ${r.status} | ${r.h1.length} | ${r.heroImg ? (r.heroImg.natural > 0 ? '✅' : '❌') : '—'} | ${r.bodyChars || '—'} | ${r.cta.map(c => c.lines).join('/') || '—'} | ${r.related.length} | ${r.footerLinks} | ${r.horizontalOverflow ? '❌ ' + r.scrollWidth + '>' + r.clientWidth : '✅'} | ${r.consoleErrors.length} | ${otherNetFails} (+font ${fontFails}) | ${r.badResponses.length} | ${r.imagesBroken.length} |`);
}
w('');
const allConsole = [...new Set(results.flatMap(r => r.consoleErrors))];
const allNet = [...new Set(results.flatMap(r => r.networkFailures))];
const allBad = [...new Set(results.flatMap(r => r.badResponses))];
const allOverflow = results.filter(r => r.horizontalOverflow).map(r => `${r.page}@${r.vp}: ${r.overflowElems.join(', ')}`);
w('## Console errors'); w(allConsole.length ? allConsole.map(x => '- `' + x + '`').join('\n') : '- なし');
w(''); w('## Network failures'); w(allNet.length ? allNet.map(x => '- `' + x + '`').join('\n') : '- なし');
w(''); w('## 4xx/5xx responses'); w(allBad.length ? allBad.map(x => '- `' + x + '`').join('\n') : '- なし');
w(''); w('## 横スクロール'); w(allOverflow.length ? allOverflow.map(x => '- ' + x).join('\n') : '- なし');
w(''); w('## Webフォントが実際に適用されているか');
w('fonts.check は「その文字を描ける実体が読み込み済みか」。');
w('幅比較は、同じ文字列をWebフォント指定とフォールバックのみで描いた幅の差。');
w('差があればWebフォントで描かれている（フォールバックに落ちていない）。'); w('');
w('| Page | VP | check(明朝) | check(ゴシック) | check(Jost) | 明朝幅≠serif | ゴシック幅≠sans | gstatic失敗数 |');
w('|---|---|---|---|---|---|---|---|');
for (const r of results) {
  const f = r.fontApplied;
  const ff = r.networkFailures.filter(x => x.includes('fonts.gstatic.com')).length;
  w(`| ${r.page} | ${r.vp} | ${f.check.mincho ? '✅' : '❌'} | ${f.check.gothic ? '✅' : '❌'} | ${f.check.jost ? '✅' : '❌'} | ${f.minchoDiffers ? '✅ ' + f.minchoWidth + ' vs ' + f.serifFallbackWidth : '❌ 同一 ' + f.minchoWidth} | ${f.gothicDiffers ? '✅ ' + f.gothicWidth + ' vs ' + f.sansFallbackWidth : '❌ 同一 ' + f.gothicWidth} | ${ff} |`);
}
w(''); w('## メタ情報（1440のみ）');
w('| Page | title | description | canonical | 描画フォント |');
w('|---|---|---|---|---|');
for (const r of results.filter(x => x.vp === '1440')) {
  w(`| ${r.page} | ${r.docTitle} (${r.docTitle.length}) | ${(r.metaDesc || '').slice(0, 40)}… (${(r.metaDesc || '').length}) | ${r.canonical} | ${r.renderedFont} |`);
}
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, S.join('\n') + '\n');
process.exit(fail);
