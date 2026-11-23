// "Generate Video": AI footage plan + an in-browser video builder (canvas + MediaRecorder, MP4 in Chrome 130+).
const $ = s => document.querySelector(s);
let ctx = null;      // { item, draft, api, toast, imgUrl, setMedia, status }
let assets = [];     // { kind: 'image'|'video', url, name, own: bool }
let result = null;   // File
const dlg = () => $('#videoDlg');

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (v == null || v === false) continue; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); }
  for (const c of kids.flat()) if (c != null) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

export function openVideo(item, draft, c) {
  ctx = { item, draft, ...c };
  result = null;
  for (const a of assets) if (a.own) URL.revokeObjectURL(a.url);
  assets = item.image ? [{ kind: 'image', url: c.imgUrl(item.image), name: 'Story photo', own: false }] : [];
  $('#vStory').replaceChildren(el('b', { text: item.src + ': ' }), item.title, el('br'), el('span', { class: 'muted small', text: draft.text ? 'Draft: ' + draft.text.slice(0, 220) + (draft.text.length > 220 ? '…' : '') : 'No draft yet.' }));
  $('#vPlanOut').replaceChildren();
  $('#vIns').value = '';
  const headline = (draft.text || item.title).split('\n')[0].replace(/\s*—\s*[^—]+$/, '').replace(/^(ALERT|NEW):\s*/, '').trim();
  $('#vCaps').value = headline;
  $('#vOut').hidden = true; $('#vAttach').hidden = true; $('#vDl').hidden = true; $('#vProg').textContent = '';
  $('#vPlan').disabled = !c.status.keys.ai;
  $('#vPlan').title = c.status.keys.ai ? '' : 'Needs AI_API_KEY in .env';
  if (!c.status.keys.ai) $('#vPlanOut').replaceChildren(el('div', { class: 'small muted' }, 'Footage ideas need an AI key. Search links below still work:'), searchLinks([item.title + ' video', item.title + ' bodycam']));
  if (!('MediaRecorder' in window)) $('#vProg').textContent = 'This browser cannot record video. Use Google Chrome.';
  renderAssets();
  dlg().showModal();
  setTimeout(() => $('#vIns').focus(), 50);
}

function searchLinks(queries) {
  const box = el('div');
  for (const q of queries) {
    const enc = encodeURIComponent(q);
    box.append(el('div', { class: 'q' }, el('span', { class: 'small', text: '“' + q + '”' }),
      el('a', { class: 'btn btn-ghost small', href: 'https://www.youtube.com/results?search_query=' + enc, target: '_blank', rel: 'noreferrer', text: 'YouTube' }),
      el('a', { class: 'btn btn-ghost small', href: 'https://x.com/search?f=live&q=' + enc, target: '_blank', rel: 'noreferrer', text: 'X' }),
      el('a', { class: 'btn btn-ghost small', href: 'https://www.google.com/search?tbm=vid&q=' + enc, target: '_blank', rel: 'noreferrer', text: 'Google Videos' })));
  }
  return box;
}

$('#vPlan').addEventListener('click', async () => {
  const ins = $('#vIns').value.trim() || 'Find the best footage for this story and make a short video.';
  const b = $('#vPlan'); b.classList.add('busy');
  try {
    const p = await ctx.api('/api/footage', { method: 'POST', body: { item: ctx.item, instructions: ins, draft: ctx.draft.text } });
    const out = $('#vPlanOut');
    out.replaceChildren(
      el('h4', { text: 'Search for the footage' }), searchLinks(p.queries?.length ? p.queries : [ctx.item.title + ' video']),
      p.where?.length ? el('div', {}, el('h4', { text: 'Where it usually gets posted' }), el('ul', {}, p.where.map(w => el('li', { text: w })))) : null,
      el('div', { class: 'q' }, el('a', { class: 'btn btn-ghost small', href: ctx.item.realUrl || ctx.item.url, target: '_blank', rel: 'noreferrer', text: 'Open the article (check for an embedded video) ↗' })),
      p.captions?.length ? el('div', {}, el('h4', { text: 'Suggested captions' }), el('ul', {}, p.captions.map(c => el('li', { text: c }))),
        el('button', { class: 'btn btn-tone', text: 'Use these captions', onclick: () => { $('#vCaps').value = p.captions.join('\n'); } })) : null,
      p.notes ? el('p', { class: 'small muted', text: p.notes }) : null);
  } catch (e) { $('#vPlanOut').replaceChildren(el('div', { class: 'note err', text: 'Could not get a plan: ' + e.message })); }
  finally { b.classList.remove('busy'); }
});

$('#vFiles').addEventListener('change', e => {
  for (const f of e.target.files) {
    if (!/^(image|video)\//.test(f.type)) continue;
    assets.push({ kind: f.type.startsWith('video') ? 'video' : 'image', url: URL.createObjectURL(f), name: f.name, own: true });
  }
  e.target.value = '';
  renderAssets();
});
function renderAssets() {
  $('#vAssets').replaceChildren(...assets.map((a, i) => el('div', { class: 'v-asset', title: a.name },
    a.kind === 'video' ? el('video', { src: a.url, muted: '', preload: 'metadata' }) : el('img', { src: a.url, alt: '' }),
    el('span', { class: 'tag', text: a.kind === 'video' ? 'clip' : 'photo' }),
    el('button', { text: '✕', title: 'Remove', onclick: () => { if (a.own) URL.revokeObjectURL(a.url); assets.splice(i, 1); renderAssets(); } }))));
  if (!assets.length) $('#vAssets').append(el('span', { class: 'small muted', text: 'No photo for this story yet. Add an image or clip, or the video will use a branded title card.' }));
}
dlg().querySelector('[data-close]').addEventListener('click', () => dlg().close());

// ---------- rendering ----------
// X wants MP4 (H.264 video, AAC audio). Chrome on Windows/Mac records that directly; some builds only record
// Opus audio, so then we either record video-only MP4 or convert with ffmpeg (if installed) to keep clip sound.
function pickType(wantAudio, ffmpeg) {
  const ok = t => MediaRecorder.isTypeSupported(t);
  const aac = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2'].find(ok);
  if (aac) return { type: aac, audio: true, convert: false };
  if (wantAudio && ffmpeg) { const t = ['video/mp4;codecs=avc1,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find(ok); if (t) return { type: t, audio: true, convert: true }; }
  const mp4 = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'].find(ok);
  if (mp4) return { type: mp4, audio: false, convert: false, droppedAudio: wantAudio };
  const webm = ['video/webm;codecs=vp9', 'video/webm'].find(ok) || '';
  return { type: webm, audio: false, convert: !!ffmpeg, droppedAudio: wantAudio };
}
const loadImage = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image failed to load')); i.src = url; });
function loadVideo(url) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.src = url; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    v.onloadeddata = () => res(v); v.onerror = () => rej(new Error('clip failed to load (Chrome may not support this format)'));
  });
}
function wrap(g, text, maxW) {
  const words = text.split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}
function cover(g, src, sw, sh, W, H, zoom = 1, pan = 0) {
  const s = Math.max(W / sw, H / sh) * zoom;
  const dw = sw * s, dh = sh * s;
  g.drawImage(src, (W - dw) / 2 + pan * (dw - W) / 2, (H - dh) / 2, dw, dh);
}
function overlay(g, W, H, caption, source) {
  const u = Math.min(W, H) / 1080;
  // top badge
  g.fillStyle = '#dc2626'; g.beginPath(); g.roundRect(40 * u, 40 * u, 250 * u, 76 * u, 18 * u); g.fill();
  g.fillStyle = '#fff'; g.font = `800 ${46 * u}px system-ui, sans-serif`; g.textBaseline = 'middle'; g.fillText('⚠ ALERT', 62 * u, 79 * u);
  if (source) { g.font = `600 ${28 * u}px system-ui, sans-serif`; const t = 'Source: ' + source; const w = g.measureText(t).width; g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(W - w - 76 * u, 50 * u, w + 36 * u, 56 * u, 14 * u); g.fill(); g.fillStyle = '#fff'; g.fillText(t, W - w - 58 * u, 79 * u); }
  // caption block
  if (caption) {
    const fs = (W > H ? 50 : 56) * u;
    g.font = `800 ${fs}px system-ui, sans-serif`;
    const lines = wrap(g, caption, W - 120 * u).slice(0, 5);
    const lh = fs * 1.22, boxH = lines.length * lh + 80 * u;
    const grad = g.createLinearGradient(0, H - boxH - 120 * u, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(.35, 'rgba(0,0,0,.72)'); grad.addColorStop(1, 'rgba(0,0,0,.9)');
    g.fillStyle = grad; g.fillRect(0, H - boxH - 120 * u, W, boxH + 120 * u);
    g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    lines.forEach((l, i) => g.fillText(l, 60 * u, H - boxH + 30 * u + (i + 1) * lh - 40 * u));
  }
  g.font = `700 ${30 * u}px system-ui, sans-serif`; g.fillStyle = 'rgba(255,255,255,.9)'; g.textBaseline = 'alphabetic';
  const tag = '@EXXAlerts'; g.fillText(tag, W - g.measureText(tag).width - 40 * u, H - 30 * u);
}
function titleCard(g, W, H) {
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#0b1220'); grad.addColorStop(1, '#1e3a8a');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
}

$('#vBuild').addEventListener('click', build);
async function build() {
  if (!('MediaRecorder' in window)) return;
  const btn = $('#vBuild'); const prog = $('#vProg');
  const [W, H] = $('#vFmt').value.split('x').map(Number);
  const secPhoto = Math.min(15, Math.max(2, Number($('#vSec').value) || 4));
  const clipMax = Math.min(140, Math.max(3, Number($('#vClipMax').value) || 30));
  const caps = $('#vCaps').value.split('\n').map(s => s.trim()).filter(Boolean);
  const source = ctx.item.kind === 'x' ? '' : ctx.item.src;
  btn.classList.add('busy'); $('#vOut').hidden = true; $('#vAttach').hidden = true; $('#vDl').hidden = true;
  const canvas = $('#vCanvas'); canvas.width = W; canvas.height = H; canvas.hidden = false;
  const g = canvas.getContext('2d');
  let ac;
  try {
    prog.textContent = 'Loading media…';
    const loaded = [];
    for (const a of assets) {
      try { loaded.push(a.kind === 'video' ? { kind: 'video', v: await loadVideo(a.url) } : { kind: 'image', img: await loadImage(a.url) }); }
      catch (e) { ctx.toast(a.name + ': ' + e.message); }
    }
    const n = Math.max(1, loaded.length, caps.length);
    const scenes = Array.from({ length: n }, (_, i) => ({ media: loaded.length ? loaded[i % loaded.length] : null, caption: caps.length ? caps[Math.min(i, caps.length - 1)] : '' }));
    for (const s of scenes) s.dur = s.media?.kind === 'video' ? Math.min(clipMax, s.media.v.duration || clipMax) : secPhoto;
    const total = scenes.reduce((a, s) => a + s.dur, 0);
    if (total > 140) ctx.toast('Over 2:20 — only accounts with X Premium can post videos that long.', 5000);

    ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    const silent = ac.createConstantSource(); const gz = ac.createGain(); gz.gain.value = 0; silent.connect(gz).connect(dest); silent.start(); // keeps an audio track
    const plan = pickType(scenes.some(s => s.media?.kind === 'video'), ctx.status.ffmpeg);
    const type = plan.type;
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...(plan.audio ? dest.stream.getAudioTracks() : [])]);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
    const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise(r => { rec.onstop = r; });
    rec.start(1000);
    const t0 = performance.now(); let elapsedBefore = 0;
    for (const [i, s] of scenes.entries()) {
      if (s.media?.kind === 'video') {
        const v = s.media.v; v.currentTime = 0; v.muted = false;
        if (!v._src) { v._src = ac.createMediaElementSource(v); v._src.connect(dest); }
        await v.play().catch(() => { v.muted = true; return v.play(); });
      }
      const st = performance.now();
      await new Promise(resolve => {
        const frame = () => {
          const t = (performance.now() - st) / 1000;
          if (t >= s.dur || (s.media?.kind === 'video' && s.media.v.ended)) return resolve();
          g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
          if (!s.media) titleCard(g, W, H);
          else if (s.media.kind === 'image') cover(g, s.media.img, s.media.img.naturalWidth, s.media.img.naturalHeight, W, H, 1 + 0.08 * (t / s.dur), (i % 2 ? -1 : 1) * 0.3 * (t / s.dur));
          else cover(g, s.media.v, s.media.v.videoWidth, s.media.v.videoHeight, W, H);
          const fade = i === 0 ? 1 : Math.min(1, t / 0.35);
          g.globalAlpha = fade; overlay(g, W, H, s.caption, source); g.globalAlpha = 1;
          prog.textContent = `Recording… ${Math.floor(elapsedBefore + t)}s / ${Math.ceil(total)}s`;
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      if (s.media?.kind === 'video') s.media.v.pause();
      elapsedBefore += s.dur;
    }
    rec.stop(); await done;
    let mime = (type.split(';')[0]) || 'video/webm';
    let blob = new Blob(chunks, { type: mime });
    if (plan.convert) {
      prog.textContent = 'Converting to an X-ready MP4…';
      try { const r = await ctx.api('/api/convert', { method: 'POST', body: blob, headers: { 'Content-Type': mime }, raw: true }); blob = new Blob([await r.blob()], { type: 'video/mp4' }); mime = 'video/mp4'; }
      catch (e) { ctx.toast('Conversion failed: ' + e.message, 5000); }
    }
    if (plan.droppedAudio) ctx.toast('Clip sound was left out: this Chrome can’t record AAC audio. Update Chrome or install ffmpeg to keep it.', 6000);
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    result = new File([blob], `exxalerts-${Date.now()}.${ext}`, { type: mime });
    const url = URL.createObjectURL(result);
    canvas.hidden = true;
    const out = $('#vOut'); out.src = url; out.hidden = false;
    const dl = $('#vDl'); dl.href = url; dl.download = result.name; dl.hidden = false;
    $('#vAttach').hidden = false;
    prog.textContent = `Done: ${(blob.size / 1048576).toFixed(1)} MB ${ext.toUpperCase()}, ${Math.round((performance.now() - t0) / 1000)}s.` + (ext === 'webm' ? (ctx.status.ffmpeg ? ' X needs MP4; it will be converted when you publish.' : ' X needs MP4 and this Chrome recorded WebM. Update Chrome or install ffmpeg to convert.') : '');
  } catch (e) { prog.textContent = 'Could not build the video: ' + e.message; canvas.hidden = true; }
  finally { btn.classList.remove('busy'); ac?.close().catch(() => {}); }
}
$('#vAttach').addEventListener('click', () => { if (!result) return; ctx.setMedia(result); dlg().close(); ctx.toast('Video attached to your post'); });
