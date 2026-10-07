#!/usr/bin/env node
// Host a shared Cutroom session for your team.
//   npm run team                    people on your network (office Wi-Fi / VPN) can join
//   npm run team -- --internet      anyone, anywhere — through a free, encrypted Cloudflare tunnel (no account needed)
// Prints invite links (open in a browser) and the one-line command teammates run to connect their own Claude.
// Everyone except this machine needs the invite; reset it with `npm run team -- --new-invite`.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT || 4317);
const BASE = `http://127.0.0.1:${PORT}`;
const INTERNET = process.argv.includes('--internet');
const REPO_INSTALL = 'https://raw.githubusercontent.com/Qrytics/cutroom/main/scripts/install.sh';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const health = async () => { try { const r = await fetch(`${BASE}/api/health`); return r.ok ? await r.json() : null; } catch { return null; } };

if (process.argv.includes('--new-invite')) {
  const f = path.join(ROOT, 'data', 'team.json');
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* new */ }
  cfg.token = crypto.randomBytes(18).toString('base64url');
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(cfg, null, 1), { mode: 0o600 });
  console.log('New invite created — old invite links stop working once the server restarts.');
}

// ---- (re)start the server listening on the network
const cur = await health();
if (cur) {
  console.log('Restarting the Cutroom server in team mode (projects are saved first)…');
  await fetch(`${BASE}/api/shutdown`, { method: 'POST' }).catch(() => {});
  for (let i = 0; i < 40 && (await health()); i++) await sleep(250);
  if (await health()) { console.error(`Something else is still serving ${BASE}. Stop it and run npm run team again.`); process.exit(1); }
}
const server = spawn(path.join(ROOT, 'node_modules', '.bin', 'tsx'), ['apps/server/src/index.ts'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, HOST: process.env.HOST || '0.0.0.0', PORT: String(PORT) },
});
server.stdout.on('data', (d) => { const s = String(d); if (!/^(cutroom|team )/m.test(s)) process.stdout.write(s); });
for (let i = 0; i < 160 && !(await health()); i++) await sleep(250);
if (!(await health())) { console.error('The server did not start — see the output above.'); process.exit(1); }

// ---- optional internet tunnel
let tunnel = null;
if (INTERNET) {
  console.log('Opening a secure tunnel to the internet…');
  const cf = await import('cloudflared');
  if (!fs.existsSync(cf.bin)) { console.log('  (first time: downloading cloudflared)'); await cf.install(cf.bin); }
  tunnel = cf.Tunnel.quick(`http://localhost:${PORT}`);
  const url = await new Promise((resolve, reject) => {
    tunnel.once('url', resolve);
    tunnel.once('exit', (code) => reject(new Error(`cloudflared exited (${code})`)));
    setTimeout(() => reject(new Error('the tunnel did not come up within 60 s — check your internet connection')), 60000);
  }).catch((e) => { console.error(e.message); return null; });
  if (url) {
    await fetch(`${BASE}/api/team/public`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
    // wait until Cloudflare actually routes to us (a fresh quick tunnel needs a few seconds)
    for (let i = 0; i < 30; i++) { try { if ((await fetch(`${url}/api/health`)).ok) break; } catch { /* not yet */ } await sleep(1000); }
  }
}

const inv = await (await fetch(`${BASE}/api/team`)).json();
const line = '─'.repeat(78);
console.log(`\n${line}\n  Cutroom team session is live\n${line}`);
console.log(`  You:                     http://localhost:${PORT}`);
if (inv.lan) console.log(`  Same network / VPN:      ${inv.lan}`);
if (inv.public) console.log(`  Anywhere (internet):     ${inv.public}`);
const invite = inv.public || inv.lan;
if (invite) {
  console.log(`\n  Send teammates the invite link above — opening it signs their browser in.`);
  console.log(`  To let their Claude Code build videos on this server too, they run once:\n`);
  console.log(`    curl -fsSL ${REPO_INSTALL} | bash -s -- --join "${invite}"\n`);
  if (inv.public) console.log('  The internet address changes each time you restart this command — send the new invite then.\n  For a permanent address, host it on a server (see README → "Always-on team server").');
}
console.log(`${line}\n  Keep this running. Ctrl+C ends the session (projects stay saved).\n${line}\n`);

const stop = async () => {
  tunnel?.stop?.();
  await fetch(`${BASE}/api/team/public`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: null }) }).catch(() => {});
  server.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1500);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => { tunnel?.stop?.(); process.exit(code ?? 0); });
