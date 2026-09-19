// THE REV. Column image design DNA
// Source of truth: the five approved original column cards.
//
// Reference V2 deliberately separates:
// 1) generated visual design / photography treatment (GPT Image),
// 2) exact Japanese typography (Playwright overlay).
// This preserves the original series' editorial feel without letting the image
// model invent or corrupt public-facing Japanese copy.

export const REV_COLUMN_REFERENCE_V2 = Object.freeze({
  id: 'rev-column-reference-v2',
  renderVersion: 'rev-column-reference-v2.1',
  generationModel: 'gpt-image-2',
  qaModel: 'gpt-5.6-luna',
  thumb: { width: 1200, height: 800 },
  og: { width: 1200, height: 630 },
  master: { width: 1536, height: 1024 },
  promptRevision: '2026-09-19.2',

  styleReferences: [
    'assets/images/blog/columns/column-01-frequency-master.jpg',
    'assets/images/blog/columns/column-02-push-master.jpg',
    'assets/images/blog/columns/column-03-trial-master.jpg',
    'assets/images/blog/columns/column-04-boxing-master.jpg',
    'assets/images/blog/columns/column-05-recovery-master.jpg'
  ],

  designDNA: {
    mood: [
      'quiet Japanese editorial design',
      'premium but understated',
      'warm white / ivory paper tone',
      'generous negative space',
      'natural photography',
      'refined magazine-like composition'
    ],
    composition: [
      'landscape editorial card',
      'text field on the left',
      'photography on the right',
      'subtle asymmetry is allowed',
      'treat the label + headline as one editorial block in the upper-middle to mid-left zone rather than pinning the label to the top edge',
      'the composition should feel designed rather than mechanically templated'
    ],
    typographyIntent: [
      'small spaced category label grouped above the headline in the upper-middle / mid-left editorial block',
      'elegant Japanese Mincho-style headline',
      'headline should breathe and never feel bold or promotional'
    ],
    avoid: [
      'fitness-advertisement look',
      'bold sans-serif headline',
      'large logos',
      'black badges or decorative dots',
      'NARA / SHIN-OMIYA media tags',
      'busy graphic elements',
      'gradient-heavy marketing design',
      'fake readable text generated into the artwork'
    ]
  },

  overlay: {
    label: {
      family: '"Noto Sans CJK JP","Noto Sans JP","Yu Gothic","Hiragino Sans",sans-serif',
      sizeThumb: 16,
      sizeOg: 15,
      weight: 400,
      letterSpacing: '.17em',
      color: '#5f5a52'
    },
    headline: {
      family: '"Noto Serif CJK JP","Noto Serif JP","Yu Mincho","Hiragino Mincho ProN",serif',
      sizeThumb: 52,
      sizeOg: 46,
      weight: 400,
      lineHeight: 1.44,
      letterSpacing: '.01em',
      color: '#2a2925'
    }
  }
});

export const REV_COLUMN_CLASSIC_V1 = Object.freeze({
  id: 'rev-column-classic-v1'
});

export function getEditorialImageStyle(id = REV_COLUMN_REFERENCE_V2.id) {
  if (id === REV_COLUMN_REFERENCE_V2.id) return REV_COLUMN_REFERENCE_V2;
  if (id === REV_COLUMN_CLASSIC_V1.id) return REV_COLUMN_CLASSIC_V1;
  throw new Error(`Unknown editorial image style: ${id}`);
}

export function buildReferenceV2GenerationPrompt(job) {
  const dna = REV_COLUMN_REFERENCE_V2.designDNA;
  return [
    'Create ONE finished landscape master artwork for THE REV. CONDITIONING LAB. column series.',
    'INPUT ROLES:',
    'Images 1-5 are approved STYLE REFERENCES from the existing THE REV. column series. Study their design language, whitespace, paper tone, quiet luxury, photographic treatment, balance and editorial rhythm.',
    'The LAST input image is the CONTENT REFERENCE for this specific article. Preserve the real facility/equipment/person/scene identity from that content image. Do not invent a different gym, different machine, different room or different person.',
    '',
    'GOAL:',
    'Create the next card in the same series, not a replica of one existing card. It should feel like COLUMN 06 naturally belongs beside the five approved references.',
    '',
    'COMPOSITION:',
    ...dna.composition.map((x) => `- ${x}`),
    '',
    'MOOD:',
    ...dna.mood.map((x) => `- ${x}`),
    '',
    'IMPORTANT TYPOGRAPHY SPACE:',
    'Leave a calm, clean left-side text field with enough negative space for a small category label near the upper-left and a 2-3 line Japanese Mincho headline around the visual center-left.',
    'DO NOT render the final Japanese headline, category label, logos, fake letters, placeholder words, lorem ipsum, symbols, badges or any other readable text. The exact typography will be composited later in code.',
    'The left field may include subtle paper texture, natural shadow, architectural light or restrained editorial details, but no readable text.',
    '',
    'PHOTOGRAPHY:',
    'Use the LAST input image as the visual subject/reference. Keep it authentic to THE REV. and crop/treat it like the approved column references.',
    'Natural light, restrained contrast, premium editorial color grade. Do not make it look like an advertisement.',
    '',
    'AVOID:',
    ...dna.avoid.map((x) => `- ${x}`),
    '',
    `Article context only: ${String(job.article_title || '').trim()}`,
    `Category context: ${String(job.category_label || '').trim()}`,
    `Content-reference intent: ${String(job.content_reference_intent || '').trim()}`,
    `Why this reference was selected: ${String(job.content_reference_reason || '').trim()}`,
    'The photograph should support the article meaning at a glance, not merely prove that the gym exists. Prefer a believable scene that visually reinforces the article intent while preserving the real content reference.',
    'Output one polished 3:2 landscape master artwork.'
  ].join('\n');
}

export function buildReferenceV2QaPrompt(job) {
  return [
    'You are the strict brand QA gate for THE REV. CONDITIONING LAB. editorial column images.',
    'Images 1-5 are the APPROVED ORIGINAL SERIES references.',
    'The LAST image is the NEW FINAL CARD to evaluate.',
    '',
    'Judge the new card as a sixth member of the same visual series.',
    'Do not reward superficial copying. It should share the design DNA while still being a coherent new composition.',
    '',
    'Check:',
    '- series consistency with the five references',
    '- elegant Japanese editorial / magazine feel',
    '- restrained premium mood',
    '- generous negative space',
    '- typography harmony and legibility',
    '- photo treatment that feels natural and consistent',
    '- article-to-photo semantic relevance: the scene should support the article theme, not be a generic gym image',
    '- no cheap banner-ad / fitness-ad look',
    '- no unintended readable text besides the expected overlay',
    '- balanced left text field and right photographic field',
    '',
    `Expected category label: ${String(job.category_label || '')} / ${String(job.column_label || '')}`,
    `Expected headline exactly: ${String(job.image_headline_short || '').replace(/\n/g, ' / ')}`,
    `Article context: ${String(job.article_title || '').trim()}`,
    `Content-reference intent: ${String(job.content_reference_intent || '').trim()}`,
    '',
    'Return PASS only if this image is genuinely suitable to sit beside the five approved images on the live website.'
  ].join('\n');
}
