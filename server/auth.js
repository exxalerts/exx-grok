// Shared-password login for hosted exx.grok. Disabled when APP_PASSWORD is unset.
import crypto from 'node:crypto';
import { cfg } from './env.js';

export const COOKIE = 'exx_session';
const MAX_AGE = 30 * 24 * 3600;
const WINDOW_MS = 60e3;
const MAX_FAILS = 10;

const bootSecret = crypto.randomBytes(32).toString('hex');
const fails = new Map();

export const authEnabled = () => !!cfg.appPassword;
export const usedGeneratedSecret = () => authEnabled() && !cfg.sessionSecret;

function secret() {
  return cfg.sessionSecret || bootSecret;
}

export function timingEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    const dummy = ba.length ? ba : Buffer.from('0');
    crypto.timingSafeEqual(dummy, dummy);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function passwordOk(input) {
  const a = crypto.createHash('sha256').update(String(input ?? ''), 'utf8').digest();
  const b = crypto.createHash('sha256').update(String(cfg.appPassword || ''), 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

export function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || 'unknown';
}

export function isRateLimited(ip) {
  const rec = fails.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.t >= WINDOW_MS) { fails.delete(ip); return false; }
  return rec.n >= MAX_FAILS;
}

export function recordFail(ip) {
  const now = Date.now();
  const rec = fails.get(ip);
  if (!rec || now - rec.t >= WINDOW_MS) fails.set(ip, { t: now, n: 1 });
  else rec.n++;
}

export function clearFails(ip) { fails.delete(ip); }

export function isSecureReq(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

export function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = requestHost(req);
    if (!host) return false;
    if (o.host === host || o.hostname === host.split(':')[0]) return true;
    const loop = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
    return loop.test(o.host) && loop.test(host);
  } catch { return false; }
}

export function signSession() {
  const payload = Buffer.from(JSON.stringify({ v: 1, exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return payload + '.' + mac;
}

export function readSession(req) {
  const raw = String(req.headers.cookie || '');
  let token = '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE) token = rest.join('=');
  }
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i);
  const mac = token.slice(i + 1);
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (!timingEqual(mac, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

export function cookieHeader(req, { clear = false, token = '' } = {}) {
  const parts = [
    `${COOKIE}=${clear ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    clear ? 'Max-Age=0' : `Max-Age=${MAX_AGE}`,
  ];
  if (isSecureReq(req)) parts.push('Secure');
  return parts.join('; ');
}

export function parseForm(buf) {
  const out = {};
  for (const part of String(buf).split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = decodeURIComponent((i < 0 ? part : part.slice(0, i)).replace(/\+/g, ' '));
    const v = decodeURIComponent((i < 0 ? '' : part.slice(i + 1)).replace(/\+/g, ' '));
    out[k] = v;
  }
  return out;
}

export function safeNext(v) {
  if (!v || typeof v !== 'string') return '/';
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\') || /[\r\n]/.test(v)) return '/';
  if (v.startsWith('/login') || v.startsWith('/api/') || v.startsWith('/logout')) return '/';
  return v;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function loginPage({ error = '', next = '/' } = {}) {
  const err = error ? `<div class="err">${esc(error)}</div>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Log in · exx.grok</title>
  <meta name="theme-color" content="#000000">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #000; color: #e7e9ea; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif; min-height: 100vh; }
    body { display: grid; place-items: center; }
    .card { width: min(400px, 92vw); background: #16181c; border: 1px solid #2f3336; border-radius: 16px; padding: 28px; box-shadow: 0 2px 12px rgb(0 0 0 / .6); }
    h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: .4px; font-weight: 800; }
    p { color: #8b9196; font-size: 14px; margin: 0 0 20px; line-height: 1.45; }
    label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    input[type=password] { width: 100%; padding: 10px 14px; border-radius: 999px; border: 1px solid #2f3336; background: #000; color: #fff; font: inherit; outline: none; }
    input[type=password]:focus { border-color: rgb(37 99 235); box-shadow: 0 0 0 3px rgb(37 99 235 / .3); }
    button { margin-top: 16px; width: 100%; cursor: pointer; border: 0; border-radius: 999px; padding: 10px 14px; font: inherit; font-weight: 700; background: rgb(37 99 235); color: #fff; }
    button:hover { filter: brightness(1.08); }
    .err { background: rgb(220 38 38 / .14); border: 1px solid rgb(220 38 38 / .45); color: #fecaca; padding: 8px 12px; border-radius: 12px; font-size: 13px; margin-bottom: 14px; }
  </style>
</head>
<body>
  <form class="card" method="post" action="/login" autocomplete="current-password">
    <h1>exx.grok</h1>
    <p>Enter the shared password to open the dashboard.</p>
    ${err}
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required autofocus>
    <input type="hidden" name="next" value="${esc(safeNext(next))}">
    <button type="submit">Log in</button>
  </form>
</body>
</html>`;
}
