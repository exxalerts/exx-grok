// Temporary diagnostic: probe SnapYT and YouTubeGrab from this server's IP.
// Remove this file and its /api/clip/diag-yt route after the Render IP test.
import { URL } from 'node:url';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const SNAP = 'https://www.snapyt.app';
const GRAB = 'https://youtubegrab.com';
const DEFAULT_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // Me at the zoo (short)
const HD_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'; // Big Buck Bunny

let run = { status: 'idle' };

function hdr(h, name) {
  if (!h) return '';
  return h.get(name) || h.get(name.toLowerCase()) || '';
}

function challengeFlags(status, h, textOrBuf) {
  const s = Buffer.isBuffer(textOrBuf) ? textOrBuf.toString('utf8', 0, 800) : String(textOrBuf || '');
  const cf = hdr(h, 'cf-mitigated') || null;
  return {
    status,
    cfMitigated: cf,
    server: hdr(h, 'server') || null,
    contentType: hdr(h, 'content-type') || null,
    challenge: !!(cf && /challenge/i.test(cf)) || /just a moment/i.test(s) || /cf-challenge|turnstile|attention required/i.test(s),
    bodyHead: s.replace(/\s+/g, ' ').trim().slice(0, 220),
  };
}

async function http(method, url, { headers = {}, body, timeout = 45000, maxBytes = 256000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, {
      method,
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
      body,
      signal: ac.signal,
      redirect: 'follow',
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const clipped = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
    return { ok: r.ok, status: r.status, headers: r.headers, url: r.url, buf: clipped, bytes: buf.length };
  } finally {
    clearTimeout(t);
  }
}

async function outboundIp() {
  try {
    const r = await http('GET', 'https://api.ipify.org?format=json', { timeout: 10000, maxBytes: 200, headers: { Accept: 'application/json' } });
    return JSON.parse(r.buf.toString()).ip || null;
  } catch (e) {
    return `error: ${e.name === 'AbortError' ? 'timeout' : e.message}`;
  }
}

function parseFormats(html) {
  const out = [];
  const re = /<option\s([^>]+)>([^<]+)<\/option>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const kind = (attrs.match(/data-kind="([^"]*)"/) || [])[1] || '';
    const ext = (attrs.match(/data-ext="([^"]*)"/) || [])[1] || '';
    const force = (attrs.match(/data-force="([^"]*)"/) || [])[1];
    if (!kind || !force) continue;
    const label = m[2].replace(/&amp;/g, '&').trim();
    const hm = label.match(/(\d{3,4})p/);
    out.push({ kind, ext, label: label.slice(0, 80), height: hm ? Number(hm[1]) : 0, force: force.replace(/&amp;/g, '&') });
  }
  return out;
}

function summarizeFormats(fmts) {
  const byKind = {};
  for (const f of fmts) {
    (byKind[f.kind] ||= []).push(`${f.height ? f.height + 'p ' : ''}${f.ext}`.trim() + (f.label.includes('AV1') ? ' AV1' : ''));
  }
  const uniq = {};
  for (const [k, arr] of Object.entries(byKind)) uniq[k] = [...new Set(arr)];
  const mux = fmts.filter(f => f.kind === 'video+audio');
  const vo = fmts.filter(f => f.kind === 'video-only');
  return {
    count: fmts.length,
    kinds: uniq,
    maxMuxHeight: mux.reduce((n, f) => Math.max(n, f.height), 0),
    maxVideoOnlyHeight: vo.reduce((n, f) => Math.max(n, f.height), 0),
  };
}

async function probeSnapyt(videoUrl) {
  const result = { site: 'snapyt.app', videoUrl };
  try {
    const home = await http('GET', SNAP + '/', { headers: { Accept: 'text/html' }, timeout: 20000 });
    result.home = challengeFlags(home.status, home.headers, home.buf);
    if (result.home.challenge) return result;

    const nonceRes = await http('POST', SNAP + '/wp-admin/admin-ajax.php', {
      headers: {
        Origin: SNAP,
        Referer: SNAP + '/',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: 'action=vd_fresh_nonce',
      timeout: 20000,
      maxBytes: 4000,
    });
    result.freshNonce = challengeFlags(nonceRes.status, nonceRes.headers, nonceRes.buf);
    let nonce = '';
    try { nonce = JSON.parse(nonceRes.buf.toString()).data?.nonce || ''; } catch { /* ignore */ }
    result.freshNonce.gotNonce = Boolean(nonce);
    if (!nonce || result.freshNonce.challenge) return result;

    const form = new URLSearchParams({ action: 'process_video_url', video_url: videoUrl, security: nonce });
    const proc = await http('POST', SNAP + '/wp-admin/admin-ajax.php', {
      headers: {
        Origin: SNAP,
        Referer: SNAP + '/',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: form.toString(),
      timeout: 90000,
      maxBytes: 8000,
    });
    result.process = challengeFlags(proc.status, proc.headers, proc.buf);
    let redirect = '';
    try {
      const j = JSON.parse(proc.buf.toString());
      result.process.success = !!j.success;
      result.process.error = typeof j.data === 'string' ? j.data : undefined;
      redirect = j.data?.redirect || '';
    } catch { result.process.parseError = true; }
    if (!redirect) return result;

    const prev = await http('GET', redirect, { headers: { Accept: 'text/html', Referer: SNAP + '/' }, timeout: 30000, maxBytes: 800000 });
    result.preview = challengeFlags(prev.status, prev.headers, prev.buf);
    result.preview.bytes = prev.bytes;
    if (result.preview.challenge) return result;
    const fmts = parseFormats(prev.buf.toString('utf8'));
    result.formats = summarizeFormats(fmts);
    const target = fmts.find(f => f.kind === 'video+audio') || fmts.find(f => f.kind === 'video-only');
    if (!target) return result;

    const dl = await http('GET', target.force, {
      headers: { Referer: redirect, Origin: SNAP, Range: 'bytes=0-63', Accept: '*/*' },
      timeout: 45000,
      maxBytes: 256,
    });
    const magic = dl.buf.subarray(0, 16);
    result.download = {
      ...challengeFlags(dl.status, dl.headers, dl.buf),
      host: (() => { try { return new URL(dl.url).hostname; } catch { return ''; } })(),
      contentDisposition: hdr(dl.headers, 'content-disposition') || null,
      contentRange: hdr(dl.headers, 'content-range') || null,
      picked: { kind: target.kind, ext: target.ext, height: target.height, label: target.label },
      ftyp: magic.includes(Buffer.from('ftyp')),
      magicHex: magic.toString('hex'),
    };
    result.ok = !result.download.challenge && (result.download.ftyp || /video\//.test(result.download.contentType || ''));
  } catch (e) {
    result.error = e.name === 'AbortError' ? 'timeout' : e.message;
  }
  return result;
}

async function probeYoutubegrab(videoUrl) {
  const result = { site: 'youtubegrab.com', videoUrl };
  try {
    const home = await http('GET', GRAB + '/', { headers: { Accept: 'text/html' }, timeout: 20000 });
    result.home = challengeFlags(home.status, home.headers, home.buf);

    const st = await http('GET', GRAB + '/api/v1/status', { headers: { Accept: 'application/json', Origin: GRAB, Referer: GRAB + '/' }, timeout: 15000, maxBytes: 2000 });
    result.apiStatus = challengeFlags(st.status, st.headers, st.buf);
    try { result.apiStatus.json = JSON.parse(st.buf.toString()); } catch { /* ignore */ }

    const proc = await http('POST', GRAB + '/api/v1/videos:process', {
      headers: {
        Accept: 'application/json',
        Origin: GRAB,
        Referer: GRAB + '/',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: videoUrl }),
      timeout: 90000,
      maxBytes: 200000,
    });
    result.process = challengeFlags(proc.status, proc.headers, proc.buf);
    try {
      const j = JSON.parse(proc.buf.toString());
      result.process.error = j.error || j.message || j.detail || undefined;
      const so = j.streamOptions || {};
      const heights = [];
      for (const arr of Object.values(so)) {
        if (!Array.isArray(arr)) continue;
        for (const it of arr) {
          const lab = it.qualityLabel || (it.height ? it.height + 'p' : it.type || it.formatId);
          heights.push(`${it.type || ''}:${lab}`);
        }
      }
      if (j.basicInfo) result.process.title = j.basicInfo.title;
      if (heights.length) result.process.formats = heights.slice(0, 40);
      result.ok = proc.status === 200 && !result.process.challenge && heights.length > 0;
    } catch {
      result.process.parseError = true;
    }
  } catch (e) {
    result.error = e.name === 'AbortError' ? 'timeout' : e.message;
  }
  return result;
}

async function runProbe({ includeHd = true } = {}) {
  const startedAt = new Date().toISOString();
  const ip = await outboundIp();
  const snapytZoo = await probeSnapyt(DEFAULT_URL);
  const snapytHd = includeHd ? await probeSnapyt(HD_URL) : null;
  const grabZoo = await probeYoutubegrab(DEFAULT_URL);
  const grabHd = includeHd ? await probeYoutubegrab(HD_URL) : null;
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    outboundIp: ip,
    snapyt: { zoo: snapytZoo, bbb: snapytHd },
    youtubegrab: { zoo: grabZoo, bbb: grabHd },
  };
}

export function getDiag() {
  return run;
}

export function startDiag() {
  if (run.status === 'running') return run;
  run = { status: 'running', startedAt: new Date().toISOString() };
  runProbe().then(data => {
    run = { status: 'done', ...data };
  }).catch(e => {
    run = { status: 'error', error: e.message, startedAt: run.startedAt, finishedAt: new Date().toISOString() };
  });
  return run;
}
