#!/usr/bin/env node
// One-time setup: dependencies, ffmpeg, headless Chromium, the `cutroom` MCP server and the video-editor skill.
// Safe to re-run — every step checks first and only fixes what is missing.
//   npm run setup                              your own local Cutroom
//   npm run setup -- --join "<invite link>"    connect your Claude to a teammate's shared Cutroom server
//   npm run setup -- --local                   switch back from a team server to your own
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ok = (m) => console.log(`✔ ${m}`), info = (m) => console.log(`• ${m}`), bad = (m) => console.log(`✖ ${m}`);
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
const quiet = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
let failed = 0;
const argv = process.argv.slice(2);
const joinArg = argv.includes('--join') ? argv[argv.indexOf('--join') + 1] : argv.find((a) => /\/join\/[\w-]+/.test(a));
let JOIN = null;
if (joinArg) {
  const m = joinArg.match(/^(https?:\/\/[^/]+)\/join\/([\w-]+)/);
  if (!m) { bad(`that doesn't look like an invite link: ${joinArg} (expected https://…/join/<code>)`); process.exit(1); }
  JOIN = { url: m[1], token: m[2], invite: joinArg };
}

// ---- node
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) { bad(`Node ${process.versions.node} — Cutroom needs Node 20+`); process.exit(1); }
ok(`Node ${process.versions.node}`);

// ---- npm dependencies
if (!fs.existsSync(path.join(ROOT, 'node_modules', '.bin', 'tsx'))) {
  info('installing npm dependencies…');
  if (sh('npm', ['install']).status !== 0) { bad('npm install failed'); process.exit(1); }
}
ok('npm dependencies');

// ---- install scripts (npm ≥ 11 can block them; esbuild + ffmpeg-static need theirs)
const ffmpegPath = () => { try { return execFileSync(process.execPath, ['-e', 'process.stdout.write(require("ffmpeg-static")||"")'], { cwd: path.join(ROOT, 'apps/server'), encoding: 'utf8' }); } catch { return ''; } };
if (JOIN) ok('rendering happens on the team server — skipping local ffmpeg/Chromium');
else if (!fs.existsSync(ffmpegPath())) {
  quiet('npm', ['install-scripts', 'approve', 'esbuild', 'ffmpeg-static']);
  sh('npm', ['rebuild', 'esbuild', 'ffmpeg-static']);
}
if (JOIN) { /* not needed */ } else if (fs.existsSync(ffmpegPath())) ok('ffmpeg'); else { bad('ffmpeg binary missing — run: npm install-scripts approve ffmpeg-static && npm rebuild ffmpeg-static'); failed++; }

// ---- headless Chromium for screenshots, checks and export
const chromium = () => { try { return execFileSync(process.execPath, ['-e', 'process.stdout.write(require("playwright").chromium.executablePath())'], { cwd: path.join(ROOT, 'apps/server'), encoding: 'utf8' }); } catch { return ''; } };
if (!JOIN && !fs.existsSync(chromium())) { info('installing headless Chromium…'); sh(path.join(ROOT, 'node_modules', '.bin', 'playwright'), ['install', 'chromium']); }
if (JOIN) { /* not needed */ } else if (fs.existsSync(chromium())) ok('headless Chromium'); else { bad('Chromium missing — run: npx playwright install chromium'); failed++; }

// ---- team server check (when joining)
if (JOIN) {
  try {
    const r = await fetch(`${JOIN.url}/api/projects`, { headers: { authorization: `Bearer ${JOIN.token}` } });
    if (r.status === 401) { bad('the team server rejected this invite — ask the host for a fresh one'); process.exit(1); }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    ok(`team server reachable: ${JOIN.url} (${(await r.json()).length} projects)`);
  } catch (e) { bad(`can't reach ${JOIN.url} (${e.message}) — is the host's \`npm run team\` running?`); process.exit(1); }
}

// ---- MCP server
const tsx = path.join(ROOT, 'node_modules', '.bin', 'tsx'), mcp = path.join(ROOT, 'apps', 'mcp', 'src', 'index.ts');
const claude = quiet('claude', ['--version']);
const env = JOIN ? ['-e', `CUTROOM_URL=${JOIN.url}`, '-e', `CUTROOM_TOKEN=${JOIN.token}`] : [];
if (claude.status !== 0) {
  bad('Claude Code CLI not found — after installing it, run this setup again');
  info(`(manual) claude mcp add -s user ${env.join(' ')} cutroom -- ${tsx} ${mcp}`);
  failed++;
} else {
  const cur = quiet('claude', ['mcp', 'get', 'cutroom']);
  const pointsAt = cur.stdout.match(/CUTROOM_URL=(\S+)/)?.[1];
  const wantRemote = JOIN?.url, keepRemote = !JOIN && !argv.includes('--local') && pointsAt;
  const right = cur.status === 0 && cur.stdout.includes(mcp) && (wantRemote ? pointsAt === wantRemote && cur.stdout.includes(JOIN.token) : keepRemote || !pointsAt);
  if (!right) {
    if (cur.status === 0) quiet('claude', ['mcp', 'remove', '-s', 'user', 'cutroom']);
    const r = quiet('claude', ['mcp', 'add', '-s', 'user', ...env, 'cutroom', '--', tsx, mcp]);
    if (r.status !== 0) { bad(`could not register the MCP server: ${(r.stderr || r.stdout).trim()}`); failed++; }
  }
  if (quiet('claude', ['mcp', 'get', 'cutroom']).status === 0)
    ok(`MCP server "cutroom" registered (user scope)${JOIN ? ` → team server ${JOIN.url}` : keepRemote ? ` → team server ${pointsAt} (use --local to switch back)` : ' → this computer'} — restart open Claude Code sessions to load it`);
}

// ---- skill
const skillsDir = path.join(os.homedir(), '.claude', 'skills'), link = path.join(skillsDir, 'video-editor'), target = path.join(ROOT, 'skill', 'video-editor');
fs.mkdirSync(skillsDir, { recursive: true });
let current = null;
try { current = fs.realpathSync(link); } catch { /* missing */ }
if (current !== fs.realpathSync(target)) {
  if (fs.existsSync(link) || fs.lstatSync(link, { throwIfNoEntry: false })) {
    const bak = `${link}.bak-${Date.now()}`;
    fs.renameSync(link, bak);
    info(`moved the previous ${link} to ${bak}`);
  }
  fs.symlinkSync(target, link, 'dir');
}
ok(`skill installed: ${link} → ${target}`);

if (JOIN && !failed) console.log(`\nJoined. Open the editor: ${JOIN.invite}\nThen in Claude Code (restart it first), from any project: "make me a video" — it builds live on the team server.`);
else console.log(failed ? `\n${failed} step(s) need attention (see ✖ above). Then run: npm run doctor` : '\nAll set. Run `npm run doctor` for a full end-to-end check, then ask Claude: "make me a video".');
process.exit(failed ? 1 : 0);
