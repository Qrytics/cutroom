// Synthesized instruments. Each one renders a single note straight into an Out bus at time t (seconds),
// frequency f (Hz), held for len seconds, gain g, pan -1..1. Pure and seeded through Ctx.
import { att, type Ctx, mtof, type Out, play, rel, SR, SVF, TAU } from './dsp.ts';

const wrap = (x: number) => x - Math.floor(x);

// ---------------------------------------------------------------- keys & mallets
/** FM electric piano (Rhodes-ish): bell-y attack that mellows. */
export function epiano(o: Out, t: number, f: number, len: number, g: number, pan = 0) {
  const dec = 1.4 * Math.pow(220 / f, 0.35), tine = f * 7 < 15000;
  play(o, t, Math.min(len + 0.4, dec * 3), g * 0.3, pan, (x) => {
    const e = Math.exp(-x / dec) * rel(x, len, 0.12) * att(x, 0.003);
    const m = Math.sin(TAU * f * x) * (1.6 * Math.exp(-x / 0.3) + 0.25);
    return (Math.sin(TAU * f * x + m) + (tine ? 0.14 * Math.sin(TAU * f * 7 * x) * Math.exp(-x / 0.03) : 0)) * e;
  });
}
/** FM bell / glockenspiel (ratio 3.5 = bell, 4 = glock-ish, short dec = blip). */
export function bell(o: Out, t: number, f: number, len: number, g: number, pan = 0, ratio = 3.5, dec = 0) {
  const d = Math.min(dec || Math.min(2.6, 1.6 * Math.pow(440 / f, 0.3)), 0.4 + len * 2);
  play(o, t, Math.min(Math.max(len, d * 2.5), 4), g * 0.22, pan, (x) =>
    Math.sin(TAU * f * x + 2.2 * Math.exp(-x / (d * 0.25)) * Math.sin(TAU * f * ratio * x)) * Math.exp(-x / d) * att(x, 0.002));
}
/** Felt/acoustic piano: slightly inharmonic decaying partials via rotating phasors, soft hammer noise. */
export function piano(o: Out, c: Ctx, t: number, f: number, len: number, g: number, pan = 0, bright = 0.5) {
  const P: { cr: number; sr: number; re: number; im: number; a: number; d: number }[] = [];
  const base = 2.4 * Math.pow(260 / f, 0.5);
  for (let k = 1; k <= 7; k++) {
    const fk = k * f * Math.sqrt(1 + 0.0004 * k * k);
    if (fk > 12000) break;
    const w = TAU * fk / SR;
    P.push({ cr: Math.cos(w), sr: Math.sin(w), re: 1, im: 0, a: 1 / Math.pow(k, 1.7 - bright * 0.7), d: Math.exp(-1 / (SR * base / Math.pow(k, 0.8))) });
  }
  const h = new SVF(1800, 0.7);
  play(o, t, Math.min(len + 0.6, base * 3, 7), g * 0.28, pan, (x) => {
    let s = 0;
    for (const p of P) { const re = p.re * p.cr - p.im * p.sr; p.im = p.re * p.sr + p.im * p.cr; p.re = re; p.a *= p.d; s += p.im * p.a; }
    if (x < 0.02) s += h.run(c.noise()) * Math.exp(-x / 0.004) * 0.5;
    return s * rel(x, len, 0.22) * att(x, 0.0015);
  });
}
/** Drawbar organ with a little tremolo and key click. */
const ORGAN_N = 2048;
const organTables = new Map<number, Float32Array>();
/** one cycle of the drawbar mix, band-limited for the highest harmonic that stays under 12 kHz */
function organTable(f: number) {
  const top = [1, 2, 3, 4, 6, 8].filter((h) => h * f < 12000).length;
  let tb = organTables.get(top);
  if (!tb) {
    tb = new Float32Array(ORGAN_N + 1);
    const bars = [[1, 1], [2, 0.7], [3, 0.45], [4, 0.3], [6, 0.18], [8, 0.12]].slice(0, top);
    for (let i = 0; i <= ORGAN_N; i++) { let s = 0; for (const [h, a] of bars) s += Math.sin(TAU * h * i / ORGAN_N) * a; tb[i] = s; }
    organTables.set(top, tb);
  }
  return tb;
}
export function organ(o: Out, t: number, f: number, len: number, g: number, pan = 0) {
  const tb = organTable(f); let ph = 0;
  play(o, t, len + 0.08, g * 0.12, pan, (x) => {
    ph += f / SR; if (ph >= 1) ph -= 1;
    const p = ph * ORGAN_N, i = p | 0, s = tb[i] + (tb[i + 1] - tb[i]) * (p - i);
    return s * (1 + 0.12 * Math.sin(TAU * 6 * x)) * att(x, 0.006) * rel(x, len, 0.03) + (x < 0.004 ? Math.sin(TAU * 3000 * x) * 0.3 : 0);
  });
}
/** Clavinet: narrow pulse through a band-pass with a snappy envelope. */
export function clav(o: Out, t: number, f: number, len: number, g: number, pan = 0) {
  let ph = 0; const fl = new SVF(1400, 0.35);
  play(o, t, len + 0.05, g * 0.35, pan, (x) => {
    ph = wrap(ph + f / SR);
    fl.run(ph < 0.12 ? 1 : -0.14);
    return fl.bp * Math.exp(-x / 0.22) * rel(x, len, 0.015);
  });
}

// ---------------------------------------------------------------- synths & strings
/** Detuned saw stack through a low-pass; optional filter envelope (cutEnv multiplies cutoff at the attack). */
export function supersaw(o: Out, c: Ctx, t: number, f: number, len: number, g: number, pan = 0,
  a = 0.5, r = 0.8, cut = 1600, n = 3, det = 0.12, cutEnv = 0, cutDec = 0.15) {
  const ph = new Float64Array(n), inc = new Float64Array(n);
  for (let k = 0; k < n; k++) { ph[k] = c.rnd(); inc[k] = f * Math.pow(2, ((k - (n - 1) / 2) * det) / 12) / SR; }
  const fl = new SVF(cut, 0.8);
  play(o, t, len + r, g * 0.2 / Math.sqrt(n), pan, (x) => {
    let s = 0;
    for (let k = 0; k < n; k++) { ph[k] += inc[k]; if (ph[k] >= 1) ph[k] -= 1; s += ph[k] * 2 - 1; }
    if (cutEnv) fl.tune(cut * (1 + cutEnv * Math.exp(-x / cutDec)));
    return fl.run(s) * att(x, a) * rel(x, len, r / 3);
  });
}
/** String section: saws with vibrato, soft attack, warm filter. */
export function strings(o: Out, c: Ctx, t: number, f: number, len: number, g: number, pan = 0, a = 0.35, r = 0.5) {
  const n = 3, ph = new Float64Array(n), inc = new Float64Array(n), vr = 4.6 + c.rnd();
  for (let k = 0; k < n; k++) { ph[k] = c.rnd(); inc[k] = f * Math.pow(2, ((k - 1) * 0.09) / 12) / SR; }
  const fl = new SVF(Math.min(2600, f * 6), 0.9);
  play(o, t, len + r, g * 0.16, pan, (x) => {
    const v = 1 + 0.0035 * Math.sin(TAU * vr * x) * Math.min(1, x / 0.4);
    let s = 0;
    for (let k = 0; k < n; k++) { ph[k] += inc[k] * v; if (ph[k] >= 1) ph[k] -= 1; s += ph[k] * 2 - 1; }
    return fl.run(s) * att(x, a) * rel(x, len, r / 3);
  });
}
/** Brass-ish: saws whose filter opens with the swell. */
export function brass(o: Out, c: Ctx, t: number, f: number, len: number, g: number, pan = 0) {
  const ph = [c.rnd(), c.rnd()], inc = [f / SR, f * 1.004 / SR]; const fl = new SVF(400, 0.6);
  play(o, t, len + 0.15, g * 0.2, pan, (x) => {
    ph[0] = wrap(ph[0] + inc[0]); ph[1] = wrap(ph[1] + inc[1]);
    fl.tune(Math.min(f * 8, 300 + 2400 * Math.min(1, x / 0.12)) * (0.8 + 0.2 * Math.sin(TAU * 5 * x)));
    return fl.run(ph[0] + ph[1] - 1) * att(x, 0.05) * rel(x, len, 0.05);
  });
}
/** Karplus-Strong plucked string (guitar, ukulele, harp, pluck synth). sustain ≈ seconds to fade. */
export function ks(o: Out, c: Ctx, t: number, f: number, len: number, g: number, pan = 0, bright = 0.6, sustain = 1.5) {
  const N = Math.max(2, Math.round(SR / f)), line = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += (c.noise() - lp) * (0.12 + bright * 0.88); line[i] = lp; }
  const loss = Math.exp(-1 / (sustain * f)), mix = 0.5 - bright * 0.3;
  let idx = 0;
  play(o, t, Math.min(len + 0.2, sustain * 3), g * 0.55, pan, (x) => {
    const nx = idx + 1 === N ? 0 : idx + 1, a = line[idx];
    line[idx] = (a * (1 - mix) + line[nx] * mix) * loss;
    idx = nx;
    return a * rel(x, len, 0.05);
  });
}
/** Pulse-wave lead with delayed vibrato and an optional glide from a previous pitch. */
export function lead(o: Out, t: number, f: number, len: number, g: number, pan = 0, duty = 0.5, cut = 2600, vib = 0.005, from = 0) {
  let ph = 0; const fl = new SVF(cut, 0.6);
  play(o, t, len + 0.1, g * 0.3, pan, (x) => {
    const fr = (from ? f + (from - f) * Math.exp(-x / 0.03) : f) * (1 + vib * Math.sin(TAU * 5.5 * x) * Math.min(1, Math.max(0, (x - 0.15) / 0.3)));
    ph = wrap(ph + fr / SR);
    return fl.run(ph < duty ? 1 : -1) * att(x, 0.006) * rel(x, len, 0.035);
  });
}
/** Chiptune square (stepped volume, no filter). */
export function chip(o: Out, t: number, f: number, len: number, g: number, pan = 0, duty = 0.25, vib = 0) {
  let ph = 0;
  play(o, t, len + 0.02, g * 0.16, pan, (x) => {
    ph = wrap(ph + f * (1 + vib * Math.sin(TAU * 6 * x) * Math.min(1, x / 0.3)) / SR);
    const e = Math.round(Math.max(0, 1 - x / (len * 4 + 0.2)) * 15) / 15;
    return (ph < duty ? 1 : -1) * e * rel(x, len, 0.01);
  });
}
/** Chiptune triangle bass (4-bit stepped). */
export function chipTri(o: Out, t: number, f: number, len: number, g: number, pan = 0) {
  let ph = 0;
  play(o, t, len + 0.01, g * 0.4, pan, (x) => { ph = wrap(ph + f / SR); return Math.round((1 - 4 * Math.abs(ph - 0.5)) * 8) / 8 * rel(x, len, 0.008); });
}

// ---------------------------------------------------------------- basses
export function sub(o: Out, t: number, f: number, len: number, g: number) {
  play(o, t, len + 0.2, g * 0.45, 0, (x) => Math.sin(TAU * f * x) * Math.min(1, x / 0.02) * rel(x, len, 0.08));
}
/** Round picked bass: sine + triangle with a soft filter blip. */
export function pick(o: Out, t: number, f: number, len: number, g: number) {
  let ph = 0;
  play(o, t, len + 0.08, g * 0.45, 0, (x) => {
    ph = wrap(ph + f / SR);
    return (Math.sin(TAU * ph) * 0.8 + (1 - 4 * Math.abs(ph - 0.5)) * 0.35 * Math.exp(-x / 0.08)) * Math.exp(-x / 1.4) * att(x, 0.003) * rel(x, len, 0.03);
  });
}
/** 808: sine with a pitch punch (or glide from a previous note), long decay, saturated. */
export function bass808(o: Out, t: number, f: number, len: number, g: number, from = 0, decay = 1.2) {
  let ph = 0;
  play(o, t, len + 0.06, g * 0.55, 0, (x) => {
    const fr = from ? f + (from - f) * Math.exp(-x / 0.06) : f * (1 + 1.2 * Math.exp(-x / 0.012));
    ph = wrap(ph + fr / SR);
    return Math.tanh(Math.sin(TAU * ph) * Math.exp(-x / decay) * 2.2) * 0.75 * rel(x, len, 0.03) * att(x, 0.001);
  });
}
/** Reese: two detuned saws + sub through a wobbling low-pass. */
export function reese(o: Out, c: Ctx, t: number, f: number, len: number, g: number, wob = 0.5) {
  const ph = [c.rnd(), c.rnd()]; const fl = new SVF(400, 0.5);
  play(o, t, len + 0.05, g * 0.32, 0, (x) => {
    ph[0] = wrap(ph[0] + f * 0.993 / SR); ph[1] = wrap(ph[1] + f * 1.007 / SR);
    fl.tune(220 + 700 * (0.5 - 0.5 * Math.cos(TAU * wob * x)));
    return (fl.run(ph[0] + ph[1] - 1) + Math.sin(TAU * f * x) * 0.6) * att(x, 0.01) * rel(x, len, 0.03);
  });
}
/** Plucky house/minimal bass: saw + sub with a fast filter envelope. */
export function synthBass(o: Out, t: number, f: number, len: number, g: number, open = 1600) {
  let ph = 0; const fl = new SVF(200, 0.5);
  play(o, t, len + 0.04, g * 0.45, 0, (x) => {
    ph = wrap(ph + f / SR);
    fl.tune(160 + open * Math.exp(-x / 0.07));
    return (fl.run(ph * 2 - 1) * 0.8 + Math.sin(TAU * ph) * 0.5) * att(x, 0.002) * rel(x, len, 0.02);
  });
}
/** Slap-ish funk bass: bright pop on the attack, round body. */
export function slap(o: Out, c: Ctx, t: number, f: number, len: number, g: number) {
  let ph = 0; const fl = new SVF(300, 0.4), pop = new SVF(2400, 0.3);
  play(o, t, len + 0.05, g * 0.45, 0, (x) => {
    ph = wrap(ph + f / SR);
    fl.tune(250 + 2600 * Math.exp(-x / 0.03));
    pop.run(c.noise());
    return (fl.run(ph * 2 - 1) * 0.7 + Math.sin(TAU * ph) * 0.6 + pop.bp * Math.exp(-x / 0.006) * 0.6) * Math.exp(-x / 0.9) * rel(x, len, 0.025);
  });
}

// ---------------------------------------------------------------- drums
export type KickKind = 'punch' | '808' | 'soft' | 'deep' | 'chip';
export function kick(o: Out, t: number, g: number, kind: KickKind = 'punch') {
  const [base, sweep, sd, dec] = kind === '808' ? [45, 75, 0.04, 0.6] : kind === 'soft' ? [55, 60, 0.03, 0.17] : kind === 'deep' ? [42, 95, 0.05, 0.42] : kind === 'chip' ? [50, 200, 0.03, 0.12] : [50, 130, 0.025, 0.26];
  let ph = 0;
  play(o, t, dec * 3, g, 0, (x) => {
    ph = wrap(ph + (base + sweep * Math.exp(-x / sd)) / SR);
    const body = kind === 'chip' ? Math.round((ph < 0.5 ? 1 : -1) * Math.exp(-x / dec) * 8) / 8 * 0.6 : Math.sin(TAU * ph) * Math.exp(-x / dec);
    return Math.tanh(body * (kind === 'soft' ? 1 : 1.6)) + (kind === 'punch' && x < 0.004 ? Math.sin(TAU * 3200 * x) * 0.25 : 0);
  });
}
export function snare(o: Out, c: Ctx, t: number, g: number, decay = 1, tone = 1) {
  const fl = new SVF(4200, 0.6);
  play(o, t, 0.45 * decay, g * 0.55, 0, (x) => {
    fl.run(c.noise());
    return (fl.bp + fl.hp * 0.4) * Math.exp(-x / (0.11 * decay)) + (Math.sin(TAU * 185 * x) * 0.7 + Math.sin(TAU * 330 * x) * 0.3) * Math.exp(-x / 0.05) * tone;
  });
}
export function clap(o: Out, c: Ctx, t: number, g: number, pan = 0) {
  const fl = new SVF(1300, 0.45);
  play(o, t, 0.4, g * 0.7, pan, (x) => {
    const b = x < 0.033 ? Math.exp(-((x % 0.011)) / 0.0035) : Math.exp(-(x - 0.022) / 0.11);
    fl.run(c.noise());
    return fl.bp * b;
  });
}
export function rim(o: Out, c: Ctx, t: number, g: number, pan = 0) {
  const fl = new SVF(1800, 0.3);
  play(o, t, 0.06, g * 0.5, pan, (x) => { fl.run(c.noise()); return (fl.bp * 0.6 + Math.sin(TAU * 520 * x) * 0.7) * Math.exp(-x / 0.009); });
}
export function hat(o: Out, c: Ctx, t: number, g: number, open = false, pan = 0.15) {
  const fl = new SVF(8000, 0.4), d = open ? 0.22 : 0.022;
  play(o, t, d * 5, g * 0.35, pan, (x) => { fl.run(c.noise()); return fl.hp * Math.exp(-x / d); });
}
export function shaker(o: Out, c: Ctx, t: number, g: number, pan = -0.25) {
  const fl = new SVF(6500, 0.5);
  play(o, t, 0.12, g * 0.3, pan, (x) => { fl.run(c.noise()); return fl.bp * att(x, 0.012) * Math.exp(-x / 0.035); });
}
/** tiny high click — minimal techno percussion */
export function tick(o: Out, c: Ctx, t: number, g: number, pan = 0) {
  const fl = new SVF(7000, 0.3);
  play(o, t, 0.02, g * 0.4, pan, (x) => { fl.run(c.noise()); return fl.bp * Math.exp(-x / 0.0025) + Math.sin(TAU * 2700 * x) * Math.exp(-x / 0.004) * 0.4; });
}
export function tom(o: Out, c: Ctx, t: number, f: number, g: number, pan = 0) {
  let ph = 0; const fl = new SVF(900, 0.6);
  play(o, t, 0.9, g * 0.8, pan, (x) => {
    ph = wrap(ph + f * (1 + 0.6 * Math.exp(-x / 0.04)) / SR);
    return Math.sin(TAU * ph) * Math.exp(-x / 0.3) + fl.run(c.noise()) * Math.exp(-x / 0.02) * 0.4;
  });
}
const METAL = [1, 1.342, 1.783, 2.159, 2.71, 3.13];
export function crash(o: Out, c: Ctx, t: number, g: number, len = 2.2, ride = false) {
  const fl = new SVF(ride ? 7000 : 5200, 0.5), b = ride ? 520 : 410, d = ride ? 0.45 : len * 0.42;
  play(o, t, len, g * 0.4, 0.2, (x) => {
    fl.run(c.noise());
    let m = 0; for (const r of METAL) m += Math.sign(Math.sin(TAU * b * r * x));
    return (fl.hp * 0.9 + m * 0.03 * (ride ? 2 : 1)) * Math.exp(-x / d) * att(x, 0.001);
  });
}
/** sample-and-hold noise (NES style): rate sets the "pitch" */
export function chipNoise(o: Out, c: Ctx, t: number, g: number, dec = 0.08, rate = 9000) {
  let v = 0, acc = 0;
  play(o, t, dec * 4, g * 0.3, 0, (x) => { acc += rate / SR; if (acc >= 1) { acc -= 1; v = c.rnd() < 0.5 ? -1 : 1; } return v * Math.round(Math.exp(-x / dec) * 15) / 15; });
}
export function timpani(o: Out, c: Ctx, t: number, f: number, g: number) {
  const fl = new SVF(500, 0.7);
  play(o, t, 2.2, g * 0.7, 0, (x) =>
    (Math.sin(TAU * f * x) + 0.5 * Math.sin(TAU * f * 1.504 * x) * Math.exp(-x / 0.4) + 0.3 * Math.sin(TAU * f * 1.98 * x) * Math.exp(-x / 0.25)) * Math.exp(-x / 0.8) * att(x, 0.002)
    + fl.run(c.noise()) * Math.exp(-x / 0.03) * 0.5);
}
export function taiko(o: Out, c: Ctx, t: number, g: number, pan = 0) {
  let ph = 0; const fl = new SVF(700, 0.6);
  play(o, t, 1.6, g, pan, (x) => {
    ph = wrap(ph + (68 + 70 * Math.exp(-x / 0.03)) / SR);
    return Math.tanh((Math.sin(TAU * ph) * Math.exp(-x / 0.45) + Math.sin(TAU * 190 * x) * Math.exp(-x / 0.06) * 0.3 + fl.run(c.noise()) * Math.exp(-x / 0.04) * 0.8) * 1.4);
  });
}

// ---------------------------------------------------------------- textures & fx
/** filtered noise rising into time t+len (for builds) */
export function noiseRiser(o: Out, c: Ctx, t: number, len: number, g: number) {
  const fl = new SVF(300, 0.4);
  play(o, t, len, g * 0.5, 0, (x) => { const k = x / len; fl.tune(300 + 7000 * k * k); return fl.run(c.noise()) * Math.pow(k, 2.2); });
}
/** sub boom for drops */
export function subBoom(o: Out, c: Ctx, t: number, g: number) {
  let ph = 0; const fl = new SVF(180, 0.6);
  play(o, t, 2.4, g, 0, (x) => { ph = wrap(ph + (34 + 70 * Math.exp(-x / 0.08)) / SR); return Math.sin(TAU * ph) * Math.exp(-x / 0.7) * 0.9 + fl.run(c.noise()) * Math.exp(-x / 0.25) * 0.7; });
}
/** cinematic braam on a root note */
export function braam(o: Out, c: Ctx, t: number, root: number, len: number, g: number) {
  for (const [m, a, p] of [[root - 24, 1, -0.3], [root - 12, 0.8, 0.3], [root - 17, 0.5, 0]] as const) {
    const f = mtof(m), ph = [c.rnd(), c.rnd(), c.rnd()], fl = new SVF(200, 0.7);
    play(o, t, len + 0.6, g * a * 0.25, p, (x) => {
      let s = 0; for (let k = 0; k < 3; k++) { ph[k] = wrap(ph[k] + f * (1 + (k - 1) * 0.006) / SR); s += ph[k] * 2 - 1; }
      fl.tune(150 + 1700 * Math.min(1, x / 0.25) * Math.exp(-x / (len * 0.6)));
      return Math.tanh(fl.run(s) * 2) * att(x, 0.06) * rel(x, len, 0.25);
    });
  }
}
/** vinyl hiss + random crackles over [t, t+len] */
export function crackle(o: Out, c: Ctx, t: number, len: number, g: number) {
  const fl = new SVF(5000, 0.7); let pop = 0;
  play(o, t, len, g, 0, (x) => {
    if (c.rnd() < 9 / SR) pop = (c.rnd() * 0.8 + 0.2) * (c.rnd() < 0.5 ? -1 : 1);
    const v = pop; pop *= 0.82;
    return fl.run(c.noise()) * 0.04 + v * 0.6 * att(x, 0.4);
  });
}
