// Second sound library: transitions, UI, cartoon, sci-fi, impacts, nature, human/foley and musical one-shots.
// Same contract as synth.ts presets — pure functions of (Ctx, length, props), seeded via Ctx — and every preset is
// peak-normalized to its own level so the library sits at a consistent loudness.
import type { PropDef } from '../schema/props.ts';
import type { Props } from '../schema/types.ts';
import { att, type Ctx, env, mtof, out, type Out, play, reverbWet, SR, type Stereo, stereo, SVF, TAU } from './dsp.ts';
import * as I from './instruments.ts';
import type { SfxDef } from './synth.ts';

// ---------------------------------------------------------------- helpers
const wrap = (x: number) => x - Math.floor(x);
const sine = (ph: number) => Math.sin(TAU * ph), saw = (ph: number) => 2 * ph - 1, sqr = (ph: number) => (ph < 0.5 ? 1 : -1), tri = (ph: number) => 1 - 4 * Math.abs(ph - 0.5);
const PENTA = [0, 2, 4, 7, 9], MAJOR = [0, 2, 4, 5, 7, 9, 11];
const scaleNote = (sc: number[], base: number, i: number) => base + sc[((i % sc.length) + sc.length) % sc.length] + 12 * Math.floor(i / sc.length);
/** edge fades: attack a, release r before len */
const fe = (x: number, len: number, a = 0.004, r = 0.02) => att(x, a) * Math.max(0, Math.min(1, (len - x) / r));

function verb(len: number, wet: number, fn: (o: Out) => void): Stereo {
  const m = stereo(len), s = stereo(len); fn(out(m, s, wet));
  const w = reverbWet(s); for (let c = 0; c < 2; c++) for (let i = 0; i < m[c].length; i++) m[c][i] += w[c][i];
  return m;
}
const dry = (len: number, fn: (o: Out) => void): Stereo => { const m = stereo(len); fn(out(m)); return m; };
/** oscillator voice with a frequency function */
function osc(o: Out, t: number, len: number, g: number, pan: number, f: (x: number) => number, shape = sine, e: (x: number) => number = (x) => env(x, 0.003, len / 3)) {
  let ph = 0; play(o, t, len, g, pan, (x) => { ph = wrap(ph + f(x) / SR); return shape(ph) * e(x); });
}
/** filtered noise voice with a cutoff function */
function nz(o: Out, c: Ctx, t: number, len: number, g: number, pan: number, f: (x: number) => number, q: number, e: (x: number) => number, mode: 'bp' | 'lp' | 'hp' = 'bp') {
  const fl = new SVF(f(0), q);
  play(o, t, len, g, pan, (x) => { fl.tune(f(x)); fl.run(c.noise()); return (mode === 'bp' ? fl.bp : mode === 'lp' ? fl.lp : fl.hp) * e(x); });
}
/** formant voice: saw (or noise) through three vowel band-passes */
type Vowel = [number, number, number];
const VOWELS: Record<string, Vowel> = { a: [760, 1250, 2700], o: [460, 820, 2700], u: [340, 700, 2400], e: [560, 1750, 2600], ay: [650, 1900, 2700] };
function voice(o: Out, c: Ctx, t: number, len: number, g: number, pan: number, f: (x: number) => number, vowel: Vowel, e: (x: number) => number, breath = 0.15) {
  let ph = c.rnd(); const fs = vowel.map((F, k) => new SVF(F, k === 0 ? 0.2 : 0.14)), amp = [1, 0.6, 0.25];
  play(o, t, len, g, pan, (x) => {
    ph = wrap(ph + f(x) / SR); const src = saw(ph) * (1 - breath) + c.noise() * breath;
    let s = 0; for (let k = 0; k < 3; k++) { fs[k].run(src); s += fs[k].bp * amp[k]; }
    return s * e(x);
  });
}
/** marimba / kalimba bar: fundamental + inharmonic overtone */
function bar(o: Out, t: number, f: number, g: number, pan: number, dec = 0.35, ratio = 3.93, oAmt = 0.35) {
  play(o, t, dec * 4, g, pan, (x) => (Math.sin(TAU * f * x) * Math.exp(-x / dec) + oAmt * Math.sin(TAU * f * ratio * x) * Math.exp(-x / (dec * 0.12))) * att(x, 0.001));
}
/** short percussive click/knock */
function knockHit(o: Out, c: Ctx, t: number, f: number, g: number, pan = 0, dec = 0.035) {
  const fl = new SVF(f * 3, 0.5);
  play(o, t, dec * 5, g, pan, (x) => { fl.run(c.noise()); return Math.sin(TAU * f * x) * Math.exp(-x / dec) + 0.4 * Math.sin(TAU * f * 1.62 * x) * Math.exp(-x / (dec * 0.5)) + fl.bp * Math.exp(-x / 0.004) * 0.8; });
}
function lightClap(o: Out, c: Ctx, t: number, g: number, pan: number, f = 1500) {
  const fl = new SVF(f, 0.5);
  play(o, t, 0.12, g, pan, (x) => { fl.run(c.noise()); return fl.bp * (x < 0.02 ? Math.exp(-((x % 0.007)) / 0.002) : Math.exp(-(x - 0.014) / 0.025)); });
}
function lfo(c: Ctx) { const ph = [c.rnd(), c.rnd(), c.rnd()], fr = [0.11 + c.rnd() * 0.07, 0.29 + c.rnd() * 0.1, 0.71 + c.rnd() * 0.3]; return (x: number) => (Math.sin(TAU * (fr[0] * x + ph[0])) + 0.6 * Math.sin(TAU * (fr[1] * x + ph[1])) + 0.3 * Math.sin(TAU * (fr[2] * x + ph[2]))) / 1.9; }
/** per-sample stereo writer (for things that move across the field) */
function raw(len: number, gen: (x: number) => [number, number]): Stereo {
  const st = stereo(len);
  for (let i = 0; i < st[0].length; i++) { const [l, r] = gen(i / SR); st[0][i] = l; st[1][i] = r; }
  return st;
}
const panLR = (v: number, p: number): [number, number] => [v * Math.cos((p + 1) * Math.PI / 4), v * Math.sin((p + 1) * Math.PI / 4)];
const tk = (p: Props, s = 1) => Math.pow(2, Number(p.tone ?? 0) * s);
const dk = (p: Props) => Math.max(0.1, Number(p.decay ?? 1));
const num = (p: Props, k: string, d: number) => (Number.isFinite(Number(p[k])) ? Number(p[k]) : d);
const CHORDS: Record<string, number[]> = { major: [0, 4, 7, 12], minor: [0, 3, 7, 12], power: [0, 7, 12, 19], sus2: [0, 2, 7, 12], sus4: [0, 5, 7, 12], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], dim: [0, 3, 6, 9], add9: [0, 4, 7, 14] };
const chordOf = (p: Props) => CHORDS[String(p.chord ?? 'major')] ?? CHORDS.major;

// ---------------------------------------------------------------- transitions
function sweep(o: Out, c: Ctx, t: number, len: number, g: number, pan: number, f0: number, f1: number, q = 0.45, shape = (k: number) => Math.sin(Math.PI * k) ** 2) {
  nz(o, c, t, len, g, pan, (x) => f0 * Math.pow(f1 / f0, Math.min(1, x / len)), q, (x) => shape(Math.min(1, x / len)));
}
function riser2(c: Ctx, len: number, p: Props) {
  const T = tk(p, 0.5), I0 = num(p, 'intensity', 1);
  return verb(len, 0.3, (o) => {
    [-0.5, 0.5].forEach((pan) => sweep(o, c, 0, len, 0.7, pan, 250 * T, 7000 * T, 0.4, (k) => Math.pow(k, 2.2) * fe(k * len, len, 0.01, 0.01)));
    let ph = 0, ph2 = c.rnd();
    play(o, 0, len, 0.22 * I0, 0, (x) => {
      const k = x / len, f = 110 * T * Math.pow(4, k * k);
      ph = wrap(ph + f / SR); ph2 = wrap(ph2 + f * 1.007 / SR);
      return (saw(ph) + saw(ph2)) * 0.5 * Math.pow(k, 1.8) * (0.75 + 0.25 * Math.sin(TAU * (3 + 20 * k * k) * x)) * fe(x, len, 0.01, 0.01);
    });
  });
}
function rewind(c: Ctx, len: number, hi: number) {
  return dry(len, (o) => {
    nz(o, c, 0, len, 0.35, 0, () => 3500, 0.6, (x) => fe(x, len, 0.03, 0.05), 'bp');
    for (let v = 0; v < 3; v++) {
      let f = 900 * hi, tgt = f, hold = 0;
      osc(o, 0, len, 0.22, v - 1, (x) => { if (hold-- <= 0) { hold = Math.floor(SR * (0.012 + c.rnd() * 0.03)); tgt = (600 + c.rnd() * 2600) * hi * (1 + 0.6 * x / len); } f += (tgt - f) * 0.004; return f; }, tri, (x) => fe(x, len, 0.02, 0.05) * (0.5 + 0.5 * Math.sin(TAU * 31 * x + v)));
    }
  });
}
function scratchStop(c: Ctx) {
  const len = 0.75;
  return dry(len, (o) => {
    let pos = 0; const fl = new SVF(1800, 0.6);
    play(o, 0, len, 0.8, 0, (x) => {
      const rate = x < 0.3 ? Math.sin(TAU * 7 * x) * 3 : 1.6 * Math.max(0, 1 - (x - 0.3) / 0.42) ** 2;
      pos += rate / SR; fl.tune(400 + 2500 * Math.min(1, Math.abs(rate)));
      return fl.run(saw(wrap(pos * 220)) * 0.6 + saw(wrap(pos * 277)) * 0.4 + c.noise() * 0.15 * Math.abs(rate)) * Math.min(1, Math.abs(rate) * 2) * fe(x, len, 0.005, 0.03);
    });
  });
}
function filterSweep(c: Ctx, len: number, p: Props) {
  const down = p.direction === 'down', T = tk(p, 0.5);
  return dry(len, (o) => {
    const fl = new SVF(200, 0.25), ph = [0, c.rnd(), c.rnd()];
    play(o, 0, len, 0.5, 0, (x) => {
      const k = down ? 1 - x / len : x / len; fl.tune(150 * Math.pow(55, k));
      const fs = [55, 110 * 1.003, 110 * 0.997].map((f) => f * T);
      let s = 0; for (let i = 0; i < 3; i++) { ph[i] = wrap(ph[i] + fs[i] / SR); s += saw(ph[i]); }
      return fl.run(s / 3 + c.noise() * 0.2) * fe(x, len, 0.05, 0.08);
    });
  });
}
function flyBy(c: Ctx, len: number, p: Props) {
  const sp = num(p, 'speed', 1), T = tk(p, 0.5), fl = new SVF(1200, 0.5), lp = new SVF(900, 0.7); let ph = 0;
  return raw(len, (x) => {
    const d = (x - len / 2) / (len * 0.14 / sp), a = 1 / (1 + d * d), f = 140 * T * (1 - 0.28 * Math.tanh(d * 0.8));
    ph = wrap(ph + f / SR); fl.tune(900 + 3000 * a);
    const v = (lp.run(saw(ph)) * 0.5 + fl.run(c.noise()) * 0.6) * a * fe(x, len, 0.05, 0.05);
    return panLR(v, Math.tanh(d * 0.6));
  });
}
function spinWhoosh(c: Ctx, len: number) {
  const fl = new SVF(800, 0.4); let ph = 0;
  return raw(len, (x) => {
    const k = x / len; fl.tune(400 + 3800 * Math.sin(Math.PI * k)); ph += (3 + 16 * k) / SR;
    fl.run(c.noise()); const e = Math.sin(Math.PI * k) ** 2;
    return panLR(fl.bp * e * (0.6 + 0.4 * Math.sin(TAU * ph)), Math.sin(TAU * ph) * 0.8);
  });
}
function portal(c: Ctx, len: number, p: Props) {
  const T = tk(p, 0.5);
  return verb(len, 0.55, (o) => {
    for (let v = 0; v < 4; v++) {
      const f0 = 110 * T * [1, 1.5, 2, 2.997][v], fl = new SVF(400, 0.15), l = lfo(c); let ph = c.rnd();
      play(o, 0, len, 0.18, v / 1.5 - 1, (x) => { ph = wrap(ph + f0 * (1 + 0.01 * Math.sin(TAU * 0.7 * x + v)) / SR); fl.tune(500 + 2500 * (0.5 + 0.5 * l(x * 4))); return fl.run(saw(ph)) * att(x, 0.4) * Math.min(1, (len - x) / 0.4); });
    }
    sweep(o, c, 0, len, 0.4, 0, 3000, 300, 0.3, (k) => Math.sin(Math.PI * k));
  });
}

// ---------------------------------------------------------------- UI
function tap(o: Out, c: Ctx, t: number, g: number, f = 900, pan = 0) {
  nz(o, c, t, 0.02, g * 0.5, pan, () => 2600, 0.5, (x) => Math.exp(-x / 0.003));
  osc(o, t, 0.05, g * 0.5, pan, () => f, sine, (x) => Math.exp(-x / 0.012));
}
function key(o: Out, c: Ctx, t: number, g: number, body = 220, thock = 900, dec = 0.015) {
  nz(o, c, t, 0.06, g * 0.8, 0, () => thock, 0.7, (x) => Math.exp(-x / dec), 'lp');
  osc(o, t, 0.05, g * 0.35, 0, () => body, sine, (x) => Math.exp(-x / (dec * 0.7)));
  nz(o, c, t, 0.01, g * 0.4, 0.1, () => 4200, 0.4, (x) => Math.exp(-x / 0.0018));
}
function cashRegister(c: Ctx) {
  return verb(1.3, 0.2, (o) => {
    nz(o, c, 0, 0.08, 0.8, 0, () => 600, 0.6, (x) => Math.exp(-x / 0.018), 'lp');
    osc(o, 0, 0.1, 0.4, 0, (x) => 150 - 40 * x, sine, (x) => Math.exp(-x / 0.03));
    nz(o, c, 0.06, 0.2, 0.25, 0.2, (x) => 2000 + 3000 * x, 0.5, (x) => Math.sin(Math.PI * x / 0.2));
    I.bell(o, 0.27, 2637, 0.9, 0.9, 0, 2.4, 0.5); I.bell(o, 0.27, 3520, 0.9, 0.6, 0.2, 2.4, 0.45);
  });
}
const twoTone = (fs: number[], gap: number, len: number, shape = sine, g = 0.5) => (c: Ctx) => dry(len, (o) => {
  fs.forEach((f, i) => osc(o, i * gap, gap * 1.2, g, 0, () => f, shape, (x) => env(x, 0.004, gap * 0.45)));
  nz(o, c, 0, 0.01, 0.2, 0, () => 3000, 0.5, (x) => Math.exp(-x / 0.002));
});

// ---------------------------------------------------------------- cartoon / sci-fi
function boing(_c: Ctx, _l: number, p: Props) {
  const T = tk(p, 0.6);
  return dry(0.9, (o) => osc(o, 0, 0.9, 0.7, 0, (x) => 160 * T * (1 + 0.45 * Math.exp(-x / 0.28) * Math.sin(TAU * 17 * x)), (ph) => sine(ph) + 0.3 * sine(2 * ph), (x) => env(x, 0.003, 0.32 * dk(p))));
}
function slideWhistle(len: number, up: boolean, p: Props) {
  const T = tk(p, 0.5);
  return dry(len, (o) => osc(o, 0, len, 0.6, 0, (x) => { const k = x / len; return (up ? 500 * Math.pow(4, k) : 2000 * Math.pow(0.25, k)) * T * (1 + 0.012 * Math.sin(TAU * 6 * x)); }, (ph) => sine(ph) + 0.08 * sine(2 * ph), (x) => fe(x, len, 0.03, 0.06)));
}
function laser(o: Out, t: number, g: number, f0: number, pan = 0) {
  osc(o, t, 0.22, g, pan, (x) => 180 + f0 * Math.exp(-x / 0.045), sqr, (x) => env(x, 0.001, 0.07));
  osc(o, t, 0.22, g * 0.5, -pan, (x) => (180 + f0 * Math.exp(-x / 0.045)) * 1.5, saw, (x) => env(x, 0.001, 0.05));
}
function energyCharge(c: Ctx, len: number) {
  return verb(len, 0.3, (o) => {
    const rel0 = Math.max(0.1, len - 0.35);
    osc(o, 0, rel0, 0.3, 0, (x) => 200 * Math.pow(10, (x / rel0) ** 1.5), saw, (x) => (x / rel0) ** 1.4 * (0.7 + 0.3 * Math.sin(TAU * (4 + 30 * (x / rel0) ** 2) * x)));
    sweep(o, c, 0, rel0, 0.4, 0, 300, 7000, 0.4, (k) => k * k);
    nz(o, c, rel0, 0.35, 0.9, 0, (x) => 3000 * Math.exp(-x / 0.08) + 200, 0.5, (x) => Math.exp(-x / 0.09), 'lp');
    osc(o, rel0, 0.35, 0.7, 0, (x) => 80 + 800 * Math.exp(-x / 0.05), sine, (x) => Math.exp(-x / 0.12));
  });
}

// ---------------------------------------------------------------- impacts
function crash(c: Ctx, _l: number, p: Props) {
  const glass = p.material !== 'metal';
  return verb(2, 0.25, (o) => {
    for (let i = 0; i < 34; i++) {
      const t = Math.pow(c.rnd(), 2) * (glass ? 0.6 : 0.35), f = glass ? 2200 + c.rnd() * 5500 : 400 + c.rnd() * 3200, d = glass ? 0.04 + c.rnd() * 0.25 : 0.15 + c.rnd() * 0.7;
      play(o, t, d * 4, 0.12 * (1 - t), c.rnd() * 1.6 - 0.8, (x) => Math.sin(TAU * f * x) * Math.exp(-x / d) * att(x, 0.0005));
    }
    nz(o, c, 0, 0.6, 0.8, 0, () => (glass ? 6000 : 3500), 0.5, (x) => Math.exp(-x / 0.08), 'hp');
    osc(o, 0, 0.4, 0.4, 0, (x) => 90 + 60 * Math.exp(-x / 0.03), sine, (x) => Math.exp(-x / 0.1));
  });
}
function explosion(c: Ctx, _l: number, p: Props) {
  const D = dk(p), len = 3.5 * D, T = tk(p, 0.5);
  return verb(len, 0.3, (o) => {
    let ph = 0; const lp = new SVF(500, 0.6);
    play(o, 0, len, 1, 0, (x) => { ph = wrap(ph + (30 + 70 * Math.exp(-x / 0.12)) * T / SR); lp.tune(300 * T + 2500 * Math.exp(-x / 0.15)); return Math.tanh((Math.sin(TAU * ph) * Math.exp(-x / (0.9 * D)) + lp.run(c.noise()) * 1.6 * Math.exp(-x / (1.1 * D))) * 1.8) * att(x, 0.002); });
    for (let t = 0.15; t < len * 0.75; t += 0.02 + c.rnd() * 0.12) nz(o, c, t, 0.03, 0.25 * (1 - t / len), c.rnd() * 1.6 - 0.8, () => 1500 + c.rnd() * 3000, 0.5, (x) => Math.exp(-x / 0.006));
  });
}

// ---------------------------------------------------------------- nature / human
function ocean(c: Ctx, len: number) {
  return dry(len, (o) => [-0.5, 0.5].forEach((pan, k) => {
    const per = 6.5 + c.rnd() * 2, off = c.rnd() * per, fl = new SVF(500, 0.6), hp = new SVF(3000, 0.5);
    play(o, 0, len, 0.6, pan, (x) => {
      const ph = wrap((x + off + k * 1.3) / per), sw = Math.pow(Math.sin(Math.PI * ph), 2.5), n = c.noise();
      fl.tune(300 + 900 * sw); fl.run(n); hp.run(n);
      return (fl.lp * (0.35 + 0.65 * sw) + hp.hp * 0.25 * Math.pow(sw, 6)) * fe(x, len, 1, 1);
    });
  }));
}
function birds(c: Ctx, len: number) {
  return verb(len, 0.3, (o) => {
    for (let t = c.rnd() * 0.3; t < len - 0.3; t += 0.15 + c.rnd() * 0.7) {
      const f0 = 2600 + c.rnd() * 2200, n = 1 + Math.floor(c.rnd() * 4), d = 0.05 + c.rnd() * 0.09, up = c.rnd() < 0.5, tr = c.rnd() < 0.3, pan = c.rnd() * 1.6 - 0.8;
      for (let i = 0; i < n; i++) osc(o, t + i * d * 1.3, d, 0.35, pan, (x) => f0 * (up ? 1 + 0.35 * x / d : 1.35 - 0.35 * x / d) * (tr ? 1 + 0.06 * Math.sin(TAU * 40 * x) : 1), sine, (x) => Math.sin(Math.PI * x / d));
    }
  });
}
function fire(c: Ctx, len: number) {
  return dry(len, (o) => {
    const l = lfo(c);
    nz(o, c, 0, len, 0.4, 0, () => 700, 0.6, (x) => (0.6 + 0.4 * l(x)) * fe(x, len, 0.5, 0.5), 'lp');
    for (let t = 0; t < len - 0.02; t += c.rnd() * 0.06) { const big = c.rnd() < 0.08; nz(o, c, t, 0.02, (big ? 0.9 : 0.3) * (0.4 + c.rnd() * 0.6), c.rnd() * 1.2 - 0.6, () => (big ? 1200 : 2500 + c.rnd() * 3000), 0.5, (x) => Math.exp(-x / (big ? 0.006 : 0.002))); }
  });
}
function footsteps(c: Ctx, len: number, p: Props) {
  const rate = num(p, 'speed', 2);
  return dry(len, (o) => {
    let side = 1;
    for (let t = 0.05; t < len - 0.1; t += (1 / rate) * (0.92 + c.rnd() * 0.16)) {
      const v = 0.75 + c.rnd() * 0.25;
      nz(o, c, t, 0.12, 0.9 * v, side * 0.15, () => 400, 0.6, (x) => Math.exp(-x / 0.025), 'lp');
      osc(o, t, 0.1, 0.4 * v, side * 0.15, (x) => 85 - 30 * x, sine, (x) => Math.exp(-x / 0.03));
      nz(o, c, t + 0.04, 0.1, 0.12 * v, side * 0.15, () => 2200, 0.4, (x) => Math.sin(Math.PI * x / 0.1));
      side = -side;
    }
  });
}
function applause(c: Ctx, len: number, p: Props, people: number, rate: number, swell: boolean) {
  const n = Math.round(people * num(p, 'intensity', 1));
  return verb(len, 0.2, (o) => {
    for (let k = 0; k < n; k++) {
      const pan = c.rnd() * 1.8 - 0.9, f = 1100 + c.rnd() * 1200, r = rate * (0.8 + c.rnd() * 0.4);
      for (let t = c.rnd() / r; t < len - 0.05; t += (1 / r) * (0.85 + c.rnd() * 0.3)) {
        const e = swell ? Math.min(1, t / 0.5) * Math.min(1, (len - t) / 1) : 1;
        lightClap(o, c, t, 0.35 * e * (0.6 + c.rnd() * 0.4), pan, f);
      }
    }
  });
}
function crowdVowel(c: Ctx, len: number, voices: number, vowel: Vowel, f: (x: number, b: number) => number, e: (x: number) => number, wet = 0.3) {
  return verb(len, wet, (o) => {
    for (let v = 0; v < voices; v++) {
      const b = 140 + c.rnd() * 220, d = c.rnd() * 0.08, jit = vowel.map((F) => F * (0.9 + c.rnd() * 0.2)) as Vowel;
      voice(o, c, d, len - d, 0.22, c.rnd() * 1.6 - 0.8, (x) => f(x, b), jit, (x) => e(x + d), 0.3);
    }
  });
}
function laughs(c: Ctx, len: number) {
  return verb(len, 0.25, (o) => {
    for (let v = 0; v < 7; v++) {
      const b = 150 + c.rnd() * 180, pan = c.rnd() * 1.6 - 0.8, jit = VOWELS.a.map((F) => F * (0.9 + c.rnd() * 0.2)) as Vowel;
      for (let t = c.rnd() * 0.6; t < len - 0.5; t += 1 + c.rnd() * 1.4) {
        const n = 4 + Math.floor(c.rnd() * 5), rate = 4.5 + c.rnd() * 2;
        for (let i = 0; i < n; i++) { const at = t + i / rate, f0 = b * (1.25 - i * 0.05); if (at < len - 0.2) voice(o, c, at, 0.17, 0.25 * (1 - i / (n + 2)), pan, () => f0, jit, (x) => Math.sin(Math.PI * Math.min(1, x / 0.15)) ** 0.7, 0.45); }
      }
    }
  });
}
function creak(o: Out, c: Ctx, t: number, len: number, g: number) {
  const fl = new SVF(900, 0.15); let hold = 0, f = 140;
  play(o, t, len, g, 0.2, (x) => { if (hold-- <= 0) { hold = Math.floor(SR / (f * (0.85 + c.rnd() * 0.3))); f = 110 + 160 * Math.sin(Math.PI * x / len) + c.rnd() * 20; return fl.run(1) * Math.sin(Math.PI * x / len); } return fl.run(0) * Math.sin(Math.PI * x / len); });
}

// ---------------------------------------------------------------- musical
function stab(c: Ctx, p: Props, len: number, inst: 'saw' | 'brass') {
  const root = 48 + num(p, 'transpose', 0), ch = chordOf(p);
  return verb(len, 0.35, (o) => ch.forEach((iv, k) => {
    const f = mtof(root + 12 + iv);
    if (inst === 'brass') I.brass(o, c, 0, f, 0.32, 1, k / 2 - 0.75);
    else { I.supersaw(o, c, 0, f, 0.22, 1, k / 2 - 0.75, 0.003, 0.35, 2800, 5, 0.14, 1.2, 0.12); I.piano(o, c, 0.002, f, 0.6, 0.5, k / 2 - 0.75, 0.7); }
  }));
}

// ---------------------------------------------------------------- registry
const P = (key: string, label: string, def: number, min: number, max: number, step: number): PropDef => ({ key, label, type: 'number', group: 'Sound', default: def, min, max, step });
const sel = (key: string, label: string, def: string, options: string[]): PropDef => ({ key, label, type: 'select', group: 'Sound', default: def, options });
const toneProp = P('tone', 'Tone (dark ↔ bright)', 0, -1, 1, 0.05);
const decayProp = P('decay', 'Decay (× length)', 1, 0.2, 4, 0.05);
const intensityProp = P('intensity', 'Intensity', 1, 0.2, 3, 0.05);
const speedProp = (def: number, label = 'Speed') => P('speed', label, def, 0.2, 8, 0.05);
const transposeProp = P('transpose', 'Transpose', 0, -12, 12, 1);
const chordProp = sel('chord', 'Chord', 'major', Object.keys(CHORDS));
const base = [P('pitch', 'Pitch (semitones)', 0, -24, 24, 0.5), P('variation', 'Variation seed', 0, 0, 999, 1)];

function N(st: Stereo, lvl: number): Stereo {
  let pk = 0; for (const ch of st) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > pk) pk = a; }
  if (pk > 1e-6) { const k = lvl / pk; for (const ch of st) for (let i = 0; i < ch.length; i++) ch[i] *= k; }
  return st;
}
const d = (key: string, label: string, category: SfxDef['category'], description: string, defaultDuration: number, stretch: boolean, level: number,
  fn: (c: Ctx, len: number, p: Props) => Stereo, props: PropDef[] = []): SfxDef =>
  ({ key, label, category, description, defaultDuration, stretch, props: [...base, ...props], synth: (c, len, p) => N(fn(c, len, p), level) });

export const MORE_SFX: SfxDef[] = [
  // transitions
  d('whooshDeep', 'Whoosh (deep)', 'Transitions', 'Heavy low whoosh with a sub rumble — big scene changes.', 1.2, true, 0.8, (c, len, p) => dry(len, (o) => {
    [-0.5, 0.5].forEach((pan) => sweep(o, c, 0, len, 0.7, pan, 110 * tk(p), 1100 * tk(p), 0.5));
    osc(o, 0, len, 0.35, 0, (x) => 40 + 30 * x / len, sine, (x) => Math.sin(Math.PI * x / len) ** 2);
  }), [toneProp]),
  d('whooshBright', 'Whoosh (bright)', 'Transitions', 'Airy, crisp high whoosh — light moves and wipes.', 0.7, true, 0.65, (c, len, p) => dry(len, (o) => [-0.4, 0.4].forEach((pan) => sweep(o, c, 0, len, 0.6, pan, 900 * tk(p), 7800 * tk(p), 0.4))), [toneProp]),
  d('whooshDouble', 'Whoosh (double)', 'Transitions', 'Two quick whooshes back to back — a there-and-back move.', 1, true, 0.7, (c, len, p) => dry(len, (o) => {
    sweep(o, c, 0, len * 0.5, 0.7, -0.5, 300 * tk(p), 3500 * tk(p)); sweep(o, c, len * 0.42, len * 0.58, 0.7, 0.5, 400 * tk(p), 4500 * tk(p));
  }), [toneProp]),
  d('swooshReverse', 'Reverse swoosh', 'Transitions', 'Swoosh that swells and cuts off at the clip end — lands on the cut.', 0.8, true, 0.7, (c, len, p) => dry(len, (o) =>
    [-0.4, 0.4].forEach((pan) => sweep(o, c, 0, len, 0.7, pan, 300 * tk(p), 5000 * tk(p), 0.45, (k) => Math.pow(k, 3) * Math.min(1, (1 - k) * len / 0.012)))), [toneProp]),
  d('flyBy', 'Fly-by', 'Transitions', 'Something zooms past left → right with a doppler pitch drop.', 1.6, true, 0.75, flyBy, [speedProp(1), toneProp]),
  d('spinWhoosh', 'Spin whoosh', 'Transitions', 'Whoosh that whirls around the stereo field — spins and flips.', 1, true, 0.7, (c, len) => spinWhoosh(c, len)),
  d('portal', 'Portal', 'Transitions', 'Swirling resonant hum that opens and closes — warps and dimension jumps.', 2.5, true, 0.7, portal, [toneProp]),
  d('rewind', 'Rewind', 'Transitions', 'Tape-rewind chatter — "let\'s go back".', 1.2, true, 0.7, (c, len) => rewind(c, len, 1)),
  d('fastForward', 'Fast forward', 'Transitions', 'High fast-forward chipmunk chatter — time skip.', 1.2, true, 0.7, (c, len) => rewind(c, len, 2.2)),
  d('scratchStop', 'Record scratch stop', 'Transitions', 'Record scratch that grinds to a halt — the "wait, what?" moment.', 0.75, false, 0.8, (c) => scratchStop(c)),
  d('filterSweep', 'Filter sweep', 'Transitions', 'Synth drone with a filter opening (or closing) across the clip.', 2, true, 0.7, filterSweep, [sel('direction', 'Direction', 'up', ['up', 'down']), toneProp]),
  d('noiseBurst', 'Noise burst', 'Transitions', 'Short burst of white noise — hard glitchy cut.', 0.35, false, 0.6, (c, _l, p) => dry(0.35, (o) => nz(o, c, 0, 0.35, 1, 0, () => 2500 * tk(p), 0.3, (x) => env(x, 0.002, 0.07 * dk(p)), 'lp')), [toneProp, decayProp]),
  d('cut', 'Hard cut', 'Transitions', 'Tight low thump + click — punctuates a hard cut.', 0.3, false, 0.85, (c, _l, p) => dry(0.3, (o) => {
    osc(o, 0, 0.3, 0.9, 0, (x) => (55 + 90 * Math.exp(-x / 0.02)) * tk(p, 0.5), sine, (x) => Math.exp(-x / 0.07));
    nz(o, c, 0, 0.01, 0.4, 0, () => 3000, 0.5, (x) => Math.exp(-x / 0.0015));
  }), [toneProp]),
  d('bassDrop', 'Bass drop', 'Transitions', '808 that slides from high down into the sub — the drop.', 2.5, true, 0.9, (_c, len, p) => dry(len, (o) => {
    let ph = 0; play(o, 0, len, 1, 0, (x) => { ph = wrap(ph + (40 + 180 * tk(p, 0.5) * Math.exp(-x / (len * 0.18))) / SR); return Math.tanh(sine(ph) * 2) * fe(x, len, 0.005, Math.min(0.6, len * 0.3)); });
  }), [toneProp]),
  d('riserShort', 'Riser (short)', 'Transitions', 'One-second noise + synth build that peaks at the clip end.', 1, true, 0.75, riser2, [toneProp, intensityProp]),
  d('riserLong', 'Riser (long)', 'Transitions', 'Long tension build (stretch it to any length) that peaks at the clip end.', 6, true, 0.75, riser2, [toneProp, intensityProp]),
  d('suctionIn', 'Suction in', 'Transitions', 'Air sucked inwards that stops dead — things shrinking into a point.', 0.5, false, 0.7, (c) => dry(0.5, (o) => {
    sweep(o, c, 0, 0.5, 0.8, 0, 6000, 350, 0.5, (k) => k * k * Math.min(1, (1 - k) * 0.5 / 0.006));
    osc(o, 0, 0.5, 0.15, 0, (x) => 2200 - 1600 * x / 0.5, sine, (x) => (x / 0.5) ** 2 * Math.min(1, (0.5 - x) / 0.006));
  })),
  d('popOut', 'Pop out', 'Transitions', 'Cork-like pop — something pops into existence.', 0.3, false, 0.75, (c) => verb(0.35, 0.2, (o) => {
    nz(o, c, 0, 0.01, 0.8, 0, () => 2000, 0.5, (x) => Math.exp(-x / 0.0015));
    osc(o, 0, 0.12, 0.7, 0, (x) => 320 + 500 * Math.exp(-x / 0.012), sine, (x) => env(x, 0.001, 0.035));
  })),
  // UI
  d('tap', 'Tap', 'UI', 'Soft screen tap.', 0.06, false, 0.5, (c, _l, p) => dry(0.06, (o) => tap(o, c, 0, 1, 900 * tk(p)))),
  d('doubleTap', 'Double tap', 'UI', 'Two quick taps — like / zoom gesture.', 0.2, false, 0.5, (c, _l, p) => dry(0.2, (o) => { tap(o, c, 0, 1, 900 * tk(p)); tap(o, c, 0.09, 1, 1050 * tk(p)); }), [toneProp]),
  d('longPress', 'Long press', 'UI', 'Tap, a soft rising hold, then a confirm click.', 0.7, false, 0.5, (c) => dry(0.7, (o) => {
    tap(o, c, 0, 1); osc(o, 0.08, 0.5, 0.25, 0, (x) => 600 + 200 * x, sine, (x) => Math.sin(Math.PI * x / 0.5) ** 2); tap(o, c, 0.58, 1, 1400);
  })),
  d('lock', 'Lock', 'UI', 'Two low clicks and a thunk — locked.', 0.3, false, 0.6, (c) => dry(0.3, (o) => { key(o, c, 0, 0.8, 160, 600); key(o, c, 0.05, 0.9, 140, 500); osc(o, 0.06, 0.2, 0.4, 0, () => 180, sine, (x) => Math.exp(-x / 0.05)); })),
  d('unlock', 'Unlock', 'UI', 'Click plus a bright two-note up — unlocked.', 0.35, false, 0.55, (c) => dry(0.35, (o) => { key(o, c, 0, 0.8, 200, 700); [880, 1320].forEach((f, i) => osc(o, 0.05 + i * 0.07, 0.15, 0.35, 0, () => f, sine, (x) => env(x, 0.003, 0.05))); })),
  d('keyType', 'Key (soft)', 'UI', 'One soft laptop key press.', 0.07, false, 0.45, (c) => dry(0.07, (o) => key(o, c, 0, 1))),
  d('backspace', 'Backspace', 'UI', 'Lower key with a tiny release click — delete a character.', 0.1, false, 0.45, (c) => dry(0.1, (o) => { key(o, c, 0, 1, 180, 700); nz(o, c, 0.035, 0.01, 0.2, 0, () => 5000, 0.4, (x) => Math.exp(-x / 0.0015)); })),
  d('enter', 'Enter key', 'UI', 'Heavier, deeper key press — submit / return.', 0.14, false, 0.55, (c) => dry(0.14, (o) => key(o, c, 0, 1.2, 140, 500, 0.025))),
  d('scrollTick', 'Scroll tick', 'UI', 'A single tiny scroll / picker detent.', 0.025, false, 0.35, (c) => dry(0.025, (o) => { nz(o, c, 0, 0.01, 0.6, 0, () => 6000, 0.4, (x) => Math.exp(-x / 0.0015)); osc(o, 0, 0.02, 0.2, 0, () => 3000, sine, (x) => Math.exp(-x / 0.002)); })),
  d('slider', 'Slider', 'UI', 'Detent ticks that rise in pitch across the clip — dragging a slider.', 1, true, 0.4, (c, len) => dry(len, (o) => {
    for (let t = 0.01; t < len - 0.02; t += 0.045 + c.rnd() * 0.025) osc(o, t, 0.02, 0.6, 0, () => 1200 + 1400 * t / len, sine, (x) => Math.exp(-x / 0.004));
  })),
  d('dropdown', 'Dropdown', 'UI', 'Click and a short falling blip — menu opens.', 0.18, false, 0.5, (c) => dry(0.18, (o) => { tap(o, c, 0, 0.8); osc(o, 0.02, 0.14, 0.4, 0, (x) => 950 - 350 * x / 0.14, sine, (x) => env(x, 0.003, 0.04)); })),
  d('modalOpen', 'Modal open', 'UI', 'Soft swish up into a pop — a panel or sheet opens.', 0.3, false, 0.5, (c) => dry(0.3, (o) => { sweep(o, c, 0, 0.18, 0.5, 0, 1500, 5000); osc(o, 0.12, 0.15, 0.5, 0, (x) => 600 + 400 * (1 - Math.exp(-x / 0.02)), sine, (x) => env(x, 0.002, 0.04)); })),
  d('modalClose', 'Modal close', 'UI', 'Soft swish down and a tap — dismiss.', 0.25, false, 0.5, (c) => dry(0.25, (o) => { sweep(o, c, 0, 0.16, 0.5, 0, 5000, 1300); tap(o, c, 0.15, 0.8, 700); })),
  d('notificationSoft', 'Notification (soft)', 'UI', 'Gentle two-note marimba notification.', 0.8, false, 0.55, () => verb(0.8, 0.2, (o) => { bar(o, 0, mtof(79), 0.6, 0); bar(o, 0.12, mtof(84), 0.6, 0.1); })),
  d('badge', 'Badge', 'UI', 'Tiny bright ping — counter badge appears.', 0.35, false, 0.5, () => verb(0.35, 0.15, (o) => { I.bell(o, 0, 2093, 0.2, 0.8, 0, 2, 0.12); osc(o, 0, 0.08, 0.3, 0, (x) => 700 + 600 * (1 - Math.exp(-x / 0.02)), sine, (x) => env(x, 0.002, 0.03)); })),
  d('achievement', 'Achievement', 'UI', 'Sparkling bell arpeggio + chord — achievement unlocked.', 1.6, false, 0.7, (c) => verb(1.6, 0.35, (o) => {
    [72, 76, 79, 84, 88].forEach((m, k) => I.bell(o, k * 0.06, mtof(m), 0.6, 0.8, k / 2 - 1, 3.5, 0.5));
    [60, 64, 67].forEach((m, k) => I.strings(o, c, 0.3, mtof(m), 0.8, 0.5, k / 2 - 0.5, 0.05, 0.4));
    for (let i = 0; i < 6; i++) I.bell(o, 0.35 + c.rnd() * 0.6, mtof(96 + PENTA[Math.floor(c.rnd() * 5)]), 0.2, 0.3, c.rnd() * 2 - 1, 5, 0.2);
  })),
  d('purchase', 'Cash register', 'UI', 'Ka-ching: drawer clunk and bell — sale / purchase.', 1.3, false, 0.7, (c) => cashRegister(c)),
  d('cameraFocus', 'Camera focus beep', 'UI', 'Two quick autofocus beeps.', 0.25, false, 0.4, () => dry(0.25, (o) => [0, 0.09].forEach((t) => osc(o, t, 0.05, 0.4, 0, () => 2700, sqr, (x) => env(x, 0.001, 0.02))))),
  d('recordStart', 'Record start', 'UI', 'Rising two tones — recording starts.', 0.4, false, 0.5, twoTone([660, 990], 0.11, 0.4)),
  d('recordStop', 'Record stop', 'UI', 'Falling two tones — recording stops.', 0.4, false, 0.5, twoTone([990, 660], 0.11, 0.4)),
  d('uploadComplete', 'Upload complete', 'UI', 'Swish up into a clean double chime — done.', 1, false, 0.6, (c) => verb(1, 0.25, (o) => { sweep(o, c, 0, 0.25, 0.5, 0, 800, 5000); I.bell(o, 0.24, mtof(88), 0.5, 0.7, 0, 2, 0.35); I.bell(o, 0.34, mtof(95), 0.6, 0.6, 0.1, 2, 0.4); })),
  d('deny', 'Deny', 'UI', 'Soft low "nuh-uh" double buzz — not allowed.', 0.4, false, 0.5, () => dry(0.4, (o) => [0, 0.16].forEach((t) => { osc(o, t, 0.13, 0.5, 0, () => 300, sine, (x) => env(x, 0.005, 0.05)); osc(o, t, 0.13, 0.5, 0, () => 291, tri, (x) => env(x, 0.005, 0.05)); }))),
  d('confirm', 'Confirm', 'UI', 'Two soft notes up — OK / saved.', 0.4, false, 0.5, () => verb(0.4, 0.15, (o) => [72, 79].forEach((m, i) => osc(o, i * 0.09, 0.25, 0.5, 0, () => mtof(m), sine, (x) => env(x, 0.006, 0.07))))),
  // cartoon
  d('boing', 'Boing', 'Cartoon', 'Springy cartoon boing.', 0.9, false, 0.75, boing, [toneProp, decayProp]),
  d('slideWhistleUp', 'Slide whistle up', 'Cartoon', 'Slide whistle sweeping up across the clip.', 0.8, true, 0.6, (_c, len, p) => slideWhistle(len, true, p), [toneProp]),
  d('slideWhistleDown', 'Slide whistle down', 'Cartoon', 'Slide whistle falling across the clip — failure, falling.', 0.8, true, 0.6, (_c, len, p) => slideWhistle(len, false, p), [toneProp]),
  d('honk', 'Honk', 'Cartoon', 'Squeeze-bulb bike horn (count = honks).', 0.9, false, 0.7, (_c, _l, p) => dry(0.9, (o) => {
    const n = Math.max(1, Math.min(3, Math.round(num(p, 'count', 1))));
    for (let i = 0; i < n; i++) { const fl = new SVF(1100, 0.2); let ph = 0; play(o, i * 0.3, 0.26, 0.8, 0, (x) => { ph = wrap(ph + (330 + 25 * Math.sin(TAU * 4 * x)) * tk(p, 0.5) / SR); fl.run(saw(ph)); return (fl.bp * 1.5 + saw(ph) * 0.15) * env(x, 0.01, 0.12); }); }
  }), [P('count', 'Honks', 1, 1, 3, 1), toneProp]),
  d('squeak', 'Squeak', 'Cartoon', 'Rubber-toy squeak.', 0.2, false, 0.6, (_c, _l, p) => dry(0.2, (o) => osc(o, 0, 0.2, 0.7, 0, (x) => (1800 + 900 * Math.sin(Math.PI * x / 0.2)) * tk(p, 0.5), (ph) => tri(ph) * 0.7 + sine(2 * ph) * 0.3, (x) => Math.sin(Math.PI * x / 0.2))), [toneProp]),
  d('zip', 'Zip', 'Cartoon', 'Zipper / quick zip across the clip.', 0.45, true, 0.6, (c, len) => dry(len, (o) => { for (let t = 0; t < len - 0.005; t += 0.004 + c.rnd() * 0.004) nz(o, c, t, 0.006, 0.7 * Math.sin(Math.PI * t / len), 0, () => 3500 + 2500 * t / len, 0.4, (x) => Math.exp(-x / 0.0012)); })),
  d('bonk', 'Bonk', 'Cartoon', 'Woodblock bonk + a falling "doink" — cartoon head hit.', 0.55, false, 0.75, (c) => dry(0.55, (o) => { knockHit(o, c, 0, 820, 0.9); osc(o, 0.02, 0.5, 0.5, 0, (x) => (620 - 300 * x / 0.5) * (1 + 0.05 * Math.sin(TAU * 12 * x)), sine, (x) => env(x, 0.003, 0.18)); })),
  d('wobble', 'Wobble', 'Cartoon', 'Wah-wah wobble that fills the clip — dizzy, jelly, wiggle.', 1.2, true, 0.65, (c, len, p) => dry(len, (o) => {
    const fl = new SVF(600, 0.25); let ph = c.rnd();
    play(o, 0, len, 0.8, 0, (x) => { ph = wrap(ph + 110 * tk(p, 0.5) / SR); fl.tune(350 + 1200 * (0.5 + 0.5 * Math.sin(TAU * num(p, 'speed', 5) * x))); fl.run(saw(ph)); return fl.bp * fe(x, len, 0.02, 0.05); });
  }), [speedProp(5, 'Wobble rate (Hz)'), toneProp]),
  d('cartoonRun', 'Cartoon run', 'Cartoon', 'Frantic woodblock feet that fill the clip — running away.', 1.2, true, 0.65, (c, len) => dry(len, (o) => { let i = 0; for (let t = 0; t < len - 0.03; t += 1 / 13, i++) knockHit(o, c, t, i % 2 ? 1150 : 900, 0.8, i % 2 ? 0.2 : -0.2, 0.02); })),
  d('poof', 'Poof', 'Cartoon', 'Puff of smoke — vanish / appear.', 0.6, false, 0.7, (c) => verb(0.6, 0.3, (o) => { nz(o, c, 0, 0.5, 1, 0, (x) => 200 + 1500 * Math.exp(-x / 0.08), 0.5, (x) => env(x, 0.005, 0.11), 'lp'); osc(o, 0, 0.2, 0.4, 0, (x) => 90 + 40 * Math.exp(-x / 0.03), sine, (x) => Math.exp(-x / 0.06)); })),
  d('splat', 'Splat', 'Cartoon', 'Wet splat — pie in the face, paint hit.', 0.45, false, 0.75, (c) => dry(0.45, (o) => {
    const fl = new SVF(1200, 0.6); let a = 1;
    play(o, 0, 0.45, 1, 0, (x) => { if (c.rnd() < 60 / SR) a = 0.3 + c.rnd() * 0.7; fl.tune(400 + 1600 * Math.exp(-x / 0.05)); return fl.run(c.noise()) * a * env(x, 0.002, 0.09); });
    osc(o, 0, 0.12, 0.5, 0, (x) => 140 - 60 * x / 0.12, sine, (x) => Math.exp(-x / 0.03));
  })),
  // sci-fi
  d('laser', 'Laser', 'Sci-fi', 'Classic "pew" laser shot.', 0.35, false, 0.6, (_c, _l, p) => verb(0.35, 0.2, (o) => laser(o, 0, 0.6, 2200 * tk(p, 0.5))), [toneProp]),
  d('laserBurst', 'Laser burst', 'Sci-fi', 'Three-shot laser burst.', 0.7, false, 0.6, (c, _l, p) => verb(0.7, 0.2, (o) => [0, 0.12, 0.24].forEach((t, i) => laser(o, t, 0.6, (2000 + c.rnd() * 600) * tk(p, 0.5), i - 1))), [toneProp]),
  d('forceField', 'Force field', 'Sci-fi', 'Electric shield hum with crackles that fills the clip.', 4, true, 0.6, (c, len, p) => dry(len, (o) => {
    const fl = new SVF(900, 0.5), ph = [c.rnd(), c.rnd(), c.rnd()];
    play(o, 0, len, 0.7, 0, (x) => { const fs = [110, 110.7, 220.4].map((f) => f * tk(p, 0.5)); let s = 0; for (let i = 0; i < 3; i++) { ph[i] = wrap(ph[i] + fs[i] / SR); s += saw(ph[i]); } return fl.run(s / 3) * (0.6 + 0.4 * Math.sin(TAU * 12 * x)) * fe(x, len, 0.15, 0.2); });
    for (let t = 0.05; t < len - 0.05; t += 0.03 + c.rnd() * 0.15) nz(o, c, t, 0.02, 0.4 * c.rnd(), c.rnd() * 1.4 - 0.7, () => 5000, 0.4, (x) => Math.exp(-x / 0.003));
  }), [toneProp]),
  d('teleport', 'Teleport', 'Sci-fi', 'Rising shimmer + sweep — beam me up.', 1.5, false, 0.65, (c) => verb(1.5, 0.45, (o) => { for (let i = 0; i < 16; i++) I.bell(o, i * 0.04, mtof(scaleNote(PENTA, 72, i)), 0.4, 0.5, Math.sin(i * 1.3), 3.5, 0.35); sweep(o, c, 0, 1, 0.5, 0, 400, 7000, 0.4, (k) => Math.sin(Math.PI * k)); })),
  d('scanner', 'Scanner', 'Sci-fi', 'Sweeping scan tone with periodic beeps that fills the clip.', 3, true, 0.5, (_c, len) => dry(len, (o) => {
    osc(o, 0, len, 0.4, 0, (x) => 1000 + 450 * Math.sin(TAU * 1.2 * x), tri, (x) => fe(x, len, 0.05, 0.1) * 0.6);
    for (let t = 0.25; t < len - 0.05; t += 0.5) osc(o, t, 0.06, 0.4, 0, () => 2000, sqr, (x) => env(x, 0.002, 0.02));
  })),
  d('powerUp', 'Power up', 'Sci-fi', 'Rising synth sweep that lands on a ding — charged / upgraded.', 1.3, false, 0.65, () => verb(1.3, 0.3, (o) => {
    const fl = new SVF(300, 0.5); let ph = 0;
    play(o, 0, 0.95, 0.8, 0, (x) => { ph = wrap(ph + 80 * Math.pow(10, x / 0.95) / SR); fl.tune(300 + 6000 * (x / 0.95) ** 2); return fl.run(saw(ph)) * att(x, 0.05) * Math.min(1, (0.95 - x) / 0.02); });
    I.bell(o, 0.92, mtof(84), 0.4, 0.8, 0, 2, 0.35);
  })),
  d('powerDown', 'Power down', 'Sci-fi', 'Synth that sinks and dies out — shutdown / failure.', 1.3, false, 0.65, () => dry(1.3, (o) => {
    const fl = new SVF(5000, 0.5); let ph = 0;
    play(o, 0, 1.25, 0.8, 0, (x) => { const k = x / 1.25; ph = wrap(ph + 800 * Math.pow(0.07, k) / SR); fl.tune(6000 * Math.pow(0.05, k) + 120); return fl.run(saw(ph)) * (1 - k) * (0.7 + 0.3 * Math.sin(TAU * (14 - 10 * k) * x)); });
  })),
  d('computerBeeps', 'Computer beeps', 'Sci-fi', 'Random mainframe beeps and boops that fill the clip.', 3, true, 0.45, (c, len) => dry(len, (o) => {
    for (let t = 0.02; t < len - 0.1; t += 0.06 + c.rnd() * 0.12) { const f = mtof(scaleNote(PENTA, 81, Math.floor(c.rnd() * 10))), dd = 0.03 + c.rnd() * 0.06; osc(o, t, dd, 0.5, c.rnd() - 0.5, () => f, c.rnd() < 0.5 ? sqr : sine, (x) => att(x, 0.002) * Math.min(1, (dd - x) / 0.004)); }
  })),
  d('hologram', 'Hologram', 'Sci-fi', 'Shimmering, flickering FM tone — hologram appears.', 1.4, false, 0.55, (c) => verb(1.4, 0.4, (o) => {
    let a = 1; play(o, 0, 1.3, 0.6, 0, (x) => { if (c.rnd() < 14 / SR) a = 0.4 + c.rnd() * 0.6; return Math.sin(TAU * 880 * x + 2 * (0.5 + 0.5 * Math.sin(TAU * 0.8 * x)) * Math.sin(TAU * 1320 * x)) * a * att(x, 0.15) * Math.min(1, (1.3 - x) / 0.3); });
    nz(o, c, 0, 1.3, 0.15, 0.3, () => 7000, 0.5, (x) => att(x, 0.1) * Math.min(1, (1.3 - x) / 0.3), 'hp');
  })),
  d('energyCharge', 'Energy charge', 'Sci-fi', 'Whine that charges up across the clip and releases in a burst at the end.', 2, true, 0.75, (c, len) => energyCharge(c, len)),
  // impacts
  d('hitLight', 'Hit (light)', 'Impacts', 'Snappy light hit — quick slaps, small UI slams.', 0.3, false, 0.7, (c, _l, p) => dry(0.3, (o) => { nz(o, c, 0, 0.06, 0.9, 0, () => 2200 * tk(p), 0.5, (x) => Math.exp(-x / 0.012)); osc(o, 0, 0.15, 0.6, 0, (x) => 200 + 120 * Math.exp(-x / 0.01), sine, (x) => Math.exp(-x / 0.04)); }), [toneProp]),
  d('hitHeavy', 'Hit (heavy)', 'Impacts', 'Heavy, saturated body hit with a short tail.', 1.4, false, 0.9, (c, _l, p) => verb(1.4, 0.2, (o) => {
    let ph = 0; const fl = new SVF(800 * tk(p), 0.6);
    play(o, 0, 1.2 * dk(p), 1, 0, (x) => { ph = wrap(ph + (50 + 90 * Math.exp(-x / 0.03)) * tk(p, 0.4) / SR); return Math.tanh((Math.sin(TAU * ph) * Math.exp(-x / (0.45 * dk(p))) + fl.run(c.noise()) * Math.exp(-x / 0.06)) * 2.2); });
  }), [toneProp, decayProp]),
  d('kick', 'Cinematic kick', 'Impacts', 'Single deep cinematic kick drum with a sub tail.', 1.2, false, 0.9, (_c, _l, p) => dry(1.2, (o) => { I.kick(o, 0, 1, 'deep'); osc(o, 0, 1.2, 0.4, 0, () => 44 * tk(p, 0.4), sine, (x) => att(x, 0.01) * Math.exp(-x / (0.45 * dk(p)))); }), [toneProp, decayProp]),
  d('thump', 'Thump', 'Impacts', 'Muffled low thump — box drop, soft landing.', 0.5, false, 0.75, (c, _l, p) => dry(0.5, (o) => { nz(o, c, 0, 0.3, 1, 0, () => 260 * tk(p), 0.6, (x) => Math.exp(-x / 0.05), 'lp'); osc(o, 0, 0.35, 0.6, 0, (x) => 70 + 40 * Math.exp(-x / 0.02), sine, (x) => Math.exp(-x / 0.12)); }), [toneProp]),
  d('crash', 'Shatter / crash', 'Impacts', 'Glass shatter or metal crash with debris.', 2, false, 0.8, crash, [sel('material', 'Material', 'glass', ['glass', 'metal'])]),
  d('explosion', 'Explosion', 'Impacts', 'Big explosion: blast, rumble and falling debris.', 3.5, false, 0.9, explosion, [toneProp, decayProp]),
  d('rumble', 'Rumble', 'Impacts', 'Low earthquake / engine rumble that fills the clip.', 4, true, 0.75, (c, len, p) => dry(len, (o) => {
    const l = lfo(c); nz(o, c, 0, len, 1, 0, () => 110 * tk(p), 0.6, (x) => (0.6 + 0.4 * l(x * 3)) * fe(x, len, 0.5, 0.6), 'lp');
    osc(o, 0, len, 0.4, 0, (x) => 38 + 4 * l(x), sine, (x) => fe(x, len, 0.5, 0.6));
  }), [toneProp]),
  d('anvil', 'Anvil', 'Impacts', 'Hammer on anvil — bright metallic ring.', 1.8, false, 0.75, (c, _l, p) => verb(1.8, 0.2, (o) => {
    [[1, 1, 1.1], [2.76, 0.6, 0.7], [5.4, 0.4, 0.4], [8.93, 0.25, 0.2]].forEach(([r, a, dd]) => play(o, 0, 1.7, a * 0.4, 0, (x) => Math.sin(TAU * 900 * tk(p, 0.4) * r * x) * Math.exp(-x / (dd * dk(p))) * att(x, 0.0005)));
    nz(o, c, 0, 0.02, 0.6, 0, () => 5000, 0.5, (x) => Math.exp(-x / 0.003));
  }), [toneProp, decayProp]),
  d('woodKnock', 'Wood knock', 'Impacts', 'Single hollow wood knock / block.', 0.25, false, 0.65, (c, _l, p) => dry(0.25, (o) => knockHit(o, c, 0, 700 * tk(p, 0.5), 1)), [toneProp]),
  d('stomp', 'Stomp', 'Impacts', 'Heavy foot stomp on a wooden floor.', 0.55, false, 0.8, (c) => dry(0.55, (o) => { nz(o, c, 0, 0.3, 1, 0, () => 320, 0.6, (x) => Math.exp(-x / 0.06), 'lp'); osc(o, 0, 0.4, 0.7, 0, (x) => 60 + 50 * Math.exp(-x / 0.02), sine, (x) => Math.exp(-x / 0.16)); knockHit(o, c, 0.01, 180, 0.3, 0, 0.05); })),
  // nature
  d('thunder', 'Thunder', 'Nature', 'Lightning crack into a long rolling rumble.', 5, false, 0.85, (c, _l, p) => verb(5, 0.3, (o) => {
    nz(o, c, 0, 0.3, 1, 0, () => 4000, 0.4, (x) => Math.exp(-x / 0.05) * (0.5 + 0.5 * Math.sign(Math.sin(TAU * 40 * x))), 'hp');
    const l = lfo(c); nz(o, c, 0.05, 4.9, 1.2, 0, () => 140 * tk(p), 0.6, (x) => att(x, 0.2) * Math.exp(-x / (1.6 * dk(p))) * (0.5 + 0.5 * l(x * 6)), 'lp');
  }), [toneProp, decayProp]),
  d('ocean', 'Ocean waves', 'Nature', 'Waves rolling in and washing out that fill the clip.', 12, true, 0.6, (c, len) => ocean(c, len)),
  d('birds', 'Birdsong', 'Nature', 'Morning birds chirping and trilling that fill the clip.', 8, true, 0.45, (c, len) => birds(c, len)),
  d('fire', 'Fire', 'Nature', 'Crackling fire / campfire that fills the clip.', 8, true, 0.6, (c, len) => fire(c, len)),
  d('waterDrop', 'Water drop', 'Nature', 'A single drop plopping into water.', 0.35, false, 0.6, () => verb(0.35, 0.3, (o) => osc(o, 0, 0.25, 0.8, 0, (x) => 400 + 1200 * (1 - Math.exp(-x / 0.012)), sine, (x) => env(x, 0.001, 0.05)))),
  d('bubblesLoop', 'Bubbles', 'Nature', 'Stream of underwater bubbles that fills the clip.', 5, true, 0.5, (c, len) => dry(len, (o) => {
    for (let t = 0; t < len - 0.05; t += 0.02 + c.rnd() * 0.12) { const f0 = 250 + c.rnd() * 600, dd = 0.02 + c.rnd() * 0.03; osc(o, t, dd * 2, 0.4 * (0.4 + c.rnd() * 0.6), c.rnd() - 0.5, (x) => f0 * (1 + 2 * x / dd), sine, (x) => env(x, 0.002, dd * 0.6)); }
  })),
  d('windGust', 'Wind gust', 'Nature', 'One gust of wind rising and falling.', 2.5, false, 0.6, (c) => dry(2.5, (o) => [-0.5, 0.5].forEach((pan) => nz(o, c, 0, 2.5, 0.8, pan, (x) => 300 + 600 * Math.sin(Math.PI * x / 2.5), 0.35, (x) => Math.sin(Math.PI * x / 2.5) ** 1.5)))),
  d('cricket', 'Crickets', 'Nature', 'Night crickets chirping that fill the clip.', 6, true, 0.4, (c, len) => dry(len, (o) => [-0.6, 0.6].forEach((pan) => {
    const f = 4300 + c.rnd() * 600, per = 0.5 + c.rnd() * 0.25;
    for (let t = c.rnd() * per; t < len - 0.1; t += per) for (let i = 0; i < 3; i++) osc(o, t + i * 0.033, 0.018, 0.5, pan, () => f, sine, (x) => Math.sin(Math.PI * x / 0.018));
  }))),
  d('heartbeatFast', 'Heartbeat (fast)', 'Nature', 'Racing heartbeat (~140 bpm) that fills the clip — panic, suspense.', 3, true, 0.8, (_c, len, p) => dry(len, (o) => {
    const per = 60 / num(p, 'bpm', 140);
    for (let t = 0; t < len - 0.2; t += per) [[0, 1], [0.14, 0.7]].forEach(([dt, a]) => osc(o, t + dt, 0.18, a, 0, (x) => 55 + 25 * Math.exp(-x / 0.02), sine, (x) => env(x, 0.004, 0.05)));
  }), [P('bpm', 'Beats per minute', 140, 40, 220, 1)]),
  // human / foley
  d('footsteps', 'Footsteps', 'Human', 'Walking footsteps that fill the clip (speed = steps per second).', 3, true, 0.7, footsteps, [speedProp(2, 'Steps per second')]),
  d('applause', 'Applause', 'Human', 'Audience applause that swells in and fades out.', 4, true, 0.7, (c, len, p) => applause(c, len, p, 28, 4, true), [intensityProp]),
  d('cheerShort', 'Cheer (short)', 'Human', 'Short crowd "yay!" burst.', 1.8, false, 0.7, (c) => crowdVowel(c, 1.8, 14, VOWELS.ay, (x, b) => b * (1 + 0.25 * Math.min(1, x / 0.25)), (x) => att(x, 0.12) * Math.exp(-Math.max(0, x - 0.4) / 0.45))),
  d('ooh', 'Crowd "ooh"', 'Human', 'Impressed crowd "ooooh".', 1.6, false, 0.65, (c) => crowdVowel(c, 1.6, 10, VOWELS.u, (x, b) => b * (0.9 + 0.25 * Math.sin(Math.PI * Math.min(1, x / 1.2))), (x) => att(x, 0.18) * Math.exp(-Math.max(0, x - 0.6) / 0.4), 0.35)),
  d('crowdLaugh', 'Crowd laugh', 'Human', 'Studio-audience laughter that fills the clip.', 3, true, 0.65, (c, len) => laughs(c, len)),
  d('clapping', 'Clapping', 'Human', 'A few people clapping steadily — fills the clip.', 4, true, 0.65, (c, len, p) => applause(c, len, p, 4, 2.2, false), [intensityProp]),
  d('paperRustle', 'Paper rustle', 'Human', 'Handling a sheet of paper.', 0.7, false, 0.55, (c) => dry(0.7, (o) => { for (let t = 0; t < 0.6; t += 0.008 + c.rnd() * 0.03) nz(o, c, t, 0.03, 0.5 * Math.sin(Math.PI * t / 0.6) * (0.4 + c.rnd() * 0.6), c.rnd() - 0.5, () => 2500 + c.rnd() * 3500, 0.4, (x) => Math.exp(-x / 0.006)); })),
  d('pageTurn', 'Page turn', 'Human', 'Book page swishing over and flicking down.', 0.55, false, 0.55, (c) => dry(0.55, (o) => { sweep(o, c, 0, 0.3, 0.7, -0.3, 1500, 3500, 0.4); nz(o, c, 0.3, 0.05, 0.6, 0.3, () => 4200, 0.4, (x) => Math.exp(-x / 0.008)); })),
  d('pencilWrite', 'Pencil writing', 'Human', 'Pencil scribbling on paper that fills the clip.', 2.5, true, 0.5, (c, len) => dry(len, (o) => {
    let t = 0; while (t < len - 0.1) { const dd = 0.08 + c.rnd() * 0.3, r = 5 + c.rnd() * 6; nz(o, c, t, dd, 0.6, 0, () => 4200, 0.35, (x) => Math.abs(Math.sin(TAU * r * x)) * Math.sin(Math.PI * x / dd)); t += dd + c.rnd() * 0.12; }
  })),
  d('coffeePour', 'Pouring liquid', 'Human', 'Coffee / water pouring into a cup — pitch rises as it fills.', 3, true, 0.6, (c, len) => dry(len, (o) => {
    const fl = new SVF(400, 0.15); let a = 1;
    play(o, 0, len, 0.7, 0, (x) => { if (c.rnd() < 120 / SR) a = 0.5 + c.rnd() * 0.5; fl.tune(350 + 900 * x / len); fl.run(c.noise()); return fl.bp * a * fe(x, len, 0.1, 0.15); });
  })),
  d('doorOpen', 'Door open', 'Human', 'Latch click and a long creak.', 1.3, false, 0.65, (c) => verb(1.3, 0.2, (o) => { knockHit(o, c, 0, 1200, 0.5, 0, 0.01); creak(o, c, 0.1, 1.1, 0.7); })),
  d('doorClose', 'Door close', 'Human', 'Door shutting: thud, latch and a little rattle.', 0.7, false, 0.8, (c) => verb(0.7, 0.2, (o) => { nz(o, c, 0, 0.3, 1, 0, () => 300, 0.6, (x) => Math.exp(-x / 0.05), 'lp'); osc(o, 0, 0.3, 0.6, 0, (x) => 75 + 30 * Math.exp(-x / 0.02), sine, (x) => Math.exp(-x / 0.08)); knockHit(o, c, 0.06, 1400, 0.4, 0.2, 0.01); for (let i = 0; i < 4; i++) knockHit(o, c, 0.09 + i * 0.03, 900, 0.1, 0, 0.008); })),
  d('knock', 'Knock on door', 'Human', 'Knuckles on a door (count = knocks).', 0.9, false, 0.75, (c, _l, p) => verb(0.9, 0.15, (o) => { const n = Math.max(1, Math.min(5, Math.round(num(p, 'count', 3)))); for (let i = 0; i < n; i++) knockHit(o, c, i * 0.17, 170 + c.rnd() * 10, 1, 0, 0.04); }), [P('count', 'Knocks', 3, 1, 5, 1)]),
  // musical
  d('chordHit', 'Chord hit', 'Tonal', 'Bright synth + piano chord stab (pick the chord).', 1.6, false, 0.75, (c, _l, p) => stab(c, p, 1.6, 'saw'), [chordProp, transposeProp]),
  d('brassStab', 'Brass stab', 'Tonal', 'Punchy brass-section chord stab.', 1, false, 0.75, (c, _l, p) => stab(c, p, 1, 'brass'), [chordProp, transposeProp]),
  d('stringSwell', 'String swell', 'Tonal', 'String chord swelling across the clip — emotion, reveal.', 4, true, 0.7, (c, len, p) => verb(len, 0.4, (o) => chordOf(p).forEach((iv, k) => I.strings(o, c, 0, mtof(48 + num(p, 'transpose', 0) + iv + (k > 1 ? 12 : 0)), Math.max(0.2, len - 0.4), 0.9, k / 2 - 0.75, Math.max(0.1, len * 0.75), 0.6))), [chordProp, transposeProp]),
  d('pianoGliss', 'Piano glissando', 'Tonal', 'Fast white-key piano run up the keyboard.', 1.6, false, 0.7, (c) => verb(1.6, 0.3, (o) => { for (let i = 0; i < 22; i++) I.piano(o, c, i * 0.028, mtof(scaleNote(MAJOR, 48, i)), 0.5, 0.5 + i / 50, i / 11 - 1, 0.7); })),
  d('bellTree', 'Bell tree', 'Tonal', 'Cascading bell tree, high to low — magic, wonder.', 1.8, false, 0.6, () => verb(1.8, 0.4, (o) => { for (let i = 0; i < 18; i++) I.bell(o, i * 0.035, mtof(scaleNote(PENTA, 100, -i)), 0.5, 0.55, Math.sin(i), 4, 0.5); })),
  d('sitarPluck', 'Sitar pluck', 'Tonal', 'Buzzy plucked string with sympathetic shimmer.', 1.8, false, 0.65, (c, _l, p) => verb(1.8, 0.3, (o) => { const f = mtof(50 + num(p, 'transpose', 0)); I.ks(o, c, 0, f, 1.6, 1, 0, 0.95, 2.4); I.ks(o, c, 0.01, f * 1.5, 1.6, 0.25, 0.4, 0.9, 2.4); I.ks(o, c, 0.015, f * 2, 1.6, 0.2, -0.4, 0.9, 2.4); }), [transposeProp]),
  d('kalimba', 'Kalimba', 'Tonal', 'Three-note thumb-piano motif — warm, playful.', 1.4, false, 0.6, (c, _l, p) => verb(1.4, 0.25, (o) => { const r = 72 + num(p, 'transpose', 0); [0, 4, 7].map((iv, k) => [iv + (c.rnd() < 0.3 ? 12 : 0), k]).forEach(([iv, k]) => bar(o, k * 0.14, mtof(r + iv), 0.7, k / 2 - 0.5, 0.45, 5.4, 0.25)); }), [transposeProp]),
  d('marimbaRun', 'Marimba run', 'Tonal', 'Quick ascending marimba run.', 1.2, false, 0.6, (_c, _l, p) => verb(1.2, 0.2, (o) => { for (let i = 0; i < 10; i++) bar(o, i * 0.055, mtof(scaleNote(PENTA, 60 + num(p, 'transpose', 0), i)), 0.6, i / 5 - 1); }), [transposeProp]),
  d('choirAah', 'Choir "aah"', 'Tonal', 'Choir chord on "aah" that swells and holds across the clip.', 4, true, 0.65, (c, len, p) => verb(len, 0.5, (o) => chordOf(p).slice(0, 3).forEach((iv, k) => { for (let v = 0; v < 3; v++) { const f = mtof(55 + num(p, 'transpose', 0) + iv) * (1 + (v - 1) * 0.004), vr = 4.8 + c.rnd(); voice(o, c, 0, len, 0.25, k - 1, (x) => f * (1 + 0.006 * Math.sin(TAU * vr * x)), VOWELS.a, (x) => att(x, Math.min(0.8, len * 0.3)) * Math.min(1, (len - x) / 0.4), 0.08); } })), [chordProp, transposeProp]),
  d('orchestraHit', 'Orchestra hit', 'Tonal', 'Full orchestra stab: strings, brass, timpani, cymbal.', 2, false, 0.85, (c, _l, p) => verb(2, 0.35, (o) => {
    const r = 48 + num(p, 'transpose', 0); chordOf(p).forEach((iv, k) => { I.strings(o, c, 0, mtof(r + 12 + iv), 0.35, 1, k / 2 - 0.75, 0.01, 0.5); I.brass(o, c, 0, mtof(r + iv), 0.3, 0.8, -k / 2 + 0.75); });
    I.timpani(o, c, 0, mtof(r - 12), 1); I.crash(o, c, 0, 0.35, 1.8);
  }), [chordProp, transposeProp]),
  d('drumFill', 'Drum fill', 'Music', 'Tom fill rolling down across the clip into a crash.', 1.5, true, 0.85, (c, len) => dry(len, (o) => {
    const hits = Math.max(4, Math.round((len - 0.3) / 0.09)), toms = [220, 180, 140, 105];
    for (let i = 0; i < hits; i++) I.tom(o, c, i * (len - 0.3) / hits, toms[Math.floor(i / hits * 4)], 0.7 + 0.3 * i / hits, (i % 4) / 2 - 0.75);
    I.kick(o, len - 0.3, 1); I.crash(o, c, len - 0.3, 0.9, 1.6);
  })),
  d('cymbalSwell', 'Cymbal swell', 'Music', 'Rolled cymbal swelling up to the clip end.', 2.5, true, 0.7, (c, len) => dry(len, (o) => {
    const fl = new SVF(6000, 0.5);
    play(o, 0, len, 1, 0, (x) => { fl.run(c.noise()); let m = 0; for (const r of [1, 1.342, 1.783, 2.159]) m += Math.sin(TAU * 410 * r * x); return (fl.hp + m * 0.04) * Math.pow(x / len, 2.4) * Math.min(1, (len - x) / 0.02); });
  })),
  d('timpaniRoll', 'Timpani roll', 'Music', 'Timpani roll that crescendos across the clip.', 3, true, 0.85, (c, len, p) => dry(len, (o) => {
    const f = mtof(41 + num(p, 'transpose', 0));
    for (let t = 0; t < len - 0.1; t += 1 / 16) I.timpani(o, c, t, f * (1 + (c.rnd() - 0.5) * 0.004), 0.15 + 0.85 * Math.pow(t / len, 2));
  }), [transposeProp]),
];
