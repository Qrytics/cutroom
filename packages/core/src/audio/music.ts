// Procedural multi-genre music: mood → scale + chord progressions, style → instruments, groove and arrangement.
// Song form: intro → A → (build → drop) / B → outro on the tonic, with an energy curve that switches parts in and out.
// Seeded by the clip seed + `variation`, so every bed is different but re-renders identically.
import { clamp } from '../engine/ease.ts';
import type { Props } from '../schema/types.ts';
import { type Ctx, crush, lowpass, master, mtof, type Out, out, reverbWet, saturate, SR, type Stereo, stereo, widen } from './dsp.ts';
import * as I from './instruments.ts';

// ---------------------------------------------------------------- theory
const SC = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], phryg: [0, 1, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11],
};
export interface MoodDef { root: number; scale: number[]; progs: number[][]; seventh?: boolean; description: string }
/** progressions are scale degrees (0 = tonic) */
export const MUSIC_MOODS: Record<string, MoodDef> = {
  hopeful: { root: 60, scale: SC.major, progs: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 0, 4, 5], [0, 3, 5, 4], [5, 3, 0, 4]], description: 'major, uplifting' },
  epic: { root: 62, scale: SC.minor, progs: [[0, 5, 2, 6], [0, 6, 5, 6], [5, 6, 0, 0], [0, 3, 5, 6], [0, 5, 3, 4]], description: 'minor, heroic' },
  chill: { root: 62, scale: SC.dorian, seventh: true, progs: [[0, 3], [0, 3, 4, 3], [0, 6, 5, 3], [1, 4, 0, 0]], description: 'dorian 7ths, laid back' },
  tech: { root: 57, scale: SC.minor, progs: [[0, 5, 6, 4], [0, 0, 5, 6], [0, 3, 6, 5], [0, 5, 2, 6]], description: 'minor, driving' },
  dark: { root: 57, scale: SC.phryg, progs: [[0, 1, 0, 6], [0, 5, 1, 0], [0, 3, 1, 0]], description: 'phrygian, ominous' },
  bright: { root: 64, scale: SC.major, progs: [[0, 4, 5, 3], [3, 4, 0, 0], [0, 3, 4, 3], [0, 1, 3, 4]], description: 'major, sunny' },
  dreamy: { root: 55, scale: SC.lydian, seventh: true, progs: [[0, 1, 0, 1], [0, 1, 5, 4], [0, 2, 1, 0], [3, 1, 0, 0]], description: 'lydian 7ths, floating' },
  tense: { root: 58, scale: SC.harm, progs: [[0, 0, 5, 4], [0, 3, 4, 4], [0, 5, 3, 4], [0, 1, 0, 4]], description: 'harmonic minor, suspense' },
  playful: { root: 62, scale: SC.major, progs: [[0, 3, 4, 0], [0, 5, 1, 4], [0, 2, 3, 4], [0, 3, 0, 4]], description: 'major, bouncy' },
  triumphant: { root: 62, scale: SC.mixo, progs: [[0, 6, 3, 0], [0, 3, 6, 0], [0, 6, 3, 4], [3, 6, 0, 0]], description: 'mixolydian, victorious' },
  melancholy: { root: 64, scale: SC.minor, seventh: true, progs: [[0, 5, 2, 6], [0, 3, 6, 2], [5, 3, 0, 4], [0, 6, 5, 4]], description: 'minor 7ths, wistful' },
  mysterious: { root: 61, scale: SC.dorian, progs: [[0, 1, 0, 6], [0, 4, 1, 0], [0, 3, 6, 5]], description: 'dorian, curious' },
  warm: { root: 65, scale: SC.major, seventh: true, progs: [[0, 3, 1, 4], [0, 5, 3, 4], [3, 2, 1, 4], [0, 2, 3, 3]], description: 'major 7ths, cozy' },
  aggressive: { root: 52, scale: SC.phryg, progs: [[0, 0, 1, 0], [0, 6, 5, 1], [0, 1, 6, 5]], description: 'phrygian, heavy' },
};
const mod = (a: number, n: number) => ((a % n) + n) % n;
export function degNote(scale: number[], root: number, d: number) { return root + scale[mod(d, 7)] + 12 * Math.floor(d / 7); }
/** chords as midi notes for each degree of a progression (used by the classic bed and stingers) */
export function moodChords(mood: string, prog = 0): number[][] {
  const M = MUSIC_MOODS[mood] || MUSIC_MOODS.hopeful;
  return M.progs[mod(prog, M.progs.length)].map((d) => [0, 2, 4, M.seventh ? 6 : 7].map((i) => degNote(M.scale, M.root - 12, d + i)));
}

// ---------------------------------------------------------------- styles
type DrumPat = Partial<Record<'k' | 's' | 'c' | 'h' | 'o' | 'sh' | 'r' | 't' | 'p', string>>;
interface Part { inst: string; pat: string; g: number; oct?: number; strum?: boolean; rate?: number; rand?: number; glide?: boolean; minE?: number }
interface StyleDef {
  label: string; bpm: number; swing?: number; chordBars?: number; wet: number; side?: number; kit: I.KickKind | 'none'; hum?: boolean;
  pad?: { inst: string; g: number; att?: number }; chords?: Part; chords2?: Part; bass?: Part; arp?: Part;
  lead: { inst: string; g: number; density: number; oct?: number };
  A: DrumPat; B: DrumPat; tInst?: 'taiko' | 'timp' | 'tom'; snareDecay?: number;
  fill: 'snare' | 'tom' | 'hat' | 'chip' | 'timp' | 'none'; braams?: boolean; rolls?: boolean;
  fx?: { lp?: number; crush?: number; sat?: number; crackle?: number; width?: number };
}
const HAT8 = 'x.x.x.x.x.x.x.x.', OFF = '..x...x...x...x.', FOUR = 'x...x...x...x...', BACK = '....x.......x...';
export const MUSIC_STYLES: Record<string, StyleDef> = {
  ambient: {
    label: 'Ambient — slow pads, bells, no drums', bpm: 70, chordBars: 2, wet: 0.7, kit: 'none', pad: { inst: 'pad', g: 0.9, att: 2.2 },
    bass: { inst: 'sub', pat: 'x---------------', g: 0.6 }, arp: { inst: 'bell', pat: '0.2.1.3.4.2.5.1.', rate: 2, rand: 0.45, oct: 1, g: 0.5, minE: 0.3 },
    lead: { inst: 'bell', g: 0.45, density: 0.3, oct: 1 }, A: {}, B: {}, fill: 'none', fx: { width: 1.35 },
  },
  lofi: {
    label: 'Lo-fi hip hop — swung dusty drums, e-piano, vinyl', bpm: 82, swing: 0.55, wet: 0.3, kit: 'soft', hum: true,
    chords: { inst: 'epiano', pat: 'x-----x-----x---', g: 0.75 }, bass: { inst: 'pick', pat: 'x-----x...x-5-..', g: 0.8 },
    lead: { inst: 'epiano', g: 0.5, density: 0.4, oct: 1 },
    A: { k: 'x.....x...x.....', s: BACK, h: HAT8 }, B: { k: 'x.....x.x.x.....', s: '....x..g....x...', h: 'xgxgxgxgxgxgxgxo' },
    fill: 'snare', fx: { lp: 3200, sat: 1.6, crackle: 0.5 },
  },
  house: {
    label: 'House — four on the floor, offbeat bass, sidechained pads', bpm: 124, wet: 0.25, side: 0.6, kit: 'punch',
    pad: { inst: 'pad', g: 0.55, att: 0.3 }, chords: { inst: 'organ', pat: '...x-..x-...x-..', g: 0.55 },
    bass: { inst: 'house', pat: '..x...x...x...xo', g: 0.85 }, arp: { inst: 'pluck', pat: '0123401234012340', rate: 1, oct: 1, g: 0.3 },
    lead: { inst: 'pluck', g: 0.45, density: 0.55, oct: 1 },
    A: { k: FOUR, h: OFF }, B: { k: FOUR, c: BACK, o: OFF, sh: 'gggggggggggggggg' }, fill: 'snare',
  },
  synthwave: {
    label: 'Synthwave — gated snare, octave saw bass, arps', bpm: 100, wet: 0.45, side: 0.3, kit: 'punch', snareDecay: 2.2,
    pad: { inst: 'pad', g: 0.7, att: 0.4 }, bass: { inst: 'saw', pat: 'xoxoxoxoxoxoxoxo', g: 0.6 },
    arp: { inst: 'saw', pat: '0124210401242104', rate: 1, oct: 1, g: 0.3 }, lead: { inst: 'lead', g: 0.45, density: 0.5, oct: 1 },
    A: { k: 'x.......x.......', s: BACK, h: HAT8 }, B: { k: FOUR, s: BACK, h: 'xgxgxgxgxgxgxgxg' }, fill: 'tom', fx: { width: 1.2 },
  },
  trap: {
    label: 'Trap — gliding 808s, hat rolls, half-time claps', bpm: 140, wet: 0.3, kit: 'punch', rolls: true,
    pad: { inst: 'strings', g: 0.5, att: 0.6 }, bass: { inst: '808', pat: 'x-----x---x-----', g: 0.9, glide: true },
    arp: { inst: 'bell', pat: '0.2.4.2.0.2.4.2.', rate: 1, oct: 1, g: 0.35 }, lead: { inst: 'pluck', g: 0.4, density: 0.45, oct: 1 },
    A: { k: 'x.......x.......', c: '........x.......', h: HAT8 }, B: { k: 'x.....x...x..x..', c: '........x.......', h: 'xxxxxxxxxxxxxxxx' }, fill: 'hat',
  },
  cinematic: {
    label: 'Cinematic — taikos, strings, braams', bpm: 90, chordBars: 2, wet: 0.55, kit: 'deep', braams: true, tInst: 'taiko',
    pad: { inst: 'strings', g: 0.8, att: 0.8 }, bass: { inst: 'strings', pat: 'x---------------', g: 0.6, oct: -1 },
    arp: { inst: 'stac', pat: '0101010101010101', rate: 1, oct: 0, g: 0.45, minE: 0.85 }, lead: { inst: 'brass', g: 0.5, density: 0.3, oct: 0 },
    A: { t: 'x.......x.......' }, B: { t: 'x..x..x.x.x.x.xx', k: 'x.......x.......' }, fill: 'tom',
  },
  corporate: {
    label: 'Corporate / upbeat — ukulele strums, claps, glockenspiel', bpm: 112, wet: 0.25, side: 0.15, kit: 'punch',
    chords: { inst: 'uke', pat: 'x.x.xx.x.x.xx.x.', strum: true, g: 0.6, oct: 1 }, chords2: { inst: 'piano', pat: 'x-------x-------', g: 0.45, minE: 0.8 },
    bass: { inst: 'pick', pat: 'x...x...x...x.5.', g: 0.8 }, lead: { inst: 'glock', g: 0.45, density: 0.5, oct: 1 },
    A: { k: 'x.......x.......', c: BACK, sh: 'gxgxgxgxgxgxgxgx' }, B: { k: FOUR, c: BACK, h: OFF, sh: 'gxgxgxgxgxgxgxgx' }, fill: 'snare',
  },
  dnb: {
    label: 'Drum & bass — 172 bpm breaks, reese bass', bpm: 172, wet: 0.3, side: 0.2, kit: 'punch',
    pad: { inst: 'pad', g: 0.6, att: 1.2 }, bass: { inst: 'reese', pat: 'x-------x-------', g: 0.75 },
    arp: { inst: 'pluck', pat: '0.2.4.2.0.2.4.2.', rate: 1, oct: 1, g: 0.25 }, lead: { inst: 'bell', g: 0.4, density: 0.35, oct: 1 },
    A: { k: 'x.........x.....', s: BACK, h: HAT8 }, B: { k: 'x.........x..x..', s: '....x..g.g..x..g', h: 'xgxgxgxgxgxgxgxg' }, fill: 'snare',
  },
  chiptune: {
    label: 'Chiptune — square leads, fast arps, noise drums', bpm: 140, wet: 0.1, kit: 'chip',
    chords: { inst: 'chip', pat: 'x-------x---x---', g: 0.3, oct: -1 },
    bass: { inst: 'chipTri', pat: 'xoxoxoxoxoxoxoxo', g: 0.8 }, arp: { inst: 'chip', pat: '0240240240240240', rate: 1, oct: 1, g: 0.35, minE: 0.5 },
    lead: { inst: 'chip', g: 0.55, density: 0.6, oct: 1 },
    A: { k: 'x.......x.......', s: BACK, h: HAT8 }, B: { k: 'x...x...x.x.x...', s: BACK, h: 'xxxxxxxxxxxxxxxx' }, fill: 'chip', fx: { crush: 8 },
  },
  piano: {
    label: 'Solo piano — arpeggiated felt piano', bpm: 72, wet: 0.45, kit: 'none', hum: true,
    chords: { inst: 'piano', pat: 'x---------------', g: 0.4, oct: -1 }, arp: { inst: 'piano', pat: '0.1.2.1.4.2.1.2.', rate: 1, oct: 0, g: 0.5, minE: 0.3 },
    bass: { inst: 'piano', pat: 'x-------5-------', g: 0.55 }, lead: { inst: 'piano', g: 0.6, density: 0.4, oct: 1 }, A: {}, B: {}, fill: 'none',
  },
  minimal: {
    label: 'Minimal techno — clicky percussion, dub chords', bpm: 122, wet: 0.45, side: 0.35, kit: 'deep',
    chords: { inst: 'epiano', pat: '......x-.....x--', g: 0.5 }, bass: { inst: 'house', pat: '..x...x..x.x..x.', g: 0.8 },
    lead: { inst: 'blip', g: 0.45, density: 0.3, oct: 1 },
    A: { k: FOUR, r: '..x..x.....x..x.', p: 'xgxgxgxgxgxgxgxg' }, B: { k: FOUR, r: '..x..x.....x..x.', p: 'xgxgxgxgxgxgxgxg', c: BACK, o: OFF }, fill: 'none',
  },
  funk: {
    label: 'Funk — slap bass, clav, tight drums', bpm: 104, swing: 0.15, wet: 0.2, kit: 'punch', hum: true,
    pad: { inst: 'organ', g: 0.35 }, chords: { inst: 'clav', pat: 'x.x..x.x.x..x.x.', g: 0.6 },
    bass: { inst: 'slap', pat: 'x..xo.x.x.5.xo.a', g: 0.85 }, lead: { inst: 'brass', g: 0.45, density: 0.55, oct: 0 },
    A: { k: 'x.....x.x.......', s: BACK, h: 'xgxgxgxgxgxgxgxg' }, B: { k: 'x.....x.x..x....', s: '....x..g.g..x..g', h: 'xgxgxgxgxgxgxgxo' }, fill: 'snare',
  },
  orchestral: {
    label: 'Orchestral — string ostinato, timpani, brass melody', bpm: 96, wet: 0.5, kit: 'none', tInst: 'timp',
    pad: { inst: 'strings', g: 0.7, att: 0.5 }, arp: { inst: 'stac', pat: '0102010201020102', rate: 1, oct: 0, g: 0.5, minE: 0.5 },
    bass: { inst: 'strings', pat: 'x-------x-------', g: 0.6, oct: -1 }, lead: { inst: 'brass', g: 0.5, density: 0.35, oct: 0 },
    A: { t: 'x...............' }, B: { t: 'x.......x...x...' }, fill: 'timp',
  },
  garage: {
    label: 'UK garage — 2-step shuffle, organ stabs', bpm: 132, swing: 0.6, wet: 0.3, side: 0.3, kit: 'punch',
    chords: { inst: 'organ', pat: 'x..x...x..x.....', g: 0.5 }, bass: { inst: 'sub', pat: 'x--.....x-.x....', g: 0.9 },
    lead: { inst: 'pluck', g: 0.45, density: 0.55, oct: 1 },
    A: { k: 'x.........x.....', c: BACK, h: OFF }, B: { k: 'x......x..x.....', c: BACK, h: '..x.g.x...x.g.x.', sh: 'gggggggggggggggg' }, fill: 'snare',
  },
  indie: {
    label: 'Indie — strummed guitar, live drums, organ', bpm: 118, wet: 0.25, kit: 'punch', hum: true,
    pad: { inst: 'organ', g: 0.25 }, chords: { inst: 'guitar', pat: 'x.x.xx.xx.x.xx.x', strum: true, g: 0.6 },
    bass: { inst: 'pick', pat: 'x.x.x.x.x.x.x.x.', g: 0.75 }, lead: { inst: 'lead', g: 0.4, density: 0.5, oct: 1 },
    A: { k: 'x.......x.......', s: BACK, h: HAT8 }, B: { k: 'x.....x.x.......', s: BACK, h: 'xoxoxoxoxoxoxoxo' }, fill: 'tom',
  },
};
/** `style: auto` picks from these by `variation` */
export const AUTO_STYLES: Record<string, string[]> = {
  hopeful: ['corporate', 'indie', 'house'], epic: ['cinematic', 'orchestral', 'synthwave'], chill: ['lofi', 'ambient', 'garage'],
  tech: ['minimal', 'house', 'synthwave'], dark: ['trap', 'cinematic', 'minimal'], bright: ['house', 'corporate', 'funk'],
  dreamy: ['ambient', 'lofi', 'piano'], tense: ['orchestral', 'cinematic', 'dnb'], playful: ['funk', 'chiptune', 'corporate'],
  triumphant: ['orchestral', 'cinematic', 'indie'], melancholy: ['piano', 'lofi', 'ambient'], mysterious: ['ambient', 'minimal', 'trap'],
  warm: ['indie', 'lofi', 'piano'], aggressive: ['dnb', 'trap', 'synthwave'],
};
export function resolveStyle(p: Props) {
  const mood = MUSIC_MOODS[String(p.mood)] ? String(p.mood) : 'hopeful';
  const s = String(p.style ?? 'auto');
  if (MUSIC_STYLES[s] || s === 'classic') return s;
  const cand = AUTO_STYLES[mood];
  return cand[mod(Math.floor(Number(p.variation ?? 0)), cand.length)];
}

// ---------------------------------------------------------------- instrument dispatch
function voice(c: Ctx, o: Out, inst: string, t: number, m: number, len: number, g: number, pan: number, from = 0) {
  const f = mtof(m);
  switch (inst) {
    case 'epiano': return I.epiano(o, t, f, len, g, pan);
    case 'bell': return I.bell(o, t, f, len, g, pan);
    case 'glock': return I.bell(o, t, f, len, g * 0.9, pan, 4, 0.9);
    case 'blip': return I.bell(o, t, f, len, g, pan, 2, 0.18);
    case 'piano': return I.piano(o, c, t, f, len, g, pan);
    case 'organ': return I.organ(o, t, f, len, g, pan);
    case 'clav': return I.clav(o, t, f, len, g, pan);
    case 'pad': return I.supersaw(o, c, t, f, len, g, pan, 0.5, 0.9, 1500, 3, 0.14);
    case 'saw': return I.supersaw(o, c, t, f, len, g * 1.3, pan, 0.004, 0.12, 900, 2, 0.08, 2.5, 0.12);
    case 'pluck': return I.ks(o, c, t, f, len, g, pan, 0.95, 0.5);
    case 'uke': return I.ks(o, c, t, f, len, g, pan, 0.85, 0.7);
    case 'guitar': return I.ks(o, c, t, f, len, g, pan, 0.6, 1.6);
    case 'strings': return I.strings(o, c, t, f, len, g, pan);
    case 'stac': return I.strings(o, c, t, f, len, g * 1.2, pan, 0.015, 0.12);
    case 'brass': return I.brass(o, c, t, f, len, g, pan);
    case 'lead': return I.lead(o, t, f, len, g, pan, 0.5, 2400, 0.006, from);
    case 'chip': return I.chip(o, t, f, len, g, pan, 0.25, 0.006);
    case 'chipTri': return I.chipTri(o, t, f, len, g, pan);
    case 'sub': return I.sub(o, t, f, len, g);
    case 'pick': return I.pick(o, t, f, len, g);
    case '808': return I.bass808(o, t, f, len, g, from);
    case 'reese': return I.reese(o, c, t, f, len, g);
    case 'house': return I.synthBass(o, t, f, len, g);
    case 'slap': return I.slap(o, c, t, f, len, g);
  }
}

// ---------------------------------------------------------------- melody
interface MNote { s: number; d: number; deg: number; strong: boolean }
/** a 2-bar motif on an 8th grid (s, d in 16th steps), contour as scale degrees */
function motif(c: Ctx, density: number, startDeg?: number): MNote[] {
  const res: MNote[] = [];
  let deg = startDeg ?? [2, 4, 7][Math.floor(c.rnd() * 3)];
  for (let s = 0; s < 28;) {
    const onBeat = s % 4 === 0;
    if (c.rnd() < density * (s % 8 === 0 ? 1.15 : onBeat ? 0.85 : 0.5)) {
      const d = Math.min([2, 2, 2, 4, 4, 6, 8][Math.floor(c.rnd() * 7)], 32 - s);
      res.push({ s, d, deg, strong: onBeat });
      const r = c.rnd();
      deg += r < 0.34 ? 1 : r < 0.68 ? -1 : r < 0.8 ? 2 : r < 0.9 ? -2 : c.rnd() < 0.5 ? 4 : -3;
      deg = Math.max(-1, Math.min(11, deg));
      s += d;
    } else s += 2;
  }
  return res.length ? res : [{ s: 0, d: 8, deg, strong: true }];
}
/** four 2-bar phrases: call, varied call, contrast, answer that lands on the tonic */
function melodyPhrases(c: Ctx, density: number): MNote[][] {
  const m1 = motif(c, density), m2 = motif(c, density);
  const m1b = [...m1.filter((n) => n.s < 16), ...motif(c, density, m1[m1.length - 1].deg).filter((n) => n.s >= 16)];
  const m1e = m1.map((n) => ({ ...n }));
  const last = m1e[m1e.length - 1];
  last.deg = last.deg > 3 ? 7 : 0; last.d = Math.max(last.d, 32 - last.s - 2); last.strong = true;
  return [m1, m1b, m2, m1e];
}

// ---------------------------------------------------------------- the generator
export function musicGen(c: Ctx, len: number, p: Props): Stereo {
  const moodKey = MUSIC_MOODS[String(p.mood)] ? String(p.mood) : 'hopeful', M = MUSIC_MOODS[moodKey];
  const S = MUSIC_STYLES[resolveStyle(p)] ?? MUSIC_STYLES.corporate;
  const bpm = Number(p.bpm) || S.bpm, beat = 60 / bpm, BAR = beat * 4, step = beat / 4;
  const eScale = 0.55 + 0.65 * clamp(Number(p.energy ?? 0.7));
  const sw = Number(p.swing ?? -1), swing = sw >= 0 ? clamp(sw) : S.swing ?? 0;
  const on = (k: string) => p[k] === undefined || Boolean(p[k]);
  const keyRoot = 48 + mod(M.root + Number(p.transpose ?? 0), 12);
  const pi = Math.floor(Number(p.progression ?? 0));
  const prog = M.progs[pi > 0 ? (pi - 1) % M.progs.length : Math.floor(c.rnd() * M.progs.length)];
  const cb = S.chordBars ?? 1;
  const phrases = melodyPhrases(c, S.lead.density);

  // ---- form
  const intro = Math.max(0, Number(p.intro ?? 4)), drop = Number(p.drop ?? 0), outro = Number(p.outro ?? 0);
  const dropT = drop > 0 && drop < len - 0.5 ? drop : 0;
  const grid0 = dropT ? dropT - Math.ceil(dropT / BAR - 1e-6) * BAR : 0;
  const buildT = dropT ? Math.max(0, dropT - BAR * (dropT >= BAR * 3 ? 2 : 1)) : 0;
  const introT = dropT ? Math.min(intro, buildT) : Math.min(intro, len);
  const outroT = Math.max(introT, len - (outro > 0 ? outro : Math.min(BAR * 2, len * 0.18)));
  const bT = dropT || grid0 + Math.round(((introT + outroT) / 2 - grid0) / (BAR * 2)) * BAR * 2;
  const SE = { intro: 0.42, A: 0.68, build: 0.72, drop: 1, outro: 0.42 };
  type Sec = keyof typeof SE;
  const section = (t: number): Sec => (t < introT ? 'intro' : dropT && t >= buildT && t < dropT ? 'build' : t >= outroT ? 'outro' : t >= bT ? 'drop' : 'A');
  const dropBar = Math.round(((dropT || bT) - grid0) / BAR);

  // ---- buses: music (sidechained) + drums both feed one reverb send
  const mix = stereo(len), send = stereo(len);
  const mo = out(mix, send, S.wet), dO = out(mix, send, S.wet * 0.35);
  const kicks: number[] = [], drumEv: (() => void)[] = [];
  const tm = (bs: number, s: number) => bs + s * step + (s % 2 ? swing * step * 0.66 : 0) + (S.hum ? (c.rnd() - 0.5) * 0.012 : 0);
  const vel = (ch: string) => (ch === 'x' ? 1 : ch === 'o' ? 0.6 : ch === 'g' ? 0.3 : 0);
  const fold = (n: number, lo: number) => { while (n < lo) n += 12; while (n >= lo + 12) n -= 12; return n; };
  const chordOf = (deg: number, center: number) => [0, 2, 4, ...(M.seventh || S.chords?.inst === 'organ' ? [6] : [])]
    .map((i) => fold(degNote(M.scale, keyRoot, deg + i), center - 5)).sort((a, b) => a - b);
  const hits = (pat: string) => {
    const r: { s: number; n: number; ch: string }[] = [];
    for (let s = 0; s < 16; s++) { const ch = pat[s % pat.length]; if (ch !== '.' && ch !== '-') { let n = 1; while (s + n < 16 && pat[(s + n) % pat.length] === '-') n++; r.push({ s, n, ch }); } }
    return r;
  };
  let prevBass = 0;

  for (let b = 0, bs = grid0; bs < len; b++, bs = grid0 + b * BAR) {
    const sec = section(Math.max(0, bs) + 0.01), E = SE[sec] * eScale, idx = b - dropBar;
    const prevSec = b > 0 ? section(Math.max(0, bs - BAR) + 0.01) : 'intro';
    const last = bs + BAR >= len - 0.05;
    const deg = last ? 0 : prog[mod(Math.floor(idx / cb), prog.length)];
    const nextDeg = prog[mod(Math.floor((idx + 1) / cb), prog.length)];
    const gapAt = sec === 'build' && bs + BAR >= dropT - 1e-3 ? dropT - beat : Infinity;
    const tail = last ? len - bs : 0;
    const ok = (t: number) => t < gapAt;

    // pad: sustained chord per chord-change
    if (S.pad && on('pad') && (mod(idx, cb) === 0 || b === 0)) {
      const ch = chordOf(deg, 60), L = Math.max(tail, Math.min(cb * BAR, len - bs));
      ch.forEach((m, k) => voice(c, mo, S.pad!.inst, bs, m, L, S.pad!.g / Math.sqrt(ch.length), (k / Math.max(1, ch.length - 1)) * 1.2 - 0.6));
    }
    // chords
    for (const part of [S.chords, S.chords2]) {
      if (!part || E < (part.minE ?? 0.25)) continue;
      const ch = chordOf(deg, 60 + 12 * (part.oct ?? 0));
      hits(part.pat).forEach((h, hi) => {
        const t = tm(bs, h.s); if (!ok(t)) return;
        const L = last && hi === hits(part.pat).length - 1 ? len - t : h.n * step * 0.92;
        const up = part.strum && hi % 2 === 1, notes = up ? ch.slice(1).reverse() : ch;
        notes.forEach((m, k) => voice(c, mo, part.inst, t + (part.strum ? k * 0.012 : 0), m, L, part.g * vel(h.ch) * (up ? 0.7 : 1) / Math.sqrt(ch.length), (k / Math.max(1, notes.length - 1)) * 0.8 - 0.4));
      });
    }
    // bass
    if (S.bass && on('bass') && E >= 0.4) {
      const r0 = fold(degNote(M.scale, keyRoot, deg), 36 + 12 * (S.bass.oct ?? 0));
      for (const h of hits(S.bass.pat)) {
        const t = tm(bs, h.s); if (!ok(t)) continue;
        const m = h.ch === 'o' ? r0 + 12 : h.ch === '5' ? r0 + 7 : h.ch === '3' ? fold(degNote(M.scale, keyRoot, deg + 2), r0) : h.ch === 'a' ? fold(degNote(M.scale, keyRoot, nextDeg - 1), r0 - 2) : r0;
        voice(c, mo, S.bass.inst, t, m, last && h.s === hits(S.bass.pat)[hits(S.bass.pat).length - 1].s ? len - t : h.n * step * 0.95, S.bass.g, 0,
          S.bass.glide && prevBass && prevBass !== m && c.rnd() < 0.5 ? mtof(prevBass) : 0);
        prevBass = m;
      }
    }
    // arpeggio
    if (S.arp && on('arp') && E >= (S.arp.minE ?? 0.7) && !last) {
      const ch = chordOf(deg, 60 + 12 * (S.arp.oct ?? 0)), r = S.arp.rate ?? 1;
      for (let s = 0, i = 0; s < 16; s += r, i++) {
        const chr = S.arp.pat[i % S.arp.pat.length]; if (chr === '.') continue;
        if (S.arp.rand && c.rnd() > S.arp.rand) continue;
        const t = tm(bs, s); if (!ok(t)) continue;
        const n = +chr, m = ch[n % ch.length] + 12 * Math.floor(n / ch.length);
        voice(c, mo, S.arp.inst, t, m, r * step * (S.arp.rand ? 4 : 0.9), S.arp.g * (0.8 + 0.2 * (s % 4 === 0 ? 1 : 0)), Math.sin(i * 1.3) * 0.5);
      }
    }
    // melody: 2-bar phrases; the A section only plays the calls
    const unit = mod(Math.floor(idx / 2), 4), half = mod(idx, 2);
    if (on('melody') && E >= 0.6 && sec !== 'outro' && (sec !== 'A' || unit % 2 === 0)) {
      const chordSet = new Set([0, 2, 4].map((i) => mod(deg + i, 7)));
      for (const n of phrases[unit]) {
        if (Math.floor(n.s / 16) !== half) continue;
        let d = n.deg;
        if (n.strong && !chordSet.has(mod(d, 7))) d = chordSet.has(mod(d - 1, 7)) ? d - 1 : d + 1;
        const t = tm(bs, n.s % 16); if (!ok(t)) continue;
        voice(c, mo, S.lead.inst, t, degNote(M.scale, keyRoot + 12 + 12 * (S.lead.oct ?? 0), d), n.d * step * 0.9, S.lead.g, 0.1);
      }
    }
    // cinematic hits
    if (S.braams && sec === 'drop' && (prevSec !== 'drop' || mod(idx, 4) === 0)) I.braam(mo, c, Math.max(0, bs), degNote(M.scale, keyRoot, deg), BAR * 1.5, 0.9 * eScale);

    // ---- drums (deferred until after the sidechain)
    const kitOn = S.kit !== 'none';
    if (sec === 'build' && Math.round((bs - buildT) / BAR) === 0) I.noiseRiser(mo, c, buildT, dropT - buildT - beat * 0.25, 0.5);
    if (!on('drums') || (!kitOn && !S.tInst)) continue;
    if (sec === 'build') {
      const nb = Math.max(1, Math.round((dropT - buildT) / BAR)), bi = Math.round((bs - buildT) / BAR);
      for (let s = 0; s < 16; s++) {
        const t = bs + s * step; if (!ok(t)) continue;
        const prog01 = (bi + s / 16) / nb, every = prog01 < 0.5 ? 4 : prog01 < 0.75 ? 2 : 1;
        if (s % 4 === 0 && kitOn) drumEv.push(() => I.kick(dO, t, 0.9, S.kit as I.KickKind)), kicks.push(t);
        if (s % every === 0) {
          const g = 0.25 + 0.75 * prog01;
          drumEv.push(() => S.kit === 'chip' ? I.chipNoise(dO, c, t, g, 0.06) : S.tInst === 'timp' ? I.timpani(dO, c, t, mtof(keyRoot - 12), g * 0.6) : S.tInst === 'taiko' ? I.taiko(dO, c, t, g * 0.6) : I.snare(dO, c, t, g * 0.7));
          if (prog01 > 0.75 && s % every === 0 && every === 1) drumEv.push(() => I.snare(dO, c, t + step / 2, g * 0.5));
        }
      }
      continue;
    }
    const pat = sec === 'drop' ? S.B : S.A;
    const fill = (sec === 'A' || sec === 'drop') && mod(idx, 4) === 3 && section(bs + BAR + 0.01) === sec && E >= 0.6 && S.fill !== 'none';
    if ((sec === 'drop' && prevSec !== 'drop') || (sec === 'A' && prevSec === 'intro' && E >= 0.6)) {
      const t = Math.max(0, bs);
      if (kitOn || S.tInst) drumEv.push(() => I.crash(dO, c, t, sec === 'drop' ? 0.8 : 0.5));
      if (dropT && sec === 'drop' && prevSec === 'build') drumEv.push(() => I.subBoom(dO, c, t, 0.7));
    }
    const thr: Record<string, number> = { k: 0.5, h: 0.5, sh: 0.5, p: 0.5, s: 0.55, c: 0.55, r: 0.55, o: 0.75, t: 0.42 };
    for (const [k, line] of Object.entries(pat) as [keyof DrumPat, string][]) {
      if (E < thr[k] || (!kitOn && k !== 't')) continue;
      for (let s = 0; s < 16; s++) {
        const v = vel(line[(s + (line.length > 16 ? (b % 2) * 16 : 0)) % line.length]); if (!v) continue;
        if (fill && s >= 12 && (k === 's' || k === 'h' || k === 'c' || k === 'o' || k === 't')) continue;
        const t = tm(bs, s), g = v * (S.hum ? 0.85 + c.rnd() * 0.3 : 1);
        if (k === 'h' && S.rolls && sec === 'drop' && s % 4 === 0 && c.rnd() < 0.22) {
          const n = c.rnd() < 0.5 ? 3 : 4;
          for (let i = 0; i < n * 2; i++) { const tt = t + i * beat / n / 2; drumEv.push(() => I.hat(dO, c, tt, 0.5 + 0.4 * (i / n / 2))); }
          s += 3; continue;
        }
        switch (k) {
          case 'k': kicks.push(t); drumEv.push(() => I.kick(dO, t, 0.95 * g, S.kit as I.KickKind)); break;
          case 's': drumEv.push(() => S.kit === 'chip' ? I.chipNoise(dO, c, t, g, 0.09, 5000) : I.snare(dO, c, t, 0.75 * g, S.snareDecay ?? (S.kit === 'soft' ? 0.8 : 1), S.kit === 'soft' ? 0.6 : 1)); break;
          case 'c': drumEv.push(() => I.clap(dO, c, t, 0.7 * g)); break;
          case 'h': drumEv.push(() => S.kit === 'chip' ? I.chipNoise(dO, c, t, g * 0.5, 0.015, 14000) : I.hat(dO, c, t, 0.75 * g)); break;
          case 'o': drumEv.push(() => I.hat(dO, c, t, 0.55 * g, true)); break;
          case 'sh': drumEv.push(() => I.shaker(dO, c, t, 0.8 * g)); break;
          case 'r': drumEv.push(() => I.rim(dO, c, t, 0.7 * g, 0.3)); break;
          case 'p': drumEv.push(() => I.tick(dO, c, t, 0.7 * g, Math.sin(s) * 0.5)); break;
          case 't': drumEv.push(() => S.tInst === 'timp' ? I.timpani(dO, c, t, mtof(fold(degNote(M.scale, keyRoot, deg), 38)), 0.8 * g) : S.tInst === 'tom' ? I.tom(dO, c, t, 110, g) : I.taiko(dO, c, t, 0.8 * g, Math.sin(s) * 0.4)); break;
        }
      }
    }
    if (fill) for (let s = 12; s < 16; s++) {
      const t = tm(bs, s), g = 0.5 + (s - 12) * 0.15;
      drumEv.push(() => {
        if (S.fill === 'tom') I.tom(dO, c, t, [196, 165, 131, 98][s - 12], g, 0.4 - (s - 12) * 0.25);
        else if (S.fill === 'hat') for (let i = 0; i < 2; i++) I.hat(dO, c, t + i * step / 2, g * 0.7);
        else if (S.fill === 'chip') I.chipNoise(dO, c, t, g, 0.05, 4000 + s * 800);
        else if (S.fill === 'timp') I.timpani(dO, c, t, mtof(keyRoot - 12 + (s - 12) * 2), g * 0.6);
        else I.snare(dO, c, t, g * 0.8);
      });
    }
  }

  // ---- sidechain pump on the music, then the drums on top
  const side = S.side ?? 0;
  if (side > 0) for (const tk of kicks) {
    const s0 = Math.round(tk * SR), n = Math.round(0.4 * SR);
    for (let i = 0; i < n; i++) {
      const j = s0 + i; if (j < 0 || j >= mix[0].length) continue;
      const x = i / SR, g = 1 - side * (x < 0.004 ? x / 0.004 : Math.exp(-(x - 0.004) / 0.11));
      mix[0][j] *= g; mix[1][j] *= g;
    }
  }
  for (const ev of drumEv) ev();
  const wet = reverbWet(send);
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < mix[ch].length; i++) mix[ch][i] += wet[ch][i];
  if (S.fx?.crackle) I.crackle(out(mix), c, 0, len, S.fx.crackle * 0.15);
  if (S.fx?.lp) lowpass(mix, S.fx.lp);
  if (S.fx?.sat) saturate(mix, S.fx.sat);
  if (S.fx?.crush) crush(mix, S.fx.crush, 2);
  if (S.fx?.width) widen(mix, S.fx.width);
  return master(mix, 0.62, 1.5, introT > 0 ? 0.6 : 0.05, 1.2);
}
