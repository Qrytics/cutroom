#!/usr/bin/env node
// One-time setup: dependencies, ffmpeg, headless Chromium, the `cutroom` MCP server and the video-editor skill.
// Safe to re-run — every step checks first and only fixes what is missing.  →  npm run setup
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ok = (m) => console.log(`✔ ${m}`), info = (m) => console.log(`• ${m}`), bad = (m) => console.log(`✖ ${m}`);
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
const quiet = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
let failed = 0;

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
if (!fs.existsSync(ffmpegPath())) {
  quiet('npm', ['install-scripts', 'approve', 'esbuild', 'ffmpeg-static']);
  sh('npm', ['rebuild', 'esbuild', 'ffmpeg-static']);
}
if (fs.existsSync(ffmpegPath())) ok('ffmpeg'); else { bad('ffmpeg binary missing — run: npm install-scripts approve ffmpeg-static && npm rebuild ffmpeg-static'); failed++; }

// ---- headless Chromium for screenshots, checks and export
const chromium = () => { try { return execFileSync(process.execPath, ['-e', 'process.stdout.write(require("playwright").chromium.executablePath())'], { cwd: path.join(ROOT, 'apps/server'), encoding: 'utf8' }); } catch { return ''; } };
if (!fs.existsSync(chromium())) { info('installing headless Chromium…'); sh(path.join(ROOT, 'node_modules', '.bin', 'playwright'), ['install', 'chromium']); }
if (fs.existsSync(chromium())) ok('headless Chromium'); else { bad('Chromium missing — run: npx playwright install chromium'); failed++; }

// ---- MCP server
const tsx = path.join(ROOT, 'node_modules', '.bin', 'tsx'), mcp = path.join(ROOT, 'apps', 'mcp', 'src', 'index.ts');
const claude = quiet('claude', ['--version']);
if (claude.status !== 0) {
  bad('Claude Code CLI not found — after installing it, run: npm run setup');
  info(`(manual) claude mcp add -s user cutroom -- ${tsx} ${mcp}`);
  failed++;
} else {
  const cur = quiet('claude', ['mcp', 'get', 'cutroom']);
  const right = cur.status === 0 && cur.stdout.includes(mcp);
  if (cur.status === 0 && !right) quiet('claude', ['mcp', 'remove', '-s', 'user', 'cutroom']);
  if (!right) {
    const r = quiet('claude', ['mcp', 'add', '-s', 'user', 'cutroom', '--', tsx, mcp]);
    if (r.status !== 0) { bad(`could not register the MCP server: ${(r.stderr || r.stdout).trim()}`); failed++; }
  }
  if (quiet('claude', ['mcp', 'get', 'cutroom']).status === 0) ok('MCP server "cutroom" registered (user scope) — restart open Claude Code sessions to load it');
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

console.log(failed ? `\n${failed} step(s) need attention (see ✖ above). Then run: npm run doctor` : '\nAll set. Run `npm run doctor` for a full end-to-end check, then ask Claude: "make me a video".');
process.exit(failed ? 1 : 0);
