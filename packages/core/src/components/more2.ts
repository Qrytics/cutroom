// General-use animated building blocks: icons, reactions, drawn paths, morphing shapes, orbits, ripples,
// text on a path, reveal masks, loaders, emoji rain, stamps, badges, pointers, focus frames, typing dots,
// waveforms, tile grids, liquid blobs, ratings, status checks, speech bubbles, odometers, timers, gesture hints.
// Same contract as index.ts: pure functions of (props, clip-local time), seeded randomness only.
import { clamp, ease, lerp, mixColor, win, withAlpha } from '../engine/ease.ts';
import type { Props } from '../schema/types.ts';
import { type Ctx, type FrameInfo, mix, roundRect } from './draw.ts';
import { animProps, applyEnvelope, B, bool, color, type ComponentDef, envelope, font, G, N, num, S, select, text } from './kit.ts';

const TAU = Math.PI * 2;
/** seeded uniform 0..1 for (seed, i) — hashed so neighbouring seeds/indices are unrelated */
const R = (seed: number, i: number) => mix((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0) / 4294967296;
const list = (p: Props, k: string) => S(p, k).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
const fnt = (weight: number, size: number, family: string) => `${weight} ${size}px "${family}", system-ui, sans-serif`;
/** smooth seeded 1-D noise in roughly −1..1 */
const wobble = (seed: number, i: number, t: number) =>
  0.55 * Math.sin(t * (0.9 + R(seed, i) * 0.8) + R(seed, i + 7) * TAU) + 0.3 * Math.sin(t * (1.9 + R(seed, i + 3)) + R(seed, i + 11) * TAU) + 0.15 * Math.sin(t * (3.7 + R(seed, i + 5) * 2) + R(seed, i + 13) * TAU);
const LOOPS = ['none', 'bounce', 'pulse', 'wiggle', 'spin', 'float', 'swing', 'heartbeat'];
/** continuous idle motion for small objects: [dx, dy, rotation (rad), scale] */
function idle(kind: string, t: number, size: number, amount = 1): [number, number, number, number] {
  switch (kind) {
    case 'bounce': return [0, -Math.abs(Math.sin(t * Math.PI * 1.4)) * size * 0.14 * amount, 0, 1];
    case 'pulse': return [0, 0, 0, 1 + 0.06 * amount * Math.sin(t * TAU * 0.9)];
    case 'wiggle': return [0, 0, 0.12 * amount * Math.sin(t * TAU * 2.2) * (0.5 + 0.5 * Math.cos(t * TAU * 0.35)), 1];
    case 'spin': return [0, 0, t * TAU * 0.35 * amount, 1];
    case 'float': return [0, Math.sin(t * TAU * 0.4) * size * 0.06 * amount, 0.03 * amount * Math.sin(t * TAU * 0.27), 1];
    case 'swing': return [0, 0, 0.22 * amount * Math.sin(t * TAU * 0.7), 1];
    case 'heartbeat': { const b = t % 1.1; return [0, 0, 0, 1 + 0.12 * amount * (Math.exp(-((b - 0.1) ** 2) / 0.002) + 0.7 * Math.exp(-((b - 0.32) ** 2) / 0.002))]; }
    default: return [0, 0, 0, 1];
  }
}
const loopProps = (def = 'none') => [select('loop', 'Idle loop', def, LOOPS, G.anim), num('loopAmount', 'Loop amount', 1, 0, 5, 0.05, G.anim)];

// ---------------------------------------------------------------- icons (24×24 line art, drawn with Path2D)
function gearPath() {
  let d = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU - TAU / 64, r = i % 2 ? 7.2 : 9.6, a2 = a + TAU / 32;
    d += `${i ? 'L' : 'M'}${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}L${(12 + Math.cos(a2) * r).toFixed(2)} ${(12 + Math.sin(a2) * r).toFixed(2)}`;
  }
  return `${d}ZM15 12a3 3 0 11-6 0 3 3 0 016 0z`;
}
export const ICONS: Record<string, string> = {
  check: 'M4 12.5l5 5L20 6.5', cross: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  arrowRight: 'M5 12h14M13 6l6 6-6 6', arrowLeft: 'M19 12H5M11 6l-6 6 6 6', arrowUp: 'M12 19V5M6 11l6-6 6 6', arrowDown: 'M12 5v14M6 13l6 6 6-6',
  heart: 'M12 20s-7-4.4-9-9.2C1.6 7.4 3.8 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.4 0 5.6 3.4 4.2 6.8C19 15.6 12 20 12 20z',
  star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', bell: 'M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0', mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  chat: 'M4 5h16v11H9l-5 4z', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.9 3.1-6 7-6s7 2.1 7 6M16 4.5a3.5 3.5 0 010 6.5M18 14c2.4.6 4 2.6 4 6',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4', unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 017.5-2',
  search: 'M10.5 17a6.5 6.5 0 100-13 6.5 6.5 0 000 13zM15.5 15.5L21 21', settings: gearPath(),
  home: 'M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5', play: 'M7 4l13 8-13 8z', pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 100-8 4 4 0 000 8z', mic: 'M9 6a3 3 0 016 0v6a3 3 0 01-6 0zM5 11a7 7 0 0014 0M12 18v3M8 21h8',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z', cloud: 'M7 18a5 5 0 01-.6-10A6 6 0 0118 9a4.5 4.5 0 01-.5 9z',
  download: 'M12 3v12M7 10l5 5 5-5M4 19h16', upload: 'M12 15V3M7 8l5-5 5 5M4 19h16',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1', code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  terminal: 'M3 4h18v16H3zM7 9l3 3-3 3M12 15h5', rocket: 'M12 2c3 2 5 6 5 10l-2 4H9l-2-4c0-4 2-8 5-10zM12 11a2 2 0 100-4 2 2 0 000 4zM9 16l-3 3 1-5M15 16l3 3-1-5M10 20h4',
  fire: 'M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 2-5 5-5 8 0 4 3 7 7 7z',
  trophy: 'M7 4h10v5a5 5 0 01-10 0zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4M12 14v4M8 21h8M9 18h6',
  gift: 'M3 8h18v4H3zM5 12h14v9H5zM12 8v13M12 8c-1.5-3-5-4-5-1.5S10 8 12 8zM12 8c1.5-3 5-4 5-1.5S14 8 12 8z',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4', clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  pin: 'M12 22s7-6.5 7-12a7 7 0 00-14 0c0 5.5 7 12 7 12zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  cart: 'M3 4h2l2.5 11h11l2-8H6.5M10 20a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zM17 20a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z',
  card: 'M3 6h18v12H3zM3 10h18M6 15h4', chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  thumbsUp: 'M7 10v10H4V10zM7 10l4-7c1.5 0 2.5 1 2.5 2.5V9H19a2 2 0 012 2.3l-1.2 7A2 2 0 0117.8 20H7',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  wifi: 'M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 20h.01', battery: 'M3 7h16v10H3zM21 10v4M6 10h6v4H6z',
  phone: 'M7 2h10v20H7zM11 18h2', laptop: 'M5 5h14v10H5zM2 19h20l-2-4H4z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c1 1 1.5 2 1.5 3.5h5c0-1.5.5-2.5 1.5-3.5A6 6 0 0012 3z',
  flag: 'M5 21V4M5 4h12l-2 4 2 4H5', bookmark: 'M6 3h12v18l-6-4-6 4z',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5h.01', warning: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  share: 'M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14', edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
};
const ICON_NAMES = Object.keys(ICONS);
const pathCache = new Map<string, Path2D>();
function iconPath(d: string): Path2D | null {
  if (typeof Path2D === 'undefined') return null;
  let p = pathCache.get(d);
  if (!p) { p = new Path2D(d); pathCache.set(d, p); }
  return p;
}
/** Draw a 24-unit icon (or an emoji / text glyph) centered at (cx, cy). k = draw-on progress 0–1. */
function drawIcon(ctx: Ctx, name: string, cx: number, cy: number, size: number, col: string, o: { stroke?: number; style?: string; fill?: string; k?: number } = {}) {
  const d = ICONS[name];
  if (!d) {
    // not an icon name → treat as emoji / text
    ctx.save(); ctx.globalAlpha *= clamp((o.k ?? 1) * 1.5); ctx.font = fnt(400, size * 0.9, 'Inter'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col;
    ctx.fillText(name, cx, cy + size * 0.04); ctx.restore(); return;
  }
  const p = iconPath(d); if (!p) return;
  const s = size / 24, k = o.k ?? 1;
  ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = (o.stroke ?? size * 0.08) / s; ctx.strokeStyle = col;
  if (o.style === 'solid' || o.style === 'duotone') {
    ctx.save(); ctx.globalAlpha *= (o.style === 'duotone' ? 0.32 : 1) * clamp(k * 1.3 - 0.3); ctx.fillStyle = o.fill || col; ctx.fill(p); ctx.restore();
  }
  if (k < 1) { const L = 140; ctx.setLineDash([L * k, L]); }
  ctx.stroke(p);
  ctx.restore();
}

const icon: ComponentDef = {
  key: 'icon', label: 'Icon', category: 'Graphics', defaultDuration: 3,
  description: `Animated line icon that draws itself on (${ICON_NAMES.length} built in: check, heart, star, bolt, rocket, bell, chat, lock, search, settings, chart, …) or any emoji, with an optional badge and idle loop.`,
  props: [
    select('name', 'Icon', 'rocket', ICON_NAMES, G.content), num('size', 'Size', 220, 8, 2000), color('color', 'Color', '#ffffff'),
    num('strokeWidth', 'Line width', 14, 0.5, 200), select('style', 'Style', 'line', ['line', 'solid', 'duotone']), color('fill', 'Fill (blank = color)', ''),
    color('badge', 'Badge color (blank = none)', '#4f8cff'), select('badgeShape', 'Badge shape', 'circle', ['circle', 'squircle', 'square']), num('badgePad', 'Badge padding', 0.42, 0, 2, 0.01),
    bool('drawOn', 'Draw on', true, G.anim), num('drawDur', 'Draw-on duration', 0.8, 0.05, 10, 0.05, G.anim, false), ...loopProps('float'),
    ...animProps('pop', 'fade', 0.45, 0.3),
  ],
  draw(ctx, p, f) {
    const cx = f.width / 2, cy = f.height / 2, size = N(p, 'size');
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy);
    const [dx, dy, rot, sc] = idle(S(p, 'loop'), f.t, size, N(p, 'loopAmount'));
    ctx.translate(cx + dx, cy + dy); ctx.rotate(rot); ctx.scale(sc, sc);
    if (S(p, 'badge')) {
      const r = size * (0.5 + N(p, 'badgePad')), k = ease('backOut', win(f.t, 0, 0.5, 'linear'));
      ctx.save(); ctx.scale(k, k); ctx.fillStyle = S(p, 'badge'); ctx.beginPath();
      if (S(p, 'badgeShape') === 'circle') ctx.arc(0, 0, r, 0, TAU); else roundRect(ctx, -r, -r, r * 2, r * 2, S(p, 'badgeShape') === 'squircle' ? r * 0.45 : r * 0.12);
      ctx.fill(); ctx.restore();
    }
    const k = B(p, 'drawOn') ? ease('easeInOut', win(f.t, Number(p.inDur ?? 0.45) * 0.4, N(p, 'drawDur'), 'linear')) : 1;
    drawIcon(ctx, S(p, 'name'), 0, 0, size, S(p, 'color'), { stroke: N(p, 'strokeWidth'), style: S(p, 'style'), fill: S(p, 'fill'), k });
    ctx.restore();
  },
};

const iconBurst: ComponentDef = {
  key: 'iconBurst', label: 'Reaction burst', category: 'Effects', defaultDuration: 3,
  description: 'Icons or emoji (❤️ 👍 🔥) that pop out of a point and float up, live-stream-reaction style. Burst once or stream for the whole clip.',
  props: [
    text('icons', 'Icons / emoji (comma list)', 'heart,thumbsUp,fire,star,sparkle', G.content), select('mode', 'Mode', 'burst', ['burst', 'stream'], G.content),
    num('count', 'Count', 22, 1, 400, 1, G.content, false), num('originX', 'Origin X (0–1)', 0.5, 0, 1, 0.01, G.layout), num('originY', 'Origin Y (0–1)', 0.78, 0, 1, 0.01, G.layout),
    num('spread', 'Sideways spread', 1, 0, 5, 0.05), num('rise', 'Rise height', 1, 0, 5, 0.05), num('size', 'Size', 72, 4, 600), num('life', 'Each lasts (s)', 1.9, 0.2, 20, 0.05, G.anim, false),
    text('colors', 'Colors (comma list)', '#ff4d6d,#4f8cff,#ffb020,#ffd43b,#a56eff'), select('style', 'Icon style', 'solid', ['line', 'solid', 'duotone']),
  ],
  draw(ctx, p, f) {
    const names = list(p, 'icons'), cols = list(p, 'colors'), n = N(p, 'count'), life = N(p, 'life');
    if (!names.length) return;
    const ox = N(p, 'originX') * f.width, oy = N(p, 'originY') * f.height, size = N(p, 'size');
    const window_ = S(p, 'mode') === 'stream' ? Math.max(0.01, f.duration - life) : Math.min(0.9, f.duration * 0.3);
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * window_ + R(f.seed, i) * 0.12, lt = f.t - t0;
      if (lt < 0 || lt > life) continue;
      const k = lt / life, drift = (R(f.seed, i + 100) - 0.5) * 2;
      const x = ox + drift * 260 * N(p, 'spread') * Math.min(1, k * 2) + Math.sin(lt * 3 + i) * 26 * N(p, 'spread');
      const y = oy - ease('easeOut', k) * f.height * 0.55 * N(p, 'rise') * (0.6 + R(f.seed, i + 200) * 0.5);
      const s = size * (0.6 + R(f.seed, i + 300) * 0.7) * ease('backOut', clamp(lt / 0.25));
      ctx.save(); ctx.globalAlpha *= clamp((1 - k) * 2.5); ctx.translate(x, y); ctx.rotate(drift * 0.4 * k);
      drawIcon(ctx, names[i % names.length], 0, 0, s, cols[i % Math.max(1, cols.length)] || '#fff', { style: S(p, 'style'), stroke: s * 0.09 });
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------- drawn paths
const PATHS: Record<string, string> = {
  signature: 'M5 35 C15 5 25 5 22 30 C20 45 35 40 40 25 C45 10 50 40 55 30 C60 20 62 35 70 28 C78 20 80 35 95 22',
  swoosh: 'M5 35 C30 45 65 45 95 15', circle: 'M50 5 C78 5 95 15 95 27 C95 42 72 48 50 48 C25 48 5 40 5 27 C5 13 25 6 55 8',
  arrowCurve: 'M5 40 C30 0 60 0 85 25 M85 25 L72 24 M85 25 L82 12', wave: 'M0 25 C12 5 25 5 37 25 C50 45 62 45 75 25 C87 5 100 5 112 25',
  heartLine: 'M0 30 L30 30 L38 15 L46 45 L54 5 L62 38 L68 30 L100 30', mountain: 'M0 45 L25 15 L38 30 L58 5 L80 35 L100 20',
  loop: 'M5 40 C25 40 35 5 55 5 C75 5 70 40 50 40 C30 40 45 10 95 20', zigzag: 'M0 40 L15 10 L30 40 L45 10 L60 40 L75 10 L90 40',
  underline: 'M5 30 C35 22 65 22 95 28 M15 38 C40 32 60 33 85 36',
};
/** rough bbox + length of an (absolute-command) SVG path from its coordinate pairs */
function pathMetrics(d: string) {
  const nums = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0, px = NaN, py = NaN;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1];
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    if (!Number.isNaN(px)) len += Math.hypot(x - px, y - py);
    px = x; py = y;
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), len: Math.max(1, len) } : { x: 0, y: 0, w: 100, h: 50, len: 200 };
}
const pathDraw: ComponentDef = {
  key: 'pathDraw', label: 'Path draw-on', category: 'Graphics', defaultDuration: 3,
  description: 'Strokes any SVG path on like a pen (signature, swoosh, circle, curved arrow, wave, heartbeat line, mountain, loop, zigzag, double underline — or your own `d`), fitted to a box, with optional fill fade-in.',
  props: [
    select('preset', 'Preset', 'signature', ['custom', ...Object.keys(PATHS)], G.content), text('d', 'Custom SVG path d (absolute commands)', '', G.content, true),
    num('width', 'Box width', 900, 10, 8000, 1, G.layout), num('height', 'Box height', 360, 10, 8000, 1, G.layout),
    color('color', 'Stroke', '#ffd43b'), num('strokeWidth', 'Line width', 12, 0.5, 200), color('fill', 'Fill (blank = none)', ''), bool('glow', 'Glow', false),
    num('drawDur', 'Draw duration', 1.4, 0.05, 30, 0.05, G.anim, false), select('drawEase', 'Draw easing', 'easeInOut', ['linear', 'easeOut', 'easeInOut', 'expoOut'], G.anim),
    ...animProps('none', 'fade', 0.3, 0.4),
  ],
  draw(ctx, p, f) {
    const d = S(p, 'preset') === 'custom' ? S(p, 'd') : PATHS[S(p, 'preset')] ?? '';
    const path = d && iconPath(d); if (!path) return;
    const m = pathMetrics(d), W = N(p, 'width'), H = N(p, 'height'), s = Math.min(W / m.w, H / m.h);
    const k = ease(S(p, 'drawEase') as never, win(f.t, 0.05, N(p, 'drawDur'), 'linear'));
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    ctx.translate(f.width / 2 - (m.x + m.w / 2) * s, f.height / 2 - (m.y + m.h / 2) * s); ctx.scale(s, s);
    if (S(p, 'fill')) { ctx.save(); ctx.globalAlpha *= clamp((k - 0.8) / 0.2); ctx.fillStyle = S(p, 'fill'); ctx.fill(path); ctx.restore(); }
    ctx.lineWidth = N(p, 'strokeWidth') / s; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = S(p, 'color');
    if (B(p, 'glow')) { ctx.shadowColor = S(p, 'color'); ctx.shadowBlur = 24; }
    const L = m.len * 1.25;
    if (k < 1) ctx.setLineDash([L * k, L]);
    ctx.stroke(path);
    ctx.restore();
  },
};

// ---------------------------------------------------------------- morphing shapes
const MORPHS = ['circle', 'square', 'triangle', 'star', 'hexagon', 'diamond', 'blob', 'heart', 'cross', 'pentagon'];
const NP = 120;
function shapePts(name: string, t: number, seed: number): [number, number][] {
  const out: [number, number][] = [];
  const poly = (n: number, th: number, rot = -Math.PI / 2) => { const a = ((th - rot) % (TAU / n) + TAU / n) % (TAU / n) - Math.PI / n; return Math.cos(Math.PI / n) / Math.cos(a); };
  for (let i = 0; i < NP; i++) {
    const th = (i / NP) * TAU - Math.PI / 2;
    let r = 1;
    switch (name) {
      case 'square': r = 0.86 / Math.max(Math.abs(Math.cos(th + Math.PI / 4 - Math.PI / 4)), Math.abs(Math.sin(th))); r = Math.min(r, 1.22); break;
      case 'triangle': r = poly(3, th) * 0.62; break;
      case 'pentagon': r = poly(5, th) * 0.92; break;
      case 'hexagon': r = poly(6, th) * 0.95; break;
      case 'diamond': r = 0.95 / (Math.abs(Math.cos(th)) + Math.abs(Math.sin(th))); break;
      case 'star': { const a = ((th + Math.PI / 2) % (TAU / 5) + TAU / 5) % (TAU / 5) / (TAU / 5); r = lerp(1, 0.45, 1 - Math.abs(a * 2 - 1)); break; }
      case 'cross': { const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th)); r = Math.min(0.95 / Math.max(c, s), 0.36 / Math.min(c, s) || 9); break; }
      case 'blob': r = 0.9 + 0.1 * Math.sin(3 * th + t * 1.3 + R(seed, 1) * 6) + 0.07 * Math.sin(5 * th - t * 0.9 + R(seed, 2) * 6); break;
      case 'heart': { const s2 = (i / NP) * TAU; out.push([Math.sin(s2) ** 3 * 0.95, -(13 * Math.cos(s2) - 5 * Math.cos(2 * s2) - 2 * Math.cos(3 * s2) - Math.cos(4 * s2)) / 17 - 0.05]); continue; }
    }
    out.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  return out;
}
const morphShape: ComponentDef = {
  key: 'morphShape', label: 'Morphing shape', category: 'Graphics', defaultDuration: 6,
  description: 'One shape that smoothly morphs through a sequence (circle → square → triangle → star → hexagon → blob → heart…) while its color shifts.',
  props: [
    text('shapes', `Shapes (comma list of ${MORPHS.join('/')})`, 'circle,square,triangle,star,hexagon,blob', G.content),
    num('interval', 'Seconds per shape', 1.2, 0.1, 30, 0.05, G.anim, false), num('morphDur', 'Morph duration', 0.6, 0.05, 30, 0.05, G.anim, false),
    num('size', 'Size', 380, 4, 4000), text('colors', 'Colors (comma list)', '#4f8cff,#a56eff,#ff6b9d,#ffb020,#42be65'),
    color('strokeColor', 'Outline (blank = none)', ''), num('strokeWidth', 'Outline width', 0, 0, 100), num('spin', 'Spin (turns/s)', 0.05, -5, 5, 0.01), bool('glow', 'Glow', true),
    ...animProps('pop', 'fade', 0.5, 0.4),
  ],
  draw(ctx, p, f) {
    const shapes = list(p, 'shapes').filter((s) => MORPHS.includes(s)); if (!shapes.length) return;
    const cols = list(p, 'colors'), iv = N(p, 'interval'), md = Math.min(N(p, 'morphDur'), iv);
    const idx = Math.floor(f.t / iv), local = f.t - idx * iv;
    const k = ease('easeInOut', clamp((local - (iv - md)) / md));
    const a = shapePts(shapes[idx % shapes.length], f.t, f.seed), b = shapePts(shapes[(idx + 1) % shapes.length], f.t, f.seed);
    const ca = cols[idx % Math.max(1, cols.length)] || '#fff', cb = cols[(idx + 1) % Math.max(1, cols.length)] || ca;
    const cx = f.width / 2, cy = f.height / 2, R0 = N(p, 'size') / 2;
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy); ctx.translate(cx, cy); ctx.rotate(f.t * N(p, 'spin') * TAU);
    ctx.beginPath();
    for (let i = 0; i < NP; i++) { const x = lerp(a[i][0], b[i][0], k) * R0, y = lerp(a[i][1], b[i][1], k) * R0; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath();
    const c = mixColor(ca, cb, k);
    if (B(p, 'glow')) { ctx.shadowColor = c; ctx.shadowBlur = R0 * 0.3; }
    ctx.fillStyle = c; ctx.fill();
    if (S(p, 'strokeColor') && N(p, 'strokeWidth')) { ctx.shadowBlur = 0; ctx.lineJoin = 'round'; ctx.lineWidth = N(p, 'strokeWidth'); ctx.strokeStyle = S(p, 'strokeColor'); ctx.stroke(); }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- orbit
const orbit: ComponentDef = {
  key: 'orbit', label: 'Orbit / integrations ring', category: 'Graphics', defaultDuration: 6,
  description: 'Labels or icons orbiting a center on a (tilted) ring with depth — "works with everything" integration rings, solar systems, ecosystems. Prefix an item with "icon:" to show an icon.',
  props: [
    text('items', 'Items (comma list; "icon:name" for icons)', 'GitHub,Slack,Figma,Notion,icon:rocket,Linear,Stripe,icon:bolt', G.content), text('center', 'Center label', 'Cutroom', G.content),
    num('radius', 'Radius', 380, 10, 4000, 1, G.layout), num('tilt', 'Tilt (1 = flat circle)', 0.42, 0.05, 1, 0.01, G.layout), num('speed', 'Speed (turns/s)', 0.06, -2, 2, 0.005),
    font('font', 'Inter'), num('size', 'Item size', 36, 6, 300), color('color', 'Item text', '#ffffff'), color('itemBg', 'Item background', 'rgba(255,255,255,0.1)'),
    color('accent', 'Center color', '#4f8cff'), color('ringColor', 'Ring color', 'rgba(255,255,255,0.14)'), num('stagger', 'Item stagger', 0.08, 0, 2, 0.01, G.anim, false),
    ...animProps('fade', 'fade', 0.6, 0.4),
  ],
  draw(ctx, p, f) {
    const items = list(p, 'items'), n = items.length, cx = f.width / 2, cy = f.height / 2, rx = N(p, 'radius'), ry = rx * N(p, 'tilt'), size = N(p, 'size');
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy);
    ctx.strokeStyle = S(p, 'ringColor'); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke();
    const placed = items.map((it, i) => {
      const a = (i / Math.max(1, n)) * TAU + f.t * N(p, 'speed') * TAU;
      return { it, i, x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, depth: Math.sin(a) };
    }).sort((u, v) => u.depth - v.depth);
    const drawItem = (o: typeof placed[number]) => {
      const k = ease('backOut', clamp((f.t - 0.2 - o.i * N(p, 'stagger')) / 0.45));
      if (k <= 0) return;
      const sc = (0.72 + 0.28 * (o.depth + 1) / 2) * k;
      ctx.save(); ctx.globalAlpha *= 0.45 + 0.55 * (o.depth + 1) / 2; ctx.translate(o.x, o.y); ctx.scale(sc, sc);
      if (o.it.startsWith('icon:')) {
        ctx.fillStyle = S(p, 'itemBg'); ctx.beginPath(); ctx.arc(0, 0, size * 1.15, 0, TAU); ctx.fill();
        drawIcon(ctx, o.it.slice(5), 0, 0, size * 1.2, S(p, 'color'), { stroke: size * 0.12 });
      } else {
        ctx.font = fnt(600, size, S(p, 'font')); const w = ctx.measureText(o.it).width + size * 1.2, h = size * 1.9;
        ctx.fillStyle = S(p, 'itemBg'); roundRect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
        ctx.fillStyle = S(p, 'color'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.it, 0, size * 0.05);
      }
      ctx.restore();
    };
    for (const o of placed) if (o.depth < 0) drawItem(o);
    const label = S(p, 'center');
    if (label) {
      const k = ease('backOut', clamp(f.t / 0.5)), r = size * 2.6;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.8); g.addColorStop(0, withAlpha(S(p, 'accent'), 0.45)); g.addColorStop(1, withAlpha(S(p, 'accent'), 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = S(p, 'accent'); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.font = fnt(800, size * 1.05, S(p, 'font')); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, size * 0.05);
      ctx.restore();
    }
    for (const o of placed) if (o.depth >= 0) drawItem(o);
    ctx.restore();
  },
};

// ---------------------------------------------------------------- ripple
const ripple: ComponentDef = {
  key: 'ripple', label: 'Ripple / ping / radar', category: 'Effects', defaultDuration: 3,
  description: 'Concentric expanding rings at a point: notification ping, sonar, radar sweep, tap feedback. Repeats for the clip length.',
  props: [
    select('style', 'Style', 'rings', ['rings', 'ping', 'radar', 'filled'], G.content), num('originX', 'Origin X (0–1)', 0.5, 0, 1, 0.01, G.layout), num('originY', 'Origin Y (0–1)', 0.5, 0, 1, 0.01, G.layout),
    num('count', 'Rings per wave', 3, 1, 20, 1, G.content, false), num('period', 'Repeat every (s)', 1.6, 0.1, 20, 0.05, G.anim, false), num('maxRadius', 'Max radius', 420, 4, 4000),
    color('color', 'Color', '#4f8cff'), num('thickness', 'Ring width', 6, 0.5, 100), ...animProps('fade', 'fade', 0.2, 0.4),
  ],
  draw(ctx, p, f) {
    const ox = N(p, 'originX') * f.width, oy = N(p, 'originY') * f.height, Rm = N(p, 'maxRadius'), per = N(p, 'period'), n = N(p, 'count'), c = S(p, 'color'), st = S(p, 'style');
    const { alpha } = envelope(p, f);
    ctx.save(); ctx.globalAlpha *= alpha;
    if (st === 'radar') {
      ctx.strokeStyle = withAlpha(c, 0.35); ctx.lineWidth = 2;
      for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(ox, oy, Rm * i / 4, 0, TAU); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(ox - Rm, oy); ctx.lineTo(ox + Rm, oy); ctx.moveTo(ox, oy - Rm); ctx.lineTo(ox, oy + Rm); ctx.stroke();
      const a = (f.t / per) * TAU;
      for (let i = 0; i < 24; i++) { ctx.fillStyle = withAlpha(c, 0.28 * (1 - i / 24)); ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, Rm, a - (i + 1) * 0.04, a - i * 0.04); ctx.closePath(); ctx.fill(); }
      for (let i = 0; i < 5; i++) {
        const ba = R(f.seed, i) * TAU, br = Rm * (0.25 + R(f.seed, i + 9) * 0.7), since = ((a - ba) % TAU + TAU) % TAU;
        ctx.fillStyle = withAlpha(c, clamp(1 - since / 3)); ctx.beginPath(); ctx.arc(ox + Math.cos(ba) * br, oy + Math.sin(ba) * br, 8, 0, TAU); ctx.fill();
      }
    } else {
      for (let w = 0; w < 2; w++) for (let i = 0; i < n; i++) {
        const k = ((f.t / per - i / n / 1.5 + w) % 1 + 1) % 1, r = ease('easeOut', k) * Rm;
        ctx.globalAlpha = alpha * (1 - k);
        if (st === 'filled') { ctx.fillStyle = withAlpha(c, 0.35); ctx.beginPath(); ctx.arc(ox, oy, r, 0, TAU); ctx.fill(); }
        else { ctx.strokeStyle = c; ctx.lineWidth = N(p, 'thickness') * (1 - k * 0.6); ctx.beginPath(); ctx.arc(ox, oy, r, 0, TAU); ctx.stroke(); }
      }
      if (st === 'ping') { ctx.globalAlpha = alpha; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ox, oy, Rm * 0.08 * (1 + 0.15 * Math.sin(f.t * TAU / per)), 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- text on a path
const textPath: ComponentDef = {
  key: 'textPath', label: 'Text on a path', category: 'Text', defaultDuration: 5,
  description: 'Text that flows along an arc, wave, smile or full circle (rotating badge text), with letters revealing along the path and optional scrolling.',
  props: [
    text('text', 'Text', 'MADE WITH CUTROOM • EDITED LIVE • ', G.content), select('path', 'Path', 'circle', ['arc', 'wave', 'smile', 'circle'], G.content),
    num('radius', 'Radius / width', 320, 10, 4000, 1, G.layout), num('amplitude', 'Wave height', 80, 0, 2000, 1, G.layout),
    font('font', 'Space Grotesk'), num('size', 'Size', 54, 4, 600), num('weight', 'Weight', 700, 100, 900, 100), color('color', 'Color', '#ffffff'), num('letterSpacing', 'Letter spacing', 4, -20, 80, 0.5),
    num('speed', 'Scroll speed (px/s)', 60, -2000, 2000, 1), num('revealDur', 'Letter reveal duration', 1, 0, 20, 0.05, G.anim, false), color('centerIcon', 'Center dot color (blank = none)', ''),
    ...animProps('fade', 'fade', 0.3, 0.4),
  ],
  draw(ctx, p, f) {
    const txt = S(p, 'text'); if (!txt) return;
    const cx = f.width / 2, cy = f.height / 2, R0 = N(p, 'radius'), A = N(p, 'amplitude'), kind = S(p, 'path');
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy);
    ctx.font = fnt(N(p, 'weight'), N(p, 'size'), S(p, 'font')); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = S(p, 'color');
    const chars = [...txt], ws = chars.map((c) => ctx.measureText(c).width + N(p, 'letterSpacing')), total = ws.reduce((a, b) => a + b, 0);
    // point + tangent angle at arc-length s along the path
    const at = (s: number): [number, number, number] => {
      if (kind === 'circle') { const a = s / R0 - Math.PI / 2; return [cx + Math.cos(a) * R0, cy + Math.sin(a) * R0, a + Math.PI / 2]; }
      if (kind === 'arc' || kind === 'smile') { const sign = kind === 'arc' ? -1 : 1, a = s / R0; return [cx + Math.sin(a) * R0, cy - sign * Math.cos(a) * R0 + sign * R0, sign * a]; }
      const x = s, y = Math.sin(x / R0 * Math.PI) * A; const dy = Math.cos(x / R0 * Math.PI) * A * Math.PI / R0; return [cx + x, cy + y, Math.atan(dy)];
    };
    const loopLen = kind === 'circle' ? TAU * R0 : total;
    const off = (f.t * N(p, 'speed')) % Math.max(1, loopLen);
    let s = kind === 'circle' ? off : -total / 2 + (kind === 'wave' ? off % 1 : 0);
    const reps = kind === 'circle' ? Math.max(1, Math.floor(loopLen / Math.max(1, total))) : 1;
    let idx = 0;
    for (let r = 0; r < reps; r++) chars.forEach((c, i) => {
      const w = ws[i], mid = s + w / 2;
      const k = clamp((f.t - (idx / (chars.length * reps)) * N(p, 'revealDur')) / 0.25);
      const [x, y, a] = at(mid);
      if (k > 0) { ctx.save(); ctx.globalAlpha *= k; ctx.translate(x, y); ctx.rotate(a); ctx.translate(0, (1 - k) * 20); ctx.fillText(c, 0, 0); ctx.restore(); }
      s += w; idx++;
    });
    if (S(p, 'centerIcon') && kind === 'circle') { ctx.fillStyle = S(p, 'centerIcon'); ctx.beginPath(); ctx.arc(cx, cy, R0 * 0.18, 0, TAU); ctx.fill(); }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- reveal mask
const revealMask: ComponentDef = {
  key: 'revealMask', label: 'Reveal mask', category: 'Transition', defaultDuration: 1.4,
  description: 'Solid cover over everything below that opens to reveal it (circle iris, diamond, wipe, split doors, bars, tile grid). `inverse` closes it instead — chain open/close around a cut.',
  props: [
    color('color', 'Cover color', '#0b0d12'), select('style', 'Style', 'circle', ['circle', 'diamond', 'wipe', 'split', 'bars', 'grid'], G.content),
    select('direction', 'Direction', 'right', ['right', 'left', 'up', 'down'], G.content), bool('inverse', 'Inverse (cover closes in)', false, G.content),
    num('originX', 'Center X (0–1)', 0.5, 0, 1, 0.01, G.layout), num('originY', 'Center Y (0–1)', 0.5, 0, 1, 0.01, G.layout),
    num('delay', 'Start after (s)', 0.1, 0, 30, 0.05, G.anim, false), num('revealDur', 'Reveal duration', 1, 0.05, 30, 0.05, G.anim, false),
    select('revealEase', 'Easing', 'quartOut', ['linear', 'easeInOut', 'quartOut', 'expoOut', 'backInOut', 'snap'], G.anim), num('pieces', 'Bars / tiles across', 8, 2, 60, 1, G.content, false),
    color('edge', 'Edge line color (blank = none)', ''),
  ],
  draw(ctx, p, f) {
    const W = f.width, H = f.height;
    let k = ease(S(p, 'revealEase') as never, win(f.t, N(p, 'delay'), N(p, 'revealDur'), 'linear'));
    if (B(p, 'inverse')) k = 1 - k;
    if (k >= 1) return;
    const st = S(p, 'style'), dir = S(p, 'direction'), n = N(p, 'pieces'), ox = N(p, 'originX') * W, oy = N(p, 'originY') * H;
    ctx.save(); ctx.fillStyle = S(p, 'color'); ctx.strokeStyle = S(p, 'edge'); ctx.lineWidth = 6;
    const edge = () => { if (S(p, 'edge')) ctx.stroke(); };
    if (st === 'circle' || st === 'diamond') {
      const far = Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy)) * (st === 'diamond' ? 1.42 : 1.02), r = far * k;
      ctx.beginPath(); ctx.rect(0, 0, W, H);
      if (st === 'circle') { ctx.moveTo(ox + r, oy); ctx.arc(ox, oy, r, 0, TAU, true); } else { ctx.moveTo(ox, oy - r); ctx.lineTo(ox - r, oy); ctx.lineTo(ox, oy + r); ctx.lineTo(ox + r, oy); ctx.closePath(); }
      ctx.fill('evenodd');
      if (S(p, 'edge') && r > 0) { ctx.beginPath(); if (st === 'circle') ctx.arc(ox, oy, r, 0, TAU); else { ctx.moveTo(ox, oy - r); ctx.lineTo(ox - r, oy); ctx.lineTo(ox, oy + r); ctx.lineTo(ox + r, oy); ctx.closePath(); } edge(); }
    } else if (st === 'wipe') {
      ctx.beginPath();
      if (dir === 'right') ctx.rect(W * k, 0, W, H); else if (dir === 'left') ctx.rect(0, 0, W * (1 - k), H); else if (dir === 'down') ctx.rect(0, H * k, W, H); else ctx.rect(0, 0, W, H * (1 - k));
      ctx.fill(); edge();
    } else if (st === 'split') {
      const hor = dir === 'left' || dir === 'right';
      ctx.beginPath();
      if (hor) { ctx.rect(0, 0, W / 2 * (1 - k), H); ctx.rect(W / 2 + W / 2 * k, 0, W / 2 * (1 - k) + 1, H); } else { ctx.rect(0, 0, W, H / 2 * (1 - k)); ctx.rect(0, H / 2 + H / 2 * k, W, H / 2 * (1 - k) + 1); }
      ctx.fill(); edge();
    } else if (st === 'bars') {
      const hor = dir === 'left' || dir === 'right', bw = (hor ? H : W) / n;
      for (let i = 0; i < n; i++) {
        const kk = clamp(k * 1.6 - (i / n) * 0.6), len = (hor ? W : H) * (1 - kk);
        ctx.beginPath();
        if (hor) ctx.rect(dir === 'right' ? W - len : 0, i * bw, len, bw + 1); else ctx.rect(i * bw, dir === 'down' ? H - len : 0, bw + 1, len);
        ctx.fill();
      }
    } else {
      const cw = W / n, rows = Math.ceil(H / cw);
      for (let y = 0; y < rows; y++) for (let x = 0; x < n; x++) {
        const order = (x / n + y / rows) / 2, kk = ease('easeInOut', clamp(k * 1.7 - order * 0.7)), s = 1 - kk;
        if (s <= 0) continue;
        ctx.fillRect(x * cw + cw * (1 - s) / 2, y * cw + cw * (1 - s) / 2, cw * s + 1, cw * s + 1);
      }
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- loader
const loader: ComponentDef = {
  key: 'loader', label: 'Loader / spinner', category: 'Screen', defaultDuration: 3,
  description: 'Loading states: spinner, three dots, equalizer bars, progress ring, pulse, orbiting dots, or skeleton lines with a shimmer — for "processing…" beats in app demos.',
  props: [
    select('style', 'Style', 'spinner', ['spinner', 'dots', 'bars', 'ring', 'pulse', 'orbit', 'skeleton'], G.content), num('size', 'Size', 140, 4, 2000),
    color('color', 'Color', '#4f8cff'), color('trackColor', 'Track color', 'rgba(255,255,255,0.12)'), num('speed', 'Speed', 1, 0, 10, 0.05),
    text('label', 'Label', 'Rendering…'), font('font', 'Inter'), color('labelColor', 'Label color', 'rgba(255,255,255,0.75)'), ...animProps('fade', 'fade', 0.3, 0.3),
  ],
  draw(ctx, p, f) {
    const cx = f.width / 2, cy = f.height / 2, s = N(p, 'size'), c = S(p, 'color'), tc = S(p, 'trackColor'), t = f.t * N(p, 'speed'), st = S(p, 'style');
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy); ctx.lineCap = 'round';
    if (st === 'spinner' || st === 'ring') {
      const r = s / 2, lw = s * 0.11;
      ctx.lineWidth = lw; ctx.strokeStyle = tc; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = c; ctx.beginPath();
      if (st === 'spinner') { const a = t * TAU * 1.1, span = 0.6 + 0.9 * (0.5 + 0.5 * Math.sin(t * TAU * 0.7)); ctx.arc(cx, cy, r, a, a + span * Math.PI); }
      else { const k = (t * 0.35) % 1.15; ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, ease('easeInOut', k))); }
      ctx.stroke();
    } else if (st === 'dots') {
      for (let i = 0; i < 3; i++) { const b = Math.max(0, Math.sin(t * TAU * 0.9 - i * 0.9)); ctx.fillStyle = withAlpha(c, 0.45 + 0.55 * b); ctx.beginPath(); ctx.arc(cx + (i - 1) * s * 0.42, cy - b * s * 0.18, s * 0.12, 0, TAU); ctx.fill(); }
    } else if (st === 'bars') {
      for (let i = 0; i < 5; i++) { const h = s * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * TAU * 1.1 - i * 0.7))); ctx.fillStyle = c; roundRect(ctx, cx + (i - 2) * s * 0.22 - s * 0.07, cy - h / 2, s * 0.14, h, s * 0.07); ctx.fill(); }
    } else if (st === 'pulse') {
      for (let i = 0; i < 3; i++) { const k = ((t * 0.8 + i / 3) % 1); ctx.fillStyle = withAlpha(c, (1 - k) * 0.6); ctx.beginPath(); ctx.arc(cx, cy, s * 0.15 + k * s * 0.5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, s * 0.16, 0, TAU); ctx.fill();
    } else if (st === 'orbit') {
      for (let i = 0; i < 8; i++) { const a = t * TAU * 0.8 + i * TAU / 8 * (0.82 + 0.18 * Math.sin(t * 3)); ctx.fillStyle = withAlpha(c, 0.25 + 0.75 * (i / 7)); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42, s * 0.06 * (0.6 + 0.4 * i / 7), 0, TAU); ctx.fill(); }
    } else {
      const w = s * 5, lh = s * 0.22, x0 = cx - w / 2;
      [1, 0.86, 0.62].forEach((frac, i) => {
        const y = cy - s * 0.6 + i * lh * 2;
        ctx.save(); roundRect(ctx, x0, y, w * frac, lh, lh / 2); ctx.clip(); ctx.fillStyle = tc; ctx.fillRect(x0, y, w, lh);
        const sx = x0 + ((t * 0.7) % 1.4 - 0.2) * w, g = ctx.createLinearGradient(sx - w * 0.2, 0, sx + w * 0.2, 0);
        g.addColorStop(0, withAlpha(c, 0)); g.addColorStop(0.5, withAlpha(c, 0.45)); g.addColorStop(1, withAlpha(c, 0)); ctx.fillStyle = g; ctx.fillRect(x0, y, w, lh); ctx.restore();
      });
    }
    if (S(p, 'label')) {
      ctx.fillStyle = S(p, 'labelColor'); ctx.font = fnt(500, s * 0.24, S(p, 'font')); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(S(p, 'label'), cx, cy + s * (st === 'skeleton' ? 0.9 : 0.75));
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- emoji rain
const emojiRain: ComponentDef = {
  key: 'emojiRain', label: 'Emoji / character rain', category: 'Effects', defaultDuration: 4,
  description: 'Emoji, characters or icon names falling (or rising) across the whole frame with sway and spin — celebrations, "money rain", hype moments.',
  props: [
    text('chars', 'Emoji / characters / icon names (comma list)', '🎉,✨,🚀,💜,⭐', G.content), num('count', 'Count', 48, 1, 1000, 1, G.content, false),
    select('direction', 'Direction', 'down', ['down', 'up'], G.content), num('speed', 'Speed', 1, 0.05, 10, 0.05), num('size', 'Size', 64, 4, 600),
    num('sway', 'Sway', 1, 0, 5, 0.05), bool('spin', 'Spin', true), color('color', 'Color (for icons/glyphs)', '#ffd43b'), ...animProps('fade', 'fade', 0.3, 0.6),
  ],
  draw(ctx, p, f) {
    const chars = list(p, 'chars'); if (!chars.length) return;
    const { alpha } = envelope(p, f), n = N(p, 'count'), up = S(p, 'direction') === 'up', size = N(p, 'size');
    ctx.save(); ctx.globalAlpha *= alpha;
    for (let i = 0; i < n; i++) {
      const sp = (0.25 + R(f.seed, i) * 0.35) * N(p, 'speed'), ph = R(f.seed, i + 50);
      const prog = ((f.t * sp + ph) % 1.15) - 0.075, y = up ? f.height * (1 - prog) : f.height * prog;
      const x = R(f.seed, i + 100) * f.width + Math.sin(f.t * (0.8 + ph) + i) * 50 * N(p, 'sway');
      const s = size * (0.6 + R(f.seed, i + 150) * 0.8);
      ctx.save(); ctx.translate(x, y); if (B(p, 'spin')) ctx.rotate((R(f.seed, i + 200) - 0.5) * 2 * f.t * 1.5);
      drawIcon(ctx, chars[i % chars.length], 0, 0, s, S(p, 'color'), { style: 'solid', stroke: s * 0.09 });
      ctx.restore();
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- stamp
const stamp: ComponentDef = {
  key: 'stamp', label: 'Rubber stamp', category: 'Graphics', defaultDuration: 3,
  description: 'Ink stamp ("APPROVED", "NEW!", "SOLD OUT", "SHIPPED") that slams down rotated with a settle shake, double rough border and ink speckle.',
  props: [
    text('text', 'Text', 'APPROVED', G.content), select('shape', 'Shape', 'rect', ['rect', 'circle', 'burst'], G.content), text('subtext', 'Small text', ''),
    color('color', 'Ink color', '#e5383b'), num('size', 'Text size', 110, 6, 800), font('font', 'Archivo Black'), num('rotation', 'Rotation°', -12, -180, 180, 0.5),
    num('slamDur', 'Slam duration', 0.32, 0.05, 5, 0.01, G.anim, false), num('ink', 'Ink roughness', 1, 0, 3, 0.05), ...animProps('none', 'fade', 0.3, 0.4),
  ],
  draw(ctx, p, f) {
    const cx = f.width / 2, cy = f.height / 2, size = N(p, 'size'), c = S(p, 'color'), txt = S(p, 'text');
    const k = clamp(f.t / N(p, 'slamDur')), sc = lerp(2.4, 1, ease('snap', k)), settle = f.t > N(p, 'slamDur') ? Math.exp(-(f.t - N(p, 'slamDur')) * 14) : 0;
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy);
    ctx.globalAlpha *= clamp(k * 3) * 0.92;
    ctx.translate(cx + Math.sin(f.t * 90) * settle * 6, cy + Math.cos(f.t * 70) * settle * 4); ctx.rotate(N(p, 'rotation') * Math.PI / 180); ctx.scale(sc, sc);
    ctx.font = fnt(400, size, S(p, 'font'));
    const tw = ctx.measureText(txt).width, sub = S(p, 'subtext'), h = size * (sub ? 1.75 : 1.3), w = tw + size * 0.9, shape = S(p, 'shape');
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineJoin = 'round';
    const outline = (inset: number, jit: number) => {
      ctx.beginPath();
      if (shape === 'circle') { const r = Math.max(w, h * 1.6) / 2 - inset; for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU, rr = r + (R(f.seed, i + inset) - 0.5) * jit; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.72); } }
      else if (shape === 'burst') { const r = Math.max(w, h) / 2 + size * 0.25 - inset; for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU, rr = (i % 2 ? r * 0.86 : r) + (R(f.seed, i + inset) - 0.5) * jit; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.62); } }
      else { const pts: [number, number][] = [[-w / 2 + inset, -h / 2 + inset], [w / 2 - inset, -h / 2 + inset], [w / 2 - inset, h / 2 - inset], [-w / 2 + inset, h / 2 - inset]]; pts.forEach(([x, y], i) => ctx.lineTo(x + (R(f.seed, i + inset * 3) - 0.5) * jit, y + (R(f.seed, i + 40 + inset) - 0.5) * jit)); }
      ctx.closePath();
    };
    ctx.lineWidth = size * 0.09; outline(0, size * 0.06 * N(p, 'ink')); ctx.stroke();
    ctx.lineWidth = size * 0.035; outline(size * 0.16, size * 0.05 * N(p, 'ink')); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, sub ? -size * 0.18 : size * 0.04);
    if (sub) { ctx.font = fnt(700, size * 0.28, S(p, 'font')); ctx.fillText(sub, 0, size * 0.5); }
    // ink speckle and dry patches
    for (let i = 0; i < 90 * N(p, 'ink'); i++) {
      const x = (R(f.seed, i + 500) - 0.5) * w * 1.3, y = (R(f.seed, i + 700) - 0.5) * h * 1.5;
      ctx.globalAlpha = 0.5 * R(f.seed, i + 900); ctx.beginPath(); ctx.arc(x, y, 1 + R(f.seed, i + 950) * size * 0.025, 0, TAU); ctx.fill();
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- badge / sticker / price tag
const badge: ComponentDef = {
  key: 'badge', label: 'Badge / sticker / price tag', category: 'Graphics', defaultDuration: 3,
  description: 'Pill, starburst, circle, ribbon or price-tag sticker ("NEW", "-30%", "v2.0", "$9") that pops in, catches a shine sweep and wobbles.',
  props: [
    text('text', 'Text', 'NEW', G.content), text('subtext', 'Small text', ''), select('shape', 'Shape', 'burst', ['pill', 'burst', 'circle', 'ribbon', 'tag'], G.content),
    color('fill', 'Fill', '#ffd43b'), color('textColor', 'Text color', '#111111'), color('outline', 'Outline (blank = none)', ''), num('size', 'Text size', 80, 6, 800),
    font('font', 'Archivo Black'), num('rotation', 'Rotation°', -8, -180, 180, 0.5), bool('shine', 'Shine sweep', true), bool('wobble', 'Wobble', true), bool('shadow', 'Drop shadow', true),
    ...animProps('pop', 'pop', 0.5, 0.3),
  ],
  draw(ctx, p, f) {
    const cx = f.width / 2, cy = f.height / 2, size = N(p, 'size'), txt = S(p, 'text'), sub = S(p, 'subtext'), shape = S(p, 'shape');
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy);
    ctx.translate(cx, cy); ctx.rotate(N(p, 'rotation') * Math.PI / 180 + (B(p, 'wobble') ? Math.sin(f.t * 2.4) * 0.05 : 0));
    ctx.font = fnt(400, size, S(p, 'font'));
    const tw = Math.max(ctx.measureText(txt).width, sub ? ctx.measureText(sub).width * 0.35 : 0), h = size * (sub ? 1.9 : 1.45), w = tw + size * 1.1;
    const body = () => {
      ctx.beginPath();
      if (shape === 'pill') roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      else if (shape === 'circle') { const r = Math.max(w, h) / 2 + size * 0.1; ctx.arc(0, 0, r, 0, TAU); }
      else if (shape === 'burst') { const r = Math.max(w, h) / 2 + size * 0.35; for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU + f.t * 0.3, rr = i % 2 ? r * 0.84 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
      else if (shape === 'ribbon') { const n = h * 0.5; ctx.moveTo(-w / 2 - n, -h / 2); ctx.lineTo(w / 2 + n, -h / 2); ctx.lineTo(w / 2, 0); ctx.lineTo(w / 2 + n, h / 2); ctx.lineTo(-w / 2 - n, h / 2); ctx.lineTo(-w / 2, 0); ctx.closePath(); }
      else { const n = h * 0.5; ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2 + n, 0); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); ctx.moveTo(w / 2 + n * 0.45 + size * 0.09, 0); ctx.arc(w / 2 + n * 0.45, 0, size * 0.09, 0, TAU, true); }
    };
    if (B(p, 'shadow')) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.4; ctx.shadowOffsetY = size * 0.12; body(); ctx.fillStyle = S(p, 'fill'); ctx.fill('evenodd'); ctx.restore(); }
    body(); ctx.fillStyle = S(p, 'fill'); ctx.fill('evenodd');
    if (S(p, 'outline')) { ctx.lineWidth = size * 0.07; ctx.strokeStyle = S(p, 'outline'); ctx.lineJoin = 'round'; ctx.stroke(); }
    if (B(p, 'shine')) {
      const cyc = (f.t % 2.6) / 2.6, sx = lerp(-w, w, ease('easeInOut', clamp(cyc * 2.2)));
      ctx.save(); body(); ctx.clip('evenodd'); ctx.rotate(0.35);
      const g = ctx.createLinearGradient(sx - size * 0.6, 0, sx + size * 0.6, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.65)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-w * 2, -h * 2, w * 4, h * 4); ctx.restore();
    }
    ctx.fillStyle = S(p, 'textColor'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = fnt(400, size, S(p, 'font')); ctx.fillText(txt, shape === 'tag' ? -size * 0.1 : 0, sub ? -size * 0.2 : size * 0.04);
    if (sub) { ctx.font = fnt(700, size * 0.32, S(p, 'font')); ctx.fillText(sub, 0, size * 0.55); }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- arrow pointer
const arrowPointer: ComponentDef = {
  key: 'arrowPointer', label: 'Arrow pointer', category: 'Graphics', defaultDuration: 3,
  description: 'Big arrow that slides in from a side and points at a target (x, y), bobbing toward it, with an optional label at its tail — solid, hand-drawn sketch or curved.',
  props: [
    num('targetX', 'Target X', 1100, -4000, 8000, 1, G.layout), num('targetY', 'Target Y', 520, -4000, 8000, 1, G.layout),
    select('side', 'Comes from', 'left', ['left', 'right', 'top', 'bottom', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'], G.layout), num('length', 'Length', 300, 20, 4000, 1, G.layout),
    select('style', 'Style', 'solid', ['solid', 'sketch', 'curved'], G.content), color('color', 'Color', '#ffd43b'), num('thickness', 'Thickness', 16, 1, 200),
    text('label', 'Label', 'Look here'), font('font', 'Caveat'), num('size', 'Label size', 64, 6, 400), bool('bob', 'Bob', true), ...animProps('slideLeft', 'fade', 0.5, 0.3),
  ],
  draw(ctx, p, f) {
    const tx = N(p, 'targetX'), ty = N(p, 'targetY'), side = S(p, 'side'), len = N(p, 'length'), th = N(p, 'thickness'), c = S(p, 'color');
    const dirs: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1], topLeft: [-0.71, -0.71], topRight: [0.71, -0.71], bottomLeft: [-0.71, 0.71], bottomRight: [0.71, 0.71] };
    const [ux, uy] = dirs[side] ?? dirs.left;
    const { kin, kout } = envelope(p, f);
    const bob = B(p, 'bob') ? (0.5 + 0.5 * Math.sin(f.t * TAU * 1.2)) * th * 1.4 : 0;
    const gap = th * 1.5 + bob + (1 - ease('backOut', kin)) * len * 0.6;
    const hx = tx + ux * gap, hy = ty + uy * gap, sx = hx + ux * len, sy = hy + uy * len;
    ctx.save(); ctx.globalAlpha *= clamp(kin * 1.5) * (1 - kout);
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = th;
    const ang = Math.atan2(hy - sy, hx - sx);
    if (S(p, 'style') === 'curved') {
      const mx = (sx + hx) / 2 - uy * len * 0.3, my = (sy + hy) / 2 + ux * len * 0.3;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, hx, hy); ctx.stroke();
      const a2 = Math.atan2(hy - my, hx - mx); head(a2);
    } else if (S(p, 'style') === 'sketch') {
      for (let pass = 0; pass < 2; pass++) {
        ctx.lineWidth = th * (pass ? 0.55 : 0.8); ctx.beginPath();
        for (let i = 0; i <= 8; i++) { const k = i / 8, j = (R(f.seed, i + pass * 20) - 0.5) * th * 0.9; ctx.lineTo(lerp(sx, hx, k) - uy * j, lerp(sy, hy, k) + ux * j); }
        ctx.stroke();
      }
      ctx.lineWidth = th * 0.8; head(ang, true);
    } else { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx - Math.cos(ang) * th, hy - Math.sin(ang) * th); ctx.stroke(); head(ang); }
    function head(a: number, open = false) {
      const hl = th * 3.2;
      ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * th * 0.6, hy + Math.sin(a) * th * 0.6);
      ctx.lineTo(hx - Math.cos(a - 0.5) * hl, hy - Math.sin(a - 0.5) * hl);
      if (!open) ctx.lineTo(hx - Math.cos(a) * hl * 0.6, hy - Math.sin(a) * hl * 0.6);
      else { ctx.moveTo(hx + Math.cos(a) * th * 0.6, hy + Math.sin(a) * th * 0.6); }
      ctx.lineTo(hx - Math.cos(a + 0.5) * hl, hy - Math.sin(a + 0.5) * hl);
      if (open) ctx.stroke(); else { ctx.closePath(); ctx.fill(); }
    }
    if (S(p, 'label')) {
      ctx.font = fnt(700, N(p, 'size'), S(p, 'font')); ctx.textBaseline = 'middle';
      ctx.textAlign = ux < -0.3 ? 'right' : ux > 0.3 ? 'left' : 'center';
      ctx.fillText(S(p, 'label'), sx + ux * N(p, 'size') * 0.4, sy + uy * N(p, 'size') * 0.7);
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- focus box
const focusBox: ComponentDef = {
  key: 'focusBox', label: 'Focus brackets', category: 'Screen', defaultDuration: 3,
  description: 'Camera-focus corner brackets that snap around a target rectangle (x, y = its center) with a pulse and optional label tab — "look at this" on screenshots and recordings.',
  props: [
    num('targetX', 'Target center X', 960, -4000, 8000, 1, G.layout), num('targetY', 'Target center Y', 540, -4000, 8000, 1, G.layout),
    num('w', 'Target width', 520, 4, 8000, 1, G.layout), num('h', 'Target height', 300, 4, 8000, 1, G.layout), color('color', 'Color', '#42be65'),
    num('thickness', 'Thickness', 8, 1, 100), num('corner', 'Corner length (0–0.5)', 0.22, 0.02, 0.5, 0.01), num('radius', 'Corner radius', 14, 0, 200),
    text('label', 'Label', 'New in v2'), font('font', 'Inter'), num('size', 'Label size', 30, 6, 300), color('labelColor', 'Label text', '#0b0d12'),
    bool('pulse', 'Pulse', true), bool('dim', 'Dim outside', false), ...animProps('fade', 'fade', 0.45, 0.3),
  ],
  draw(ctx, p, f) {
    const { kin, kout } = envelope(p, f), snap = ease('backOut', kin);
    const pulse = B(p, 'pulse') && kin >= 1 ? 1 + 0.025 * Math.sin(f.t * TAU * 0.9) : 1;
    const sc = lerp(1.45, 1, snap) * pulse, w = N(p, 'w') * sc, h = N(p, 'h') * sc, x = N(p, 'targetX') - w / 2, y = N(p, 'targetY') - h / 2;
    const c = S(p, 'color'), cl = Math.min(w, h) * N(p, 'corner'), r = Math.min(N(p, 'radius'), cl * 0.8);
    ctx.save(); ctx.globalAlpha *= clamp(kin * 2) * (1 - kout);
    if (B(p, 'dim')) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.rect(0, 0, f.width, f.height); roundRect(ctx, x, y, w, h, r); ctx.fill('evenodd'); }
    ctx.strokeStyle = c; ctx.lineWidth = N(p, 'thickness'); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [cx0, cy0, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x + w, y + h, -1, -1], [x, y + h, 1, -1]] as const) {
      ctx.beginPath(); ctx.moveTo(cx0, cy0 + sy * cl); ctx.lineTo(cx0, cy0 + sy * r); ctx.arcTo(cx0, cy0, cx0 + sx * r, cy0, r); ctx.lineTo(cx0 + sx * cl, cy0); ctx.stroke();
    }
    if (S(p, 'label')) {
      const k = clamp((f.t - 0.3) / 0.3); ctx.globalAlpha *= k;
      ctx.font = fnt(700, N(p, 'size'), S(p, 'font')); const lw = ctx.measureText(S(p, 'label')).width + N(p, 'size'), lh = N(p, 'size') * 1.6;
      ctx.fillStyle = c; roundRect(ctx, x, y - lh - N(p, 'thickness') * 1.5, lw, lh, lh * 0.3); ctx.fill();
      ctx.fillStyle = S(p, 'labelColor'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(S(p, 'label'), x + N(p, 'size') * 0.5, y - lh / 2 - N(p, 'thickness') * 1.5);
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- typing indicator
const typingIndicator: ComponentDef = {
  key: 'typingIndicator', label: 'Typing indicator', category: 'Social', defaultDuration: 2.5,
  description: 'Chat "someone is typing…" — three bouncing dots in a bubble (or bare), with an optional name.',
  props: [
    select('style', 'Style', 'bubble', ['bubble', 'plain'], G.content), num('size', 'Size', 1.4, 0.1, 20, 0.05), color('bubble', 'Bubble color', '#2a2d35'),
    color('dotColor', 'Dot color', '#c9ccd4'), text('label', 'Name label', ''), color('labelColor', 'Label color', 'rgba(255,255,255,0.6)'), num('speed', 'Speed', 1, 0.1, 10, 0.05),
    ...animProps('pop', 'fade', 0.35, 0.25),
  ],
  draw(ctx, p, f) {
    const cx = f.width / 2, cy = f.height / 2, s = N(p, 'size') * 40;
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy);
    if (S(p, 'style') === 'bubble') {
      ctx.fillStyle = S(p, 'bubble'); roundRect(ctx, cx - s * 2.3, cy - s * 1.15, s * 4.6, s * 2.3, s * 1.15); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - s * 2.25, cy + s * 1.05, s * 0.32, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(cx - s * 2.75, cy + s * 1.45, s * 0.16, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 3; i++) {
      const b = Math.max(0, Math.sin(f.t * TAU * 1.4 * N(p, 'speed') - i * 0.9));
      ctx.fillStyle = withAlpha(S(p, 'dotColor'), 0.5 + 0.5 * b); ctx.beginPath(); ctx.arc(cx + (i - 1) * s * 1.1, cy - b * s * 0.35, s * 0.36, 0, TAU); ctx.fill();
    }
    if (S(p, 'label')) { ctx.fillStyle = S(p, 'labelColor'); ctx.font = fnt(500, s * 0.62, 'Inter'); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(S(p, 'label'), cx - s * 2.3, cy - s * 1.35); }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- waveform
const waveform: ComponentDef = {
  key: 'waveform', label: 'Audio waveform / equalizer', category: 'Data', defaultDuration: 5,
  description: 'Animated pseudo-audio: equalizer bars, mirrored waveform, flowing line or circular spectrum — podcasts, music, voice features.',
  props: [
    select('style', 'Style', 'mirror', ['bars', 'mirror', 'line', 'circle'], G.content), num('bars', 'Bars', 56, 4, 400, 1, G.content, false),
    num('width', 'Width', 1200, 10, 8000, 1, G.layout), num('height', 'Height', 300, 4, 4000, 1, G.layout), num('radius', 'Circle radius', 200, 4, 4000, 1, G.layout),
    color('color', 'Color', '#4f8cff'), color('color2', 'Second color (gradient)', '#a56eff'), num('amplitude', 'Loudness', 1, 0, 3, 0.01), num('speed', 'Speed', 1, 0, 10, 0.05),
    num('gap', 'Bar gap (0–0.9)', 0.35, 0, 0.9, 0.01), ...animProps('fade', 'fade', 0.4, 0.4),
  ],
  draw(ctx, p, f) {
    const n = N(p, 'bars'), W = N(p, 'width'), H = N(p, 'height'), cx = f.width / 2, cy = f.height / 2, st = S(p, 'style'), t = f.t * N(p, 'speed');
    const { kin, kout } = envelope(p, f), amp = N(p, 'amplitude') * kin * (1 - kout);
    const level = (i: number) => {
      const x = i / n, beat = 0.6 + 0.4 * Math.abs(Math.sin(t * 2.4 + R(f.seed, 1) * 6));
      const v = Math.abs(wobble(f.seed, i % 17, t * 3.2 + x * 4)) * 0.75 + 0.25 * Math.abs(Math.sin(t * 5 + i * 0.9));
      return clamp(v * beat * (0.35 + 0.65 * Math.sin(Math.PI * x)) * amp * 1.35);
    };
    ctx.save(); ctx.globalAlpha *= clamp(kin * 1.5) * (1 - kout);
    const g = ctx.createLinearGradient(cx - W / 2, 0, cx + W / 2, 0); g.addColorStop(0, S(p, 'color')); g.addColorStop(1, S(p, 'color2') || S(p, 'color'));
    ctx.fillStyle = g; ctx.strokeStyle = g; ctx.lineCap = 'round';
    if (st === 'line') {
      ctx.lineWidth = 5;
      for (let layer = 0; layer < 3; layer++) {
        ctx.globalAlpha = (layer ? 0.35 : 1) * clamp(kin * 1.5) * (1 - kout); ctx.beginPath();
        for (let i = 0; i <= n * 3; i++) { const x = i / (n * 3), y = Math.sin(x * TAU * (2 + layer) + t * (2 + layer * 0.7)) * level(Math.floor(x * n)) * H / 2; ctx.lineTo(cx - W / 2 + x * W, cy + y); }
        ctx.stroke();
      }
    } else if (st === 'circle') {
      const R0 = N(p, 'radius');
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU - Math.PI / 2, l = level(i) * H * 0.6 + 6;
        ctx.lineWidth = Math.max(2, TAU * R0 / n * (1 - N(p, 'gap')));
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0); ctx.lineTo(cx + Math.cos(a) * (R0 + l), cy + Math.sin(a) * (R0 + l)); ctx.stroke();
      }
    } else {
      const bw = W / n, w = bw * (1 - N(p, 'gap'));
      for (let i = 0; i < n; i++) {
        const l = Math.max(w, level(i) * H), x = cx - W / 2 + i * bw + (bw - w) / 2;
        roundRect(ctx, x, st === 'mirror' ? cy - l / 2 : cy + H / 2 - l, w, l, w / 2); ctx.fill();
      }
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- grid reveal
function spiralRank(cols: number, rows: number) {
  const rank = new Map<string, number>();
  let x = 0, y = 0, dx = 1, dy = 0, x0 = 0, y0 = 0, x1 = cols - 1, y1 = rows - 1;
  for (let i = 0; i < cols * rows; i++) {
    rank.set(`${x},${y}`, i);
    if (dx === 1 && x === x1) { dx = 0; dy = 1; y0++; } else if (dy === 1 && y === y1) { dx = -1; dy = 0; x1--; } else if (dx === -1 && x === x0) { dx = 0; dy = -1; y1--; } else if (dy === -1 && y === y0) { dx = 1; dy = 0; x0++; }
    x += dx; y += dy;
  }
  return rank;
}
const gridReveal: ComponentDef = {
  key: 'gridReveal', label: 'Tile grid reveal', category: 'Transition', defaultDuration: 1.6,
  description: 'A grid of tiles that scale/flip/fade in (and/or out) with a staggered pattern (diagonal, random, center-out, spiral, rows, columns) — a transition, or a mosaic background.',
  props: [
    num('cols', 'Columns', 12, 1, 80, 1, G.content, false), num('rows', 'Rows', 7, 1, 80, 1, G.content, false),
    select('pattern', 'Pattern', 'diagonal', ['diagonal', 'random', 'centerOut', 'spiral', 'rows', 'columns'], G.content), select('mode', 'Mode', 'inOut', ['in', 'out', 'inOut', 'hold'], G.content),
    select('tileAnim', 'Tile animation', 'scale', ['scale', 'flip', 'fade', 'drop'], G.content), color('color1', 'Color 1', '#4f8cff'), color('color2', 'Color 2', '#a56eff'), color('color3', 'Color 3', '#0b0d12'),
    select('coloring', 'Coloring', 'gradient', ['gradient', 'random', 'solid', 'checker'], G.style), num('gap', 'Gap', 0, 0, 100), num('radius', 'Tile radius', 0, 0, 200),
    num('tileDur', 'Tile duration', 0.35, 0.05, 10, 0.05, G.anim, false), num('spread', 'Stagger spread (s)', 0.5, 0, 20, 0.05, G.anim, false),
  ],
  draw(ctx, p, f) {
    const cols = N(p, 'cols'), rows = N(p, 'rows'), cw = f.width / cols, ch = f.height / rows, pat = S(p, 'pattern'), mode = S(p, 'mode');
    const td = N(p, 'tileDur'), sp = N(p, 'spread'), gap = N(p, 'gap'), cols3 = [S(p, 'color1'), S(p, 'color2'), S(p, 'color3')];
    const spiral = pat === 'spiral' ? spiralRank(cols, rows) : null;
    const half = mode === 'inOut' ? f.duration / 2 : f.duration;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const order = pat === 'random' ? R(f.seed, i) : pat === 'centerOut' ? Math.hypot((x + 0.5) / cols - 0.5, (y + 0.5) / rows - 0.5) / 0.7071
        : pat === 'spiral' ? spiral!.get(`${x},${y}`)! / (cols * rows - 1 || 1) : pat === 'rows' ? y / Math.max(1, rows - 1) : pat === 'columns' ? x / Math.max(1, cols - 1) : (x / cols + y / rows) / 2;
      const kin = mode === 'out' ? 1 : mode === 'hold' ? 1 : ease('easeOut', clamp((f.t - order * sp) / td));
      const kout = mode === 'out' ? ease('easeIn', clamp((f.t - order * sp) / td)) : mode === 'inOut' ? ease('easeIn', clamp((f.t - half - order * sp) / td)) : 0;
      const k = kin * (1 - kout);
      if (k <= 0.001) continue;
      const fill = S(p, 'coloring') === 'random' ? cols3[Math.floor(R(f.seed, i + 999) * 3)] : S(p, 'coloring') === 'solid' ? cols3[0]
        : S(p, 'coloring') === 'checker' ? cols3[(x + y) % 2] : mixColor(cols3[0], cols3[1], (x / cols + y / rows) / 2);
      const tw = cw - gap, th = ch - gap, ox = x * cw + gap / 2, oy = y * ch + gap / 2, anim = S(p, 'tileAnim');
      ctx.save(); ctx.fillStyle = fill;
      if (anim === 'fade') ctx.globalAlpha *= k;
      let sx = 1, sy = 1, dy = 0;
      if (anim === 'scale') { sx = sy = k; } else if (anim === 'flip') { sx = k; } else if (anim === 'drop') { dy = -(1 - k) * ch * 1.2; ctx.globalAlpha *= k; }
      ctx.translate(ox + tw / 2, oy + th / 2 + dy); ctx.scale(sx, sy);
      roundRect(ctx, -tw / 2 - 0.5, -th / 2 - 0.5, tw + 1, th + 1, N(p, 'radius')); ctx.fill();
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------- liquid blob
const liquidBlob: ComponentDef = {
  key: 'liquidBlob', label: 'Liquid blobs', category: 'Background', defaultDuration: 6,
  description: 'Soft wobbling liquid blobs (smooth noise-driven outlines) that drift — gooey hero backgrounds, stickers, abstract shapes behind text.',
  props: [
    num('count', 'Blobs', 3, 1, 12, 1, G.content, false), text('colors', 'Colors (comma list)', '#4f8cff,#a56eff,#ff6b9d'), num('size', 'Size', 340, 10, 4000),
    num('spread', 'Spread', 0.28, 0, 1, 0.01, G.layout), num('speed', 'Speed', 1, 0, 10, 0.05), num('wobble', 'Wobble', 0.22, 0, 1, 0.01),
    bool('gloss', 'Glossy highlight', true), num('opacity', 'Opacity', 0.9, 0, 1, 0.01), select('blendMode', 'Blend', 'normal', ['normal', 'screen', 'multiply']),
    ...animProps('pop', 'fade', 0.7, 0.5),
  ],
  draw(ctx, p, f) {
    const n = N(p, 'count'), cols = list(p, 'colors'), t = f.t * N(p, 'speed'), size = N(p, 'size');
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    ctx.globalAlpha *= N(p, 'opacity');
    if (S(p, 'blendMode') !== 'normal') ctx.globalCompositeOperation = S(p, 'blendMode') === 'screen' ? 'screen' : 'multiply';
    for (let b = 0; b < n; b++) {
      const cx = f.width / 2 + wobble(f.seed, b * 3 + 1, t * 0.35) * f.width * N(p, 'spread'), cy = f.height / 2 + wobble(f.seed, b * 3 + 2, t * 0.3) * f.height * N(p, 'spread');
      const r0 = size * (0.7 + R(f.seed, b + 40) * 0.6) / 2, pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, r = r0 * (1 + N(p, 'wobble') * wobble(f.seed, b * 20 + i, t * 1.1)); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const a = pts[i % 10], c2 = pts[(i + 1) % 10], mx = (a[0] + c2[0]) / 2, my = (a[1] + c2[1]) / 2; if (!i) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(a[0], a[1], mx, my); }
      ctx.closePath();
      const col = cols[b % Math.max(1, cols.length)] || '#4f8cff', g = ctx.createRadialGradient(cx - r0 * 0.3, cy - r0 * 0.4, r0 * 0.1, cx, cy, r0 * 1.3);
      g.addColorStop(0, mixColor(col, '#ffffff', 0.25)); g.addColorStop(1, col); ctx.fillStyle = g; ctx.fill();
      if (B(p, 'gloss')) { ctx.save(); ctx.globalAlpha *= 0.35; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(cx - r0 * 0.35, cy - r0 * 0.45, r0 * 0.28, r0 * 0.14, -0.5, 0, TAU); ctx.fill(); ctx.restore(); }
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- star rating
function starPath(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  ctx.closePath();
}
const starRating: ComponentDef = {
  key: 'starRating', label: 'Star rating', category: 'Data', defaultDuration: 3,
  description: 'Row of stars that fill in one by one (supports halves, e.g. 4.5) with a pop and sparkle, plus a label like "4.8 · 2,300 reviews".',
  props: [
    num('rating', 'Rating', 4.5, 0, 10, 0.1, G.content), num('count', 'Stars', 5, 1, 10, 1, G.content, false), text('label', 'Label', '4.5 · 2,300 reviews'),
    num('size', 'Star size', 90, 4, 600), color('color', 'Filled color', '#ffd43b'), color('emptyColor', 'Empty color', 'rgba(255,255,255,0.18)'),
    color('labelColor', 'Label color', 'rgba(255,255,255,0.8)'), font('font', 'Inter'), num('interval', 'Seconds per star', 0.16, 0, 5, 0.01, G.anim, false), bool('sparkle', 'Sparkle', true),
    ...animProps('fade', 'fade', 0.3, 0.3),
  ],
  draw(ctx, p, f) {
    const n = N(p, 'count'), s = N(p, 'size'), gap = s * 1.25, x0 = f.width / 2 - (n - 1) * gap / 2, cy = f.height / 2 - (S(p, 'label') ? s * 0.35 : 0);
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    for (let i = 0; i < n; i++) {
      const cx = x0 + i * gap, fill = clamp(N(p, 'rating') - i), t0 = 0.25 + i * N(p, 'interval'), k = ease('backOut', clamp((f.t - t0) / 0.35));
      ctx.fillStyle = S(p, 'emptyColor'); starPath(ctx, cx, cy, s / 2); ctx.fill();
      if (fill > 0 && k > 0) {
        ctx.save(); ctx.beginPath(); ctx.rect(cx - s / 2, cy - s / 2 - 2, s * fill, s + 4); ctx.clip();
        ctx.translate(cx, cy); ctx.scale(k, k); ctx.fillStyle = S(p, 'color'); starPath(ctx, 0, 0, s / 2); ctx.fill(); ctx.restore();
        if (B(p, 'sparkle')) {
          const sk = clamp((f.t - t0 - 0.15) / 0.5);
          if (sk > 0 && sk < 1) for (let j = 0; j < 6; j++) {
            const a = j / 6 * TAU + i, r = s * (0.55 + sk * 0.5);
            ctx.globalAlpha = 1 - sk; ctx.fillStyle = S(p, 'color'); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, s * 0.05 * (1 - sk), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          }
        }
      }
    }
    if (S(p, 'label')) {
      ctx.globalAlpha *= clamp((f.t - 0.25 - n * N(p, 'interval')) / 0.4);
      ctx.fillStyle = S(p, 'labelColor'); ctx.font = fnt(600, s * 0.36, S(p, 'font')); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(S(p, 'label'), f.width / 2, cy + s * 0.95);
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- status check
const STATUS: Record<string, string> = { success: '#42be65', error: '#fa4d56', warning: '#f1c21b', info: '#4589ff' };
const checkmarkSuccess: ComponentDef = {
  key: 'checkmarkSuccess', label: 'Status check (success / error / warning / info)', category: 'Graphics', defaultDuration: 2.5,
  description: 'Big status mark: the ring draws on, then the ✓ / ✕ / ! / i strokes in, with a burst — "Deployed", "Payment failed", "Heads up".',
  props: [
    select('variant', 'Variant', 'success', ['success', 'error', 'warning', 'info'], G.content), text('label', 'Label', 'Deployed'), num('size', 'Size', 260, 8, 3000),
    color('color', 'Color (blank = variant color)', ''), select('fillStyle', 'Fill', 'ring', ['ring', 'solid'], G.style), num('strokeWidth', 'Line width', 18, 1, 200),
    font('font', 'Inter'), color('labelColor', 'Label color', '#ffffff'), bool('burst', 'Burst', true), ...animProps('pop', 'fade', 0.35, 0.3),
  ],
  draw(ctx, p, f) {
    const cx = f.width / 2, cy = f.height / 2 - (S(p, 'label') ? N(p, 'size') * 0.18 : 0), r = N(p, 'size') / 2, v = S(p, 'variant'), c = S(p, 'color') || STATUS[v] || STATUS.success;
    const kr = ease('easeInOut', clamp((f.t - 0.1) / 0.5)), km = ease('easeOut', clamp((f.t - 0.5) / 0.35)), solid = S(p, 'fillStyle') === 'solid';
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = N(p, 'strokeWidth');
    if (solid) { ctx.fillStyle = c; ctx.globalAlpha *= 1; ctx.beginPath(); ctx.arc(cx, cy, r * ease('backOut', kr), 0, TAU); ctx.fill(); }
    else { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * kr); ctx.stroke(); }
    ctx.strokeStyle = solid ? '#ffffff' : c;
    const seg = (pts: [number, number][], k: number) => {
      if (k <= 0) return; let total = 0; const L: number[] = [];
      for (let i = 1; i < pts.length; i++) { L.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); total += L[i - 1]; }
      let left = total * k; ctx.beginPath(); ctx.moveTo(cx + pts[0][0] * r, cy + pts[0][1] * r);
      for (let i = 1; i < pts.length && left > 0; i++) { const u = Math.min(1, left / L[i - 1]); ctx.lineTo(cx + lerp(pts[i - 1][0], pts[i][0], u) * r, cy + lerp(pts[i - 1][1], pts[i][1], u) * r); left -= L[i - 1]; }
      ctx.stroke();
    };
    if (v === 'success') seg([[-0.42, 0.02], [-0.12, 0.32], [0.45, -0.3]], km);
    else if (v === 'error') { seg([[-0.32, -0.32], [0.32, 0.32]], clamp(km * 2)); seg([[0.32, -0.32], [-0.32, 0.32]], clamp(km * 2 - 1)); }
    else { const top = v === 'warning' ? [[0, -0.45], [0, 0.12]] : [[0, -0.05], [0, 0.45]]; seg(top as [number, number][], km); if (km > 0.6) { ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(cx, cy + (v === 'warning' ? 0.38 : -0.33) * r, N(p, 'strokeWidth') * 0.62, 0, TAU); ctx.fill(); } }
    if (B(p, 'burst')) {
      const kb = clamp((f.t - 0.8) / 0.55);
      if (kb > 0 && kb < 1) { ctx.strokeStyle = c; ctx.lineWidth = N(p, 'strokeWidth') * 0.5 * (1 - kb); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * (1.15 + kb * 0.3), cy + Math.sin(a) * r * (1.15 + kb * 0.3)); ctx.lineTo(cx + Math.cos(a) * r * (1.3 + kb * 0.45), cy + Math.sin(a) * r * (1.3 + kb * 0.45)); ctx.stroke(); } }
    }
    if (S(p, 'label')) {
      ctx.globalAlpha *= clamp((f.t - 0.75) / 0.35); ctx.fillStyle = S(p, 'labelColor'); ctx.font = fnt(700, r * 0.42, S(p, 'font')); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(S(p, 'label'), cx, cy + r * 1.55 + (1 - clamp((f.t - 0.75) / 0.35)) * 20);
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- speech bubble
const calloutBubble: ComponentDef = {
  key: 'calloutBubble', label: 'Speech / thought bubble', category: 'Social', defaultDuration: 4,
  description: 'Comic speech, thought or shout bubble with its tail pointing at a target (a character\'s mouth), text typing in — for characters, mascots and "the customer said…" moments.',
  props: [
    text('text', 'Text', 'Arr, edit me next!', G.content, true), select('style', 'Style', 'speech', ['speech', 'thought', 'shout'], G.content),
    num('bubbleX', 'Bubble center X', 1100, -4000, 8000, 1, G.layout), num('bubbleY', 'Bubble center Y', 360, -4000, 8000, 1, G.layout),
    num('targetX', 'Tail points to X', 880, -4000, 8000, 1, G.layout), num('targetY', 'Tail points to Y', 600, -4000, 8000, 1, G.layout),
    color('fill', 'Fill', '#ffffff'), color('outline', 'Outline', '#111111'), num('outlineWidth', 'Outline width', 6, 0, 40), color('textColor', 'Text color', '#111111'),
    font('font', 'Outfit'), num('size', 'Text size', 46, 6, 400), num('weight', 'Weight', 700, 100, 900, 100), num('maxWidth', 'Max text width', 620, 40, 4000, 1, G.layout),
    bool('typing', 'Type the text in', true, G.anim), num('cps', 'Typing speed (chars/s)', 32, 1, 400, 1, G.anim, false), ...animProps('pop', 'fade', 0.35, 0.3),
  ],
  draw(ctx, p, f) {
    const bx = N(p, 'bubbleX'), by = N(p, 'bubbleY'), tx = N(p, 'targetX'), ty = N(p, 'targetY'), size = N(p, 'size'), st = S(p, 'style');
    ctx.font = fnt(N(p, 'weight'), size, S(p, 'font'));
    // wrap
    const words = S(p, 'text').split(/\s+/).filter(Boolean), lines: string[] = []; let cur = '';
    for (const w of words) { const nx = cur ? `${cur} ${w}` : w; if (cur && ctx.measureText(nx).width > N(p, 'maxWidth')) { lines.push(cur); cur = w; } else cur = nx; }
    if (cur) lines.push(cur);
    const tw = Math.max(1, ...lines.map((l) => ctx.measureText(l).width)), lh = size * 1.25, w = tw + size * 1.4, h = lines.length * lh + size * 1.1;
    ctx.save(); applyEnvelope(ctx, p, f, bx, by);
    ctx.fillStyle = S(p, 'fill'); ctx.strokeStyle = S(p, 'outline'); ctx.lineWidth = N(p, 'outlineWidth'); ctx.lineJoin = 'round';
    const ang = Math.atan2(ty - by, tx - bx), bw = Math.min(w, h) * 0.22;
    const body = () => {
      ctx.beginPath();
      if (st === 'shout') { const n = 22; for (let i = 0; i <= n; i++) { const a = (i / n) * TAU, rr = i % 2 ? 0.86 : 1.12; ctx.lineTo(bx + Math.cos(a) * w * 0.62 * rr, by + Math.sin(a) * h * 0.72 * rr); } ctx.closePath(); }
      else if (st === 'thought') { ctx.ellipse(bx, by, w * 0.62, h * 0.7, 0, 0, TAU); }
      else roundRect(ctx, bx - w / 2, by - h / 2, w, h, Math.min(h / 2, size * 0.9));
    };
    if (st === 'thought') {
      for (let i = 0; i < 3; i++) { const k = 0.55 + i * 0.16, x = lerp(bx, tx, k), y = lerp(by, ty, k), r = size * (0.42 - i * 0.11); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); if (N(p, 'outlineWidth')) ctx.stroke(); }
      body(); ctx.fill(); if (N(p, 'outlineWidth')) ctx.stroke();
    } else {
      // tail as a wedge from the bubble edge to the target, drawn with the body so the outline is continuous
      const ex = bx + Math.cos(ang) * Math.min(w, h) * 0.3, ey = by + Math.sin(ang) * Math.min(w, h) * 0.3;
      ctx.beginPath(); ctx.moveTo(ex - Math.sin(ang) * bw, ey + Math.cos(ang) * bw); ctx.lineTo(tx, ty); ctx.lineTo(ex + Math.sin(ang) * bw, ey - Math.cos(ang) * bw); ctx.closePath();
      if (N(p, 'outlineWidth')) ctx.stroke(); body(); if (N(p, 'outlineWidth')) ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex - Math.sin(ang) * bw, ey + Math.cos(ang) * bw); ctx.lineTo(tx, ty); ctx.lineTo(ex + Math.sin(ang) * bw, ey - Math.cos(ang) * bw); ctx.closePath(); ctx.fill();
      body(); ctx.fill();
    }
    let left = B(p, 'typing') ? Math.floor(Math.max(0, f.t - Number(p.inDur ?? 0.35)) * N(p, 'cps')) : Infinity;
    ctx.fillStyle = S(p, 'textColor'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => { if (left <= 0) return; const shown = l.slice(0, left); left -= l.length + 1; ctx.textAlign = 'left'; ctx.fillText(shown, bx - ctx.measureText(l).width / 2, by - (lines.length - 1) * lh / 2 + i * lh + size * 0.04); });
    ctx.restore();
  },
};

// ---------------------------------------------------------------- odometer
const numberTicker: ComponentDef = {
  key: 'numberTicker', label: 'Odometer number', category: 'Data', defaultDuration: 3,
  description: 'Rolling odometer digits: every digit column scrolls like a mechanical counter to the value — revenue, users, downloads, prices.',
  props: [
    num('value', 'Value', 128450, -1e12, 1e12, 1, G.content), num('from', 'From', 0, -1e12, 1e12, 1, G.content), num('decimals', 'Decimals', 0, 0, 4, 1, G.content, false),
    text('prefix', 'Prefix', '$'), text('suffix', 'Suffix', ''), bool('separator', 'Thousands separator', true), text('label', 'Label', 'monthly revenue'),
    font('font', 'Space Grotesk'), num('size', 'Size', 190, 6, 1200), num('weight', 'Weight', 700, 100, 900, 100), color('color', 'Color', '#ffffff'), color('labelColor', 'Label color', 'rgba(255,255,255,0.65)'),
    num('rollDur', 'Roll duration', 1.8, 0.05, 30, 0.05, G.anim, false), select('rollEase', 'Easing', 'expoOut', ['linear', 'easeOut', 'expoOut', 'easeInOut', 'quintOut'], G.anim), bool('cells', 'Digit cells', false),
    color('cellColor', 'Cell color', 'rgba(255,255,255,0.08)'), ...animProps('fade', 'fade', 0.3, 0.3),
  ],
  draw(ctx, p, f) {
    const dec = N(p, 'decimals'), scale = 10 ** dec, size = N(p, 'size');
    const k = ease(S(p, 'rollEase') as never, clamp((f.t - 0.15) / N(p, 'rollDur')));
    const v = Math.abs(lerp(N(p, 'from'), N(p, 'value'), k)) * scale, target = Math.abs(N(p, 'value')) * scale;
    const nd = Math.max(String(Math.round(target)).length, String(Math.round(Math.abs(N(p, 'from')) * scale)).length, dec + 1);
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    ctx.font = fnt(N(p, 'weight'), size, S(p, 'font')); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const dw = Math.max(...'0123456789'.split('').map((d) => ctx.measureText(d).width)) * 1.02, sepW = ctx.measureText(',').width, lh = size * 1.1;
    // layout right → left: digit columns, separators, decimal point
    type Cell = { kind: 'digit'; col: number } | { kind: 'char'; ch: string };
    const cells: Cell[] = [];
    for (let c = 0; c < nd; c++) {
      cells.unshift({ kind: 'digit', col: c });
      if (dec && c === dec - 1) cells.unshift({ kind: 'char', ch: '.' });
      const ip = c - dec;
      if (B(p, 'separator') && ip >= 0 && ip % 3 === 2 && c < nd - 1) cells.unshift({ kind: 'char', ch: ',' });
    }
    const neg = lerp(N(p, 'from'), N(p, 'value'), k) < 0, pre = (neg ? '-' : '') + S(p, 'prefix'), suf = S(p, 'suffix');
    const pw = ctx.measureText(pre).width, sw = ctx.measureText(suf).width;
    const total = pw + sw + cells.reduce((a, c) => a + (c.kind === 'digit' ? dw : sepW), 0);
    const cy = f.height / 2 - (S(p, 'label') ? size * 0.2 : 0);
    let x = f.width / 2 - total / 2;
    ctx.fillStyle = S(p, 'color');
    ctx.textAlign = 'left'; ctx.fillText(pre, x, cy); x += pw; ctx.textAlign = 'center';
    for (const c of cells) {
      if (c.kind === 'char') { ctx.fillText(c.ch, x + sepW / 2, cy); x += sepW; continue; }
      const colVal = v / 10 ** c.col, digit = Math.floor(colVal) % 10;
      // smooth roll only while the lower columns are passing 9 → 0 (true odometer behaviour)
      const lower = c.col === 0 ? colVal % 1 : clamp(((v / 10 ** (c.col - 1)) % 10) - 9);
      const leading = c.col > 0 && v < 10 ** c.col && target < 10 ** c.col;
      if (B(p, 'cells')) { ctx.fillStyle = S(p, 'cellColor'); roundRect(ctx, x + dw * 0.04, cy - lh / 2, dw * 0.92, lh, size * 0.08); ctx.fill(); ctx.fillStyle = S(p, 'color'); }
      if (!leading) {
        ctx.save(); ctx.beginPath(); ctx.rect(x, cy - lh / 2, dw, lh); ctx.clip();
        const off = lower * lh;
        ctx.fillText(String(digit), x + dw / 2, cy - off); ctx.fillText(String((digit + 1) % 10), x + dw / 2, cy - off + lh);
        ctx.restore();
      }
      x += dw;
    }
    ctx.textAlign = 'left'; ctx.fillText(suf, x, cy);
    if (S(p, 'label')) { ctx.fillStyle = S(p, 'labelColor'); ctx.textAlign = 'center'; ctx.font = fnt(500, size * 0.22, S(p, 'font')); ctx.fillText(S(p, 'label'), f.width / 2, cy + size * 0.78); }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- timer
const timer: ComponentDef = {
  key: 'timer', label: 'Timer / stopwatch', category: 'Data', defaultDuration: 5,
  description: 'Clock display counting down (to zero) or up like a stopwatch, mm:ss / ss / mm:ss.cs / hh:mm:ss, with an optional progress ring — deadlines, "built in 41 seconds", speedruns.',
  props: [
    select('mode', 'Mode', 'countdown', ['countdown', 'stopwatch'], G.content), num('from', 'Start at (s)', 60, 0, 360000, 1, G.content), num('rate', 'Speed (× real time)', 1, 0, 1000, 0.1, G.content, false),
    select('format', 'Format', 'mm:ss', ['mm:ss', 'ss', 'mm:ss.cs', 'hh:mm:ss'], G.content), text('label', 'Label', 'until launch'), bool('ring', 'Progress ring', true), num('ringTotal', 'Ring full at (s)', 60, 0.1, 360000, 1, G.content),
    font('font', 'JetBrains Mono'), num('size', 'Size', 150, 6, 1200), num('weight', 'Weight', 700, 100, 900, 100), color('color', 'Color', '#ffffff'), color('accent', 'Ring color', '#ff6b6b'),
    color('trackColor', 'Ring track', 'rgba(255,255,255,0.12)'), color('labelColor', 'Label color', 'rgba(255,255,255,0.65)'), ...animProps('fade', 'fade', 0.3, 0.3),
  ],
  draw(ctx, p, f) {
    const el = Math.max(0, f.t - 0.1) * N(p, 'rate'), down = S(p, 'mode') === 'countdown';
    const sec = down ? Math.max(0, N(p, 'from') - el) : N(p, 'from') + el;
    const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
    const fmt = S(p, 'format');
    const txt = fmt === 'ss' ? pad(sec) : fmt === 'hh:mm:ss' ? `${pad(sec / 3600)}:${pad((sec % 3600) / 60)}:${pad(sec % 60)}` : fmt === 'mm:ss.cs' ? `${pad(sec / 60)}:${pad(sec % 60)}.${pad((sec * 100) % 100)}` : `${pad(sec / 60)}:${pad(sec % 60)}`;
    const cx = f.width / 2, cy = f.height / 2, size = N(p, 'size');
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy);
    if (B(p, 'ring')) {
      ctx.font = fnt(N(p, 'weight'), size, S(p, 'font')); const r = Math.max(ctx.measureText(txt).width * 0.62, size * 1.1);
      const frac = clamp((down ? sec : sec % N(p, 'ringTotal')) / N(p, 'ringTotal'));
      ctx.lineCap = 'round'; ctx.lineWidth = size * 0.1; ctx.strokeStyle = S(p, 'trackColor'); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = S(p, 'accent'); ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
    }
    const urgent = down && sec <= 10 && sec > 0 ? 1 + 0.04 * Math.max(0, Math.sin((sec % 1) * Math.PI)) : 1;
    ctx.translate(cx, cy); ctx.scale(urgent, urgent);
    ctx.fillStyle = down && sec <= 10 ? mixColor(S(p, 'color'), S(p, 'accent'), 0.6) : S(p, 'color');
    ctx.font = fnt(N(p, 'weight'), size, S(p, 'font')); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, size * 0.03);
    if (S(p, 'label')) { ctx.fillStyle = S(p, 'labelColor'); ctx.font = fnt(500, size * 0.2, 'Inter'); ctx.fillText(S(p, 'label'), 0, size * (B(p, 'ring') ? 0.55 : 0.78)); }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- gesture hint
function hand(ctx: Ctx, x: number, y: number, s: number, col: string, press: number) {
  // stylized pointing hand: fingertip at (x, y)
  ctx.save(); ctx.translate(x, y); ctx.scale(s * (1 - press * 0.08), s * (1 - press * 0.08)); ctx.rotate(-0.25);
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; ctx.fillStyle = col;
  roundRect(ctx, -11, -6, 22, 70, 11); ctx.fill();
  roundRect(ctx, -12, 40, 70, 74, 26); ctx.fill();
  for (let i = 0; i < 3; i++) { roundRect(ctx, 12 + i * 16, 34 - (i === 0 ? 4 : 0), 17, 40, 8.5); ctx.fill(); }
  roundRect(ctx, -32, 58, 30, 18, 9); ctx.fill();
  ctx.restore();
}
const swipeHint: ComponentDef = {
  key: 'swipeHint', label: 'Gesture hint (tap / swipe)', category: 'Screen', defaultDuration: 3,
  description: 'A hand pointer demonstrating a gesture — tap, double-tap, long-press, swipe left/right/up, pinch — with touch ripples and a motion trail, repeating. Put it over phone recordings.',
  props: [
    select('gesture', 'Gesture', 'tap', ['tap', 'doubleTap', 'longPress', 'swipeLeft', 'swipeRight', 'swipeUp', 'pinch'], G.content),
    num('size', 'Size', 1.6, 0.1, 20, 0.05), num('distance', 'Swipe distance', 360, 10, 4000, 1, G.layout), num('period', 'Repeat every (s)', 1.6, 0.3, 20, 0.05, G.anim, false),
    color('color', 'Hand color', '#ffffff'), color('touchColor', 'Touch color', '#4f8cff'), bool('trail', 'Trail', true), ...animProps('fade', 'fade', 0.3, 0.3),
  ],
  draw(ctx, p, f) {
    const cx = f.width / 2, cy = f.height / 2, g = S(p, 'gesture'), per = N(p, 'period'), k = (f.t % per) / per, s = N(p, 'size'), tc = S(p, 'touchColor'), dist = N(p, 'distance');
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy);
    const ring = (x: number, y: number, kk: number) => { if (kk <= 0 || kk >= 1) return; ctx.save(); ctx.globalAlpha *= 1 - kk; ctx.strokeStyle = tc; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.arc(x, y, (14 + kk * 50) * s, 0, TAU); ctx.stroke(); ctx.restore(); };
    const dot = (x: number, y: number, a: number) => { ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = withAlpha(tc, 0.55); ctx.beginPath(); ctx.arc(x, y, 18 * s, 0, TAU); ctx.fill(); ctx.restore(); };
    if (g === 'tap' || g === 'doubleTap' || g === 'longPress') {
      const taps = g === 'doubleTap' ? [0.25, 0.45] : [0.3];
      let press = 0;
      for (const t0 of taps) { const d = k - t0; if (d > -0.05 && d < (g === 'longPress' ? 0.45 : 0.08)) press = 1; ring(cx, cy, (k - t0) * 3); }
      if (g === 'longPress' && k > 0.3 && k < 0.75) { ctx.save(); ctx.strokeStyle = tc; ctx.lineWidth = 6 * s; ctx.beginPath(); ctx.arc(cx, cy, 34 * s, -Math.PI / 2, -Math.PI / 2 + TAU * (k - 0.3) / 0.45); ctx.stroke(); ctx.restore(); }
      if (press) dot(cx, cy, 1);
      hand(ctx, cx, cy - press * 4 * s, s, S(p, 'color'), press);
    } else if (g === 'pinch') {
      const sp = lerp(1, 0.25, ease('easeInOut', clamp((k - 0.15) / 0.55))) * dist * 0.5, a = clamp(1 - Math.abs(k - 0.45) * 3);
      dot(cx - sp * 0.7, cy + sp * 0.7, a); dot(cx + sp * 0.7, cy - sp * 0.7, a);
      ctx.save(); ctx.strokeStyle = withAlpha(tc, 0.5 * a); ctx.lineWidth = 3 * s; ctx.setLineDash([10 * s, 10 * s]); ctx.beginPath(); ctx.moveTo(cx - sp * 0.7, cy + sp * 0.7); ctx.lineTo(cx + sp * 0.7, cy - sp * 0.7); ctx.stroke(); ctx.restore();
      hand(ctx, cx + sp * 0.7, cy - sp * 0.7, s, S(p, 'color'), a > 0.5 ? 1 : 0);
    } else {
      const [ux, uy] = g === 'swipeLeft' ? [-1, 0] : g === 'swipeRight' ? [1, 0] : [0, -1];
      const m = ease('easeInOut', clamp((k - 0.15) / 0.5)), x = cx - ux * dist / 2 + ux * dist * m, y = cy - uy * dist / 2 + uy * dist * m, down = k > 0.12 && k < 0.7;
      if (B(p, 'trail') && down) {
        const g2 = ctx.createLinearGradient(cx - ux * dist / 2, cy - uy * dist / 2, x, y); g2.addColorStop(0, withAlpha(tc, 0)); g2.addColorStop(1, withAlpha(tc, 0.6));
        ctx.save(); ctx.strokeStyle = g2; ctx.lineCap = 'round'; ctx.lineWidth = 30 * s; ctx.beginPath(); ctx.moveTo(cx - ux * dist / 2, cy - uy * dist / 2); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
      }
      if (down) dot(x, y, 1);
      ctx.save(); ctx.globalAlpha *= clamp(k * 6) * clamp((1 - k) * 4); hand(ctx, x, y, s, S(p, 'color'), down ? 1 : 0); ctx.restore();
    }
    ctx.restore();
  },
};

export const MORE2_COMPONENTS: ComponentDef[] = [
  icon, iconBurst, pathDraw, morphShape, orbit, ripple, textPath, revealMask, loader, emojiRain, stamp, badge, arrowPointer, focusBox,
  typingIndicator, waveform, gridReveal, liquidBlob, starRating, checkmarkSuccess, calloutBubble, numberTicker, timer, swipeHint,
];

export type { FrameInfo };
