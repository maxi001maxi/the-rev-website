// THE REV. Column thumbnail style tokens
// Source of truth: the original five published column cards.
export const REV_COLUMN_CLASSIC_V1 = Object.freeze({
  id: 'rev-column-classic-v1',
  thumb: { width: 1200, height: 800 },
  og: { width: 1200, height: 630 },
  panelRatio: 0.50,
  colors: {
    background: '#f7f4ed',
    text: '#2a2925',
    muted: '#6f6b63',
    border: '#d8d3c8'
  },
  label: {
    family: '"Noto Sans CJK JP","Noto Sans JP","Yu Gothic","Hiragino Sans",sans-serif',
    sizeThumb: 13,
    sizeOg: 12,
    weight: 400,
    letterSpacing: '.16em'
  },
  headline: {
    family: '"Noto Serif CJK JP","Noto Serif JP","Yu Mincho","Hiragino Mincho ProN",serif',
    sizeThumb: 50,
    sizeOg: 44,
    weight: 400,
    lineHeight: 1.45,
    letterSpacing: '.01em'
  }
});

export function getEditorialImageStyle(id = REV_COLUMN_CLASSIC_V1.id) {
  if (id !== REV_COLUMN_CLASSIC_V1.id) {
    throw new Error(`Unknown editorial image style: ${id}`);
  }
  return REV_COLUMN_CLASSIC_V1;
}
