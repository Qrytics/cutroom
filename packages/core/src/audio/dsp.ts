// DSP primitives shared by the sound presets and the music engine: buffers, filters, voice mixing, reverb, mastering.
import { clamp } from '../engine/ease.ts';

export const SR = 48000;
export const TAU = Math.PI * 2;
export type Stereo = [Float32Array, Float32Array];
export interface Ctx { rnd: () => number; noise: () => number }

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
/** linear attack 0→1 over a seconds */
export const att = (x: number, a: number) => (a <= 0 || x >= a ? 1 : x / a);
/** 1 until len, then exponential release */
export const rel = (x: number, len: number, r: number) => (x < len ? 1 : Math.exp(-(x - len) / r));

/** Chamberlin state-variable filter (closure form, used by the original presets). */
export function svf() {
  let lp = 0, bp = 0;
  return (x: number, f: number, q = 0.7) => {
    const F = 2 * Math.sin(Math.PI * clamp(f, 20, SR / 6) / SR);
    const hp = x - lp - q * bp; bp += F * hp; lp += F * bp;
    return { lp, bp, hp };
  };
}
/** Allocation-free state-variable filter for hot loops: tune() once (or when sweeping), run() per sample. */
export class SVF {
  lp = 0; bp = 0; hp = 0; F = 0.1; q = 0.7;
  constructor(f = 1000, q = 0.7) { this.tune(f, q); }
  tune(f: number, q = this.q) { this.F = 2 * Math.sin(Math.PI * clamp(f, 20, SR / 6) / SR); this.q = q; return this; }
  run(x: number) { const hp = x - this.lp - this.q * this.bp; this.bp += this.F * hp; this.lp += this.F * this.bp; this.hp = hp; return this.lp; }
}

export const mono = (len: number) => new Float32Array(Math.max(1, Math.ceil(len * SR)));
export const stereo = (len: number): Stereo => [mono(len), mono(len)];
export function panned(m: Float32Array, pan = 0): Stereo {
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  return [m.map((v) => v * gl), m.map((v) => v * gr)];
}
export function addInto(dst: Stereo, t: number, src: Stereo | Float32Array, gain = 1, pan = 0) {
  const st = src instanceof Float32Array ? panned(src, pan) : src;
  const s0 = Math.round(t * SR);
  for (let c = 0; c < 2; c++) for (let i = 0; i < st[c].length; i++) { const j = s0 + i; if (j >= 0 && j < dst[c].length) dst[c][j] += st[c][i] * gain; }
}

/** A mix destination: main stereo bus plus an optional reverb send at level w. */
export interface Out { m: Stereo; s: Stereo | null; w: number }
export const out = (m: Stereo, s: Stereo | null = null, w = 0): Out => ({ m, s, w });

/** Render a generated mono voice straight into the bus (no per-note buffers). gen(x) gets voice-local seconds. */
export function play(o: Out, t: number, len: number, g: number, pan: number, gen: (x: number) => number) {
  const L = o.m[0], R = o.m[1], n = L.length;
  const s0 = Math.round(t * SR), cnt = Math.ceil(Math.max(0, len) * SR);
  const gl = Math.cos((clamp(pan, -1, 1) + 1) * Math.PI / 4) * g, gr = Math.sin((clamp(pan, -1, 1) + 1) * Math.PI / 4) * g;
  const SL = o.s ? o.s[0] : null, SRr = o.s ? o.s[1] : null, wl = gl * o.w, wr = gr * o.w;
  for (let i = 0; i < cnt; i++) {
    const j = s0 + i;
    if (j >= n) break;
    const v = gen(i / SR);
    if (j < 0) continue;
    L[j] += v * gl; R[j] += v * gr;
    if (SL) { SL[j] += v * wl; SRr![j] += v * wr; }
  }
}

/** Freeverb-style reverb, mixed (dry*(1-wet) + wet). Used by the classic music bed. */
export function reverb(st: Stereo, wet = 0.3): Stereo {
  const w = reverbWet(st);
  const o: Stereo = [new Float32Array(st[0].length), new Float32Array(st[1].length)];
  for (let c = 0; c < 2; c++) for (let i = 0; i < st[c].length; i++) o[c][i] = st[c][i] * (1 - wet) + w[c][i] * wet;
  return o;
}
/** Wet-only reverb (one bus for a whole mix). */
export function reverbWet(st: Stereo, fb = 0.84): Stereo {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => Math.round(d * SR / 44100));
  const aps = [225, 556, 441].map((d) => Math.round(d * SR / 44100));
  const res: Float32Array[] = [];
  for (let ch = 0; ch < 2; ch++) {
    const x = st[ch], n = x.length, acc = new Float32Array(n);
    combs.forEach((D, k) => {
      const d = D + ch * 23 + k, line = new Float32Array(d); let idx = 0, filt = 0;
      for (let i = 0; i < n; i++) { const o = line[idx]; filt = o * 0.6 + filt * 0.4; line[idx] = x[i] + filt * fb; idx = idx + 1 === d ? 0 : idx + 1; acc[i] += o; }
    });
    for (const D of aps) {
      const d = D + ch * 7, line = new Float32Array(d); let idx = 0;
      for (let i = 0; i < n; i++) { const b = line[idx], v = acc[i] + b * 0.5; acc[i] = b - v * 0.5; line[idx] = v; idx = idx + 1 === d ? 0 : idx + 1; }
    }
    for (let i = 0; i < n; i++) acc[i] *= 0.18;
    res.push(acc);
  }
  return res as Stereo;
}

export function peak(st: Stereo | Float32Array) {
  let p = 0;
  for (const ch of st instanceof Float32Array ? [st] : st) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > p) p = a; }
  return p;
}
export function scale(st: Stereo, g: number) { for (const ch of st) for (let i = 0; i < ch.length; i++) ch[i] *= g; return st; }
/** normalize → tanh soft clip → final level, plus edge fades. Never exceeds `level`. */
export function master(st: Stereo, level = 0.62, drive = 1.5, fadeIn = 0.3, fadeOut = 1.2) {
  const p = peak(st), n = st[0].length;
  const k = p > 0 ? 1 / p : 1, d = Math.tanh(drive);
  for (const ch of st) for (let i = 0; i < n; i++) {
    const t = i / SR;
    ch[i] = Math.tanh(ch[i] * k * drive) / d * level * Math.min(1, t / Math.max(1e-3, fadeIn)) * Math.min(1, (n / SR - t) / Math.max(1e-3, fadeOut));
  }
  return st;
}
/** one-pole low-pass on a stereo bus */
export function lowpass(st: Stereo, f: number) {
  const a = 1 - Math.exp(-TAU * f / SR);
  for (const ch of st) { let y = 0; for (let i = 0; i < ch.length; i++) { y += (ch[i] - y) * a; ch[i] = y; } }
}
/** bit depth + sample-rate reduction */
export function crush(st: Stereo, bits: number, hold = 2) {
  const q = Math.pow(2, bits - 1);
  for (const ch of st) { let v = 0; for (let i = 0; i < ch.length; i++) { if (i % hold === 0) v = Math.round(ch[i] * q) / q; ch[i] = v; } }
}
/** tape-ish saturation on a normalized bus */
export function saturate(st: Stereo, drive: number) {
  const p = peak(st) || 1, d = Math.tanh(drive);
  for (const ch of st) for (let i = 0; i < ch.length; i++) ch[i] = Math.tanh(ch[i] / p * drive) / d * p;
}
/** mid/side width (1 = unchanged) */
export function widen(st: Stereo, w: number) {
  const [L, R] = st;
  for (let i = 0; i < L.length; i++) { const m = (L[i] + R[i]) / 2, s = (L[i] - R[i]) / 2 * w; L[i] = m + s; R[i] = m - s; }
}
