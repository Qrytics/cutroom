// Headless rendering through the editor's own compositor (apps/web/render.html), so exports and
// Claude's frame screenshots match the preview exactly.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, type Browser, type Page } from 'playwright';
import { projectDuration, uid, type Project } from '@cutroom/core';
import { FFMPEG, run } from './media.ts';
import { EXPORTS, project } from './store.ts';

let browserP: Promise<Browser> | null = null;
let origin = 'http://127.0.0.1:4317';
export function setOrigin(o: string) { origin = o; }

async function browser() {
  if (!browserP) browserP = chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding'] });
  const b = await browserP;
  if (!b.isConnected()) { browserP = null; return browser(); }
  return b;
}

async function openStage(p: Project, scale = 1): Promise<Page> {
  const b = await browser();
  const page = await b.newPage({ viewport: { width: Math.round(p.meta.width * scale), height: Math.round(p.meta.height * scale) }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[render] page error', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[render]', m.text()); });
  await page.goto(`${origin}/render.html`);
  await page.waitForFunction(() => (window as unknown as { __cutroom?: unknown }).__cutroom, null, { timeout: 60000 });
  await page.evaluate(async ([proj, s]) => (window as never as { __cutroom: { load(p: unknown, s: number): Promise<void> } }).__cutroom.load(proj, s), [p, scale] as const);
  return page;
}

/** Run something against a loaded headless stage, then close it. */
export async function withStage<T>(p: Project, fn: (page: Page) => Promise<T>, scale = 0.25): Promise<T> {
  const page = await openStage(p, scale);
  try { return await fn(page); } finally { await page.close(); }
}

const seek = (page: Page, t: number) => page.evaluate(async (t) => (window as never as { __cutroom: { seek(t: number): Promise<void> } }).__cutroom.seek(t), t);

/** PNG/JPEG frames at the given times (for Claude to look at its own edit). */
export async function frames(projectId: string, times: number[], opts: { scale?: number; type?: 'png' | 'jpeg' } = {}) {
  const p = project(projectId);
  const page = await openStage(p, opts.scale ?? 0.5);
  try {
    const out: Buffer[] = [];
    for (const t of times) {
      await seek(page, t);
      out.push(await page.screenshot({ type: opts.type ?? 'jpeg', quality: opts.type === 'png' ? undefined : 85 }));
    }
    return out;
  } finally { await page.close(); }
}

/** A grid of frames in one image. */
export async function contactSheet(projectId: string, times: number[], cols = 4) {
  const p = project(projectId);
  const scale = 360 / p.meta.width;
  const imgs = await frames(projectId, times, { scale, type: 'jpeg' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutroom-sheet-'));
  imgs.forEach((b, i) => fs.writeFileSync(path.join(dir, `f${String(i).padStart(3, '0')}.jpg`), b));
  const rows = Math.ceil(imgs.length / cols);
  const out = path.join(dir, 'sheet.jpg');
  await run(FFMPEG, ['-y', '-v', 'error', '-framerate', '1', '-i', path.join(dir, 'f%03d.jpg'), '-vf',
    `drawtext=text='%{n}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5,tile=${cols}x${rows}:padding=4:color=0x111111`, '-frames:v', '1', out]).catch(async () => {
    await run(FFMPEG, ['-y', '-v', 'error', '-framerate', '1', '-i', path.join(dir, 'f%03d.jpg'), '-vf', `tile=${cols}x${rows}:padding=4`, '-frames:v', '1', out]);
  });
  const buf = fs.readFileSync(out);
  fs.rmSync(dir, { recursive: true, force: true });
  return buf;
}

// ---------------------------------------------------------------- export jobs
export interface Job {
  id: string; projectId: string; status: 'queued' | 'rendering' | 'encoding' | 'done' | 'error';
  progress: number; message: string; file?: string; url?: string; error?: string; startedAt: number; finishedAt?: number; preset: string;
}
const jobs = new Map<string, Job>();
export const getJob = (id: string) => jobs.get(id);
/** exports still running (the MCP will not restart a busy server) */
export const activeJobs = () => [...jobs.values()].filter((j) => j.status !== 'done' && j.status !== 'error').length;
export const listJobs = (projectId: string) => [...jobs.values()].filter((j) => j.projectId === projectId).sort((a, b) => b.startedAt - a.startedAt);

export const PRESETS: Record<string, { ext: string; video: string[]; audio: string[]; scale?: number; label: string }> = {
  mp4: { label: 'MP4 (H.264) — best quality', ext: 'mp4', video: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'], audio: ['-c:a', 'aac', '-b:a', '256k'] },
  draft: { label: 'Draft MP4 (half size, fast)', ext: 'mp4', scale: 0.5, video: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'], audio: ['-c:a', 'aac', '-b:a', '160k'] },
  webm: { label: 'WebM (VP9)', ext: 'webm', video: ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4'], audio: ['-c:a', 'libopus', '-b:a', '192k'] },
  prores: { label: 'ProRes 422 HQ (.mov, for further editing)', ext: 'mov', video: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le'], audio: ['-c:a', 'pcm_s16le'] },
  gif: { label: 'GIF (half size, 15 fps, no audio)', ext: 'gif', scale: 0.5, video: [], audio: [] },
};

export function startExport(projectId: string, preset = 'mp4', range?: { from?: number; to?: number }): Job {
  const job: Job = { id: uid('job'), projectId, status: 'queued', progress: 0, message: 'starting', startedAt: Date.now(), preset };
  jobs.set(job.id, job);
  runExport(job, range).catch((e) => { job.status = 'error'; job.error = String(e?.message || e); job.finishedAt = Date.now(); console.error('[export]', e); });
  return job;
}

async function runExport(job: Job, range: { from?: number; to?: number } = {}) {
  const pre = PRESETS[job.preset] ?? PRESETS.mp4;
  const p = project(job.projectId);
  const fps = job.preset === 'gif' ? 15 : p.meta.fps;
  const from = range.from ?? 0, to = range.to ?? projectDuration(p);
  if (to <= from) throw new Error('nothing to render: the timeline is empty');
  const total = Math.round((to - from) * fps);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cutroom-export-'));
  const workers = Math.max(1, Math.min(6, os.cpus().length - 2, Math.ceil(total / 60)));
  const per = Math.ceil(total / workers);
  const scale = pre.scale ?? 1;
  job.status = 'rendering'; job.message = `rendering ${total} frames with ${workers} workers`;
  let done = 0;
  const parts: string[] = [];
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const a = w * per, b = Math.min(total, a + per);
    if (a >= b) return;
    const part = path.join(work, `part-${w}.mkv`); parts[w] = part;
    const page = await openStage(p, scale);
    const ff = spawn(FFMPEG, ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '6', '-pix_fmt', 'yuv444p', '-r', String(fps), part], { stdio: ['pipe', 'ignore', 'inherit'] });
    try {
      for (let f = a; f < b; f++) {
        await seek(page, from + f / fps);
        const buf = await page.screenshot({ type: 'jpeg', quality: 96 });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        done++; job.progress = done / total * 0.92;
      }
    } finally {
      ff.stdin.end();
      await new Promise((r) => ff.on('close', r));
      await page.close();
    }
  }));
  job.status = 'encoding'; job.message = 'mixing audio';
  const list = path.join(work, 'parts.txt');
  fs.writeFileSync(list, parts.filter(Boolean).map((x) => `file '${x}'`).join('\n'));
  const wav = path.join(work, 'mix.wav');
  if (pre.audio.length) {
    const page = await openStage(p, 0.1);
    const b64 = await page.evaluate(async ([a, b]) => (window as never as { __cutroom: { renderAudio(a: number, b: number): Promise<string> } }).__cutroom.renderAudio(a, b), [from, to] as const);
    await page.close();
    fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  }
  job.message = 'encoding';
  const name = `${p.meta.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'video'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.${pre.ext}`;
  const out = path.join(EXPORTS, name);
  const args = ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list];
  if (pre.audio.length) args.push('-i', wav);
  if (job.preset === 'gif') args.push('-vf', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4');
  else args.push(...pre.video, ...(pre.audio.length ? [...pre.audio, '-shortest'] : []));
  args.push(out);
  await run(FFMPEG, args);
  fs.rmSync(work, { recursive: true, force: true });
  job.status = 'done'; job.progress = 1; job.file = out; job.url = `/exports/${name}`; job.finishedAt = Date.now();
  job.message = `done in ${((job.finishedAt - job.startedAt) / 1000).toFixed(0)}s`;
}

export async function closeBrowser() { if (browserP) (await browserP).close().catch(() => {}); }
