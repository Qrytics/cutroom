// Media import: probe with ffprobe, make a web-playable copy when needed, extract a WAV for the mixer,
// compute waveform peaks and a thumbnail.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { uid, type Media } from '@cutroom/core';
import { MEDIA } from './store.ts';

export const FFMPEG = process.env.CUTROOM_FFMPEG || (ffmpegStatic as unknown as string) || 'ffmpeg';
export const FFPROBE = process.env.CUTROOM_FFPROBE || ffprobeStatic.path || 'ffprobe';

export function run(bin: string, args: string[], opts: { stdin?: boolean } = {}): Promise<{ out: Buffer; err: string }> {
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { stdio: [opts.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = []; let err = '';
    p.stdout!.on('data', (d) => out.push(d));
    p.stderr!.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res({ out: Buffer.concat(out), err }) : rej(new Error(`${path.basename(bin)} exited ${code}: ${err.slice(-1500)}`))));
  });
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']);
const WEB_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);

interface Probe {
  format: { duration?: string; format_name?: string };
  streams: { codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string; disposition?: { attached_pic?: number }; duration?: string }[];
}

export async function probe(file: string): Promise<Probe> {
  const { out } = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  return JSON.parse(out.toString());
}

const rate = (r?: string) => { if (!r) return undefined; const [a, b] = r.split('/').map(Number); return b ? a / b : a; };

/** Import a file from disk (copied into the media library). */
export async function importFile(src: string, name = path.basename(src), onProgress?: (msg: string) => void): Promise<Media> {
  if (!fs.existsSync(src)) throw Object.assign(new Error(`file not found: ${src}`), { status: 400 });
  const id = uid('m');
  const dir = path.join(MEDIA, id);
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(name).toLowerCase() || path.extname(src).toLowerCase();
  const stored = path.join(dir, `source${ext}`);
  fs.copyFileSync(src, stored);
  const url = (f: string) => `/media/${id}/${f}`;

  if (ext === '.svg') {
    const svg = fs.readFileSync(stored, 'utf8');
    const w = Number(svg.match(/width="([\d.]+)/)?.[1]) || 1000, h = Number(svg.match(/height="([\d.]+)/)?.[1]) || 1000;
    return { id, name, kind: 'image', url: url(`source${ext}`), thumbUrl: url(`source${ext}`), sourcePath: src, duration: 5, width: w, height: h, hasAudio: false };
  }

  const pr = await probe(stored);
  const v = pr.streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const a = pr.streams.find((s) => s.codec_type === 'audio');
  const duration = Number(pr.format.duration ?? v?.duration ?? a?.duration ?? 0);
  const isImage = IMAGE_EXT.has(ext) || (v && (!duration || duration < 0.05 || ['png', 'mjpeg', 'webp', 'bmp'].includes(v.codec_name) && !a));

  if (isImage && v) {
    return { id, name, kind: 'image', url: url(`source${ext}`), thumbUrl: url(`source${ext}`), sourcePath: src, duration: 5, width: v.width, height: v.height, hasAudio: false };
  }

  const m: Media = { id, name, kind: v ? 'video' : 'audio', url: url(`source${ext}`), sourcePath: src, duration, hasAudio: !!a,
    width: v?.width, height: v?.height, fps: rate(v?.avg_frame_rate) };

  if (v) {
    const webOk = WEB_VIDEO.has(v.codec_name) && ['.mp4', '.webm', '.m4v'].includes(ext);
    if (!webOk) {
      onProgress?.('making a web-playable copy');
      const remux = WEB_VIDEO.has(v.codec_name) && v.codec_name === 'h264';
      const args = ['-y', '-v', 'error', '-i', stored, '-map', '0:v:0', '-an'];
      if (remux) args.push('-c:v', 'copy');
      else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-g', '30', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
      args.push('-movflags', '+faststart', path.join(dir, 'web.mp4'));
      await run(FFMPEG, args);
      m.url = url('web.mp4');
    }
    onProgress?.('thumbnail');
    await run(FFMPEG, ['-y', '-v', 'error', '-ss', String(Math.min(1, duration / 3)), '-i', stored, '-frames:v', '1', '-vf', 'scale=320:-2', path.join(dir, 'thumb.jpg')]).catch(() => {});
    if (fs.existsSync(path.join(dir, 'thumb.jpg'))) m.thumbUrl = url('thumb.jpg');
  }
  if (a) {
    onProgress?.('extracting audio');
    const wav = path.join(dir, 'audio.wav');
    await run(FFMPEG, ['-y', '-v', 'error', '-i', stored, '-map', '0:a:0', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav]);
    m.audioUrl = url('audio.wav');
    fs.writeFileSync(path.join(dir, 'peaks.json'), JSON.stringify(peaksFromWav(fs.readFileSync(wav))));
    m.peaksUrl = url('peaks.json');
  }
  return m;
}

/** min/max pairs at 100 per second, 8-bit, from a 16-bit stereo 48 kHz wav */
export function peaksFromWav(buf: Buffer, perSecond = 100) {
  let off = 12;
  let dataStart = 44, dataLen = buf.length - 44;
  while (off < buf.length - 8) {
    const idc = buf.toString('ascii', off, off + 4), sz = buf.readUInt32LE(off + 4);
    if (idc === 'data') { dataStart = off + 8; dataLen = Math.min(sz, buf.length - dataStart); break; }
    off += 8 + sz;
  }
  const frames = Math.floor(dataLen / 4), step = Math.max(1, Math.floor(48000 / perSecond));
  const out: number[] = [];
  for (let f = 0; f < frames; f += step) {
    let mn = 0, mx = 0;
    for (let i = f; i < Math.min(frames, f + step); i++) {
      const v = (buf.readInt16LE(dataStart + i * 4) + buf.readInt16LE(dataStart + i * 4 + 2)) / 65536;
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    out.push(Math.round(mn * 127), Math.round(mx * 127));
  }
  return { perSecond, peaks: out };
}

/** Find silent stretches and loudness to help Claude cut talking-head footage. */
export async function analyzeAudio(file: string) {
  const { err } = await run(FFMPEG, ['-v', 'info', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.45,ebur128', '-f', 'null', '-']);
  const silences: { start: number; end: number }[] = [];
  let cur: number | null = null;
  for (const line of err.split('\n')) {
    const s = line.match(/silence_start: ([\d.]+)/); if (s) cur = Number(s[1]);
    const e = line.match(/silence_end: ([\d.]+)/); if (e && cur !== null) { silences.push({ start: cur, end: Number(e[1]) }); cur = null; }
  }
  const lufs = Number(err.match(/I:\s+(-?[\d.]+) LUFS/)?.[1] ?? NaN);
  return { silences, integratedLufs: lufs };
}

/** Scene-cut detection for video. */
export async function detectScenes(file: string, threshold = 0.3) {
  const { err } = await run(FFMPEG, ['-v', 'info', '-i', file, '-vf', `select='gt(scene,${threshold})',showinfo`, '-an', '-f', 'null', '-']);
  return [...err.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}

/** Rough beat grid from audio onsets (energy flux) for cutting on the beat. */
export function beatsFromWav(buf: Buffer) {
  const { peaks } = peaksFromWav(buf, 100);
  const env: number[] = [];
  for (let i = 0; i < peaks.length; i += 2) env.push(peaks[i + 1] - peaks[i]);
  const flux = env.map((v, i) => Math.max(0, v - (env[i - 1] ?? v)));
  const mean = flux.reduce((a, b) => a + b, 0) / Math.max(1, flux.length);
  const beats: number[] = [];
  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] > mean * 2.2 && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && (!beats.length || i / 100 - beats[beats.length - 1] > 0.2)) beats.push(i / 100);
  }
  return beats;
}
