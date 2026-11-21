// コラム朝の自動実行（column-auto v1）の設定。数字を変えるときはここだけを直す。
import fs from 'node:fs';

export const VERSION = 'column-auto-v1';

// 営業日（JST）。根拠: サイトの営業時間表示（火水木土日 営業 / 月金 定休）と
// lib/dailyEditorialStateMachine.mjs の既定値。臨時休業は closed-dates.json に足す。
export const BUSINESS_WEEKDAYS = [2, 3, 4, 6, 0]; // Tue Wed Thu Sat Sun
export const CLOSED_DATES_PATH = 'editorial/column-auto/closed-dates.json';

export const MODELS = {
  topic: 'claude-sonnet-5-5',          // 候補出し（定型）
  writer: 'claude-opus-5-5',           // 本文（読み物の質が成果を左右するので上位モデル）
  reviewer: 'claude-sonnet-5-5',       // 書いた役とは別のチェック役
  reviewerEscalation: 'claude-opus-5-5', // 迷うものだけの二次確認
  imageQc: 'claude-sonnet-5-5',
  imageQcEscalation: 'claude-opus-5-5'
};

// 単価（USD / 1M tokens）。Anthropic: 公式料金表（2026-10時点）。
// OpenAI: developers.openai.com/api/docs/pricing（2026-11-21確認）。gpt-5.6 は sol の単価で概算。
export const PRICES_USD_PER_MTOK = {
  'claude-opus-5-5': { input: 4, output: 20, cache_read: 0.2, cache_write: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 },
  'gpt-5.6': { input: 4, output: 20, cache_read: 0.4, cache_write: 4 },
  'gpt-5.6-sol': { input: 4, output: 20, cache_read: 0.4, cache_write: 4 },
  'gpt-5.6-terra': { input: 2, output: 12, cache_read: 0.2, cache_write: 2 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2, cache_read: 0.02, cache_write: 0.2 },
  'openai-image-output': { input: 0, output: 32, cache_read: 0, cache_write: 0 }
};

// 円換算レート（概算）。請求の正は各社の管理画面。
export const USD_JPY = Number(process.env.COLUMN_AUTO_USD_JPY || 155);

// 費用の上限（円）。根拠は docs/column-automation/2026-11-21_report.md の費用の章。
export const BUDGET_JPY = {
  perRun: Number(process.env.COLUMN_AUTO_BUDGET_PER_RUN_JPY || 800),
  perMonth: Number(process.env.COLUMN_AUTO_BUDGET_PER_MONTH_JPY || 8000),
  imagePerRun: Number(process.env.COLUMN_AUTO_BUDGET_IMAGE_JPY || 300)
};

// テーマの配分（基本の重み）。店長方針: トレーニング系とSEO向けがメイン。
// 酸素ルームとDENBAは主力商品なので外さない。ボクシングも出す。均等にはしない。
export const LANES = {
  training:   { weight: 30, category: 'training',  label: 'トレーニング', min_per_10: 2 },
  seo_health: { weight: 22, category: 'health',    label: 'SEO向け（身体・健康の疑問）', min_per_10: 2 },
  gym_guide:  { weight: 14, category: 'gym-guide', label: 'ジム選び・店舗・サービス', min_per_10: 1 },
  oxygen:     { weight: 12, category: 'recovery',  label: '酸素ルーム', min_per_10: 1 },
  denba:      { weight: 10, category: 'recovery',  label: 'DENBA Health', min_per_10: 1 },
  boxing:     { weight: 12, category: 'boxing',    label: 'ボクシング', min_per_10: 1 }
};

export const CATEGORY_LABEL = { training: 'TRAINING', health: 'HEALTH', 'gym-guide': 'GYM GUIDE', recovery: 'RECOVERY', boxing: 'BOXING' };
export const CTA_BY_LANE = { training: 'personal-training', seo_health: 'personal-training', gym_guide: 'general', oxygen: 'recovery', denba: 'recovery', boxing: 'boxing' };

export const AUTHOR = { name: '服部 真騎士', role: 'THE REV. CONDITIONING LAB. 代表トレーナー' };

export const REVIEW = { maxDrafts: 3, passMin: 7, passAverage: 8 };
export const STORY = { maxRenders: 3 };
export const RETRY = { maxAttempts: 2 }; // 初回 + 再実行1回

export const UTM = { source: 'instagram', medium: 'story', campaign: 'column' };

export const SHEET_ID = '1_Cia3fsELLCJtBcIFq38Jg5CbEVG2md2G6w6Do4BaeI';
export const DELIVERY_REPO = process.env.COLUMN_AUTO_DELIVERY_REPO || 'maxi001maxi/the-rev-ops';
export const ADMIN_URL = 'https://admin.therev-lab.com/admin/articles/';

export function readClosedDates() {
  try { return JSON.parse(fs.readFileSync(CLOSED_DATES_PATH, 'utf8')).dates || []; } catch { return []; }
}
