// exx.grok — front end (plain ES modules, built for Chrome).
import { openVideo } from './video.js';

const $ = s => document.querySelector(s);
const SRC_RGB = {
  'Fox News': '29 78 216', 'CNN': '220 38 38', 'ABC News': '234 88 12', 'NBC News': '147 51 234', 'The Independent': '225 29 72',
  'Axios': '13 148 136', 'The Hill': '2 132 199', 'Associated Press': '202 138 4',
  '@EricLDaugh': '59 130 246', '@LeadingReport': '234 88 12', '@CollinRugg': '16 185 129', '@Breaking911': '220 38 38', '@NickSortor': '168 85 247', '@nicksortor': '168 85 247',
};
const TONE = { nat: '37 99 235', loc: '22 163 74', x: '100 116 139', fb: '24 119 242', ig: '225 48 108' };
const NAT_SOURCES = ['All', 'Fox News', 'CNN', 'ABC News', 'NBC News', 'The Independent', 'Axios', 'The Hill', 'Associated Press'];

const S = { status: null, feeds: null, q: '', natSrc: 'All', drafts: new Map(), cards: new Map(), sel: null, lastUpdated: 0 };
window.__exx = S; // handy for debugging in DevTools

// ---------- helpers ----------
export async function api(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const opts = { method, headers: { 'X-EXX-App': '1', ...headers } };
  if (body !== undefined) {
    if (body instanceof Blob || body instanceof ArrayBuffer) opts.body = body;
    else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  }
  const r = await fetch(path, { ...opts, credentials: 'same-origin', redirect: 'follow' });
  const ct = r.headers.get('content-type') || '';
  if (r.redirected && /\/login(?:\?|$)/.test(r.url) || ct.includes('text/html')) {
    location.href = '/login';
    throw new Error('Login required');
  }
  if (raw) { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status); return r; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'HTTP ' + r.status); e.code = d.code; throw e; }
  return d;
}
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
export function toast(msg, ms = 2800) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }
const fmtNum = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'K' : String(n);
function fmtTime(ts) {
  const d = new Date(ts), now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return d.toDateString() === now.toDateString() ? time : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
}
function ago(ts) { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : Math.round(m / 60) + 'h ago'; }
// X counts most Latin text as 1, CJK/emoji as 2, and any URL as 23.
export function xLength(t) {
  let n = 0;
  const s = t.replace(/https?:\/\/\S+/g, () => { n += 23; return ''; });
  for (const ch of s) { const c = ch.codePointAt(0); n += (c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247)) ? 1 : 2; }
  return n;
}
const imgUrl = u => '/api/img?u=' + encodeURIComponent(u);

// ---------- status / notices ----------
function renderStatus() {
  const s = S.status;
  const k = $('#keys'); k.replaceChildren(
    h('span', { class: 'key' + (s.keys.ai ? ' on' : ''), title: s.keys.ai ? 'AI writing on (' + s.model + ')' : 'AI key missing' }, 'AI'),
    h('span', { class: 'key' + (s.keys.xRead ? ' on' : ''), title: s.keys.xRead ? 'X reads on' : 'X read keys missing' }, 'X feed'),
    s.publish === false ? h('span', { class: 'key', title: 'Posting to X is off on this shared version' }, 'Publish off') :
    h('span', { class: 'key' + (s.keys.xPost ? ' on' : ''), title: s.keys.xPost ? (s.dryRun ? 'Publish in DRY RUN' : 'Publishing on') : 'X posting keys missing' }, s.dryRun ? 'Publish (dry run)' : 'Publish'));
  $('#notices').replaceChildren(...s.notices.map(n => h('div', { class: 'notice ' + n.level }, n.text)));
  $('#pubUser').textContent = '@' + s.username;
  const lo = $('#logout'); if (lo) lo.hidden = !s.auth;
}

// ---------- top 5 ----------
function renderTop() {
  const f = S.feeds;
  $('#topNote').textContent = f.topLive ? `Ranked by likes + reposts + replies over the last 7 days (${f.topScanned} posts checked).`
    : f.topError && f.topError !== 'NO_KEYS' ? 'Could not load live posts: ' + f.topError + ' Showing the Nov 23 snapshot.' : 'Snapshot from Nov 23. Add X keys to make this live.';
  $('#top').replaceChildren(...f.top.map((p, i) => h('article', { class: 'top-card' },
    h('div', { class: 'row' }, h('span', { class: 'rank' }, '#' + (i + 1)), h('span', { class: 'pill', style: { '--c': TONE.nat } }, '@' + (S.status?.username || 'EXXAlerts'))),
    h('div', { class: 'muted small' }, fmtTime(p.ts)),
    h('div', { class: 'txt', title: p.text }, p.text),
    h('div', { class: 'stats' }, ...[['likes', p.likes], ['reposts', p.reposts], ['replies', p.replies], ['views', p.views]].filter(([, v]) => v != null).map(([l, v]) => h('span', { class: 'stat' }, h('b', {}, fmtNum(v)), ' ' + l))),
    h('a', { href: p.url, target: '_blank', rel: 'noreferrer', class: 'small' }, 'View on X ↗'))));
}

// ---------- trending ----------
const TREND_PLATFORMS = ['x', 'facebook', 'instagram'];

function trendTone(platform) { return platform === 'facebook' ? TONE.fb : platform === 'instagram' ? TONE.ig : TONE.x; }

function trendRowOf(it) {
  let c = S.cards.get(it.id);
  if (!c) { c = { item: it, el: buildTrendRow(it) }; S.cards.set(it.id, c); }
  else c.item = it;
  return c.el;
}

function buildTrendRow(it) {
  const tone = trendTone(it.platform);
  const meta = [it.why, it.volume].filter(Boolean).join(' · ') || 'No official count';
  const el = h('article', { class: 'trend-row', tabindex: '0', 'data-id': it.id, style: { '--tone': tone }, onfocusin: () => select(it.id, false) },
    h('div', { class: 'trend-line' },
      h('span', { class: 'rank' }, String(it.rank)),
      h('span', { class: 'topic', title: it.summary || it.title }, it.title),
      h('span', { class: 'meta muted small', title: meta }, meta),
      h('a', { class: 'trend-view', href: it.url, target: '_blank', rel: 'noreferrer' }, 'View'),
      h('button', { class: 'btn btn-tone gen-short', title: 'Generate short post', onclick: () => generate(it.id, 'short') }, 'Short'),
      h('button', { class: 'btn btn-tone gen-long', title: 'Generate long post', onclick: () => generate(it.id, 'long') }, 'Long')),
    h('div', { class: 'editor', hidden: true }));
  return el;
}

function renderTrending() {
  const tr = S.feeds?.trending;
  const err = S.feeds?.trendError;
  const note = $('#trendUpdated');
  if (!tr && !err) {
    if (note) note.textContent = 'Loading trending topics…';
    return;
  }
  if (note) note.textContent = tr?.updated ? ('Updated ' + ago(tr.updated)) : '';
  for (const plat of TREND_PLATFORMS) {
    const col = tr?.[plat] || {};
    const items = (col.items || []).filter(it => {
      const q = S.q.trim().toLowerCase();
      return !q || `${it.title} ${it.why || ''} ${it.summary || ''} ${it.volume || ''}`.toLowerCase().includes(q);
    });
    const body = $('#b-trend-' + plat);
    const src = $('#src-trend-' + plat);
    const count = $('#n-trend-' + plat);
    if (count) count.textContent = items.length;
    if (src) {
      src.textContent = col.source || '';
      src.title = col.sourceNote || col.error || col.source || '';
    }
    if (!body) continue;
    if (!items.length) {
      const empty = S.q ? 'No trending topics match your filter.' : (col.error || 'No trending topics right now.');
      body.replaceChildren(h('div', { class: 'trend-empty' }, empty));
      continue;
    }
    body.replaceChildren(
      h('div', { class: 'trend-list' }, ...items.filter((_, i) => i < 5).map(trendRowOf)),
      h('div', { class: 'trend-list' }, ...items.filter((_, i) => i >= 5).map(trendRowOf)));
  }
}

// ---------- columns ----------

function matches(it) {
  const q = S.q.trim().toLowerCase();
  return !q || `${it.title} ${it.summary || ''} ${it.src} ${it.loc || ''}`.toLowerCase().includes(q);
}
function renderChips() {
  $('#srcChips').replaceChildren(...NAT_SOURCES.map(s => h('button', {
    class: 'chip' + (S.natSrc === s ? ' active' : ''), style: { '--c': SRC_RGB[s] || TONE.nat },
    onclick: () => { S.natSrc = s; renderChips(); renderColumns(); },
  }, s === 'All' ? 'All national' : s)));
}
function renderColumns() {
  const f = S.feeds; if (!f) return;
  const nat = f.national.filter(i => (S.natSrc === 'All' || i.src === S.natSrc) && matches(i));
  const loc = f.local.filter(matches);
  const xf = f.x.filter(matches);
  fill('nat', nat); fill('loc', loc); fill('x', xf);
  const down = Object.entries(f.nationalStatus || {}).filter(([, v]) => !v.ok).map(([k]) => k);
  $('#m-nat').textContent = down.length ? `Couldn't reach: ${down.join(', ')}. They'll be retried on the next refresh.` : '';
  $('#m-loc').textContent = f.localError || (f.localMode === 'keywords' ? 'Picked by keywords. Add an AI key for smarter picks based on what does well on your account.' : '');
  const s = S.status;
  $('#m-x').textContent = f.xError === 'NO_KEYS' ? 'Add your X API keys to .env to load posts from ' + s.accounts.map(a => '@' + a).join(', ') + '.'
    : f.xError ? 'X feed error: ' + f.xError : Object.keys(f.xErrors || {}).length ? 'Some accounts failed: ' + Object.entries(f.xErrors).map(([k, v]) => `@${k} (${v})`).join('; ') : '';
}
function fill(col, items) {
  const body = $('#b-' + col);
  $('#n-' + col).textContent = items.length;
  if (!items.length) { body.replaceChildren(h('div', { class: 'empty' }, S.q ? 'No stories match your filter.' : col === 'x' && S.feeds.xError ? 'Nothing to show yet.' : 'No stories yet.')); return; }
  const els = items.map(it => {
    let c = S.cards.get(it.id);
    if (!c) { c = { item: it, el: buildCard(it, col) }; S.cards.set(it.id, c); }
    else c.item = it;
    return c.el;
  });
  body.replaceChildren(...els); // keeps existing card elements (and open drafts) intact
}

const io = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); loadPic(e.target); }
}, { rootMargin: '400px 0px' });
async function loadPic(el) {
  const c = S.cards.get(el.dataset.id); if (!c) return;
  const it = c.item;
  let src = it.image;
  if (!src) {
    try { const m = await api('/api/meta?url=' + encodeURIComponent(it.url)); src = m.image; if (m.url) it.realUrl = m.url; if (!it.summary && m.description) { it.summary = m.description; const s = el.querySelector('.sum'); if (s) s.textContent = m.description; } }
    catch { /* ignore */ }
  }
  const pic = el.querySelector('.pic');
  if (!src) { pic.remove(); return; }
  it.image = src;
  const img = pic.querySelector('img');
  img.onload = () => img.classList.add('ok');
  img.onerror = () => pic.remove();
  img.src = imgUrl(src);
}

function buildCard(it, col) {
  const tone = TONE[col];
  const isX = col === 'x';
  const el = h('article', { class: 'card', tabindex: '0', 'data-id': it.id, style: { '--tone': tone }, onfocusin: () => select(it.id, false) },
    isX ? null : h('div', { class: 'pic' }, h('img', { alt: '', loading: 'lazy', decoding: 'async' })),
    h('div', { class: 'meta' }, h('span', { class: 'pill', style: { '--c': SRC_RGB[it.src] || tone } }, it.src), h('span', {}, fmtTime(it.ts)), it.loc ? h('span', {}, '· ' + it.loc) : null,
      it.video ? h('span', { title: 'Footage likely exists' }, '· 🎥 video likely') : null),
    isX ? h('div', { class: 'x-text' }, it.title) : h('div', { class: 'title' }, it.title),
    !isX ? h('div', { class: 'sum' }, it.summary || '') : null,
    it.why ? h('div', { class: 'why' }, 'Why it fits: ' + it.why) : null,
    isX && it.metrics ? h('div', { class: 'stats', style: { marginTop: '6px' } }, ...[['likes', it.metrics.like_count], ['reposts', it.metrics.retweet_count], ['views', it.metrics.impression_count]].filter(([, v]) => v != null).map(([l, v]) => h('span', { class: 'stat' }, h('b', {}, fmtNum(v)), ' ' + l))) : null,
    h('div', { class: 'links' }, h('a', { href: it.url, target: '_blank', rel: 'noreferrer' }, isX ? 'Open on X ↗' : 'Open source ↗')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-tone gen-short', onclick: () => generate(it.id, 'short') }, 'Generate short post'),
      h('button', { class: 'btn btn-tone gen-long', onclick: () => generate(it.id, 'long') }, 'Generate long post')),
    h('div', { class: 'editor', hidden: true }));
  if (!isX) io.observe(el);
  return el;
}

// ---------- drafts ----------
function draftOf(id) { if (!S.drafts.has(id)) S.drafts.set(id, { mode: '', text: '', orig: '', media: null }); return S.drafts.get(id); }

async function generate(id, mode) {
  const c = S.cards.get(id); if (!c) return;
  const d = draftOf(id);
  const btn = c.el.querySelector(mode === 'short' ? '.gen-short' : '.gen-long');
  c.el.querySelectorAll('.gen-short,.gen-long').forEach(b => b.classList.toggle('active', b === btn));
  if (!S.status.keys.ai) {
    d.mode = mode; if (!d.text) d.text = d.orig = '';
    renderEditor(id, 'AI key missing: add AI_API_KEY to .env and restart to generate drafts. You can still type your own post here.');
    return;
  }
  btn.classList.add('busy');
  try {
    const r = await api('/api/generate', { method: 'POST', body: { item: c.item, mode } });
    Object.assign(d, { mode, text: r.text, orig: r.text });
    renderEditor(id, r.thin ? 'The article was blocked or thin, so this was written from the headline only. Double-check the facts.' : r.overlap >= 5 ? 'Heads up: this still shares some wording with the headline.' : '');
    c.el.querySelector('textarea')?.focus();
  } catch (e) { d.mode = d.mode || mode; renderEditor(id, 'Could not generate: ' + e.message, true); }
  finally { btn.classList.remove('busy'); }
}

function renderEditor(id, note = '', isErr = false) {
  const c = S.cards.get(id); const d = draftOf(id); const box = c.el.querySelector('.editor');
  box.hidden = false;
  const limit = 280;
  const ta = h('textarea', { rows: d.mode === 'long' ? 11 : 4, spellcheck: 'true', placeholder: 'Write or edit your post…' });
  ta.value = d.text;
  const counter = h('div', { class: 'counter' });
  const upd = () => {
    d.text = ta.value; const n = xLength(ta.value);
    counter.className = 'counter' + (n > limit && d.mode === 'short' ? ' over' : '');
    counter.replaceChildren(h('span', {}, `${n} / ${limit}`), h('span', {}, n > limit ? (d.mode === 'short' ? 'Too long for a standard post' : 'Over 280: needs X Premium on @' + S.status.username) : ''));
    pubBtn.disabled = !ta.value.trim() || (n > limit && d.mode === 'short');
  };
  ta.addEventListener('input', upd);
  const canPub = !(S.status && S.status.publish === false);
  ta.addEventListener('keydown', e => { if (canPub && (e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); openPublish(id); } });
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm' });
  file.addEventListener('change', () => { const f = file.files[0]; if (f) setMedia(id, f); });
  const preview = h('div', { class: 'preview' });
  if (d.media) preview.append(d.media.kind === 'video' ? h('video', { src: d.media.url, controls: true, playsinline: true }) : h('img', { src: d.media.url, alt: d.media.name }),
    h('button', { class: 'btn btn-ghost rm', onclick: () => { URL.revokeObjectURL(d.media.url); d.media = null; renderEditor(id); } }, 'Remove'),
    h('div', { class: 'small muted' }, `${d.media.name} · ${(d.media.file.size / 1048576).toFixed(1)} MB`));
  const pubBtn = h('button', { class: 'btn btn-strong', onclick: () => openPublish(id), title: 'Publish (Ctrl+Enter)' }, 'Publish');
  box.replaceChildren(
    ta, counter,
    canPub ? h('div', { class: 'attach' }, h('span', { class: 'muted' }, 'Attach photo or video:'), file) : '',
    preview,
    h('div', { class: 'actions' },
      canPub ? pubBtn : '',
      h('button', { class: 'btn btn-tone', onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch { toast('Copy blocked, select the text instead'); } } }, 'Copy'),
      h('button', { class: 'btn btn-tone', onclick: () => { d.text = d.orig; renderEditor(id); }, disabled: !d.orig }, 'Reset draft'),
      h('button', { class: 'btn btn-tone', onclick: () => openVideo(S.cards.get(id).item, d, { api, toast, imgUrl, setMedia: f => setMedia(id, f), status: S.status }) }, 'Generate Video'),
      h('button', { class: 'btn btn-ghost', onclick: () => generate(id, d.mode || 'short'), disabled: !S.status.keys.ai, title: 'Write a fresh version' }, 'Regenerate')),
    note ? h('div', { class: 'note' + (isErr ? ' err' : '') }, note) : null);
  upd();
}

function setMedia(id, f) {
  const d = draftOf(id);
  if (d.media) URL.revokeObjectURL(d.media.url);
  d.media = { file: f, url: URL.createObjectURL(f), kind: f.type.startsWith('video') ? 'video' : 'image', name: f.name || 'video' };
  renderEditor(id, f.type === 'video/webm' ? 'WebM video: X needs MP4. The app will convert it when you publish if ffmpeg is installed.' : '');
}

// ---------- publish ----------
let pubCtx = null;
function openPublish(id) {
  if (S.status && S.status.publish === false) return toast('Posting to X is off on this shared version. Use Copy instead.');
  const d = draftOf(id); const text = d.text.trim();
  if (!text) return toast('Write something first');
  pubCtx = { id };
  $('#pubText').textContent = text;
  const n = xLength(text);
  $('#pubMeta').textContent = `${n} characters${d.media ? ' · with ' + d.media.kind + ': ' + d.media.name : ' · no media'}`;
  $('#pubMedia').replaceChildren(d.media ? (d.media.kind === 'video' ? h('video', { src: d.media.url, controls: true }) : h('img', { src: d.media.url, alt: '' })) : '');
  const warns = [];
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|news|tv|co)\b/i.test(text)) warns.push('This post contains a link. X bills posts with a URL at $0.20 instead of $0.015.');
  if (n > 280) warns.push('Over 280 characters: this only works if @' + S.status.username + ' has X Premium.');
  if (!S.status.keys.xPost && !S.status.dryRun) warns.push('Publishing is off: add the four X OAuth 1.0a keys to .env and restart.');
  $('#pubWarn').hidden = !warns.length; $('#pubWarn').textContent = warns.join(' ');
  $('#pubStatus').textContent = S.status.dryRun ? 'DRY RUN: nothing will actually be posted.' : '';
  $('#pubGo').disabled = !S.status.keys.xPost && !S.status.dryRun;
  $('#pubGo').textContent = S.status.dryRun ? 'Test post (dry run)' : 'Post to X';
  $('#publishDlg').showModal();
}
$('#pubGo').addEventListener('click', async e => {
  e.preventDefault();
  const id = pubCtx?.id; if (!id) return;
  const d = draftOf(id); const go = $('#pubGo'); const st = $('#pubStatus');
  go.classList.add('busy');
  try {
    const media_ids = [];
    if (d.media) {
      let file = d.media.file;
      if (file.type === 'video/webm') { st.textContent = 'Converting video to MP4…'; const r = await api('/api/convert', { method: 'POST', body: file, headers: { 'Content-Type': 'video/webm' }, raw: true }); file = new File([await r.blob()], 'video.mp4', { type: 'video/mp4' }); }
      st.textContent = 'Uploading ' + d.media.kind + ' to X…';
      const up = await api('/api/upload', { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      media_ids.push(up.media_id);
    }
    st.textContent = 'Posting…';
    const r = await api('/api/publish', { method: 'POST', body: { text: d.text.trim(), media_ids } });
    $('#publishDlg').close();
    if (r.dryRun) { toast('Dry run OK: the post was not sent'); return; }
    toast('Posted to @' + S.status.username, 4000);
    const c = S.cards.get(id); c.el.querySelector('.editor').append(h('div', { class: 'note' }, 'Posted ✓ ', h('a', { href: r.url, target: '_blank', rel: 'noreferrer' }, 'View on X ↗')));
  } catch (err) { st.textContent = 'Failed: ' + err.message; st.className = 'small note err'; }
  finally { go.classList.remove('busy'); }
});

// ---------- loading / refresh ----------
async function loadFeeds() {
  const f = await api('/api/feeds');
  const changed = JSON.stringify(f.updated) !== JSON.stringify(S.feeds?.updated);
  S.feeds = f;
  if (changed || !S.lastUpdated) { renderTrending(); renderTop(); renderColumns(); }
  S.lastUpdated = Math.max(f.updated.news || 0, f.updated.x || 0, f.updated.trends || 0);
  renderUpdated();
}
function renderUpdated() {
  if (!S.feeds) return;
  const next = S.feeds.updated.news + S.status.refresh.news * 60e3 - Date.now();
  $('#updated').textContent = `Updated ${ago(S.feeds.updated.news)} · next in ${Math.max(0, Math.ceil(next / 60e3))}m`;
}
async function refreshNow() {
  const b = $('#refresh'); b.classList.add('spinning'); b.disabled = true;
  try { await api('/api/refresh', { method: 'POST' }); await loadFeeds(); toast('Stories refreshed'); }
  catch (e) { toast('Refresh failed: ' + e.message); }
  finally { b.classList.remove('spinning'); b.disabled = false; }
}

// ---------- selection + shortcuts ----------
function select(id, scroll = true) {
  if (S.sel === id) return;
  S.cards.get(S.sel)?.el.classList.remove('sel');
  S.sel = id; const c = S.cards.get(id); if (!c) return;
  c.el.classList.add('sel'); if (scroll) { c.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); c.el.focus({ preventScroll: true }); }
}
function move(dir) {
  const cards = [...document.querySelectorAll('.col-body .card, .trend-row')];
  if (!cards.length) return;
  const cur = S.sel ? S.cards.get(S.sel)?.el : null;
  let i = cur ? cards.indexOf(cur) : -1;
  // stay inside the current column
  const colBody = cur?.parentElement;
  const list = colBody ? [...colBody.querySelectorAll('.card, .trend-row')] : cards;
  i = cur ? list.indexOf(cur) : -1;
  const next = list[Math.min(list.length - 1, Math.max(0, i + dir))];
  if (next) select(next.dataset.id);
}
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (document.querySelector('dialog[open]')) return;
  if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === '/') { e.preventDefault(); $('#q').focus(); }
  else if (k === 'r') refreshNow();
  else if (k === '?') $('#helpDlg').showModal();
  else if (['1', '2', '3'].includes(k)) { const col = ['nat', 'loc', 'x'][+k - 1]; const first = $('#b-' + col + ' .card'); $('#col-' + col).scrollIntoView({ behavior: 'smooth', block: 'start' }); if (first) select(first.dataset.id); }
  else if (k === 'j') move(1); else if (k === 'k') move(-1);
  else if ((k === 's' || k === 'l') && S.sel) generate(S.sel, k === 's' ? 'short' : 'long');
  else if (k === 'v' && S.sel) { const d = draftOf(S.sel); openVideo(S.cards.get(S.sel).item, d, { api, toast, imgUrl, setMedia: f => setMedia(S.sel, f), status: S.status }); }
});
let qT; $('#q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value; renderTrending(); renderColumns(); }, 120); });
$('#refresh').addEventListener('click', refreshNow);
$('#help').addEventListener('click', () => $('#helpDlg').showModal());

// ---------- PWA ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#install').hidden = false; });
$('#install').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#install').hidden = true; });
window.addEventListener('appinstalled', () => { $('#install').hidden = true; toast('Installed. Open it from your Chrome apps or desktop.'); });

// ---------- boot ----------
async function boot() {
  for (const col of ['nat', 'loc', 'x']) $('#b-' + col).replaceChildren(...Array.from({ length: 3 }, () => h('div', { class: 'skeleton' })));
  for (const plat of TREND_PLATFORMS) $('#b-trend-' + plat)?.replaceChildren(h('div', { class: 'trend-empty muted' }, 'Loading…'));
  renderChips();
  try { S.status = await api('/api/status'); renderStatus(); }
  catch { $('#notices').replaceChildren(h('div', { class: 'notice' }, 'Cannot reach the app server. Is it running? Start it with "npm start" in the app folder.')); return; }
  try { await loadFeeds(); } catch (e) { toast('Could not load stories: ' + e.message); }
  if (new URLSearchParams(location.search).has('refresh')) refreshNow();
  setInterval(() => loadFeeds().catch(() => {}), 60e3); // server refreshes every N min; we pick it up
  setInterval(renderUpdated, 30e3);
}
boot();
