// Trending topics for exx.grok, shown as-is from each source (no relevance filter).
// X: official GET /2/trends/by/woeid/23424977 (United States). $0.010 per request on pay-per-use.
// Facebook and Instagram have no public trending API. Proxy: Google Trends US RSS,
// clearly labeled in the UI as a stand-in. Never invent engagement counts.
import { has } from './env.js';
import { get, unescape as unesc } from './feeds.js';
import * as X from './xapi.js';

const US_WOEID = 23424977; // United States
const GT_RSS = 'https://trends.google.com/trending/rss?geo=US';
const WANT = 10;

function strip(s = '') {
  return unesc(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}
function allBlocks(xml, name) {
  return xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?</${name}>`, 'gi')) || [];
}
function slug(s) {
  return String(s || '').toLowerCase().replace(/#/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'topic';
}
function parseTraffic(band) {
  if (!band) return 0;
  const n = Number(String(band).replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function searchUrl(platform, topic) {
  const q = encodeURIComponent(String(topic || '').trim());
  if (platform === 'x') return `https://x.com/search?q=${q}&src=typed_query&f=live`;
  if (platform === 'facebook') return `https://www.facebook.com/search/top/?q=${q}`;
  const raw = String(topic || '').trim();
  if (raw.startsWith('#') || !/\s/.test(raw)) {
    const tagName = raw.replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (tagName) return `https://www.instagram.com/explore/tags/${encodeURIComponent(tagName.toLowerCase())}/`;
  }
  return `https://www.instagram.com/explore/search/keyword/?q=${q}`;
}

export function parseGoogleTrendsRss(xml) {
  const out = [];
  for (const block of allBlocks(xml, 'item')) {
    const title = strip(tag(block, 'title'));
    if (!title) continue;
    const traffic = strip(tag(block, 'ht:approx_traffic'));
    const date = strip(tag(block, 'pubDate'));
    const ts = Date.parse(date);
    const news = allBlocks(block, 'ht:news_item').map(n => ({
      title: strip(tag(n, 'ht:news_item_title')),
      url: strip(tag(n, 'ht:news_item_url')),
      source: strip(tag(n, 'ht:news_item_source')),
    })).filter(n => n.title);
    out.push({
      title,
      traffic: traffic || '',
      searches: parseTraffic(traffic),
      ts: Number.isFinite(ts) ? ts : Date.now(),
      news,
      picture: strip(tag(block, 'ht:picture')),
    });
  }
  return out;
}

async function fetchGoogleTrends() {
  const r = await get(GT_RSS, { timeout: 15000, headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' } });
  if (!r.ok) throw new Error(`Google Trends RSS HTTP ${r.status}`);
  const items = parseGoogleTrendsRss(r.data);
  if (!items.length) throw new Error('Google Trends RSS returned no items');
  return items;
}

async function fetchXTrends() {
  if (!has.bearer && !has.oauth1) {
    const e = new Error('NO_KEYS');
    e.code = 'NO_KEYS';
    throw e;
  }
  const d = await X.usTrends(US_WOEID);
  const rows = Array.isArray(d?.data) ? d.data : [];
  return rows.map((row, i) => {
    const title = String(row.trend_name || row.name || '').trim();
    const tweets = Number(row.tweet_count);
    return {
      title,
      tweets: Number.isFinite(tweets) && tweets > 0 ? tweets : 0,
      ts: Date.now(),
      rawIndex: i,
    };
  }).filter(r => r.title);
}

function relatedSummary(news) {
  if (!news?.length) return '';
  const top = news[0];
  const src = top.source ? ` (${top.source})` : '';
  return `Related reporting: ${top.title}${src}`;
}

function volumeFromX(tweets) {
  if (!tweets) return '';
  return `${tweets.toLocaleString('en-US')} posts (from X; typically last 24 hours)`;
}
function volumeFromGoogle(band) {
  if (!band) return '';
  return `${band} US Google searches (approx., from Google Trends)`;
}

function toItem(platform, rec, rank, why, volume) {
  const src = platform === 'x' ? 'X trend' : platform === 'facebook' ? 'Facebook trend' : 'Instagram trend';
  return {
    id: `trend:${platform}:${slug(rec.title)}`,
    kind: 'trend',
    platform,
    rank,
    title: rec.title,
    src,
    url: rec.url || searchUrl(platform, rec.title),
    summary: rec.summary || relatedSummary(rec.news),
    why: why || rec.why || '',
    volume: volume || '',
    ts: rec.ts || Date.now(),
    newsUrl: rec.news?.[0]?.url || '',
  };
}

function takeTop(list, platform, volumeFn) {
  return list.slice(0, WANT).map((rec, i) => toItem(platform, rec, i + 1, '', volumeFn(rec)));
}

export async function collectTrends() {
  const result = {
    x: { items: [], source: '', sourceNote: '', error: '' },
    facebook: { items: [], source: '', sourceNote: '', error: '' },
    instagram: { items: [], source: '', sourceNote: '', error: '' },
    updated: Date.now(),
  };

  const fbNote = 'Facebook has no public trending API. This is the current US Google Trends list, used as a stand-in. Search volume is from Google Trends, not Facebook.';
  const igNote = 'Instagram has no public trending API. This is the current US Google Trends list, used as a stand-in. Search volume is from Google Trends, not Instagram.';

  let google = [];
  let googleErr = '';
  try { google = await fetchGoogleTrends(); }
  catch (e) { googleErr = e.message; }

  // --- X: official US trends in the API's own order, or Google Trends as a labeled stand-in ---
  try {
    const xList = await fetchXTrends();
    result.x.source = 'X Trends API (United States)';
    result.x.sourceNote = 'Official X trends for the US (WOEID 23424977), shown in source order. Post counts are shown only when X provides them.';
    result.x.items = takeTop(xList, 'x', rec => volumeFromX(rec.tweets));
  } catch (e) {
    const noKeys = e.code === 'NO_KEYS' || e.message === 'NO_KEYS';
    result.x.error = noKeys
      ? 'X keys are missing, so live X trends are off.'
      : (e.status === 403 || e.status === 402 || e.status === 404 || /not.?authorized|forbidden|access/i.test(e.message)
        ? 'The X Trends API is not available on this app or plan: ' + e.message
        : 'Could not load X trends: ' + e.message);
    if (google.length) {
      result.x.source = 'Google Trends (US) — stand-in';
      result.x.sourceNote = result.x.error + ' Showing the current US Google Trends list as a stand-in. This is not the official X trends list, and there are no X post counts.';
      result.x.items = takeTop(google, 'x', rec => volumeFromGoogle(rec.traffic));
    }
  }

  if (!google.length) {
    const msg = 'Could not load Google Trends US RSS: ' + (googleErr || 'unknown error');
    result.facebook.error = msg;
    result.instagram.error = msg;
    result.facebook.source = 'Unavailable';
    result.instagram.source = 'Unavailable';
    result.facebook.sourceNote = fbNote;
    result.instagram.sourceNote = igNote;
    return result;
  }

  result.facebook.source = 'Google Trends (US)';
  result.instagram.source = 'Google Trends (US)';
  result.facebook.sourceNote = fbNote;
  result.instagram.sourceNote = igNote;
  result.facebook.items = takeTop(google, 'facebook', rec => volumeFromGoogle(rec.traffic));
  result.instagram.items = takeTop(google, 'instagram', rec => volumeFromGoogle(rec.traffic));
  return result;
}
