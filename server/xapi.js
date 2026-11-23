// X API v2: reads (bearer or OAuth 1.0a user context), media upload, and posting.
import crypto from 'node:crypto';
import { cfg, has } from './env.js';

const API = (process.env.X_API_BASE || 'https://api.x.com').replace(/\/+$/, ''); // override only for testing
const pct = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// OAuth 1.0a HMAC-SHA1. Only query params (and form-urlencoded bodies) are signed; JSON/multipart bodies are not.
export function oauthHeader(method, url, extraParams = {}, fixed = null) {
  const u = new URL(url);
  const oauth = {
    oauth_consumer_key: cfg.apiKey, oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: cfg.accessToken, oauth_version: '1.0',
  };
  if (fixed) Object.assign(oauth, fixed.oauth);
  const secrets = fixed?.secrets || [cfg.apiSecret, cfg.accessSecret];
  const params = [...u.searchParams.entries(), ...Object.entries(extraParams), ...Object.entries(oauth)]
    .map(([k, v]) => [pct(k), pct(String(v))]).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const base = [method.toUpperCase(), pct(u.origin + u.pathname), pct(params.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
  const key = pct(secrets[0]) + '&' + pct(secrets[1]);
  oauth.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.entries(oauth).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ');
}

export class XError extends Error {
  constructor(status, body) {
    const detail = body?.detail || body?.title || body?.errors?.[0]?.message || body?.error || (typeof body === 'string' ? body.slice(0, 200) : '');
    super(`X API ${status}${detail ? ': ' + detail : ''}`);
    this.status = status; this.body = body;
  }
}

async function call(method, path, { user = false, json, form, query } = {}) {
  const url = new URL(path.startsWith('http') ? path : API + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  const headers = {};
  let body;
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form; // FormData: fetch sets multipart boundary
  if (user) {
    if (!has.oauth1) throw new XError(401, 'OAuth 1.0a keys missing in .env');
    headers.Authorization = oauthHeader(method, url.href);
  } else {
    if (!cfg.bearer && has.oauth1) headers.Authorization = oauthHeader(method, url.href);
    else if (cfg.bearer) headers.Authorization = 'Bearer ' + cfg.bearer;
    else throw new XError(401, 'X_BEARER_TOKEN missing in .env');
  }
  const r = await fetch(url, { method, headers, body });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
  if (!r.ok) throw new XError(r.status, data);
  return data;
}

// ---- Users (cached; user lookups cost $0.010 each) ----
const users = new Map();
export async function userByName(name) {
  const k = name.toLowerCase();
  if (users.has(k)) return users.get(k);
  const d = await call('GET', `/2/users/by/username/${encodeURIComponent(name)}`, { query: { 'user.fields': 'public_metrics,profile_image_url,name,verified' } });
  users.set(k, d.data);
  return d.data;
}
export async function me() {
  if (users.has('__me')) return users.get('__me');
  const d = await call('GET', '/2/users/me', { user: true, query: { 'user.fields': 'public_metrics,profile_image_url,name,username' } });
  users.set('__me', d.data);
  return d.data;
}

const TWEET_FIELDS = 'created_at,public_metrics,attachments,note_tweet,entities,referenced_tweets';

// Official US trends. $0.010 per request on pay-per-use. Bearer or user token.
export async function usTrends(woeid = 23424977) {
  return call('GET', `/2/trends/by/woeid/${encodeURIComponent(woeid)}`, {
    query: { max_trends: '50', 'trend.fields': 'trend_name,tweet_count' },
  });
}


// ---- Your own posts for the Top 5 (OAuth 1.0a as yourself = "owned read" pricing) ----
export async function topPostsThisWeek() {
  const meUser = has.oauth1 ? await me() : await userByName(cfg.xUsername);
  const start = new Date(Date.now() - 7 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
  let token, posts = [];
  for (let page = 0; page < 3; page++) {
    const d = await call('GET', `/2/users/${meUser.id}/tweets`, {
      user: has.oauth1,
      query: { max_results: 100, start_time: start, exclude: 'retweets,replies', 'tweet.fields': TWEET_FIELDS, pagination_token: token },
    });
    posts = posts.concat(d.data || []);
    token = d.meta?.next_token;
    if (!token) break;
  }
  const score = p => (p.public_metrics?.like_count || 0) + (p.public_metrics?.retweet_count || 0) + (p.public_metrics?.reply_count || 0);
  return {
    user: meUser,
    scanned: posts.length,
    top: posts.sort((a, b) => score(b) - score(a)).slice(0, 5).map(p => ({
      id: p.id, text: p.note_tweet?.text || p.text, ts: Date.parse(p.created_at), url: `https://x.com/${meUser.username}/status/${p.id}`,
      likes: p.public_metrics?.like_count || 0, reposts: p.public_metrics?.retweet_count || 0, replies: p.public_metrics?.reply_count || 0,
      views: p.public_metrics?.impression_count || 0, bookmarks: p.public_metrics?.bookmark_count || 0, media: !!p.attachments?.media_keys?.length,
    })),
  };
}

// ---- X feed: other accounts' latest posts; since_id so we only pay for NEW posts ----
const sinceIds = new Map();
let feedStore = [];
export async function xFeed() {
  const errors = {};
  await Promise.all(cfg.feedAccounts.map(async name => {
    try {
      const u = await userByName(name);
      const since = sinceIds.get(u.id);
      const d = await call('GET', `/2/users/${u.id}/tweets`, {
        query: { max_results: since ? 20 : 10, since_id: since, exclude: 'retweets,replies', 'tweet.fields': TWEET_FIELDS },
      });
      const got = d.data || [];
      if (got.length) sinceIds.set(u.id, got[0].id);
      for (const p of got) {
        feedStore.push({
          id: 'x' + p.id, kind: 'x', src: '@' + u.username, title: (p.note_tweet?.text || p.text).replace(/\s*https:\/\/t\.co\/\w+$/, ''),
          summary: '', url: `https://x.com/${u.username}/status/${p.id}`, ts: Date.parse(p.created_at), image: '',
          metrics: p.public_metrics, hasMedia: !!p.attachments?.media_keys?.length,
        });
      }
    } catch (e) { errors[name] = e.message; }
  }));
  const seen = new Set();
  feedStore = feedStore.sort((a, b) => b.ts - a.ts).filter(i => !seen.has(i.id) && seen.add(i.id)).slice(0, 120);
  return { items: feedStore, errors };
}

// ---- Media upload (v2 chunked: initialize -> append -> finalize -> status) ----
export async function uploadMedia(buf, mime) {
  const isVideo = mime.startsWith('video/');
  const isGif = mime === 'image/gif';
  const category = isVideo ? 'tweet_video' : isGif ? 'tweet_gif' : 'tweet_image';
  const init = await call('POST', '/2/media/upload/initialize', { user: true, json: { media_type: mime, total_bytes: buf.length, media_category: category } });
  const id = init.data?.id || init.data?.media_id || init.media_id_string;
  if (!id) throw new XError(500, 'Upload did not return a media id');
  const CHUNK = 4 * 1024 * 1024;
  for (let i = 0, seg = 0; i < buf.length; i += CHUNK, seg++) {
    const fd = new FormData();
    fd.append('segment_index', String(seg));
    fd.append('media', new Blob([buf.subarray(i, i + CHUNK)], { type: 'application/octet-stream' }), 'chunk');
    await call('POST', `/2/media/upload/${id}/append`, { user: true, form: fd });
  }
  let fin = await call('POST', `/2/media/upload/${id}/finalize`, { user: true });
  let info = fin.data?.processing_info;
  for (let n = 0; info && info.state !== 'succeeded' && n < 60; n++) {
    if (info.state === 'failed') throw new XError(400, info.error?.message || 'X could not process this media');
    await new Promise(r => setTimeout(r, Math.max(1, info.check_after_secs || 2) * 1000));
    const st = await call('GET', '/2/media/upload', { user: true, query: { command: 'STATUS', media_id: id } });
    info = st.data?.processing_info;
  }
  return String(id);
}

export async function createPost(text, mediaIds = []) {
  const json = { text };
  if (mediaIds.length) json.media = { media_ids: mediaIds };
  const d = await call('POST', '/2/tweets', { user: true, json });
  return d.data; // { id, text }
}
