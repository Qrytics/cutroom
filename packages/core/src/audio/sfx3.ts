// Third sound library + redesigns. Built after an objective audit (scripts/check-sfx.ts) found too many presets that were
// "band-passed noise in a swell" — i.e. whooshes. Everything here is built from distinct mechanisms instead:
// modal resonators (struck wood / metal / glass / bells), formant voices, granular impulse textures, pitched FM/AM,
// and real rhythmic structure. Same contract as the other libraries: pure, seeded through Ctx, peak-normalized.
import type { PropDef } from '../schema/props.ts';
import type { Props } from '../schema/types.ts';
import { att, type Ctx, env, mtof, out, type Out, play, reverbWet, SR, type Stereo, stereo, SVF, TAU } from './dsp.ts';
import * as I from './instruments.ts';
import type { SfxDef } from './synth.ts';

// ---------------------------------------------------------------- helpers
const wrap = (x: number) => x - Math.floor(x);
const sine = (ph: number) => Math.sin(TAU * ph), saw = (ph: number) => 2 * ph - 1, sqr = (ph: number, duty = 0.5) => (ph < duty ? 1 : -1), tri = (ph: number) => 1 - 4 * Math.abs(ph - 0.5);
const fe = (x: number, len: number, a = 0.004, r = 0.02) => att(x, a) * Math.max(0, Math.min(1, (len - x) / r));
const num = (p: Props, k: string, d: number) => (Number.isFinite(Number(p[k])) ? Number(p[k]) : d);
const tk = (p: Props, s = 1) => Math.pow(2, Number(p.tone ?? 0) * s);

function N(st: Stereo, level: number): Stereo {
  let pk = 0; for (const ch of st) for (let i = 0; i < ch.length; i++) pk = Math.max(pk, Math.abs(ch[i]));
  if (pk > 0) for (const ch of st) for (let i = 0; i < ch.length; i++) ch[i] *= level / pk;
  return st;
}
function verb(len: number, wet: number, fn: (o: Out) => void): Stereo {
  const m = stereo(len), s = stereo(len); fn(out(m, s, wet));
  const w = reverbWet(s); for (let c = 0; c < 2; c++) for (let i = 0; i < m[c].length; i++) m[c][i] += w[c][i];
  return m;
}
const dry = (len: number, fn: (o: Out) => void): Stereo => { const m = stereo(len); fn(out(m)); return m; };
/** oscillator with frequency function f(x) and envelope e(x) */
function osc(o: Out, t: number, len: number, g: number, pan: number, f: (x: number) => number, shape: (ph: number) => number = sine, e: (x: number) => number = (x) => env(x, 0.003, len / 3)) {
  let ph = 0; play(o, t, len, g, pan, (x) => { ph = wrap(ph + f(x) / SR); return shape(ph) * e(x); });
}
/** filtered noise voice */
function nz(o: Out, c: Ctx, t: number, len: number, g: number, pan: number, f: (x: number) => number, q: number, e: (x: number) => number, mode: 'bp' | 'lp' | 'hp' = 'bp') {
  const fl = new SVF(f(0), q);
  play(o, t, len, g, pan, (x) => { fl.tune(f(x)); fl.run(c.noise()); return (mode === 'bp' ? fl.bp : mode === 'lp' ? fl.lp : fl.hp) * e(x); });
}
/** a short band-limited noise transient (the "tick" part of a hit) */
const burst = (o: Out, c: Ctx, t: number, g: number, pan: number, f: number, dec = 0.002, q = 0.6) => nz(o, c, t, dec * 8, g, pan, () => f, q, (x) => Math.exp(-x / dec));

type Mode = [ratio: number, amp: number, decay: number];
/** Modal resonator bank: what struck wood, metal, glass and bells actually are — decaying inharmonic partials. */
function modal(o: Out, c: Ctx, t: number, f: number, modes: Mode[], g: number, pan = 0, click = 0.25, clickF = 4000, dmul = 1) {
  const len = Math.min(5, Math.max(...modes.map((m) => m[2])) * dmul * 5 + 0.01);
  const ph = modes.map(() => c.rnd()), detune = modes.map(() => 1 + (c.rnd() - 0.5) * 0.004);
  play(o, t, len, g, pan, (x) => {
    let s = 0; for (let k = 0; k < modes.length; k++) { const [r, a, d] = modes[k]; s += a * Math.sin(TAU * (f * r * detune[k] * x + ph[k])) * Math.exp(-x / (d * dmul)); }
    return s * att(x, 0.0008);
  });
  if (click) burst(o, c, t, g * click, pan, clickF, 0.0015);
}
const WOOD: Mode[] = [[1, 1, 0.05], [2.57, 0.5, 0.025], [4.9, 0.25, 0.012]];
const HOLLOW: Mode[] = [[1, 1, 0.09], [1.58, 0.6, 0.05], [3.1, 0.3, 0.02]];
const METAL: Mode[] = [[1, 1, 0.55], [2.76, 0.6, 0.35], [5.4, 0.4, 0.22], [8.93, 0.25, 0.12]];
const GLASS: Mode[] = [[1, 1, 0.9], [2.32, 0.5, 0.65], [4.25, 0.35, 0.45], [6.63, 0.2, 0.25]];
const BELL: Mode[] = [[0.5, 0.45, 1.8], [1, 1, 1.3], [1.19, 0.55, 1.0], [1.5, 0.35, 0.8], [2, 0.45, 0.7], [2.66, 0.25, 0.45], [3.01, 0.2, 0.35]];
const TUBE: Mode[] = [[1, 1, 1.1], [2.76, 0.45, 0.6], [5.4, 0.25, 0.3]];
const PLASTIC: Mode[] = [[1, 1, 0.012], [1.9, 0.6, 0.008], [3.3, 0.3, 0.005]];
const BALL: Mode[] = [[1, 1, 0.03], [2.2, 0.4, 0.015]];

/** formant voice: saw/noise through three vowel band-passes */
type Vowel = [number, number, number];
const VOWEL: Record<string, Vowel> = { a: [760, 1250, 2700], o: [460, 820, 2700], u: [340, 700, 2400], e: [560, 1750, 2600], i: [300, 2200, 3000] };
function voice(o: Out, c: Ctx, t: number, len: number, g: number, pan: number, f: (x: number) => number, v: (x: number) => Vowel, e: (x: number) => number, breath = 0.15) {
  let ph = c.rnd(); const fs = [0, 1, 2].map((k) => new SVF(v(0)[k], k === 0 ? 0.2 : 0.14)), amp = [1, 0.6, 0.25];
  play(o, t, len, g, pan, (x) => {
    ph = wrap(ph + f(x) / SR); const src = saw(ph) * (1 - breath) + c.noise() * breath; const vv = v(x);
    let s = 0; for (let k = 0; k < 3; k++) { fs[k].tune(vv[k]); fs[k].run(src); s += fs[k].bp * amp[k]; }
    return s * e(x);
  });
}
const lerpV = (a: Vowel, b: Vowel, k: number): Vowel => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** 8-bit square voice, quantized to 4 bits */
function chip(o: Out, t: number, len: number, g: number, pan: number, f: (x: number) => number, duty = 0.5, e: (x: number) => number = (x) => fe(x, len, 0.002, 0.01)) {
  let ph = 0; play(o, t, len, g, pan, (x) => { ph = wrap(ph + f(x) / SR); return Math.round(sqr(ph, duty) * e(x) * 7) / 7; });
}
function chipNoise(o: Out, c: Ctx, t: number, len: number, g: number, rate: (x: number) => number, e: (x: number) => number) {
  let v = 0, acc = 0; play(o, t, len, g, 0, (x) => { acc += rate(x) / SR; if (acc >= 1) { acc -= 1; v = c.rnd() < 0.5 ? -1 : 1; } return Math.round(v * e(x) * 7) / 7; });
}

const P = (key: string, label: string, def: number, min: number, max: number, step: number): PropDef => ({ key, label, type: 'number', group: 'Sound', default: def, min, max, step });
const pitchProp = P('pitch', 'Pitch (semitones)', 0, -24, 24, 0.5), variationProp = P('variation', 'Variation seed', 0, 0, 999, 1);
const toneProp = P('tone', 'Tone (dark ↔ bright)', 0, -1, 1, 0.05);
const d = (key: string, label: string, category: SfxDef['category'], description: string, defaultDuration: number, stretch: boolean, level: number,
  fn: (c: Ctx, len: number, p: Props) => Stereo, props: PropDef[] = []): SfxDef =>
  ({ key, label, category, description, defaultDuration, stretch, props: [pitchProp, variationProp, ...props], synth: (c, len, p) => N(fn(c, len, p), level) });

// ---------------------------------------------------------------- redesigns (same keys + props, new sound)
const rs = (c: Ctx) => 1 + (c.rnd() - 0.5) * 0.04; // tiny humanizing pitch spread

export const SFX_REDESIGNS: Record<string, Pick<SfxDef, 'synth'> & Partial<Pick<SfxDef, 'description' | 'category'>>> = {
  // a quick air *cut*: very fast bright sweep with a fluttering edge — short, crisp, unlike the long whoosh swell
  swish: { description: 'Quick, crisp air cut with a fluttering edge — small moves and pop-ins.', synth: (c, len) => N(dry(len, (o) => {
    const L = Math.min(len, 0.45), j = rs(c);
    [-0.6, 0.6].forEach((pan, i) => nz(o, c, i * 0.012, L, 0.9, pan, (x) => (1400 + 9000 * Math.min(1, x / (L * 0.35))) * j, 0.3,
      (x) => Math.exp(-Math.max(0, x - L * 0.12) / (L * 0.18)) * att(x, 0.012) * (0.75 + 0.25 * Math.sin(TAU * 38 * x)), 'hp'));
    osc(o, 0, L * 0.6, 0.12, 0, (x) => 2400 * j + 3000 * x / L, tri, (x) => Math.exp(-x / (L * 0.12)) * att(x, 0.004));
  }), 0.8) },
  // the short riser is a *drum* build: accelerating snare roll + a rising saw stab — rhythm, not noise
  riserShort: { description: 'One-second snare-roll build with a rising synth that snaps at the clip end.', synth: (c, len, p) => N(verb(len, 0.2, (o) => {
    const T = tk(p, 0.5), I0 = num(p, 'intensity', 1);
    for (let t = 0, gap = 0.12; t < len - 0.02; t += gap, gap = Math.max(0.022, gap * 0.86)) I.snare(o, c, t, 0.25 + 0.6 * (t / len) ** 1.5, 0.5, 1.2 * T);
    osc(o, 0, len, 0.3 * I0, 0, (x) => 220 * T * Math.pow(2, 1.5 * x / len), saw, (x) => (x / len) ** 2 * fe(x, len, 0.01, 0.006));
    I.kick(o, Math.max(0, len - 0.012), 0.6, 'punch');
  }), 0.8) },
  // a reversed *chord* blooming backwards into the cut (pre-verb) — tonal, unlike the noise risers
  swooshReverse: { description: 'Reversed chord + air blooming backwards into the clip end — lands on the cut.', synth: (c, len, p) => {
    const st = verb(len, 0.55, (o) => { const T = tk(p, 0.4); [48, 55, 60, 64, 67].forEach((m, i) => I.epiano(o, 0.02 + i * 0.004, mtof(m + 12) * T, len * 0.4, 0.5, (i - 2) * 0.3)); nz(o, c, 0, len * 0.3, 0.25, 0, () => 3000 * T, 0.5, (x) => Math.exp(-x / 0.12)); });
    for (const ch of st) ch.reverse();
    const n = st[0].length; for (const ch of st) for (let i = 0; i < 300 && i < n; i++) ch[n - 1 - i] *= i / 300;
    return N(st, 0.75);
  } },
  // a mallet-rolled cymbal: you hear the individual strokes speeding up into the swell
  cymbalSwell: { description: 'Mallet-rolled cymbal: strokes speed up and swell into the clip end.', synth: (c, len) => N(dry(len, (o) => {
    for (let t = 0, gap = 0.11; t < len - 0.01; t += gap, gap = Math.max(0.035, gap * 0.95)) {
      const k = t / len; modal(o, c, t, 420 + c.rnd() * 40, METAL.map(([r, a, dd]) => [r * 1.31, a, dd * 0.5] as Mode), 0.15 + 0.85 * k * k, (c.rnd() - 0.5) * 0.8, 0.05, 6000);
      nz(o, c, t, 0.25, 0.25 * k * k, 0, () => 7500, 0.4, (x) => Math.exp(-x / 0.08), 'hp');
    }
  }), 0.7) },
  key: { description: 'Single keyboard key: press clack + release click.', synth: (c) => N(dry(0.12, (o) => {
    const f = 2600 * rs(c); modal(o, c, 0, f, PLASTIC, 0.8, 0, 0.6, 5000); osc(o, 0, 0.03, 0.4, 0, () => 420 * rs(c), sine, (x) => Math.exp(-x / 0.008));
    modal(o, c, 0.065 + c.rnd() * 0.02, f * 1.3, PLASTIC, 0.35, 0, 0.3, 6000);
  }), 0.6) },
  hitHeavy: { description: 'Heavy mid-range body thwack with a sharp crack — fights, hard landings.', synth: (c, _l, p) => N(verb(0.9, 0.15, (o) => {
    const T = tk(p, 0.5); osc(o, 0, 0.3, 0.55, 0, (x) => (105 + 260 * Math.exp(-x / 0.012)) * T, (ph) => Math.tanh(sine(ph) * 4), (x) => Math.exp(-x / 0.07) * att(x, 0.0008));
    nz(o, c, 0, 0.4, 0.9, 0, (x) => (2600 - 2000 * Math.min(1, x / 0.05)) * T, 0.35, (x) => Math.exp(-x / 0.05) * att(x, 0.0006));
    burst(o, c, 0, 0.9, 0, 3200 * T, 0.004, 0.4); nz(o, c, 0, 0.35, 0.6, 0, () => 520 * T, 0.5, (x) => Math.exp(-x / 0.07)); modal(o, c, 0.01, 420 * T, HOLLOW, 0.3, 0, 0);
  }), 0.9) },
  kick: { description: 'Single deep cinematic kick: soft beater click and a long, low sub tail.', synth: (c, _l, p) => N(dry(0.8, (o) => {
    const T = tk(p, 0.3), D = Math.max(0.2, num(p, 'decay', 1)); osc(o, 0, 1.2, 1, 0, (x) => (36 + 150 * Math.exp(-x / 0.03)) * T, sine, (x) => Math.exp(-x / (0.45 * D)) * att(x, 0.0005));
    burst(o, c, 0, 0.6, 0, 5000, 0.0015, 0.4); nz(o, c, 0, 0.08, 0.3, 0, () => 900, 0.6, (x) => Math.exp(-x / 0.015));
  }), 0.9) },
  boom: { description: 'Big cinematic boom: sub impact, low metal body, rolling debris and a long hall tail.', synth: (c, len, p) => N(verb(len, 0.45, (o) => {
    const T = tk(p, 0.5), D = Math.max(0.2, num(p, 'decay', 1));
    osc(o, 0, Math.min(len, 2.2), 1, 0, (x) => (32 + 70 * Math.exp(-x / 0.06)) * T, sine, (x) => Math.exp(-x / (0.6 * D)) * att(x, 0.002));
    modal(o, c, 0, 62 * T, [[1, 1, 0.5], [1.48, 0.6, 0.35], [2.3, 0.4, 0.25], [3.9, 0.2, 0.15]], 0.45, 0, 0.5, 900, D);
    nz(o, c, 0, Math.min(len, 1.6), 0.5, 0, (x) => 300 + 300 * Math.exp(-x / 0.2), 0.6, (x) => Math.exp(-x / (0.35 * D)) * (0.6 + 0.4 * Math.sin(TAU * 9 * x)), 'lp');
    for (let t = 0.15; t < Math.min(len, 1.4); t += 0.03 + c.rnd() * 0.09) modal(o, c, t, 300 + c.rnd() * 900, WOOD, 0.08 * (1.4 - t), c.rnd() * 2 - 1, 0.2, 2500);
  }), 0.9) },
  thump: { description: 'Cardboard box dropped on the floor: hollow papery thump with a short rattle.', synth: (c) => N(dry(0.5, (o) => {
    modal(o, c, 0, 145 * rs(c), [[1, 1, 0.05], [2.05, 0.6, 0.03], [3.4, 0.3, 0.015]], 0.9, 0, 0.3, 1500);
    nz(o, c, 0.005, 0.12, 0.4, 0, () => 2000, 0.4, (x) => Math.exp(-x / 0.02));
    for (let i = 0; i < 3; i++) modal(o, c, 0.05 + i * 0.03, 500 + c.rnd() * 300, PLASTIC, 0.15, c.rnd() - 0.5, 0);
  }), 0.75) },
  thud: { description: 'Soft low landing: a muffled body falling on carpet — no click, all cushion.', synth: (c, _l, p) => N(dry(0.7, (o) => {
    const T = tk(p, 0.6), D = Math.max(0.2, num(p, 'decay', 1)); nz(o, c, 0, 0.5 * D, 1, 0, () => 180 * T, 0.7, (x) => att(x, 0.006) * Math.exp(-x / (0.07 * D)), 'lp');
    modal(o, c, 0.003, 85 * T, [[1, 1, 0.07 * D], [1.6, 0.4, 0.04 * D]], 0.7, 0, 0); nz(o, c, 0.01, 0.15, 0.15, 0, () => 900, 0.5, (x) => Math.exp(-x / 0.03)); // cloth
  }), 0.8) },
  success: { description: 'Task complete: three quick bell notes landing on a warm major chord.', synth: (c) => N(verb(1.2, 0.3, (o) => {
    [72, 79, 84].forEach((m, k) => I.bell(o, k * 0.08, mtof(m) * rs(c), 0.4, 0.8, k - 1, 1.41, 0.2));
    [72, 76, 79, 84].forEach((m) => I.epiano(o, 0.24, mtof(m), 0.5, 0.35, 0));
  }), 0.7) },
  doorClose: { description: 'Door slammed shut: heavy wooden boom, metal latch click and frame rattle.', synth: (c) => N(verb(0.9, 0.22, (o) => {
    modal(o, c, 0, 105 * rs(c), [[1, 1, 0.12], [1.73, 0.5, 0.08], [2.9, 0.3, 0.04]], 1, 0, 0.3, 1200); nz(o, c, 0, 0.2, 0.6, 0, () => 400, 0.6, (x) => Math.exp(-x / 0.04), 'lp');
    modal(o, c, 0.035, 2400 * rs(c), METAL.map(([r, a, dd]) => [r, a, dd * 0.12] as Mode), 0.8, 0.3, 0.7, 5000);
    modal(o, c, 0.06, 1900 * rs(c), METAL.map(([r, a, dd]) => [r, a, dd * 0.08] as Mode), 0.5, 0.3, 0.4, 5000);
    for (let i = 0; i < 9; i++) modal(o, c, 0.09 + i * 0.022 + c.rnd() * 0.01, 600 + c.rnd() * 900, PLASTIC, 0.2 * (1 - i / 9), (c.rnd() - 0.5), 0);
  }), 0.8) },
  notificationSoft: { description: 'Gentle two-note wooden marimba — soft notification.', synth: (c) => N(verb(0.8, 0.15, (o) => {
    [[67, 0], [72, 0.12]].forEach(([m, t]) => modal(o, c, t, mtof(m), [[1, 1, 0.25], [4, 0.35, 0.03], [9.9, 0.1, 0.01]], 0.8, 0, 0.15, 2000));
  }), 0.55) },
  kalimba: { description: 'Three-note thumb piano: buzzy metal tines, warm and playful.', synth: (c, _l, p) => N(verb(1.4, 0.25, (o) => {
    const tr = num(p, 'transpose', 0); [[69, 0], [72, 0.1], [76, 0.2], [74, 0.3], [72, 0.4]].forEach(([m, t]) => {
      const f = mtof(m + tr) * rs(c); modal(o, c, t, f, [[1, 1, 0.55], [5.4, 0.3, 0.06], [8.8, 0.15, 0.03]], 0.7, (c.rnd() - 0.5) * 0.4, 0.2, 3000);
      osc(o, t, 0.4, 0.08, 0, () => f * 2, (ph) => sine(ph) * (0.5 + 0.5 * sqr(wrap(ph * 0.018))), (x) => Math.exp(-x / 0.12)); // tine buzz
    });
  }), 0.6) },
  receiveMessage: { description: 'Water-drop "bloop" into a glassy ping — incoming chat message.', synth: (c) => N(verb(0.6, 0.2, (o) => {
    osc(o, 0, 0.09, 0.6, 0, (x) => 500 + 1100 * x / 0.09, sine, (x) => Math.sin(Math.PI * x / 0.09)); modal(o, c, 0.08, 1760 * rs(c), GLASS, 0.35, 0.2, 0.1);
  }), 0.6) },
  chime: { description: 'Wind-chime cluster: several metal tubes ringing out — reveals, magic moments.', synth: (c) => N(verb(2, 0.3, (o) => {
    const notes = [84, 86, 88, 91, 93]; for (let i = 0; i < 5; i++) modal(o, c, i * (0.05 + c.rnd() * 0.06), mtof(notes[Math.floor(c.rnd() * 5)]), TUBE, 0.45, (c.rnd() - 0.5) * 1.4, 0.15, 6000);
  }), 0.7) },
  ding: { description: 'Clean single bell ding: a pure, singing tone with a soft strike and a long ring.', synth: (c) => N(verb(2, 0.2, (o) => modal(o, c, 0, 1320 * rs(c), [[1, 1, 1.1], [1.002, 0.5, 1.1], [2.0, 0.18, 0.5], [3.0, 0.06, 0.25]], 0.9, 0, 0.04, 3000)), 0.7) },
  stomp: { description: 'Foot stomp on a wooden floor: heel crack, floorboard boom and a rattle.', synth: (c) => N(verb(0.7, 0.18, (o) => {
    osc(o, 0, 0.4, 1, 0, (x) => 50 + 60 * Math.exp(-x / 0.02), sine, (x) => Math.exp(-x / 0.08)); modal(o, c, 0, 180 * rs(c), WOOD.map(([r, a, dd]) => [r, a, dd * 2] as Mode), 0.6, 0, 0.4, 2500);
    osc(o, 0.12, 0.3, 0.18, 0.2, (x) => 330 - 60 * x / 0.3, (ph) => saw(ph) * (0.6 + 0.4 * sqr(wrap(ph * 0.05))), (x) => Math.sin(Math.PI * x / 0.3)); // floorboard creak
    for (let i = 0; i < 4; i++) modal(o, c, 0.06 + i * 0.025 + c.rnd() * 0.01, 900 + c.rnd() * 600, PLASTIC, 0.12, (c.rnd() - 0.5), 0, 0);
  }), 0.8) },
  cut: { description: 'Hard-cut punctuation: a tight high "tk" and a short sub bump, bone dry.', synth: (c, _l, p) => N(dry(0.18, (o) => {
    burst(o, c, 0, 1, 0, 5000 * tk(p, 0.5), 0.0012, 0.5); osc(o, 0, 0.12, 0.7, 0, () => 46 * tk(p, 0.3), sine, (x) => Math.sin(Math.PI * Math.min(1, x / 0.06)) * Math.exp(-x / 0.05));
  }), 0.85) },
  splat: { description: 'Wet splat: squelchy hit, gloopy formant and a few drips after.', synth: (c) => N(verb(0.8, 0.12, (o) => {
    nz(o, c, 0, 0.12, 0.8, 0, () => 1200, 0.5, (x) => Math.exp(-x / 0.03), 'lp');
    voice(o, c, 0, 0.18, 0.5, 0, (x) => 160 - 80 * x / 0.18, (x) => lerpV(VOWEL.u, VOWEL.a, Math.min(1, x / 0.1)), (x) => Math.exp(-x / 0.06) * att(x, 0.003), 0.4);
    for (let i = 0; i < 3; i++) { const t = 0.22 + i * 0.13 + c.rnd() * 0.05; osc(o, t, 0.06, 0.25, (c.rnd() - 0.5), (x) => 700 + 1400 * x / 0.06, sine, (x) => Math.sin(Math.PI * x / 0.06)); }
  }), 0.75) },
  tap: { description: 'Soft finger tap on glass: low "thup" with a faint glassy ring.', synth: (c, _l, p) => N(dry(0.12, (o) => {
    osc(o, 0, 0.06, 1, 0, () => 230 * tk(p, 0.4) * rs(c), sine, (x) => Math.exp(-x / 0.014) * att(x, 0.0006)); modal(o, c, 0, 3300 * rs(c), [[1, 1, 0.02], [2.3, 0.5, 0.012]], 0.12, 0, 0);
  }), 0.5) },
  rain: { description: 'Rain: hundreds of individual pitched droplets plinking on surfaces over a soft bed.', synth: (c, len) => N(dry(len, (o) => {
    nz(o, c, 0, len, 0.12, 0, () => 1800, 0.7, (x) => fe(x, len, 0.4, 0.4), 'lp');
    for (let t = c.rnd() * 0.01; t < len - 0.03; t += 0.004 + c.rnd() * 0.02) {
      const f = 2200 + c.rnd() * 4500, v = 0.05 + c.rnd() ** 3 * 0.5;
      osc(o, t, 0.02, v, c.rnd() * 2 - 1, (x) => f * (1 - 0.35 * x / 0.02), sine, (x) => Math.exp(-x / 0.004) * att(x, 0.0004));
      if (c.rnd() < 0.03) osc(o, t, 0.08, v * 0.8, c.rnd() * 2 - 1, (x) => 450 + 500 * x / 0.08, sine, (x) => Math.sin(Math.PI * x / 0.08)); // bigger drop "plop"
    }
  }), 0.6) },
  applause: { description: 'Audience applause: dozens of individual clappers, each with their own rhythm, swelling in and out.', synth: (c, len, p) => N(verb(len, 0.2, (o) => crowdClap(o, c, len, Math.round(18 + 22 * num(p, 'intensity', 1)), 'swell')), 0.7) },
  clapping: { description: 'A few people clapping steadily — individual claps you can count.', synth: (c, len, p) => N(verb(len, 0.12, (o) => crowdClap(o, c, len, Math.round(3 + 3 * num(p, 'intensity', 1)), 'steady')), 0.65) },
  clap: { description: 'Single sharp hand clap: three micro-bursts and a short room.', synth: (c) => N(verb(0.4, 0.2, (o) => handClap(o, c, 0, 1, 0, 1300 * rs(c))), 0.8) },
  rewind: { description: 'Tape rewind: garbled backwards chatter sliding DOWN in pitch with a motor whine.', synth: (c, len) => N(dry(len, (o) => tapeChatter(o, c, len, -1)), 0.7) },
  fastForward: { description: 'Fast-forward: chipmunk chatter racing UP in pitch with a rising motor whine.', synth: (c, len) => N(dry(len, (o) => tapeChatter(o, c, len, 1)), 0.7) },
  vinylScratch: { description: 'DJ scratch: a tonal sample scrubbed back and forth under the needle.', synth: (c, len) => N(dry(len, (o) => {
    let pos = 0; const rate = (x: number) => 2.2 * Math.sin(TAU * (3 + c.rnd() * 0.0) * x) * (1 + 0.5 * Math.sin(TAU * 0.7 * x)); const fl = new SVF(2500, 0.5);
    play(o, 0, len, 0.9, 0, (x) => { pos += rate(x) / SR; const s = saw(wrap(pos * 220)) + 0.6 * saw(wrap(pos * 277)) + 0.4 * c.noise() * 0.2; fl.run(s); return fl.lp * Math.min(1, Math.abs(rate(x)) * 1.5) * fe(x, len); });
  }), 0.8) },
  bloop: { description: 'Round, wobbly falling bloop — dismiss / disappear.', synth: (c) => N(dry(0.3, (o) => osc(o, 0, 0.3, 0.8, 0, (x) => (520 - 340 * Math.min(1, x / 0.22)) * (1 + 0.05 * Math.sin(TAU * 22 * x)) * rs(c), sine, (x) => Math.sin(Math.PI * Math.min(1, x / 0.3)) ** 0.7)), 0.6) },
  dropdown: { description: 'Click and a short tonal falling blip — menu opens.', synth: (c) => N(dry(0.18, (o) => {
    burst(o, c, 0, 0.6, 0, 5500, 0.001); osc(o, 0.015, 0.11, 0.6, 0, (x) => 1250 - 650 * x / 0.11, tri, (x) => fe(x, 0.11, 0.003, 0.03));
  }), 0.5) },
  honk: { description: 'Squeeze-bulb bike horn: reedy, buzzy honks (count = honks).', synth: (c, _l, p) => N(dry(0.9, (o) => {
    const n = Math.max(1, Math.min(3, Math.round(num(p, 'count', 2)))), T = tk(p, 0.4);
    for (let i = 0; i < n; i++) voice(o, c, i * 0.28, 0.22, 0.8, 0, (x) => (330 + 40 * Math.min(1, x / 0.03)) * T, () => VOWEL.a, (x) => fe(x, 0.22, 0.01, 0.04), 0.05);
  }), 0.7) },
  windGust: { description: 'One gust of wind: a whistling resonance swells and leaves rattle at the peak.', synth: (c) => N(dry(2.5, (o) => {
    [-0.5, 0.5].forEach((pan) => nz(o, c, 0, 2.5, 0.45, pan, (x) => 650 + 900 * Math.sin(Math.PI * x / 2.5) + 60 * Math.sin(TAU * 3 * x), 0.06, (x) => Math.sin(Math.PI * x / 2.5) ** 2));
    for (let t = 0.8; t < 1.8; t += 0.006 + c.rnd() * 0.02) modal(o, c, t, 1800 + c.rnd() * 2500, [[1, 1, 0.006]], 0.06 * Math.sin(Math.PI * (t - 0.8)), c.rnd() * 2 - 1, 0, 0);
  }), 0.6) },
  crowdCheer: { description: 'Cheering crowd: voices whooping "yeah!", whistles and claps that swell in.', synth: (c, len) => N(verb(len, 0.25, (o) => {
    for (let i = 0; i < 16; i++) {
      const t = c.rnd() * Math.max(0.1, len - 1.2), L = 0.4 + c.rnd() * 0.7, f0 = 170 + c.rnd() * 230, v0 = [VOWEL.e, VOWEL.a, VOWEL.o][i % 3];
      voice(o, c, t, L, 0.22, c.rnd() * 1.6 - 0.8, (x) => f0 * (1 + 0.45 * Math.sin(Math.PI * x / L)) * (1 + 0.02 * Math.sin(TAU * 6 * x)), (x) => lerpV(v0, VOWEL.a, x / L), (x) => Math.sin(Math.PI * x / L) * att(x, 0.03) * Math.min(1, (len - t - x) / 0.5), 0.25);
    }
    for (let t = 0.3; t < len - 0.8; t += 0.7 + c.rnd() * 1.3) { const f0 = 2200 + c.rnd() * 900, L = 0.35 + c.rnd() * 0.3; osc(o, t, L, 0.12, c.rnd() - 0.5, (x) => f0 * (1 + 0.25 * Math.sin(Math.PI * x / L)), sine, (x) => Math.sin(Math.PI * x / L)); }
    crowdClap(o, c, len, 10, 'swell', 0.5);
  }), 0.7) },
};

/** one hand clap: three micro-bursts (palms meeting) then a short body */
function handClap(o: Out, c: Ctx, t: number, g: number, pan: number, f: number) {
  for (let k = 0; k < 3; k++) nz(o, c, t + k * 0.008, 0.012, g * (1 - k * 0.15), pan, () => f * (1 + k * 0.05), 0.35, (x) => Math.exp(-x / 0.0018));
  nz(o, c, t + 0.022, 0.12, g * 0.7, pan, () => f * 0.9, 0.45, (x) => Math.exp(-x / 0.03));
}
/** many individual clappers: each has its own tempo, timbre and position */
function crowdClap(o: Out, c: Ctx, len: number, people: number, shape: 'swell' | 'steady', g = 1) {
  for (let p = 0; p < people; p++) {
    const rate = 3.5 + c.rnd() * 3, f = 900 + c.rnd() * 1400, pan = c.rnd() * 1.8 - 0.9, g0 = 0.35 + c.rnd() * 0.65;
    for (let t = c.rnd() / rate; t < len - 0.1; t += (1 / rate) * (0.92 + c.rnd() * 0.16)) {
      const k = t / len, sw = shape === 'swell' ? Math.min(1, k / 0.15) * Math.min(1, (1 - k) / 0.35) : Math.min(1, t / 0.2) * Math.min(1, (len - t) / 0.3);
      handClap(o, c, t, g * g0 * sw / Math.sqrt(people) * 1.6, pan, f);
    }
  }
}
/** garbled tape chatter: formant "speech" with fast random syllables, pitch sliding up (dir 1) or down (-1) */
function tapeChatter(o: Out, c: Ctx, len: number, dir: number) {
  const base = dir > 0 ? 300 : 260, pitch = (x: number) => base * Math.pow(2, dir * 1.6 * x / len);
  const sylls: { t: number; v: Vowel }[] = []; for (let t = 0; t < len; t += 0.03 + c.rnd() * 0.04) sylls.push({ t, v: [VOWEL.a, VOWEL.e, VOWEL.i, VOWEL.o, VOWEL.u][Math.floor(c.rnd() * 5)] });
  let si = 0;
  voice(o, c, 0, len, 0.7, 0, (x) => pitch(x) * (1 + 0.15 * Math.sin(TAU * 13 * x)), (x) => { while (si < sylls.length - 1 && sylls[si + 1].t <= x) si++; return sylls[si].v; },
    (x) => fe(x, len, 0.02, 0.04) * (0.55 + 0.45 * Math.abs(Math.sin(TAU * 11 * x))), 0.2);
  osc(o, 0, len, 0.12, 0, (x) => pitch(x) * 4, sine, (x) => fe(x, len, 0.05, 0.05));
}

// ---------------------------------------------------------------- new presets
const countProp = (def: number, max = 8) => P('count', 'Count', def, 1, max, 1);
const bpmProp = (def: number) => P('bpm', 'Tempo (bpm)', def, 20, 240, 1);

export const MORE3_SFX: SfxDef[] = [
  // ---- foley / household
  d('bottlePop', 'Bottle pop', 'Foley', 'Cork popping out of a bottle: sharp pop, hollow body ring and a little fizz.', 0.9, false, 0.8, (c) => verb(0.9, 0.12, (o) => {
    osc(o, 0, 0.05, 1, 0, (x) => 900 - 500 * x / 0.05, sine, (x) => Math.exp(-x / 0.01) * att(x, 0.0005)); burst(o, c, 0, 0.6, 0, 3000, 0.001);
    modal(o, c, 0.004, 310 * rs(c), [[1, 1, 0.08], [2.1, 0.3, 0.04]], 0.5, 0, 0);
    for (let t = 0.08; t < 0.85; t += 0.005 + c.rnd() * 0.02) modal(o, c, t, 5000 + c.rnd() * 4000, [[1, 1, 0.002]], 0.05 * (1 - t), c.rnd() * 2 - 1, 0, 0);
  })),
  d('canOpen', 'Can open', 'Foley', 'Soda can tab: metal crack, pressurized hiss, tiny tab ping.', 0.9, false, 0.75, (c) => dry(0.9, (o) => {
    modal(o, c, 0, 2100 * rs(c), METAL.map(([r, a, dd]) => [r, a, dd * 0.08] as Mode), 0.7, 0, 0.6, 3500);
    nz(o, c, 0.01, 0.8, 0.45, 0, (x) => 6000 - 2500 * x / 0.8, 0.5, (x) => Math.exp(-x / 0.25) * att(x, 0.005), 'hp');
    modal(o, c, 0.03, 4800 * rs(c), [[1, 1, 0.08]], 0.15, 0.3, 0);
  })),
  d('keysJingle', 'Keys jingle', 'Foley', 'A bunch of keys jingling: many small bright metal strikes.', 0.9, true, 0.65, (c, len) => dry(len, (o) => {
    for (let t = 0; t < len - 0.05; t += 0.01 + c.rnd() * 0.05) modal(o, c, t, 2500 + c.rnd() * 3500, [[1, 1, 0.12], [2.7, 0.4, 0.06]], 0.2 + c.rnd() * 0.3, c.rnd() * 1.6 - 0.8, 0.1, 7000);
  })),
  d('velcro', 'Velcro', 'Foley', 'Velcro ripping open: dense crackle of tiny tearing hooks.', 0.8, true, 0.7, (c, len) => dry(len, (o) => {
    for (let t = 0; t < len - 0.01; t += 0.0012 + c.rnd() * 0.003) burst(o, c, t, 0.15 + 0.3 * c.rnd() * Math.sin(Math.PI * t / len), (c.rnd() - 0.5) * 0.4, 2500 + c.rnd() * 3000, 0.0006, 0.5);
  })),
  d('bubbleWrap', 'Bubble wrap', 'Foley', 'Bubble-wrap pops one by one — sharp little snaps.', 1.5, true, 0.75, (c, len) => dry(len, (o) => {
    for (let t = 0.02; t < len - 0.05; t += 0.06 + c.rnd() * 0.22) { osc(o, t, 0.03, 0.8, c.rnd() - 0.5, (x) => 1200 - 600 * x / 0.03, sine, (x) => Math.exp(-x / 0.004)); burst(o, c, t, 0.7, 0, 3000, 0.0008); }
  })),
  d('carriageReturn', 'Typewriter return', 'Foley', 'Typewriter carriage return: ratchet clicks, slide and the bell.', 1.2, false, 0.75, (c) => verb(1.2, 0.12, (o) => {
    for (let i = 0, t = 0; i < 9; i++, t += 0.035 - i * 0.002) modal(o, c, t, 1900 + c.rnd() * 200, PLASTIC, 0.35, 0, 0.3, 4500);
    nz(o, c, 0.3, 0.35, 0.3, 0, () => 1400, 0.6, (x) => Math.sin(Math.PI * x / 0.35));
    modal(o, c, 0.62, 2700, BELL.map(([r, a, dd]) => [r, a, dd * 0.4] as Mode), 0.5, 0.3, 0.2);
  })),
  d('mechSwitch', 'Mechanical switch', 'Foley', 'Clicky mechanical switch: two-stage click with a springy ping.', 0.15, false, 0.6, (c) => dry(0.15, (o) => {
    modal(o, c, 0, 3500, PLASTIC, 0.7, 0, 0.6, 7000); modal(o, c, 0.018, 4800, [[1, 1, 0.025]], 0.25, 0, 0.3, 8000);
  })),
  d('penClick', 'Pen click', 'Foley', 'Ballpoint pen click: tiny plastic down-click and spring return.', 0.2, false, 0.5, (c) => dry(0.2, (o) => {
    modal(o, c, 0, 4100 * rs(c), PLASTIC, 0.6, 0, 0.4, 8000); modal(o, c, 0.09, 3300 * rs(c), PLASTIC, 0.35, 0, 0.2, 7000);
  })),
  d('stapler', 'Stapler', 'Foley', 'Stapler crunch: spring squeak, metal clank and desk thud.', 0.4, false, 0.75, (c) => dry(0.4, (o) => {
    osc(o, 0, 0.05, 0.15, 0, (x) => 2800 + 800 * x / 0.05, sine, (x) => Math.sin(Math.PI * x / 0.05)); modal(o, c, 0.05, 1500, METAL.map(([r, a, dd]) => [r, a, dd * 0.12] as Mode), 0.8, 0, 0.7, 4000);
    osc(o, 0.05, 0.12, 0.6, 0, () => 120, sine, (x) => Math.exp(-x / 0.03));
  })),
  d('scissors', 'Scissors', 'Foley', 'Two scissor snips: metallic slide and snap.', 0.6, false, 0.65, (c) => dry(0.6, (o) => {
    [0, 0.28].forEach((t) => { nz(o, c, t, 0.12, 0.25, 0, (x) => 3500 + 3000 * x / 0.12, 0.4, (x) => Math.sin(Math.PI * x / 0.12), 'hp'); modal(o, c, t + 0.12, 3900 * rs(c), [[1, 1, 0.05], [2.4, 0.5, 0.03]], 0.6, 0, 0.5, 7000); });
  })),
  d('glassClink', 'Glass clink (cheers)', 'Foley', 'Two glasses clinking — bright crystalline ring with beating.', 2, false, 0.7, (c) => verb(2, 0.2, (o) => {
    modal(o, c, 0, 1650 * rs(c), GLASS, 0.6, -0.3, 0.2, 7000); modal(o, c, 0.006, 1720 * rs(c), GLASS, 0.5, 0.3, 0.15, 7000);
  })),
  d('iceCubes', 'Ice cubes', 'Foley', 'Ice cubes dropped into a glass: clinks, rattle and the glass ring.', 1.2, false, 0.7, (c) => verb(1.2, 0.15, (o) => {
    for (let i = 0, t = 0; i < 7; i++, t += 0.03 + c.rnd() * 0.08) { modal(o, c, t, 2400 + c.rnd() * 1800, [[1, 1, 0.04], [2.6, 0.4, 0.02]], 0.5 - i * 0.05, c.rnd() - 0.5, 0.4, 6000); }
    modal(o, c, 0, 1300, GLASS, 0.25, 0, 0);
  })),
  d('sizzle', 'Sizzle', 'Foley', 'Frying-pan sizzle: steady hiss with crackling oil pops (fills the clip).', 4, true, 0.6, (c, len) => dry(len, (o) => {
    nz(o, c, 0, len, 0.08, 0, () => 7000, 0.5, (x) => fe(x, len, 0.2, 0.3) * (0.8 + 0.2 * Math.sin(TAU * 0.7 * x)), 'hp');
    for (let t = 0; t < len - 0.02; t += 0.004 + c.rnd() * 0.03) burst(o, c, t, 0.1 + c.rnd() ** 3 * 0.5, c.rnd() * 1.6 - 0.8, 2000 + c.rnd() * 5000, 0.0009);
    for (let t = 0.1; t < len - 0.05; t += 0.12 + c.rnd() * 0.35) { osc(o, t, 0.02, 1, c.rnd() * 1.6 - 0.8, (x) => 1600 - 900 * x / 0.02, sine, (x) => Math.exp(-x / 0.004)); burst(o, c, t, 0.9, 0, 3500, 0.0012); }
  })),
  d('kettleWhistle', 'Kettle whistle', 'Foley', 'Kettle coming to the boil: a breathy whistle rising to a steady shriek.', 3, true, 0.6, (c, len) => dry(len, (o) => {
    const f = (x: number) => 1500 + 700 * Math.min(1, x / (len * 0.6)); osc(o, 0, len, 0.6, 0, (x) => f(x) * (1 + 0.006 * Math.sin(TAU * 6 * x)), sine, (x) => Math.min(1, x / (len * 0.5)) * fe(x, len, 0.05, 0.1));
    nz(o, c, 0, len, 0.25, 0, f, 0.08, (x) => Math.min(1, x / (len * 0.4)) * fe(x, len, 0.05, 0.1));
  })),
  d('microwaveDing', 'Microwave ding', 'Foley', 'Microwave hum stopping, then the "ding" bell.', 1.6, false, 0.65, (c) => verb(1.6, 0.12, (o) => {
    osc(o, 0, 0.4, 0.25, 0, () => 120, (ph) => sine(ph) + 0.4 * sine(wrap(ph * 2)), (x) => fe(x, 0.4, 0.01, 0.05)); modal(o, c, 0.45, 2090 * rs(c), BELL.map(([r, a, dd]) => [r, a, dd * 0.6] as Mode), 0.6, 0, 0.2);
  })),
  d('phoneVibrate', 'Phone vibrate', 'Foley', 'Phone buzzing on a table: bzz-bzz pulses with a rattly edge (fills).', 2, true, 0.7, (c, len) => dry(len, (o) => {
    for (let t = 0; t < len - 0.1; t += 0.9) for (const s of [0, 0.42]) if (t + s < len - 0.05) osc(o, t + s, 0.32, 0.8, 0, () => 165 * rs(c), (ph) => Math.tanh(4 * sine(ph)) * (0.7 + 0.3 * sqr(wrap(ph * 0.25))), (x) => fe(x, 0.32, 0.01, 0.02));
  })),
  d('ringtone', 'Ringtone', 'UI', 'Classic phone ring: fast warbling two-tone trill, twice.', 2.2, false, 0.6, (c) => dry(2.2, (o) => {
    [0, 1.1].forEach((t) => osc(o, t, 0.8, 0.6, 0, (x) => (Math.floor(x * 40) % 2 ? 1320 : 1040) * rs(c), (ph) => sqr(ph) * 0.4 + sine(ph) * 0.6, (x) => fe(x, 0.8, 0.005, 0.02)));
  })),
  d('doorbell', 'Doorbell', 'UI', 'Ding-dong doorbell: two struck chime bars, high then low.', 2.6, false, 0.7, (c) => verb(2, 0.25, (o) => { const T2 = TUBE.map(([r, a, dd]) => [r, a, dd * 1.8] as Mode); modal(o, c, 0, mtof(64) * rs(c), T2, 0.7, -0.2, 0.2, 2500); modal(o, c, 0.6, mtof(60) * rs(c), T2, 0.7, 0.2, 0.2, 2500); })),
  // ---- vehicles / sport
  d('carHorn', 'Car horn', 'Foley', 'Dual-tone car horn blast.', 0.6, true, 0.75, (c, len) => dry(len, (o) => {
    const fl = new SVF(1800, 0.5), j = rs(c); let a = 0, b = 0; play(o, 0, len, 0.8, 0, (x) => { a = wrap(a + 405 * j / SR); b = wrap(b + 510 * j / SR); fl.run(Math.tanh(2.5 * (saw(a) + saw(b)))); return fl.lp * fe(x, len, 0.01, 0.04); });
  })),
  d('engineRev', 'Engine rev', 'Foley', 'Engine revving up and settling: firing pulses whose rate climbs and falls.', 2.5, true, 0.75, (c, len) => dry(len, (o) => {
    let ph = 0; const fl = new SVF(900, 0.4); const rate = (x: number) => 28 + 70 * Math.sin(Math.PI * Math.min(1, x / len)) ** 1.5;
    play(o, 0, len, 0.9, 0, (x) => { ph = wrap(ph + rate(x) / SR); const pulse = Math.exp(-ph / 0.18) * (1 + 0.15 * c.noise()); fl.tune(500 + rate(x) * 12); fl.run(pulse); return Math.tanh(fl.lp * 3) * fe(x, len, 0.05, 0.2); });
  })),
  d('bikeBell', 'Bike bell', 'Foley', 'Bicycle bell: ring-ring trill of fast repeated strikes.', 1.4, false, 0.65, (c) => verb(1.4, 0.15, (o) => {
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) modal(o, c, r * 0.45 + i * 0.035, 2650 * rs(c), [[1, 1, 0.5], [1.47, 0.6, 0.35], [2.1, 0.3, 0.2]], 0.35, 0, 0.1, 7000);
  })),
  d('pingPong', 'Ping-pong', 'Foley', 'Table-tennis ball bouncing faster and faster to rest.', 1.6, false, 0.6, (c) => dry(1.6, (o) => {
    for (let t = 0, gap = 0.32, g = 1; t < 1.5 && g > 0.05; t += gap, gap *= 0.78, g *= 0.85) modal(o, c, t, 1300 * rs(c), BALL, g * 0.6, 0, 0.3, 4500);
  })),
  d('basketball', 'Basketball dribble', 'Foley', 'Basketball dribbles on a court: rubbery low bounces (count = bounces).', 2, false, 0.8, (c, _l, p) => verb(2, 0.18, (o) => {
    const n = Math.max(1, Math.min(8, Math.round(num(p, 'count', 4)))); for (let i = 0; i < n; i++) {
      const t = i * 0.42; osc(o, t, 0.2, 0.9, 0, (x) => (95 + 90 * Math.exp(-x / 0.02)) * rs(c), sine, (x) => Math.exp(-x / 0.06) * att(x, 0.0008)); burst(o, c, t, 0.4, 0, 1500, 0.003);
      osc(o, t, 0.1, 0.15, 0, () => 610, sine, (x) => Math.exp(-x / 0.03)); // the "ping" of the inflated ball
    }
  }), [countProp(4)]),
  d('refereeWhistle', 'Referee whistle', 'Foley', 'Pea whistle: shrill trilling blast.', 0.8, true, 0.7, (c, len) => dry(len, (o) => {
    osc(o, 0, len, 0.7, 0, (x) => 2850 * (1 + 0.035 * Math.sin(TAU * 24 * x)), sine, (x) => fe(x, len, 0.02, 0.05) * (0.75 + 0.25 * Math.sin(TAU * 24 * x)));
    nz(o, c, 0, len, 0.12, 0, () => 2850, 0.1, (x) => fe(x, len, 0.02, 0.05));
  })),
  d('diceRoll', 'Dice roll', 'Foley', 'Two dice rattling across a table and settling.', 1.2, false, 0.7, (c) => dry(1.2, (o) => {
    for (const dz of [0, 1]) for (let t = 0.02 * dz, gap = 0.05, g = 1; t < 1.1 && g > 0.08; t += gap * (0.6 + c.rnd() * 0.8), gap *= 1.12, g *= 0.88) modal(o, c, t, 1400 + c.rnd() * 900, WOOD, g * 0.5, dz ? 0.3 : -0.3, 0.35, 4000);
  })),
  d('cardFlip', 'Card flip', 'Foley', 'Playing card flipped onto a table: paper snap and a soft slap.', 0.3, false, 0.6, (c) => dry(0.3, (o) => {
    nz(o, c, 0, 0.05, 0.6, 0, () => 4500, 0.4, (x) => Math.exp(-x / 0.008), 'hp'); osc(o, 0.07, 0.05, 0.4, 0, () => 260, sine, (x) => Math.exp(-x / 0.012)); burst(o, c, 0.07, 0.4, 0, 2200, 0.002);
  })),
  d('chessPiece', 'Chess piece', 'Foley', 'Wooden chess piece set down on felt-and-wood board: soft, solid thunk.', 0.35, false, 0.6, (c) => dry(0.35, (o) => {
    nz(o, c, 0, 0.06, 0.5, 0, () => 500, 0.6, (x) => Math.exp(-x / 0.012), 'lp'); modal(o, c, 0.002, 210 * rs(c), [[1, 1, 0.04], [2.3, 0.3, 0.02]], 0.6, 0, 0);
    modal(o, c, 0.07 + c.rnd() * 0.03, 640 * rs(c), [[1, 1, 0.015]], 0.18, 0, 0.1, 1800);
  })),
  d('coinsDrop', 'Coins drop', 'Foley', 'A handful of coins hitting a table: ringing metal bounces.', 1.5, false, 0.65, (c) => verb(1.5, 0.12, (o) => {
    for (let k = 0; k < 6; k++) for (let t = c.rnd() * 0.08, gap = 0.07 + c.rnd() * 0.05, g = 0.6; t < 1.3 && g > 0.05; t += gap, gap *= 0.75, g *= 0.7) modal(o, c, t, 3200 + c.rnd() * 3000, [[1, 1, 0.25], [2.4, 0.5, 0.15], [4.1, 0.3, 0.08]], g * 0.5, c.rnd() * 1.6 - 0.8, 0.2, 7000);
  })),
  d('cashCount', 'Cash count', 'Foley', 'Banknotes flicked through a counter: fast regular paper flicks (fills).', 2, true, 0.6, (c, len) => dry(len, (o) => {
    for (let t = 0.02; t < len - 0.03; t += 1 / 14) { nz(o, c, t, 0.03, 0.6, 0, () => 3800 + c.rnd() * 800, 0.5, (x) => Math.exp(-x / 0.005)); burst(o, c, t, 0.3, 0, 1200, 0.002); }
  })),
  // ---- 8-bit set
  d('retroCoin', '8-bit coin', 'Cartoon', 'Retro game coin: a three-note thin-pulse arpeggio with a crunchy sparkle.', 0.4, false, 0.55, (c) => dry(0.45, (o) => { const j = rs(c); [76, 83, 88].forEach((m, i) => chip(o, i * 0.045, i === 2 ? 0.35 : 0.045, 0.6, 0, () => mtof(m) * j, 0.125, i === 2 ? (x) => Math.exp(-x / 0.09) : undefined)); chipNoise(o, c, 0.09, 0.2, 0.15, () => 16000, (x) => Math.exp(-x / 0.05)); })),
  d('retroJump', '8-bit jump', 'Cartoon', 'Retro game jump: square-wave pitch sweep up.', 0.3, false, 0.55, (c) => dry(0.3, (o) => { const j = rs(c); chip(o, 0, 0.25, 0.6, 0, (x) => (220 + 880 * x / 0.25) * j, 0.25); })),
  d('retroHurt', '8-bit hurt', 'Cartoon', 'Retro game damage: noisy crunch with a falling square buzz.', 0.4, false, 0.6, (c) => dry(0.4, (o) => {
    chipNoise(o, c, 0, 0.15, 0.5, () => 6000, (x) => Math.exp(-x / 0.05)); chip(o, 0, 0.35, 0.5, 0, (x) => 420 - 300 * x / 0.35, 0.125);
  })),
  d('retroPowerUp', '8-bit power-up', 'Cartoon', 'Retro game power-up: fast rising square arpeggio.', 0.7, false, 0.55, (c) => dry(0.7, (o) => { const j = rs(c); for (let i = 0; i < 10; i++) chip(o, i * 0.06, 0.06, 0.55, 0, () => mtof(60 + [0, 4, 7, 12][i % 4] + 12 * Math.floor(i / 4)) * j, 0.5); })),
  d('retroLaser', '8-bit laser', 'Cartoon', 'Retro shooter blast: fast falling pulse wave.', 0.25, false, 0.55, (c) => dry(0.25, (o) => { const j = rs(c); chip(o, 0, 0.22, 0.6, 0, (x) => (1800 * Math.exp(-x / 0.06) + 150) * j, 0.25); })),
  d('retroExplosion', '8-bit explosion', 'Cartoon', 'Retro explosion: crunchy noise that slows as it fades.', 1, false, 0.7, (c) => dry(1, (o) => chipNoise(o, c, 0, 1, 0.8, (x) => 7000 * Math.exp(-x / 0.25) + 300, (x) => Math.exp(-x / 0.3)))),
  d('retroSelect', '8-bit select', 'Cartoon', 'Retro menu select: two tiny blips.', 0.2, false, 0.5, (c) => dry(0.2, (o) => { const j = rs(c); chip(o, 0, 0.04, 0.5, 0, () => 1568 * j, 0.5); chip(o, 0.06, 0.06, 0.5, 0, () => 2093 * j, 0.5); })),
  d('retroGameOver', '8-bit game over', 'Cartoon', 'Retro game over: slow descending minor tune.', 1.6, false, 0.55, (c) => dry(1.6, (o) => { const j = rs(c); [67, 63, 60, 55].forEach((m, i) => chip(o, i * 0.3, i === 3 ? 0.6 : 0.26, 0.55, 0, (x) => mtof(m) * j * (i === 3 ? 1 + 0.02 * Math.sin(TAU * 6 * x) : 1), 0.5)); })),
  // ---- tech / sci-fi foley
  d('servo', 'Servo motor', 'Sci-fi', 'Small servo/robot joint: geared whine ramping up, holding, ramping down.', 0.8, true, 0.6, (c, len) => dry(len, (o) => {
    const f = (x: number) => 260 + 260 * Math.min(1, x / 0.1, (len - x) / 0.1); let ph = 0; const fl = new SVF(1500, 0.5);
    play(o, 0, len, 0.8, 0, (x) => { ph = wrap(ph + f(x) / SR); fl.run(saw(ph) * (0.7 + 0.3 * sqr(wrap(ph * 0.125))) + 0.1 * c.noise()); return fl.lp * fe(x, len, 0.01, 0.02); });
  })),
  d('robotBlip', 'Robot voice', 'Sci-fi', 'Robot "speech": quick bleep-bloop syllables through a vocoder-ish formant.', 1, true, 0.6, (c, len) => dry(len, (o) => {
    for (let t = 0; t < len - 0.08; t += 0.08 + c.rnd() * 0.07) { const f = 200 + c.rnd() * 500, v = [VOWEL.o, VOWEL.e, VOWEL.i][Math.floor(c.rnd() * 3)]; voice(o, c, t, 0.07, 0.6, 0, () => f, () => v, (x) => fe(x, 0.07, 0.004, 0.01), 0); }
  })),
  d('modem', 'Dial-up modem', 'Sci-fi', 'Dial-up modem handshake: dial tones, chirps and the screech.', 3, true, 0.55, (c, len) => dry(len, (o) => {
    const dtmf = [[697, 1209], [770, 1336], [852, 1477], [941, 1336]];
    dtmf.forEach(([a, b], i) => { osc(o, i * 0.12, 0.09, 0.3, 0, () => a, sine, (x) => fe(x, 0.09)); osc(o, i * 0.12, 0.09, 0.3, 0, () => b, sine, (x) => fe(x, 0.09)); });
    osc(o, 0.6, Math.max(0.1, len * 0.25), 0.4, 0, (x) => 1800 + 600 * Math.sin(TAU * 4 * x), sine, (x) => fe(x, len * 0.25, 0.01, 0.02));
    const t2 = 0.6 + len * 0.25; let ph = 0; play(o, t2, Math.max(0.05, len - t2), 0.5, 0, (x) => { ph = wrap(ph + (1200 + 900 * Math.sin(TAU * 37 * x) + 500 * c.noise()) / SR); return sqr(ph) * 0.5 * fe(x, len - t2, 0.01, 0.05); });
  })),
  // ---- musical / game show
  d('gongShort', 'Gong (short)', 'Tonal', 'Short, dry gong hit with a low beating hum — punctuation, not a tail.', 1.5, false, 0.75, (c) => verb(1.5, 0.15, (o) => modal(o, c, 0, 110 * rs(c), [[1, 1, 0.45], [1.03, 0.6, 0.4], [2.2, 0.5, 0.3], [3.7, 0.3, 0.2], [5.1, 0.2, 0.12]], 0.9, 0, 0.3, 1500))),
  d('singingBowl', 'Singing bowl', 'Tonal', 'Rubbed singing bowl: a pure beating tone that swells and sustains (fills).', 5, true, 0.6, (c, len) => verb(len, 0.3, (o) => {
    const f = 330 * rs(c); [[1, 1], [1.007, 0.8], [2.71, 0.35], [2.73, 0.3], [5.1, 0.12]].forEach(([r, a]) => osc(o, 0, len, 0.4 * a, (c.rnd() - 0.5) * 0.4, () => f * r, sine, (x) => Math.min(1, x / (len * 0.35)) * fe(x, len, 0.3, 0.5)));
  })),
  d('rainStick', 'Rain stick', 'Tonal', 'Rain stick tipped over: a cascade of tiny pebbles trickling down.', 3, true, 0.6, (c, len) => verb(len, 0.2, (o) => {
    for (let t = 0; t < len - 0.02; t += 0.002 + c.rnd() * 0.012) { const k = t / len; modal(o, c, t, 2500 + c.rnd() * 3500 - 1200 * k, [[1, 1, 0.01]], 0.15 * Math.sin(Math.PI * k) * (0.3 + c.rnd()), c.rnd() * 1.4 - 0.7, 0, 0); }
  })),
  d('thunderDistant', 'Thunder (distant)', 'Nature', 'Far-away thunder: no crack, just a low rolling grumble with a few swells.', 4, true, 0.7, (c, len) => verb(len, 0.3, (o) => {
    for (let t = 0; t < len - 0.5; t += 0.4 + c.rnd() * 0.9) { const L = Math.min(len - t, 1 + c.rnd() * 1.5); nz(o, c, t, L, 0.5 + c.rnd() * 0.5, c.rnd() - 0.5, () => 180 + c.rnd() * 80, 0.6, (x) => Math.sin(Math.PI * x / L) ** 2 * (0.7 + 0.3 * Math.sin(TAU * 7 * x)), 'lp'); }
  })),
  d('heartbeatSlow', 'Heartbeat (slow)', 'Human', 'Slow, deep lub-dub heartbeat — calm or ominous (fills).', 4, true, 0.8, (c, len, p) => dry(len, (o) => {
    const per = 60 / num(p, 'bpm', 52); for (let t = 0; t < len - 0.3; t += per) { const j = rs(c); [[0, 1, 48], [0.22, 0.7, 58]].forEach(([s, g, f]) => osc(o, t + s, 0.25, g, 0, (x) => (f + 40 * Math.exp(-x / 0.02)) * j, sine, (x) => Math.exp(-x / 0.06) * att(x, 0.004))); }
  }), [bpmProp(52)]),
  d('clockTicking', 'Clock ticking', 'Foley', 'Wall clock: tick-tock, alternating pitch, once per second (fills).', 4, true, 0.6, (c, len) => verb(len, 0.1, (o) => { for (let t = 0, i = 0; t < len - 0.05; t += 1, i++) modal(o, c, t, i % 2 ? 2100 : 2600, WOOD.map(([r, a, dd]) => [r, a, dd * 0.4] as Mode), 0.7, 0, 0.5, 6000); })),
  d('metronome', 'Metronome', 'Foley', 'Metronome clicks with an accented first beat (bpm; fills).', 4, true, 0.65, (c, len, p) => dry(len, (o) => {
    const per = 60 / num(p, 'bpm', 100); for (let t = 0, i = 0; t < len - 0.05; t += per, i++) modal(o, c, t, i % 4 ? 1800 : 2700, WOOD, i % 4 ? 0.5 : 0.8, 0, 0.4, 5000);
  }), [bpmProp(100)]),
  d('countdownBeeps', 'Countdown beeps', 'UI', '3-2-1-GO: three short beeps, then a long higher one (stretches to the clip).', 4, true, 0.65, (c, len) => dry(len, (o) => {
    const step = len / 4, j = rs(c); for (let i = 0; i < 3; i++) osc(o, i * step, 0.15, 0.6, 0, () => 880 * j, (ph) => sine(ph) * 0.7 + sqr(ph) * 0.3, (x) => fe(x, 0.15, 0.003, 0.02));
    osc(o, 3 * step, Math.min(0.7, step), 0.7, 0, () => 1760 * j, (ph) => sine(ph) * 0.7 + sqr(ph) * 0.3, (x) => fe(x, Math.min(0.7, step), 0.003, 0.1));
  })),
  d('gameShowCorrect', 'Correct answer', 'Stingers', 'Game-show "correct!": a quick xylophone run up to a ringing top note.', 1.3, false, 0.65, (c) => verb(1.3, 0.2, (o) => { [72, 76, 79, 84].forEach((m, i) => modal(o, c, i * 0.07, mtof(m), [[1, 1, 0.18], [3.93, 0.4, 0.03], [10.7, 0.15, 0.01]], 0.55, (i - 1.5) * 0.3, 0.35, 5000)); modal(o, c, 0.28, mtof(88), [[1, 1, 0.5], [3.93, 0.3, 0.05]], 0.4, 0.3, 0.3, 5000); })),
  d('gameShowWrong', 'Wrong answer', 'Stingers', 'Game-show "wrong!": harsh low double buzzer.', 1, false, 0.65, (c) => dry(1, (o) => { [0, 0.42].forEach((t) => osc(o, t, 0.36, 0.7, 0, () => 140 * rs(c), (ph) => Math.tanh(3 * (sqr(ph) + saw(wrap(ph * 1.5)))), (x) => fe(x, 0.36, 0.005, 0.03))); })),
  d('rimshot', 'Rimshot (ba-dum-tss)', 'Stingers', 'The joke drum: snare, tom, cymbal — ba-dum-tss.', 1.6, false, 0.75, (c) => verb(1.6, 0.15, (o) => { I.snare(o, c, 0, 0.8, 0.6); I.tom(o, c, 0.17, 140, 0.8); I.kick(o, 0.34, 0.6, 'punch'); I.crash(o, c, 0.34, 0.5, 1.2); })),
  d('sadTrombone', 'Sad trombone', 'Stingers', 'Wah-wah-wah-waaah: four sagging plunger-muted brass notes.', 2.4, false, 0.7, (c) => dry(2.4, (o) => {
    [[58, 0, 0.4], [57, 0.45, 0.4], [56, 0.9, 0.4], [55, 1.35, 1]].forEach(([m, t, L], i) => voice(o, c, t, L, 0.8, 0, (x) => mtof(m) * (i === 3 ? 1 + 0.03 * Math.sin(TAU * 5 * x) : 1), (x) => lerpV(VOWEL.u, VOWEL.a, Math.sin(Math.PI * Math.min(1, x / L))), (x) => fe(x, L, 0.03, 0.08), 0.05));
  })),
  d('taDa', 'Ta-da!', 'Stingers', 'Fanfare "ta-DA!": a short brass pickup into a big held chord.', 1.8, false, 0.75, (c) => verb(1.8, 0.25, (o) => {
    [67, 72].forEach((m) => I.brass(o, c, 0, mtof(m), 0.12, 0.8)); [60, 64, 67, 72, 76].forEach((m, i) => I.brass(o, c, 0.18, mtof(m), 1.2, 0.8, (i - 2) * 0.3)); I.crash(o, c, 0.18, 0.25, 1.4);
  })),
  d('magicWand', 'Magic wand', 'Tonal', 'Wand flourish: a quick upward bell glissando trailing sparkles.', 1.6, false, 0.65, (c) => verb(1.6, 0.35, (o) => {
    for (let i = 0; i < 12; i++) modal(o, c, i * 0.035, mtof(72 + [0, 2, 4, 7, 9][i % 5] + 12 * Math.floor(i / 5)), TUBE.map(([r, a, dd]) => [r, a, dd * 0.35] as Mode), 0.25, (i / 11) * 1.4 - 0.7, 0);
    for (let t = 0.3; t < 1.4; t += 0.02 + c.rnd() * 0.05) modal(o, c, t, 4500 + c.rnd() * 4000, [[1, 1, 0.05]], 0.08 * (1.4 - t), c.rnd() * 2 - 1, 0, 0);
  })),
  d('fairyDust', 'Fairy dust', 'Tonal', 'Twinkling fairy dust: random high bell grains drifting downward (fills).', 2.5, true, 0.6, (c, len) => verb(len, 0.4, (o) => {
    for (let t = 0; t < len - 0.1; t += 0.03 + c.rnd() * 0.08) { const k = t / len; modal(o, c, t, mtof(96 - 14 * k + Math.floor(c.rnd() * 5) * 2), [[1, 1, 0.18], [2.76, 0.3, 0.06]], 0.15 + c.rnd() * 0.15, c.rnd() * 2 - 1, 0); }
  })),
];
