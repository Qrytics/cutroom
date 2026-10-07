// Shared building blocks for components: prop-definition helpers, the in/out envelope and text styles.
import type { PropDef } from '../schema/props.ts';
import { FONTS } from '../schema/props.ts';
import type { Props } from '../schema/types.ts';
import { clamp, ease, lerp, rng, win } from '../engine/ease.ts';
import { ANIM_IN, ANIM_OUT, mix, TEXT_LOOPS, type AnimOpts, type Ctx, type FrameInfo, type TextStyle } from './draw.ts';

export interface ComponentDef {
  key: string;
  label: string;
  category: 'Text' | 'Graphics' | 'Data' | 'Screen' | 'Background' | 'Transition' | 'Effects' | 'Social';
  description: string;
  defaultDuration: number;
  props: PropDef[];
  draw(ctx: Ctx, p: Props, f: FrameInfo): void;
}

// ---------------------------------------------------------------- prop helpers
export const G = { content: 'Content', style: 'Style', anim: 'Animation', layout: 'Layout' };
export const text = (key: string, label: string, def: string, group = G.content, long = false): PropDef =>
  ({ key, label, type: long ? 'longtext' : 'text', group, default: def });
export const num = (key: string, label: string, def: number, min?: number, max?: number, step = 1, group = G.style, animatable = true): PropDef =>
  ({ key, label, type: 'number', group, default: def, min, max, step, animatable });
export const color = (key: string, label: string, def: string, group = G.style): PropDef => ({ key, label, type: 'color', group, default: def, animatable: true });
export const select = (key: string, label: string, def: string, options: string[], group = G.style): PropDef => ({ key, label, type: 'select', group, default: def, options });
export const bool = (key: string, label: string, def: boolean, group = G.style): PropDef => ({ key, label, type: 'bool', group, default: def });
export const font = (key = 'font', def = 'Inter'): PropDef => ({ key, label: 'Font', type: 'font', group: G.style, default: def, options: FONTS });

export const animProps = (inDef = 'rise', outDef = 'fade', inDur = 0.6, outDur = 0.4): PropDef[] => [
  select('animIn', 'Animate in', inDef, ANIM_IN, G.anim),
  num('inDur', 'In duration', inDur, 0, 20, 0.05, G.anim, false),
  select('animOut', 'Animate out', outDef, ANIM_OUT, G.anim),
  num('outDur', 'Out duration', outDur, 0, 10, 0.05, G.anim, false),
  num('stagger', 'Word stagger', 0.06, 0, 2, 0.01, G.anim, false),
  select('loop', 'Loop while on screen', 'none', TEXT_LOOPS, G.anim),
  num('loopAmount', 'Loop amount', 1, 0, 10, 0.05, G.anim),
];
export const animOf = (p: Props): AnimOpts => ({
  animIn: String(p.animIn ?? 'none'), animOut: String(p.animOut ?? 'none'),
  inDur: Number(p.inDur ?? 0.6), outDur: Number(p.outDur ?? 0.4), stagger: Number(p.stagger ?? 0.06),
  loop: String(p.loop ?? 'none'), loopAmount: Number(p.loopAmount ?? 1),
});
export const S = (p: Props, k: string) => String(p[k] ?? '');
export const N = (p: Props, k: string) => Number(p[k] ?? 0);
export const B = (p: Props, k: string) => Boolean(p[k]);

/** overall in/out envelope for non-text components */
export function envelope(p: Props, f: FrameInfo) {
  const a = animOf(p);
  const kin = a.animIn === 'none' ? 1 : win(f.t, 0, a.inDur, 'easeOut');
  const kout = a.animOut === 'none' ? 0 : win(f.t, f.duration - a.outDur, a.outDur, 'easeIn');
  return { kin, kout, alpha: kin * (1 - kout), a };
}
/** Whole-block version of every text animation, for components that move as one piece. */
export function applyEnvelope(ctx: Ctx, p: Props, f: FrameInfo, cx: number, cy: number) {
  const { kin, kout, a } = envelope(p, f);
  const lin = win(f.t, 0, a.inDur, 'linear'), lout = a.animOut === 'none' ? 0 : win(f.t, f.duration - a.outDur, a.outDur, 'linear');
  let alpha = clamp(kin * 1.4) * (1 - kout);
  let s = 1, sx = 1, sy = 1, dy = 0, dx = 0, skew = 0, blur = 0, rot = 0, hue = 0;
  const jit = (salt: number) => rng(mix(f.seed + salt + Math.floor(f.t * 30) * 7919));
  switch (a.animIn) {
    case 'pop': case 'wordsPop': case 'charsPop': s *= lerp(0.6, 1, ease('backOut', lin)); break;
    case 'scaleDown': s *= lerp(1.4, 1, kin); break;
    case 'rise': case 'wordsUp': case 'charsUp': case 'waveIn': case 'letters': dy += (1 - kin) * 60; break;
    case 'maskUp': dy += (1 - ease('quartOut', lin)) * 80; break;
    case 'drop': dy -= (1 - kin) * 60; break;
    case 'slideLeft': dx += (1 - kin) * 200; break;
    case 'slideRight': case 'splitIn': dx -= (1 - kin) * (a.animIn === 'splitIn' ? 320 : 200); break;
    case 'blurIn': blur = (1 - kin) * 20; break;
    case 'zoomBlur': s *= lerp(2.4, 1, kin); blur = (1 - kin) * 18; break;
    case 'tracking': sx *= lerp(1.35, 1, ease('expoOut', lin)); break;
    case 'flipUp': sy *= Math.max(0.001, ease('backOut', lin)); break;
    case 'skewIn': skew = -(1 - kin) * 0.5; dx += (1 - kin) * 90; break;
    case 'elastic': s *= Math.max(0.001, ease('elasticOut', lin)); alpha = clamp(lin * 3) * (1 - kout); break;
    case 'stamp': {
      s *= lerp(2.2, 1, ease('snap', lin)); alpha = clamp(lin * 6) * (1 - kout);
      const after = f.t - a.inDur * 0.35;
      if (after > 0 && after < 0.3) { dx += Math.sin(after * 95) * 8 * (1 - after / 0.3); dy += Math.cos(after * 80) * 6 * (1 - after / 0.3); }
      break;
    }
    case 'glitchIn': case 'scramble': case 'shuffle': if (lin < 1) { const r = jit(1); dx += (r() - 0.5) * 80 * (1 - lin); if (r() < 0.35 * (1 - lin)) alpha *= 0.15; } break;
    case 'charsBlur': case 'wordsBlur': blur = (1 - kin) * 18; break;
    case 'charsRotate': case 'wordsRotate': rot = -(1 - kin) * 0.4; dy += (1 - kin) * 30; break;
    case 'charsFlip': case 'unfold': sx *= Math.max(0.001, ease('backOut', lin)); break;
    case 'wave3d': sy *= Math.max(0.001, ease('backOut', lin)); dy -= Math.sin(Math.PI * lin) * 20; break;
    case 'charsDrop': dy -= (1 - kin) * 70; break;
    case 'cascade': dy -= (1 - ease('bounceOut', lin)) * 120; alpha = clamp(lin * 4) * (1 - kout); break;
    case 'charsZoom': s *= lerp(2.2, 1, kin); break;
    case 'wordsSlideLeft': dx += (1 - kin) * 120; break;
    case 'wordsSlideRight': dx -= (1 - kin) * 120; break;
    case 'linesUp': dy += (1 - kin) * 50; break;
    case 'neonFlicker': if (lin < 1) { const r = jit(3); if (lin <= 0 || r() < 0.55 * (1 - lin)) alpha *= 0.08; } break;
    // typewriterFade, charsFade, linesFade, spotlight, highlightSweep: the plain fade-in of the envelope
  }
  switch (a.animOut) {
    case 'sink': case 'wordsDown': case 'charsDown': case 'maskDown': dy += kout * 60; break;
    case 'lift': dy -= kout * 60; break;
    case 'pop': s *= 1 - kout * 0.5; break;
    case 'slideLeft': dx -= kout * 200; break;
    case 'slideRight': dx += kout * 200; break;
    case 'blurOut': blur = kout * 20; break;
    case 'zoomOut': s *= 1 + kout * 1.4; blur = kout * 14; break;
    case 'flipDown': sy *= Math.max(0.001, 1 - kout); break;
    case 'trackingOut': sx *= 1 + kout * 0.35; break;
    case 'glitchOut': case 'scrambleOut': if (lout > 0) { const r = jit(2); dx += (r() - 0.5) * 80 * lout; if (r() < 0.5 * lout) alpha *= 0.1; } break;
    case 'blink': alpha = clamp(kin * 1.4) * (lout >= 1 ? 0 : Math.floor(lout * 8) % 2 === 0 ? 1 : 0); break;
    case 'charsBlur': blur = kout * 16; break;
    case 'charsUp': case 'wordsUp': dy -= kout * 60; break;
    case 'linesDown': dy += kout * 50; break;
    case 'charsScatter': s *= 1 + kout * 0.4; rot += kout * 0.3; blur = kout * 8; break;
    case 'zoomBlurOut': s *= 1 + kout * 2; blur = kout * 18; break;
    case 'flipOut': sy *= Math.max(0.001, 1 - kout); rot += kout * 0.15; break;
    case 'shrink': s *= Math.max(0.001, 1 - kout); break;
    case 'neonFlickerOut': if (lout > 0) { const r = jit(4); if (lout >= 1 || r() < 0.6 * lout) alpha *= 0.08; } break;
    // charsFade, wordsFade, typeBack: the plain fade-out of the envelope
  }
  const amt = Number(p.loopAmount ?? 1) * clamp(kin);
  switch (String(p.loop ?? 'none')) {
    case 'float': case 'wave': dy += Math.sin(f.t * 1.6) * 8 * amt; break;
    case 'pulse': s *= 1 + (Math.sin(f.t * 3.2) * 0.5 + 0.5) * 0.04 * amt; break;
    case 'jitter': { const r = rng(mix(f.seed + Math.floor(f.t * 12) * 31)); dx += (r() - 0.5) * 6 * amt; dy += (r() - 0.5) * 6 * amt; break; }
    case 'bounce': dy -= Math.abs(Math.sin(f.t * 3.4)) * 10 * amt; break;
    case 'sway': rot += Math.sin(f.t * 1.6) * 0.04 * amt; break;
    case 'flicker': if (rng(mix(f.seed + Math.floor(f.t * 14) * 53))() < 0.07 * amt) alpha *= 0.3; break;
    case 'breathe': s *= 1 + Math.sin(f.t * 1.3) * 0.03 * amt; break;
    case 'rainbow': hue = (f.t * 80) % 360; break;
  }
  ctx.globalAlpha *= alpha;
  const fl = [blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : '', hue ? `hue-rotate(${hue.toFixed(0)}deg)` : ''].filter(Boolean).join(' ');
  if (fl) ctx.filter = fl;
  ctx.translate(cx + dx, cy + dy); if (rot) ctx.rotate(rot); if (skew) ctx.transform(1, 0, skew, 1, 0, 0); ctx.scale(s * sx, s * sy); ctx.translate(-cx, -cy);
}

export const styleOf = (p: Props, sizeKey = 'size', colorKey = 'color'): TextStyle => ({
  font: S(p, 'font') || 'Inter', size: N(p, sizeKey) || 64, weight: N(p, 'weight') || 700, color: S(p, colorKey) || '#fff',
  align: (S(p, 'align') || 'center') as TextStyle['align'], lineHeight: N(p, 'lineHeight') || 1.15,
  letterSpacing: N(p, 'letterSpacing'), maxWidth: N(p, 'maxWidth'), uppercase: B(p, 'uppercase'), italic: B(p, 'italic'),
});

