// User-made graphics: freehand strokes, lines and arrows drawn with the editor's drawing tools.
// The path is stored in canvas pixels (absolute M/L/Q/C/Z), so the clip's transform props move, scale and rotate it
// like any other clip, and the draw-on animation replays the stroke the way it was drawn.
import { clamp, ease, rng, withAlpha } from '../engine/ease.ts';
import { mix } from './draw.ts';
import { animProps, applyEnvelope, B, bool, color, type ComponentDef, G, N, num, S, select, text } from './kit.ts';

type Pt = [number, number];

/** Flatten an absolute SVG path (M L H V Q C Z) into polylines — enough for our own paths and pasted simple ones. */
export function flattenPath(d: string): Pt[][] {
  const tok = d.match(/[MLHVQCZmlhvqcz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out: Pt[][] = [];
  let cur: Pt[] = [], cmd = '', i = 0, x = 0, y = 0, sx = 0, sy = 0;
  const n = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[a-z]/i.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'M') { if (cur.length > 1) out.push(cur); x = n() + ox; y = n() + oy; sx = x; sy = y; cur = [[x, y]]; cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { x = n() + ox; y = n() + oy; cur.push([x, y]); }
    else if (C === 'H') { x = n() + ox; cur.push([x, y]); }
    else if (C === 'V') { y = n() + oy; cur.push([x, y]); }
    else if (C === 'Q') {
      const cx = n() + ox, cy = n() + oy, ex = n() + ox, ey = n() + oy;
      for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; cur.push([u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey]); }
      x = ex; y = ey;
    } else if (C === 'C') {
      const c1x = n() + ox, c1y = n() + oy, c2x = n() + ox, c2y = n() + oy, ex = n() + ox, ey = n() + oy;
      for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; cur.push([u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex, u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey]); }
      x = ex; y = ey;
    } else if (C === 'Z') { cur.push([sx, sy]); x = sx; y = sy; out.push(cur); cur = [[x, y]]; }
    else i++;
    if (!Number.isFinite(x) || !Number.isFinite(y)) break;
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

const cache = new Map<string, { lines: Pt[][]; lens: number[]; total: number }>();
function geometry(d: string) {
  let g = cache.get(d);
  if (!g) {
    const lines = flattenPath(d);
    const lens = lines.map((l) => l.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0));
    g = { lines, lens, total: lens.reduce((a, b) => a + b, 0) };
    if (cache.size > 200) cache.clear();
    cache.set(d, g);
  }
  return g;
}

/** Trace the first `len` pixels of the polylines (draw-on). */
function trace(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, lines: Pt[][], len: number, jitter = 0, R?: () => number) {
  ctx.beginPath();
  let left = len;
  lines.forEach((l) => {
    if (left <= 0) return;
    const j = () => (jitter && R ? (R() - 0.5) * jitter : 0);
    ctx.moveTo(l[0][0] + j(), l[0][1] + j());
    for (let i = 1; i < l.length && left > 0; i++) {
      const seg = Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
      if (seg >= left) { const k = left / seg; ctx.lineTo(l[i - 1][0] + (l[i][0] - l[i - 1][0]) * k, l[i - 1][1] + (l[i][1] - l[i - 1][1]) * k); left = 0; break; }
      ctx.lineTo(l[i][0] + j(), l[i][1] + j());
      left -= seg;
    }
  });
}

const drawing: ComponentDef = {
  key: 'drawing', label: 'Drawing', category: 'Graphics', defaultDuration: 5,
  description: 'A hand-drawn stroke, line or arrow (made with the editor\'s pen / line / arrow tools, or any SVG path in canvas pixels). Replays as it was drawn; pen, marker, highlighter, neon, chalk or brush look.',
  props: [
    text('path', 'Path (SVG, canvas px)', 'M760 600 Q860 420 960 540 T1160 520', G.content, true),
    select('style', 'Look', 'pen', ['pen', 'marker', 'highlighter', 'neon', 'chalk', 'brush'], G.style),
    color('color', 'Color', '#ffd43b'), num('width', 'Thickness', 10, 0.5, 200, 0.5),
    color('fill', 'Fill (blank = none)', ''), select('cap', 'Line ends', 'round', ['round', 'square', 'butt'], G.style),
    bool('drawOn', 'Draw on', true, G.anim), num('drawDur', 'Draw-on duration', 0.8, 0.05, 30, 0.05, G.anim, false),
    select('drawEase', 'Draw-on easing', 'easeInOut', ['linear', 'easeOut', 'easeInOut', 'expoOut', 'sineInOut'], G.anim),
    ...animProps('none', 'fade', 0.3, 0.35),
  ],
  draw(ctx, p, f) {
    const g = geometry(S(p, 'path'));
    if (!g.total) return;
    const k = B(p, 'drawOn') ? ease(S(p, 'drawEase') as never, clamp(f.t / Math.max(0.01, N(p, 'drawDur')))) : 1;
    const len = g.total * k, w = N(p, 'width'), col = S(p, 'color'), style = S(p, 'style');
    ctx.save();
    applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    ctx.lineJoin = 'round'; ctx.lineCap = (S(p, 'cap') || 'round') as CanvasLineCap;
    if (S(p, 'fill') && k >= 1) {
      // fill fades in once the outline is complete
      const fk = clamp((f.t - N(p, 'drawDur')) / 0.35);
      ctx.save(); ctx.globalAlpha *= B(p, 'drawOn') ? fk : 1; ctx.fillStyle = S(p, 'fill'); trace(ctx, g.lines, g.total); ctx.fill(); ctx.restore();
    }
    const R = rng(mix(f.seed ^ 0x5bd1));
    const stroke = (lw: number, c: string, alpha = 1, jitter = 0) => { ctx.save(); ctx.globalAlpha *= alpha; ctx.lineWidth = lw; ctx.strokeStyle = c; trace(ctx, g.lines, len, jitter, R); ctx.stroke(); ctx.restore(); };
    switch (style) {
      case 'marker': stroke(w * 1.6, col, 0.92); break;
      case 'highlighter': ctx.lineCap = 'butt'; stroke(w * 3, col, 0.38); break;
      case 'neon': ctx.shadowColor = col; ctx.shadowBlur = w * 2.4; stroke(w * 1.2, col, 0.9); ctx.shadowBlur = 0; stroke(w * 0.45, withAlpha('#ffffff', 0.9)); break;
      case 'chalk': for (let i = 0; i < 4; i++) stroke(w * (0.5 + i * 0.12), col, 0.35, w * 0.6); break;
      case 'brush': stroke(w * 1.9, col, 0.25, w * 0.5); stroke(w * 1.3, col, 0.55, w * 0.25); stroke(w * 0.8, col, 1); break;
      default: stroke(w, col);
    }
    ctx.restore();
  },
};

export const USER_COMPONENTS: ComponentDef[] = [drawing];
