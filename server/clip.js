// Video clipping helper using yt-dlp + ffmpeg.
// Downloads highest available quality, trims (optional), and outputs browser/X-ready MP4 (H.264/AAC).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';

export const CLIP_DIR = path.join(os.tmpdir(), 'exx-clips');
export const YTDLP_CACHE = path.join(os.tmpdir(), 'exx-ytdlp-cache');
export const MAX_WHOLE_SEC = 15 * 60; // 15 min cap for full-video downloads
export const MAX_CLIP_SEC = 10 * 60;  // 10 min cap for trimmed clips
export const MAX_FILESIZE_BYTES = 350 * 1024 * 1024; // 350 MB cap (Render free disk/RAM friendly)
export const MAX_CACHE_BYTES = 350 * 1024 * 1024;
export const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour hard TTL
export const POST_DL_TTL_MS = 2 * 60 * 1000; // free disk 2 min after download finishes

fs.mkdirSync(CLIP_DIR, { recursive: true });
fs.mkdirSync(YTDLP_CACHE, { recursive: true });

const jobs = new Map();
let activeJobId = null;

// Clean stale leftovers from prior runs on startup
try {
  for (const name of fs.readdirSync(CLIP_DIR)) {
    fs.rmSync(path.join(CLIP_DIR, name), { recursive: true, force: true });
  }
} catch { /* ignore */ }

setInterval(() => sweepJobs(), 5 * 60 * 1000).unref();

export const hasYtdlp = () => new Promise(r => execFile('yt-dlp', ['--version'], { timeout: 5000 }, e => r(!e)));
export const hasFfmpeg = () => new Promise(r => execFile('ffmpeg', ['-version'], { timeout: 5000 }, e => r(!e)));

export function validateUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) throw Object.assign(new Error('Paste a video URL first.'), { code: 400 });
  let u;
  try { u = new URL(s); } catch { throw Object.assign(new Error('That does not look like a valid URL.'), { code: 400 }); }
  if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('URL must start with http:// or https://'), { code: 400 });
  const h = u.hostname.toLowerCase();
  if (
    h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === '0.0.0.0' || h === '::1' || h === '[::1]' ||
    /^fe80:/i.test(h) || /^fc00:|^fd[0-9a-f]{2}:/i.test(h)
  ) {
    throw Object.assign(new Error('Private or local network URLs are not allowed.'), { code: 400 });
  }
  return u.toString();
}

export function parseTime(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const v = Number(s);
    if (!Number.isFinite(v) || v < 0) throw Object.assign(new Error(`Invalid time "${s}".`), { code: 400 });
    return v;
  }
  const parts = s.split(':');
  if (parts.length < 2 || parts.length > 3) throw Object.assign(new Error(`Invalid time "${s}". Use mm:ss or hh:mm:ss.`), { code: 400 });
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const re = i === parts.length - 1 ? /^\d+(?:\.\d+)?$/ : /^\d+$/;
    if (!re.test(p)) throw Object.assign(new Error(`Invalid time "${s}". Use mm:ss or hh:mm:ss.`), { code: 400 });
  }
  const nums = parts.map(Number);
  if (nums.some(n => !Number.isFinite(n) || n < 0)) throw Object.assign(new Error(`Invalid time "${s}".`), { code: 400 });
  if (parts.length === 2) {
    if (nums[1] >= 60) throw Object.assign(new Error(`Seconds must be under 60 in "${s}".`), { code: 400 });
    return nums[0] * 60 + nums[1];
  }
  if (nums[1] >= 60 || nums[2] >= 60) throw Object.assign(new Error(`Minutes and seconds must be under 60 in "${s}".`), { code: 400 });
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}

export function formatTime(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function slugTime(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s` : `${m}m${String(s).padStart(2, '0')}s`;
}

function safeFilename(title, suffix = '') {
  const base = String(title || 'clip')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, ' ')
    .trim().replace(/\s+/g, '_')
    .slice(0, 72) || 'clip';
  return `${base}${suffix}.mp4`;
}

function isYouTubeUrl(u) {
  try { return /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)$/i.test(new URL(u).hostname); }
  catch { return false; }
}

function ytdlpProfiles(url) {
  const base = ['--no-playlist', '--no-warnings', '--cache-dir', YTDLP_CACHE, '--js-runtimes', 'node'];
  if (!isYouTubeUrl(url)) return [{ name: 'default', args: base }];
  return [
    { name: 'default', args: base },
    { name: 'tv,web_safari', args: [...base, '--extractor-args', 'youtube:player_client=tv,web_safari'] },
    { name: 'android_vr', args: [...base, '--extractor-args', 'youtube:player_client=android_vr'] },
    { name: 'mweb', args: [...base, '--extractor-args', 'youtube:player_client=mweb'] },
  ];
}

function cleanYtdlpError(stderr, url) {
  const s = String(stderr || '');
  const lines = s.split('\n').map(l => l.trim()).filter(l => /^ERROR:/i.test(l));
  const msg = lines.length ? lines[lines.length - 1].replace(/^ERROR:\s*/i, '') : s.trim().slice(-300);
  if (/Sign in to confirm you.?re not a bot|bot/i.test(s) && isYouTubeUrl(url)) {
    return 'YouTube blocked this cloud server IP with a bot check (tried multiple public player clients). Try an X or news-site link, or download locally.';
  }
  if (/Unsupported URL/i.test(s)) return 'No downloadable video was found at that link.';
  if (/HTTP Error 403|403 Forbidden/i.test(s)) return 'The source site blocked access (HTTP 403).';
  if (/File is larger than max-filesize/i.test(s)) return `Video exceeds the ${Math.round(MAX_FILESIZE_BYTES / 1048576)} MB size limit. Try trimming a shorter Start/End range.`;
  if (/Private video|members-only|login required|requires authentication/i.test(s)) return 'That video is private or requires login.';
  return msg || 'Could not extract video from that URL.';
}

function isRetryableYouTubeErr(stderr) {
  return /bot|Sign in|403|Requested format is not available|n challenge|nsig|Signature extraction|Unable to extract/i.test(String(stderr || ''));
}

function runCapture(cmd, args, timeout = 35000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 24 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error(stderr || err.message), { stdout, stderr, code: err.code }));
      else resolve({ stdout, stderr });
    });
  });
}

async function fetchJsonInfo(url) {
  const profiles = ytdlpProfiles(url);
  let lastErr = null;
  for (let i = 0; i < profiles.length; i++) {
    try {
      const { stdout } = await runCapture('yt-dlp', [...profiles[i].args, '-J', url], 40000);
      const data = JSON.parse(stdout);
      // Handle playlist/multi-entry wrapper gracefully by taking first entry
      const entry = Array.isArray(data.entries) ? data.entries.find(Boolean) : data;
      if (!entry) throw new Error('No video entry found.');
      return { data: entry, profile: profiles[i] };
    } catch (e) {
      lastErr = e;
      if (i + 1 < profiles.length && isRetryableYouTubeErr(e.stderr || e.message)) continue;
      break;
    }
  }
  throw new Error(cleanYtdlpError(lastErr?.stderr || lastErr?.message, url));
}

function pickBestResolution(entry) {
  let bestH = Number(entry.height) || 0;
  let bestW = Number(entry.width) || 0;
  for (const f of entry.formats || []) {
    if (!f || f.vcodec === 'none') continue;
    const h = Number(f.height) || 0;
    const w = Number(f.width) || 0;
    if (h > bestH || (h === bestH && w > bestW)) { bestH = h; bestW = w; }
  }
  const shortSide = bestW && bestH ? Math.min(bestW, bestH) : (bestH || bestW);
  return { width: bestW, height: bestH, resolution: shortSide ? `${shortSide}p` : '' };
}

export async function getVideoInfo(rawUrl) {
  const url = validateUrl(rawUrl);
  if (!(await hasYtdlp())) throw Object.assign(new Error('yt-dlp is not installed on this server.'), { code: 500 });
  const { data } = await fetchJsonInfo(url);
  if (data.is_live) throw Object.assign(new Error('Live streams cannot be clipped yet. Wait until the stream finishes.'), { code: 400 });
  const duration = Number(data.duration) || 0;
  const { width, height, resolution } = pickBestResolution(data);
  const thumb = data.thumbnail || (Array.isArray(data.thumbnails) && data.thumbnails.length ? data.thumbnails[data.thumbnails.length - 1]?.url : '') || '';
  return {
    url: data.webpage_url || url,
    title: data.title || 'Video',
    thumbnail: thumb,
    duration,
    durationText: duration ? formatTime(duration) : '',
    width,
    height,
    resolution,
    extractor: data.extractor_key || data.extractor || '',
    tooLongForWhole: duration > MAX_WHOLE_SEC,
    maxWholeSec: MAX_WHOLE_SEC,
    maxClipSec: MAX_CLIP_SEC,
  };
}

function removeDirQuiet(dir) {
  if (!dir) return;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function sweepJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status === 'downloading' || job.status === 'processing') continue;
    const expired = now - (job.finishedAt || job.createdAt) > JOB_TTL_MS;
    const dlExpired = job.downloadedAt && now - job.downloadedAt > POST_DL_TTL_MS;
    if (expired || dlExpired) {
      removeDirQuiet(job.dir);
      jobs.delete(id);
    }
  }
  // Enforce total disk budget across completed clips
  let total = 0;
  const doneJobs = [];
  for (const job of jobs.values()) {
    if (job.status === 'done' && job.file && fs.existsSync(job.file)) {
      total += job.size || 0;
      doneJobs.push(job);
    }
  }
  doneJobs.sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
  while (total > MAX_CACHE_BYTES && doneJobs.length > 1) {
    const old = doneJobs.shift();
    total -= old.size || 0;
    removeDirQuiet(old.dir);
    jobs.delete(old.id);
  }
}

async function probeMedia(filePath) {
  const { stdout } = await runCapture('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name,pix_fmt,width,height',
    '-show_entries', 'format=duration,size',
    '-of', 'json',
    filePath,
  ], 20000);
  const j = JSON.parse(stdout || '{}');
  const streams = j.streams || [];
  const v = streams.find(s => s.codec_type === 'video');
  const a = streams.find(s => s.codec_type === 'audio');
  return {
    vcodec: v?.codec_name || '',
    acodec: a?.codec_name || '',
    pixFmt: v?.pix_fmt || '',
    width: Number(v?.width) || 0,
    height: Number(v?.height) || 0,
    hasAudio: !!a,
    duration: Number(j.format?.duration) || 0,
    size: Number(j.format?.size) || 0,
  };
}

function spawnYtdlpDownload(args, job, onPct) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    job.proc = proc;
    let errBuf = '';
    let outBuf = '';
    const handleLine = line => {
      const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (m) onPct(Math.min(100, parseFloat(m[1])));
    };
    proc.stdout.on('data', chunk => {
      outBuf += chunk.toString('utf8');
      const lines = outBuf.split(/\r?\n/);
      outBuf = lines.pop() || '';
      for (const l of lines) handleLine(l);
    });
    proc.stderr.on('data', chunk => { errBuf += chunk.toString('utf8'); if (errBuf.length > 16000) errBuf = errBuf.slice(-16000); });
    proc.on('error', err => { job.proc = null; reject(err); });
    proc.on('close', code => {
      job.proc = null;
      if (job.cancelled) return reject(new Error('Cancelled.'));
      if (code === 0) resolve({ stderr: errBuf });
      else reject(Object.assign(new Error(errBuf || `yt-dlp exited ${code}`), { stderr: errBuf }));
    });
  });
}

function runFfmpeg(args, job, expectedDur, onPct) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    job.proc = proc;
    let errBuf = '';
    let outBuf = '';
    proc.stdout.on('data', chunk => {
      outBuf += chunk.toString('utf8');
      const lines = outBuf.split(/\r?\n/);
      outBuf = lines.pop() || '';
      for (const l of lines) {
        const m = l.match(/^out_time_ms=(\d+)/);
        if (m && expectedDur > 0) {
          const sec = Number(m[1]) / 1e6;
          onPct(Math.min(99, Math.max(0, (sec / expectedDur) * 100)));
        }
      }
    });
    proc.stderr.on('data', chunk => { errBuf += chunk.toString('utf8'); if (errBuf.length > 12000) errBuf = errBuf.slice(-12000); });
    proc.on('error', err => { job.proc = null; reject(err); });
    proc.on('close', code => {
      job.proc = null;
      if (job.cancelled) return reject(new Error('Cancelled.'));
      if (code === 0) resolve();
      else reject(new Error(errBuf.trim().split('\n').slice(-3).join(' ') || `ffmpeg exited ${code}`));
    });
  });
}

function findRawFile(dir) {
  const files = fs.readdirSync(dir).filter(f => f.startsWith('raw.') && !f.endsWith('.part') && !f.endsWith('.ytdl'));
  if (!files.length) return null;
  files.sort((a, b) => fs.statSync(path.join(dir, b)).size - fs.statSync(path.join(dir, a)).size);
  return path.join(dir, files[0]);
}

async function runClipJob(job, { url, startRaw, endRaw }) {
  try {
    job.status = 'downloading';
    job.detail = 'Inspecting video…';
    job.progress = 2;

    const start = parseTime(startRaw) ?? 0;
    const endParsed = parseTime(endRaw);

    const { data: info, profile } = await fetchJsonInfo(url);
    if (job.cancelled) throw new Error('Cancelled.');
    if (info.is_live) throw new Error('Live streams cannot be clipped yet.');

    const fullDur = Number(info.duration) || 0;
    job.title = info.title || 'Video';

    let end = endParsed;
    if (fullDur > 0) {
      if (start >= fullDur) throw new Error(`Start time (${formatTime(start)}) is past the end of the video (${formatTime(fullDur)}).`);
      end = end == null ? fullDur : Math.min(end, fullDur);
      if (end <= start) throw new Error('End time must be after Start time.');
    } else if (end != null && end <= start) {
      throw new Error('End time must be after Start time.');
    }

    const isWhole = start <= 0.25 && (end == null || (fullDur > 0 && end >= fullDur - 0.5));
    const targetDur = isWhole ? fullDur : (end != null ? end - start : 0);

    if (isWhole && fullDur > MAX_WHOLE_SEC) {
      throw new Error(`Whole video is ${formatTime(fullDur)} (max whole download is ${formatTime(MAX_WHOLE_SEC)}). Enter Start and End times up to ${formatTime(MAX_CLIP_SEC)} to clip a segment.`);
    }
    if (!isWhole && targetDur > MAX_CLIP_SEC) {
      throw new Error(`Clip length is ${formatTime(targetDur)} (max is ${formatTime(MAX_CLIP_SEC)}).`);
    }

    // Download highest quality available (prefer H.264/AAC on same resolution ties for lossless remux)
    const useSection = !isWhole && fullDur > MAX_WHOLE_SEC && end != null;

    job.detail = useSection ? 'Downloading selected section in highest quality…' : 'Downloading highest available quality…';
    job.progress = 5;

    const profiles = [profile, ...ytdlpProfiles(url).filter(p => p.name !== profile.name)];
    const rawTpl = path.join(job.dir, 'raw.%(ext)s');
    let dlOk = false;
    let lastDlErr = null;
    for (let i = 0; i < profiles.length; i++) {
      const args = [
        ...profiles[i].args,
        '--newline', '--progress',
        '-f', 'bv*+ba/b',
        '-S', 'res,fps,vcodec:h264,acodec:m4a',
        '--max-filesize', String(MAX_FILESIZE_BYTES),
        ...(useSection ? ['--download-sections', `*${start}-${end}`, '--force-keyframes-at-cuts'] : []),
        '-o', rawTpl,
        url,
      ];
      try {
        await spawnYtdlpDownload(args, job, pct => {
          job.progress = Math.round(5 + pct * 0.65);
          job.detail = `Downloading highest quality… ${Math.round(pct)}%`;
        });
        dlOk = true;
        break;
      } catch (e) {
        lastDlErr = e;
        if (job.cancelled) throw e;
        // Clean partial files before any retry
        for (const f of fs.readdirSync(job.dir)) fs.rmSync(path.join(job.dir, f), { recursive: true, force: true });
        if (i + 1 < profiles.length && isRetryableYouTubeErr(e.stderr || e.message)) continue;
        break;
      }
    }
    if (!dlOk) throw new Error(cleanYtdlpError(lastDlErr?.stderr || lastDlErr?.message, url));

    const rawFile = findRawFile(job.dir);
    if (!rawFile) throw new Error('Download finished but no video file was produced.');
    const rawStat = fs.statSync(rawFile);
    if (rawStat.size > MAX_FILESIZE_BYTES) throw new Error(`Downloaded video is too large (${Math.round(rawStat.size / 1048576)} MB, limit ${Math.round(MAX_FILESIZE_BYTES / 1048576)} MB). Try trimming a shorter clip.`);

    job.status = 'processing';
    job.progress = 72;
    const media = await probeMedia(rawFile);
    const outFile = path.join(job.dir, 'out.mp4');

    const needVideoTrim = !isWhole && !useSection;
    const h264Ready = media.vcodec === 'h264' && media.pixFmt === 'yuv420p';
    const aacReady = !media.hasAudio || media.acodec === 'aac';
    if (!needVideoTrim && h264Ready) {
      job.detail = aacReady ? 'Remuxing to fast-start MP4…' : 'Converting audio to AAC MP4…';
      await runFfmpeg([
        '-y', '-i', rawFile,
        '-c:v', 'copy',
        ...(aacReady ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k', '-ac', '2']),
        '-movflags', '+faststart',
        '-progress', 'pipe:1', '-nostats',
        outFile,
      ], job, media.duration || targetDur || fullDur, pct => {
        job.progress = Math.round(75 + pct * 0.23);
      });
    } else {
      const localStart = needVideoTrim ? start : 0;
      const localDur = needVideoTrim && end != null ? Math.max(0.1, end - start) : 0;
      const threads = (media.width > 1920 || media.height > 1920) ? '1' : '2';
      job.detail = needVideoTrim ? 'Trimming & encoding MP4 (H.264/AAC)…' : 'Converting to MP4 (H.264/AAC)…';

      const ffArgs = ['-y'];
      if (needVideoTrim && localStart > 5) ffArgs.push('-ss', String((localStart - 5).toFixed(3)));
      ffArgs.push('-i', rawFile);
      if (needVideoTrim) {
        if (localStart > 5) ffArgs.push('-ss', '5');
        else if (localStart > 0) ffArgs.push('-ss', String(localStart.toFixed(3)));
        if (localDur > 0) ffArgs.push('-t', String(localDur.toFixed(3)));
      }
      ffArgs.push(
        '-c:v', 'libx264',
        '-crf', '18',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-threads', threads,
        ...(media.hasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-ac', '2'] : ['-an']),
        '-movflags', '+faststart',
        '-progress', 'pipe:1', '-nostats',
        outFile,
      );
      const exp = localDur || media.duration || fullDur || 30;
      await runFfmpeg(ffArgs, job, exp, pct => {
        job.progress = Math.round(72 + pct * 0.27);
        job.detail = `${needVideoTrim ? 'Trimming & encoding MP4' : 'Converting to MP4'}… ${Math.round(pct)}%`;
      });
    }

    // Remove raw intermediate file immediately to save ephemeral disk
    for (const f of fs.readdirSync(job.dir)) {
      if (f !== 'out.mp4') fs.rmSync(path.join(job.dir, f), { recursive: true, force: true });
    }

    if (!fs.existsSync(outFile)) throw new Error('FFmpeg did not produce an MP4 file.');
    const outInfo = await probeMedia(outFile);
    const suffix = isWhole || end == null ? '' : `_${slugTime(start)}-${slugTime(end)}`;
    job.filename = safeFilename(info.title, suffix);
    job.file = outFile;
    job.size = outInfo.size || fs.statSync(outFile).size;
    job.width = outInfo.width || media.width;
    job.height = outInfo.height || media.height;
    job.duration = outInfo.duration || targetDur || media.duration;
    job.durationText = job.duration ? formatTime(job.duration) : '';
    job.status = 'done';
    job.progress = 100;
    job.finishedAt = Date.now();
    const resTag = job.width && job.height ? `${Math.min(job.width, job.height)}p` : (job.height ? `${job.height}p` : '');
    job.detail = `Ready · ${resTag ? `${resTag} · ` : ''}${(job.size / 1048576).toFixed(1)} MB`;
    sweepJobs();
  } catch (e) {
    removeDirQuiet(job.dir);
    job.file = null;
    job.status = 'error';
    job.finishedAt = Date.now();
    job.error = e.message || 'Clip failed.';
    job.detail = job.error;
  } finally {
    if (activeJobId === job.id) activeJobId = null;
  }
}

export async function startClip({ url, start, end }) {
  const validUrl = validateUrl(url);
  if (!(await hasYtdlp())) throw Object.assign(new Error('yt-dlp is not installed on this server.'), { code: 500 });
  if (!(await hasFfmpeg())) throw Object.assign(new Error('ffmpeg is not installed on this server.'), { code: 500 });
  // Validate time syntax synchronously before starting background job
  parseTime(start);
  parseTime(end);

  if (activeJobId) {
    const cur = jobs.get(activeJobId);
    if (cur && (cur.status === 'downloading' || cur.status === 'processing')) {
      throw Object.assign(new Error('Another video is currently clipping — wait for it to finish (or cancel it).'), { code: 429 });
    }
  }

  sweepJobs();
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(CLIP_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const job = {
    id,
    dir,
    url: validUrl,
    status: 'downloading',
    progress: 1,
    detail: 'Starting…',
    title: '',
    filename: 'clip.mp4',
    file: null,
    size: 0,
    width: 0,
    height: 0,
    duration: 0,
    durationText: '',
    error: '',
    createdAt: Date.now(),
    finishedAt: 0,
    downloadedAt: 0,
    cancelled: false,
    proc: null,
  };
  jobs.set(id, job);
  activeJobId = id;
  runClipJob(job, { url: validUrl, startRaw: start, endRaw: end });
  return { jobId: id };
}

export function getJob(id) {
  const job = jobs.get(String(id || ''));
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    detail: job.detail,
    title: job.title,
    filename: job.filename,
    size: job.size,
    width: job.width,
    height: job.height,
    resolution: (job.width && job.height) ? `${Math.min(job.width, job.height)}p` : (job.height ? `${job.height}p` : ''),
    duration: job.duration,
    durationText: job.durationText,
    error: job.error,
    downloadUrl: job.status === 'done' ? `/api/clip/download?id=${encodeURIComponent(job.id)}` : '',
  };
}

export function cancelJob(id) {
  const job = jobs.get(String(id || ''));
  if (!job) return false;
  job.cancelled = true;
  if (job.proc) {
    try { job.proc.kill('SIGTERM'); } catch { /* ignore */ }
  }
  return true;
}

export function openDownload(id) {
  const job = jobs.get(String(id || ''));
  if (!job || job.status !== 'done' || !job.file || !fs.existsSync(job.file)) return null;
  return {
    file: job.file,
    filename: job.filename,
    size: fs.statSync(job.file).size,
    markDownloaded: () => {
      job.downloadedAt = Date.now();
      setTimeout(() => sweepJobs(), POST_DL_TTL_MS + 1000).unref();
    },
  };
}
