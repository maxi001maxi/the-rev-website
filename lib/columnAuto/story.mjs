// Instagramストーリー用の縦画像（1080x1920）。上に見出しだけ、中央に合格済みの写真、下に文字なしの白い枠。
// 描画は決定的（Playwright）。Claude が画像を見て合否を出し、不合格なら配置を変えて最大3回まで作り直す。
import fs from 'node:fs';
import path from 'node:path';
import { MODELS, STORY } from './config.mjs';
import { claudeJson, imageBlock } from './claude.mjs';

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function storyHtml({ headline, sceneDataUrl, fontScale = 1, focalX = 50, focalY = 40 }) {
  const lines = String(headline).split('\n').map((l) => l.trim()).filter(Boolean);
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const size = Math.round(Math.min(96, Math.max(58, 860 / longest)) * fontScale);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;}
  body{width:1080px;height:1920px;background:#F3EEE6;position:relative;overflow:hidden;font-family:"Noto Serif CJK JP","Noto Serif JP","Hiragino Mincho ProN",serif;}
  .head{position:absolute;left:84px;right:84px;top:150px;height:420px;display:flex;flex-direction:column;justify-content:center;}
  .rule{width:72px;height:3px;background:#B98A4E;margin-bottom:36px;}
  .head p{margin:0;color:#1D1B18;font-size:${size}px;line-height:1.38;font-weight:700;letter-spacing:0.02em;}
  .photo{position:absolute;left:0;right:0;top:620px;height:800px;background:url(${sceneDataUrl}) ${focalX}% ${focalY}%/cover no-repeat;}
  .box{position:absolute;left:84px;right:84px;top:1480px;height:300px;background:#FFFFFF;border-radius:28px;box-shadow:0 10px 40px rgba(29,27,24,0.10);}
  </style></head><body>
  <div class="head"><div class="rule"></div>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
  <div class="photo"></div>
  <div class="box"></div>
  </body></html>`;
}

export async function renderStory({ headline, scenePath, outPath, fontScale, focalX, focalY }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    const mime = /\.png$/i.test(scenePath) ? 'image/png' : 'image/jpeg';
    const sceneDataUrl = `data:${mime};base64,${fs.readFileSync(scenePath).toString('base64')}`;
    await page.setContent(storyHtml({ headline, sceneDataUrl, fontScale, focalX, focalY }), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  } finally { await browser.close(); }
}

const STORY_QC_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['pass', 'headline_fully_visible', 'headline_legible_on_phone', 'only_headline_text', 'bottom_box_empty', 'subject_face_not_cut', 'premium_look', 'issues', 'suggested_font_scale', 'suggested_focal_y'],
  properties: {
    pass: { type: 'boolean' }, headline_fully_visible: { type: 'boolean' }, headline_legible_on_phone: { type: 'boolean' },
    only_headline_text: { type: 'boolean' }, bottom_box_empty: { type: 'boolean' }, subject_face_not_cut: { type: 'boolean' },
    premium_look: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } },
    suggested_font_scale: { type: 'number' }, suggested_focal_y: { type: 'number' }
  }
};

export async function makeStory({ headline, scenePath, outPath, meter }) {
  let fontScale = 1, focalY = 40;
  const history = [];
  for (let i = 1; i <= STORY.maxRenders; i++) {
    await renderStory({ headline, scenePath, outPath, fontScale, focalY });
    const { data, model } = await claudeJson({
      model: MODELS.imageQc, meter, purpose: 'story-qc', maxJpy: 15, effort: 'low', maxTokens: 4000, schema: STORY_QC_SCHEMA,
      system: 'あなたはInstagramストーリー画像の品質チェック役です。スマホで見たときの見え方で厳しく判定します。出力はJSONのみ。',
      content: [
        imageBlock(outPath),
        { type: 'text', text: `この1080x1920のストーリー画像を判定してください。
条件: 上部に見出し「${headline.replace(/\n/g, ' ')}」だけが入っている（写真の中に元から写っている店の壁の看板「THE REV.」は背景なので可。それ以外に後から重ねた文字・ロゴ・説明文が無い）。見出しが欠けず、スマホで読める。中央の写真で人物の顔が切れていない。下の白い枠は空（文字なし）で、店長が後から文字を入れられる。全体が上品で、広告っぽくない。
どれか1つでも満たさなければ pass=false。suggested_font_scale は次に試す文字の倍率（0.8〜1.15、今は${fontScale}）、suggested_focal_y は写真の縦位置（0=上寄せ〜100=下寄せ、今は${focalY}）。` }
      ]
    });
    const ok = data.pass && data.headline_fully_visible && data.headline_legible_on_phone && data.only_headline_text && data.bottom_box_empty && data.subject_face_not_cut;
    history.push({ render: i, font_scale: fontScale, focal_y: focalY, pass: ok, issues: data.issues, model });
    if (ok) return { pass: true, path: outPath, renders: i, history };
    fontScale = Math.min(1.15, Math.max(0.8, Number(data.suggested_font_scale) || fontScale * 0.92));
    focalY = Math.min(100, Math.max(0, Number(data.suggested_focal_y) || focalY));
  }
  fs.rmSync(outPath, { force: true }); // 不合格の画像は渡さない
  return { pass: false, path: null, renders: STORY.maxRenders, history };
}
