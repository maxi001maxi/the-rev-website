import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');
const LIMIT = 12;
const FUNCTION_EXT = /\.(?:mjs|cjs|js|ts)$/i;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return FUNCTION_EXT.test(entry.name) ? [full] : [];
  });
}

const functions = walk(API_DIR)
  .map((file) => path.relative(ROOT, file).replaceAll(path.sep, '/'))
  .sort();

console.log(`[vercel-function-budget] ${functions.length}/${LIMIT}`);
for (const file of functions) console.log(` - ${file}`);

if (functions.includes('api/daily-manager-cron.mjs')) {
  throw new Error('Daily Manager cron must reuse api/admin/daily-manager.mjs; remove api/daily-manager-cron.mjs.');
}
if (functions.length > LIMIT) {
  throw new Error(`Vercel Hobby function limit exceeded: ${functions.length}/${LIMIT}`);
}

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const cron = (vercel.crons || []).find((item) => item.path === '/api/admin/daily-manager');
if (!cron || cron.schedule !== '0 10 * * *') {
  throw new Error('Daily Manager cron must run through /api/admin/daily-manager at 19:00 JST (10:00 UTC).');
}
if (vercel.git?.deploymentEnabled?.['feature/daily-manager-v1'] !== false) {
  throw new Error('Automatic Vercel Git deployment must stay disabled for feature/daily-manager-v1.');
}
