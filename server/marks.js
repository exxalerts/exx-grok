// Shared "Posted" marks, so coworkers can see which stories have already been posted.
// Stored in Render Key Value (Redis-compatible) when REDIS_URL / KEY_VALUE_URL is set, so marks survive
// web-service restarts, sleeps and redeploys; otherwise in memory plus data/posted.json on this server's disk.
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';

const KEY = 'exx:posted';
const KEEP_MS = 14 * 864e5; // marks older than 2 weeks are dropped
const marks = new Map(); // id -> { at, title }
let file = '', url = process.env.REDIS_URL || process.env.KEY_VALUE_URL || '';
export const backend = () => (url ? 'keyvalue' : 'file');

// ---- tiny RESP client (one connection, commands queued in order) ----
let sock = null, buf = Buffer.alloc(0), waiting = [];
function encode(args) { return '*' + args.length + '\r\n' + args.map(a => { const s = String(a); return '$' + Buffer.byteLength(s) + '\r\n' + s + '\r\n'; }).join(''); }
function parse(b, i = 0) { // returns [value, nextIndex] or null if incomplete
  const nl = b.indexOf('\r\n', i); if (nl < 0) return null;
  const t = String.fromCharCode(b[i]), line = b.toString('utf8', i + 1, nl);
  if (t === '+') return [line, nl + 2];
  if (t === '-') return [new Error(line), nl + 2];
  if (t === ':') return [Number(line), nl + 2];
  if (t === '$') { const n = Number(line); if (n < 0) return [null, nl + 2]; if (b.length < nl + 2 + n + 2) return null; return [b.toString('utf8', nl + 2, nl + 2 + n), nl + 2 + n + 2]; }
  if (t === '*') { const n = Number(line); if (n < 0) return [null, nl + 2]; const out = []; let j = nl + 2; for (let k = 0; k < n; k++) { const r = parse(b, j); if (!r) return null; out.push(r[0]); j = r[1]; } return [out, j]; }
  return [new Error('bad reply'), b.length];
}
function connect() {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { host: u.hostname, port: Number(u.port) || 6379 };
    const s = u.protocol === 'rediss:' ? tls.connect({ ...opts, servername: u.hostname }) : net.connect(opts);
    s.setTimeout(15000, () => s.destroy(new Error('Key Value timeout')));
    s.once(u.protocol === 'rediss:' ? 'secureConnect' : 'connect', async () => {
      s.setTimeout(0); sock = s;
      try { if (u.password) await cmd(u.username ? ['AUTH', decodeURIComponent(u.username), decodeURIComponent(u.password)] : ['AUTH', decodeURIComponent(u.password)]); resolve(); } catch (e) { reject(e); }
    });
    s.on('data', d => {
      buf = Buffer.concat([buf, d]);
      for (;;) { const r = parse(buf); if (!r) break; buf = buf.subarray(r[1]); const w = waiting.shift(); if (w) (r[0] instanceof Error ? w.reject(r[0]) : w.resolve(r[0])); }
    });
    const fail = e => { if (sock === s) sock = null; buf = Buffer.alloc(0); const w = waiting; waiting = []; w.forEach(x => x.reject(e || new Error('Key Value closed'))); reject(e); };
    s.on('error', fail); s.on('close', () => fail(new Error('Key Value closed')));
  });
}
async function cmd(args) {
  if (!sock) await connect();
  return new Promise((resolve, reject) => { waiting.push({ resolve, reject }); sock.write(encode(args)); });
}

// ---- store ----
function saveFile() { try { fs.writeFileSync(file, JSON.stringify(Object.fromEntries(marks))); } catch { /* best effort */ } }
export async function init(dataDir) {
  file = path.join(dataDir, 'posted.json');
  try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) marks.set(k, v); } catch { /* none yet */ }
  if (!url) return;
  try {
    const all = await cmd(['HGETALL', KEY]);
    for (let i = 0; i + 1 < (all || []).length; i += 2) { try { marks.set(all[i], JSON.parse(all[i + 1])); } catch { /* skip */ } }
    console.log(`posted marks: ${marks.size} loaded from Key Value`);
  } catch (e) { console.warn('posted marks: Key Value unavailable, using local file:', e.message); }
}
export async function list() {
  if (url) { // pick up marks other instances or restarts wrote
    try { const all = await cmd(['HGETALL', KEY]); marks.clear(); for (let i = 0; i + 1 < (all || []).length; i += 2) { try { marks.set(all[i], JSON.parse(all[i + 1])); } catch { /* skip */ } } } catch { /* serve memory */ }
  }
  const now = Date.now();
  for (const [k, v] of marks) if (now - (v.at || 0) > KEEP_MS) { marks.delete(k); if (url) cmd(['HDEL', KEY, k]).catch(() => {}); }
  return Object.fromEntries(marks);
}
export async function set(id, posted, title = '') {
  id = String(id).slice(0, 300); title = String(title || '').slice(0, 300);
  if (posted) { const v = { at: Date.now(), title }; marks.set(id, v); if (url) await cmd(['HSET', KEY, id, JSON.stringify(v)]); }
  else { marks.delete(id); if (url) await cmd(['HDEL', KEY, id]); }
  saveFile();
  return marks.get(id) || null;
}
