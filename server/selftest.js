// npm run check — checks your setup without posting anything.
import { cfg, has, envFileFound } from './env.js';
import { fetchNational } from './feeds.js';
import { chat } from './ai.js';
import { me } from './xapi.js';

const ok = m => console.log('  ✔ ' + m), bad = m => console.log('  ✘ ' + m), info = m => console.log('  - ' + m);
console.log('\nexx.grok setup check\n');
const major = Number(process.versions.node.split('.')[0]);
major >= 20 ? ok('Node.js ' + process.versions.node) : bad('Node.js ' + process.versions.node + ' is too old. Install Node 20 or newer from nodejs.org.');
envFileFound ? ok('.env file found') : bad('.env file not found. Copy .env.example to .env.');

try { const n = await fetchNational(); const up = Object.entries(n.status).filter(([, v]) => v.ok).map(([k]) => k); ok(`News feeds: ${n.items.length} stories from ${up.length}/8 outlets`); const down = Object.entries(n.status).filter(([, v]) => !v.ok); if (down.length) info('Not reachable right now: ' + down.map(([k, v]) => `${k} (${v.error})`).join(', ')); }
catch (e) { bad('News feeds failed: ' + e.message); }

if (!has.ai) info('AI key not set: AI drafts are off.');
else { try { const r = await chat([{ role: 'user', content: 'Reply with the single word OK.' }], { max_tokens: 20, temperature: 0 }); ok(`AI works (${cfg.aiModel} at ${cfg.aiBase}): "${r.slice(0, 20)}"`); } catch (e) { bad('AI test failed: ' + e.message); } }

if (!has.oauth1) info(has.bearer ? 'Bearer token set (X feed can load). OAuth 1.0a keys missing: publishing is off.' : 'X keys not set: X feed, live Top 5 and publishing are off.');
else { try { const u = await me(); ok(`X login works: signed in as @${u.username}. (This one lookup costs about $0.01 in X API credits.)`); if (u.username.toLowerCase() !== cfg.xUsername.toLowerCase()) info(`Note: keys belong to @${u.username}, but X_USERNAME is ${cfg.xUsername}. Posts will go to @${u.username}.`); }
  catch (e) { bad('X login failed: ' + e.message + (e.status === 401 ? ' (check the 4 keys; regenerate the Access Token after setting Read and write)' : e.status === 402 || e.status === 403 ? ' (check your X API credits / app permissions)' : '')); } }
console.log(cfg.dryRun ? '\n  DRY_RUN is on: Publish will not really post.\n' : '');
