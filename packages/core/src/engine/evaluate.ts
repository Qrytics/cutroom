// Timeline evaluation: what is on screen / in the speakers at time t. Pure functions of the project.
import { COMPONENTS } from '../components/index.ts';
import { SFX } from '../audio/synth.ts';
import { basePropDefs, defaultsOf, isAudible, isVisual, type PropDef } from '../schema/props.ts';
import type { Clip, Ease, Project, Props, Track } from '../schema/types.ts';
import { ease, hash, rng, sampleKeyframes } from './ease.ts';
import { mix } from '../components/draw.ts';

const defsCache = new Map<string, PropDef[]>();
export function propDefsFor(c: Pick<Clip, 'type' | 'component'>): PropDef[] {
  const key = `${c.type}:${c.component ?? ''}`;
  let d = defsCache.get(key);
  if (!d) {
    const extra = c.type === 'component' ? COMPONENTS[c.component ?? '']?.props ?? [] : c.type === 'sfx' ? SFX[c.component ?? '']?.props ?? [] : [];
    d = [...extra, ...basePropDefs(c.type)];
    defsCache.set(key, d);
  }
  return d;
}

const defaultsCache = new Map<string, Props>();
export function defaultPropsFor(c: Pick<Clip, 'type' | 'component'>): Props {
  const key = `${c.type}:${c.component ?? ''}`;
  let d = defaultsCache.get(key);
  if (!d) { d = defaultsOf(propDefsFor(c)); defaultsCache.set(key, d); }
  return d;
}

/** Props at clip-local time: defaults ← stored props ← keyframes. */
export function resolveProps(c: Clip, localT: number, size?: { width: number; height: number }): Props {
  const p: Props = { ...defaultPropsFor(c), ...c.props };
  for (const [k, kfs] of Object.entries(c.keyframes || {})) if (kfs?.length) p[k] = sampleKeyframes(kfs, localT);
  if (size) {
    if (p.x == null || Number.isNaN(p.x)) p.x = size.width / 2;
    if (p.y == null || Number.isNaN(p.y)) p.y = size.height / 2;
  }
  return p;
}

export interface Layer { clip: Clip; track: Track; localT: number; props: Props }

/** Stable synth seed for a sound clip (kept across splits). */
export function soundSeed(c: Clip) {
  return Number(c.props.seed ?? hash(c.id));
}

export function sortedTracks(p: Project, kind?: Track['kind']) {
  return Object.values(p.tracks).filter((t) => !kind || t.kind === kind).sort((a, b) => a.order - b.order);
}

export const clipEnd = (c: Clip) => c.start + c.duration;
export const clipActive = (c: Clip, t: number) => t >= c.start && t < c.start + c.duration;

/** Visual layers at t, bottom → top. */
export function visibleLayers(p: Project, t: number): Layer[] {
  const out: Layer[] = [];
  const size = { width: p.meta.width, height: p.meta.height };
  const byTrack = new Map<string, Clip[]>();
  for (const c of Object.values(p.clips)) {
    if (!isVisual(c.type) || !clipActive(c, t)) continue;
    (byTrack.get(c.trackId) ?? byTrack.set(c.trackId, []).get(c.trackId)!).push(c);
  }
  for (const track of sortedTracks(p, 'visual')) {
    if (track.hidden) continue;
    for (const clip of (byTrack.get(track.id) ?? []).sort((a, b) => a.start - b.start)) {
      const localT = t - clip.start;
      out.push({ clip, track, localT, props: resolveProps(clip, localT, size) });
    }
  }
  return out;
}

/** Source time inside the media for a video/audio clip at timeline time t. */
export function sourceTime(c: Clip, t: number) {
  return c.inPoint + (t - c.start) * (c.speed || 1);
}

export type MaskKind = 'wipeLeft' | 'wipeRight' | 'wipeUp' | 'wipeDown' | 'iris' | 'blinds' | 'split' | 'diagonal'
  | 'clock' | 'barnH' | 'barnV' | 'checker' | 'radial' | 'diamond' | 'diagUp' | 'diagDown' | 'venetian' | 'stripes' | 'ink' | 'slices';
export interface TransitionState {
  alpha: number; dx: number; dy: number; scale: number; rotate: number; blur: number;
  /** extra non-uniform scale (flips, whips, squash) */
  sx: number; sy: number;
  /** degrees, rotated around the top edge of the canvas box */
  swing: number;
  /** brightness multiplier (dips, light leaks, cube shading) and added sepia (film burn) */
  bright: number; sepia: number;
  /** reveal mask, k = 0 hidden … 1 fully shown */
  mask: null | { kind: MaskKind; k: number; seed: number };
}

const MASKED: Record<string, MaskKind> = {
  wipeLeft: 'wipeLeft', wipeRight: 'wipeRight', wipeUp: 'wipeUp', wipeDown: 'wipeDown', iris: 'iris', blinds: 'blinds', split: 'split', diagonal: 'diagonal',
  clockWipe: 'clock', barnDoorsH: 'barnH', barnDoorsV: 'barnV', checker: 'checker', radialIn: 'radial', diamond: 'diamond',
  wipeDiagonalUp: 'diagUp', wipeDiagonalDown: 'diagDown', venetian: 'venetian', stripes: 'stripes', inkReveal: 'ink', glitchSlice: 'slices',
};

/** Clip-in/out transition modifiers at local time. dx/dy are fractions of the canvas size. */
export function transitionState(props: Props, localT: number, duration: number, seed = 0): TransitionState {
  const st: TransitionState = { alpha: 1, dx: 0, dy: 0, scale: 1, rotate: 0, blur: 0, sx: 1, sy: 1, swing: 0, bright: 1, sepia: 0, mask: null };
  const apply = (type: string, k: number, entering: boolean, custom: string) => {
    // k: 0 = fully hidden, 1 = fully shown. A custom ease replaces each transition's own curve.
    if (custom) k = entering ? ease(custom as Ease, k) : 1 - ease(custom as Ease, 1 - k);
    const e = custom ? k : entering ? 1 - (1 - k) ** 3 : k * k * k;
    const inv = 1 - e, dir = entering ? 1 : -1;
    const own = (name: Ease) => (custom ? k : entering ? ease(name, k) : 1 - ease(name, 1 - k));
    if (MASKED[type]) {
      st.mask = { kind: MASKED[type], k: e, seed };
      if (type === 'glitchSlice' && k < 1) { const r = rng(mix(seed + Math.floor(localT * 24) * 131)); st.dx += (r() - 0.5) * 0.04 * (1 - k); }
      return;
    }
    switch (type) {
      case 'fade': st.alpha *= e; break;
      case 'slideLeft': st.dx += dir * inv; st.alpha *= Math.min(1, e * 3); break;
      case 'slideRight': st.dx -= dir * inv; st.alpha *= Math.min(1, e * 3); break;
      case 'slideUp': st.dy += dir * inv; st.alpha *= Math.min(1, e * 3); break;
      case 'slideDown': st.dy -= dir * inv; st.alpha *= Math.min(1, e * 3); break;
      case 'zoomIn': st.scale *= entering ? 0.6 + 0.4 * e : 1 + 0.4 * inv; st.alpha *= e; break;
      case 'zoomOut': st.scale *= entering ? 1.4 - 0.4 * e : 1 - 0.4 * inv; st.alpha *= e; break;
      case 'blur': st.blur += inv * 30; st.alpha *= e; break;
      case 'spin': st.rotate += inv * (entering ? -180 : 180); st.scale *= 0.3 + 0.7 * e; st.alpha *= e; break;
      case 'whipLeft': case 'whipRight': {
        const q = own('expoOut'), w = 1 - q;
        st.dx += (type === 'whipLeft' ? 1 : -1) * dir * w * 1.1; st.blur += w * 45; st.sx *= 1 + w * 0.35; st.alpha *= Math.min(1, q * 4); break;
      }
      case 'zoomBlur': st.scale *= 1 + inv * 0.9; st.blur += inv * 28; st.alpha *= e; break;
      case 'flipX': st.sx *= Math.max(0.001, entering && !custom ? ease('backOut', k) : e); break;
      case 'flipY': st.sy *= Math.max(0.001, entering && !custom ? ease('backOut', k) : e); break;
      case 'drop': st.dy -= entering ? (1 - own('bounceOut')) * 1.1 : -inv * 1.1; st.alpha *= Math.min(1, k * 4); break;
      case 'rise': st.dy += dir * inv * 0.12; st.alpha *= e; break;
      case 'glitch': if (k < 1) {
        const r = rng(mix(seed + Math.floor(localT * 30) * 7919 + (entering ? 1 : 2)));
        st.dx += (r() - 0.5) * 0.12 * (1 - k); st.dy += (r() - 0.5) * 0.03 * (1 - k); st.sx *= 1 + (r() - 0.5) * 0.2 * (1 - k);
        st.alpha *= Math.min(1, k * 2.5) * (r() < 0.45 * (1 - k) ? 0.15 : 1);
      } break;
      case 'swing': st.swing += inv * (entering ? -75 : 75); st.alpha *= Math.min(1, e * 2); break;
      case 'stretch': {
        const q = entering && !custom ? ease('spring', k) : e;
        st.sy *= Math.max(0.001, q); st.sx *= Math.max(0.4, Math.min(1.6, 1 + (1 - q) * 0.5)); st.alpha *= Math.min(1, k * 4); break;
      }
      // ---- pushes and slides: full-frame moves with no fade
      case 'pushLeft': st.dx += dir * (1 - own('easeInOut')); break;
      case 'pushRight': st.dx -= dir * (1 - own('easeInOut')); break;
      case 'pushUp': st.dy += dir * (1 - own('easeInOut')); break;
      case 'pushDown': st.dy -= dir * (1 - own('easeInOut')); break;
      case 'slideFadeUp': st.dy += dir * inv * 0.08; st.alpha *= e; break;
      case 'slideFadeDown': st.dy -= dir * inv * 0.08; st.alpha *= e; break;
      // ---- scale family
      case 'zoomRotate': st.scale *= 0.3 + 0.7 * e; st.rotate += inv * (entering ? -90 : 90); st.alpha *= e; break;
      case 'zoomPunch': { const q = Math.max(0, own('backOut')); st.scale *= 0.45 + 0.55 * q; st.alpha *= Math.min(1, k * 3); break; }
      case 'shrink': st.scale *= entering ? 1 + inv * 0.5 : Math.max(0.001, e); st.alpha *= entering ? e : Math.min(1, e * 2); break;
      case 'grow': st.scale *= entering ? Math.max(0.001, e) : 1 + inv * 0.5; st.alpha *= entering ? Math.min(1, e * 2) : e; break;
      case 'elastic': st.scale *= Math.max(0.001, own('elasticOut')); st.alpha *= Math.min(1, k * 3); break;
      case 'blurZoom': st.scale *= 1 - inv * 0.3; st.blur += inv * 25; st.alpha *= e; break;
      case 'pixelate': { const steps = Math.round(inv * 6); st.blur += steps * 5; st.scale *= 1 + steps * 0.01; st.alpha *= Math.min(1, e * 2); break; }
      // ---- fake 3D
      case 'flipUp': st.sy *= Math.max(0.001, e); st.dy += dir * inv * 0.05; st.bright *= 0.6 + 0.4 * e; break;
      case 'flipDown': st.sy *= Math.max(0.001, e); st.dy -= dir * inv * 0.05; st.bright *= 0.6 + 0.4 * e; break;
      case 'cubeLeft': case 'cubeRight': {
        const side = type === 'cubeLeft' ? 1 : -1;
        st.sx *= Math.max(0.001, e); st.dx += side * dir * inv * 0.5; st.bright *= 0.45 + 0.55 * e; break;
      }
      case 'rollIn': st.rotate += inv * (entering ? -120 : 120); st.dx -= dir * inv * 0.8; st.alpha *= e; break;
      case 'squeezeH': st.sx *= Math.max(0.001, e); st.alpha *= Math.min(1, e * 3); break;
      case 'squeezeV': st.sy *= Math.max(0.001, e); st.alpha *= Math.min(1, e * 3); break;
      case 'bounceIn': st.dy -= entering ? (1 - own('bounceOut')) * 0.6 : -inv * 0.6; st.alpha *= Math.min(1, k * 4); break;
      case 'jello': { const w = Math.sin(k * Math.PI * 4) * (1 - k) * 0.25; st.sx *= 1 + w; st.sy *= 1 - w; st.scale *= 0.85 + 0.15 * e; st.alpha *= Math.min(1, k * 4); break; }
      // ---- light
      case 'lightLeak': st.bright *= 1 + inv * 1.6; st.sepia += inv * 0.5; st.alpha *= e; break;
      case 'dipToBlack': st.bright *= e; st.alpha *= Math.min(1, e * 1.5); break;
      case 'dipToWhite': st.bright *= 1 + inv * 3; st.alpha *= Math.min(1, e * 2); break;
      case 'filmBurn': st.bright *= 1 + inv * 1.8; st.sepia += inv * 0.8; st.alpha *= e; break;
    }
  };
  const tin = String(props.transitionIn ?? 'none'), din = Number(props.transitionInDuration ?? 0.5);
  const tout = String(props.transitionOut ?? 'none'), dout = Number(props.transitionOutDuration ?? 0.5);
  if (tin !== 'none' && din > 0 && localT < din) apply(tin, localT / din, true, String(props.transitionInEase ?? ''));
  if (tout !== 'none' && dout > 0 && localT > duration - dout) apply(tout, (duration - localT) / dout, false, String(props.transitionOutEase ?? ''));
  return st;
}

/** Emphasis ("attention") moves: one-shot or repeating, on any visual clip. dx/dy in canvas px, rot degrees. */
export function emphasisState(props: Props, localT: number, W: number) {
  const m = { dx: 0, dy: 0, rot: 0, scale: 1, sx: 1, sy: 1, alpha: 1 };
  const kind = String(props.emphasis ?? 'none');
  if (kind === 'none') return m;
  const at = Number(props.emphasisAt ?? 0.5), dur = Math.max(0.05, Number(props.emphasisDuration ?? 0.8));
  const rep = Math.max(0, Math.round(Number(props.emphasisRepeat ?? 1))), gap = Math.max(0, Number(props.emphasisInterval ?? 0.4));
  const t = localT - at;
  if (t < 0) return m;
  const cyc = dur + gap, i = Math.floor(t / cyc);
  if (rep > 0 && i >= rep) return m;
  const u = (t - i * cyc) / dur;
  if (u > 1) return m;
  const a = Number(props.emphasisAmount ?? 1), px = (W / 1920) * a, bell = Math.sin(Math.PI * u), decay = 1 - u;
  const osc = (n: number) => Math.sin(u * Math.PI * 2 * n) * decay;
  switch (kind) {
    case 'pulse': m.scale = 1 + 0.08 * a * bell; break;
    case 'heartbeat': { const b = (c: number) => Math.max(0, 1 - Math.abs(u - c) / 0.12); m.scale = 1 + 0.13 * a * Math.max(b(0.18), b(0.48) * 0.8); break; }
    case 'shake': m.dx = osc(5) * 22 * px; break;
    case 'shakeY': m.dy = osc(5) * 18 * px; break;
    case 'wobble': m.dx = osc(2.5) * 60 * px; m.rot = -osc(2.5) * 5 * a; break;
    case 'tada': m.scale = 1 + (u < 0.2 ? -0.08 : 0.1 * decay) * a; m.rot = u < 0.2 ? -3 * a * Math.sin(u * 40) : osc(4) * 4 * a; break;
    case 'jello': { const w = osc(3) * 0.18 * a; m.sx = 1 + w; m.sy = 1 - w; break; }
    case 'bounce': m.dy = -Math.abs(Math.sin(u * Math.PI * 3)) * decay * 60 * px; break;
    case 'rubberBand': { const w = osc(2) * 0.25 * a; m.sx = 1 + w; m.sy = 1 - w * 0.8; break; }
    case 'swing': m.rot = osc(2) * 15 * a; break;
    case 'flash': m.alpha = 1 - Math.max(0, Math.sin(u * Math.PI * 4)) * Math.min(1, a); break;
    case 'headShake': m.dx = osc(2) * 14 * px; m.rot = osc(2) * 6 * a; break;
    case 'pop': m.scale = 1 + 0.22 * a * (u < 0.35 ? ease('backOut', u / 0.35) : 1 - ease('easeInOut', (u - 0.35) / 0.65)); break;
    case 'spin': m.rot = 360 * ease('easeInOut', u) * a; break;
    case 'flipX': m.sx = Math.cos(u * Math.PI * 2); break;
    case 'flipY': m.sy = Math.cos(u * Math.PI * 2); break;
    case 'float': m.dy = -bell * 24 * px; break;
    case 'zoomIn': m.scale = 1 + 0.15 * a * bell; break;
    case 'zoomOut': m.scale = 1 - 0.13 * a * bell; break;
    case 'nudgeLeft': m.dx = -bell * 28 * px; break;
    case 'nudgeRight': m.dx = bell * 28 * px; break;
    case 'jump': {
      const h = u < 0.75 ? Math.sin(Math.PI * u / 0.75) : 0, land = u >= 0.75 ? Math.sin(Math.PI * (u - 0.75) / 0.25) : 0, pre = u < 0.12 ? Math.sin(Math.PI * u / 0.12) : 0;
      m.dy = -h * 80 * px; m.sy = 1 - (land * 0.15 + pre * 0.1) * a; m.sx = 1 + (land * 0.12 + pre * 0.08) * a; break;
    }
    case 'squash': { const w = bell * 0.2 * a; m.sx = 1 + w; m.sy = 1 - w; break; }
    case 'wiggle': m.rot = osc(4) * 8 * a; break;
    case 'blink': m.alpha = u > 0.3 && u < 0.7 ? 0 : 1; break;
    case 'breathe': m.scale = 1 + 0.04 * a * bell; break;
    case 'tilt': m.rot = bell * 8 * a; break;
  }
  return m;
}

/** smooth deterministic noise in about [-1, 1] */
const wob = (t: number, ph: number) => Math.sin(t + ph) * 0.5 + Math.sin(t * 2.13 + ph * 1.7) * 0.3 + Math.sin(t * 3.71 + ph * 2.9) * 0.2;

/** Continuous "motion" preset offsets at clip-local time. dx/dy in canvas px (scaled to the canvas width), rot in degrees. */
export function motionState(props: Props, localT: number, seed: number, W: number) {
  const m = { dx: 0, dy: 0, rot: 0, scale: 1, alpha: 1 };
  const kind = String(props.motion ?? 'none');
  if (kind === 'none') return m;
  const a = Number(props.motionAmount ?? 1), t = localT * Number(props.motionSpeed ?? 1), u = W / 1920;
  const p1 = (seed % 997) / 97, p2 = (seed % 613) / 61, p3 = (seed % 389) / 37;
  switch (kind) {
    case 'float': m.dy = Math.sin(t * 1.4 + p1) * 10 * a * u; m.dx = Math.sin(t * 0.9 + p2) * 4 * a * u; break;
    case 'sway': m.rot = Math.sin(t * 1.2 + p1) * 2.5 * a; break;
    case 'wiggle': m.dx = wob(t * 3, p1) * 8 * a * u; m.dy = wob(t * 3, p2) * 8 * a * u; m.rot = wob(t * 2.5, p3) * 1.5 * a; break;
    case 'shake': m.dx = wob(t * 28, p1) * 10 * a * u; m.dy = wob(t * 31, p2) * 10 * a * u; m.rot = wob(t * 25, p3) * 0.8 * a; break;
    case 'handheld': m.dx = wob(t * 0.7, p1) * 14 * a * u; m.dy = wob(t * 0.6, p2) * 10 * a * u; m.rot = wob(t * 0.5, p3) * 0.6 * a; m.scale = 1 + 0.025 * a; break;
    case 'pulse': m.scale = 1 + (Math.sin(t * 2 * Math.PI) * 0.5 + 0.5) * 0.04 * a; break;
    case 'breathe': m.scale = 1 + Math.sin(t * 0.8 + p1) * 0.02 * a; break;
    case 'spin': m.rot = t * 30 * a; break;
    case 'orbit': m.dx = Math.cos(t * 1.2 + p1) * 30 * a * u; m.dy = Math.sin(t * 1.2 + p1) * 30 * a * u; break;
    case 'bob': m.dy = -Math.abs(Math.sin(t * 3 + p1)) * 16 * a * u; break;
    case 'flicker': { const r = rng(mix(seed + Math.floor(t * 15)))(); m.alpha = Math.max(0, r < 0.15 * a ? 0.4 : 1 - 0.08 * a * r); break; }
  }
  return m;
}

// ---------------------------------------------------------------- audio plan
export interface AudioItem {
  clip: Clip;
  /** timeline start of the audible part, seconds */
  start: number;
  /** offset into the source buffer at `start` */
  offset: number;
  duration: number;
  rate: number;
  pan: number;
  /** [timelineTime, gain] breakpoints; linear ramps between */
  gain: [number, number][];
}

export function audioPlan(p: Project, duck = 0.3): AudioItem[] {
  const tracks = p.tracks;
  const clips = Object.values(p.clips).filter((c) => isAudible(c.type) && !tracks[c.trackId]?.muted);
  const voice: [number, number][] = clips
    .filter((c) => resolveProps(c, 0).voice && !resolveProps(c, 0).muted)
    .map((c) => [c.start, clipEnd(c)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: AudioItem[] = [];
  for (const c of clips) {
    const p0 = resolveProps(c, 0);
    if (p0.muted) continue;
    if (c.type === 'video' && !p.media[c.mediaId ?? '']?.hasAudio) continue;
    const volKf = c.keyframes?.volume?.length;
    const fi = Number(p0.fadeIn) || 0, fo = Number(p0.fadeOut) || 0;
    const pts: number[] = [0, c.duration];
    if (fi) pts.push(fi);
    if (fo) pts.push(c.duration - fo);
    if (volKf) for (let t = 0; t < c.duration; t += 0.05) pts.push(t);
    if (p0.duckUnder) for (const [a, b] of voice) pts.push(a - c.start - 0.3, a - c.start, b - c.start, b - c.start + 0.4);
    const uniq = [...new Set(pts.filter((t) => t >= 0 && t <= c.duration).map((t) => +t.toFixed(4)))].sort((a, b) => a - b);
    const gain: [number, number][] = uniq.map((lt) => {
      const pr = volKf ? resolveProps(c, lt) : p0;
      let g = Number(pr.volume ?? 1);
      if (fi && lt < fi) g *= lt / fi;
      if (fo && lt > c.duration - fo) g *= Math.max(0, (c.duration - lt) / fo);
      if (p0.duckUnder) {
        const T = c.start + lt;
        if (voice.some(([a, b]) => T >= a && T <= b)) g *= duck;
      }
      return [c.start + lt, g];
    });
    out.push({ clip: c, start: c.start, offset: c.inPoint, duration: c.duration, rate: c.speed || 1, pan: Number(p0.pan) || 0, gain });
  }
  return out;
}
