// Cutroom MCP server: the tools Claude uses to build videos in the shared editor.
// Every edit goes through the server's ops API, so it appears live in every open editor and stays editable.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { codeVersion } from '../../server/src/version.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const BASE = (process.env.CUTROOM_URL || 'http://127.0.0.1:4317').replace(/\/$/, '');
const PACE = Number(process.env.CUTROOM_PACE ?? 250);
// a team server somewhere else (set by `npm run setup -- --join <invite link>`): send the invite token, upload media,
// download exports — and never try to start or restart that server from here
const TOKEN = process.env.CUTROOM_TOKEN || '';
const REMOTE = !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(BASE);
const auth = (): Record<string, string> => (TOKEN ? { authorization: `Bearer ${TOKEN}` } : {});

type Json = Record<string, unknown>;

async function call<T = Json>(p: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  await ensureServer();
  const { json, ...rest } = init;
  const r = await fetch(BASE + p, { ...rest, headers: { ...auth(), ...(json !== undefined ? { 'content-type': 'application/json' } : {}) }, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const ct = r.headers.get('content-type') || '';
  const body = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  if (!r.ok) throw new Error((body as { error?: string }).error || `HTTP ${r.status}`);
  return body as T;
}

let ready: Promise<void> | null = null;
const LOCAL_CODE = codeVersion(ROOT);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function health(): Promise<{ code?: string; busy?: number; team?: boolean } | null> {
  try { const r = await fetch(`${BASE}/api/health`); return r.ok ? await r.json() : null; } catch { return null; }
}
/** Start the editor server in the background if it is not running — or replace it if it runs outdated code. */
function ensureServer() {
  return (ready ??= (async () => {
    const h = await health();
    if (REMOTE) {
      if (h) return;
      ready = null;
      throw new Error(`can't reach the team's Cutroom server at ${BASE} — is the host's \`npm run team\` still running? (the quick-tunnel address changes each time it restarts; ask for a new invite and re-run setup with --join)`);
    }
    // a team-mode server serves other people right now: never restart it underneath them
    if (h && (h.code === LOCAL_CODE || h.busy || h.team)) return;
    if (h) {
      // the running server predates the current code: save + stop it, then start a fresh one
      await fetch(`${BASE}/api/shutdown`, { method: 'POST' }).catch(() => {});
      for (let i = 0; i < 20 && (await health()); i++) await sleep(250);
      // servers older than /api/shutdown: SIGTERM (it saves every project first) — only if it really is Cutroom
      if (await health()) stopCutroomOnPort(Number(new URL(BASE).port || 4317));
      for (let i = 0; i < 40 && (await health()); i++) await sleep(250);
      if (await health()) throw new Error(`an outdated Cutroom server is running on ${BASE} and would not stop — stop it (Ctrl+C in its terminal) and try again`);
    }
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    const log = fs.openSync(path.join(ROOT, 'data', 'server.log'), 'a');
    const tsx = path.join(ROOT, 'node_modules', '.bin', 'tsx');
    const child = spawn(tsx, ['apps/server/src/index.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', log, log], env: process.env });
    child.unref();
    for (let i = 0; i < 160; i++) { if (await health()) return; await sleep(250); }
    ready = null;
    throw new Error(`Cutroom server did not start — see ${path.join(ROOT, 'data', 'server.log')} (try: cd ${ROOT} && npm run doctor)`);
  })());
}

function stopCutroomOnPort(port: number) {
  if (process.platform === 'win32') return;
  try {
    const pids = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number);
    for (const pid of pids) {
      const cmd = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
      // `npm start` runs "tsx src/index.ts" inside apps/server, the MCP runs "tsx apps/server/src/index.ts" from the root
      const cwd = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).split('\n').find((l) => l.startsWith('n'))?.slice(1) ?? '';
      const ours = cwd === ROOT || cwd === path.join(ROOT, 'apps', 'server');
      if (ours && /tsx/.test(cmd) && /(apps\/server\/)?src\/index\.ts/.test(cmd)) process.kill(pid, 'SIGTERM');
    }
  } catch { /* lsof missing or nothing listening */ }
}

/** Name shown for the human in the editor (so the first open goes straight in, no name prompt). */
function ownerName() {
  try { return execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim() || os.userInfo().username; } catch { return os.userInfo().username; }
}

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 1) }] });
const PUBLIC_BASE = BASE.replace('127.0.0.1', 'localhost');
const editorUrl = (id: string, who?: string) => `${PUBLIC_BASE}/p/${id}${who ? `?name=${encodeURIComponent(who)}` : ''}`;
/** Link that signs this browser into a remote team server first (sets the invite cookie), then opens the project. */
const openUrl = (id: string, who: string) => (REMOTE && TOKEN ? `${PUBLIC_BASE}/join/${TOKEN}?next=${encodeURIComponent(`/p/${id}`)}&name=${encodeURIComponent(who)}` : editorUrl(id, who));

function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' }).unref();
}

const server = new McpServer({ name: 'cutroom', version: '0.1.0' }, {
  instructions: 'Cutroom is a collaborative video editor. Build videos by applying edit ops to a project while the user watches live. ' +
    'Always: design_direction → begin_editing → (import_media, edit — fix every ⚠ it returns, check — fix every ✖) → export_video → finish_editing. ' +
    '`check` is text-only and works in every client; screenshots are optional. Read the video-editor skill for the full workflow.',
});

server.registerTool('list_projects', { description: 'List Cutroom projects (newest first).', inputSchema: {} },
  async () => text(await call('/api/projects')));

server.registerTool('create_project', {
  description: 'Create a new video project. Use 1920x1080 for landscape, 1080x1920 for Reels/TikTok/Shorts, 1080x1080 square.',
  inputSchema: { name: z.string(), width: z.number().int().default(1920), height: z.number().int().default(1080), fps: z.number().int().default(30), background: z.string().default('#000000') },
}, async (a) => {
  const p = await call<{ id: string }>('/api/projects', { method: 'POST', json: a });
  return text({ id: p.id, url: editorUrl(p.id) });
});

server.registerTool('get_project', {
  description: 'Readable outline of a project: settings, media library, every track and clip with props/keyframes, markers, recent edits. Use it to re-orient before changing an existing video.',
  inputSchema: { project: z.string() },
}, async ({ project }) => text(await call(`/api/projects/${project}/summary`)));

server.registerTool('catalog', {
  description: 'Everything you can place: motion-graphics components (with every prop and default), synthesized sound presets, shared transform/effect/transition/audio/motion props, text animations, easings, looks. ' +
    'Start with section:"index" (one line per component/sfx/look), then fetch full prop lists with `keys` for just the ones you will use.',
  inputSchema: {
    keys: z.array(z.string()).optional().describe('component or sfx keys, e.g. ["title","kineticType","whoosh","music"] — returns their full props plus the shared props'),
    section: z.enum(['index', 'components', 'sfx', 'sharedProps', 'textAnimations', 'eases', 'looks']).optional().describe('"index" = key + description of everything (small)'),
  },
}, async ({ keys, section }) => {
  type Entry = Record<string, unknown> & { key: string; description?: string; name?: string };
  const c = await call<Record<string, unknown> & { components: Entry[]; sfx: Entry[]; looks: Entry[] }>('/api/catalog');
  if (keys?.length) {
    const want = new Set(keys);
    const components = c.components.filter((x) => want.has(x.key)), sfx = c.sfx.filter((x) => want.has(x.key));
    const unknown = keys.filter((k) => !components.some((x) => x.key === k) && !sfx.some((x) => x.key === k));
    return text({ components, sfx, ...(unknown.length ? { unknown } : {}), sharedProps: c.sharedProps, textAnimations: c.textAnimations, eases: c.eases });
  }
  if (section === 'index') {
    const brief = (x: Entry) => `${x.key} — ${x.description}`;
    return text({ components: c.components.map(brief), sfx: c.sfx.map(brief), looks: c.looks.map((l) => `${l.key} — ${l.name}`), textAnimations: c.textAnimations, eases: c.eases });
  }
  return text(section ? { [section]: c[section] } : c);
});

server.registerTool('design_direction', {
  description: 'Roll a fresh art direction (look) for a new video: palette, font pairing, shading, texture, background, text/transition/camera motion, ' +
    'music style+mood and an sfx kit, plus ready-made props ("recipes") for background/title/headline/body/lowerThird/captions/logo/code/wipe/texture/particles/music. ' +
    'Looks used by the 6 most recent projects are avoided automatically, so every video gets its own identity. Call once per new video, then ' +
    'record it with {op:"setMeta", look:<key>}. Pass `vibe` (free text from the brief, e.g. "playful consumer app launch") to bias the pick, `look` to force one, or `seed` to reproduce.',
  inputSchema: { vibe: z.string().optional(), look: z.string().optional(), avoid: z.array(z.string()).optional(), seed: z.number().int().optional() },
}, async ({ vibe, look, avoid, seed }) => {
  const q = new URLSearchParams();
  if (vibe) q.set('vibe', vibe);
  if (look) q.set('look', look);
  if (avoid?.length) q.set('avoid', avoid.join(','));
  if (seed !== undefined) q.set('seed', String(seed));
  return text(await call(`/api/looks/roll?${q}`));
});

server.registerTool('begin_editing', {
  description: 'Take the edit lock so collaborators watch (view-only) while you work, snapshot the current version, and open the editor in the user\'s browser. Call before any edits.',
  inputSchema: { project: z.string(), task: z.string().describe('One line shown to viewers, e.g. "Cutting a 45s launch teaser"'), open: z.boolean().default(true) },
}, async ({ project, task, open }) => {
  await call(`/api/projects/${project}/lock`, { method: 'POST', json: { holder: 'claude', holderName: 'Claude', task } });
  const url = editorUrl(project);
  if (open) openBrowser(openUrl(project, ownerName()));
  return text({ locked: true, url, note: open ? 'Opened the editor in the browser.' : 'Share this URL with the user.' });
});

server.registerTool('finish_editing', {
  description: 'Release the lock so humans can edit everything you made. Include a short summary of what you built.',
  inputSchema: { project: z.string(), summary: z.string() },
}, async ({ project, summary }) => {
  await call(`/api/projects/${project}/lock?holder=claude`, { method: 'DELETE', json: { summary } });
  return text({ released: true, url: editorUrl(project) });
});

server.registerTool('import_media', {
  description: 'Import files from this computer (video, audio, images, GIF, SVG) into the project media library — works with a team server elsewhere too (the bytes are uploaded). Returns media ids, durations, sizes. Non-web codecs are converted automatically.',
  inputSchema: { project: z.string(), paths: z.array(z.string()).min(1) },
}, async ({ project, paths }) => {
  const out = [];
  for (const p of paths) {
    const abs = path.resolve(p.replace(/^~(?=\/)/, process.env.HOME || '~'));
    try {
      if (!REMOTE) out.push(await call(`/api/projects/${project}/media`, { method: 'POST', json: { path: abs } }));
      else {
        // the server is on another machine: send the file's bytes
        if (!fs.existsSync(abs)) throw new Error(`file not found: ${abs}`);
        const form = new FormData();
        form.append('file', await fs.openAsBlob(abs), path.basename(abs));
        form.append('userId', 'claude'); form.append('userName', 'Claude');
        out.push(await call(`/api/projects/${project}/media`, { method: 'POST', body: form }));
      }
    }
    catch (e) { out.push({ path: p, error: (e as Error).message }); }
  }
  return text(out.map((m) => ('error' in m ? m : { id: m.id, name: m.name, kind: m.kind, duration: m.duration, width: m.width, height: m.height, hasAudio: m.hasAudio })));
});

server.registerTool('analyze_media', {
  description: 'Analyze imported media: silences (for cutting dead air in talking-head footage), loudness, a rough beat grid (cut on the beat), and scene-cut times for video.',
  inputSchema: { project: z.string(), mediaId: z.string(), sceneThreshold: z.number().default(0.3) },
}, async ({ project, mediaId, sceneThreshold }) => text(await call(`/api/projects/${project}/media/${mediaId}/analyze?threshold=${sceneThreshold}`)));

const OPS_DOC = `Array of edit ops, applied in order, atomically validated. Times are seconds. Give clips your own short ids (e.g. "title1") so later ops can refer to them.
{op:"setMeta", name?, width?, height?, fps?, background?, duration?, look?}
{op:"addTrack", id?, kind:"visual"|"audio", name?, order?}   (higher order draws on top)
{op:"updateTrack", id, name?, order?, muted?, hidden?, locked?}  {op:"removeTrack", id}
{op:"addClip", id?, type:"video"|"image"|"audio"|"component"|"sfx", start, duration?, trackId?, mediaId? (video/image/audio), component? (component key, or sfx preset key), inPoint?, speed?, name?, props?, keyframes?}
   - trackId optional: omitted → first free track of the right kind; an unknown id creates that track.
   - duration defaults: media length, component/sfx default.
{op:"updateClip", id, start?, duration?, inPoint?, speed?, trackId?, name?}
{op:"setProps", id, props:{...}}  (null removes a prop → back to default)
{op:"setKeyframes", id, prop, keyframes:[{t (clip-local s), v, ease?}]}   {op:"addKeyframe", id, prop, t, v, ease?}   {op:"removeKeyframe", id, prop, t}
{op:"splitClip", id, t (timeline s), newId?}  {op:"duplicateClip", id, newId?, start?, trackId?}  {op:"removeClip", id}  {op:"rippleDelete", id}
{op:"addMarker", id?, t, label, color?}  {op:"removeMarker", id}  {op:"clear"}
Props: see catalog. Transform x/y are the clip's center in canvas px (default = canvas center). Animate any numeric/color prop with keyframes.`;

server.registerTool('edit', {
  description: `Apply edit ops to the timeline. Viewers see each op land live (paced). ${OPS_DOC}`,
  inputSchema: {
    project: z.string(),
    ops: z.array(z.object({ op: z.string() }).passthrough()).min(1),
    pace: z.number().optional().describe(`ms between ops so the user can watch (default ${PACE}; 0 = instant)`),
  },
}, async ({ project, ops, pace }) => {
  const r = await call<{ results: { op: string; id?: string; summary: string; warnings?: string[] }[] }>(`/api/projects/${project}/ops`, { method: 'POST', json: { ops, pace: pace ?? PACE } });
  const warnings = r.results.flatMap((x) => x.warnings ?? []);
  const lines = r.results.map((x) => (x.id ? `${x.id}: ${x.summary}` : x.summary));
  return text([`${r.results.length} ops applied.`, ...lines, ...(warnings.length ? ['', `⚠ ${warnings.length} warning(s) — fix these with setProps/updateClip:`, ...warnings.map((w) => `⚠ ${w}`)] : [])].join('\n'));
});

server.registerTool('screenshot', {
  description: 'Render frames exactly as the export will look and return them as images. Run `check` first (text report, works in every client). ' +
    'If an image response errors (some API gateways reject images), do not retry — rely on `check`.',
  inputSchema: { project: z.string(), times: z.array(z.number()).min(1).max(8), scale: z.number().min(0.1).max(1).default(0.5) },
}, async ({ project, times, scale }) => {
  const content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[] = [];
  for (const t of times) {
    const buf = await call<Buffer>(`/api/projects/${project}/frame?t=${t}&scale=${scale}`);
    content.push({ type: 'text', text: `t=${t}s` }, { type: 'image', data: Buffer.from(buf).toString('base64'), mimeType: 'image/jpeg' });
  }
  return { content };
});

server.registerTool('contact_sheet', {
  description: 'One image with a grid of frames across the whole video (default 12 evenly spaced). Image output — if images fail in this client, use `check` and do not retry.',
  inputSchema: { project: z.string(), times: z.array(z.number()).optional(), cols: z.number().int().default(4) },
}, async ({ project, times, cols }) => {
  const q = times?.length ? `times=${times.join(',')}&` : '';
  const buf = await call<Buffer>(`/api/projects/${project}/sheet?${q}cols=${cols}`);
  return { content: [{ type: 'image' as const, data: Buffer.from(buf).toString('base64'), mimeType: 'image/jpeg' }] };
});

server.registerTool('check', {
  description: 'Text-only QA of the video through the real compositor — run it after each scene and before exporting. Reports, with clip ids and times: ' +
    'text cut off at a frame edge or outside title-safe, text layers overlapping each other, low text contrast, images/videos that draw nothing (not loaded / off-frame), ' +
    'flat empty frames, Reels UI-zone intrusions, unknown props / bad option values / out-of-range values / keyframes outside clips, text too fast to read, ' +
    'audio clipping and silent gaps — plus each sampled frame\'s visible layers with pixel bounding boxes. Fix every ✖ and the ⚠ that matter, then re-run.',
  inputSchema: {
    project: z.string(),
    times: z.array(z.number()).optional().describe('timeline seconds to inspect; default = every 2 s + each text clip once it has settled'),
    audio: z.boolean().default(true).describe('also analyze the final mix (peaks / silence); set false for a faster visual-only pass'),
  },
}, async ({ project, times, audio }) => text((await call<{ text: string }>(`/api/projects/${project}/check`, { method: 'POST', json: { times, audio } })).text));

server.registerTool('export_video', {
  description: 'Render the final video file. Presets: mp4 (default, H.264), draft (half-size, fast), webm, prores, gif. Waits for completion, then (by default) opens it so the user can watch. Returns the file path and a browser URL.',
  inputSchema: { project: z.string(), preset: z.string().default('mp4'), from: z.number().optional(), to: z.number().optional(), open: z.boolean().default(true).describe('play it for the user when done') },
}, async ({ project, preset, from, to, open }) => {
  let job = await call<{ id: string; status: string; file?: string; error?: string; message: string }>(`/api/projects/${project}/export`, { method: 'POST', json: { preset, range: from !== undefined || to !== undefined ? { from, to } : undefined } });
  while (job.status !== 'done' && job.status !== 'error') {
    await sleep(1500);
    job = await call(`/api/jobs/${job.id}`);
  }
  if (job.status === 'error') throw new Error(job.error);
  const url = job.file ? `${PUBLIC_BASE}/exports/${encodeURIComponent(path.basename(job.file))}` : undefined;
  let file = job.file;
  if (REMOTE && url) {
    // rendered on the team server — bring the file (and its .cutroom.json version) to this computer
    const dir = process.env.CUTROOM_DOWNLOADS || path.join(os.homedir(), 'Downloads');
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, path.basename(job.file!));
    for (const [src, dst] of [[url, file], [url.replace(/\.[^.]+$/, '.cutroom.json'), file.replace(/\.[^.]+$/, '.cutroom.json')]]) {
      const r = await fetch(src, { headers: auth() });
      if (r.ok) fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer()));
    }
  }
  if (open && file) openBrowser(file);
  return text({ file, url, opened: !!(open && file), message: job.message, ...(REMOTE ? { note: 'rendered on the team server and downloaded to this computer' } : {}) });
});

server.registerTool('versions', {
  description: 'List saved versions (one is saved automatically each time you begin editing), or restore one by id.',
  inputSchema: { project: z.string(), restore: z.string().optional() },
}, async ({ project, restore }) => {
  if (restore) return text(await call(`/api/projects/${project}/snapshots/${restore}/restore`, { method: 'POST', json: { author: { id: 'claude', name: 'Claude' } } }));
  return text(await call(`/api/projects/${project}/snapshots`));
});

await server.connect(new StdioServerTransport());
