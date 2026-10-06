// Cutroom server: realtime project sync, the edit-ops API that Claude drives, media library, rendering.
// One port serves everything — the editor UI (via Vite), /api, /media, /exports and the /yjs websocket.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { appendLog, applyOps, catalog, rollLook, CLAUDE, projectDuration, readProject, setLock, uid, type Author, type Op } from '@cutroom/core';
import { analyzeAudio, beatsFromWav, detectScenes, importFile } from './media.ts';
import { closeBrowser, contactSheet, frames, getJob, listJobs, PRESETS, setOrigin, startExport } from './render.ts';
import { createProject, createSnapshot, deleteProject, EXPORTS, getRoom, listProjects, listSnapshots, MEDIA, project, readSnapshot, ROOT, saveAll } from './store.ts';
import { handleConnection, presence } from './sync.ts';

const PORT = Number(process.env.PORT || 4317);
// localhost by default; `npm run team` (HOST=0.0.0.0) lets collaborators on your network join
const HOST = process.env.HOST || '127.0.0.1';
const app = express();
app.use(express.json({ limit: '50mb' }));

type H = (req: Request, res: Response) => Promise<unknown> | unknown;
const h = (fn: H) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).then((v) => { if (!res.headersSent) res.json(v ?? { ok: true }); }).catch(next);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function authorOf(req: Request): Author {
  const a = req.body?.author;
  if (a?.id) return { id: String(a.id), name: String(a.name || a.id) };
  return CLAUDE;
}

/** Claude's lock heartbeat: any op call refreshes it so the UI can show "idle" when Claude stalls. */
function touchLock(id: string, author: Author) {
  const r = getRoom(id);
  const lock = readProject(r.doc).lock;
  if (lock && lock.holder === author.id) setLock(r.doc, { ...lock, lastActivity: Date.now() });
}

function assertCanEdit(id: string, author: Author) {
  const lock = readProject(getRoom(id).doc).lock;
  if (lock && lock.holder !== author.id) throw fail(423, `${lock.holderName} is editing this project ("${lock.task}"). Wait for them to finish, or force the lock.`);
}

// ---------------------------------------------------------------- projects
app.get('/api/health', h(() => ({ ok: true, name: 'cutroom', version: 1 })));
app.get('/api/catalog', h(() => catalog()));
// Roll an art direction; looks used by the most recent projects are avoided unless one is requested by key.
app.get('/api/looks/roll', h((req) => {
  const recent = listProjects().slice(0, 6).map((p) => p.look).filter(Boolean) as string[];
  const q = req.query as Record<string, string | undefined>;
  return rollLook({ vibe: q.vibe, look: q.look, seed: q.seed ? Number(q.seed) : undefined, avoid: [...recent, ...(q.avoid?.split(',') ?? [])] });
}));
app.get('/api/projects', h(() => listProjects()));
app.post('/api/projects', h((req) => {
  const { id, name = 'Untitled', width = 1920, height = 1080, fps = 30, background = '#000000' } = req.body || {};
  const r = createProject({ name, width, height, fps, background }, id);
  return project(r.id);
}));
app.get('/api/projects/:id', h((req) => {
  const p = project(req.params.id);
  return req.query.log === '0' ? { ...p, log: p.log.slice(-20) } : p;
}));
app.delete('/api/projects/:id', h((req) => { deleteProject(req.params.id); }));
app.get('/api/projects/:id/summary', h((req) => summarize(req.params.id)));
app.get('/api/projects/:id/presence', h((req) => presence(req.params.id)));

/** A compact, readable outline of the timeline for Claude. */
function summarize(id: string) {
  const p = project(id);
  const tracks = Object.values(p.tracks).sort((a, b) => (a.kind === b.kind ? b.order - a.order : a.kind === 'visual' ? -1 : 1));
  return {
    id, meta: p.meta, duration: projectDuration(p), lock: p.lock,
    media: Object.values(p.media).map((m) => ({ id: m.id, name: m.name, kind: m.kind, duration: +m.duration.toFixed(2), size: m.width ? `${m.width}x${m.height}` : undefined, hasAudio: m.hasAudio })),
    tracks: tracks.map((t) => ({
      id: t.id, name: t.name, kind: t.kind, order: t.order, ...(t.muted ? { muted: true } : {}), ...(t.hidden ? { hidden: true } : {}),
      clips: Object.values(p.clips).filter((c) => c.trackId === t.id).sort((a, b) => a.start - b.start).map((c) => ({
        id: c.id, type: c.type, component: c.component, mediaId: c.mediaId, name: c.name || undefined,
        start: +c.start.toFixed(3), duration: +c.duration.toFixed(3), end: +(c.start + c.duration).toFixed(3),
        ...(c.inPoint ? { inPoint: +c.inPoint.toFixed(3) } : {}), ...(c.speed !== 1 ? { speed: c.speed } : {}),
        props: c.props, ...(Object.keys(c.keyframes).length ? { keyframes: c.keyframes } : {}),
      })),
    })),
    markers: Object.values(p.markers),
    recentEdits: p.log.slice(-8).map((l) => `${l.authorName}: ${l.summary}`),
  };
}

// ---------------------------------------------------------------- lock
app.post('/api/projects/:id/lock', h((req) => {
  const r = getRoom(req.params.id);
  const { holder = 'claude', holderName = 'Claude', task = 'Editing', force = false } = req.body || {};
  const cur = readProject(r.doc).lock;
  if (cur && cur.holder !== holder && !force) throw fail(409, `already locked by ${cur.holderName} ("${cur.task}")`);
  if (holder === 'claude' && (!cur || cur.holder !== 'claude')) createSnapshot(req.params.id, `Before Claude: ${task}`, holder);
  setLock(r.doc, { holder, holderName, task, since: Date.now(), lastActivity: Date.now() });
  return { lock: readProject(r.doc).lock };
}));
app.delete('/api/projects/:id/lock', h((req) => {
  const r = getRoom(req.params.id);
  const cur = readProject(r.doc).lock;
  const holder = String(req.query.holder || req.body?.holder || 'claude');
  if (cur && cur.holder !== holder && req.query.force !== '1') throw fail(409, `locked by ${cur.holderName}, not ${holder}`);
  if (cur && req.body?.summary) {
    r.doc.transact(() => appendLog(r.doc, { id: uid('log'), at: Date.now(), author: cur.holder, authorName: cur.holderName, summary: `✔ Finished: ${req.body.summary}` }), 'server');
  }
  setLock(r.doc, null);
  return { lock: null };
}));

// ---------------------------------------------------------------- ops
app.post('/api/projects/:id/ops', h(async (req) => {
  const id = req.params.id;
  const author = authorOf(req);
  const ops = req.body?.ops as Op[];
  if (!Array.isArray(ops) || !ops.length) throw fail(400, 'body.ops must be a non-empty array');
  assertCanEdit(id, author);
  const r = getRoom(id);
  const pace = Math.min(5000, Math.max(0, Number(req.body?.pace ?? 0)));
  try {
    if (!pace || ops.length === 1) {
      const results = applyOps(r.doc, ops, author);
      touchLock(id, author);
      return { results };
    }
    // dry-run the whole batch first, then apply one op at a time so viewers can watch it build
    const scratch = new Y.Doc();
    Y.applyUpdate(scratch, Y.encodeStateAsUpdate(r.doc));
    applyOps(scratch, ops, author, { log: false });
    scratch.destroy();
    const results = [];
    for (const [i, o] of ops.entries()) {
      results.push(...applyOps(r.doc, [o], author));
      touchLock(id, author);
      if (i < ops.length - 1) await sleep(pace);
    }
    return { results };
  } catch (e) {
    throw fail(400, (e as Error).message);
  }
}));

// ---------------------------------------------------------------- versions
app.get('/api/projects/:id/snapshots', h((req) => listSnapshots(req.params.id)));
app.post('/api/projects/:id/snapshots', h((req) => createSnapshot(req.params.id, String(req.body?.label || 'Manual save'), authorOf(req).id)));
app.post('/api/projects/:id/snapshots/:sid/restore', h((req) => {
  const author = authorOf(req);
  assertCanEdit(req.params.id, author);
  const s = readSnapshot(req.params.id, req.params.sid);
  createSnapshot(req.params.id, `Before restoring "${s.label}"`, author.id);
  applyOps(getRoom(req.params.id).doc, [{ op: 'replaceProject', project: s.project }], author);
  return { restored: s.label };
}));

// ---------------------------------------------------------------- media
const upload = multer({ dest: path.join(os.tmpdir(), 'cutroom-uploads'), limits: { fileSize: 20 * 1024 ** 3 } });
// @types/multer ships against Express 5 typings; the middleware itself is Express 4 compatible
const uploadOne = upload.single('file') as unknown as express.RequestHandler;
app.post('/api/projects/:id/media', uploadOne, h(async (req) => {
  const id = req.params.id;
  const author = authorOf(req);
  getRoom(id);
  let media;
  if (req.file) {
    media = await importFile(req.file.path, req.file.originalname);
    fs.rmSync(req.file.path, { force: true });
  } else if (req.body?.path) {
    const src = String(req.body.path).replace(/^~(?=\/)/, os.homedir());
    media = await importFile(path.resolve(src), req.body.name || path.basename(src));
  } else throw fail(400, 'send a multipart "file" or JSON { path }');
  const by = req.file ? { id: String(req.body?.userId || 'user'), name: String(req.body?.userName || 'Someone') } : author;
  applyOps(getRoom(id).doc, [{ op: 'addMedia', media }], by);
  return media;
}));

app.get('/api/projects/:id/media/:mid/analyze', h(async (req) => {
  const p = project(req.params.id);
  const m = p.media[req.params.mid];
  if (!m) throw fail(404, 'no such media');
  const dir = path.join(MEDIA, m.id);
  const src = fs.readdirSync(dir).find((f) => f.startsWith('source'));
  const out: Record<string, unknown> = { id: m.id, name: m.name, kind: m.kind, duration: m.duration, width: m.width, height: m.height, fps: m.fps, hasAudio: m.hasAudio };
  if (m.hasAudio) {
    const wav = path.join(dir, 'audio.wav');
    Object.assign(out, await analyzeAudio(wav));
    out.beats = beatsFromWav(fs.readFileSync(wav)).slice(0, 400);
  }
  if (m.kind === 'video' && src) out.sceneCuts = await detectScenes(path.join(dir, src), Number(req.query.threshold || 0.3));
  return out;
}));

app.use('/media', express.static(MEDIA, { maxAge: '1h', fallthrough: false }));
app.use('/exports', express.static(EXPORTS, { fallthrough: false }));

// ---------------------------------------------------------------- render
app.get('/api/projects/:id/frame', h(async (req, res) => {
  const t = Number(req.query.t || 0), scale = Math.min(1, Math.max(0.05, Number(req.query.scale || 0.5)));
  const [img] = await frames(req.params.id, [t], { scale, type: req.query.type === 'png' ? 'png' : 'jpeg' });
  res.type(req.query.type === 'png' ? 'png' : 'jpeg').send(img);
}));
app.get('/api/projects/:id/sheet', h(async (req, res) => {
  const p = project(req.params.id);
  const dur = projectDuration(p);
  const times = req.query.times ? String(req.query.times).split(',').map(Number) : Array.from({ length: 12 }, (_, i) => +(dur * (i + 0.5) / 12).toFixed(2));
  res.type('jpeg').send(await contactSheet(req.params.id, times, Number(req.query.cols || 4)));
}));
app.get('/api/presets', h(() => Object.entries(PRESETS).map(([k, v]) => ({ key: k, label: v.label }))));
app.post('/api/projects/:id/export', h((req) => startExport(req.params.id, String(req.body?.preset || 'mp4'), req.body?.range)));
app.get('/api/projects/:id/jobs', h((req) => listJobs(req.params.id)));
app.get('/api/jobs/:jid', h((req) => getJob(req.params.jid) ?? Promise.reject(fail(404, 'no such job'))));

app.use('/api', (_req, _res, next) => next(fail(404, 'not found')));

// ---------------------------------------------------------------- web UI + websocket
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
wss.on('connection', handleConnection);

async function attachUi() {
  const webRoot = path.join(ROOT, 'apps/web');
  const dist = path.join(webRoot, 'dist');
  if (process.env.CUTROOM_STATIC === '1' && fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/p\/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    return;
  }
  const { createServer } = await import('vite');
  const vite = await createServer({ root: webRoot, configFile: path.join(webRoot, 'vite.config.ts'), server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
}

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/yjs/')) wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

await attachUi();
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});
server.listen(PORT, HOST, () => {
  setOrigin(`http://127.0.0.1:${PORT}`);
  const lan = HOST === '0.0.0.0' ? Object.values(os.networkInterfaces()).flat().find((i) => i?.family === 'IPv4' && !i.internal)?.address : undefined;
  console.log(`cutroom  →  http://localhost:${PORT}${lan ? `   (team: http://${lan}:${PORT})` : '   (local only — use \`npm run team\` to let others join)'}`);
});

const shutdown = async () => { saveAll(); await closeBrowser(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
