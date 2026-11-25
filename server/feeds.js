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

// Strictly political US news: dedicated politics sections (not general news desks).
export const POLITICAL_FEEDS = {
  'The Hill': 'https://thehill.com/homenews/feed/',
  'Fox Politics': 'https://moxie.foxnews.com/google-publisher/politics.xml',
  'NBC Politics': 'https://feeds.nbcnews.com/nbcnews/public/politics',
  'ABC Politics': 'https://abcnews.go.com/abcnews/politicsheadlines',
  'CBS Politics': 'https://www.cbsnews.com/latest/rss/politics',
  'Washington Post': 'https://feeds.washingtonpost.com/rss/politics',
  'NPR Politics': 'https://feeds.npr.org/1014/rss.xml',
  'Associated Press': 'https://news.google.com/rss/search?q=site:apnews.com+(politics+OR+election+OR+congress+OR+%22white+house%22+OR+senate+OR+house)+when:12h&hl=en-US&gl=US&ceid=US:en',
};
// Crime / weather / sports / entertainment / lifestyle, plus opinion/commentary labels.
const POL_SKIP = /\b(opinion|op-ed|editorial|commentary|analysis:|column:|weather|forecast|hurricane|tornado|sports?|nfl|nba|mlb|nhl|soccer|football game|entertainment|hollywood|celebrity|box office|oscars|grammys|album|movie review|crime blotter|mugshot|bodycam|road rage|dog attack|alligator)\b/i;
const POL_KEEP = /\b(trump|biden|obama|harris|vance|newsom|desantis|schumer|jeffries|mcconnell|johnson|pelosi|congress|senate|senator|house|representative|gop|republican|democrat|democratic|white house|oval office|capitol|election|elect(ed|s|ing)?|campaign|primary|ballot|vote[rs]?|polling|impeach|filibuster|supreme court|scotus|justice department|doj|attorney general|cabinet|governor|mayor|legislation|bill|veto|pardon|inauguration|midterm|presidency|presidential|politic)\b/i;

export async function fetchPolitical({ hours = 18, max = 40, excludeTitles = [] } = {}) {
  const cut = Date.now() - hours * 3600e3;
  const taken = new Set(excludeTitles.map(t => String(t).toLowerCase().replace(/\s+/g, ' ').trim()));
  const all = [], status = {};
  await Promise.all(Object.entries(POLITICAL_FEEDS).map(async ([src, feed]) => {
    try {
      const r = await get(feed);
      status[src] = { ok: r.ok, status: r.status };
      if (!r.ok) return;
      for (const i of parseRss(r.data)) {
        if (i.ts < cut || i.ts > Date.now() + 10 * 60e3) continue;
        let title = i.title.replace(/\s+-\s+[^-]+$/, '');
        if (POL_SKIP.test(title) || !POL_KEEP.test(title)) continue;
        if (/election live results/i.test(title) || title.split(/\s+/).length < 5) continue;
        const key = title.toLowerCase().replace(/\s+/g, ' ').trim();
        if (taken.has(key)) continue;
        taken.add(key);
        const url = i.link;
        all.push({ id: idOf('pol|' + src, url), kind: 'political', src, title, summary: i.desc || '', url, ts: i.ts, image: i.image || '', pubUrl: /news\.google\.com/.test(url) ? '' : url });
      }
    } catch (e) { status[src] = { ok: false, status: 0, error: String(e.message || e) }; }
  }));
  const out = all.sort((a, b) => b.ts - a.ts).slice(0, max);
  return { items: out, status };
}

// World/international news in the @EXXAlerts vein: crime, attacks, disasters, accidents,
// viral/shocking incidents and major world events — not dry diplomacy, business, opinion or sports.
export const INTERNATIONAL_FEEDS = {
  'BBC World': 'https://feeds.bbci.co.uk/news/world/rss.xml',
  'Fox World': 'https://moxie.foxnews.com/google-publisher/world.xml',
  'NBC World': 'https://feeds.nbcnews.com/nbcnews/public/world',
  'ABC World': 'https://abcnews.go.com/abcnews/internationalheadlines',
  'CBS World': 'https://www.cbsnews.com/latest/rss/world',
  'Sky News': 'https://feeds.skynews.com/feeds/rss/world.xml',
  'Al Jazeera': 'https://www.aljazeera.com/xml/rss/all.xml',
  'The Independent': 'https://www.independent.co.uk/news/world/rss',
  'Associated Press': 'https://news.google.com/rss/search?q=site:apnews.com+(world+OR+international+OR+ukraine+OR+israel+OR+gaza+OR+iran+OR+china+OR+russia)+when:12h&hl=en-US&gl=US&ceid=US:en',
  'Reuters': 'https://news.google.com/rss/search?q=site:reuters.com+(world+OR+international)+when:12h&hl=en-US&gl=US&ceid=US:en',
};
const INT_SKIP = /\b(opinion|op-ed|editorial|commentary|analysis:|column:|sports?|nfl|nba|mlb|nhl|premier league|cricket|tennis|soccer match|entertainment|hollywood|celebrity|box office|album|movie review|stock[s]?|markets?|shares|nasdaq|dow jones|s&p|gdp|inflation|earnings|trade deal|tariffs?|diplomacy|diplomat[s]?|summit agenda|minister meets|business news|recipe|horoscope)\b/i;
const INT_KEEP = /\b(attack|airstrike|air strike|missile|rocket|bomb(?:ing|ed)?|explosion|exploded|blast|crash(?:ed)?|collision|kill(?:ed|ing|s)?|dead|death|died|murder(?:ed)?|stabb(?:ed|ing)|shot|shooting|gunman|hostage|hijack(?:ed|ing)?|kidnap(?:ped|ping)?|abduct(?:ed|ion)?|earthquake|tsunami|flood(?:ing|ed)?|hurricane|typhoon|cyclone|wildfire|volcano|disaster|collaps(?:e|ed)|sank|sinking|plane|aircraft|derail(?:ed|ment)?|evacuat(?:e|ed|ion)|riot|clash(?:es)?|troops|soldiers?|war\b|invasion|siege|coup|assassina(?:te|ted|tion)|casualt(?:y|ies)|wounded|injured|rescue(?:d)?|arrest(?:ed)?|charged|executed|terror(?:ist|ism)?|militant|rebel[s]?|massacre|famine|outbreak|pandemic|ferry|assault|r\*pe|rape|behead|drone|shelling|bombard(?:ed|ment)?|pirat(?:e|es|cy)|seized|missing|refugees?|nuclear|missile)\b/i;
// US domestic politics/crime belongs in National/Political/Local — keep a story only if it has a foreign hook too.
const INT_US_ONLY = /\b(congress|senate|white house|gop|republican|democrat|supreme court|doj|fbi|ice raids?|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;
const INT_WORLD = /\b(ukraine|israel|gaza|iran|russia|china|taiwan|north korea|south korea|japan|india|pakistan|syria|yemen|lebanon|turkey|egypt|sudan|nigeria|kenya|ethiopia|mexico|canada|brazil|argentina|venezuela|colombia|uk\b|britain|british|england|france|germany|italy|spain|poland|australia|new zealand|europe|africa|asia|middle east|un\b|united nations|nato|eu\b|embassy|foreign|worldwide|global|international|libya|iraq|afghanistan|haiti|cuba|philippines|indonesia|thailand|vietnam|saudi|qatar|uae|dubai|moscow|kyiv|tehran|beijing|gaza|west bank|houthis?|hezbollah|hamas|idf|putin|zelensky|netanyahu|xi jinping)\b/i;

export async function fetchInternational({ hours = 18, max = 40, excludeTitles = [] } = {}) {
  const cut = Date.now() - hours * 3600e3;
  const taken = new Set(excludeTitles.map(t => String(t).toLowerCase().replace(/\s+/g, ' ').trim()));
  const all = [], status = {};
  await Promise.all(Object.entries(INTERNATIONAL_FEEDS).map(async ([src, feed]) => {
    try {
      const r = await get(feed);
      status[src] = { ok: r.ok, status: r.status };
      if (!r.ok) return;
      for (const i of parseRss(r.data)) {
        if (i.ts < cut || i.ts > Date.now() + 10 * 60e3) continue;
        let title = i.title.replace(/\s+-\s+[^-]+$/, '');
        if (INT_SKIP.test(title) || !INT_KEEP.test(title)) continue;
        if (INT_US_ONLY.test(title) && !INT_WORLD.test(title)) continue;
        if (title.split(/\s+/).length < 5) continue;
        const key = title.toLowerCase().replace(/\s+/g, ' ').trim();
        if (taken.has(key)) continue;
        taken.add(key);
        const url = i.link;
        all.push({ id: idOf('int|' + src, url), kind: 'international', src, title, summary: i.desc || '', url, ts: i.ts, image: i.image || '', pubUrl: /news\.google\.com/.test(url) ? '' : url });
      }
    } catch (e) { status[src] = { ok: false, status: 0, error: String(e.message || e) }; }
  }));
  const out = all.sort((a, b) => b.ts - a.ts).slice(0, max);
  return { items: out, status };
}


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
    const r = await fetch(url, { method, body, redirect: 'follow', signal: ctl.signal, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", "Cache-Control": "no-cache", ...headers }});
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
        rows.push({ id: idOf(src, i.link), kind: 'local', src, srcUrl: i.sourceUrl || '', title, summary: '', url: i.link, ts: i.ts, image: '', score });
      }
    } catch { /* one search failing is fine */ }
  }));
  await attachBingPhotos(rows).catch(() => {});
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
function ldImage(html) { // JSON-LD "image" of a NewsArticle, used when a page has no og:image
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const im = m[1].match(/"image"\s*:\s*(?:\[\s*)?(?:\{[^}]*?"url"\s*:\s*)?"(https?:[^"]+)"/);
    if (im) return im[1].replace(/\\\//g, '/');
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

// ---- Fallback when Google News links can't be decoded (Google rate-limits cloud servers like Render) ----
// Bing News RSS lists the same stories with the publisher's own URL and a lead-photo thumbnail.
const bingCache = new Map();
const tokens = t => new Set(String(t).toLowerCase().replace(/&[a-z#0-9]+;/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2));
const normSrc = s => String(s || '').toLowerCase().replace(/\bon msn\b/, '').replace(/[^a-z0-9]+/g, '');
let bActive = 0; const bQueue = [];
async function bSlot(fn) {
  if (bActive >= 3) await new Promise(r => bQueue.push(r));
  bActive++;
  try { return await fn(); } finally { bActive--; const n = bQueue.shift(); if (n) n(); }
}
// Google News links can't be opened from Render (rate-limited), so Local cards had no photos. Run the same searches
// on Bing News, whose results carry the lead photo and the publisher's URL, and attach them to matching stories.
async function bingItems(q) {
  const r = await bSlot(() => get('https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=rss&mkt=en-US&qft=sortbydate%3d%221%22', { timeout: 10000 }));
  const out = [];
  for (const b of (r.data || '').match(/<item>[\s\S]*?<\/item>/gi) || []) {
    const t = strip(tag(b, 'title')), link = unescape(strip(tag(b, 'link')));
    let real = ''; try { real = new URL(link).searchParams.get('url') || link; } catch { continue; }
    out.push({ title: t, tt: tokens(t), url: real, image: unescape(strip(tag(b, 'News:Image'))), source: strip(tag(b, 'News:Source')) });
  }
  return out;
}
const bigThumb = u => u ? u.replace(/^http:/, 'https:').replace(/&pid=News$/, '') + '&w=700&h=394&c=7&pid=News' : '';
function bestMatch(title, src, pool, min = 0.6) {
  const want = tokens(title), ws = normSrc(src);
  let best = null;
  for (const b of pool) {
    const hit = [...want].filter(w => b.tt.has(w)).length / (want.size || 1);
    const ns = normSrc(b.source);
    const same = !!ws && (ns === ws || ns.includes(ws) || ws.includes(ns) || hostOf(b.url).replace(/\./g, '').includes(ws));
    const score = hit + (same ? 0.3 : 0) + (b.image ? 0.05 : 0);
    if (hit >= min && (!best || score > best.score)) best = { ...b, score, same };
  }
  return best;
}
async function attachBingPhotos(rows) {
  const pool = (await Promise.all(LOCAL_QUERIES.map(q => bingItems(q).catch(() => [])))).flat();
  for (const r of rows) {
    const b = bestMatch(r.title, r.src, pool);
    if (!b) continue;
    if (b.image) r.image = bigThumb(b.image);
    if (b.same && !/msn\.com/.test(b.url)) r.pubUrl = b.url;
  }
}

// The outlet's own RSS feed usually still lists a story from the last few hours, with its real URL and often its photo.
const siteFeeds = new Map(); // host -> { t, urls }
const feedCache = new Map(); // feed url -> { t, items }
async function feedsOf(home) {
  const c = siteFeeds.get(home);
  if (c && Date.now() - c.t < 24 * 3600e3) return c.urls;
  const urls = [];
  try {
    const h = await get(home, { timeout: 8000, headers: BROWSER_HEADERS });
    for (const m of (h.data || '').matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)) {
      const u = (m[0].match(/href=["']([^"']+)["']/) || [])[1];
      if (u) { try { urls.push(new URL(unescape(u), home).href); } catch { /* skip */ } }
    }
  } catch { /* homepage blocked */ }
  const base = home.replace(/\/$/, '');
  urls.push(base + '/feed', base + '/rss', base + '/arc/outboundfeeds/rss/?outputType=xml', base + '/feeds/syndication/rss/news');
  const out = [...new Set(urls)].slice(0, 6);
  siteFeeds.set(home, { t: Date.now(), urls: out });
  return out;
}
async function feedItems(u) {
  const c = feedCache.get(u);
  if (c && Date.now() - c.t < 10 * 60e3) return c.items;
  let items = [];
  try { const r = await get(u, { timeout: 8000, headers: BROWSER_HEADERS }); if (r.ok) items = parseRss(r.data || ''); } catch { /* none */ }
  feedCache.set(u, { t: Date.now(), items });
  if (feedCache.size > 500) feedCache.delete(feedCache.keys().next().value);
  return items;
}
async function fromSiteFeed(item) {
  if (!item.srcUrl || /news\.google|yahoo|msn|youtube|facebook|reddit/.test(item.srcUrl)) return null;
  const want = tokens(item.title);
  for (const f of await feedsOf(item.srcUrl)) {
    for (const x of await feedItems(f)) {
      const tt = tokens(x.title);
      if ([...want].filter(w => tt.has(w)).length / (want.size || 1) >= 0.7) return { url: x.link, image: x.image || '' };
    }
  }
  return null;
}
async function sourceUrlOf(item) { // older saved stories don't carry the outlet's home page; ask Google News RSS search (works from Render)
  try {
    const r = await get('https://news.google.com/rss/search?q=' + encodeURIComponent('"' + item.title.slice(0, 100) + '"') + '&hl=en-US&gl=US&ceid=US:en', { timeout: 8000 });
    const its = parseRss(r.data || '');
    return (its.find(i => i.title.startsWith(item.title.slice(0, 40))) || its[0] || {}).sourceUrl || '';
  } catch { return ''; }
}
let eActive = 0; const eQueue = [];
async function eSlot(fn) {
  if (eActive >= 3) await new Promise(r => eQueue.push(r));
  eActive++;
  try { return await fn(); } finally { eActive--; const n = eQueue.shift(); if (n) n(); }
}
// Find a lead photo (and the publisher URL) for Local stories: Bing News match, then the outlet's own feed,
// then the article page's og:image, then a per-story Bing lookup. Results are saved on the item.
export async function enrichLocal(items) {
  await Promise.all(items.map(it => eSlot(async () => {
    if (it.image) return;
    it.enriched = Date.now();
    try {
      if (!it.srcUrl) it.srcUrl = await sourceUrlOf(it);
      if (!it.pubUrl) { const f = await fromSiteFeed(it).catch(() => null); if (f) { it.pubUrl = f.url; if (!it.image && f.image) it.image = f.image; } }
      if (!it.image && it.pubUrl) { const m = await articleMeta(it.pubUrl).catch(() => null); if (m?.image) it.image = m.image; if (!it.summary && m?.description) it.summary = m.description.slice(0, 400); }
      if (!it.image) { const b = await bingLookup(it.title, it.src).catch(() => null); if (b?.image) it.image = b.image; if (!it.pubUrl && b?.same && !/msn\.com/.test(b.url)) it.pubUrl = b.url; }
    } catch { /* keep going */ }
  })));
  return items;
}

export async function bingLookup(title, src = '') {
  const key = title + '|' + src;
  const c = bingCache.get(key);
  if (c && Date.now() - c.t < 6 * 3600e3) return c.v;
  const q = String(title).replace(/\s+-\s+[^-]+$/, '').replace(/["“”]/g, '').slice(0, 150);
  let v = null;
  try {
    let b = bestMatch(q, src, await bingItems(q), 0.5);
    if (!b) { // shorter keyword query
      const STOPW = new Set('the and for with from after before into over that this his her their are was were has had have says said police man woman'.split(' '));
      const k = q.split(/\s+/).filter(w => w.length > 2 && !STOPW.has(w.toLowerCase())).slice(0, 7).join(' ');
      if (k && k !== q) b = bestMatch(q, src, await bingItems(k), 0.5);
    }
    if (b) v = { url: b.url, image: bigThumb(b.image), source: b.source, same: b.same, title: b.title };
  } catch { /* leave null */ }
  bingCache.set(key, { t: Date.now(), v });
  if (bingCache.size > 2000) bingCache.delete(bingCache.keys().next().value);
  return v;
}

export async function articleMeta(url, { fresh = false, title = '', src = '' } = {}) {
  const c = meta.get(url);
  // fresh: used by Generate. Reuse a cached copy only if it already holds a full article body.
  if (c && Date.now() - c.t < 6 * 3600e3 && (!fresh || (!c.data.blocked && textChars(c.data) >= 1500))) return c.data;
  if (fresh && c?.data?.decodeError) gcache.delete(url);
  let real = url, decodeError = '';
  try { real = await decodeGoogleNews(url); } catch (e) { decodeError = String(e.message || e); }
  let data = { url: real, image: '', description: '', paragraphs: [], blocked: false };
  if (decodeError && title) { // look the story up elsewhere: the publisher URL if Bing has the same outlet, else just its photo
    const b = await bingLookup(title, src).catch(() => null);
    if (b?.same && b.url && !/msn\.com/.test(b.url)) { real = b.url; decodeError = ''; data.fallbackImage = b.image; data.via = 'bing'; }
    else if (b?.image) data.fallbackImage = b.image;
  }
  if (decodeError) { // a Google News page only carries Google's own logo, so don't show it as the story photo
    data = { ...data, blocked: true, decodeError, image: data.fallbackImage || '' };
    if (data.image) { meta.set(url, { t: Date.now() - 4 * 3600e3, data }); return data; } // keep the photo 2h, retry the article later
    meta.set(url, { t: Date.now() - 6 * 3600e3 + 5 * 60e3, data }); // retry after 5 minutes
    console.warn('google news decode failed:', decodeError);
    return data;
  }
  try {
    const { ok, status, finalUrl, html, ex } = await fetchArticle(real);
    if (!ok) { data.blocked = true; data.status = status; }
    let image = ok ? metaTag(html, ['og:image', 'og:image:secure_url', 'og:image:url', 'twitter:image', 'twitter:image:src']) : '';
    if (image && !/^https?:/.test(image)) { try { image = new URL(image, finalUrl).href; } catch { image = ''; } }
    if (!image && ok) image = ldImage(html);
    if (!image) image = data.fallbackImage || '';
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
