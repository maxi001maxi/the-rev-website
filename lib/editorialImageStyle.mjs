// THE REV. Column image design DNA
// Source of truth: the five approved original column cards.
//
// Reference V2.2 is source-photo locked.
// 1) the supplied THE REV. content photo is never generatively edited,
// 2) only deterministic crop/resize is allowed for the photo region,
// 3) exact Japanese typography + editorial framing are composed in Playwright.
// This prevents invented people, equipment, rooms or other nonexistent content.

export const REV_COLUMN_REFERENCE_V2 = Object.freeze({
  id: 'rev-column-reference-v2',
  renderVersion: 'rev-column-reference-v2.2',
  generationModel: 'source-photo-lock-playwright',
  qaModel: 'gpt-5.6-luna',
  thumb: { width: 1200, height: 675 },
  og: { width: 1200, height: 630 },
  master: { width: 1536, height: 1024 },
  promptRevision: '2026-09-20.1',

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
      'fake readable text generated into the artwork',
      'invented people, faces, bodies, clothing, equipment, rooms or scenery',
      'generative replacement or reconstruction of the supplied content photo'
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
  return [
    'Reference V2.2 SOURCE PHOTO LOCK policy.',
    'Do not generate, edit, inpaint, outpaint or reconstruct the supplied content photograph.',
    'No invented person, face, body, equipment, room, clothing, text or scenery is allowed.',
    'The content photograph must be used as supplied; only deterministic crop and resize are permitted.',
    'Editorial styling and exact Japanese typography are added later by Playwright.',
    `Content reference: ${String(job.content_reference || '').trim()}`
  ].join('\n');
}

export function buildReferenceV2QaPrompt(job) {
  return [
    'You are the strict brand QA gate for THE REV. CONDITIONING LAB. editorial column images.',
    'Images 1-5 are the APPROVED ORIGINAL SERIES references.',
    'Image 6 is the ORIGINAL CONTENT REFERENCE supplied by THE REV.',
    'Image 7 is the NEW FINAL CARD to evaluate.',
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
    '- SOURCE PHOTO FIDELITY: the photographic region must clearly be the same supplied content reference, with crop/resize only',
    '- NO INVENTED CONTENT: no new person, face, body, equipment, room, clothing or scenery may appear',
    '- TRAINER-FREE THUMBNAIL POLICY: any trainer / coach / staff person in the source or final card is an automatic FAIL. Only customer-only or no-people imagery is publishable.',
    '- article-to-photo semantic relevance: the supplied scene should support the article theme',
    '- no cheap banner-ad / fitness-ad look',
    '- no NEW readable text added by the rendering pipeline besides the expected overlay',
    '- readable text/logos already present in the ORIGINAL CONTENT REFERENCE are allowed if they are preserved as part of the source photo',
    '- balanced left text field and right photographic field',
    '',
    `Expected category label: ${String(job.category_label || '')} / ${String(job.column_label || '')}`,
    `Expected headline exactly: ${String(job.image_headline_short || '').replace(/\n/g, ' / ')}`,
    `Article context: ${String(job.article_title || '').trim()}`,
    `Content-reference intent: ${String(job.content_reference_intent || '').trim()}`,
    '',
    'Crop and resize are allowed. Generative reconstruction, replacement, identity drift or invented visual content is an automatic FAIL.',
    'When judging unexpected_readable_text, compare Image 6 and Image 7: source-native text that already exists in Image 6 is not an error. Only newly introduced readable text should count as unexpected.',
    'Return PASS only if the source photo is faithfully preserved and the card is genuinely suitable to sit beside the five approved images on the live website.'
  ].join('\n');
}
