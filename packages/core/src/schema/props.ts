// Property definitions drive the inspector UI, op validation docs for Claude, and default values.
import type { ClipType, Props } from './types.ts';
import { EASES } from '../engine/ease.ts';

export type PropType = 'number' | 'text' | 'longtext' | 'color' | 'select' | 'bool' | 'font';

export interface PropDef {
  key: string;
  label: string;
  type: PropType;
  group: string;
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  /** can be animated with keyframes */
  animatable?: boolean;
  hint?: string;
}

export const FONTS = [
  'Inter', 'IBM Plex Sans', 'IBM Plex Mono', 'JetBrains Mono', 'Space Grotesk', 'Playfair Display', 'Bebas Neue',
  'Syne', 'DM Serif Display', 'Archivo Black', 'Instrument Serif', 'Unbounded', 'Sora', 'Fraunces', 'Anton', 'Space Mono',
  'Manrope', 'Outfit', 'Major Mono Display', 'Caveat',
  'system-ui', 'Georgia', 'Helvetica',
];

export const TRANSITIONS = ['none', 'fade', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'zoomIn', 'zoomOut', 'wipeLeft', 'wipeRight', 'blur', 'spin',
  'iris', 'wipeUp', 'wipeDown', 'diagonal', 'blinds', 'split', 'whipLeft', 'whipRight', 'zoomBlur', 'flipX', 'flipY', 'drop', 'rise', 'glitch', 'swing', 'stretch',
  'pushLeft', 'pushRight', 'pushUp', 'pushDown', 'slideFadeUp', 'slideFadeDown', 'zoomRotate', 'zoomPunch', 'shrink', 'grow', 'elastic', 'blurZoom', 'pixelate',
  'flipUp', 'flipDown', 'cubeLeft', 'cubeRight', 'rollIn', 'squeezeH', 'squeezeV', 'bounceIn', 'jello',
  'clockWipe', 'barnDoorsH', 'barnDoorsV', 'checker', 'radialIn', 'diamond', 'wipeDiagonalUp', 'wipeDiagonalDown', 'venetian', 'stripes', 'inkReveal', 'glitchSlice',
  'lightLeak', 'dipToBlack', 'dipToWhite', 'filmBurn'];
/** one-shot or repeating attention moves on any visual clip (Animate.css-style) */
export const EMPHASES = ['none', 'pulse', 'heartbeat', 'shake', 'shakeY', 'wobble', 'tada', 'jello', 'bounce', 'rubberBand', 'swing', 'flash', 'headShake', 'pop',
  'spin', 'flipX', 'flipY', 'float', 'zoomIn', 'zoomOut', 'nudgeLeft', 'nudgeRight', 'jump', 'squash', 'wiggle', 'blink', 'breathe', 'tilt'];
export const MOTIONS = ['none', 'float', 'sway', 'wiggle', 'shake', 'handheld', 'pulse', 'breathe', 'spin', 'orbit', 'bob', 'flicker'];
export const BLEND_MODES = ['source-over', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'color-dodge', 'difference', 'soft-light', 'hard-light'];

const n = (key: string, label: string, group: string, def: number | null, min?: number, max?: number, step = 1, animatable = true): PropDef =>
  ({ key, label, type: 'number', group, default: def, min, max, step, animatable });

/** Position/size of every visual clip. x/y are the clip's center in canvas pixels. */
export const TRANSFORM_PROPS: PropDef[] = [
  n('x', 'X', 'Transform', null, undefined, undefined, 1),
  n('y', 'Y', 'Transform', null, undefined, undefined, 1),
  n('scale', 'Scale', 'Transform', 1, 0, 20, 0.01),
  n('scaleX', 'Scale X', 'Transform', 1, -20, 20, 0.01),
  n('scaleY', 'Scale Y', 'Transform', 1, -20, 20, 0.01),
  n('rotation', 'Rotation°', 'Transform', 0, -3600, 3600, 0.5),
  n('opacity', 'Opacity', 'Transform', 1, 0, 1, 0.01),
  n('anchorX', 'Anchor X', 'Transform', 0.5, 0, 1, 0.01),
  n('anchorY', 'Anchor Y', 'Transform', 0.5, 0, 1, 0.01),
];

export const EFFECT_PROPS: PropDef[] = [
  n('blur', 'Blur', 'Effects', 0, 0, 100, 0.5),
  n('brightness', 'Brightness', 'Effects', 1, 0, 4, 0.01),
  n('contrast', 'Contrast', 'Effects', 1, 0, 4, 0.01),
  n('saturate', 'Saturation', 'Effects', 1, 0, 4, 0.01),
  n('hue', 'Hue shift°', 'Effects', 0, -180, 180, 1),
  n('grayscale', 'Grayscale', 'Effects', 0, 0, 1, 0.01),
  n('sepia', 'Sepia', 'Effects', 0, 0, 1, 0.01),
  n('invert', 'Invert', 'Effects', 0, 0, 1, 0.01),
  n('cropLeft', 'Crop left', 'Effects', 0, 0, 1, 0.005),
  n('cropRight', 'Crop right', 'Effects', 0, 0, 1, 0.005),
  n('cropTop', 'Crop top', 'Effects', 0, 0, 1, 0.005),
  n('cropBottom', 'Crop bottom', 'Effects', 0, 0, 1, 0.005),
  n('cornerRadius', 'Corner radius', 'Effects', 0, 0, 1000, 1),
  n('shadow', 'Drop shadow', 'Effects', 0, 0, 200, 1),
  { key: 'blend', label: 'Blend mode', type: 'select', group: 'Effects', default: 'source-over', options: BLEND_MODES },
  n('vignette', 'Vignette', 'Effects', 0, 0, 1, 0.01),
];

export const TRANSITION_PROPS: PropDef[] = [
  { key: 'transitionIn', label: 'In', type: 'select', group: 'Transitions', default: 'none', options: TRANSITIONS },
  n('transitionInDuration', 'In duration', 'Transitions', 0.5, 0, 10, 0.05, false),
  { key: 'transitionOut', label: 'Out', type: 'select', group: 'Transitions', default: 'none', options: TRANSITIONS },
  n('transitionOutDuration', 'Out duration', 'Transitions', 0.5, 0, 10, 0.05, false),
  { key: 'transitionInEase', label: 'In easing', type: 'select', group: 'Transitions', default: '', options: ['', ...EASES], hint: 'blank = the transition\'s own curve' },
  { key: 'transitionOutEase', label: 'Out easing', type: 'select', group: 'Transitions', default: '', options: ['', ...EASES], hint: 'blank = the transition\'s own curve' },
];

export const EMPHASIS_PROPS: PropDef[] = [
  { key: 'emphasis', label: 'Emphasis', type: 'select', group: 'Emphasis', default: 'none', options: EMPHASES },
  n('emphasisAt', 'Starts at (clip s)', 'Emphasis', 0.5, 0, 3600, 0.05, false),
  n('emphasisDuration', 'Duration', 'Emphasis', 0.8, 0.05, 30, 0.05, false),
  n('emphasisRepeat', 'Repeat (0 = loop)', 'Emphasis', 1, 0, 100, 1, false),
  n('emphasisInterval', 'Gap between repeats', 'Emphasis', 0.4, 0, 30, 0.05, false),
  n('emphasisAmount', 'Amount', 'Emphasis', 1, 0, 10, 0.05),
];

/** Continuous procedural motion layered on top of the transform (handheld camera, float, shake…). */
export const MOTION_PROPS: PropDef[] = [
  { key: 'motion', label: 'Motion', type: 'select', group: 'Motion', default: 'none', options: MOTIONS },
  n('motionAmount', 'Amount', 'Motion', 1, 0, 10, 0.05),
  n('motionSpeed', 'Speed', 'Motion', 1, 0, 10, 0.05, false),
];

export const AUDIO_PROPS: PropDef[] = [
  n('volume', 'Volume', 'Audio', 1, 0, 4, 0.01),
  n('pan', 'Pan', 'Audio', 0, -1, 1, 0.01),
  n('fadeIn', 'Fade in', 'Audio', 0, 0, 30, 0.05, false),
  n('fadeOut', 'Fade out', 'Audio', 0, 0, 30, 0.05, false),
  { key: 'muted', label: 'Muted', type: 'bool', group: 'Audio', default: false },
  { key: 'duckUnder', label: 'Duck under voice', type: 'bool', group: 'Audio', default: false,
    hint: 'Lower this clip automatically while clips marked "voice" play' },
  { key: 'voice', label: 'Is voice', type: 'bool', group: 'Audio', default: false },
];

export const MEDIA_PROPS: PropDef[] = [
  { key: 'fit', label: 'Fit', type: 'select', group: 'Media', default: 'contain', options: ['contain', 'cover', 'fill', 'none'] },
];

export function isVisual(type: ClipType) {
  return type === 'video' || type === 'image' || type === 'component';
}
export function isAudible(type: ClipType) {
  return type === 'video' || type === 'audio' || type === 'sfx';
}

/** Generic props for a clip type (component/sfx specific props are added by their registries). */
export function basePropDefs(type: ClipType): PropDef[] {
  const out: PropDef[] = [];
  if (isVisual(type)) out.push(...TRANSFORM_PROPS);
  if (type === 'video' || type === 'image') out.push(...MEDIA_PROPS);
  if (isVisual(type)) out.push(...EFFECT_PROPS, ...TRANSITION_PROPS, ...EMPHASIS_PROPS, ...MOTION_PROPS);
  if (isAudible(type)) out.push(...AUDIO_PROPS);
  return out;
}

export function defaultsOf(defs: PropDef[]): Props {
  const o: Props = {};
  for (const d of defs) o[d.key] = d.default;
  return o;
}
