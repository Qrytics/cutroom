// The mixer. One scheduling routine drives both the live preview (AudioContext) and the export (OfflineAudioContext),
// so what you hear while editing is what ends up in the file.
import { audioPlan, encodeWav, resolveProps, SFX, soundSeed, SR, synthesize, type AudioItem, type Clip, type Project } from '@cutroom/core';

const buffers = new Map<string, Promise<AudioBuffer | null>>();

function sfxKey(c: Clip) {
  const p = resolveProps(c, 0);
  const def = SFX[c.component ?? ''];
  const params = Object.fromEntries((def?.props ?? []).map((d) => [d.key, p[d.key]]));
  const len = def?.stretch ? c.inPoint + c.duration : 0;
  return `sfx|${c.component}|${JSON.stringify(params)}|${len.toFixed(3)}|${soundSeed(c)}`;
}

function bufferFor(ctx: BaseAudioContext, c: Clip, project: Project): Promise<AudioBuffer | null> {
  if (c.type === 'sfx') {
    const key = sfxKey(c);
    let b = buffers.get(key);
    if (!b) {
      b = (async () => {
        await new Promise((r) => setTimeout(r, 0));
        const p = resolveProps(c, 0);
        const st = synthesize(c.component ?? '', p, c.inPoint + c.duration, soundSeed(c));
        const buf = new AudioBuffer({ length: st[0].length, numberOfChannels: 2, sampleRate: SR });
        buf.copyToChannel(st[0] as Float32Array<ArrayBuffer>, 0); buf.copyToChannel(st[1] as Float32Array<ArrayBuffer>, 1);
        return buf;
      })();
      buffers.set(key, b);
    }
    return b;
  }
  const m = project.media[c.mediaId ?? ''];
  const url = m?.audioUrl;
  if (!url) return Promise.resolve(null);
  let b = buffers.get(url);
  if (!b) {
    b = fetch(url).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).catch((e) => { console.warn('audio decode failed', url, e); buffers.delete(url); return null; });
    buffers.set(url, b);
  }
  return b;
}

/** Decode/synthesize every sound the plan needs (call before starting playback). */
export async function warm(ctx: BaseAudioContext, project: Project, from = 0) {
  const items = audioPlan(project).filter((i) => i.start + i.duration > from);
  await Promise.all(items.map((i) => bufferFor(ctx, i.clip, project)));
}

function gainAt(item: AudioItem, T: number) {
  const g = item.gain;
  if (T <= g[0][0]) return g[0][1];
  for (let i = 0; i < g.length - 1; i++) if (T <= g[i + 1][0]) {
    const [a, ga] = g[i], [b, gb] = g[i + 1];
    return ga + (gb - ga) * ((T - a) / Math.max(1e-6, b - a));
  }
  return g[g.length - 1][1];
}

/** Schedule the project from timeline time `from` so that it plays at context time `when0`. Returns stop(). */
export async function schedule(ctx: BaseAudioContext, project: Project, from: number, when0: number, dest: AudioNode, to = Infinity) {
  const nodes: AudioScheduledSourceNode[] = [];
  for (const item of audioPlan(project)) {
    const end = item.start + item.duration;
    if (end <= from || item.start >= to) continue;
    const buf = await bufferFor(ctx, item.clip, project);
    if (!buf) continue;
    const s = Math.max(from, item.start);
    const e = Math.min(end, to);
    const src = new AudioBufferSourceNode(ctx, { buffer: buf, playbackRate: item.rate });
    const gain = new GainNode(ctx, { gain: gainAt(item, s) });
    const pan = new StereoPannerNode(ctx, { pan: item.pan });
    src.connect(gain).connect(pan).connect(dest);
    const at = (T: number) => when0 + (T - from);
    gain.gain.setValueAtTime(gainAt(item, s), at(s));
    for (const [T, g] of item.gain) if (T > s && T <= e) gain.gain.linearRampToValueAtTime(g, at(T));
    const offset = item.offset + (s - item.start) * item.rate;
    if (offset >= buf.duration) continue;
    src.start(at(s), offset, (e - s) * item.rate);
    nodes.push(src);
  }
  return () => { for (const n of nodes) { try { n.stop(); } catch { /* already stopped */ } n.disconnect(); } };
}

export class LiveMixer {
  ctx = new AudioContext({ sampleRate: SR, latencyHint: 'interactive' });
  master: GainNode;
  private stopFn: (() => void) | null = null;
  private gen = 0;
  constructor() {
    const limiter = new DynamicsCompressorNode(this.ctx, { threshold: -3, knee: 2, ratio: 20, attack: 0.002, release: 0.1 });
    this.master = new GainNode(this.ctx, { gain: 1 });
    this.master.connect(limiter).connect(this.ctx.destination);
  }
  /** Start audio at timeline time `from`; resolves with the context time that corresponds to `from`. */
  async play(project: Project, from: number) {
    const gen = ++this.gen;
    await this.ctx.resume();
    await warm(this.ctx, project, from);
    if (gen !== this.gen) return this.ctx.currentTime;
    this.stopFn?.();
    const when0 = this.ctx.currentTime + 0.06;
    this.stopFn = await schedule(this.ctx, project, from, when0, this.master);
    return when0;
  }
  stop() { this.gen++; this.stopFn?.(); this.stopFn = null; }
  /** Audition one sound (library preview). */
  async audition(preset: string, props: Record<string, unknown> = {}) {
    await this.ctx.resume();
    const def = SFX[preset];
    const st = synthesize(preset, props, Math.min(def?.defaultDuration ?? 1, 8), Math.floor(Math.random() * 1e6));
    const buf = new AudioBuffer({ length: st[0].length, numberOfChannels: 2, sampleRate: SR });
    buf.copyToChannel(st[0] as Float32Array<ArrayBuffer>, 0); buf.copyToChannel(st[1] as Float32Array<ArrayBuffer>, 1);
    const s = new AudioBufferSourceNode(this.ctx, { buffer: buf });
    s.connect(this.master); s.start();
    return () => s.stop();
  }
}

/** Offline mix of [from, to) through the master limiter, then a soft ceiling so stacked hits can never clip. */
async function mixdown(project: Project, from: number, to: number): Promise<[Float32Array, Float32Array]> {
  const len = Math.max(1, Math.ceil((to - from) * SR));
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: len, sampleRate: SR });
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -3, knee: 2, ratio: 20, attack: 0.002, release: 0.1 });
  limiter.connect(ctx.destination);
  await schedule(ctx, project, from, 0, limiter, to);
  const out = await ctx.startRendering();
  const ch: [Float32Array, Float32Array] = [out.getChannelData(0), out.getChannelData(1)];
  // the compressor lets fast transients through; bend anything above -2 dBFS smoothly towards a -1 dBFS ceiling
  const knee = 0.794, ceil = 0.891, room = ceil - knee;
  for (const c of ch) for (let i = 0; i < c.length; i++) {
    const a = Math.abs(c[i]);
    if (a > knee) c[i] = Math.sign(c[i]) * (knee + room * Math.tanh((a - knee) / room));
  }
  return ch;
}

/** Offline mix of [from, to) → 16-bit WAV, base64 (used by the exporter). */
export async function renderMix(project: Project, from: number, to: number) {
  const wav = encodeWav(await mixdown(project, from, to));
  let s = '';
  for (let i = 0; i < wav.length; i += 0x8000) s += String.fromCharCode(...wav.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Per-second peak / RMS (dBFS) of the final mix — lets Claude check the sound without listening. */
export async function mixStats(project: Project, from: number, to: number) {
  const [l, r] = await mixdown(project, from, to);
  const db = (x: number) => (x > 1e-6 ? +(20 * Math.log10(x)).toFixed(1) : -120);
  const out: { t: number; peak: number; rms: number }[] = [];
  for (let s0 = 0; s0 < l.length; s0 += SR) {
    let pk = 0, sum = 0;
    const e = Math.min(l.length, s0 + SR);
    for (let i = s0; i < e; i++) { pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i])); sum += (l[i] * l[i] + r[i] * r[i]) / 2; }
    out.push({ t: +(from + s0 / SR).toFixed(2), peak: db(pk), rms: db(Math.sqrt(sum / Math.max(1, e - s0))) });
  }
  return out;
}
