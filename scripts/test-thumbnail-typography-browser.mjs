import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fitThumbnailHeadline, GOLDEN_LAYOUT_RULES } from '../lib/editorialThumbnailTypography.mjs';
import { REV_COLUMN_REFERENCE_V2 } from '../lib/editorialImageStyle.mjs';

const jobs = fs.readdirSync('editorial/hybrid-image-jobs').filter((f) => f !== '_template.json');
const browser = await chromium.launch({ headless: true });
let count = 0;
try {
  // Regression: the canonical warm-up copy must fit all three production ratios
  // with its intended positive focus phrase before image-generation credits are spent.
  for (const height of [675, 630, 900]) {
    const page = await browser.newPage({ viewport: { width: 1200, height } });
    await page.setContent(`<style>.headline{position:absolute;font-family:${REV_COLUMN_REFERENCE_V2.overlay.headline.family};letter-spacing:.01em}.headline-line{display:block;white-space:nowrap}</style><div class="paper"></div><div class="label"></div><div class="hairline"></div><h1 class="headline"></h1>`);
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(fitThumbnailHeadline, {
      text: '運動前は、\\n動く準備。',
      width: 1200,
      height,
      gbp: height === 900,
      override: { emphasis_text: '動く準備。' },
      rule: GOLDEN_LAYOUT_RULES[height === 900 ? 'gbp' : 'wide']
    });
    assert.equal(m.pass, true, 'warm-up copy must fit before generation');
    assert.deepEqual(m.lines, ['運動前は、', '動く準備。']);
    assert.equal(m.focus_text, '動く準備。');
    assert.ok(m.focus_scale >= 1.3);
    count++;
    await page.close();
  }

  for (const file of jobs) {
    const job = JSON.parse(fs.readFileSync(`editorial/hybrid-image-jobs/${file}`));
    for (const height of [675, 630, 900]) {
      const page = await browser.newPage({ viewport: { width: 1200, height } });
      await page.setContent(`<style>.headline{position:absolute;font-family:${REV_COLUMN_REFERENCE_V2.overlay.headline.family};letter-spacing:.01em}.headline-line{display:block;white-space:nowrap}</style><div class="paper"></div><div class="label"></div><div class="hairline"></div><h1 class="headline"></h1>`);
      await page.evaluate(() => document.fonts.ready);
      if (job.slug === 'strength-training-to-failure-when-to-stop') {
        await assert.rejects(page.evaluate(fitThumbnailHeadline, { text: job.image_headline_short, width: 1200, height, gbp: height === 900, rule: GOLDEN_LAYOUT_RULES[height === 900 ? 'gbp' : 'wide'] }), /Thumbnail Typography FAIL/);
        console.log(`${job.slug} ${height}: expected FAIL (no shrinking below the readability floor)`);
        count++; await page.close(); continue;
      }
      const m = await page.evaluate(fitThumbnailHeadline, { text: job.image_headline_short, width: 1200, height, gbp: height === 900, rule: GOLDEN_LAYOUT_RULES[height === 900 ? 'gbp' : 'wide'] });
      assert.equal(m.pass, true, file);
      assert.equal(m.text_preserved, true, file);
      assert.ok(m.font_size_at_320 >= 16, file);
      assert.ok(m.lines.every((line) => line.replace(/[、。！？!?]/g, '').length >= 2), file);
      assert.equal(m.hierarchy_pass, true);
      assert.ok(m.contrast_floor >= 4.5);
      assert.equal(m.paper_profile, 'local-curved-veil');
      assert.ok(m.paper_opacity_floor >= .85, 'actual curved veil must support every glyph');
      assert.equal(m.label_removed, true);
      assert.ok(Math.abs(m.headline_center_y / height - (height === 900 ? .48 : .50)) < .015,
        'title centre must adapt to its measured height, including two- and three-line GBP titles');
      assert.equal(await page.locator('.label').isVisible(), false);
      if (height === 900) {
        const cornerOpacity = await page.evaluate(async () => {
          const bg = document.querySelector('.paper').style.backgroundImage;
          const url = bg.match(/^url\(["']?(.*?)["']?\)$/)[1];
          const image = new Image(); image.src = url; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900;
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
          return ctx.getImageData(60, 0, 1, 1).data[3] / 255;
        });
        assert.ok(cornerOpacity < .05, 'GBP must reveal the original photo at the top left');
      }
      assert.equal(m.layout_rule, height === 900 ? 'golden-gbp-v1' : 'golden-wide-v1');
      if (job.slug === 'shinomiya-personal-gym-reservation-facility-the-rev') {
        assert.deepEqual(m.lines, ['通いやすさまで、', '選ぶ基準に。']);
      }
      if (job.slug === 'oxygen-room-how-to-spend-time') {
        assert.deepEqual(m.lines, ['中では、', '静かに', '休むだけ。']);
        assert.equal(m.focus_text, '静かに');
        const explicit = await page.evaluate(fitThumbnailHeadline, { text: job.image_headline_short, width: 1200, height, gbp: height === 900, override: { emphasis_text: '静かに' }, rule: GOLDEN_LAYOUT_RULES[height === 900 ? 'gbp' : 'wide'] });
        assert.equal(explicit.focus_text, '静かに');
        await assert.rejects(page.evaluate(fitThumbnailHeadline, { text: job.image_headline_short, width: 1200, height, gbp: height === 900, override: { emphasis_text: '存在しない' }, rule: GOLDEN_LAYOUT_RULES[height === 900 ? 'gbp' : 'wide'] }), /emphasis must be an existing phrase/);
      }
      console.log(`${job.slug} ${height}: ${m.font_size}px / ${m.lines.join(' | ')}`);
      count++;
      await page.close();
    }
  }
  console.log(`Production headline render checks: PASS (${count} layouts)`);
} finally { await browser.close(); }
