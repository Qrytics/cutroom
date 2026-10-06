// Procedural sound effects + music beds, ported from the motion-video skill's synth.mjs.
// Pure functions: (params, duration, seed) → stereo Float32Arrays at 48 kHz. No samples, no Web Audio needed,
// so the same preset renders identically in the browser preview, the headless export and in Node.
import type { PropDef } from '../schema/props.ts';
import type { Props } from '../schema/types.ts';
import { clamp, rng } from '../engine/ease.ts';
import { addInto, att, type Ctx, env, mono, mtof, out, type Out, panned, play, reverb, reverbWet, SR, type Stereo, stereo, SVF, svf, TAU } from './dsp.ts';
import * as I from './instruments.ts';
import { degNote, moodChords, MUSIC_MOODS, MUSIC_STYLES, musicGen, resolveStyle } from './music.ts';

export { SR } from './dsp.ts';
export type { Stereo } from './dsp.ts';
export { MUSIC_MOODS, MUSIC_STYLES, AUTO_STYLES } from './music.ts';

// ---------------------------------------------------------------- one-shots
function whoosh(c: Ctx, len: number, g: number, tone = 0): Stereo {
  const n = Math.ceil(len * SR), L = new Float32Array(n), R = new Float32Array(n); const f1 = svf(), f2 = svf(), tk = Math.pow(2, tone * 1.2);
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / len; const e = Math.sin(Math.PI * k) ** 2; const fc = (250 + 3200 * k ** 1.6) * tk;
    const a = f1(c.noise(), fc, 0.45).bp, b = f2(c.noise(), fc * 1.05, 0.45).bp;
    L[i] = a * e * (1 - k * 0.7) * g * 0.9; R[i] = b * e * (0.3 + k * 0.7) * g * 0.9;
  }
  return [L, R];
}
function click(c: Ctx, g: number) {
  const o = mono(0.05); const f = svf();
  for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = (f(c.noise(), 3500, 0.6).bp * Math.exp(-t / 0.004) * 0.9 + Math.sin(TAU * 1800 * t) * Math.exp(-t / 0.012) * 0.35) * g; }
  return o;
}
function pop(g: number) {
  const o = mono(0.18); let ph = 0;
  for (let i = 0; i < o.length; i++) { const t = i / SR; ph += (480 + 520 * Math.exp(-t / 0.025)) / SR; o[i] = Math.sin(TAU * ph) * env(t, 0.003, 0.05) * 0.5 * g; }
  return o;
}
function tick(c: Ctx, freq: number, g: number) {
  const o = mono(0.03); const f = svf();
  for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = (freq ? Math.sin(TAU * freq * t) * 0.5 : f(c.noise(), 5000, 0.5).bp) * Math.exp(-t / (freq ? 0.02 : 0.003)) * g; }
  return o;
}
function chime(g: number, base = 1318.5) {
  const o = mono(1.4);
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    o[i] = (Math.sin(TAU * base * t) + 0.6 * Math.sin(TAU * base * 1.4983 * t) * Math.exp(-t / 0.3) + 0.25 * Math.sin(TAU * base * 2.67 * t) * Math.exp(-t / 0.12)) * env(t, 0.002, 0.42) * 0.22 * g;
  }
  return o;
}
function alert(g: number) {
  const o = mono(0.6); const f = svf();
  for (let i = 0; i < o.length; i++) {
    const t = i / SR; const fr = t < 0.22 ? 880 : 698; const sq = Math.sign(Math.sin(TAU * fr * t));
    const e = t < 0.22 ? env(t, 0.005, 0.12) : env(t - 0.22, 0.005, 0.16); o[i] = f(sq, 2200, 0.8).lp * e * 0.22 * g;
  }
  return o;
}
function thud(c: Ctx, g: number, tone = 0, decay = 1) {
  const o = mono(0.6 * Math.max(1, decay)); let ph = 0; const f = svf(), tk = Math.pow(2, tone * 0.6);
  for (let i = 0; i < o.length; i++) { const t = i / SR; ph += (40 + 60 * Math.exp(-t / 0.05)) * tk / SR; o[i] = (Math.sin(TAU * ph) * Math.exp(-t / (0.22 * decay)) + f(c.noise(), 300 * tk * tk, 0.7).lp * Math.exp(-t / 0.03) * 0.8) * g; }
  return o;
}
function boom(c: Ctx, g: number, len = 2.4, tone = 0, decay = 1) {
  const o = mono(len); let ph = 0; const f = svf(), tk = Math.pow(2, tone * 0.6);
  for (let i = 0; i < o.length; i++) { const t = i / SR; ph += (34 + 70 * Math.exp(-t / 0.08)) * tk / SR; o[i] = (Math.sin(TAU * ph) * Math.exp(-t / (0.7 * decay)) * 0.9 + f(c.noise(), 180 * tk * tk, 0.6).lp * Math.exp(-t / (0.25 * decay)) * 0.7) * g; }
  return o;
}
function riser(c: Ctx, len: number, g: number): Stereo {
  const n = Math.ceil(len * SR), L = new Float32Array(n), R = new Float32Array(n); const f1 = svf(), f2 = svf(); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / len; const fc = 200 + 5000 * k * k; ph += (110 + 330 * k * k) / SR; const e = k ** 2.2;
    const s = Math.sin(TAU * ph) * 0.15; L[i] = (f1(c.noise(), fc, 0.4).bp * 0.6 + s) * e * g; R[i] = (f2(c.noise(), fc * 1.03, 0.4).bp * 0.6 + s) * e * g;
  }
  return [L, R];
}
function shimmer(g: number, len = 2.2): Stereo {
  const n = Math.ceil(len * SR), L = new Float32Array(n), R = new Float32Array(n);
  const fr = [2349, 2637, 2960, 3520, 4186];
  for (let i = 0; i < n; i++) {
    const t = i / SR; let a = 0, b = 0;
    fr.forEach((f, k) => { const s = Math.sin(TAU * f * t + k) * (0.5 + 0.5 * Math.sin(TAU * (6 + k) * t)); if (k % 2) a += s; else b += s; });
    const e = env(t, 0.15, len * 0.27) * 0.05 * g; L[i] = a * e; R[i] = b * e;
  }
  return [L, R];
}
function beep(freq: number, len: number, g: number) {
  const o = mono(len);
  for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = Math.sin(TAU * freq * t) * env(t, 0.004, len / 3) * g; }
  return o;
}
function glitch(c: Ctx, len: number, g: number): Stereo {
  const out = stereo(len); let hold = 0, v = 0;
  for (let i = 0; i < out[0].length; i++) {
    if (hold-- <= 0) { hold = Math.floor(c.rnd() * 900); v = c.noise() * (c.rnd() < 0.3 ? 0 : 1); }
    const t = i / SR; const sq = Math.sign(Math.sin(TAU * (200 + c.rnd() * 30) * t)) * 0.2;
    out[0][i] = (v * 0.5 + sq * (hold % 2)) * g * 0.5; out[1][i] = (v * 0.4 - sq * 0.5) * g * 0.5;
  }
  return out;
}
function swoosh(c: Ctx, len: number, g: number): Stereo { return whoosh(c, len, g * 0.5); }
function notification(g: number) {
  const out = mono(0.9);
  [[1046.5, 0], [1568, 0.11]].forEach(([f, d]) => { const b = beep(f, 0.5, 0.3 * g); for (let i = 0; i < b.length; i++) { const j = i + Math.round(d * SR); if (j < out.length) out[j] += b[i]; } });
  return out;
}
function camera(c: Ctx, g: number) {
  const out = mono(0.35); const f = svf();
  for (let i = 0; i < out.length; i++) { const t = i / SR; const e = Math.exp(-t / 0.01) + (t > 0.12 ? Math.exp(-(t - 0.12) / 0.015) * 0.8 : 0); out[i] = f(c.noise(), 2600, 0.5).bp * e * g; }
  return out;
}

// ---------------------------------------------------------------- music bed
function padVoice(c: Ctx, freq: number, len: number, bright = 1) {
  const out = mono(len); const f = svf(); let p1 = c.rnd(), p2 = c.rnd(), p3 = c.rnd();
  const det = Math.pow(2, 7 / 1200);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    p1 = (p1 + freq / SR) % 1; p2 = (p2 + freq * det / SR) % 1; p3 = (p3 + freq / det / SR) % 1;
    const saw = (p1 * 2 - 1) + (p2 * 2 - 1) * 0.8 + (p3 * 2 - 1) * 0.8;
    const cut = (500 + 700 * bright) * (1 + 0.25 * Math.sin(TAU * 0.13 * t));
    const a = Math.min(1, t / 1.4), r = Math.min(1, (len - t) / 1.4);
    out[i] = f(saw, cut, 0.9).lp * 0.12 * a * r;
  }
  return out;
}
function pluck(freq: number, len = 0.6) {
  const out = mono(len); let p = 0;
  for (let i = 0; i < out.length; i++) { const t = i / SR; p += freq / SR; const tri = 1 - 4 * Math.abs((p % 1) - 0.5); out[i] = (Math.sin(TAU * p) * 0.7 + tri * 0.3) * Math.exp(-t / 0.18) * Math.min(1, t / 0.004); }
  return out;
}
function subBass(freq: number, len: number) {
  const out = mono(len);
  for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] = Math.sin(TAU * freq * t) * 0.22 * Math.min(1, t / 0.8) * Math.min(1, (len - t) / 0.8); }
  return out;
}
function kick(g = 1) {
  const out = mono(0.35); let ph = 0;
  for (let i = 0; i < out.length; i++) { const t = i / SR; const f = 45 + 90 * Math.exp(-t / 0.03); ph += f / SR; out[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.12) * g; }
  return out;
}
function hat(c: Ctx, g = 1) {
  const out = mono(0.06); const f = svf();
  for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] = f(c.noise(), 9000, 0.4).hp * Math.exp(-t / 0.012) * g; }
  return out;
}
export const MOODS: Record<string, { chords: number[][]; bpm: number }> = {
  hopeful: { chords: [[57, 64, 69, 72], [53, 60, 65, 69], [48, 55, 60, 64], [55, 62, 67, 71]], bpm: 96 },
  epic: { chords: [[50, 57, 62, 65], [46, 53, 58, 62], [53, 60, 65, 69], [48, 55, 60, 64]], bpm: 84 },
  chill: { chords: [[50, 57, 60, 65], [55, 62, 65, 69], [48, 55, 59, 64], [53, 57, 60, 64]], bpm: 80 },
  tech: { chords: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]], bpm: 112 },
  dark: { chords: [[45, 52, 55, 60], [44, 51, 55, 59], [41, 48, 53, 56], [43, 50, 55, 58]], bpm: 90 },
  bright: { chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]], bpm: 120 },
};

/** the original single-engine bed (style: classic) */
function classicMusic(c: Ctx, len: number, p: Props): Stereo {
  const mood = MOODS[String(p.mood)] || { chords: moodChords(String(p.mood)), bpm: 96 };
  const bpm = Number(p.bpm) || mood.bpm, beat = 60 / bpm, BAR = beat * 4;
  const out = stereo(len);
  const intro = Number(p.intro ?? 4), drums = Boolean(p.drums ?? true), arp = Boolean(p.arp ?? true);
  const key = Number(p.transpose ?? 0);
  for (let b = 0, t = 0; t < len; b++, t = b * BAR) {
    const ch = mood.chords[b % mood.chords.length].map((m) => m + key);
    const bright = t < intro ? 0.3 + 0.7 * (t / Math.max(0.1, intro)) : 1;
    ch.forEach((m, k) => addInto(out, t, padVoice(c, mtof(m + 12), Math.min(BAR + 1.6, len - t + 0.01), bright), 0.55, (k / Math.max(1, ch.length - 1)) * 1.2 - 0.6));
    addInto(out, t, subBass(mtof(ch[0] - 12), Math.min(BAR + 0.8, len - t + 0.01)), t < intro ? 0.3 : 0.7);
  }
  if (arp) for (let s = 0, t = intro; t < len - 0.5; s++, t = intro + s * BAR / 8) {
    const ch = mood.chords[Math.floor(t / BAR) % mood.chords.length].map((m) => m + key);
    const pat = [0, 2, 3, 4, 3, 2, 1, 2];
    addInto(out, t, pluck(mtof(ch[pat[s % 8] % ch.length] + 24)), 0.07, s % 2 ? 0.35 : -0.35);
  }
  if (drums) for (let s = 0, t = intro; t < len - 0.3; s++, t = intro + s * beat / 2) {
    if (s % 2 === 0) addInto(out, t, kick(0.2));
    addInto(out, t, hat(c, s % 2 ? 0.06 : 0.035), 1, 0.2);
  }
  const r = reverb(out, 0.42);
  let pk = 0; for (const ch of r) for (const v of ch) pk = Math.max(pk, Math.abs(v));
  const norm = pk > 0 ? 0.6 / pk : 1;
  for (const ch of r) for (let i = 0; i < ch.length; i++) {
    const t = i / SR; ch[i] *= norm * Math.min(1, t / 0.6) * Math.min(1, (len - t) / 1.2);
  }
  return r;
}

// ---------------------------------------------------------------- expanded library
/** render into a bus with a reverb send, return dry + wet */
function verb(len: number, wet: number, fn: (o: Out) => void): Stereo {
  const m = stereo(len), s = stereo(len); fn(out(m, s, wet));
  const w = reverbWet(s); for (let c = 0; c < 2; c++) for (let i = 0; i < m[c].length; i++) m[c][i] += w[c][i];
  return m;
}
const dry = (len: number, fn: (o: Out) => void): Stereo => { const m = stereo(len); fn(out(m)); return m; };
const tk = (p: Props) => Math.pow(2, Number(p.tone ?? 0));
const dk = (p: Props) => Math.max(0.1, Number(p.decay ?? 1));
const wrap = (x: number) => x - Math.floor(x);
const PENTA = [0, 2, 4, 7, 9];
const penta = (base: number, i: number) => base + PENTA[i % 5] + 12 * Math.floor(i / 5);

// transitions
function downlifter(c: Ctx, len: number, g: number, tone: number) {
  return dry(len, (o) => {
    const fl = new SVF(4000, 0.45); let ph = 0;
    play(o, 0, len, g, 0, (x) => {
      const k = x / len, e = att(x, 0.02) * (1 - k) ** 1.5;
      fl.tune((150 + 5000 * (1 - k) ** 2) * tone); ph = wrap(ph + (50 + 450 * (1 - k) ** 2) / SR);
      return (fl.run(c.noise()) * 0.8 + Math.sin(TAU * ph) * 0.25) * e;
    });
  });
}
function reverseSwell(c: Ctx, len: number, g: number) {
  return dry(len, (o) => {
    const fl = new SVF(3000, 0.6), fr = [523, 659, 784, 1046, 1568];
    play(o, 0, len, g, 0, (x) => {
      const k = x / len, e = (Math.exp(5 * k) - 1) / (Math.exp(5) - 1) * Math.min(1, (len - x) / 0.012);
      fl.run(c.noise()); let s = 0; for (const f of fr) s += Math.sin(TAU * f * x);
      return (fl.hp * 0.7 + s * 0.06) * e;
    });
  });
}
function tapeStop(c: Ctx, len: number, g: number) {
  return verb(len, 0.15, (o) => [48, 55, 60, 63, 67].forEach((m, k) => {
    let ph = c.rnd(); const fl = new SVF(1800, 0.7);
    play(o, 0, len, g * 0.18, k / 2 - 1, (x) => {
      const sp = Math.max(0, 1 - x / len) ** 1.6; ph = wrap(ph + mtof(m) * sp / SR); fl.tune(200 + 1600 * sp);
      return fl.run(ph * 2 - 1) * att(x, 0.01) * Math.min(1, sp * 4);
    });
  }));
}
function vinylScratch(c: Ctx, len: number, g: number) {
  return dry(len, (o) => {
    const fl = new SVF(1000, 0.35); let ph = 0;
    play(o, 0, len, g, 0, (x) => {
      const v = Math.cos(TAU * (x / len) * 2.5), a = Math.abs(v);
      ph = wrap(ph + (150 + a * 900) * Math.sign(v) / SR); fl.tune(300 + 2800 * a); fl.run(c.noise());
      return (fl.bp * 0.8 + (ph * 2 - 1) * 0.3) * a ** 0.7;
    });
  });
}
function whooshHit(c: Ctx, len: number, g: number, tone: number) {
  const st = stereo(len), wl = Math.max(0.25, len - 1.1);
  addInto(st, 0, whoosh(c, wl, g * 0.9, Math.log2(tone)));
  addInto(st, wl, impact(c, g, tone, 0.8));
  return st;
}
function zap(c: Ctx, g: number) {
  return dry(0.35, (o) => {
    let ph = 0; const fl = new SVF(4000, 0.5);
    play(o, 0, 0.35, g, 0, (x) => { ph = wrap(ph + (120 + 3000 * Math.exp(-x / 0.05)) * (1 + 0.3 * Math.sin(TAU * 60 * x)) / SR); return fl.run(ph < 0.5 ? 1 : -1) * env(x, 0.002, 0.08) * 0.5; });
  });
}
function warp(c: Ctx, len: number, g: number) {
  const st = stereo(len);
  for (let ch = 0; ch < 2; ch++) {
    const line = new Float32Array(2048); let w = 0; const ph = [c.rnd(), c.rnd(), c.rnd()]; const fl = new SVF(1200, 0.6);
    for (let i = 0; i < st[ch].length; i++) {
      const x = i / SR, k = x / len, f = 220 * Math.pow(2, 1.5 * Math.sin(Math.PI * k) - 0.5 * k);
      let s = 0; for (let j = 0; j < 3; j++) { ph[j] = wrap(ph[j] + f * (1 + (j - 1) * 0.01) / SR); s += ph[j] * 2 - 1; }
      s = fl.run(s); line[w] = s;
      const d = Math.floor(40 + 300 * (0.5 + 0.5 * Math.sin(TAU * (1.3 + ch * 0.2) * x)));
      st[ch][i] = (s + line[(w - d + 2048) % 2048]) * Math.sin(Math.PI * k) * g * 0.3; w = (w + 1) % 2048;
    }
  }
  return st;
}
function sweepUp(c: Ctx, len: number, g: number, tone: number) {
  return dry(len, (o) => {
    const a = new SVF(300, 0.35), b = new SVF(300, 0.35);
    play(o, 0, len, g * 0.8, -0.4, (x) => { const k = x / len; a.tune(300 * Math.pow(30, k) * tone); return a.run(c.noise()) * k ** 1.2 * Math.min(1, (len - x) / (len * 0.1)); });
    play(o, 0, len, g * 0.8, 0.4, (x) => { const k = x / len; b.tune(310 * Math.pow(30, k) * tone); return b.run(c.noise()) * k ** 1.2 * Math.min(1, (len - x) / (len * 0.1)); });
  });
}
function airPuff(c: Ctx, g: number) {
  return dry(0.2, (o) => { const fl = new SVF(1100, 0.8); play(o, 0, 0.2, g, 0, (x) => fl.run(c.noise()) * env(x, 0.012, 0.045)); });
}

// ui
function snap(c: Ctx, g: number) {
  return dry(0.12, (o) => { const fl = new SVF(2600, 0.4); play(o, 0, 0.12, g, 0, (x) => { fl.run(c.noise()); return fl.bp * Math.exp(-x / 0.011) * 1.4 + Math.sin(TAU * 1300 * x) * Math.exp(-x / 0.006) * 0.3; }); });
}
function tone1(o: Out, t: number, len: number, g: number, pan: number, f: (x: number) => number, shape: (ph: number) => number = (ph) => Math.sin(TAU * ph), e: (x: number) => number = (x) => env(x, 0.003, len / 3)) {
  let ph = 0; play(o, t, len, g, pan, (x) => { ph = wrap(ph + f(x) / SR); return shape(ph) * e(x); });
}
const sq = (ph: number) => (ph < 0.5 ? 1 : -1);
function swipe(c: Ctx, g: number) {
  const len = 0.28, st = stereo(len), fl = new SVF(2000, 0.4);
  for (let i = 0; i < st[0].length; i++) {
    const x = i / SR, k = x / len; fl.tune(2000 + 4500 * k); const v = fl.run(c.noise()) * Math.sin(Math.PI * k) ** 2 * g;
    st[0][i] = v * Math.cos(k * Math.PI / 2); st[1][i] = v * Math.sin(k * Math.PI / 2);
  }
  return st;
}
function keyboardClack(c: Ctx, len: number, g: number) {
  return dry(len, (o) => {
    let t = 0, n = 0;
    while (t < len - 0.05) {
      const space = n > 2 && c.rnd() < 0.14, v = (0.7 + c.rnd() * 0.3) * (space ? 1.25 : 1), lpF = new SVF(space ? 380 : 650, 0.6), bp = new SVF(3200 + c.rnd() * 1200, 0.4), f0 = space ? 120 : 170 + c.rnd() * 40;
      play(o, t, 0.08, g * v, c.rnd() * 0.5 - 0.25, (x) => { bp.run(c.noise()); return lpF.run(c.noise()) * Math.exp(-x / 0.02) * 0.9 + Math.sin(TAU * f0 * x) * Math.exp(-x / 0.018) * 0.4 + bp.bp * Math.exp(-x / 0.0035); });
      t += space ? 0.16 + c.rnd() * 0.08 : 0.06 + c.rnd() * 0.09; n = space ? 0 : n + 1;
    }
  });
}
function mouseScroll(c: Ctx, len: number, g: number) {
  return dry(len, (o) => {
    for (let t = 0; t < len - 0.01; t += 1 / 22 + (c.rnd() - 0.5) * 0.008) {
      const fl = new SVF(5200, 0.3), a = Math.sin(Math.PI * Math.min(1, t / len)) ** 0.5;
      play(o, t, 0.01, g * a, 0.1, (x) => { fl.run(c.noise()); return fl.bp * Math.exp(-x / 0.0015); });
    }
  });
}
function trash(c: Ctx, g: number) {
  return dry(0.65, (o) => {
    for (let t = 0; t < 0.38; t += 0.01 + c.rnd() * 0.035) { const fl = new SVF(1000 + c.rnd() * 3000, 0.5); play(o, t, 0.03, g * (0.4 + c.rnd() * 0.6), c.rnd() - 0.5, (x) => { fl.run(c.noise()); return fl.bp * Math.exp(-x / 0.006); }); }
    I.tom(o, c, 0.4, 90, g * 0.6);
  });
}
function crowdCheer(c: Ctx, len: number, g: number) {
  return verb(len, 0.25, (o) => {
    [520, 880, 1350, 2300, 3100].forEach((f, k) => {
      const fl = new SVF(f, 0.25); let a = 0.5, tgt = 0.5;
      play(o, 0, len, g * 0.55, k / 2 - 1, (x) => { if (c.rnd() < 20 / SR) tgt = 0.3 + c.rnd() * 0.7; a += (tgt - a) * 0.0006; fl.run(c.noise()); return fl.bp * a * att(x, 0.5) * Math.min(1, (len - x) / 0.8); });
    });
    for (let t = 0.2; t < len - 0.3; t += 0.03 + c.rnd() * 0.06) I.clap(o, c, t, g * 0.12 * Math.min(1, (len - t) / 0.8), c.rnd() * 1.6 - 0.8);
    for (let t = 0.4; t < len - 0.8; t += 0.8 + c.rnd() * 1.5) { const f0 = 1800 + c.rnd() * 1200; tone1(o, t, 0.5, g * 0.06, c.rnd() - 0.5, (x) => f0 * (1 + 0.3 * Math.sin(Math.PI * x / 0.5)), undefined, (x) => Math.sin(Math.PI * x / 0.5)); }
  });
}

// impacts
function impact(c: Ctx, g: number, tone = 1, decay = 1) {
  return verb(2 * decay, 0.25, (o) => {
    let ph = 0; const fl = new SVF(2500 * tone, 0.6);
    play(o, 0, 1.6 * decay, g, 0, (x) => {
      ph = wrap(ph + (46 + 120 * Math.exp(-x / 0.03)) / SR); fl.run(c.noise());
      let m = 0; for (const r of [1, 1.48, 2.1, 2.9]) m += Math.sin(TAU * 180 * tone * r * x);
      return Math.tanh(Math.sin(TAU * ph) * Math.exp(-x / (0.5 * decay)) * 1.8 + fl.lp * Math.exp(-x / 0.08) * 1.2 + m * 0.08 * Math.exp(-x / (0.35 * decay)));
    });
  });
}
function punch(c: Ctx, g: number, tone: number) {
  return dry(0.4, (o) => { let ph = 0; const fl = new SVF(1500 * tone, 0.6); play(o, 0, 0.4, g, 0, (x) => { ph = wrap(ph + (55 + 80 * Math.exp(-x / 0.03)) * tone / SR); return Math.tanh(Math.sin(TAU * ph) * Math.exp(-x / 0.11) * 1.6 + fl.run(c.noise()) * Math.exp(-x / 0.025) * 1.4); }); });
}
function subDrop(len: number, g: number) {
  return dry(len, (o) => tone1(o, 0, len, g * 0.9, 0, (x) => 30 + 70 * Math.exp(-x / (len * 0.35)), undefined, (x) => att(x, 0.01) * Math.min(1, (len - x) / 0.3)));
}
function gong(c: Ctx, g: number, decay: number) {
  return verb(5 * decay, 0.3, (o) => {
    const fr = [1, 1.52, 2.13, 2.66, 3.22, 4.1, 5.43], ds = [4, 3, 2.5, 2, 1.6, 1.2, 0.8];
    fr.forEach((r, k) => play(o, 0, 5 * decay, g * 0.14 / Math.sqrt(k + 1), k % 2 ? 0.3 : -0.3, (x) => (Math.sin(TAU * 98 * r * x) + Math.sin(TAU * 98 * r * 1.003 * x)) * Math.exp(-x / (ds[k] * decay)) * att(x, 0.004 * (k + 1))));
    const fl = new SVF(600, 0.6); play(o, 0, 0.3, g * 0.5, 0, (x) => fl.run(c.noise()) * Math.exp(-x / 0.05));
  });
}
function metalClang(c: Ctx, g: number, tone: number, decay: number) {
  return verb(1.6 * decay, 0.2, (o) => {
    [1, 2.32, 3.71, 4.94, 6.83].forEach((r, k) => play(o, 0, 1.6 * decay, g * 0.16, k % 2 ? 0.25 : -0.25, (x) => Math.sin(TAU * 420 * tone * r * x) * Math.exp(-x / ((0.9 - k * 0.12) * decay))));
    const fl = new SVF(3000, 0.4); play(o, 0, 0.1, g * 0.6, 0, (x) => { fl.run(c.noise()); return fl.bp * Math.exp(-x / 0.015); });
  });
}
function glassTing(g: number) {
  return verb(1.3, 0.3, (o) => [[3150, 0.9], [4720, 0.6], [6980, 0.4]].forEach(([f, d], k) => play(o, 0, 1.3, g * 0.13, k - 1, (x) => Math.sin(TAU * f * x) * Math.exp(-x / d) * att(x, 0.001))));
}
function slam(c: Ctx, g: number) {
  return verb(0.9, 0.2, (o) => {
    const a = new SVF(800, 0.7), b = new SVF(1500, 0.4); let ph = 0;
    play(o, 0, 0.9, g, 0, (x) => {
      ph = wrap(ph + (55 + 40 * Math.exp(-x / 0.02)) / SR); b.run(c.noise());
      return Math.tanh(a.run(c.noise()) * Math.exp(-x / 0.07) * 2 + Math.sin(TAU * ph) * Math.exp(-x / 0.15) + b.bp * (0.5 + 0.5 * Math.sin(TAU * 31 * x)) * Math.exp(-x / 0.18) * 0.5);
    });
  });
}
function heartbeat(g: number) {
  return dry(0.9, (o) => [[0, 1], [0.28, 0.75]].forEach(([t, v]) => tone1(o, t, 0.3, g * v, 0, (x) => 40 + 25 * Math.exp(-x / 0.03), undefined, (x) => env(x, 0.004, 0.08))));
}
function drumroll(c: Ctx, len: number, g: number) {
  return verb(len + 0.4, 0.2, (o) => {
    for (let t = 0; t < len - 0.05;) { const k = t / len; I.snare(o, c, t, g * (0.25 + 0.6 * k * k), 0.7); t += 1 / (14 + 12 * k); }
    I.snare(o, c, len - 0.05, g * 1.1); I.crash(o, c, len - 0.05, g * 0.6, 0.4);
  });
}

// tonal
function stinger(c: Ctx, p: Props) {
  const kind = String(p.kind ?? 'hit'), mood = String(p.mood ?? (kind === 'dark' ? 'dark' : 'hopeful'));
  const M = MUSIC_MOODS[mood] || MUSIC_MOODS.hopeful, key = 48 + (((M.root + Number(p.transpose ?? 0)) % 12) + 12) % 12;
  const ch = [0, 2, 4, 7].map((i) => degNote(M.scale, key + 12, i));
  const len = kind === 'rise' ? 3.2 : 2.8, at = kind === 'rise' ? 1.2 : 0;
  return verb(len, 0.4, (o) => {
    if (kind === 'rise') I.noiseRiser(o, c, 0, at, 0.8);
    if (kind === 'hit' || kind === 'rise' || kind === 'epic') {
      ch.forEach((m, k) => I.supersaw(o, c, at, mtof(m), 1.2, 0.7, k / 2 - 0.75, 0.003, 0.9, 900, 3, 0.15, 3, 0.25));
      I.subBoom(o, c, at, 0.6);
    }
    if (kind === 'success') ch.concat(ch[0] + 12).forEach((m, k) => I.bell(o, k * 0.07, mtof(m + 12), 1.4, 0.8, k / 3 - 0.6, 2));
    if (kind === 'magic') { for (let i = 0; i < 14; i++) I.ks(o, c, i * 0.04, mtof(degNote(M.scale, key + 12, i)), 1.2, 0.35, i / 7 - 1, 0.8, 1.2); ch.forEach((m) => I.bell(o, 0.6, mtof(m + 24), 1.6, 0.4, 0, 3.5)); }
    if (kind === 'playful') { [0, 1, 2, 3, 2, 3].forEach((n, k) => I.ks(o, c, k * 0.08, mtof(ch[n] + 12), 0.25, 0.7, k % 2 ? 0.3 : -0.3, 0.95, 0.4)); I.bell(o, 0.5, mtof(ch[0] + 24), 0.6, 0.6, 0, 2, 0.25); }
    if (kind === 'dark' || kind === 'epic') { I.braam(o, c, 0, key + 12, 1.8, 1); I.taiko(o, c, 0, kind === 'epic' ? 0.9 : 0.6); }
    if (kind === 'dark') ch.slice(0, 3).forEach((m, k) => I.strings(o, c, 0.1, mtof(m - 12), 1.8, 0.6, k - 1, 0.3, 0.8));
    if (kind === 'epic') { ch.forEach((m, k) => I.strings(o, c, 0, mtof(m), 1.8, 0.6, k / 2 - 0.75, 0.05, 0.8)); I.crash(o, c, 0, 0.5, 2.4); }
  });
}
function magic(c: Ctx, g: number) {
  return verb(2, 0.45, (o) => { for (let i = 0; i < 14; i++) I.bell(o, i * 0.035, mtof(penta(79, i)), 0.6, g * (0.4 + i / 20), Math.sin(i), 3.5, 0.5); for (let i = 0; i < 8; i++) I.bell(o, 0.5 + c.rnd() * 0.8, mtof(penta(91, Math.floor(c.rnd() * 8))), 0.4, g * 0.25, c.rnd() * 2 - 1, 5, 0.3); });
}
function harp(c: Ctx, g: number, down: boolean) {
  return verb(2.4, 0.35, (o) => { for (let i = 0; i < 15; i++) { const n = down ? 14 - i : i; I.ks(o, c, i * 0.055, mtof(penta(55, n)), 1.6, g * 0.6, n / 7 - 1, 0.55, 2.2); } });
}
const CHORDS: Record<string, number[]> = { major: [0, 4, 7, 12], minor: [0, 3, 7, 12], sus2: [0, 2, 7, 12], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], dim: [0, 3, 6, 9], add9: [0, 4, 7, 14] };
function pianoChord(c: Ctx, g: number, chord: string) {
  return verb(3.2, 0.3, (o) => { I.piano(o, c, 0, mtof(48), 2.8, g * 0.7); (CHORDS[chord] || CHORDS.major).forEach((iv, k) => I.piano(o, c, k * 0.006, mtof(60 + iv), 2.8, g * 0.6, k / 2 - 0.75)); });
}
function sparkle(c: Ctx, g: number) {
  return verb(1.6, 0.4, (o) => { for (let i = 0; i < 9; i++) I.bell(o, c.rnd() * 0.9, mtof(penta(84, Math.floor(c.rnd() * 9))), 0.3, g * 0.5, c.rnd() * 2 - 1, 3.5, 0.25); });
}
function ding(g: number) { return verb(1.6, 0.25, (o) => I.bell(o, 0, 1760, 1.4, g, 0, 1, 0.6)); }

// textures
function roomTone(c: Ctx, len: number, g: number) {
  return dry(len, (o) => { const a = new SVF(350, 0.7), b = new SVF(330, 0.7); play(o, 0, len, g * 0.5, -0.5, (x) => a.run(c.noise()) * 0.6 + Math.sin(TAU * 60 * x) * 0.012 + Math.sin(TAU * 120 * x) * 0.008); play(o, 0, len, g * 0.5, 0.5, () => b.run(c.noise()) * 0.6); });
}
function lfoNoise(c: Ctx) { const ph = [c.rnd(), c.rnd(), c.rnd()], fr = [0.07 + c.rnd() * 0.05, 0.19 + c.rnd() * 0.1, 0.43 + c.rnd() * 0.2]; return (x: number) => (Math.sin(TAU * (fr[0] * x + ph[0])) + 0.6 * Math.sin(TAU * (fr[1] * x + ph[1])) + 0.3 * Math.sin(TAU * (fr[2] * x + ph[2]))) / 1.9; }
function wind(c: Ctx, len: number, g: number) {
  return dry(len, (o) => [-0.6, 0.6].forEach((pan) => { const fl = new SVF(500, 0.35), lf = lfoNoise(c), la = lfoNoise(c); play(o, 0, len, g, pan, (x) => { fl.tune(450 + 350 * lf(x)); fl.run(c.noise()); return fl.bp * (0.55 + 0.45 * la(x)) * att(x, 0.6) * Math.min(1, (len - x) / 0.6); }); }));
}
function rain(c: Ctx, len: number, g: number) {
  return dry(len, (o) => {
    const fl = new SVF(2500, 0.7); play(o, 0, len, g * 0.25, 0, (x) => fl.run(c.noise()) * att(x, 0.4) * Math.min(1, (len - x) / 0.4));
    for (let t = 0; t < len - 0.01; t += c.rnd() * 0.03) { const bp = new SVF(3000 + c.rnd() * 3000, 0.3), v = c.rnd(); play(o, t, 0.012, g * v * 0.4, c.rnd() * 2 - 1, (x) => { bp.run(c.noise()); return bp.bp * Math.exp(-x / 0.0025); }); }
  });
}
function drone(c: Ctx, len: number, g: number, mood: string) {
  const M = MUSIC_MOODS[mood] || MUSIC_MOODS.dark, key = 36 + ((M.root % 12) + 12) % 12;
  return verb(len, 0.5, (o) => {
    [[key, 1], [key + 7, 0.6], [key + 12, 0.5], ...(mood === 'tense' || mood === 'dark' || mood === 'aggressive' ? [[key + 25, 0.12]] : [[key + 16 + (M.scale[2] - 4), 0.2]])].forEach(([m, a], k) => {
      const ph = [c.rnd(), c.rnd()], fl = new SVF(400, 0.8), lf = lfoNoise(c);
      play(o, 0, len, g * a * 0.35, k % 2 ? 0.4 : -0.4, (x) => { ph[0] = wrap(ph[0] + mtof(m) * 0.997 / SR); ph[1] = wrap(ph[1] + mtof(m) * 1.003 / SR); fl.tune(300 + 500 * (0.5 + 0.5 * lf(x))); return fl.run(ph[0] + ph[1] - 1) * att(x, 1.5) * Math.min(1, (len - x) / 1.5); });
    });
  });
}
function cityHum(c: Ctx, len: number, g: number) {
  return dry(len, (o) => {
    const fl = new SVF(220, 0.7); play(o, 0, len, g * 0.6, 0, (x) => fl.run(c.noise()) + Math.sin(TAU * 50 * x) * 0.01);
    for (let t = c.rnd() * 2; t < len; t += 2 + c.rnd() * 4) {
      const d = 2 + c.rnd() * 2, f0 = 300 + c.rnd() * 400, dir = c.rnd() < 0.5 ? -1 : 1, bp = new SVF(f0, 0.5);
      play(o, t, Math.min(d, len - t), g * 0.5, 0, (x) => { const k = x / d; bp.tune(f0 * (1.15 - 0.3 * k)); return bp.run(c.noise()) * Math.sin(Math.PI * k) ** 2 * (0.5 + 0.5 * dir * (2 * k - 1)); });
    }
  });
}

// ---------------------------------------------------------------- registry
export interface SfxDef {
  key: string;
  label: string;
  category: 'Transitions' | 'UI' | 'Foley' | 'Impacts' | 'Tonal' | 'Stingers' | 'Music' | 'Texture';
  description: string;
  defaultDuration: number;
  /** true when the sound stretches to the clip length (risers, music); otherwise it is a one-shot */
  stretch: boolean;
  props: PropDef[];
  synth(c: Ctx, len: number, p: Props): Stereo | Float32Array;
}

const P = (key: string, label: string, def: number, min: number, max: number, step: number): PropDef =>
  ({ key, label, type: 'number', group: 'Sound', default: def, min, max, step });
const pitchProp = P('pitch', 'Pitch (semitones)', 0, -24, 24, 0.5);
const variationProp = P('variation', 'Variation seed', 0, 0, 999, 1);
const base = [pitchProp, variationProp];
const toneProp = P('tone', 'Tone (dark ↔ bright)', 0, -1, 1, 0.05);
const decayProp = P('decay', 'Decay (× length)', 1, 0.2, 4, 0.05);
const moodProp = (def: string): PropDef => ({ key: 'mood', label: 'Mood', type: 'select', group: 'Sound', default: def, options: Object.keys(MUSIC_MOODS) });

const sfx = (key: string, label: string, category: SfxDef['category'], description: string, defaultDuration: number, stretch: boolean,
  synth: SfxDef['synth'], props: PropDef[] = []): SfxDef => ({ key, label, category, description, defaultDuration, stretch, synth, props: [...base, ...props] });

export const SFX: Record<string, SfxDef> = Object.fromEntries([
  // transitions
  sfx('whoosh', 'Whoosh', 'Transitions', 'Airy sweep for scene changes and fast moves.', 0.9, true, (c, len, p) => whoosh(c, len, 0.9, Number(p.tone ?? 0)), [toneProp]),
  sfx('swish', 'Swish', 'Transitions', 'Short, light whoosh for small moves and pop-ins.', 0.45, true, (c, len) => swoosh(c, len, 0.9)),
  sfx('riser', 'Riser', 'Transitions', 'Tension build that ends on the clip end — line it up with a reveal.', 2, true, (c, len) => riser(c, len, 0.55)),
  sfx('downlifter', 'Downlifter', 'Transitions', 'Falling noise + tone after a hit — the opposite of a riser.', 1.6, true, (c, len, p) => downlifter(c, len, 0.6, tk(p)), [toneProp]),
  sfx('reverseSwell', 'Reverse swell', 'Transitions', 'Reversed-cymbal swell that cuts off exactly at the clip end.', 1.5, true, (c, len) => reverseSwell(c, len, 0.8)),
  sfx('sweepUp', 'Sweep up', 'Transitions', 'Wide filtered-noise sweep upward (no tone).', 1.2, true, (c, len, p) => sweepUp(c, len, 0.7, tk(p)), [toneProp]),
  sfx('whooshHit', 'Whoosh → hit', 'Transitions', 'Whoosh that lands on a punchy impact ~1.1 s before the clip end.', 1.8, true, (c, len, p) => whooshHit(c, len, 0.8, tk(p)), [toneProp]),
  sfx('warp', 'Warp', 'Transitions', 'Pitch-bending flanged synth swoop — sci-fi scene change.', 1.2, true, (c, len) => warp(c, len, 0.8)),
  sfx('tapeStop', 'Tape stop', 'Transitions', 'Chord that slows to a halt — comedic stop or hard cut to silence.', 1, true, (c, len) => tapeStop(c, len, 0.9)),
  sfx('vinylScratch', 'Vinyl scratch', 'Transitions', 'DJ back-and-forth scratch.', 0.5, true, (c, len) => vinylScratch(c, len, 0.8)),
  sfx('glitch', 'Glitch', 'Transitions', 'Digital stutter.', 0.4, true, (c, len) => glitch(c, len, 0.8)),
  sfx('zap', 'Zap', 'Transitions', 'Laser zap / electric snap.', 0.35, false, (c) => zap(c, 0.8)),
  sfx('airPuff', 'Air puff', 'Transitions', 'Soft breathy puff for tiny moves.', 0.2, false, (c) => airPuff(c, 0.8)),
  // ui
  sfx('click', 'Click', 'UI', 'Mouse click.', 0.05, false, (c) => click(c, 0.55)),
  sfx('key', 'Key tap', 'UI', 'Single keyboard tap.', 0.03, false, (c) => tick(c, 0, 0.3)),
  sfx('typing', 'Typing', 'UI', 'Run of keyboard taps that fills the clip length.', 1.5, true, (c, len) => {
    const out = stereo(len); let t = 0;
    while (t < len - 0.03) { addInto(out, t, tick(c, 0, 0.28 + c.rnd() * 0.12), 1, c.rnd() * 0.4 - 0.2); t += 0.045 + c.rnd() * 0.05; }
    return out;
  }),
  sfx('pop', 'Pop', 'UI', 'Bubbly pop for things appearing.', 0.18, false, () => pop(0.8)),
  sfx('bubble', 'Bubble', 'UI', 'Rising bubble blip — playful appear.', 0.15, false, () => dry(0.15, (o) => tone1(o, 0, 0.15, 0.6, 0, (x) => 300 + 1100 * (1 - Math.exp(-x / 0.03)), undefined, (x) => env(x, 0.002, 0.045)))),
  sfx('blip', 'Blip', 'UI', 'Short square blip (retro UI select).', 0.1, false, () => dry(0.1, (o) => tone1(o, 0, 0.1, 0.25, 0, () => 1320, sq, (x) => env(x, 0.001, 0.035)))),
  sfx('bloop', 'Bloop', 'UI', 'Falling sine bloop — dismiss / disappear.', 0.2, false, () => dry(0.2, (o) => tone1(o, 0, 0.2, 0.6, 0, (x) => 250 + 650 * Math.exp(-x / 0.05), undefined, (x) => env(x, 0.003, 0.07)))),
  sfx('toggle', 'Toggle', 'UI', 'Switch flip: two-part click.', 0.12, false, (c) => dry(0.12, (o) => { tone1(o, 0, 0.03, 0.4, 0, () => 1800, sq, (x) => Math.exp(-x / 0.005)); tone1(o, 0.045, 0.04, 0.35, 0, () => 1150, undefined, (x) => Math.exp(-x / 0.01)); I.tick(o, c, 0, 0.6); })),
  sfx('swipe', 'Swipe', 'UI', 'Quick left→right phone swipe.', 0.28, false, (c) => swipe(c, 0.7)),
  sfx('hover', 'Hover', 'UI', 'Very soft tonal hover tick.', 0.15, false, () => dry(0.15, (o) => { tone1(o, 0, 0.15, 0.22, 0, () => 1700, undefined, (x) => env(x, 0.01, 0.05)); tone1(o, 0, 0.15, 0.07, 0, () => 2550, undefined, (x) => env(x, 0.01, 0.04)); })),
  sfx('success', 'Success', 'UI', 'Bright rising arpeggio — task complete.', 1, false, () => verb(1, 0.25, (o) => [72, 76, 79, 84].forEach((m, k) => I.bell(o, k * 0.07, mtof(m), 0.6, 0.8, k / 2 - 0.75, 2, 0.35)))),
  sfx('error', 'Error', 'UI', 'Low two-tone buzz — wrong / denied.', 0.45, false, () => dry(0.45, (o) => [[0, 220], [0.17, 165]].forEach(([t, f]) => { const fl = new SVF(1200, 0.6); let ph = 0; play(o, t, 0.16, 0.5, 0, (x) => { ph = wrap(ph + f / SR); return fl.run(sq(ph)) * env(x, 0.004, 0.12); }); }))),
  sfx('coin', 'Coin', 'UI', 'Retro coin pickup.', 0.5, false, () => dry(0.5, (o) => { tone1(o, 0, 0.07, 0.2, 0, () => 988, sq, () => 1); tone1(o, 0.07, 0.4, 0.2, 0, () => 1319, sq, (x) => Math.exp(-x / 0.12)); })),
  sfx('levelUp', 'Level up', 'UI', 'Fast 8-bit arpeggio up — achievement.', 0.7, false, () => dry(0.7, (o) => [60, 64, 67, 72, 76, 79, 84].forEach((m, k) => I.chip(o, k * 0.055, mtof(m + 12), k === 6 ? 0.3 : 0.05, 1.4, 0, 0.5)))),
  sfx('notification', 'Notification', 'UI', 'Two-note ding.', 0.9, false, () => notification(1)),
  sfx('sendMessage', 'Message sent', 'UI', 'Upward swoop — chat message sent.', 0.3, false, (c) => dry(0.3, (o) => { tone1(o, 0, 0.18, 0.5, 0, (x) => 1100 - 600 * Math.exp(-x / 0.04), undefined, (x) => env(x, 0.004, 0.06)); const fl = new SVF(3000, 0.5); play(o, 0, 0.12, 0.25, 0.3, (x) => { fl.run(c.noise()); return fl.bp * Math.sin(Math.PI * x / 0.12); }); })),
  sfx('receiveMessage', 'Message received', 'UI', 'Soft two-note chat ping.', 0.6, false, () => verb(0.6, 0.2, (o) => { I.bell(o, 0, mtof(88), 0.3, 0.6, 0, 2, 0.15); I.bell(o, 0.1, mtof(83), 0.4, 0.6, 0, 2, 0.2); })),
  sfx('camera', 'Camera shutter', 'UI', 'Screenshot shutter.', 0.35, false, (c) => camera(c, 0.8)),
  sfx('shutterBurst', 'Shutter burst', 'UI', 'Rapid camera burst (paparazzi).', 0.75, false, (c) => { const st = stereo(0.75); for (let i = 0; i < 5; i++) addInto(st, i * 0.085, camera(c, 0.7), 1, (i % 2 ? 0.2 : -0.2)); return st; }),
  sfx('alert', 'Alert', 'UI', 'Two-tone warning.', 0.6, false, () => alert(1)),
  sfx('tick', 'Tick', 'UI', 'Tiny noise tick.', 0.03, false, (c) => tick(c, 0, 0.5)),
  sfx('tick2', 'Tonal tick', 'UI', 'Pitched tick.', 0.03, false, (c) => tick(c, 1568, 0.5)),
  // foley
  sfx('snap', 'Finger snap', 'Foley', 'Finger snap — hard cut, "just like that".', 0.12, false, (c) => snap(c, 0.8)),
  sfx('clap', 'Clap', 'Foley', 'Single hand clap.', 0.4, false, (c) => dry(0.4, (o) => I.clap(o, c, 0, 1))),
  sfx('keyboardClack', 'Mechanical keyboard', 'Foley', 'Thocky mechanical-keyboard typing that fills the clip (with space-bar hits).', 2, true, (c, len) => keyboardClack(c, len, 0.6)),
  sfx('mouseScroll', 'Scroll wheel', 'Foley', 'Mouse-wheel ratchet ticks that fill the clip.', 1, true, (c, len) => mouseScroll(c, len, 0.7)),
  sfx('trash', 'Trash / crumple', 'Foley', 'Paper crumple into a bin — delete.', 0.65, false, (c) => trash(c, 0.6)),
  sfx('slam', 'Slam', 'Foley', 'Door/laptop slam with rattle.', 0.9, false, (c) => slam(c, 0.8)),
  sfx('heartbeat', 'Heartbeat', 'Foley', 'Lub-dub — loop it for suspense.', 0.9, false, () => heartbeat(0.9)),
  // impacts
  sfx('thud', 'Thud', 'Impacts', 'Soft low impact.', 0.6, false, (c, _l, p) => thud(c, 0.8, Number(p.tone ?? 0), dk(p)), [toneProp, decayProp]),
  sfx('boom', 'Boom', 'Impacts', 'Big cinematic hit with tail.', 2.4, true, (c, len, p) => boom(c, 0.9, len, Number(p.tone ?? 0), dk(p)), [toneProp, decayProp]),
  sfx('impact', 'Impact', 'Impacts', 'Punchy trailer hit: sub + crack + metal ring.', 2, false, (c, _l, p) => impact(c, 0.9, tk(p), dk(p)), [toneProp, decayProp]),
  sfx('punch', 'Punch', 'Impacts', 'Tight body punch — fast hits, kinetic type slams.', 0.4, false, (c, _l, p) => punch(c, 0.9, tk(p)), [toneProp]),
  sfx('subDrop', 'Sub drop', 'Impacts', 'Deep falling sub — the floor drops out.', 2, true, (_c, len) => subDrop(len, 0.9)),
  sfx('braam', 'Braam', 'Impacts', 'Cinematic brass "BRAAM" — trailer moment.', 3, true, (c, len, p) => verb(len + 0.6, 0.35, (o) => I.braam(o, c, 0, 52 + Number(p.transpose ?? 0), len, 1)), [P('transpose', 'Transpose', 0, -12, 12, 1)]),
  sfx('taiko', 'Taiko', 'Impacts', 'Huge drum hit.', 1.6, false, (c) => verb(1.8, 0.3, (o) => I.taiko(o, c, 0, 1))),
  sfx('gong', 'Gong', 'Impacts', 'Long shimmering gong.', 5, false, (c, _l, p) => gong(c, 0.9, dk(p)), [decayProp]),
  sfx('metalClang', 'Metal clang', 'Impacts', 'Struck metal — industrial / lock clunk.', 1.6, false, (c, _l, p) => metalClang(c, 0.9, tk(p), dk(p)), [toneProp, decayProp]),
  sfx('glassTing', 'Glass ting', 'Impacts', 'Delicate glass ting — premium / precise.', 1.3, false, () => glassTing(0.9)),
  sfx('cymbal', 'Crash cymbal', 'Impacts', 'Crash cymbal — section starts and drops.', 2.8, false, (c) => dry(2.8, (o) => I.crash(o, c, 0, 1, 2.8))),
  sfx('drumroll', 'Drum roll', 'Impacts', 'Snare roll that builds over the clip and hits at the end.', 2.5, true, (c, len) => drumroll(c, len, 0.8)),
  // tonal
  sfx('chime', 'Chime', 'Tonal', 'Bell chime for success / reveals.', 1.4, false, () => chime(0.9)),
  sfx('ding', 'Ding', 'Tonal', 'Clean single bell ding.', 1.6, false, () => ding(0.8)),
  sfx('sparkle', 'Sparkle', 'Tonal', 'Scatter of tiny high bells — something shiny appears.', 1.6, false, (c) => sparkle(c, 0.8)),
  sfx('magic', 'Magic', 'Tonal', 'Rising bell glissando + glints — transformation moment.', 2, false, (c) => magic(c, 0.7)),
  sfx('harp', 'Harp gliss', 'Tonal', 'Plucked harp glissando (dreamy transition).', 2.4, false, (c, _l, p) => harp(c, 0.8, p.direction === 'down'), [{ key: 'direction', label: 'Direction', type: 'select', group: 'Sound', default: 'up', options: ['up', 'down'] }]),
  sfx('piano', 'Piano chord', 'Tonal', 'Single felt-piano chord hit.', 3.2, false, (c, _l, p) => pianoChord(c, 0.8, String(p.chord ?? 'major')), [{ key: 'chord', label: 'Chord', type: 'select', group: 'Sound', default: 'major', options: Object.keys(CHORDS) }]),
  sfx('shimmer', 'Shimmer', 'Tonal', 'Sparkly high texture.', 2.2, true, (_c, len) => shimmer(1, len)),
  sfx('beep', 'Beep', 'Tonal', 'Sine beep (countdowns).', 0.25, true, (_c, len, p) => beep(Number(p.freq) || 880, len, 0.4), [P('freq', 'Frequency', 880, 40, 8000, 1)]),
  // stingers
  sfx('stinger', 'Musical stinger', 'Stingers', 'Short musical sting in a mood/key — logo hits, reveals, punchlines. Match `mood`/`transpose` to the music bed.', 2.8, false, (c, _l, p) => stinger(c, p), [
    { key: 'kind', label: 'Kind', type: 'select', group: 'Sound', default: 'hit', options: ['rise', 'hit', 'success', 'magic', 'dark', 'playful', 'epic'] },
    moodProp('hopeful'), P('transpose', 'Transpose', 0, -12, 12, 1),
  ]),
  // textures
  sfx('roomTone', 'Room tone', 'Texture', 'Quiet room air + faint hum under talking heads.', 10, true, (c, len) => roomTone(c, len, 0.5)),
  sfx('vinylCrackle', 'Vinyl crackle', 'Texture', 'Hiss and pops (lo-fi bed).', 10, true, (c, len) => dry(len, (o) => I.crackle(o, c, 0, len, 1))),
  sfx('wind', 'Wind', 'Texture', 'Gusting wind, stereo.', 10, true, (c, len) => wind(c, len, 0.6)),
  sfx('rain', 'Rain', 'Texture', 'Rain bed with droplets.', 10, true, (c, len) => rain(c, len, 0.6)),
  sfx('cityHum', 'City hum', 'Texture', 'Distant traffic and low city rumble with passing cars.', 10, true, (c, len) => cityHum(c, len, 0.6)),
  sfx('crowdCheer', 'Crowd cheer', 'Texture', 'Cheering crowd with claps and whistles that swells in.', 4, true, (c, len) => crowdCheer(c, len, 0.6)),
  sfx('drone', 'Drone', 'Texture', 'Evolving tension/ambient drone in a mood.', 10, true, (c, len, p) => drone(c, len, 0.7, String(p.mood ?? 'dark')), [moodProp('dark')]),
  // music
  sfx('music', 'Music bed', 'Music',
    'Procedural multi-genre music that fills the clip. `style` sets the genre/instruments (auto = picked from the mood by `variation`); `mood` sets key, scale and progressions; ' +
    '`drop` puts a build + impact exactly at that clip-local second; `energy` thins or thickens the arrangement; `variation` re-rolls melody, progression and fills.', 30, true,
    (c, len, p) => (resolveStyle(p) === 'classic' ? classicMusic(c, len, p) : musicGen(c, len, p)), [
      { key: 'style', label: 'Style', type: 'select', group: 'Sound', default: 'auto', options: ['auto', ...Object.keys(MUSIC_STYLES), 'classic'] },
      moodProp('hopeful'),
      P('bpm', 'Tempo (0 = style default)', 0, 0, 220, 1), P('transpose', 'Transpose', 0, -12, 12, 1), P('energy', 'Energy', 0.7, 0, 1, 0.05),
      P('intro', 'Intro (no drums) seconds', 4, 0, 120, 0.5), P('drop', 'Drop at (s, 0 = none)', 0, 0, 600, 0.05), P('outro', 'Outro seconds (0 = auto)', 0, 0, 120, 0.5),
      P('swing', 'Swing (-1 = style default)', -1, -1, 1, 0.05), P('progression', 'Progression (0 = random)', 0, 0, 5, 1),
      { key: 'drums', label: 'Drums', type: 'bool', group: 'Sound', default: true }, { key: 'bass', label: 'Bass', type: 'bool', group: 'Sound', default: true },
      { key: 'pad', label: 'Pad', type: 'bool', group: 'Sound', default: true }, { key: 'arp', label: 'Arpeggio', type: 'bool', group: 'Sound', default: true },
      { key: 'melody', label: 'Melody', type: 'bool', group: 'Sound', default: true },
    ]),
].map((d) => [d.key, d]));

function resample(st: Stereo, rate: number): Stereo {
  if (rate === 1) return st;
  const n = Math.max(1, Math.floor(st[0].length / rate));
  return st.map((ch) => {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * rate, j = Math.floor(x), k = x - j; o[i] = (ch[j] ?? 0) * (1 - k) + (ch[j + 1] ?? 0) * k; }
    return o;
  }) as Stereo;
}

/** Render a preset. `seed` should be stable per clip so a sound never changes between preview and export. */
export function synthesize(key: string, params: Props, duration: number, seed: number): Stereo {
  const def = SFX[key];
  if (!def) return stereo(duration);
  const r = rng(seed + Number(params.variation ?? 0) * 7919);
  const c: Ctx = { rnd: r, noise: () => r() * 2 - 1 };
  const rate = Math.pow(2, Number(params.pitch ?? 0) / 12);
  const len = def.stretch ? duration * rate : def.defaultDuration;
  const out = def.synth(c, Math.max(0.01, len), params);
  const st = resample(out instanceof Float32Array ? panned(out) : out, rate);
  // safety limiter: layered presets must never clip
  let pk = 0; for (const ch of st) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > pk) pk = a; }
  if (pk > 0.98) for (const ch of st) for (let i = 0; i < ch.length; i++) ch[i] *= 0.98 / pk;
  return st;
}

export function encodeWav(st: Stereo, sr = SR): Uint8Array {
  const n = st[0].length, b = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); b.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); b.setUint32(16, 16, true);
  b.setUint16(20, 1, true); b.setUint16(22, 2, true); b.setUint32(24, sr, true); b.setUint32(28, sr * 4, true); b.setUint16(32, 4, true); b.setUint16(34, 16, true);
  w(36, 'data'); b.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) b.setInt16(44 + i * 4 + c * 2, Math.round(clamp(st[c][i], -1, 1) * 32767), true);
  return new Uint8Array(b.buffer);
}
