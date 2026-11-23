// Tiny .env loader (no dependencies). Values already in process.env win.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function load() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return false;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
  }
  return true;
}
export const envFileFound = load();

const e = (k, d = '') => (process.env[k] ?? '').trim() || d;
const num = (k, d) => { const n = Number(e(k)); return Number.isFinite(n) && n > 0 ? n : d; };

function isContainer() {
  try {
    if (fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')) return true;
  } catch { /* ignore */ }
  return !!(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.FLY_APP_NAME || process.env.K_SERVICE);
}

function defaultHost() {
  if (e('HOST')) return e('HOST');
  if (e('APP_PASSWORD') && isContainer()) return '0.0.0.0';
  return '127.0.0.1';
}

export const cfg = {
  port: num('PORT', 5177),
  host: defaultHost(),
  appPassword: e('APP_PASSWORD'),
  sessionSecret: e('SESSION_SECRET'),
  xUsername: e('X_USERNAME', 'EXXAlerts').replace(/^@/, ''),
  feedAccounts: e('X_FEED_ACCOUNTS', 'EricLDaugh,LeadingReport,CollinRugg,Breaking911,NickSortor').split(',').map(s => s.trim().replace(/^@/, '')).filter(Boolean),
  bearer: e('X_BEARER_TOKEN'),
  apiKey: e('X_API_KEY'), apiSecret: e('X_API_SECRET'),
  accessToken: e('X_ACCESS_TOKEN'), accessSecret: e('X_ACCESS_TOKEN_SECRET'),
  aiKey: e('AI_API_KEY') || e('XAI_API_KEY') || e('OPENAI_API_KEY'),
  aiBase: e('AI_BASE_URL', 'https://api.x.ai/v1').replace(/\/+$/, ''),
  aiModel: e('AI_MODEL', 'grok-4.3'),
  newsMin: num('NEWS_REFRESH_MIN', 10),
  xFeedMin: num('X_FEED_REFRESH_MIN', 10),
  topMin: num('TOP_REFRESH_MIN', 60),
  trendsMin: num('TRENDS_REFRESH_MIN', 15),
  allowPublish: !/^(0|false|no|off)$/i.test(e('ALLOW_PUBLISH', '1')),
  dryRun: e('DRY_RUN') === '1' || e('DRY_RUN').toLowerCase() === 'true',
};

export const has = {
  bearer: !!cfg.bearer,
  oauth1: !!(cfg.apiKey && cfg.apiSecret && cfg.accessToken && cfg.accessSecret),
  ai: !!cfg.aiKey,
};
