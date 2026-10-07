#!/usr/bin/env node
// End-to-end health check through the real MCP server, exactly as Claude uses it:
// setup state → tools list → catalog → project → look → lock → edits → check → export → unlock → cleanup.
//   npm run doctor            full run (≈ 30–60 s, includes a draft export)
//   npm run doctor -- --quick skip the export
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const QUICK = process.argv.includes('--quick');
let failures = 0;
const ok = (m, ms) => console.log(`✔ ${m}${ms !== undefined ? `  (${(ms / 1000).toFixed(1)}s)` : ''}`);
const bad = (m, fix) => { failures++; console.log(`✖ ${m}${fix ? `\n    fix: ${fix}` : ''}`); };

// ---- install state (fast, no server)
const q = (c, a) => spawnSync(c, a, { encoding: 'utf8', shell: process.platform === 'win32' });
const mcp = q('claude', ['mcp', 'get', 'cutroom']);
if (mcp.status === 0) ok('MCP server registered in Claude Code'); else bad('MCP server "cutroom" is not registered in Claude Code', 'npm run setup');
let skill = null;
try { skill = fs.realpathSync(path.join(os.homedir(), '.claude', 'skills', 'video-editor')); } catch { /* missing */ }
if (skill === fs.realpathSync(path.join(ROOT, 'skill', 'video-editor'))) ok('video-editor skill installed'); else bad('video-editor skill is not installed (or points elsewhere)', 'npm run setup');

// ---- live run through the MCP server
const transport = new StdioClientTransport({ command: path.join(ROOT, 'node_modules', '.bin', 'tsx'), args: [path.join(ROOT, 'apps', 'mcp', 'src', 'index.ts')], cwd: ROOT, stderr: 'pipe' });
const client = new Client({ name: 'cutroom-doctor', version: '1' });
const txt = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
async function step(name, fn) {
  const t0 = Date.now();
  try { const v = await fn(); ok(name, Date.now() - t0); return v; }
  catch (e) { bad(`${name}: ${String(e.message || e).split('\n')[0]}`, 'see data/server.log, or run npm run setup'); return undefined; }
}
const callTool = async (name, args) => {
  const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 600000 });
  if (r.isError) throw new Error(txt(r));
  return txt(r);
};

let project = null;
try {
  await step('MCP server starts', () => client.connect(transport));
  const tools = await step('tools listed', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    const need = ['list_projects', 'create_project', 'get_project', 'catalog', 'design_direction', 'begin_editing', 'finish_editing', 'import_media', 'edit', 'check', 'export_video'];
    const missing = need.filter((n) => !names.includes(n));
    if (missing.length) throw new Error(`missing tools: ${missing.join(', ')}`);
    return names;
  });
  if (tools) {
    await step('editor server up (started or reused, code current)', () => callTool('list_projects', {}));
    await step('catalog index', async () => { const c = JSON.parse(await callTool('catalog', { section: 'index' })); if (c.components.length < 40) throw new Error('catalog looks incomplete'); });
    project = await step('create project', async () => JSON.parse(await callTool('create_project', { name: `Doctor check ${new Date().toISOString().slice(0, 16)}`, width: 1920, height: 1080 })).id);
    const dir = await step('design_direction', async () => JSON.parse(await callTool('design_direction', { vibe: 'calm developer tool launch' })));
    if (project && dir) {
      await step('begin_editing (lock)', () => callTool('begin_editing', { project, task: 'Doctor check', open: false }));
      const R = dir.recipes;
      const out = await step('edit: build a 6 s scene', () => callTool('edit', { project, pace: 0, ops: [
        { op: 'setMeta', look: dir.look, background: dir.palette.bg },
        { op: 'addClip', id: 'bg', type: 'component', component: 'background', start: 0, duration: 6, trackId: 'bg', props: R.background.props },
        { op: 'addClip', id: 'title', type: 'component', component: 'title', start: 0.3, duration: 3, trackId: 'titles', props: { ...R.title.props, text: 'Doctor check', subtitle: 'Everything works' } },
        { op: 'addClip', id: 'line', type: 'component', component: 'text', start: 3.5, duration: 2.4, trackId: 'titles', props: { ...R.headline.props, text: 'All systems go', size: 96 } },
        { op: 'addClip', id: 'wsh', type: 'sfx', component: 'whoosh', start: 0.2, duration: 0.9 },
        { op: 'addClip', id: 'music', type: 'sfx', component: 'music', start: 0, duration: 6, trackId: 'music', props: { ...R.music.props, intro: 1 } },
      ] }));
      if (out && /⚠/.test(out)) bad(`edit produced warnings:\n${out.split('\n').filter((l) => l.startsWith('⚠')).join('\n')}`);
      const report = await step('check (text-only QA)', () => callTool('check', { project }));
      if (report) {
        const errs = report.split('\n').filter((l) => l.startsWith('✖'));
        if (errs.length) bad(`check found problems in the doctor's own scene:\n    ${errs.join('\n    ')}`); else ok(`check report: ${report.split('\n')[0]}`);
        for (const w of report.split('\n').filter((l) => l.startsWith('⚠'))) console.log(`    ${w}`);
      }
      if (!QUICK) {
        await step('export draft', async () => {
          const r = JSON.parse(await callTool('export_video', { project, preset: 'draft', open: false }));
          if (!r.file || !fs.existsSync(r.file) || fs.statSync(r.file).size < 20000) throw new Error(`no usable file (${r.file})`);
          const res = await fetch(r.url, { method: 'HEAD' });
          if (!res.ok) throw new Error(`export URL ${r.url} → HTTP ${res.status}`);
          fs.rmSync(r.file, { force: true });
        });
      }
      await step('finish_editing (unlock)', () => callTool('finish_editing', { project, summary: 'doctor check' }));
      await step('editor UI loads and fits the window (1280×720, unlocked)', async () => {
        const { chromium } = await import('playwright');
        const b = await chromium.launch();
        try {
          const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
          const errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          await page.goto(`http://localhost:${process.env.PORT || 4317}/p/${project}?name=Doctor`);
          await page.waitForSelector('.timeline .clip', { timeout: 20000 });
          const r = await page.evaluate(() => {
            const box = (s) => document.querySelector(s)?.getBoundingClientRect();
            const cv = box('.preview canvas') ?? box('canvas'), tl = box('.timeline');
            return { cv: cv && [cv.x, cv.width], tl: tl?.height, sw: document.documentElement.scrollWidth, clips: document.querySelectorAll('.timeline .clip').length };
          });
          if (errors.length) throw new Error(`page error: ${errors[0]}`);
          if (!r.cv || r.cv[0] < 0 || r.cv[0] + r.cv[1] > 1280 || r.cv[1] < 200) throw new Error(`preview is off-screen or tiny (${JSON.stringify(r.cv)})`);
          if (!(r.tl > 150)) throw new Error(`timeline is collapsed (${r.tl}px tall)`);
          if (r.sw > 1290) throw new Error(`page is ${r.sw}px wide in a 1280px window`);
          if (r.clips < 5) throw new Error(`only ${r.clips} clips on the timeline`);
        } finally { await b.close(); }
      });
    }
  }
} finally {
  if (project) await fetch(`http://127.0.0.1:${process.env.PORT || 4317}/api/projects/${project}`, { method: 'DELETE' }).catch(() => {});
  await client.close().catch(() => {});
}
console.log(failures ? `\n${failures} problem(s). Fix the ✖ items above and re-run: npm run doctor` : '\nCutroom is healthy — ask Claude for a video.');
process.exit(failures ? 1 : 0);
