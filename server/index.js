// exx.grok — live news dashboard. Run: npm start, then open http://localhost:5177 in Chrome.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { cfg, has, envFileFound, ROOT } from './env.js';
import { fetchNational, fetchLocalCandidates, fetchPolitical, fetchInternational, articleMeta, findCoverage, textChars, get, enrichLocal } from './feeds.js';
import * as X from './xapi.js';
import * as AI from './ai.js';
import { TOP_SNAPSHOT } from './snapshot.js';
import * as Trends from './trends.js';
import * as Auth from './auth.js';
import * as Marks from './marks.js';

const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

// ---------------- state ----------------
const state = {
  national: [], nationalStatus: {}, local: [], localMode: has.ai ? 'ai' : 'keywords', localError: '', political: [], politicalStatus: {}, politicalError: '', international: [], internationalStatus: {}, internationalError: '',
  x: [], xErrors: {}, xError: '', top: null, topError: '', topScanned: 0,
  trending: null, trendError: '',
  updated: { news: 0, national: 0, local: 0, political: 0, international: 0, x: 0, top: 0, trends: 0 }, refreshing: false, refreshingCols: {},
};
try { const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'local.json'), 'utf8')); if (Array.isArray(saved)) state.local = saved.filter(i => Date.now() - i.ts < 36 * 3600e3); } catch { /* first run */ }

async function refreshNational() {
  const t0 = Date.now();
  const nat = await fetchNational();
  state.national = nat.items; state.nationalStatus = nat.status;
  state.updated.national = state.updated.news = Date.now();
  log(`national refreshed: ${state.national.length} (${Date.now() - t0} ms)`);
}
async function refreshLocal() {
  const t0 = Date.now();
  try {
    const cands = await fetchLocalCandidates();
    const known = new Set(state.local.map(i => i.title.toLowerCase()));
    const fresh = cands.filter(c => !known.has(c.title.toLowerCase()));
    let picks = [];
    if (has.ai && fresh.length) {
      try {
        picks = await AI.pickLocal(fresh, { want: state.local.length ? 8 : 15, already: state.local.map(i => i.title) });
        state.localMode = 'ai'; state.localError = '';
      } catch (e) { state.localError = 'AI pick failed (' + e.message + '); showing keyword picks.'; state.localMode = 'keywords'; }
    }
    if (!picks.length && state.localMode !== 'ai') {
      picks = fresh.filter(c => c.score >= 3).sort((a, b) => b.score - a.score || b.ts - a.ts).slice(0, state.local.length ? 6 : 15)
        .map(c => ({ ...c, why: 'Keyword match: ' + (/video|bodycam|911/i.test(c.title) ? 'footage hook' : 'crime/incident hook') + (/\b(Florida|Texas|California|county|city)\b/i.test(c.title) ? ' + place tag' : '') }));
    }
    state.local = [...picks, ...state.local].sort((a, b) => b.ts - a.ts).slice(0, 40);
    const needPic = state.local.filter(i => !i.image && (!i.enriched || Date.now() - i.enriched > 2 * 3600e3)).slice(0, 16);
    if (needPic.length) {
      const t1 = Date.now();
      enrichLocal(needPic).then(() => { fs.writeFileSync(path.join(DATA, 'local.json'), JSON.stringify(state.local)); log(`local photos: ${state.local.filter(i => i.image).length}/${state.local.length} have a photo (${Date.now() - t1} ms)`); }).catch(() => {});
    }
    fs.writeFileSync(path.join(DATA, 'local.json'), JSON.stringify(state.local));
  } catch (e) { state.localError = 'Local search failed: ' + e.message; }
  state.updated.local = state.updated.news = Date.now();
  log(`local refreshed: ${state.local.length} (${Date.now() - t0} ms)`);
}
async function refreshPolitical() {
  const t0 = Date.now();
  try {
    const pol = await fetchPolitical({ excludeTitles: state.national.map(i => i.title) });
    state.political = pol.items; state.politicalStatus = pol.status; state.politicalError = '';
    const needPic = state.political.filter(i => !i.image && (!i.enriched || Date.now() - i.enriched > 2 * 3600e3)).slice(0, 16);
    if (needPic.length) {
      const t1 = Date.now();
      enrichLocal(needPic).then(() => log(`political photos: ${state.political.filter(i => i.image).length}/${state.political.length} have a photo (${Date.now() - t1} ms)`)).catch(() => {});
    }
  } catch (e) { state.politicalError = 'Political feed failed: ' + e.message; }
  state.updated.political = state.updated.news = Date.now();
  log(`political refreshed: ${state.political.length} (${Date.now() - t0} ms)`);
}
async function refreshInternational() {
  const t0 = Date.now();
  try {
    const intl = await fetchInternational({ excludeTitles: [...state.national, ...state.local, ...state.political].map(i => i.title) });
    state.international = intl.items; state.internationalStatus = intl.status; state.internationalError = '';
    const needPic = state.international.filter(i => !i.image && (!i.enriched || Date.now() - i.enriched > 2 * 3600e3)).slice(0, 16);
    if (needPic.length) {
      const t1 = Date.now();
      enrichLocal(needPic).then(() => log(`international photos: ${state.international.filter(i => i.image).length}/${state.international.length} have a photo (${Date.now() - t1} ms)`)).catch(() => {});
    }
  } catch (e) { state.internationalError = 'International feed failed: ' + e.message; }
  state.updated.international = state.updated.news = Date.now();
  log(`international refreshed: ${state.international.length} (${Date.now() - t0} ms)`);
}
async function refreshNews() {
  const t0 = Date.now();
  await Promise.allSettled([refreshNational(), refreshLocal(), refreshPolitical()]);
  await refreshInternational();
  log(`news refreshed: ${state.national.length} national, ${state.local.length} local, ${state.political.length} political, ${state.international.length} international (${Date.now() - t0} ms)`);
}

async function refreshX() {
  if (!has.bearer && !has.oauth1) { state.xError = 'NO_KEYS'; return; }
  try { const r = await X.xFeed(); state.x = r.items; state.xErrors = r.errors; state.xError = Object.keys(r.errors).length === cfg.feedAccounts.length ? Object.values(r.errors)[0] : ''; }
  catch (e) { state.xError = e.message; }
  state.updated.x = Date.now();
  log(`x feed refreshed: ${state.x.length} posts`, state.xError || '');
}

async function refreshTop() {
  if (!has.bearer && !has.oauth1) { state.topError = 'NO_KEYS'; return; }
  try { const r = await X.topPostsThisWeek(); state.top = r.top; state.topScanned = r.scanned; state.topError = ''; }
  catch (e) { state.topError = e.message; }
  state.updated.top = Date.now();
}

async function refreshTrends() {
  try {
    const t0 = Date.now();
    state.trending = await Trends.collectTrends();
    state.trendError = '';
    state.updated.trends = Date.now();
    const n = ['x', 'facebook', 'instagram'].map(k => `${k}:${(state.trending[k]?.items || []).length}`).join(', ');
    log(`trends refreshed: ${n} (${Date.now() - t0} ms)`);
  } catch (e) {
    state.trendError = e.message;
    state.updated.trends = Date.now();
    log('trends refresh failed', e.message);
  }
}

const COL_REFRESH = {
  national: refreshNational, local: refreshLocal, political: refreshPolitical, international: refreshInternational,
  x: refreshX, top: refreshTop, trends: refreshTrends,
};
const colRuns = {};
async function refreshCol(col) {
  const fn = COL_REFRESH[col];
  if (!fn) throw new Error('unknown column');
  if (colRuns[col]) return colRuns[col];
  state.refreshingCols[col] = true;
  const run = (async () => { await fn(); })();
  colRuns[col] = run;
  try { await run; } finally { delete colRuns[col]; state.refreshingCols[col] = false; }
}

let refreshRun = null;
const picJobs = new Map(); // local story id -> photo lookup in progress
async function refreshAll(force = false) {
  // A manual refresh that lands while an automatic one is running waits for it, then forces its own fresh fetch.
  if (refreshRun) { if (!force) return refreshRun; await refreshRun.catch(() => {}); if (refreshRun) return refreshRun; }
  state.refreshing = true;
  refreshRun = (async () => {
    const now = Date.now();
    const jobs = [];
    if (force || now - state.updated.news >= cfg.newsMin * 60e3 - 5e3) jobs.push(refreshNews());
    if (force || now - state.updated.x >= cfg.xFeedMin * 60e3 - 5e3) jobs.push(refreshX());
    if ((force && !state.top) || now - state.updated.top >= cfg.topMin * 60e3 - 5e3) jobs.push(refreshTop());
    if (force || now - state.updated.trends >= cfg.trendsMin * 60e3 - 5e3) jobs.push(refreshTrends());
    await Promise.allSettled(jobs);
  })();
  try { await refreshRun; } finally { refreshRun = null; state.refreshing = false; }
}
setInterval(() => refreshAll(false).catch(e => log('refresh error', e)), 60e3);

// ---------------- http helpers ----------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, { 'Content-Type': type, 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(buf);
}
const json = (res, code, obj) => send(res, code, obj);
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error('File too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJson = async req => JSON.parse((await readBody(req, 2e6)).toString('utf8') || '{}');

function setupNotices() {
  const n = [];
  if (!envFileFound && !has.ai && !has.bearer) n.push({ level: 'warn', text: 'No .env file found. Copy .env.example to .env and add your keys, then restart (npm start). News still works without keys.' });
  if (!cfg.allowPublish) { n.push({ level: 'info', text: 'Shared version: posting to X is turned off here. Generate drafts, edit them and use Copy to post from your own account.' }); }
  if (!has.ai) n.push({ level: 'warn', key: 'ai', text: 'AI key missing (AI_API_KEY): Generate short/long posts, the smart Local picks and video footage ideas are off. Get a key at console.x.ai.' });
  if (!cfg.allowPublish) { if (!has.bearer) n.push({ level: 'warn', key: 'x', text: 'X_BEARER_TOKEN missing: the X feed, Top 5 and X trends are off.' }); }
  else if (!has.bearer && !has.oauth1) n.push({ level: 'warn', key: 'x', text: 'X keys missing: the X feed and your live Top 5 are off, and Publish is disabled. Add X_BEARER_TOKEN and the four OAuth 1.0a keys from developer.x.com.' });
  else if (!has.oauth1) n.push({ level: 'warn', key: 'x', text: 'X OAuth 1.0a keys missing (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET): Publish and media upload are disabled.' });
  if (cfg.dryRun && cfg.allowPublish) n.push({ level: 'info', text: 'DRY_RUN is on: Publish shows what would be posted but sends nothing to X.' });
  return n;
}
const hasFfmpeg = () => new Promise(r => execFile('ffmpeg', ['-version'], e => r(!e)));

// ---------------- routes ----------------
const imgCache = new Map();
function redirect(res, loc, extra = {}) {
  const body = Buffer.from('');
  res.writeHead(302, { Location: loc, 'Content-Length': 0, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}

async function route(req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = url.pathname;

  if (Auth.authEnabled()) {
    if (p === '/login' && req.method === 'GET') {
      if (Auth.readSession(req)) return redirect(res, '/');
      const html = Auth.loginPage({ next: url.searchParams.get('next') || '/' });
      return send(res, 200, html, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
    }
    if (p === '/login' && req.method === 'POST') {
      const ip = Auth.clientIp(req);
      if (Auth.isRateLimited(ip)) {
        const html = Auth.loginPage({ error: 'Too many attempts. Try again in a minute.', next: '/' });
        return send(res, 429, html, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store', 'Retry-After': '60' });
      }
      const form = Auth.parseForm(await readBody(req, 8000));
      const next = Auth.safeNext(form.next);
      if (!Auth.passwordOk(form.password || '')) {
        Auth.recordFail(ip);
        const html = Auth.loginPage({ error: 'Wrong password. Try again.', next });
        return send(res, 401, html, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
      }
      Auth.clearFails(ip);
      return redirect(res, next, { 'Set-Cookie': Auth.cookieHeader(req, { token: Auth.signSession() }) });
    }
    if (p === '/logout') {
      return redirect(res, '/login', { 'Set-Cookie': Auth.cookieHeader(req, { clear: true }) });
    }
    if (!Auth.readSession(req)) {
      return redirect(res, '/login');
    }
  }

  if (p.startsWith('/api/')) {
    if (req.method === 'POST' && (req.headers['x-exx-app'] !== '1' || !Auth.sameOrigin(req))) return json(res, 403, { error: 'Forbidden' });

    if (p === '/api/status') return json(res, 200, {
      keys: { ai: has.ai, xRead: has.bearer || has.oauth1, xPost: cfg.allowPublish && has.oauth1 }, publish: cfg.allowPublish, auth: Auth.authEnabled(), dryRun: cfg.dryRun, model: has.ai ? cfg.aiModel : null,
      username: cfg.xUsername, accounts: cfg.feedAccounts, refresh: { news: cfg.newsMin, x: cfg.xFeedMin, top: cfg.topMin, trends: cfg.trendsMin }, notices: setupNotices(), ffmpeg: await hasFfmpeg(),
    });

    if (p === '/api/feeds') {
      if (!state.updated.news) await refreshAll(true);
      return json(res, 200, {
        national: state.national, nationalStatus: state.nationalStatus,
        local: state.local, localMode: state.localMode, localError: state.localError,
        political: state.political, politicalStatus: state.politicalStatus, politicalError: state.politicalError,
        international: state.international, internationalStatus: state.internationalStatus, internationalError: state.internationalError,
        x: state.x, xError: state.xError, xErrors: state.xErrors,
        top: state.top || TOP_SNAPSHOT, topLive: !!state.top, topError: state.topError, topScanned: state.topScanned,
        trending: state.trending, trendError: state.trendError,
        updated: state.updated, refreshing: state.refreshing,
      });
    }
    if (p === '/api/trending') {
      if (!state.updated.trends) await refreshTrends();
      return json(res, 200, { trending: state.trending, trendError: state.trendError, updated: state.updated.trends });
    }
    // Shared "Posted" marks (everyone behind the password sees the same ones)
    if (p === '/api/posted' && req.method === 'GET') return json(res, 200, { marks: await Marks.list(), backend: Marks.backend() });
    if (p === '/api/posted' && req.method === 'POST') {
      const { id, posted, title } = await readJson(req);
      if (!id || typeof id !== 'string') return json(res, 400, { error: 'bad request' });
      try { const mark = await Marks.set(id, !!posted, title); return json(res, 200, { id, posted: !!mark, mark }); }
      catch (e) { return json(res, 502, { error: 'Could not save the mark: ' + e.message }); }
    }
    if (p === '/api/refresh' && req.method === 'POST') {
      const body = await readJson(req).catch(() => ({}));
      const col = String(url.searchParams.get('col') || body.col || '').toLowerCase();
      if (col) {
        if (!COL_REFRESH[col]) return json(res, 400, { error: 'unknown column' });
        await refreshCol(col);
        return json(res, 200, { ok: true, col, updated: state.updated });
      }
      await refreshAll(true);
      return json(res, 200, { ok: true, updated: state.updated });
    }

    if (p === '/api/meta') {
      const u = url.searchParams.get('url') || '';
      if (!/^https?:\/\//.test(u)) return json(res, 400, { error: 'bad url' });
      const li = [...state.local, ...state.political, ...state.international].find(i => i.url === u || i.pubUrl === u);
      if (li) {
        if (!li.image && (!li.enriched || Date.now() - li.enriched > 2 * 3600e3 || picJobs.has(li.id))) {
          if (!picJobs.has(li.id)) picJobs.set(li.id, enrichLocal([li]).finally(() => picJobs.delete(li.id)));
          await picJobs.get(li.id).catch(() => {});
        }
        if (li.image) return json(res, 200, { url: li.pubUrl || u, image: li.image, description: li.summary || '' });
      }
      const m = await articleMeta(u, { title: (url.searchParams.get('title') || '').slice(0, 300), src: (url.searchParams.get('src') || '').slice(0, 80) });
      return json(res, 200, { url: m.url, image: m.image, description: m.description, blocked: m.blocked, decodeError: m.decodeError || undefined });
    }

    if (p === '/api/img') {
      const u = url.searchParams.get('u') || '';
      if (!/^https?:\/\//.test(u)) return send(res, 400, 'bad url', 'text/plain');
      try {
        let hit = imgCache.get(u);
        if (!hit) {
          const r = await get(u, { as: 'buffer', timeout: 15000, headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' } });
          if (!r.ok || !/^image\//.test(r.type)) return send(res, 404, 'not an image', 'text/plain');
          hit = { type: r.type, data: r.data };
          imgCache.set(u, hit); if (imgCache.size > 300) imgCache.delete(imgCache.keys().next().value);
        }
        return send(res, 200, hit.data, hit.type, { 'Cache-Control': 'public, max-age=86400' });
      } catch { return send(res, 502, 'image fetch failed', 'text/plain'); }
    }

    if (p === '/api/generate' && req.method === 'POST') {
      if (!has.ai) return json(res, 400, { error: 'AI key missing. Add AI_API_KEY to .env and restart the app.', code: 'NO_AI' });
      const { item, mode, instructions } = await readJson(req);
      if (!item?.title || !['short', 'long'].includes(mode)) return json(res, 400, { error: 'bad request' });
      // Read the whole article on demand before writing (short and long). If the page is blocked or thin,
      // fall back to other outlets' coverage of the same story, then to xAI web research.
      let art = (item.kind === 'x' || item.kind === 'trend') ? null : await articleMeta(item.pubUrl || item.url, { fresh: true, title: item.title, src: item.src }).catch(() => null);
      if (item.kind !== 'trend') {
        art = { ...(art || {}) };
        const need = mode === 'long' ? 1500 : 700;
        const have = () => textChars(art) + textChars(art.coverage) + (item.kind === 'x' ? (item.title || '').length : 0);
        if (item.kind !== 'x' && have() < need) art.coverage = await findCoverage(item.title, { exclude: art.url || '' }).catch(() => null);
        if (have() < need) art.research = await AI.research(item, [item.summary, art.description, ...(art.paragraphs || []), ...(art.coverage?.paragraphs || [])].filter(Boolean).join('\n')).catch(() => null);
        // Research lists the publisher URLs it used: read the best of those pages in full too (Render's IP is often rate-limited by Google News).
        if (art.research && item.kind !== 'x' && have() < need) {
          const urls = [...new Set((art.research.split(/Sources?:/i).pop().match(/https?:\/\/[^\s)\]>,"']+/g) || []))]
            .filter(u => !/(x|twitter|youtube|facebook|instagram|tiktok|reddit|news\.google)\.com/i.test(u)).slice(0, 4);
          const keys = String(item.title).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 4);
          const pages = await Promise.all(urls.map(u => articleMeta(u, { fresh: true }).catch(() => null)));
          const best = pages.filter(a => a && !a.blocked && textChars(a) >= 1200)
            .filter(a => { const t = a.paragraphs.join(' ').toLowerCase(); return keys.filter(k => t.includes(k)).length >= Math.min(2, keys.length); })
            .sort((a, b) => textChars(b) - textChars(a))[0];
          if (best) art.coverage = { src: new URL(best.url).hostname.replace(/^www\./, ''), url: best.url, paragraphs: best.paragraphs, tried: art.coverage?.tried || [] };
        }
      }
      try { return json(res, 200, await AI.generatePost(item, mode, art, { instructions })); }
      catch (e) { return json(res, 502, { error: e.message }); }
    }

    if (p === '/api/footage' && req.method === 'POST') {
      if (!has.ai) return json(res, 400, { error: 'AI key missing. Add AI_API_KEY to .env for footage ideas.', code: 'NO_AI' });
      const { item, instructions, draft } = await readJson(req);
      try { return json(res, 200, await AI.footagePlan(item, String(instructions || '').slice(0, 2000), String(draft || '').slice(0, 4000))); }
      catch (e) { return json(res, 502, { error: e.message }); }
    }

    if (p === '/api/convert' && req.method === 'POST') { // WebM/Opus -> MP4 (H.264/AAC) for X, only if ffmpeg is installed
      if (!(await hasFfmpeg())) return json(res, 400, { error: 'ffmpeg is not installed, so WebM cannot be converted. Use Chrome 130+ (records MP4 directly) or install ffmpeg.' });
      const buf = await readBody(req, 600e6);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exx-'));
      const inF = path.join(tmp, 'in.' + (String(req.headers['content-type'] || '').includes('mp4') ? 'mp4' : 'webm')), outF = path.join(tmp, 'out.mp4');
      fs.writeFileSync(inF, buf);
      await new Promise((resolve, reject) => execFile('ffmpeg', ['-y', '-i', inF, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outF], { timeout: 300e3 }, e => e ? reject(e) : resolve()))
        .catch(e => { throw Object.assign(new Error('ffmpeg failed: ' + e.message), { code: 500 }); });
      const out = fs.readFileSync(outF); fs.rmSync(tmp, { recursive: true, force: true });
      return send(res, 200, out, 'video/mp4');
    }

    if (p === '/api/upload' && req.method === 'POST') {
      if (!cfg.allowPublish) return json(res, 403, { error: 'Posting to X is turned off on this shared version.', code: 'PUBLISH_OFF' });
      const mime = String(req.headers['content-type'] || '').split(';')[0];
      if (!/^(image\/(jpeg|png|webp|gif)|video\/mp4|video\/quicktime)$/.test(mime)) return json(res, 400, { error: `X accepts JPG, PNG, WEBP, GIF images and MP4/MOV video. This file is ${mime || 'unknown'}.` });
      const buf = await readBody(req, 512e6);
      if (mime.startsWith('image/') && mime !== 'image/gif' && buf.length > 5e6) return json(res, 400, { error: 'X images must be 5 MB or smaller.' });
      if (cfg.dryRun) return json(res, 200, { media_id: 'dryrun-' + buf.length, dryRun: true });
      if (!has.oauth1) return json(res, 400, { error: 'Add the four X OAuth 1.0a keys to .env to upload media.', code: 'NO_X' });
      try { return json(res, 200, { media_id: await X.uploadMedia(buf, mime) }); }
      catch (e) { return json(res, e.status && e.status < 500 ? e.status : 502, { error: e.message }); }
    }

    if (p === '/api/publish' && req.method === 'POST') {
      if (!cfg.allowPublish) return json(res, 403, { error: 'Posting to X is turned off on this shared version.', code: 'PUBLISH_OFF' });
      const { text, media_ids = [] } = await readJson(req);
      const t = String(text || '').trim();
      if (!t) return json(res, 400, { error: 'Post text is empty.' });
      if (cfg.dryRun) { log('DRY RUN publish:', JSON.stringify({ text: t, media_ids })); return json(res, 200, { dryRun: true, id: null, url: null, text: t }); }
      if (!has.oauth1) return json(res, 400, { error: 'Add the four X OAuth 1.0a keys to .env to publish.', code: 'NO_X' });
      try {
        const d = await X.createPost(t, media_ids.map(String));
        log('published', d.id);
        return json(res, 200, { id: d.id, url: `https://x.com/${cfg.xUsername}/status/${d.id}` });
      } catch (e) { return json(res, e.status && e.status < 500 ? e.status : 502, { error: e.message }); }
    }
    return json(res, 404, { error: 'not found' });
  }

  // static files
  let file = path.normalize(path.join(PUBLIC, p === '/' ? 'index.html' : decodeURIComponent(p)));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden', 'text/plain');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  const ext = path.extname(file);
  send(res, 200, fs.readFileSync(file), MIME[ext] || 'application/octet-stream', { 'Cache-Control': ext === '.html' || p === '/sw.js' ? 'no-cache' : 'public, max-age=300' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch(e => { log('error', req.url, e.message); if (!res.headersSent) json(res, e.code === 413 ? 413 : 500, { error: e.message }); });
});
const loopback = h => /^(127\.0\.0\.1|localhost|::1)$/i.test(h);
if (!cfg.appPassword && !loopback(cfg.host)) {
  console.error('Refusing to listen on ' + cfg.host + ' without APP_PASSWORD. Set a shared password before binding to a public address, or leave HOST unset to stay on localhost.');
  process.exit(1);
}
server.listen(cfg.port, cfg.host, () => {
  const localUrl = `http://localhost:${cfg.port}`;
  console.log(`\n  exx.grok is running.\n  Open in Chrome:  ${localUrl}\n  Listening on ${cfg.host}:${cfg.port}\n`);
  if (Auth.authEnabled()) {
    console.log('  Password protection is on. Coworkers will need the shared password to sign in.');
    if (Auth.usedGeneratedSecret()) console.log('  ! SESSION_SECRET is not set; everyone will be signed out when the app restarts. Set SESSION_SECRET in .env for a stable hosted link.');
  }
  for (const n of setupNotices()) console.log('  ' + (n.level === 'warn' ? '! ' : '- ') + n.text);
  console.log('');
  Marks.init(DATA).catch(e => log('posted marks init failed', e.message));
  refreshAll(true).catch(e => log('first refresh failed', e));
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${cfg.port} is already in use. Change PORT in .env or close the other copy of the app.` : e); process.exit(1); });
