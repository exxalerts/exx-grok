// AI writing via any OpenAI-compatible Chat Completions API (xAI by default).
import { cfg, has } from './env.js';
import { STYLE_FINDINGS, SHORT_EXAMPLES, LONG_EXAMPLES, RULES_SHORT, RULES_LONG } from './style.js';

export async function chat(messages, { json = false, temperature = 0.8, max_tokens = 1200 } = {}) {
  if (!has.ai) { const e = new Error('AI_API_KEY is missing in .env'); e.code = 'NO_AI'; throw e; }
  const body = { model: cfg.aiModel, messages, temperature, max_tokens };
  if (json) body.response_format = { type: 'json_object' };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch(cfg.aiBase + '/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.aiKey },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`AI API ${r.status}: ${d.error?.message || d.error || JSON.stringify(d).slice(0, 200)}`);
    return (d.choices?.[0]?.message?.content || '').trim();
  } finally { clearTimeout(t); }
}

function parseJson(s) {
  try { return JSON.parse(s); } catch { /* fallthrough */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  return null;
}

const SYSTEM = `You write X posts for @EXXAlerts, a fast-breaking news account with ~600K followers.
${STYLE_FINDINGS}`;

// ---- Post cleanup and headline-reuse check ----
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}]/gu;
export function cleanPost(text, mode) {
  let t = text.replace(/^```[\s\S]*?\n|```$/g, '').replace(/^["“]|["”]$/g, '').trim();
  t = t.replace(/^(short|long) post:\s*/i, '');
  t = t.replace(EMOJI, '').replace(/(^|\s)#[\p{L}\d_]+/gu, '$1').replace(/https?:\/\/\S+/g, '').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
  if (!/^(ALERT|NEW):/.test(t)) t = 'ALERT: ' + t;
  if (mode === 'short') t = t.replace(/\s*\n+\s*/g, ' ');
  return t;
}
const words = s => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
export function headlineOverlap(post, headline) {
  const p = words(post).join(' ');
  const h = words(headline);
  let longest = 0;
  for (let i = 0; i < h.length; i++) for (let j = h.length; j > i + longest; j--) if (p.includes(h.slice(i, j).join(' '))) { longest = j - i; break; }
  return longest; // longest run of consecutive headline words reused
}

function material(item, art) {
  const lines = [`Source: ${item.src}${item.kind === 'x' ? ' (an X account, not a news outlet)' : item.kind === 'trend' ? ' (a trending topic, not a finished news article)' : ''}`, `Headline: ${item.title}`];
  if (item.summary) lines.push(`Summary: ${item.summary}`);
  if (item.kind === 'trend' && item.volume) lines.push(`Volume (from the named source only): ${item.volume}`);
  if (item.kind === 'trend') lines.push('Rules for trends: only use the material above. Do not invent incidents, names, ages, locations, or counts. If the facts are thin, write a cautious hook that the topic is trending, not a news story with details you do not have. Do not cite Google Trends or "Facebook trend" as if it were a news outlet.');
  if (art?.description && art.description !== item.summary) lines.push(`Description: ${art.description}`);
  if (art?.paragraphs?.length) lines.push('Article text:\n' + art.paragraphs.join('\n'));
  if (item.loc) lines.push(`Location: ${item.loc}`);
  return lines.join('\n');
}

export async function generatePost(item, mode, art, { instructions = '' } = {}) {
  const isShort = mode === 'short';
  const outlet = (item.kind === 'x' || item.kind === 'trend') ? '' : item.src;
  const prompt = [
    isShort ? RULES_SHORT : RULES_LONG,
    '',
    isShort ? 'Examples of real high-performing @EXXAlerts short posts:\n' + SHORT_EXAMPLES.map(s => '- ' + s).join('\n')
      : 'Examples of real @EXXAlerts long posts (shape only):\n\n' + LONG_EXAMPLES.join('\n\n---\n\n'),
    '',
    'MATERIAL:', material(item, art),
    '',
    outlet ? `Outlet to cite at the end: ${outlet}` : 'This came from another X account: do not cite that account by @handle.',
    instructions ? `Extra instructions from the editor: ${instructions}` : '',
    '',
    `Write ONE ${isShort ? 'short' : 'long'} post. Output only the post text, nothing else.`,
  ].join('\n');
  const run = async extra => cleanPost(await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt + (extra || '') }], { temperature: 0.9, max_tokens: isShort ? 300 : 1200 }), mode);
  let text = await run();
  let overlap = headlineOverlap(isShort ? text : text.split('\n')[0], item.title);
  if (overlap >= 5) {
    text = await run(`\n\nYour previous attempt reused ${overlap} consecutive words from the headline: "${text}". Rewrite with a completely different hook and different wording.`);
    overlap = headlineOverlap(isShort ? text : text.split('\n')[0], item.title);
  }
  if (isShort && text.length > 280) {
    text = cleanPost(await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: `Shorten this to under 270 characters, same style, keep the outlet tag:\n${text}` }], { temperature: 0.4, max_tokens: 200 }), 'short');
  }
  return { text, overlap, thin: !art?.paragraphs?.length && !item.summary };
}

// ---- Local column: AI picks the stories most like what performs on @EXXAlerts ----
export async function pickLocal(cands, { want = 15, already = [] } = {}) {
  const list = cands.slice(0, 160);
  const prompt = `${STYLE_FINDINGS}

Below are fresh local news headlines (index | source | headline). Pick the ${want} that would perform best as @EXXAlerts posts:
unique, surprising, shareable local stories with a strong hook (bodycam/911/video, bizarre crime, outrage, irony, heroics, viral moments, notable arrests).
Skip duplicates of the same incident, routine items (weather, school board, sports scores, obituaries), opinion pieces, and anything already covered: ${already.slice(0, 40).join(' || ') || 'none'}.

${list.map((c, i) => `${i} | ${c.src} | ${c.title}`).join('\n')}

Return JSON: {"picks":[{"i":<index>,"loc":"City, ST","why":"<max 14 words: why it fits EXXAlerts>","video":<true if footage likely exists>}]} ordered best first.`;
  const out = parseJson(await chat([{ role: 'system', content: 'You are a sharp social news editor. Reply with JSON only.' }, { role: 'user', content: prompt }], { json: true, temperature: 0.3, max_tokens: 2000 }));
  const picks = (out?.picks || []).filter(p => Number.isInteger(p.i) && list[p.i]);
  return picks.map(p => ({ ...list[p.i], loc: String(p.loc || '').slice(0, 40), why: String(p.why || '').slice(0, 140), video: !!p.video }));
}

// ---- Video helper: footage ideas (searches the editor runs themselves) ----
export async function footagePlan(item, instructions, draft) {
  const prompt = `An editor wants to make a short video for this @EXXAlerts post.
Story source: ${item.src}
Headline: ${item.title}
Link: ${item.url}
Draft post: ${draft || '(none yet)'}
Editor's instructions: ${instructions}

You CANNOT browse or download. Give a practical plan. Return JSON:
{"queries":["<3-6 precise search queries to find the footage, e.g. agency name + 'bodycam' + date/place>"],
 "where":["<3-5 places the official footage is usually published, e.g. the police department's YouTube or X account, the local TV station that broke it; name them, no URLs>"],
 "captions":["<3-5 short on-screen caption lines for the video, factual, from the material only, no emojis>"],
 "notes":"<one or two sentences: rights/attribution reminders and what to look for>"}`;
  const out = parseJson(await chat([{ role: 'system', content: 'You are a news video producer. Reply with JSON only. Never invent facts or URLs.' }, { role: 'user', content: prompt }], { json: true, temperature: 0.4, max_tokens: 900 }));
  return out || { queries: [], where: [], captions: [], notes: '' };
}

// ---- Trending: rank topics for @EXXAlerts, optionally per platform. Never invent counts. ----
export async function pickTrends(list, { platform = 'x', sourceName = '', want = 10 } = {}) {
  const plat = platform === 'facebook' ? 'Facebook' : platform === 'instagram' ? 'Instagram' : 'X';
  const prompt = `You are the editor of @EXXAlerts, a US breaking-news account (politics, crime/police, viral incidents, emergencies).
Below are live trending topics from ${sourceName || 'a public trends source'} (index | topic | volume if the source provided it | related headlines).
Pick up to ${want} that would perform best as @EXXAlerts posts on ${plat}.
Keep: breaking news, US politics, crime/police, viral incidents, emergencies.
Skip sports, celebrity, entertainment and shopping fluff unless the volume is genuinely huge.
For Instagram, slightly prefer visual/viral incidents. For Facebook, slightly prefer widely discussed news. For X, prefer fast-breaking hooks.
Do NOT invent or change any volume numbers. If volume is blank, leave it blank and do not guess.
Return JSON: {"picks":[{"i":<index>,"why":"<max 14 words: why it fits @EXXAlerts on ${plat}>"}]} ordered best first.

${list.map((c, i) => `${i} | ${c.title} | ${c.volume || '—'} | ${c.news || ''}`).join('\n')}`;
  const out = parseJson(await chat([{ role: 'system', content: 'You are a sharp social news editor. Reply with JSON only. Never invent statistics.' }, { role: 'user', content: prompt }], { json: true, temperature: 0.3, max_tokens: 1200 }));
  return (out?.picks || []).filter(p => Number.isInteger(p.i) && list[p.i]);
}
