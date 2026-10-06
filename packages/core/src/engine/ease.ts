import type { Ease, Keyframe } from '../schema/types.ts';

export const EASES: Ease[] = ['linear', 'hold', 'easeIn', 'easeOut', 'easeInOut', 'backOut', 'backIn', 'elasticOut', 'bounceOut', 'expoOut', 'expoIn', 'circOut',
  'sineInOut', 'quartOut', 'quintOut', 'circIn', 'backInOut', 'anticipate', 'spring', 'snap'];

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function ease(name: Ease | undefined, k: number): number {
  k = clamp(k);
  switch (name) {
    case 'hold': return k < 1 ? 0 : 1;
    case 'easeIn': return k * k * k;
    case 'easeOut': return 1 - (1 - k) ** 3;
    case 'easeInOut': return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
    case 'backOut': { const c = 1.70158; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; }
    case 'backIn': { const c = 1.70158; return (c + 1) * k * k * k - c * k * k; }
    case 'elasticOut': return k === 0 || k === 1 ? k : 2 ** (-10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
    case 'bounceOut': {
      const n = 7.5625, d = 2.75;
      if (k < 1 / d) return n * k * k;
      if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
      if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
      return n * (k -= 2.625 / d) * k + 0.984375;
    }
    case 'expoOut': return k === 1 ? 1 : 1 - 2 ** (-10 * k);
    case 'expoIn': return k === 0 ? 0 : 2 ** (10 * k - 10);
    case 'circOut': return Math.sqrt(1 - (k - 1) ** 2);
    case 'circIn': return 1 - Math.sqrt(1 - k * k);
    case 'sineInOut': return -(Math.cos(Math.PI * k) - 1) / 2;
    case 'quartOut': return 1 - (1 - k) ** 4;
    case 'quintOut': return 1 - (1 - k) ** 5;
    case 'backInOut': {
      const c = 1.70158 * 1.525;
      return k < 0.5 ? ((2 * k) ** 2 * ((c + 1) * 2 * k - c)) / 2 : ((2 * k - 2) ** 2 * ((c + 1) * (k * 2 - 2) + c) + 2) / 2;
    }
    // pulls back first, then shoots past and settles — cartoony wind-up
    case 'anticipate': return k < 0.3 ? -0.12 * Math.sin((k / 0.3) * Math.PI / 2) : -0.12 + 1.12 * ease('backOut', (k - 0.3) / 0.7);
    // damped spring: fast, two soft overshoots
    case 'spring': return k === 1 ? 1 : 1 - Math.exp(-6.5 * k) * Math.cos(k * 4.6 * Math.PI);
    // most of the motion in the first fifth, then a long settle — punchy "snap into place"
    case 'snap': return 1 - (1 - k) ** 9;
    default: return k;
  }
}

/** progress 0..1 of a window [a, a+len] at time t, eased */
export const win = (t: number, a: number, len: number, e: Ease = 'easeOut') => ease(e, len <= 0 ? (t >= a ? 1 : 0) : (t - a) / len);

// ---------------------------------------------------------------- colors
export function parseColor(c: string): [number, number, number, number] | null {
  c = c.trim();
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const v = parseInt(h, 16);
    if (h.length === 6) return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 1];
    return [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, (v & 255) / 255];
  }
  const m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  return null;
}
export const rgba = (c: [number, number, number, number]) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+c[3].toFixed(3)})`;
export function mixColor(a: string, b: string, k: number) {
  const A = parseColor(a), B = parseColor(b);
  if (!A || !B) return k < 0.5 ? a : b;
  return rgba([lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k), lerp(A[3], B[3], k)]);
}
export function withAlpha(c: string, a: number) {
  const p = parseColor(c);
  return p ? rgba([p[0], p[1], p[2], p[3] * a]) : c;
}

// ---------------------------------------------------------------- keyframes
/** Value of an animated property at clip-local time t. Numbers and colors interpolate; anything else steps. */
export function sampleKeyframes(kfs: Keyframe[], t: number): number | string {
  if (kfs.length === 1 || t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (i < kfs.length - 2 && t >= kfs[i + 1].t) i++;
  const a = kfs[i], b = kfs[i + 1];
  const k = ease(a.ease ?? 'easeInOut', (t - a.t) / Math.max(1e-6, b.t - a.t));
  if (typeof a.v === 'number' && typeof b.v === 'number') return lerp(a.v, b.v, k);
  if (typeof a.v === 'string' && typeof b.v === 'string' && parseColor(a.v) && parseColor(b.v)) return mixColor(a.v, b.v, k);
  return k < 1 ? a.v : b.v;
}

// ---------------------------------------------------------------- deterministic random
export function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
