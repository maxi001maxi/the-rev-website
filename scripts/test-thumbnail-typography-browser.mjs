import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fitThumbnailHeadline } from '../lib/editorialThumbnailTypography.mjs';
import { REV_COLUMN_REFERENCE_V2 } from '../lib/editorialImageStyle.mjs';

const jobs = fs.readdirSync('editorial/hybrid-image-jobs').filter((f) => f !== '_template.json');
const browser = await chromium.launch({ headless: true });
let count = 0;
try {
  for (const file of jobs) {
    const job = JSON.parse(fs.readFileSync(`editorial/hybrid-image-jobs/${file}`));
    for (const height of [675, 630, 900]) {
      const page = await browser.newPage({ viewport: { width: 1200, height } });
      await page.setContent(`<style>.headline{position:absolute;font-family:${REV_COLUMN_REFERENCE_V2.overlay.headline.family};letter-spacing:.01em}.headline-line{display:block;white-space:nowrap}</style><div class="paper"></div><div class="label"></div><div class="hairline"></div><h1 class="headline"></h1>`);
      await page.evaluate(() => document.fonts.ready);
      if (job.slug === 'strength-training-to-failure-when-to-stop') {
        await assert.rejects(page.evaluate(fitThumbnailHeadline, { text: job.image_headline_short, width: 1200, height, gbp: height === 900 }), /Thumbnail Typography FAIL/);
        console.log(`${job.slug} ${height}: expected FAIL (no shrinking below the readability floor)`);
        count++; await page.close(); continue;
      }
      const m = await page.evaluate(fitThumbnailHeadline, { text: job.image_headline_short, width: 1200, height, gbp: height === 900 });
      assert.equal(m.pass, true, file);
      assert.equal(m.text_preserved, true, file);
      assert.ok(m.font_size_at_320 >= 16, file);
      assert.ok(m.lines.every((line) => line.replace(/[、。！？!?]/g, '').length >= 2), file);
      if (job.slug === 'oxygen-room-how-to-spend-time') assert.deepEqual(m.lines, ['中では、', '静かに', '休むだけ。']);
      console.log(`${job.slug} ${height}: ${m.font_size}px / ${m.lines.join(' | ')}`);
      count++;
      await page.close();
    }
  }
  console.log(`Production headline render checks: PASS (${count} layouts)`);
} finally { await browser.close(); }
