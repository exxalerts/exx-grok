import dns from 'node:dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch { /* older node */ }
// News feeds: RSS for national outlets, Google News searches for local stories,
// Google News link decoding, and article metadata (og:image, summary, paragraphs).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

export const NATIONAL_FEEDS = {
  'Fox News': 'https://moxie.foxnews.com/google-publisher/latest.xml',
  'CNN': 'https://www.cnn.com/sitemap/news.xml', // direct links with photos (Google News links can't be decoded from cloud hosts)
  'ABC News': 'https://abcnews.go.com/abcnews/topstories',
  'NBC News': 'https://feeds.nbcnews.com/nbcnews/public/news',
  'The Independent': 'https://www.independent.co.uk/us/rss',
  'Axios': 'https://api.axios.com/feed/',
  'The Hill': 'https://thehill.com/feed/',
  'Associated Press': 'https://news.google.com/rss/search?q=site:apnews.com+when:6h&hl=en-US&gl=US&ceid=US:en',
};
const NATIONAL_NAMES = ['fox news', 'cnn', 'abc news', 'nbc news', 'the independent', 'axios', 'the hill', 'associated press', 'ap news'];

// Searches that surface the kind of local stories that do well on @EXXAlerts
// (police/bodycam/911, bizarre crime, viral local incidents, place-tagged hooks).
export const LOCAL_QUERIES = [
  'bodycam footage released', 'police say man arrested', 'sheriff deputies arrested', 'woman arrested accused',
  'caught on video police', 'charged with murder', '911 call released', 'Florida man arrested', 'Florida woman arrested',
  'Texas police arrest', 'California police arrest', 'road rage shooting', 'dog attack', 'police chase crash',
  'surveillance video shows', 'teacher arrested', 'stolen car chase', 'deputy shot', 'bizarre arrest', 'mugshot',
];

export async function get(url, { timeout = 15000, headers = {}, method = 'GET', body, as = 'text' } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method, body, redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers } });
    const data = as === 'buffer' ? Buffer.from(await r.arrayBuffer()) : await r.text();
    return { ok: r.ok, status: r.status, url: r.url, type: r.headers.get('content-type') || '', data, cookies: (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map(c => c.split(';')[0]).join('; ') };
  } finally { clearTimeout(t); }
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…' };
export function unescape(s = '') {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, c) => {
    if (c[0] === '#') { const n = c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[c.toLowerCase()] ?? m;
  });
}
const cdata = s => (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const strip = s => unescape(cdata(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1] : ''; };
const attr = (xml, t, a) => { const m = xml.match(new RegExp(`<${t}[^>]*\\s${a}=["']([^"']+)["']`, 'i')); return m ? unescape(m[1]) : ''; };

export function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = strip(tag(b, 'title'));
    let link = strip(tag(b, 'link')) || attr(b, 'link', 'href');
    const date = strip(tag(b, 'pubDate')) || strip(tag(b, 'published')) || strip(tag(b, 'updated')) || strip(tag(b, 'dc:date'));
    const ts = Date.parse(date);
    if (!title || !link || !Number.isFinite(ts)) continue;
    const desc = strip(tag(b, 'description') || tag(b, 'summary')).slice(0, 500);
    const source = strip(tag(b, 'source'));
    const image = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || (/<enclosure[^>]+type=["']image/i.test(b) ? attr(b, 'enclosure', 'url') : '');
    items.push({ title, link, ts, desc, source, sourceUrl: attr(b, 'source', 'url'), image: /\.(mp4|mp3|m3u8)(\?|$)/i.test(image) ? '' : image });
  }
  if (!blocks.length) { // Google News sitemap format (<url><loc>, <news:title>, <image:loc>)
    for (const b of xml.match(/<url>[\s\S]*?<\/url>/gi) || []) {
      const title = strip(tag(b, 'news:title')), link = strip(tag(b, 'loc'));
      const ts = Date.parse(strip(tag(b, 'news:publication_date')));
      if (!title || !link || !Number.isFinite(ts) || /\/(cnn-underscored|videos?)\//.test(link)) continue;
      items.push({ title, link, ts, desc: '', source: '', image: strip(tag(b, 'image:loc')) });
    }
  }
  return items;
}

const idOf = (src, link) => Buffer.from(src + '|' + link).toString('base64url').slice(-24);

export async function fetchNational({ hours = 12, max = 80 } = {}) {
  const cut = Date.now() - hours * 3600e3;
  const status = {};
  const all = [];
  await Promise.all(Object.entries(NATIONAL_FEEDS).map(async ([src, url]) => {
    try {
      const r = await get(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const items = parseRss(r.data).filter(i => i.ts >= cut && i.ts <= Date.now() + 10 * 60e3); // drop stale and mis-dated (future) items
      for (const i of items) {
        let title = i.title;
        if (url.includes('news.google.com')) title = title.replace(/\s+-\s+[^-]+$/, '');
        if (/^(sitemap|cnn video|video:|watch:|live updates?:?$)/i.test(title) || /\/sitemap\//.test(i.link)) continue;
        // Google News descriptions are just the linked title again; drop them.
        const desc = url.includes('news.google.com') ? '' : i.desc;
        all.push({ id: idOf(src, i.link), kind: 'national', src, title, summary: desc, url: i.link, ts: i.ts, image: i.image || '' });
      }
      status[src] = { ok: true, count: items.length };
    } catch (e) { status[src] = { ok: false, error: String(e.message || e) }; }
  }));
  const seen = new Set();
  const out = all.sort((a, b) => b.ts - a.ts).filter(i => { const k = i.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, max);
  return { items: out, status };
}

const LOCAL_HOOK = /(bodycam|body cam|911|caught on (video|camera)|video shows|surveillance|arrest|charged|accused|police|deputies|sheriff|chase|shot|stabb|kill|murder|crash|attack|rescue|stolen|naked|bizarre|dog|alligator|bear|snake|teacher|mugshot|road rage|DUI|fire)/i;
const PLACE = /\b(Florida|Texas|California|Ohio|Georgia|Arizona|Nevada|New York|Michigan|Pennsylvania|Carolina|Tennessee|Alabama|Louisiana|Colorado|Washington|Oregon|Illinois|Indiana|Kentucky|Missouri|Oklahoma|Virginia|Iowa|Utah|county|city|town|beach)\b/i;

export async function fetchLocalCandidates({ hours = 3 } = {}) {
  const cut = Date.now() - hours * 3600e3;
  const seen = new Set();
  const rows = [];
  await Promise.all(LOCAL_QUERIES.map(async q => {
    try {
      const u = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:3h') + '&hl=en-US&gl=US&ceid=US:en';
      const r = await get(u);
      for (const i of parseRss(r.data)) {
        if (i.ts < cut || i.ts > Date.now() + 10 * 60e3) continue;
        const src = i.source || (i.title.match(/\s-\s([^-]+)$/) || [])[1] || 'Local news';
        if (NATIONAL_NAMES.includes(src.toLowerCase())) continue; // national outlets live in column 1
        if (/^(facebook|youtube|x|twitter|instagram|tiktok|reddit|msn|yahoo)/i.test(src)) continue; // want real local outlets
        const title = i.title.replace(/\s+-\s+[^-]+$/, '');
        const key = title.toLowerCase().slice(0, 70);
        if (seen.has(key)) continue;
        seen.add(key);
        const score = (LOCAL_HOOK.test(title) ? 2 : 0) + (PLACE.test(title) ? 1 : 0) + (/video|bodycam|911/i.test(title) ? 2 : 0);
        rows.push({ id: idOf(src, i.link), kind: 'local', src, title, summary: '', url: i.link, ts: i.ts, image: '', score });
      }
    } catch { /* one search failing is fine */ }
  }));
  return rows.sort((a, b) => b.ts - a.ts);
}

// ---- Google News article links -> publisher URL ----
const gcache = new Map();
// Google rate-limits bursts from cloud IPs, so decode a few at a time and retry once.
let gActive = 0; const gQueue = [];
async function gSlot(fn) {
  if (gActive >= 2) await new Promise(r => gQueue.push(r));
  gActive++;
  try { return await fn(); } finally { gActive--; const n = gQueue.shift(); if (n) n(); }
}
async function decodeOnce(url, gid) {
  const page = await get(`https://news.google.com/rss/articles/${gid}`);
  const sg = (page.data.match(/data-n-a-sg="([^"]+)"/) || [])[1];
  const ts = (page.data.match(/data-n-a-ts="([^"]+)"/) || [])[1];
  if (!sg || !ts) throw new Error(`Google News page had no decode tokens (HTTP ${page.status}, ${String(page.url).slice(0, 60)})`);
  const req = [['Fbv4je', `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${gid}",${ts},"${sg}"]`]];
  const r = await get('https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je&hl=en-US&gl=US', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Origin: 'https://news.google.com', Referer: 'https://news.google.com/', 'X-Same-Domain': '1', ...(page.cookies ? { Cookie: page.cookies } : {}) },
    body: new URLSearchParams({ 'f.req': JSON.stringify([req]) }).toString(),
  });
  if (!r.ok) { const ip = (String(r.data).match(/IP address:\s*([0-9a-f.:]+)/i) || [])[1]; throw new Error(`Google News decode HTTP ${r.status}${ip ? ' (' + (ip.includes(':') ? 'IPv6' : 'IPv4') + ')' : ''}`); }
  const body = r.data.split('\n\n')[1];
  let real;
  try { real = JSON.parse(JSON.parse(body)[0][2])[1]; } catch { throw new Error('Google News decode reply not understood'); }
  if (!/^https?:\/\//.test(real || '')) throw new Error('Google News decode returned no URL');
  return real;
}
export async function decodeGoogleNews(url) {
  if (!/news\.google\.com\/(rss\/)?articles\//.test(url)) return url;
  if (gcache.has(url)) return gcache.get(url);
  const gid = url.split('/articles/')[1].split('?')[0];
  const real = await gSlot(async () => {
    try { return await decodeOnce(url, gid); }
    catch (e) { await new Promise(r => setTimeout(r, 1500)); return decodeOnce(url, gid); }
  });
  gcache.set(url, real);
  return real;
}

// ---- Article metadata ----
const meta = new Map(); // url -> {t, data}
function metaTag(html, names) {
  for (const n of names) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${n}["']`, 'i');
    const m = html.match(re1) || html.match(re2);
    if (m) return unescape(m[1]).trim();
  }
  return '';
}
// ---- Article text extraction ----
const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9', 'Upgrade-Insecure-Requests': '1', 'Cache-Control': 'no-cache',
  'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
  'sec-ch-ua': '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="24"', 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"',
};
const JUNK = /^\[[A-Z ]+:|cookie|subscribe|newsletter|sign up|sign in|log in|all rights reserved|advertis|javascript|your browser|download (our|the) app|follow us|copyright|terms of (use|service)|privacy policy|email alerts|click here|share this|related:|read more:|watch:|^photo:|getty images|\bAP Photo\b/i;
const MAX_PARAS = 80, MAX_CHARS = 20000; // whole article, generous budget
function budget(ps) {
  const out = []; let n = 0; const seen = new Set();
  for (const p of ps) {
    const k = p.toLowerCase().slice(0, 80);
    if (seen.has(k)) continue; seen.add(k);
    if (n + p.length > MAX_CHARS || out.length >= MAX_PARAS) break;
    out.push(p); n += p.length;
  }
  return out;
}
function ldArticleBody(html) {
  let best = '', headline = '', date = '';
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const stack = [j];
    while (stack.length) {
      const o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      if (Array.isArray(o)) { stack.push(...o); continue; }
      if (typeof o.articleBody === 'string' && o.articleBody.length > best.length) { best = o.articleBody; headline = o.headline || headline; date = o.datePublished || date; }
      for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v);
    }
  }
  if (!best) return [];
  const text = unescape(best.replace(/<[^>]+>/g, '\n'));
  let ps = text.split(/\n+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x.length > 30);
  if (ps.length <= 2 && text.length > 600) ps = (text.match(/[^.!?]+[.!?]+["”’]?(\s+|$)/g) || [text]).reduce((a, sen) => { const l = a[a.length - 1]; if (l && l.length < 280) a[a.length - 1] = (l + ' ' + sen.trim()).trim(); else a.push(sen.trim()); return a; }, []);
  return ps.filter(x => !JUNK.test(x));
}
function htmlParagraphs(html) {
  let h = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|figure|figcaption|iframe)[\s\S]*?<\/\1>/gi, ' ');
  const regions = [
    /<[^>]+itemprop=["']articleBody["'][^>]*>([\s\S]*)/i,
    /<[^>]+class=["'][^"']*(article-body|article__body|articleBody|story-body|story__body|entry-content|post-content|article-content|body-text|RichTextStoryBody|article__content|news-content)[^"']*["'][^>]*>([\s\S]*)/i,
    /<article[\s>]([\s\S]*?)<\/article>/i,
    /<main[\s>]([\s\S]*?)<\/main>/i,
  ];
  for (const re of regions) { const m = h.match(re); if (m) { const part = m[m.length - 1]; if ((part.match(/<p[\s>]/gi) || []).length >= 3) { h = part; break; } } }
  return [...h.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => strip(m[1])).filter(p => p.length > 40 && !JUNK.test(p));
}
export function extractArticle(html = '') {
  const ld = ldArticleBody(html), hp = htmlParagraphs(html);
  const len = a => a.join(' ').length;
  const useLd = len(ld) >= len(hp) * 0.8 && len(ld) > 200;
  const paragraphs = budget(useLd ? ld : hp);
  return { paragraphs, via: useLd ? 'json-ld' : 'html', chars: len(paragraphs) };
}
export const textChars = art => (art?.paragraphs || []).join(' ').length;

async function fetchArticle(real) {
  const r = await get(real, { timeout: 15000, headers: BROWSER_HEADERS });
  let html = r.data || '', ex = extractArticle(html), finalUrl = r.url || real, status = r.status;
  // AMP copy if the page is thin and advertises one
  const amp = (html.match(/<link[^>]+rel=["']amphtml["'][^>]*href=["']([^"']+)["']/i) || html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']amphtml["']/i) || [])[1];
  if (ex.chars < 800 && amp) {
    try { const a = await get(new URL(unescape(amp), finalUrl).href, { timeout: 12000, headers: BROWSER_HEADERS }); const ea = extractArticle(a.data || ''); if (ea.chars > ex.chars) ex = { ...ea, via: 'amp' }; } catch { /* ignore */ }
  }
  return { ok: r.ok, status, finalUrl, html, ex };
}

export async function articleMeta(url, { fresh = false } = {}) {
  const c = meta.get(url);
  // fresh: used by Generate. Reuse a cached copy only if it already holds a full article body.
  if (c && Date.now() - c.t < 6 * 3600e3 && (!fresh || (!c.data.blocked && textChars(c.data) >= 1500))) return c.data;
  if (fresh && c?.data?.decodeError) gcache.delete(url);
  let real = url, decodeError = '';
  try { real = await decodeGoogleNews(url); } catch (e) { decodeError = String(e.message || e); }
  let data = { url: real, image: '', description: '', paragraphs: [], blocked: false };
  if (decodeError) { // a Google News page only carries Google's own logo, so don't show it as the story photo
    data = { ...data, blocked: true, decodeError };
    meta.set(url, { t: Date.now() - 6 * 3600e3 + 5 * 60e3, data }); // retry after 5 minutes
    console.warn('google news decode failed:', decodeError);
    return data;
  }
  try {
    const { ok, status, finalUrl, html, ex } = await fetchArticle(real);
    if (!ok) { data.blocked = true; data.status = status; }
    let image = ok ? metaTag(html, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) : '';
    if (image && image.startsWith('/')) image = new URL(image, finalUrl).href;
    data = { ...data, url: finalUrl, image, description: ok ? metaTag(html, ['og:description', 'description', 'twitter:description']) : '', paragraphs: ok ? ex.paragraphs : [], via: ex.via };
  } catch (e) { data.blocked = true; data.error = String(e.message || e); }
  meta.set(url, { t: Date.now(), data });
  if (meta.size > 1500) meta.delete(meta.keys().next().value);
  return data;
}

// ---- Other outlets' coverage of the same story (used when the original page is blocked or thin) ----
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const STOP = new Set('a an the of to in on at for and or but with by from as is are was were be been who whom that this after before over into his her their its he she they it says said say new video police man woman'.split(' '));
export async function findCoverage(title, { exclude = '', want = 900, tries = 4 } = {}) {
  const clean = title.replace(/["“”‘’']/g, '').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ');
  const keys = words.filter(w => !STOP.has(w.toLowerCase().replace(/[^a-z0-9]/gi, '')));
  const queries = [...new Set([words.slice(0, 16).join(' ') + ' when:7d', keys.slice(0, 8).join(' '), keys.slice(0, 5).join(' ')])];
  const ex = hostOf(exclude);
  const sig = keys.slice(0, 6).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(w => w.length > 2);
  const seen = new Set(), items = [];
  for (const q of queries) {
    try {
      const r = await get('https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-US&gl=US&ceid=US:en', { timeout: 10000 });
      for (const i of parseRss(r.data || '')) {
        const h = hostOf(i.sourceUrl) || i.source;
        const tw = new Set(i.title.toLowerCase().replace(/["“”‘’']/g, '').split(/[^a-z0-9]+/));
        const hit = sig.filter(w => tw.has(w)).length / (sig.length || 1);
        if ((ex && h === ex) || seen.has(h) || hit < 0.5 || Date.now() - i.ts > 365 * 864e5) continue;
        seen.add(h); items.push(i);
      }
    } catch (e) { console.warn("coverage search failed:", String(e.message || e)); }
    if (items.length >= tries) break;
  }
  const tried = [];
  for (const i of items.slice(0, tries)) {
    let real;
    try { real = await decodeGoogleNews(i.link); } catch (e) { tried.push({ src: i.source, error: 'decode: ' + String(e.message || e).slice(0, 80) }); continue; }
    try {
      const f = await fetchArticle(real);
      tried.push({ src: i.source, url: f.finalUrl, status: f.status, chars: f.ex.chars });
      if (f.ok && f.ex.chars >= want) return { url: f.finalUrl, src: i.source, date: new Date(i.ts).toISOString().slice(0, 10), title: i.title, paragraphs: f.ex.paragraphs, tried };
    } catch (e) { tried.push({ src: i.source, url: real, error: String(e.message || e).slice(0, 80) }); }
  }
  return { url: '', paragraphs: [], tried };
}
