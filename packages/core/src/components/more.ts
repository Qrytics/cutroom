// Additional motion-graphics components (kinetic type, social UI, data, particles, overlays, transitions).
// Same contract as index.ts: pure functions of (props, clip-local time), seeded randomness only.
import { clamp, ease, hash, lerp, mixColor, rng, win, withAlpha } from '../engine/ease.ts';
import type { Props } from '../schema/types.ts';
import { type Ctx, drawText, layoutText, roundRect, type TextStyle } from './draw.ts';
import { animOf, animProps, applyEnvelope, B, bool, color, type ComponentDef, envelope, font, G, N, num, S, select, styleOf, text } from './kit.ts';

const TAU = Math.PI * 2;
const lines = (p: Props, k: string) => S(p, k).split('\n').map((l) => l.trim()).filter(Boolean);
const frac = (x: number) => x - Math.floor(x);
const wrap = (v: number, lo: number, hi: number) => lo + (((v - lo) % (hi - lo)) + (hi - lo)) % (hi - lo);
const palette = (p: Props, keys: string[]) => keys.map((k) => S(p, k)).filter(Boolean);
const fnt = (weight: number, size: number, family: string, italic = false) => `${italic ? 'italic ' : ''}${weight} ${size}px "${family}", system-ui, sans-serif`;
const compact = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(1)}K` : Math.round(v).toLocaleString('en-US'));

/** Font size at which `txt` fits in maxW (never larger than size). */
function fitSize(ctx: Ctx, txt: string, family: string, weight: number, size: number, maxW: number) {
  ctx.font = fnt(weight, size, family);
  const w = ctx.measureText(txt).width;
  return w > maxW ? size * maxW / w : size;
}
/** Rounded-rect subpath without beginPath, for compound (evenodd) paths. */
function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/** Stroke the first k (0–1) of a polyline; returns the pen position. */
function strokePartial(ctx: Ctx, pts: [number, number][], k: number): [number, number] {
  if (pts.length < 2 || k <= 0) return pts[0] ?? [0, 0];
  const seg: number[] = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let left = total * clamp(k), end: [number, number] = pts[0];
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const u = Math.min(1, left / Math.max(1e-6, seg[i - 1]));
    end = [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)];
    ctx.lineTo(end[0], end[1]); left -= seg[i - 1];
  }
  ctx.stroke();
  return end;
}
/** Point at fraction k along a polyline. */
function along(pts: [number, number][], k: number): [number, number] {
  let total = 0; const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let left = total * clamp(k);
  for (let i = 1; i < pts.length; i++) {
    if (left <= seg[i - 1]) { const u = left / Math.max(1e-6, seg[i - 1]); return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]; }
    left -= seg[i - 1];
  }
  return pts[pts.length - 1];
}
function heart(ctx: Ctx, x: number, y: number, s: number) {
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.45, y - s * 0.85, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 0.85, x + s * 0.9, y - s * 0.25, x, y + s * 0.35); ctx.closePath();
}
function checkMark(ctx: Ctx, x: number, y: number, r: number, k: number, col: string) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 0.45, 0); ctx.lineTo(-r * 0.1, r * 0.35); ctx.lineTo(r * 0.5, -r * 0.35); ctx.stroke(); ctx.restore();
}
function crossMark(ctx: Ctx, x: number, y: number, r: number, k: number, col: string) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 0.38, -r * 0.38); ctx.lineTo(r * 0.38, r * 0.38); ctx.moveTo(r * 0.38, -r * 0.38); ctx.lineTo(-r * 0.38, r * 0.38); ctx.stroke(); ctx.restore();
}
const parseData = (p: Props, k = 'data') => lines(p, k).map((l) => { const m = l.match(/^(.*?):\s*(-?[\d.]+)/); return m ? { label: m[1].trim(), v: parseFloat(m[2]) } : null; }).filter(Boolean) as { label: string; v: number }[];

// ================================================================ Text
const kineticType: ComponentDef = {
  key: 'kineticType', label: 'Kinetic type', category: 'Text', defaultDuration: 4,
  description: 'One word or short phrase per beat (one per line), slammed full-frame with varied scale, tilt and color. Set interval to the beat length.',
  props: [
    text('words', 'Words (one per beat)', 'Cut\nfaster.\nShip\nlouder.', G.content, true),
    num('interval', 'Seconds per word', 0.5, 0.05, 10, 0.01, G.anim, false),
    select('style', 'Style', 'slam', ['slam', 'stack', 'flip', 'zoom', 'alternate'], G.content),
    font('font', 'Anton'), num('size', 'Max size', 320, 8, 1200), num('weight', 'Weight', 800, 100, 900, 100), bool('uppercase', 'Uppercase', true),
    color('color1', 'Color 1', '#ffffff'), color('color2', 'Color 2', '#ffd43b'), color('color3', 'Color 3', '#4f8cff'),
    color('boxColor', 'Box color (alternate)', '#ffffff'), color('boxText', 'Text on box', '#0b0d12'), num('tilt', 'Max tilt°', 6, 0, 45, 0.5),
  ],
  draw(ctx, p, f) {
    const ws = lines(p, 'words').map((w) => (B(p, 'uppercase') ? w.toUpperCase() : w));
    if (!ws.length) return;
    const iv = Math.max(0.05, N(p, 'interval')), idx = Math.min(ws.length - 1, Math.floor(f.t / iv)), kt = f.t - idx * iv;
    const cols = palette(p, ['color1', 'color2', 'color3']), st = S(p, 'style'), W = f.width, H = f.height, cx = W / 2, cy = H / 2;
    const fam = S(p, 'font') || 'Anton', wt = N(p, 'weight') || 800;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha *= 1 - win(f.t, f.duration - 0.2, 0.2, 'easeIn');
    if (st === 'stack') {
      const shown = ws.slice(0, idx + 1), lh = Math.min(N(p, 'size'), H * 0.86 / shown.length);
      shown.forEach((w, i) => {
        const size = fitSize(ctx, w, fam, wt, lh * 0.92, W * 0.86), k = i === idx ? ease('snap', kt / 0.2) : 1;
        ctx.save(); ctx.translate(cx, cy + (i - (shown.length - 1) / 2) * lh); ctx.scale(lerp(1.6, 1, k), lerp(1.6, 1, k)); ctx.globalAlpha *= clamp(k * 2);
        ctx.font = fnt(wt, size, fam); ctx.fillStyle = cols[i % cols.length]; ctx.fillText(w, 0, 0); ctx.restore();
      });
      ctx.restore(); return;
    }
    const R = rng(f.seed + idx * 7919); R();
    const w = ws[idx], size = fitSize(ctx, w, fam, wt, N(p, 'size') * (0.72 + R() * 0.28), W * 0.86);
    const rot = (R() * 2 - 1) * N(p, 'tilt') * Math.PI / 180, col = cols[Math.floor(R() * cols.length) % cols.length];
    let sx = 1, sy = 1, a = 1;
    if (st === 'slam') { const k = ease('snap', kt / 0.16); sx = sy = lerp(2.4, 1, k); a = clamp(k * 3); }
    else if (st === 'zoom') { const k = ease('expoOut', kt / 0.3); sx = sy = lerp(0.3, 1, k) * (1 + kt * 0.08); a = clamp(k * 2); }
    else if (st === 'flip') { const k = ease('backOut', kt / 0.28); sy = Math.max(0.001, k); a = clamp(k * 3); }
    else { const k = ease('snap', kt / 0.18); sx = sy = lerp(1.3, 1, k); }
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sx, sy); ctx.globalAlpha *= a; ctx.font = fnt(wt, size, fam);
    if (st === 'alternate' && idx % 2 === 1) {
      const tw = ctx.measureText(w).width; ctx.fillStyle = S(p, 'boxColor') || col;
      ctx.fillRect(-tw / 2 - size * 0.18, -size * 0.62, tw + size * 0.36, size * 1.24); ctx.fillStyle = S(p, 'boxText');
    } else ctx.fillStyle = col;
    ctx.fillText(w, 0, size * 0.03);
    ctx.restore();
  },
};

const wordCycle: ComponentDef = {
  key: 'wordCycle', label: 'Rotating word', category: 'Text', defaultDuration: 4.5,
  description: 'Static prefix with a word that rotates through a list ("Build faster | together | anything"), with slide/drop/flip/blur/typewriter swaps.',
  props: [
    text('prefix', 'Static text', 'Build'), text('words', 'Rotating words (| separated)', 'faster|together|anything'),
    num('interval', 'Seconds per word', 1.1, 0.2, 20, 0.05, G.anim, false), select('swap', 'Swap', 'slide', ['slide', 'drop', 'flip', 'blur', 'typewriter'], G.content),
    font('font', 'Inter'), num('size', 'Size', 120, 8, 600), num('weight', 'Weight', 800, 100, 900, 100),
    color('color', 'Prefix color', '#ffffff'), color('accent', 'Word color', '#4f8cff'), bool('underline', 'Underline', true),
    ...animProps('fade', 'fade', 0.5, 0.4),
  ],
  draw(ctx, p, f) {
    const ws = S(p, 'words').split('|').map((w) => w.trim()).filter(Boolean);
    if (!ws.length) return;
    const iv = N(p, 'interval'), step = Math.floor(f.t / iv), idx = step % ws.length, prev = (idx - 1 + ws.length) % ws.length;
    const k = step === 0 ? 1 : clamp((f.t - step * iv) / 0.42), e = ease('quartOut', k);
    const size = N(p, 'size'), fam = S(p, 'font'), wt = N(p, 'weight'), cx = f.width / 2, cy = f.height / 2;
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy);
    ctx.font = fnt(wt, size, fam); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const pre = S(p, 'prefix'), pw = pre ? ctx.measureText(pre).width + size * 0.28 : 0;
    const wa = ctx.measureText(ws[prev]).width, wb = ctx.measureText(ws[idx]).width;
    const curW = step === 0 ? wb : lerp(wa, wb, ease('easeInOut', k));
    const x0 = cx - (pw + curW) / 2, wx = x0 + pw;
    ctx.fillStyle = S(p, 'color'); if (pre) ctx.fillText(pre, x0, cy);
    const sw = S(p, 'swap'), acc = S(p, 'accent');
    const word = (w: string, dy: number, sy: number, alpha: number, blur: number) => {
      if (alpha <= 0.001) return;
      ctx.save(); ctx.globalAlpha *= alpha; if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(1)}px)`;
      ctx.translate(wx, cy + dy); ctx.scale(1, Math.max(0.001, sy)); ctx.fillStyle = acc; ctx.fillText(w, 0, 0); ctx.restore();
    };
    ctx.save();
    if (sw === 'slide' || sw === 'drop') { ctx.beginPath(); ctx.rect(wx - size * 0.2, cy - size * 0.72, Math.max(wa, wb) + size * 0.6, size * 1.44); ctx.clip(); }
    if (k >= 1) word(ws[idx], 0, 1, 1, 0);
    else if (sw === 'slide') { word(ws[prev], -e * size * 1.1, 1, 1, 0); word(ws[idx], (1 - e) * size * 1.1, 1, 1, 0); }
    else if (sw === 'drop') { word(ws[prev], e * size, 1, 1 - e, 0); word(ws[idx], -(1 - e) * size, 1, e, 0); }
    else if (sw === 'flip') { if (k < 0.5) word(ws[prev], 0, 1 - ease('easeIn', k * 2), 1, 0); else word(ws[idx], 0, ease('backOut', k * 2 - 1), 1, 0); }
    else if (sw === 'blur') { word(ws[prev], 0, 1, 1 - e, e * 24); word(ws[idx], 0, 1, e, (1 - e) * 24); }
    else {
      const t = k < 0.5 ? ws[prev].slice(0, Math.ceil(ws[prev].length * (1 - k * 2))) : ws[idx].slice(0, Math.floor(ws[idx].length * (k * 2 - 1)));
      word(t, 0, 1, 1, 0);
      if (Math.floor(f.t * 6) % 2 === 0) { ctx.fillStyle = acc; ctx.fillRect(wx + ctx.measureText(t).width + 4, cy - size * 0.42, size * 0.06, size * 0.84); }
    }
    ctx.restore();
    if (B(p, 'underline')) { ctx.fillStyle = acc; roundRect(ctx, wx, cy + size * 0.58, curW, Math.max(3, size * 0.06), size * 0.03); ctx.fill(); }
    ctx.restore();
  },
};

const marquee: ComponentDef = {
  key: 'marquee', label: 'Marquee / ticker', category: 'Text', defaultDuration: 6,
  description: 'Looping scrolling text bands (tilted tickers). Bands alternate direction; items alternate filled/outlined.',
  props: [
    text('text', 'Text', 'EDIT WITH CLAUDE ✦ CUTROOM ✦'), num('bands', 'Bands', 2, 1, 8, 1, G.content, false),
    num('speed', 'Speed (px/s)', 240, -4000, 4000, 1), num('angle', 'Angle°', -6, -90, 90, 0.5, G.layout),
    font('font', 'Archivo Black'), num('size', 'Size', 120, 8, 600), num('weight', 'Weight', 800, 100, 900, 100), color('color', 'Text color', '#ffffff'),
    color('bandColor', 'Band color (blank = none)', '#4f8cff'), color('bandColor2', 'Alt band color (blank = none)', '#111318'),
    bool('outline', 'Alternate outline', true), num('gap', 'Band gap', 24, 0, 1000, 1, G.layout), num('yOffset', 'Vertical offset', 0, -3000, 3000, 1, G.layout),
    ...animProps('fade', 'fade', 0.4, 0.4),
  ],
  draw(ctx, p, f) {
    const W = f.width, H = f.height, size = N(p, 'size'), n = Math.max(1, N(p, 'bands')), bandH = size * 1.45, gap = N(p, 'gap');
    const D = Math.hypot(W, H), item = S(p, 'text').trim() + '   ';
    ctx.save(); applyEnvelope(ctx, p, f, W / 2, H / 2);
    ctx.translate(W / 2, H / 2 + N(p, 'yOffset')); ctx.rotate(N(p, 'angle') * Math.PI / 180);
    ctx.font = fnt(N(p, 'weight'), size, S(p, 'font')); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const iw = Math.max(10, ctx.measureText(item).width), total = n * bandH + (n - 1) * gap;
    for (let b = 0; b < n; b++) {
      const y = -total / 2 + b * (bandH + gap) + bandH / 2, bc = b % 2 ? S(p, 'bandColor2') : S(p, 'bandColor');
      if (bc) { ctx.fillStyle = bc; ctx.fillRect(-D, y - bandH / 2, D * 2, bandH); }
      const shift = f.t * N(p, 'speed') * (b % 2 ? -1 : 1) + b * iw * 0.37;
      const n0 = Math.floor((-D - shift) / iw);
      for (let i = n0, x = n0 * iw + shift; x < D; i++, x += iw) {
        if (B(p, 'outline') && i % 2 !== 0) { ctx.strokeStyle = S(p, 'color'); ctx.lineWidth = Math.max(1.5, size * 0.025); ctx.strokeText(item, x, y); }
        else { ctx.fillStyle = S(p, 'color'); ctx.fillText(item, x, y); }
      }
    }
    ctx.restore();
  },
};

const highlighter: ComponentDef = {
  key: 'highlighter', label: 'Highlighted text', category: 'Text', defaultDuration: 4,
  description: 'Text with an animated mark on one word (or all): marker swipe, scribbled underline, hand-drawn circle, strike-through or box.',
  props: [
    text('text', 'Text', 'The fastest way to edit video', G.content, true), num('word', 'Mark word # (0-based, -1 = all)', 3, -1, 500, 1, G.content, false),
    select('mark', 'Mark', 'marker', ['marker', 'underline', 'circle', 'strike', 'box'], G.content),
    font('font', 'Inter'), num('size', 'Size', 100, 4, 600), num('weight', 'Weight', 800, 100, 900, 100), color('color', 'Text color', '#ffffff'),
    color('markColor', 'Mark color', '#ffd43b'), color('markText', 'Text on marker', '#111111'), num('thickness', 'Mark thickness', 1, 0.2, 5, 0.05),
    num('maxWidth', 'Max width', 1500, 0, 8000, 10, G.layout), num('markDelay', 'Mark after', 0.7, 0, 30, 0.05, G.anim, false), num('markDur', 'Mark duration', 0.5, 0.05, 10, 0.05, G.anim, false),
    ...animProps('wordsUp', 'fade', 0.6, 0.4),
  ],
  draw(ctx, p, f) {
    const s: TextStyle = { ...styleOf(p), align: 'center', lineHeight: 1.2 };
    const L = layoutText(ctx, S(p, 'text'), s), cx = f.width / 2, cy = f.height / 2, size = s.size;
    const wi = N(p, 'word'), chosen = L.words.filter((w) => wi < 0 || w.index === wi);
    const boxes: { x0: number; x1: number; y: number }[] = [];
    for (const w of chosen) {
      const y = cy + L.lines[w.line].y, b = boxes.find((q) => q.y === y);
      if (b) { b.x0 = Math.min(b.x0, cx + w.x); b.x1 = Math.max(b.x1, cx + w.x + w.w); } else boxes.push({ x0: cx + w.x, x1: cx + w.x + w.w, y });
    }
    const k = win(f.t, N(p, 'markDelay'), N(p, 'markDur'), 'easeInOut'), mark = S(p, 'mark'), { kout } = envelope(p, f);
    const R = rng(f.seed), lw = size * 0.07 * N(p, 'thickness');
    ctx.save(); ctx.globalAlpha *= 1 - kout; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (mark === 'marker' && k > 0) {
      ctx.fillStyle = S(p, 'markColor');
      boxes.forEach((b, i) => {
        const kk = clamp(k * boxes.length - i), pad = size * 0.14, w = (b.x1 - b.x0 + pad * 2) * ease('easeOut', kk);
        ctx.beginPath(); ctx.moveTo(b.x0 - pad, b.y - size * 0.44); ctx.lineTo(b.x0 - pad + w, b.y - size * 0.48);
        ctx.lineTo(b.x0 - pad + w - size * 0.04, b.y + size * 0.46); ctx.lineTo(b.x0 - pad, b.y + size * 0.5); ctx.closePath(); ctx.fill();
      });
    }
    ctx.restore();
    const swapped = mark === 'marker' && k > 0.45;
    const dec = wi >= 0 && swapped ? { highlight: { index: wi, color: S(p, 'markText') } } : {};
    drawText(ctx, L, wi < 0 && swapped ? { ...s, color: S(p, 'markText') } : s, cx, cy, animOf(p), f, dec);
    if (mark === 'marker' || k <= 0) return;
    ctx.save(); ctx.globalAlpha *= 1 - kout; ctx.strokeStyle = S(p, 'markColor'); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ph = R() * TAU;
    boxes.forEach((b, i) => {
      const kk = clamp(k * boxes.length - i), w = b.x1 - b.x0, pts: [number, number][] = [];
      if (mark === 'underline') for (let j = 0; j <= 30; j++) { const u = j / 30; pts.push([b.x0 - size * 0.05 + u * (w + size * 0.1), b.y + size * 0.58 + Math.sin(u * TAU * 2.5 + ph) * size * 0.05]); }
      else if (mark === 'strike') pts.push([b.x0 - size * 0.08, b.y + size * 0.06], [b.x1 + size * 0.08, b.y - size * 0.04]);
      else if (mark === 'circle') {
        const rx = w / 2 + size * 0.4, ry = size * 0.78, mx = (b.x0 + b.x1) / 2;
        for (let j = 0; j <= 60; j++) { const a = -2.2 + (j / 60) * TAU * 1.1, r = 1 + 0.05 * Math.sin(a * 3 + ph) + j / 60 * 0.06; pts.push([mx + Math.cos(a) * rx * r, b.y + Math.sin(a) * ry * r]); }
      } else {
        const pad = size * 0.2, x0 = b.x0 - pad, x1 = b.x1 + pad, y0 = b.y - size * 0.62, y1 = b.y + size * 0.62;
        pts.push([x0, y0], [x1, y0 - size * 0.02], [x1 + size * 0.02, y1], [x0, y1 + size * 0.02], [x0 - size * 0.02, y0 - size * 0.05]);
      }
      strokePartial(ctx, pts, kk);
    });
    ctx.restore();
  },
};

const quote: ComponentDef = {
  key: 'quote', label: 'Quote', category: 'Text', defaultDuration: 6,
  description: 'Pull quote: oversized quote mark, quote text revealed word by word, attribution fades in after.',
  props: [
    text('text', 'Quote', 'Cutroom turned a week of editing into one prompt.', G.content, true), text('author', 'Author', 'Ada Lovelace'), text('role', 'Role', 'Founder, Analytical Engines'),
    font('font', 'Fraunces'), num('size', 'Size', 78, 6, 400), num('weight', 'Weight', 400, 100, 900, 100), bool('italic', 'Italic', true),
    color('color', 'Text color', '#ffffff'), color('accent', 'Accent', '#ffd43b'), color('subColor', 'Attribution color', 'rgba(255,255,255,0.65)'),
    num('maxWidth', 'Max width', 1400, 0, 8000, 10, G.layout), ...animProps('wordsUp', 'fade', 0.5, 0.4),
  ],
  draw(ctx, p, f) {
    const s: TextStyle = { ...styleOf(p), align: 'center', lineHeight: 1.25 }, size = s.size, cx = f.width / 2;
    const L = layoutText(ctx, S(p, 'text'), s), a = animOf(p), { kout } = envelope(p, f);
    const markH = size * 1.5, attrH = S(p, 'author') ? size * 1.6 : 0, total = markH + L.height + attrH;
    const top = f.height / 2 - total / 2;
    const km = win(f.t, 0, 0.6, 'backOut');
    ctx.save(); ctx.globalAlpha *= (1 - kout) * clamp(km * 2); ctx.translate(cx, top + markH * 0.55); ctx.scale(km, km);
    ctx.font = fnt(900, size * 3.4, 'Fraunces'); ctx.fillStyle = S(p, 'accent'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('“', 0, size * 0.9); ctx.restore();
    drawText(ctx, L, s, cx, top + markH + L.height / 2, a, f);
    if (S(p, 'author')) {
      const at = a.inDur + L.words.length * a.stagger, k = win(f.t, at, 0.5, 'easeOut'), y = top + markH + L.height + size * 0.95;
      ctx.save(); ctx.globalAlpha *= k * (1 - kout); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = S(p, 'accent'); ctx.fillRect(cx - size * 0.5 * k, y - size * 0.5, size * k, Math.max(2, size * 0.04));
      ctx.font = fnt(700, size * 0.42, 'Inter'); ctx.fillStyle = S(p, 'color'); ctx.fillText(S(p, 'author'), cx, y + (1 - k) * 14);
      if (S(p, 'role')) { ctx.font = fnt(400, size * 0.34, 'Inter'); ctx.fillStyle = S(p, 'subColor'); ctx.fillText(S(p, 'role'), cx, y + size * 0.5 + (1 - k) * 14); }
      ctx.restore();
    }
  },
};

const blockReveal: ComponentDef = {
  key: 'blockReveal', label: 'Block reveal', category: 'Text', defaultDuration: 4,
  description: 'Solid color bars wipe across each line, then pull away to reveal the text (classic motion-design reveal), and wipe it out at the end.',
  props: [
    text('text', 'Lines', 'Make it\nunmistakable.', G.content, true), font('font', 'Syne'), num('size', 'Size', 130, 6, 600), num('weight', 'Weight', 800, 100, 900, 100),
    bool('uppercase', 'Uppercase', false), color('color', 'Text color', '#ffffff'), color('barColor', 'Bar color', '#4f8cff'), color('barColor2', 'Lead bar (blank = none)', '#ffffff'),
    select('direction', 'Direction', 'right', ['right', 'left', 'up', 'down'], G.content), select('align', 'Align', 'left', ['left', 'center', 'right'], G.layout),
    num('revealDur', 'Reveal duration', 0.9, 0.1, 10, 0.05, G.anim, false), num('lineStagger', 'Line stagger', 0.15, 0, 5, 0.01, G.anim, false), bool('outro', 'Wipe out at end', true),
  ],
  draw(ctx, p, f) {
    const ls = lines(p, 'text').map((l) => (B(p, 'uppercase') ? l.toUpperCase() : l));
    if (!ls.length) return;
    const size = N(p, 'size'), lh = size * 1.18, rd = N(p, 'revealDur'), stg = N(p, 'lineStagger'), dir = S(p, 'direction'), al = S(p, 'align');
    ctx.font = fnt(N(p, 'weight'), size, S(p, 'font')); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const ws = ls.map((l) => ctx.measureText(l).width), maxW = Math.max(...ws), x0 = f.width / 2 - maxW / 2, y0 = f.height / 2 - (ls.length * lh) / 2;
    const bar = (bx: number, by: number, bw: number, bh: number, c: number, u: number, col: string) => {
      if (c <= u || !col) return;
      ctx.fillStyle = col;
      if (dir === 'right') ctx.fillRect(bx + bw * u, by, bw * (c - u), bh);
      else if (dir === 'left') ctx.fillRect(bx + bw * (1 - c), by, bw * (c - u), bh);
      else if (dir === 'down') ctx.fillRect(bx, by + bh * u, bw, bh * (c - u));
      else ctx.fillRect(bx, by + bh * (1 - c), bw, bh * (c - u));
    };
    const phase = (q: number) => ({ c: ease('quartOut', clamp(q / 0.5)), u: ease('easeInOut', clamp((q - 0.5) / 0.5)) });
    ls.forEach((l, i) => {
      const w = ws[i], x = al === 'left' ? x0 : al === 'right' ? x0 + maxW - w : f.width / 2 - w / 2, y = y0 + i * lh;
      const bx = x - size * 0.1, by = y + lh * 0.06, bw = w + size * 0.2, bh = lh * 0.88;
      const qi = (f.t - i * stg) / rd, qo = B(p, 'outro') ? (f.t - (f.duration - rd - (ls.length - 1) * stg) - i * stg) / rd : -1;
      const visible = qi >= 0.5 && qo < 0.5;
      if (visible) { ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip(); ctx.fillStyle = S(p, 'color'); ctx.fillText(l, x, y + lh / 2); ctx.restore(); }
      for (const [q, col] of [[qi + 0.1, S(p, 'barColor2')], [qi, S(p, 'barColor')]] as [number, string][]) if (q > 0 && q < 1) { const { c, u } = phase(q); bar(bx, by, bw, bh, c, u, col); }
      if (qo > 0) for (const [q, col] of [[qo + 0.1, S(p, 'barColor2')], [qo, S(p, 'barColor')]] as [number, string][]) if (q > 0 && q < 1) { const { c, u } = phase(q); bar(bx, by, bw, bh, c, u, col); }
    });
  },
};

const FLAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const splitFlap: ComponentDef = {
  key: 'splitFlap', label: 'Split-flap board', category: 'Text', defaultDuration: 4,
  description: 'Airport split-flap display: every tile flips through random characters before settling on the text.',
  props: [
    text('text', 'Text (lines)', 'NOW BOARDING\nCUTROOM 2.0', G.content, true), num('tile', 'Tile height', 100, 10, 400, 1, G.layout),
    font('font', 'JetBrains Mono'), color('tileColor', 'Tile color', '#1b1d22'), color('color', 'Character color', '#f5f5f0'), color('accent', 'Accent line (blank = none)', '#ffd43b'),
    num('flipRate', 'Flips per second', 16, 1, 60, 1, G.anim, false), num('settle', 'Settle time', 1.4, 0, 20, 0.05, G.anim, false), num('stagger', 'Per-tile stagger', 0.035, 0, 1, 0.005, G.anim, false),
    ...animProps('fade', 'fade', 0.3, 0.4),
  ],
  draw(ctx, p, f) {
    const rows = S(p, 'text').toUpperCase().split('\n'), cols = Math.max(1, ...rows.map((r) => r.length));
    const th = N(p, 'tile'), tw = th * 0.7, gap = th * 0.08, rate = N(p, 'flipRate');
    const W = cols * (tw + gap) - gap, H = rows.length * (th + gap) - gap, x0 = (f.width - W) / 2, y0 = (f.height - H) / 2;
    const charAt = (idx: number, s: number) => FLAP[hash(`${f.seed}:${idx}:${s}`) % FLAP.length];
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = fnt(700, th * 0.68, S(p, 'font'));
    const tile = S(p, 'tileColor'), fg = S(p, 'color');
    rows.forEach((row, r) => {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c, target = row[c] ?? ' ', x = x0 + c * (tw + gap), y = y0 + r * (th + gap), mid = y + th / 2;
        const settleStep = Math.floor((0.15 + idx * N(p, 'stagger') + (hash(`${f.seed}s${idx}`) % 1000) / 1000 * N(p, 'settle')) * rate);
        const step = Math.floor(f.t * rate), ph = frac(f.t * rate), done = step > settleStep || (step === settleStep && ph >= 0.999);
        const cur = step >= settleStep ? target : charAt(idx, step), prv = step - 1 >= settleStep ? target : charAt(idx, step - 1);
        const half = (ch: string, top: boolean, sy: number, shade: number) => {
          ctx.save(); ctx.beginPath(); ctx.rect(x, top ? y : mid, tw, th / 2); ctx.clip();
          ctx.translate(0, mid); ctx.scale(1, Math.max(0.001, sy)); ctx.translate(0, -mid);
          ctx.fillStyle = mixColor(tile, '#000000', shade); roundRect(ctx, x, y, tw, th, th * 0.09); ctx.fill();
          ctx.fillStyle = fg; ctx.fillText(ch, x + tw / 2, mid + th * 0.03); ctx.restore();
        };
        if (done) { half(target, true, 1, 0); half(target, false, 1, 0.12); }
        else {
          half(cur, true, 1, 0); half(prv, false, 1, 0.12);
          if (ph < 0.5) half(prv, true, 1 - ph * 2, ph * 0.6); else half(cur, false, ph * 2 - 1, 0.4 - ph * 0.28);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, mid - 1, tw, 2);
      }
    });
    if (S(p, 'accent')) { ctx.fillStyle = S(p, 'accent'); ctx.fillRect(x0, y0 + H + th * 0.25, W * win(f.t, 0.2, 1, 'expoOut'), Math.max(3, th * 0.05)); }
    ctx.restore();
  },
};

const countdown: ComponentDef = {
  key: 'countdown', label: 'Countdown', category: 'Text', defaultDuration: 4,
  description: '3-2-1 countdown (one number per interval) with a ring sweep, flip or slam, and an optional final word.',
  props: [
    num('from', 'Count from', 3, 1, 99, 1, G.content, false), num('interval', 'Seconds per number', 1, 0.1, 10, 0.05, G.anim, false), text('end', 'Final text (blank = none)', 'GO'),
    select('style', 'Style', 'ring', ['ring', 'flip', 'slam'], G.content), font('font', 'Unbounded'), num('size', 'Size', 300, 8, 1000), num('weight', 'Weight', 800, 100, 900, 100),
    color('color', 'Number color', '#ffffff'), color('accent', 'Accent', '#4f8cff'), color('trackColor', 'Ring track', 'rgba(255,255,255,0.14)'),
  ],
  draw(ctx, p, f) {
    const from = N(p, 'from'), iv = N(p, 'interval'), end = S(p, 'end'), n = from + (end ? 1 : 0);
    const idx = Math.min(n - 1, Math.floor(f.t / iv)), kt = f.t - idx * iv, label = idx < from ? String(from - idx) : end;
    const size = N(p, 'size'), cx = f.width / 2, cy = f.height / 2, st = S(p, 'style'), fam = S(p, 'font');
    ctx.save(); ctx.globalAlpha *= 1 - win(f.t, f.duration - 0.25, 0.25, 'easeIn');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = fitSize(ctx, label, fam, N(p, 'weight'), size, f.width * 0.8);
    if (st === 'ring' && idx < from) {
      const r = size * 0.78, lw = size * 0.055;
      ctx.lineWidth = lw; ctx.strokeStyle = S(p, 'trackColor'); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = S(p, 'accent'); ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - clamp(kt / iv))); ctx.stroke();
    }
    let sx = 1, sy = 1, a = 1;
    if (st === 'slam') {
      const k = ease('snap', kt / 0.2); sx = sy = lerp(3, 1, k); a = clamp(k * 3);
      const kr = clamp((kt - 0.12) / 0.6);
      if (kr > 0 && kr < 1) { ctx.save(); ctx.globalAlpha *= 1 - kr; ctx.strokeStyle = S(p, 'accent'); ctx.lineWidth = size * 0.04 * (1 - kr); ctx.beginPath(); ctx.arc(cx, cy, size * (0.5 + kr * 1.2), 0, TAU); ctx.stroke(); ctx.restore(); }
    } else if (st === 'flip') { sy = Math.max(0.001, ease('backOut', kt / 0.35)); }
    else { const k = ease('backOut', kt / 0.3); sx = sy = lerp(0.5, 1, k); a = clamp(k * 2); }
    ctx.translate(cx, cy); ctx.scale(sx, sy); ctx.globalAlpha *= a;
    ctx.font = fnt(N(p, 'weight'), idx < from ? fs : fs * 0.8, fam); ctx.fillStyle = idx < from ? S(p, 'color') : S(p, 'accent');
    ctx.fillText(label, 0, fs * 0.04);
    ctx.restore();
  },
};

// ================================================================ Social / UI
const CHAT: Record<string, { me: [string, string]; them: [string, string] }> = {
  imessage: { me: ['#0a84ff', '#ffffff'], them: ['#e9e9eb', '#111111'] },
  dark: { me: ['#3b82f6', '#ffffff'], them: ['#2a2d35', '#f2f2f2'] },
  claude: { me: ['#d97757', '#ffffff'], them: ['#f0eee6', '#1f1e1d'] },
};
const chatBubbles: ComponentDef = {
  key: 'chatBubbles', label: 'Chat bubbles', category: 'Social', defaultDuration: 6,
  description: 'Chat conversation: "me: …" / "them: …" lines appear one by one (typing dots before "them" messages), bubbles pop in and the thread scrolls.',
  props: [
    text('messages', 'Messages (me: / them: per line)', 'them: can you cut a launch video?\nme: on it — watch the timeline\nthem: wait, it is editing live??\nme: and every clip stays editable', G.content, true),
    select('theme', 'Theme', 'imessage', Object.keys(CHAT)), num('interval', 'Seconds between messages', 1.1, 0.1, 20, 0.05, G.anim, false),
    num('typing', 'Typing dots duration', 0.7, 0, 10, 0.05, G.anim, false), font(), num('size', 'Text size', 42, 6, 200),
    num('width', 'Column width', 1100, 100, 4000, 10, G.layout), num('maxBubble', 'Max bubble width (fraction)', 0.72, 0.2, 1, 0.01, G.layout),
  ],
  draw(ctx, p, f) {
    const th = CHAT[S(p, 'theme')] || CHAT.imessage, size = N(p, 'size'), colW = N(p, 'width'), cx = f.width / 2, cy = f.height / 2;
    const padX = size * 0.62, padY = size * 0.4, gap = size * 0.32, maxW = colW * N(p, 'maxBubble') - padX * 2;
    let clock = 0.3;
    const items: { me: boolean; txt: string | null; at: number; end: number }[] = [];
    for (const l of lines(p, 'messages')) {
      const me = /^me\s*:/i.test(l), txt = l.replace(/^(me|them)\s*:\s*/i, '');
      if (!me && N(p, 'typing') > 0) { items.push({ me, txt: null, at: clock, end: clock + N(p, 'typing') }); clock += N(p, 'typing'); }
      items.push({ me, txt, at: clock, end: Infinity }); clock += N(p, 'interval');
    }
    const vis = items.filter((it) => f.t >= it.at && f.t < it.end).map((it) => {
      const s: TextStyle = { ...styleOf(p), size, weight: 500, align: 'left', maxWidth: maxW, lineHeight: 1.25, color: (it.me ? th.me : th.them)[1] };
      const L = it.txt === null ? null : layoutText(ctx, it.txt, s);
      const w = L ? L.width + padX * 2 : size * 2.6, h = L ? L.height + padY * 2 : size * 1.6;
      return { ...it, s, L, w, h, k: ease('backOut', (f.t - it.at) / 0.35) };
    });
    const total = vis.reduce((a, v) => a + (v.h + gap) * clamp(v.k), 0) - gap;
    let y = cy + Math.min(total, f.height * 0.82) / 2;
    ctx.save(); ctx.globalAlpha *= 1 - win(f.t, f.duration - 0.35, 0.35, 'easeIn');
    for (let i = vis.length - 1; i >= 0; i--) {
      const v = vis[i], [bg] = v.me ? th.me : th.them, x = v.me ? cx + colW / 2 - v.w : cx - colW / 2, top = y - v.h;
      if (top + v.h < -50) break;
      ctx.save(); ctx.globalAlpha *= clamp(v.k * 2);
      const ox = v.me ? x + v.w : x, oy = y; ctx.translate(ox, oy); ctx.scale(lerp(0.5, 1, v.k), lerp(0.5, 1, v.k)); ctx.translate(-ox, -oy);
      ctx.fillStyle = bg; roundRect(ctx, x, top, v.w, v.h, Math.min(size * 0.9, v.h / 2)); ctx.fill();
      if (v.L) drawText(ctx, v.L, v.s, x + padX, top + v.h / 2, { animIn: 'none', animOut: 'none', inDur: 0, outDur: 0, stagger: 0 }, f);
      else for (let d = 0; d < 3; d++) { const b = Math.sin(f.t * 9 - d * 0.9); ctx.fillStyle = withAlpha(th.them[1], 0.35 + 0.35 * Math.max(0, b)); ctx.beginPath(); ctx.arc(x + size * (0.75 + d * 0.55), top + v.h / 2 - Math.max(0, b) * size * 0.12, size * 0.16, 0, TAU); ctx.fill(); }
      ctx.restore();
      y -= (v.h + gap) * clamp(v.k);
    }
    ctx.restore();
  },
};

const notificationToast: ComponentDef = {
  key: 'notificationToast', label: 'Notification', category: 'Social', defaultDuration: 3.5,
  description: 'OS-style notification card that springs in from the top with app icon, app name, title and body, then slides away.',
  props: [
    text('app', 'App name', 'Cutroom'), text('title', 'Title', 'Export finished'), text('body', 'Body', 'launch-teaser.mp4 · 1080p · 42s'), text('icon', 'Icon letter', 'C'),
    color('iconColor', 'Icon color', '#4f8cff'), select('theme', 'Theme', 'glass', ['glass', 'light', 'dark']), select('position', 'Position', 'top', ['top', 'center', 'bottom'], G.layout),
    num('width', 'Width', 900, 100, 4000, 10, G.layout), num('margin', 'Edge margin', 70, 0, 2000, 1, G.layout), num('size', 'Text size', 34, 6, 200), font(), text('time', 'Time label', 'now'),
    num('inDur', 'In duration', 0.7, 0, 10, 0.05, G.anim, false), num('outDur', 'Out duration', 0.4, 0, 10, 0.05, G.anim, false),
  ],
  draw(ctx, p, f) {
    const size = N(p, 'size'), w = N(p, 'width'), h = size * 3.7, x = (f.width - w) / 2, pos = S(p, 'position');
    const ty = pos === 'top' ? N(p, 'margin') : pos === 'bottom' ? f.height - N(p, 'margin') - h : (f.height - h) / 2;
    const kin = ease('spring', f.t / Math.max(0.01, N(p, 'inDur'))), kout = ease('easeIn', win(f.t, f.duration - N(p, 'outDur'), N(p, 'outDur'), 'linear'));
    const from = pos === 'bottom' ? f.height + 20 : -h - 40, y = lerp(from, ty, kin) + (from - ty) * kout * 0.6;
    const th = S(p, 'theme'), bg = th === 'light' ? 'rgba(246,246,248,0.97)' : th === 'dark' ? '#1c1c1f' : 'rgba(38,40,48,0.78)', fg = th === 'light' ? '#111111' : '#f5f5f7';
    ctx.save(); ctx.globalAlpha *= clamp(f.t / 0.15) * (1 - kout);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    ctx.fillStyle = bg; roundRect(ctx, x, y, w, h, size * 0.85); ctx.fill(); ctx.shadowColor = 'transparent';
    if (th === 'glass') { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; roundRect(ctx, x, y, w, h, size * 0.85); ctx.stroke(); }
    const pad = size * 0.65, ic = size * 1.9, iy = y + (h - ic) / 2;
    ctx.fillStyle = S(p, 'iconColor'); roundRect(ctx, x + pad, iy, ic, ic, ic * 0.24); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = fnt(800, ic * 0.55, S(p, 'font')); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(S(p, 'icon').slice(0, 2), x + pad + ic / 2, iy + ic / 2 + 2);
    const tx = x + pad * 1.6 + ic; ctx.textAlign = 'left';
    ctx.font = fnt(600, size * 0.7, S(p, 'font')); ctx.fillStyle = withAlpha(fg, 0.55); ctx.fillText(S(p, 'app').toUpperCase(), tx, y + h * 0.26);
    ctx.textAlign = 'right'; ctx.fillText(S(p, 'time'), x + w - pad, y + h * 0.26); ctx.textAlign = 'left';
    ctx.font = fnt(700, size, S(p, 'font')); ctx.fillStyle = fg; ctx.fillText(S(p, 'title'), tx, y + h * 0.52);
    ctx.font = fnt(400, size * 0.9, S(p, 'font')); ctx.fillStyle = withAlpha(fg, 0.75); ctx.fillText(S(p, 'body'), tx, y + h * 0.76);
    ctx.restore();
  },
};

const phoneFrame: ComponentDef = {
  key: 'phoneFrame', label: 'Phone frame', category: 'Screen', defaultDuration: 6,
  description: 'Phone mockup with dynamic island, side buttons and status bar. The screen is transparent: put it on a track ABOVE a portrait recording/image (scale that to the screen).',
  props: [
    num('width', 'Width', 500, 50, 4000, 1, G.layout), num('height', 'Height', 1030, 50, 8000, 1, G.layout), num('bezel', 'Bezel', 18, 0, 200, 1, G.layout), num('radius', 'Corner radius', 74, 0, 400, 1, G.layout),
    color('frameColor', 'Frame color', '#1a1a1d'), color('edgeColor', 'Edge highlight', '#4a4b52'), bool('island', 'Dynamic island', true),
    color('screenFill', 'Screen fill (blank = transparent)', ''), bool('statusBar', 'Status bar', true), text('time', 'Clock', '9:41'), color('statusColor', 'Status color', '#ffffff'),
    color('maskColor', 'Outside color (blank = none)', ''), ...animProps('rise', 'fade', 0.7, 0.4),
  ],
  draw(ctx, p, f) {
    const w = N(p, 'width'), h = N(p, 'height'), bz = N(p, 'bezel'), R = N(p, 'radius'), x = (f.width - w) / 2, y = (f.height - h) / 2;
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    if (S(p, 'maskColor')) { ctx.fillStyle = S(p, 'maskColor'); ctx.beginPath(); ctx.rect(0, 0, f.width, f.height); rr(ctx, x, y, w, h, R); ctx.fill('evenodd'); }
    if (S(p, 'screenFill')) { ctx.fillStyle = S(p, 'screenFill'); roundRect(ctx, x + bz, y + bz, w - bz * 2, h - bz * 2, R - bz); ctx.fill(); }
    ctx.fillStyle = S(p, 'edgeColor');
    [[0.2, 0.06], [0.29, 0.09], [0.4, 0.09]].forEach(([at, len]) => { roundRect(ctx, x - 5, y + h * at, 8, h * len, 3); ctx.fill(); });
    roundRect(ctx, x + w - 3, y + h * 0.27, 8, h * 0.13, 3); ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
    ctx.fillStyle = S(p, 'frameColor'); ctx.beginPath(); rr(ctx, x, y, w, h, R); rr(ctx, x + bz, y + bz, w - bz * 2, h - bz * 2, R - bz); ctx.fill('evenodd');
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = S(p, 'edgeColor'); ctx.lineWidth = 3; roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, R); ctx.stroke();
    if (B(p, 'island')) { ctx.fillStyle = '#000'; roundRect(ctx, x + w / 2 - w * 0.15, y + bz + h * 0.014, w * 0.3, h * 0.034, h * 0.017); ctx.fill(); }
    if (B(p, 'statusBar')) {
      const sy = y + bz + h * 0.031, sc = S(p, 'statusColor'), fs = w * 0.036;
      ctx.fillStyle = sc; ctx.font = fnt(600, fs, 'Inter'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(S(p, 'time'), x + w * 0.2, sy);
      const bx = x + w * 0.8; ctx.strokeStyle = sc; ctx.lineWidth = 1.5; roundRect(ctx, bx, sy - fs * 0.35, fs * 1.4, fs * 0.7, fs * 0.15); ctx.stroke();
      roundRect(ctx, bx + 2, sy - fs * 0.35 + 2, fs * 1.4 * 0.75 - 2, fs * 0.7 - 4, fs * 0.1); ctx.fill();
      for (let i = 0; i < 4; i++) ctx.fillRect(x + w * 0.66 + i * fs * 0.3, sy + fs * 0.3 - fs * 0.18 * (i + 1), fs * 0.2, fs * 0.18 * (i + 1));
    }
    ctx.restore();
  },
};

const socialPost: ComponentDef = {
  key: 'socialPost', label: 'Social post', category: 'Social', defaultDuration: 5,
  description: 'Post card (avatar, name, handle, verified badge, text) with reply/repost/like counters that tick up and a like that pops.',
  props: [
    text('name', 'Name', 'Ada Lovelace'), text('handle', 'Handle', '@ada'), text('text', 'Text', 'Just made our launch video by asking Claude. Every cut landed live on the timeline — and I can still edit all of it.', G.content, true),
    color('avatarColor', 'Avatar color', '#a56eff'), num('likes', 'Likes', 12400, 0, 1e9, 1, G.content), num('reposts', 'Reposts', 1830, 0, 1e9, 1, G.content), num('replies', 'Replies', 342, 0, 1e9, 1, G.content),
    select('theme', 'Theme', 'dark', ['dark', 'light', 'dim']), bool('verified', 'Verified', true), font(), num('size', 'Text size', 40, 6, 200),
    num('width', 'Card width', 1100, 100, 4000, 10, G.layout), num('likeAt', 'Like at (s)', 1.6, 0, 60, 0.05, G.anim, false), ...animProps('rise', 'fade', 0.6, 0.4),
  ],
  draw(ctx, p, f) {
    const th = S(p, 'theme'), bg = th === 'light' ? '#ffffff' : th === 'dim' ? '#15202b' : '#16181c', fg = th === 'light' ? '#0f1419' : '#e7e9ea', sub = th === 'light' ? '#536471' : '#8b98a5';
    const size = N(p, 'size'), w = N(p, 'width'), pad = size * 0.9, av = size * 1.15;
    const s: TextStyle = { ...styleOf(p), size, weight: 400, color: fg, align: 'left', maxWidth: w - pad * 2, lineHeight: 1.35 };
    const L = layoutText(ctx, S(p, 'text'), s), h = pad + av * 2 + size * 0.5 + L.height + size * 2.6, x = (f.width - w) / 2, y = (f.height - h) / 2;
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18; ctx.fillStyle = bg; roundRect(ctx, x, y, w, h, size * 0.6); ctx.fill(); ctx.shadowColor = 'transparent';
    if (th !== 'light') { ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; roundRect(ctx, x, y, w, h, size * 0.6); ctx.stroke(); }
    const ax = x + pad + av, ay = y + pad + av;
    ctx.fillStyle = S(p, 'avatarColor'); ctx.beginPath(); ctx.arc(ax, ay, av, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = fnt(700, av, S(p, 'font')); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(S(p, 'name').slice(0, 1).toUpperCase(), ax, ay + 2);
    ctx.textAlign = 'left'; ctx.font = fnt(700, size, S(p, 'font')); ctx.fillStyle = fg;
    const nx = ax + av + size * 0.5; ctx.fillText(S(p, 'name'), nx, ay - size * 0.45);
    const nw = ctx.measureText(S(p, 'name')).width;
    if (B(p, 'verified')) checkMark(ctx, nx + nw + size * 0.55, ay - size * 0.45, size * 0.4, 1, '#1d9bf0');
    ctx.font = fnt(400, size * 0.9, S(p, 'font')); ctx.fillStyle = sub; ctx.fillText(S(p, 'handle'), nx, ay + size * 0.55);
    const ty = ay + av + size * 0.5 + L.height / 2;
    drawText(ctx, L, s, x + pad, ty, { animIn: 'none', animOut: 'none', inDur: 0, outDur: 0, stagger: 0 }, f);
    const ry = ty + L.height / 2 + size * 1.3, kc = ease('expoOut', win(f.t, 0.4, 1.8, 'linear')), la = N(p, 'likeAt'), liked = f.t >= la, kp = ease('backOut', win(f.t, la, 0.35, 'linear'));
    const cols = [x + pad, x + pad + (w - pad * 2) * 0.33, x + pad + (w - pad * 2) * 0.66], ic = size * 0.55;
    ctx.lineWidth = Math.max(2, size * 0.07); ctx.strokeStyle = sub; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    roundRect(ctx, cols[0], ry - ic * 0.7, ic * 1.6, ic * 1.3, ic * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cols[1], ry + ic * 0.2); ctx.lineTo(cols[1], ry - ic * 0.4); ctx.lineTo(cols[1] + ic * 1.3, ry - ic * 0.4); ctx.moveTo(cols[1] + ic * 1.6, ry - ic * 0.2); ctx.lineTo(cols[1] + ic * 1.6, ry + ic * 0.4); ctx.lineTo(cols[1] + ic * 0.3, ry + ic * 0.4); ctx.stroke();
    ctx.save(); ctx.translate(cols[2] + ic * 0.8, ry); const hs = liked ? lerp(0.4, 1, kp) * (1 + 0.25 * Math.sin(clamp((f.t - la) / 0.35) * Math.PI)) : 1; ctx.scale(hs, hs);
    heart(ctx, 0, 0, ic * 1.1); if (liked) { ctx.fillStyle = '#f91880'; ctx.fill(); } else ctx.stroke(); ctx.restore();
    if (liked && kp < 1) { ctx.save(); ctx.globalAlpha *= 1 - kp; ctx.strokeStyle = '#f91880'; ctx.beginPath(); ctx.arc(cols[2] + ic * 0.8, ry, ic * (1 + kp * 1.4), 0, TAU); ctx.stroke(); ctx.restore(); }
    ctx.font = fnt(500, size * 0.8, S(p, 'font')); ctx.textBaseline = 'middle';
    [[N(p, 'replies'), sub], [N(p, 'reposts'), sub], [N(p, 'likes') + (liked ? 1 : 0), liked ? '#f91880' : sub]].forEach(([v, c], i) => {
      ctx.fillStyle = c as string; ctx.fillText(compact(lerp((v as number) * 0.6, v as number, kc)), cols[i] + ic * 2.4, ry);
    });
    ctx.restore();
  },
};

const searchBar: ComponentDef = {
  key: 'searchBar', label: 'Search bar', category: 'Screen', defaultDuration: 5,
  description: 'Search box that types a query with a caret, then drops down suggestions (first one highlighted).',
  props: [
    text('query', 'Query', 'how to edit video with ai'), text('suggestions', 'Suggestions (one per line)', 'how to edit video with ai — Cutroom\nhow to edit video with claude\nhow to edit video fast', G.content, true),
    text('placeholder', 'Placeholder', 'Search'), select('theme', 'Theme', 'dark', ['dark', 'light']), num('width', 'Width', 1150, 100, 4000, 10, G.layout), num('size', 'Text size', 44, 6, 200), font(),
    color('accent', 'Accent', '#4f8cff'), num('cps', 'Typing speed (chars/s)', 16, 1, 200, 1, G.anim, false), num('typeDelay', 'Start typing after', 0.5, 0, 30, 0.05, G.anim, false),
    ...animProps('pop', 'fade', 0.5, 0.4),
  ],
  draw(ctx, p, f) {
    const light = S(p, 'theme') === 'light', bg = light ? '#ffffff' : '#202227', fg = light ? '#1f2328' : '#eef0f3', sub = light ? '#6e7781' : '#8b919a';
    const size = N(p, 'size'), w = N(p, 'width'), h = size * 2.1, sug = lines(p, 'suggestions'), rowH = size * 1.7;
    const q = S(p, 'query'), typed = q.slice(0, Math.max(0, Math.floor((f.t - N(p, 'typeDelay')) * N(p, 'cps'))));
    const doneAt = N(p, 'typeDelay') + q.length / N(p, 'cps') + 0.25, kd = ease('quartOut', win(f.t, doneAt, 0.45, 'linear'));
    const dropH = sug.length * rowH + size * 0.6, x = (f.width - w) / 2, y = f.height / 2 - (h + dropH) / 2;
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12; ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h + dropH * kd, kd > 0 ? size * 0.7 : h / 2); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = typed.length ? S(p, 'accent') : withAlpha(fg, 0.15); ctx.lineWidth = 3; roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
    const ix = x + h * 0.55, iy = y + h / 2, ir = size * 0.32; ctx.strokeStyle = sub; ctx.lineWidth = size * 0.08; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(ix, iy - 2, ir, 0, TAU); ctx.moveTo(ix + ir * 0.7, iy - 2 + ir * 0.7); ctx.lineTo(ix + ir * 1.4, iy - 2 + ir * 1.4); ctx.stroke();
    ctx.font = fnt(400, size, S(p, 'font')); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const tx = x + h * 1.05;
    if (typed) { ctx.fillStyle = fg; ctx.fillText(typed, tx, iy); } else { ctx.fillStyle = sub; ctx.fillText(S(p, 'placeholder'), tx, iy); }
    if (Math.floor(f.t * 2.2) % 2 === 0 || f.t < doneAt) { ctx.fillStyle = S(p, 'accent'); ctx.fillRect(tx + (typed ? ctx.measureText(typed).width : 0) + 3, iy - size * 0.55, Math.max(2, size * 0.06), size * 1.1); }
    if (kd > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(x, y + h, w, dropH * kd); ctx.clip();
      sug.forEach((s, i) => {
        const k = win(f.t, doneAt + 0.1 + i * 0.08, 0.3, 'easeOut'), ry = y + h + size * 0.3 + i * rowH;
        ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * -12);
        if (i === 0) { ctx.fillStyle = withAlpha(S(p, 'accent'), 0.16); roundRect(ctx, x + size * 0.3, ry, w - size * 0.6, rowH, size * 0.4); ctx.fill(); }
        const pre = s.toLowerCase().startsWith(typed.toLowerCase()) ? s.slice(0, typed.length) : '', rest = s.slice(pre.length);
        ctx.fillStyle = sub; ctx.beginPath(); ctx.arc(x + h * 0.55, ry + rowH / 2, size * 0.12, 0, TAU); ctx.fill();
        ctx.font = fnt(400, size * 0.9, S(p, 'font')); ctx.fillStyle = fg; ctx.fillText(pre, tx, ry + rowH / 2);
        const pw = ctx.measureText(pre).width; ctx.font = fnt(700, size * 0.9, S(p, 'font')); ctx.fillText(rest, tx + pw, ry + rowH / 2);
        ctx.restore();
      });
      ctx.restore();
    }
    ctx.restore();
  },
};

const button: ComponentDef = {
  key: 'button', label: 'Button press', category: 'Screen', defaultDuration: 3.5,
  description: 'UI button that hovers, gets pressed (ripple), optionally shows a spinner, then flips to a done state ("Deploy" → "Deployed ✓"). Add a click sfx at pressAt.',
  props: [
    text('label', 'Label', 'Deploy'), text('doneLabel', 'Done label', 'Deployed ✓'), num('pressAt', 'Press at (s)', 1.1, 0, 60, 0.05, G.anim, false), num('loading', 'Spinner seconds (0 = none)', 0.8, 0, 30, 0.05, G.anim, false),
    color('color', 'Color', '#4f8cff'), color('doneColor', 'Done color', '#42be65'), color('textColor', 'Text color', '#ffffff'),
    select('style', 'Style', 'solid', ['solid', 'pill', 'outline', 'glass']), font(), num('size', 'Text size', 52, 6, 300), num('weight', 'Weight', 700, 100, 900, 100),
    ...animProps('pop', 'fade', 0.45, 0.35),
  ],
  draw(ctx, p, f) {
    const size = N(p, 'size'), st = S(p, 'style'), pa = N(p, 'pressAt'), doneAt = pa + N(p, 'loading') + 0.1, cx = f.width / 2, cy = f.height / 2;
    ctx.font = fnt(N(p, 'weight'), size, S(p, 'font'));
    const tw = Math.max(ctx.measureText(S(p, 'label')).width, ctx.measureText(S(p, 'doneLabel')).width), w = tw + size * 2.4, h = size * 2.1;
    const r = st === 'pill' ? h / 2 : size * 0.4, x = cx - w / 2, y = cy - h / 2;
    const kh = win(f.t, pa - 0.5, 0.3, 'easeOut'), s = f.t < pa ? 1 + 0.04 * kh : lerp(0.92, 1, ease('spring', (f.t - pa) / 0.6));
    const kdone = win(f.t, doneAt, 0.3, 'easeOut'), col = mixColor(S(p, 'color'), S(p, 'doneColor'), kdone);
    ctx.save(); applyEnvelope(ctx, p, f, cx, cy); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    ctx.shadowColor = withAlpha(col, 0.55); ctx.shadowBlur = 30 + 20 * kh; ctx.shadowOffsetY = 10;
    ctx.fillStyle = st === 'outline' ? 'rgba(0,0,0,0)' : st === 'glass' ? withAlpha(col, 0.22) : col;
    roundRect(ctx, x, y, w, h, r); ctx.fill(); ctx.shadowColor = 'transparent';
    if (st === 'outline' || st === 'glass') { ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, size * 0.07); roundRect(ctx, x, y, w, h, r); ctx.stroke(); }
    const kr = clamp((f.t - pa) / 0.6);
    if (f.t >= pa && kr < 1) { ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip(); ctx.globalAlpha *= 0.35 * (1 - kr); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, w * kr, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const tc = st === 'outline' ? col : S(p, 'textColor');
    const kl = win(f.t, pa + 0.05, 0.2, 'easeIn'), loading = N(p, 'loading') > 0 && f.t >= pa && f.t < doneAt;
    ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
    if (f.t < doneAt) { ctx.globalAlpha *= N(p, 'loading') > 0 ? 1 - kl : 1; ctx.fillStyle = tc; ctx.fillText(S(p, 'label'), cx, cy + 2); ctx.globalAlpha = 1; }
    if (loading) { ctx.strokeStyle = tc; ctx.lineWidth = size * 0.09; ctx.lineCap = 'round'; ctx.beginPath(); const a = f.t * 7; ctx.arc(cx, cy, size * 0.4, a, a + 4.2); ctx.stroke(); }
    if (f.t >= doneAt) { ctx.fillStyle = tc; ctx.fillText(S(p, 'doneLabel'), cx, cy + 2 + (1 - kdone) * h * 0.6); }
    ctx.restore();
    ctx.restore();
  },
};

// ================================================================ Data
const lineChart: ComponentDef = {
  key: 'lineChart', label: 'Line chart', category: 'Data', defaultDuration: 5,
  description: 'Line that draws on through "Label: value" points, with dots, gradient fill, grid, x labels and the latest value tagged.',
  props: [
    text('data', 'Data (Label: value per line)', 'Jan: 12\nFeb: 19\nMar: 31\nApr: 46\nMay: 72\nJun: 118', G.content, true), text('title', 'Title', 'Videos made per month'), text('unit', 'Value suffix', ''),
    color('color', 'Line color', '#4f8cff'), color('textColor', 'Text color', '#ffffff'), bool('fill', 'Gradient fill', true), bool('dots', 'Dots', true), bool('smooth', 'Smooth', true), bool('grid', 'Grid', true),
    num('width', 'Width', 1400, 100, 4000, 10, G.layout), num('height', 'Height', 620, 100, 4000, 10, G.layout), font(), num('size', 'Text size', 30, 6, 200),
    num('lineWidth', 'Line width', 6, 1, 60, 0.5), num('drawDur', 'Draw duration', 1.6, 0.05, 30, 0.05, G.anim, false), ...animProps('fade', 'fade', 0.4, 0.4),
  ],
  draw(ctx, p, f) {
    const rows = parseData(p); if (rows.length < 2) return;
    const w = N(p, 'width'), h = N(p, 'height'), size = N(p, 'size'), x0 = (f.width - w) / 2, y0 = (f.height - h) / 2 + size, ch = h - size * 3;
    const max = Math.max(...rows.map((r) => r.v)) * 1.1, min = Math.min(0, ...rows.map((r) => r.v)), tc = S(p, 'textColor'), col = S(p, 'color');
    const P = rows.map((r, i) => [x0 + (i / (rows.length - 1)) * w, y0 + ch - ((r.v - min) / (max - min)) * ch] as [number, number]);
    const pts: [number, number][] = [];
    if (B(p, 'smooth')) for (let i = 0; i < P.length - 1; i++) {
      const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
      for (let j = 0; j < 16; j++) { const t = j / 16, t2 = t * t, t3 = t2 * t; pts.push([0, 1].map((k) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3)) as [number, number]); }
    } else pts.push(...P);
    if (!B(p, 'smooth')) pts.pop();
    pts.push(P[P.length - 1]);
    const k = ease('easeInOut', (f.t - N(p, 'inDur') * 0.5) / N(p, 'drawDur'));
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    ctx.textBaseline = 'middle';
    if (S(p, 'title')) { ctx.font = fnt(700, size * 1.3, S(p, 'font')); ctx.fillStyle = tc; ctx.textAlign = 'left'; ctx.fillText(S(p, 'title'), x0, y0 - size * 1.6); }
    if (B(p, 'grid')) { ctx.strokeStyle = withAlpha(tc, 0.1); ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i <= 4; i++) { const gy = y0 + ch * i / 4; ctx.moveTo(x0, gy); ctx.lineTo(x0 + w, gy); } ctx.stroke(); }
    const headX = x0 + w * k;
    if (B(p, 'fill') && k > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(x0 - 10, y0 - 20, headX - x0 + 10, ch + 40); ctx.clip();
      const g = ctx.createLinearGradient(0, y0, 0, y0 + ch); g.addColorStop(0, withAlpha(col, 0.38)); g.addColorStop(1, withAlpha(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(pts[0][0], y0 + ch); pts.forEach((q) => ctx.lineTo(q[0], q[1])); ctx.lineTo(pts[pts.length - 1][0], y0 + ch); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - 20, y0 - 40, headX - x0 + 20, ch + 80); ctx.clip();
    ctx.strokeStyle = col; ctx.lineWidth = N(p, 'lineWidth'); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = withAlpha(col, 0.6); ctx.shadowBlur = 16;
    strokePartial(ctx, pts, 1); ctx.restore();
    let last = -1;
    P.forEach((q, i) => {
      const kd = clamp((headX - q[0]) / (w * 0.06) + 1); if (kd <= 0) return; last = i;
      ctx.font = fnt(500, size, S(p, 'font')); ctx.textAlign = 'center'; ctx.fillStyle = withAlpha(tc, 0.7 * kd); ctx.fillText(rows[i].label, q[0], y0 + ch + size * 1.1);
      if (B(p, 'dots')) { const ds = ease('backOut', kd); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q[0], q[1], N(p, 'lineWidth') * 1.6 * ds, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q[0], q[1], N(p, 'lineWidth') * 0.7 * ds, 0, TAU); ctx.fill(); }
    });
    if (last >= 0) {
      const q = P[last], label = `${rows[last].v}${S(p, 'unit')}`; ctx.font = fnt(700, size, S(p, 'font'));
      const lw = ctx.measureText(label).width + size; ctx.fillStyle = col; roundRect(ctx, q[0] - lw / 2, q[1] - size * 2.4, lw, size * 1.5, size * 0.4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(label, q[0], q[1] - size * 1.65);
    }
    ctx.restore();
  },
};

const donutChart: ComponentDef = {
  key: 'donutChart', label: 'Donut chart', category: 'Data', defaultDuration: 5,
  description: 'Donut whose segments sweep in one after another, with a counting center value and a legend.',
  props: [
    text('data', 'Data (Label: value per line)', 'Editing: 62\nRendering: 23\nReview: 15', G.content, true), text('colors', 'Colors (comma separated)', '#4f8cff,#a56eff,#ffd43b,#42be65,#ff6b9d,#22d3ee'),
    text('centerValue', 'Center value (blank = total)', ''), text('centerLabel', 'Center label', 'hours saved'), num('radius', 'Radius', 250, 10, 2000, 1, G.layout), num('thickness', 'Thickness', 70, 2, 1000),
    font(), num('size', 'Text size', 34, 6, 200), color('textColor', 'Text color', '#ffffff'), bool('legend', 'Legend', true), num('sweepDur', 'Sweep duration', 1.4, 0.05, 30, 0.05, G.anim, false),
    ...animProps('pop', 'fade', 0.5, 0.4),
  ],
  draw(ctx, p, f) {
    const rows = parseData(p); if (!rows.length) return;
    const cols = S(p, 'colors').split(',').map((c) => c.trim()).filter(Boolean), total = rows.reduce((a, r) => a + r.v, 0) || 1;
    const R = N(p, 'radius'), size = N(p, 'size'), leg = B(p, 'legend'), cx = f.width / 2 - (leg ? R * 0.75 : 0), cy = f.height / 2, tc = S(p, 'textColor');
    const k = ease('easeInOut', (f.t - N(p, 'inDur') * 0.4) / N(p, 'sweepDur'));
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, cy);
    ctx.lineWidth = N(p, 'thickness'); ctx.strokeStyle = withAlpha(tc, 0.07); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    let a0 = -Math.PI / 2; const gap = rows.length > 1 ? 0.025 : 0, lim = -Math.PI / 2 + TAU * k;
    rows.forEach((r, i) => {
      const a1 = a0 + TAU * r.v / total, e = Math.min(a1 - gap, lim);
      if (e > a0) { ctx.strokeStyle = cols[i % cols.length]; ctx.beginPath(); ctx.arc(cx, cy, R, a0, e); ctx.stroke(); }
      a0 = a1;
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = tc;
    const cv = S(p, 'centerValue') || compact(total * k);
    ctx.font = fnt(800, size * 2.6, S(p, 'font')); ctx.fillText(cv, cx, cy - (S(p, 'centerLabel') ? size * 0.5 : 0));
    if (S(p, 'centerLabel')) { ctx.font = fnt(500, size * 0.8, S(p, 'font')); ctx.fillStyle = withAlpha(tc, 0.65); ctx.fillText(S(p, 'centerLabel'), cx, cy + size * 1.3); }
    if (leg) {
      const lx = cx + R + N(p, 'thickness') + size * 1.5, ly = cy - (rows.length - 1) * size * 0.9;
      rows.forEach((r, i) => {
        const kk = win(f.t, N(p, 'inDur') * 0.4 + i * N(p, 'sweepDur') / rows.length, 0.4, 'easeOut'), y = ly + i * size * 1.8;
        ctx.save(); ctx.globalAlpha *= kk; ctx.translate((1 - kk) * 30, 0);
        ctx.fillStyle = cols[i % cols.length]; roundRect(ctx, lx, y - size * 0.4, size * 0.8, size * 0.8, size * 0.2); ctx.fill();
        ctx.textAlign = 'left'; ctx.fillStyle = tc; ctx.font = fnt(600, size, S(p, 'font')); ctx.fillText(r.label, lx + size * 1.3, y);
        const lw = ctx.measureText(r.label).width; ctx.fillStyle = withAlpha(tc, 0.6); ctx.font = fnt(400, size, S(p, 'font')); ctx.fillText(`${Math.round(r.v / total * 100)}%`, lx + size * 1.8 + lw, y);
        ctx.restore();
      });
    }
    ctx.restore();
  },
};

const comparison: ComponentDef = {
  key: 'comparison', label: 'Comparison table', category: 'Data', defaultDuration: 5,
  description: 'Before/after or us/them table. Rows "label | left | right"; ✓ and ✗ become animated check/cross badges. The right column is highlighted.',
  props: [
    text('left', 'Left column', 'Before'), text('right', 'Right column', 'With Cutroom'),
    text('rows', 'Rows (label | left | right)', 'Hours per video | 6 | 0.2\nEditable after export | ✗ | ✓\nLive collaboration | ✗ | ✓\nSound design | manual | ✓', G.content, true),
    color('accent', 'Accent', '#4f8cff'), color('good', 'Check color', '#42be65'), color('bad', 'Cross color', '#fa4d56'), color('color', 'Text color', '#ffffff'),
    font(), num('size', 'Text size', 38, 6, 200), num('width', 'Width', 1400, 100, 4000, 10, G.layout), num('interval', 'Seconds between rows', 0.35, 0, 10, 0.01, G.anim, false),
    ...animProps('fade', 'fade', 0.4, 0.4),
  ],
  draw(ctx, p, f) {
    const rows = lines(p, 'rows').map((l) => l.split('|').map((c) => c.trim()));
    const size = N(p, 'size'), w = N(p, 'width'), rh = size * 2, x0 = (f.width - w) / 2, hh = size * 2.2, H = hh + rows.length * rh, y0 = (f.height - H) / 2;
    const c1 = x0 + w * 0.62, c2 = x0 + w * 0.86, tc = S(p, 'color'), iv = N(p, 'interval'), t0 = N(p, 'inDur') * 0.5;
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    const kh = ease('quartOut', clamp((f.t - t0) / (0.3 + rows.length * iv)));
    ctx.fillStyle = withAlpha(S(p, 'accent'), 0.14); roundRect(ctx, c2 - w * 0.12, y0, w * 0.24, hh + rows.length * rh * kh, size * 0.5); ctx.fill();
    ctx.strokeStyle = S(p, 'accent'); ctx.lineWidth = 3; roundRect(ctx, c2 - w * 0.12, y0, w * 0.24, hh + rows.length * rh * kh, size * 0.5); ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.font = fnt(700, size, S(p, 'font'));
    ctx.fillStyle = withAlpha(tc, 0.6); ctx.fillText(S(p, 'left'), c1, y0 + hh / 2); ctx.fillStyle = S(p, 'accent'); ctx.fillText(S(p, 'right'), c2, y0 + hh / 2);
    rows.forEach((r, i) => {
      const k = win(f.t, t0 + 0.2 + i * iv, 0.4, 'easeOut'), y = y0 + hh + i * rh + rh / 2;
      if (k <= 0) return;
      ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 20);
      ctx.strokeStyle = withAlpha(tc, 0.1); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y - rh / 2); ctx.lineTo(x0 + w, y - rh / 2); ctx.stroke();
      ctx.textAlign = 'left'; ctx.font = fnt(500, size, S(p, 'font')); ctx.fillStyle = tc; ctx.fillText(r[0] ?? '', x0 + size * 0.4, y);
      [[r[1], c1, false], [r[2], c2, true]].forEach(([v, x, hi]) => {
        const kb = ease('backOut', win(f.t, t0 + 0.35 + i * iv + (hi ? 0.12 : 0), 0.35, 'linear')), val = String(v ?? '');
        if (val === '✓') checkMark(ctx, x as number, y, size * 0.55, kb, S(p, 'good'));
        else if (val === '✗' || val === '×') crossMark(ctx, x as number, y, size * 0.55, kb, S(p, 'bad'));
        else { ctx.textAlign = 'center'; ctx.font = fnt(hi ? 800 : 500, size, S(p, 'font')); ctx.fillStyle = hi ? tc : withAlpha(tc, 0.6); ctx.fillText(val, x as number, y); }
      });
      ctx.restore();
    });
    ctx.restore();
  },
};

const timelineSteps: ComponentDef = {
  key: 'timelineSteps', label: 'Steps / timeline', category: 'Data', defaultDuration: 5,
  description: 'Numbered steps joined by a line that draws through them; each node pops and its label appears as the line arrives. "Title | subtitle" per line.',
  props: [
    text('steps', 'Steps (Title | subtitle per line)', 'Import | drop in footage\nPrompt | ask Claude\nWatch | edits land live\nShip | export 1080p', G.content, true),
    select('layout', 'Layout', 'horizontal', ['horizontal', 'vertical'], G.layout), color('accent', 'Accent', '#4f8cff'), color('color', 'Text color', '#ffffff'), color('lineColor', 'Track color', 'rgba(255,255,255,0.18)'),
    font(), num('size', 'Text size', 40, 6, 200), num('length', 'Length', 1500, 100, 6000, 10, G.layout), num('interval', 'Seconds per step', 0.6, 0.05, 20, 0.05, G.anim, false), bool('numbers', 'Numbered nodes', true),
    ...animProps('fade', 'fade', 0.3, 0.4),
  ],
  draw(ctx, p, f) {
    const st = lines(p, 'steps').map((l) => l.split('|').map((c) => c.trim())); const n = st.length; if (!n) return;
    const vert = S(p, 'layout') === 'vertical', len = N(p, 'length'), size = N(p, 'size'), cx = f.width / 2, cy = f.height / 2, iv = N(p, 'interval');
    const vl = Math.min(len, f.height * 0.8);
    const pos = (i: number): [number, number] => { const u = n === 1 ? 0.5 : i / (n - 1); return vert ? [cx - size * 6, cy - vl / 2 + u * vl] : [cx - len / 2 + u * len, cy - size * 0.8]; };
    drawSteps(ctx, p, f, st, pos, vert, size, iv);
  },
};
function drawSteps(ctx: Ctx, p: Props, f: Parameters<ComponentDef['draw']>[2], st: string[][], pos: (i: number) => [number, number], vert: boolean, size: number, iv: number) {
  const n = st.length, t0 = 0.3, kLine = clamp((f.t - t0) / Math.max(0.01, iv * (n - 1))), acc = S(p, 'accent'), tc = S(p, 'color'), r = size * 0.7;
  ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
  const a = pos(0), b = pos(n - 1);
  ctx.lineCap = 'round'; ctx.lineWidth = size * 0.14; ctx.strokeStyle = S(p, 'lineColor'); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  ctx.strokeStyle = acc; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(lerp(a[0], b[0], kLine), lerp(a[1], b[1], kLine)); ctx.stroke();
  st.forEach((s, i) => {
    const [x, y] = pos(i), ti = t0 + i * iv, k = ease('backOut', win(f.t, ti, 0.4, 'linear')), kt = win(f.t, ti + 0.1, 0.45, 'easeOut');
    ctx.fillStyle = mixColor('#2a2d35', acc, clamp(k)); ctx.beginPath(); ctx.arc(x, y, r * Math.max(0.6, k), 0, TAU); ctx.fill();
    if (k > 0.05 && f.t - ti < 0.6) { ctx.save(); ctx.globalAlpha *= 1 - clamp((f.t - ti) / 0.6); ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r * (1 + clamp((f.t - ti) / 0.6)), 0, TAU); ctx.stroke(); ctx.restore(); }
    if (B(p, 'numbers')) { ctx.fillStyle = '#fff'; ctx.font = fnt(800, size * 0.7, S(p, 'font')); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y + 2); }
    ctx.save(); ctx.globalAlpha *= kt; ctx.textBaseline = 'middle'; ctx.textAlign = vert ? 'left' : 'center';
    const lx = vert ? x + r * 2 : x, ly = vert ? y - size * 0.35 : y + r + size * 1.1 + (1 - kt) * 16;
    ctx.font = fnt(700, size, S(p, 'font')); ctx.fillStyle = tc; ctx.fillText(s[0] ?? '', lx + (vert ? (1 - kt) * 20 : 0), ly);
    if (s[1]) { ctx.font = fnt(400, size * 0.72, S(p, 'font')); ctx.fillStyle = withAlpha(tc, 0.6); ctx.fillText(s[1], lx + (vert ? (1 - kt) * 20 : 0), ly + size * 1.05); }
    ctx.restore();
  });
  ctx.restore();
}

const flowDiagram: ComponentDef = {
  key: 'flowDiagram', label: 'Flow diagram', category: 'Data', defaultDuration: 6,
  description: 'Boxes-and-arrows diagram from "A -> B" lines, auto-laid-out left to right; boxes pop by column, connectors draw on, dots travel along them.',
  props: [
    text('edges', 'Edges (A -> B per line)', 'Prompt -> Claude\nClaude -> Timeline\nTimeline -> Preview\nTimeline -> Export', G.content, true),
    color('boxColor', 'Box fill', 'rgba(255,255,255,0.06)'), color('borderColor', 'Box border', 'rgba(255,255,255,0.28)'), color('accent', 'Accent', '#4f8cff'), color('color', 'Text color', '#ffffff'),
    font(), num('size', 'Text size', 36, 6, 200), num('interval', 'Seconds per column', 0.6, 0.05, 20, 0.05, G.anim, false),
    num('colGap', 'Column gap', 200, 10, 2000, 1, G.layout), num('rowGap', 'Row gap', 70, 0, 2000, 1, G.layout), bool('dots', 'Travelling dots', true),
    ...animProps('fade', 'fade', 0.3, 0.4),
  ],
  draw(ctx, p, f) {
    const edges = lines(p, 'edges').map((l) => l.split(/\s*-+>\s*/).map((s) => s.trim())).filter((e) => e.length >= 2 && e[0] && e[1]);
    if (!edges.length) return;
    const names: string[] = []; for (const e of edges) for (const s of e.slice(0, 2)) if (!names.includes(s)) names.push(s);
    const rank: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
    for (let it = 0; it < names.length; it++) for (const [a, b] of edges) if (a !== b && rank[b] < rank[a] + 1) rank[b] = Math.min(names.length, rank[a] + 1);
    const size = N(p, 'size'), bh = size * 2.2, colsN = Math.max(...Object.values(rank)) + 1;
    ctx.font = fnt(600, size, S(p, 'font'));
    const bw: Record<string, number> = Object.fromEntries(names.map((n) => [n, ctx.measureText(n).width + size * 1.6]));
    const colW = Array.from({ length: colsN }, (_, c) => Math.max(0, ...names.filter((n) => rank[n] === c).map((n) => bw[n])));
    const totalW = colW.reduce((a, b) => a + b, 0) + (colsN - 1) * N(p, 'colGap');
    const pos: Record<string, { x: number; y: number }> = {};
    let x = (f.width - totalW) / 2;
    for (let c = 0; c < colsN; c++) {
      const col = names.filter((n) => rank[n] === c), H = col.length * bh + (col.length - 1) * N(p, 'rowGap');
      col.forEach((n, i) => { pos[n] = { x: x + colW[c] / 2, y: f.height / 2 - H / 2 + i * (bh + N(p, 'rowGap')) + bh / 2 }; });
      x += colW[c] + N(p, 'colGap');
    }
    const iv = N(p, 'interval'), appear = (n: string) => 0.2 + rank[n] * iv, acc = S(p, 'accent');
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    ctx.lineWidth = Math.max(2, size * 0.09); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [a, b] of edges) {
      const A = pos[a], Bp = pos[b], sx = A.x + bw[a] / 2, ex = Bp.x - bw[b] / 2, mx = (sx + ex) / 2, pts: [number, number][] = [];
      for (let j = 0; j <= 24; j++) { const t = j / 24, u = 1 - t; pts.push([u * u * u * sx + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * ex, u * u * u * A.y + 3 * u * u * t * A.y + 3 * u * t * t * Bp.y + t * t * t * Bp.y]); }
      const te = appear(a) + 0.25, k = ease('easeInOut', (f.t - te) / (iv * 0.8));
      if (k <= 0) continue;
      ctx.strokeStyle = withAlpha(acc, 0.85); const end = strokePartial(ctx, pts, k);
      if (k >= 1) {
        const pa = along(pts, 0.97), ang = Math.atan2(end[1] - pa[1], end[0] - pa[0]), ah = size * 0.4;
        ctx.fillStyle = acc; ctx.beginPath(); ctx.moveTo(end[0], end[1]); ctx.lineTo(end[0] - Math.cos(ang - 0.5) * ah, end[1] - Math.sin(ang - 0.5) * ah); ctx.lineTo(end[0] - Math.cos(ang + 0.5) * ah, end[1] - Math.sin(ang + 0.5) * ah); ctx.closePath(); ctx.fill();
        if (B(p, 'dots')) { const d = along(pts, frac((f.t - te - iv * 0.8) / 1.3)); ctx.fillStyle = '#ffffff'; ctx.shadowColor = acc; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(d[0], d[1], size * 0.16, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }
      }
    }
    for (const n of names) {
      const k = ease('backOut', win(f.t, appear(n), 0.45, 'linear')); if (k <= 0) continue;
      const { x: bx, y: by } = pos[n], w = bw[n];
      ctx.save(); ctx.translate(bx, by); ctx.scale(k, k); ctx.globalAlpha *= clamp(k * 2);
      ctx.fillStyle = S(p, 'boxColor'); roundRect(ctx, -w / 2, -bh / 2, w, bh, size * 0.45); ctx.fill();
      ctx.strokeStyle = rank[n] === 0 ? acc : S(p, 'borderColor'); ctx.lineWidth = 2.5; roundRect(ctx, -w / 2, -bh / 2, w, bh, size * 0.45); ctx.stroke();
      ctx.fillStyle = S(p, 'color'); ctx.font = fnt(600, size, S(p, 'font')); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n, 0, 2);
      ctx.restore();
    }
    ctx.restore();
  },
};

// ================================================================ Effects / overlays
const PARTICLE_COLORS: Record<string, [string, string]> = {
  dust: ['#ffffff', '#cfd8ff'], bokeh: ['#4f8cff', '#a56eff'], sparks: ['#ffb347', '#ffd43b'], snow: ['#ffffff', '#dfe9ff'], stars: ['#ffffff', '#bcd2ff'],
  bubbles: ['#9ad8ff', '#ffffff'], fireflies: ['#d4ff7a', '#ffe27a'], rain: ['#a8c7ff', '#ffffff'], embers: ['#ff7a2f', '#ffb347'],
};
const particles: ComponentDef = {
  key: 'particles', label: 'Ambient particles', category: 'Effects', defaultDuration: 8,
  description: 'Full-frame ambient particles that loop forever: dust, bokeh, sparks, snow, stars, bubbles, fireflies, rain, embers. Layer over backgrounds or footage.',
  props: [
    select('kind', 'Kind', 'dust', Object.keys(PARTICLE_COLORS), G.content), num('count', 'Count', 120, 1, 3000, 1, G.content, false),
    num('speed', 'Speed', 1, 0, 10, 0.05), num('size', 'Size', 1, 0.1, 10, 0.05), color('color1', 'Color (blank = kind default)', ''), color('color2', 'Second color (blank = kind default)', ''),
    num('opacity', 'Opacity', 1, 0, 1, 0.01), ...animProps('fade', 'fade', 0.8, 0.8),
  ],
  draw(ctx, p, f) {
    const kind = S(p, 'kind'), def = PARTICLE_COLORS[kind] || PARTICLE_COLORS.dust, cols = [S(p, 'color1') || def[0], S(p, 'color2') || def[1]];
    const W = f.width, H = f.height, t = f.t * N(p, 'speed'), sz = N(p, 'size'), R = rng(f.seed), n = Math.min(3000, N(p, 'count')) * (kind === 'bokeh' ? 0.3 : 1);
    ctx.save(); ctx.globalAlpha *= envelope(p, f).alpha * N(p, 'opacity');
    if (kind === 'sparks' || kind === 'embers' || kind === 'fireflies') ctx.globalCompositeOperation = 'lighter';
    if (kind === 'bokeh') ctx.filter = 'blur(6px)';
    for (let i = 0; i < n; i++) {
      const x0 = R() * W, y0 = R() * H, r1 = R(), r2 = R(), r3 = R(), r4 = R(), col = cols[i % 2], base = ctx.globalAlpha;
      ctx.fillStyle = ctx.strokeStyle = col;
      switch (kind) {
        case 'dust': {
          ctx.globalAlpha = base * (0.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + r4 * 9)));
          ctx.beginPath(); ctx.arc(wrap(x0 + Math.sin(t * 0.3 + r1 * 6) * 40, -10, W + 10), wrap(y0 - t * 14 * (0.5 + r2), -10, H + 10), (1.2 + r3 * 2.4) * sz, 0, TAU); ctx.fill(); break;
        }
        case 'bokeh': {
          ctx.globalAlpha = base * (0.08 + 0.2 * r2);
          ctx.beginPath(); ctx.arc(wrap(x0 + t * 12 * (r1 - 0.5), -120, W + 120), wrap(y0 - t * 8 * (0.3 + r2), -120, H + 120), (20 + r3 * 70) * sz, 0, TAU); ctx.fill(); break;
        }
        case 'sparks': {
          const y = wrap(y0 - t * (260 + r2 * 520), -40, H + 40), x = x0 + Math.sin(t * 3 + r1 * 9) * 24, l = (10 + r3 * 22) * sz;
          ctx.globalAlpha = base * (0.4 + 0.6 * Math.abs(Math.sin(t * 9 + r4 * 20))); ctx.lineWidth = 2 * sz; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.sin(t * 3 + r1 * 9) * 4, y + l); ctx.stroke(); break;
        }
        case 'snow': {
          ctx.globalAlpha = base * (0.5 + 0.5 * r4);
          ctx.beginPath(); ctx.arc(wrap(x0 + Math.sin(t * (0.5 + r1) + r4 * 6) * 30, -10, W + 10), wrap(y0 + t * (40 + r2 * 80), -10, H + 10), (1.8 + r3 * 4) * sz, 0, TAU); ctx.fill(); break;
        }
        case 'stars': {
          const x = wrap(x0 - t * 5 * r2, 0, W), tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1 + r1 * 3) + r4 * 20)), rr2 = (0.8 + r3 * 1.8) * sz;
          ctx.globalAlpha = base * tw; ctx.beginPath(); ctx.arc(x, y0, rr2, 0, TAU); ctx.fill();
          if (r4 > 0.93) { ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - rr2 * 5 * tw, y0); ctx.lineTo(x + rr2 * 5 * tw, y0); ctx.moveTo(x, y0 - rr2 * 5 * tw); ctx.lineTo(x, y0 + rr2 * 5 * tw); ctx.stroke(); }
          break;
        }
        case 'bubbles': {
          const r = (6 + r3 * 22) * sz, x = x0 + Math.sin(t * (1 + r1) + r4 * 6) * 20, y = wrap(y0 - t * (60 + r2 * 90), -40, H + 40);
          ctx.globalAlpha = base * 0.55; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
          ctx.globalAlpha = base * 0.8; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, TAU); ctx.fill(); break;
        }
        case 'fireflies': {
          const x = x0 + Math.sin(t * (0.3 + r1 * 0.5) + r4 * 9) * 120, y = y0 + Math.cos(t * (0.25 + r2 * 0.4) + r3 * 7) * 90, r = (3 + r3 * 4) * sz;
          ctx.globalAlpha = base * Math.max(0, Math.sin(t * (1 + r2) + r1 * 12)) ** 2;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4); g.addColorStop(0, col); g.addColorStop(0.25, withAlpha(col, 0.5)); g.addColorStop(1, withAlpha(col, 0));
          ctx.fillStyle = g; ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8); break;
        }
        case 'rain': {
          const y = wrap(y0 + t * (900 + r2 * 600), -60, H + 60), x = wrap(x0 - y * 0.15, -40, W + 40), l = (20 + r3 * 30) * sz;
          ctx.globalAlpha = base * (0.25 + 0.4 * r4); ctx.lineWidth = 1.5 * sz; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - l * 0.15, y + l); ctx.stroke(); break;
        }
        default: {
          const y = wrap(y0 - t * (50 + r2 * 90), -20, H + 20), x = x0 + Math.sin(t * (0.8 + r1) + r4 * 6) * 40;
          ctx.globalAlpha = base * clamp(y / H + 0.1) * (0.5 + 0.5 * Math.sin(t * 7 + r3 * 30));
          ctx.beginPath(); ctx.arc(x, y, (1.5 + r3 * 3) * sz, 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = base;
    }
    ctx.restore();
  },
};

const overlay: ComponentDef = {
  key: 'overlay', label: 'Look overlay', category: 'Effects', defaultDuration: 10,
  description: 'Full-frame texture/look on top of everything: film grain, scanlines, light leak, VHS, cinematic letterbox, halftone, film burn, chromatic edge fringe, CRT.',
  props: [
    select('style', 'Style', 'grain', ['grain', 'scanlines', 'lightLeak', 'vhs', 'letterbox', 'halftone', 'filmBurn', 'chromatic', 'crt'], G.content),
    num('intensity', 'Intensity', 0.5, 0, 2, 0.01), color('tint', 'Tint (blank = style default)', ''), num('speed', 'Speed', 1, 0, 10, 0.05),
    ...animProps('fade', 'fade', 0.5, 0.5),
  ],
  draw(ctx, p, f) {
    const W = f.width, H = f.height, st = S(p, 'style'), I = N(p, 'intensity'), t = f.t * N(p, 'speed'), env = envelope(p, f), frame = Math.floor(f.t * 24);
    ctx.save();
    if (st === 'letterbox') {
      const k = env.kin * (1 - env.kout), bar = Math.max(0, (H - W / 2.39) / 2) * Math.min(2, I * 2) * ease('quartOut', k);
      ctx.fillStyle = S(p, 'tint') || '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar); ctx.restore(); return;
    }
    ctx.globalAlpha *= env.alpha;
    const grain = (n: number, a: number) => {
      const R = rng(f.seed + frame * 7919);
      for (let i = 0; i < n; i++) { ctx.fillStyle = R() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`; const s = 1 + R() * 2.5; ctx.fillRect(R() * W, R() * H, s, s); }
    };
    const scan = (gap: number, a: number) => { ctx.fillStyle = `rgba(0,0,0,${a})`; for (let y = 0; y < H; y += gap) ctx.fillRect(0, y, W, gap / 2); };
    const vign = (a: number) => { const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
    if (st === 'grain') grain(Math.round(4000 * Math.min(2, I)), 0.12 * Math.min(1.5, I));
    else if (st === 'scanlines') {
      scan(4, 0.28 * I);
      const by = wrap(t * 140, -200, H + 200), g = ctx.createLinearGradient(0, by - 120, 0, by + 120);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.06 * I})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, by - 120, W, 240);
    } else if (st === 'lightLeak' || st === 'filmBurn') {
      ctx.globalCompositeOperation = 'screen';
      const cols = S(p, 'tint') ? [S(p, 'tint'), S(p, 'tint')] : st === 'filmBurn' ? ['#ff3d00', '#ffb300'] : ['#ff6b3d', '#ffd166'];
      const blobs = st === 'filmBurn' ? 4 : 3, R = rng(f.seed);
      for (let i = 0; i < blobs; i++) {
        const ph = R() * TAU, side = R(), flick = st === 'filmBurn' ? 0.6 + 0.4 * Math.sin(t * 13 + i * 3) * Math.sin(t * 7.3 + i) : 1;
        const x = side < 0.5 ? W * (0.05 + 0.25 * Math.sin(t * 0.4 + ph)) : W * (0.95 - 0.25 * Math.sin(t * 0.35 + ph)), y = H * (0.5 + 0.45 * Math.sin(t * 0.27 + ph * 2));
        const r = W * (0.3 + 0.15 * Math.sin(t * 0.5 + ph)), g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, withAlpha(cols[i % 2], clamp(0.55 * I * flick))); g.addColorStop(1, withAlpha(cols[i % 2], 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      if (st === 'filmBurn') { ctx.globalCompositeOperation = 'source-over'; grain(1200, 0.08 * I); }
    } else if (st === 'vhs') {
      scan(3, 0.2 * I); grain(1500, 0.06 * I);
      const R = rng(f.seed + frame * 31), by = wrap(t * 90, 0, H);
      ctx.fillStyle = `rgba(255,255,255,${0.07 * I})`; ctx.fillRect(0, by, W, 6 + R() * 18);
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? `rgba(255,0,80,${0.12 * I})` : `rgba(0,200,255,${0.12 * I})`; ctx.fillRect(R() * W * 0.3, R() * H, W * (0.2 + R() * 0.6), 2 + R() * 3); }
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(255,255,255,${0.85 * Math.min(1, I * 1.5)})`; ctx.font = fnt(700, H * 0.04, 'JetBrains Mono'); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillText('PLAY ▶', W * 0.05, H * 0.06);
      const s = Math.floor(f.t); ctx.fillText(`SP  0:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, W * 0.05, H * 0.88);
    } else if (st === 'halftone') {
      const gap = 12, c = S(p, 'tint') || '#000000'; ctx.fillStyle = withAlpha(c, clamp(0.35 * I)); ctx.beginPath();
      for (let y = 0; y < H; y += gap) for (let x = (y / gap) % 2 ? gap / 2 : 0; x < W; x += gap) { const r = gap * 0.32 * (0.6 + 0.4 * Math.sin(x * 0.004 + y * 0.003 + t)); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
      ctx.fill();
    } else if (st === 'chromatic') {
      ctx.globalCompositeOperation = 'screen';
      const w = W * 0.08 * Math.min(2, I), gL = ctx.createLinearGradient(0, 0, w, 0), gR = ctx.createLinearGradient(W, 0, W - w, 0);
      gL.addColorStop(0, `rgba(255,0,60,${0.4 * I})`); gL.addColorStop(1, 'rgba(255,0,60,0)'); gR.addColorStop(0, `rgba(0,220,255,${0.4 * I})`); gR.addColorStop(1, 'rgba(0,220,255,0)');
      ctx.fillStyle = gL; ctx.fillRect(0, 0, w, H); ctx.fillStyle = gR; ctx.fillRect(W - w, 0, w, H);
    } else {
      scan(4, 0.3 * I); vign(0.75 * Math.min(1.3, I));
      ctx.globalAlpha *= 0.04 * I * (0.5 + 0.5 * Math.sin(t * 50)); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  },
};

const burst: ComponentDef = {
  key: 'burst', label: 'Accent burst', category: 'Effects', defaultDuration: 0.9,
  description: 'Short one-shot accent at a point: expanding rings, rays, sparkles, shockwave, speed lines or dots. Pair with a pop/boom sfx.',
  props: [
    select('kind', 'Kind', 'rays', ['rings', 'rays', 'sparkle', 'shockwave', 'lines', 'dots'], G.content), num('originX', 'Origin X (0–1)', 0.5, 0, 1, 0.01, G.layout), num('originY', 'Origin Y (0–1)', 0.5, 0, 1, 0.01, G.layout),
    num('size', 'Size', 1, 0.05, 10, 0.05), num('count', 'Count', 12, 1, 200, 1, G.content, false), color('color', 'Color', '#ffd43b'), color('color2', 'Second color', '#ffffff'), num('thickness', 'Thickness', 8, 0.5, 80, 0.5),
  ],
  draw(ctx, p, f) {
    const k = clamp(f.t / f.duration), x = N(p, 'originX') * f.width, y = N(p, 'originY') * f.height, sc = N(p, 'size') * Math.min(f.width, f.height) / 1080;
    const n = N(p, 'count'), kind = S(p, 'kind'), R = rng(f.seed), cols = [S(p, 'color'), S(p, 'color2')], th = N(p, 'thickness') * sc;
    ctx.save(); ctx.lineCap = 'round'; ctx.translate(x, y);
    if (kind === 'rings') for (let i = 0; i < 3; i++) {
      const kk = clamp((k - i * 0.12) / 0.75); if (kk <= 0 || kk >= 1) continue;
      ctx.globalAlpha = 1 - kk; ctx.strokeStyle = cols[i % 2]; ctx.lineWidth = th * (1 - kk); ctx.beginPath(); ctx.arc(0, 0, ease('expoOut', kk) * 260 * sc, 0, TAU); ctx.stroke();
    } else if (kind === 'shockwave') {
      ctx.globalAlpha = clamp(1 - k * 3); ctx.fillStyle = cols[1]; ctx.beginPath(); ctx.arc(0, 0, 90 * sc * ease('expoOut', k * 3), 0, TAU); ctx.fill();
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = cols[0]; ctx.lineWidth = th * 2.5 * (1 - k); ctx.beginPath(); ctx.arc(0, 0, ease('expoOut', k) * 520 * sc, 0, TAU); ctx.stroke();
    } else for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (kind === 'rays' ? 0 : (R() - 0.5) * 0.6), v = 0.7 + R() * 0.6, e = ease('expoOut', k);
      ctx.strokeStyle = ctx.fillStyle = cols[i % 2];
      if (kind === 'rays' || kind === 'lines') {
        const r0 = (kind === 'rays' ? 70 : 140) * sc + e * 160 * sc * v, r1 = r0 + (1 - k) * (kind === 'rays' ? 110 : 240) * sc * v;
        ctx.globalAlpha = 1 - k * 0.6; ctx.lineWidth = th * (kind === 'lines' ? 0.6 : 1) * (1 - k * 0.7);
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
      } else if (kind === 'dots') {
        const r = e * 300 * sc * v; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, th * (1 - k) * (0.6 + R()), 0, TAU); ctx.fill();
      } else {
        const r = (60 + R() * 260) * sc, kk = clamp((k - R() * 0.35) / 0.6), s = Math.sin(kk * Math.PI) * th * 3 * (0.5 + R());
        if (kk <= 0 || kk >= 1) continue;
        ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r); ctx.rotate(kk * 1.5); ctx.beginPath();
        for (let j = 0; j < 8; j++) { const aa = j * Math.PI / 4, rr2 = j % 2 ? s * 0.25 : s; ctx.lineTo(Math.cos(aa) * rr2, Math.sin(aa) * rr2); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
    ctx.restore();
  },
};

const spotlight: ComponentDef = {
  key: 'spotlight', label: 'Spotlight', category: 'Effects', defaultDuration: 5,
  description: 'Darkens the frame except a soft focus area that glides between "x,y,radius" targets (one per line) — direct attention in a screen recording.',
  props: [
    text('targets', 'Targets (x,y,radius per line)', '700,450,220\n1250,620,260', G.content, true), select('shape', 'Shape', 'circle', ['circle', 'rect'], G.content),
    num('hold', 'Hold per target (s)', 1.4, 0, 60, 0.05, G.anim, false), num('moveDur', 'Move duration', 0.6, 0.05, 10, 0.05, G.anim, false),
    color('color', 'Shade color', '#000000'), num('darkness', 'Darkness', 0.7, 0, 1, 0.01), num('feather', 'Feather', 90, 0, 1000), ...animProps('fade', 'fade', 0.4, 0.4),
  ],
  draw(ctx, p, f) {
    const tg = lines(p, 'targets').map((l) => l.split(',').map(Number)).filter((a) => a.length >= 2 && a.every(Number.isFinite));
    if (!tg.length) return;
    const hold = N(p, 'hold'), md = N(p, 'moveDur'), seg = hold + md;
    let i = Math.min(tg.length - 1, Math.floor(f.t / seg)), k = 0;
    const lt = f.t - i * seg; if (lt > hold && i < tg.length - 1) k = ease('easeInOut', (lt - hold) / md);
    const a = tg[i], b = tg[Math.min(tg.length - 1, i + 1)], x = lerp(a[0], b[0], k), y = lerp(a[1], b[1], k), r = lerp(a[2] ?? 200, b[2] ?? 200, k);
    const fe = N(p, 'feather'), shade = withAlpha(S(p, 'color'), N(p, 'darkness'));
    ctx.save(); ctx.globalAlpha *= envelope(p, f).alpha;
    if (S(p, 'shape') === 'rect') {
      if (fe > 0) ctx.filter = `blur(${(fe / 3).toFixed(1)}px)`;
      ctx.fillStyle = shade; ctx.beginPath(); ctx.rect(-fe, -fe, f.width + fe * 2, f.height + fe * 2); rr(ctx, x - r * 1.6, y - r, r * 3.2, r * 2, r * 0.25); ctx.fill('evenodd');
    } else {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r + fe); g.addColorStop(0, withAlpha(S(p, 'color'), 0)); g.addColorStop(clamp(r / (r + fe)), withAlpha(S(p, 'color'), 0)); g.addColorStop(1, shade);
      ctx.fillStyle = g; ctx.fillRect(0, 0, f.width, f.height);
    }
    ctx.restore();
  },
};

const gradientOrb: ComponentDef = {
  key: 'gradientOrb', label: 'Glow orbs', category: 'Background', defaultDuration: 8,
  description: 'Big soft glowing orbs that drift slowly — layer behind text or over a dark background for depth.',
  props: [
    num('count', 'Orbs', 3, 1, 8, 1, G.content, false), color('color1', 'Color 1', '#4f8cff'), color('color2', 'Color 2', '#a56eff'), color('color3', 'Color 3', '#ff6b9d'),
    num('size', 'Size (fraction of width)', 0.42, 0.02, 2, 0.01), num('speed', 'Drift speed', 1, 0, 10, 0.05), num('opacity', 'Opacity', 0.7, 0, 1, 0.01), num('spread', 'Spread', 0.3, 0, 1, 0.01, G.layout),
    ...animProps('fade', 'fade', 1, 1),
  ],
  draw(ctx, p, f) {
    const W = f.width, H = f.height, cols = palette(p, ['color1', 'color2', 'color3']), R = rng(f.seed), t = f.t * N(p, 'speed') * 0.25, sp = N(p, 'spread');
    if (!cols.length) return;
    ctx.save(); ctx.globalAlpha *= envelope(p, f).alpha * N(p, 'opacity');
    for (let i = 0; i < N(p, 'count'); i++) {
      const ph = R() * TAU, ph2 = R() * TAU, bx = 0.5 + (R() - 0.5) * sp * 1.6, by = 0.5 + (R() - 0.5) * sp * 1.2;
      const x = W * (bx + sp * 0.35 * Math.sin(t + ph)), y = H * (by + sp * 0.35 * Math.cos(t * 0.8 + ph2)), r = W * N(p, 'size') * (0.75 + 0.25 * Math.sin(t * 1.3 + ph));
      const c = cols[i % cols.length], g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, withAlpha(c, 0.9)); g.addColorStop(0.45, withAlpha(c, 0.35)); g.addColorStop(1, withAlpha(c, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  },
};

const scribble: ComponentDef = {
  key: 'scribble', label: 'Hand-drawn mark', category: 'Graphics', defaultDuration: 3,
  description: 'Hand-drawn annotation that draws itself on at (x, y): arrow, circle, underline, check, cross, star, box or zigzag. Roughness is seeded so repeats differ.',
  props: [
    select('kind', 'Kind', 'arrow', ['arrow', 'circle', 'underline', 'check', 'cross', 'star', 'box', 'zigzag'], G.content),
    num('x', 'Center X', 960, -4000, 8000, 1, G.layout), num('y', 'Center Y', 540, -4000, 8000, 1, G.layout), num('w', 'Width', 380, 1, 4000, 1, G.layout), num('h', 'Height', 170, 1, 4000, 1, G.layout),
    num('angle', 'Rotation°', 0, -360, 360, 1, G.layout), color('color', 'Color', '#ffd43b'), num('thickness', 'Thickness', 10, 0.5, 100, 0.5), num('roughness', 'Roughness', 1, 0, 5, 0.05),
    num('delay', 'Delay', 0.1, 0, 30, 0.05, G.anim, false), num('drawDur', 'Draw duration', 0.6, 0.05, 10, 0.05, G.anim, false), num('outDur', 'Fade out', 0.3, 0, 10, 0.05, G.anim, false),
  ],
  draw(ctx, p, f) {
    const w = N(p, 'w'), h = N(p, 'h'), R = rng(f.seed), j = () => (R() - 0.5) * N(p, 'roughness') * N(p, 'thickness') * 0.8, kind = S(p, 'kind');
    const strokes: [number, number][][] = [], P = (x: number, y: number): [number, number] => [x + j(), y + j()];
    if (kind === 'arrow') {
      const s: [number, number][] = []; for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; s.push(P(u * u * -w / 2 + 2 * u * t * -w / 8 + t * t * w / 2, u * u * h / 2 + 2 * u * t * -h / 2 + t * t * -h / 2)); }
      const e = s[s.length - 1], q = s[s.length - 3], a = Math.atan2(e[1] - q[1], e[0] - q[0]), L = N(p, 'thickness') * 3 + w * 0.08;
      strokes.push(s, [P(e[0] - Math.cos(a - 0.5) * L, e[1] - Math.sin(a - 0.5) * L), e, P(e[0] - Math.cos(a + 0.5) * L, e[1] - Math.sin(a + 0.5) * L)]);
    } else if (kind === 'circle') { const s: [number, number][] = [], ph = R() * TAU; for (let i = 0; i <= 64; i++) { const a = -2.3 + (i / 64) * TAU * 1.12, r = 1 + 0.05 * Math.sin(a * 3 + ph) + (i / 64) * 0.06; s.push([Math.cos(a) * w / 2 * r, Math.sin(a) * h / 2 * r]); } strokes.push(s); }
    else if (kind === 'underline') { const s: [number, number][] = []; for (let i = 0; i <= 20; i++) { const t = i / 20; s.push(P(-w / 2 + t * w, Math.sin(t * Math.PI) * -h * 0.08)); } strokes.push(s, [P(-w * 0.4, h * 0.12), P(w * 0.3, h * 0.08)]); }
    else if (kind === 'check') strokes.push([P(-w / 2, 0), P(-w / 8, h / 2), P(w / 2, -h / 2)]);
    else if (kind === 'cross') strokes.push([P(-w / 2, -h / 2), P(w / 2, h / 2)], [P(w / 2, -h / 2), P(-w / 2, h / 2)]);
    else if (kind === 'star') { const s: [number, number][] = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI * 0.8; s.push(P(Math.cos(a) * w / 2, Math.sin(a) * h / 2)); } strokes.push(s); }
    else if (kind === 'box') strokes.push([P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2), P(-w / 2 - 6, -h / 2 - 8)]);
    else { const s: [number, number][] = []; for (let i = 0; i <= 9; i++) s.push(P(-w / 2 + (i / 9) * w, i % 2 ? h / 2 : -h / 2)); strokes.push(s); }
    const lens = strokes.map((s) => s.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - s[i - 1][0], q[1] - s[i - 1][1]) : 0), 0)), total = lens.reduce((a, b) => a + b, 0) || 1;
    let left = ease('easeInOut', (f.t - N(p, 'delay')) / N(p, 'drawDur')) * total;
    ctx.save(); ctx.globalAlpha *= 1 - win(f.t, f.duration - N(p, 'outDur'), N(p, 'outDur'), 'easeIn');
    ctx.translate(N(p, 'x'), N(p, 'y')); ctx.rotate(N(p, 'angle') * Math.PI / 180);
    ctx.strokeStyle = S(p, 'color'); ctx.lineWidth = N(p, 'thickness'); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokes.forEach((s, i) => { if (left <= 0) return; strokePartial(ctx, s, left / lens[i]); left -= lens[i]; });
    ctx.restore();
  },
};

// ================================================================ Transitions
const shapeWipe: ComponentDef = {
  key: 'shapeWipe', label: 'Shape wipe', category: 'Transition', defaultDuration: 1.2,
  description: 'Full-screen transition: covers the frame by the midpoint, then uncovers it — circle, diamond, blinds, grid, clock, doors, iris (zoomRings), slats, liquid. Center it on a cut.',
  props: [
    select('style', 'Style', 'circle', ['circle', 'diamond', 'blinds', 'grid', 'clock', 'doors', 'zoomRings', 'slats', 'liquid'], G.content),
    select('direction', 'Direction', 'right', ['right', 'left', 'up', 'down', 'center'], G.content),
    color('color1', 'Color 1', '#4f8cff'), color('color2', 'Color 2 (blank = none)', '#a56eff'), color('color3', 'Color 3 (blank = none)', '#0b0d12'),
    num('pieces', 'Slats / cells', 8, 2, 40, 1, G.content, false),
  ],
  draw(ctx, p, f) {
    const W = f.width, H = f.height, k = clamp(f.t / f.duration), st = S(p, 'style'), dir = S(p, 'direction'), cols = palette(p, ['color1', 'color2', 'color3']);
    if (!cols.length) return;
    ctx.save();
    let w = W, h = H;
    if (dir === 'left') { ctx.translate(W, 0); ctx.scale(-1, 1); }
    else if (dir === 'up') { ctx.translate(0, H); ctx.rotate(-Math.PI / 2); w = H; h = W; }
    else if (dir === 'down') { ctx.translate(W, 0); ctx.rotate(Math.PI / 2); w = H; h = W; }
    const n = cols.length, s = 0.06, span = 0.5 - (n - 1) * s, N2 = Math.max(2, N(p, 'pieces'));
    const center = dir === 'center' || st === 'zoomRings' || st === 'clock' || st === 'diamond';
    const ox = center ? w / 2 : 0, oy = h / 2, Rmax = Math.hypot(Math.max(ox, w - ox), h / 2) + 4;
    cols.forEach((col, i) => {
      const c = ease('easeInOut', clamp((k - i * s) / span)), u = ease('easeInOut', clamp((k - 0.5 - (n - 1 - i) * s) / span));
      if (c <= 0 || u >= 1) return;
      ctx.fillStyle = col; ctx.beginPath();
      if (st === 'circle') { ctx.arc(ox, oy, c * Rmax, 0, TAU); if (u > 0) { ctx.moveTo(ox + u * Rmax, oy); ctx.arc(ox, oy, u * Rmax, 0, TAU); } ctx.fill('evenodd'); }
      else if (st === 'diamond') {
        const dm = (r: number) => { ctx.moveTo(ox, oy - r); ctx.lineTo(ox + r, oy); ctx.lineTo(ox, oy + r); ctx.lineTo(ox - r, oy); ctx.closePath(); };
        const D = w / 2 + h / 2 + 4; dm(c * D); if (u > 0) dm(u * D); ctx.fill('evenodd');
      } else if (st === 'zoomRings') {
        ctx.rect(-2, -2, w + 4, h + 4); const r = c < 1 ? (1 - c) * Rmax : u * Rmax; if (r > 0) { ctx.moveTo(ox + r, oy); ctx.arc(ox, oy, r, 0, TAU); } ctx.fill('evenodd');
      } else if (st === 'clock') {
        const a0 = -Math.PI / 2 + u * TAU, a1 = -Math.PI / 2 + c * TAU; ctx.moveTo(ox, oy); ctx.arc(ox, oy, Rmax, a0, a1); ctx.closePath(); ctx.fill();
      } else if (st === 'blinds' || st === 'slats') {
        const bw = (st === 'blinds' ? w : h) / N2;
        for (let b = 0; b < N2; b++) {
          const ci = clamp(c * 1.5 - (b / N2) * 0.5), ui = clamp(u * 1.5 - (b / N2) * 0.5); if (ci <= ui) continue;
          if (st === 'blinds') ctx.rect(b * bw + bw * ui - 0.5, -2, bw * (ci - ui) + 1, h + 4);
          else ctx.rect(w * ui - 2, b * bw - 0.5, w * (ci - ui) + 4, bw + 1);
        }
        ctx.fill();
      } else if (st === 'grid') {
        const cs = w / (N2 * 1.5), nx = Math.ceil(w / cs), ny = Math.ceil(h / cs);
        for (let gx = 0; gx < nx; gx++) for (let gy = 0; gy < ny; gy++) {
          const d = (gx / nx + gy / ny) / 2, sc = clamp(c * 1.6 - d * 0.6) * (1 - clamp(u * 1.6 - d * 0.6)); if (sc <= 0) continue;
          const sz = cs * sc * 1.04; ctx.rect(gx * cs + cs / 2 - sz / 2, gy * cs + cs / 2 - sz / 2, sz, sz);
        }
        ctx.fill();
      } else if (st === 'doors') { const dw = (w / 2 + 2) * c * (1 - u); ctx.rect(-1, -2, dw, h + 4); ctx.rect(w - dw + 1, -2, dw, h + 4); ctx.fill(); }
      else {
        const A = w * 0.07, edge = (q: number, y: number, ph: number) => q * (w + 2 * A) - A + A * Math.sin((y / h) * TAU * 1.3 + ph + k * 6);
        const steps = 28; for (let j = 0; j <= steps; j++) { const y = (j / steps) * h; ctx.lineTo(edge(c, y, i), y); }
        for (let j = steps; j >= 0; j--) { const y = (j / steps) * h; ctx.lineTo(u > 0 ? edge(u, y, i + 2) : -A * 2, y); }
        ctx.closePath(); ctx.fill();
      }
    });
    ctx.restore();
  },
};

const glitchTransition: ComponentDef = {
  key: 'glitchTransition', label: 'Glitch transition', category: 'Transition', defaultDuration: 0.5,
  description: 'Short digital glitch over a cut: RGB-split slices, blocks and scan noise, with a brief full cover at the midpoint to hide the cut.',
  props: [
    color('color1', 'Color 1', '#ff2bd6'), color('color2', 'Color 2', '#00e5ff'), color('color3', 'Cover color', '#0b0d12'),
    num('intensity', 'Intensity', 1, 0, 3, 0.05), bool('cover', 'Cover the cut', true), num('slices', 'Slices', 16, 1, 80, 1, G.content, false),
  ],
  draw(ctx, p, f) {
    const W = f.width, H = f.height, k = clamp(f.t / f.duration), I = Math.sin(Math.PI * k) * N(p, 'intensity'), R = rng(f.seed + Math.floor(f.t * 30) * 131);
    ctx.save();
    if (B(p, 'cover') && Math.abs(k - 0.5) < 0.1) { ctx.fillStyle = S(p, 'color3'); ctx.fillRect(0, 0, W, H); }
    for (let i = 0; i < 6 * I; i++) { ctx.globalAlpha = 0.5 + R() * 0.5; ctx.fillStyle = R() < 0.5 ? S(p, 'color3') : '#ffffff'; ctx.fillRect(R() * W, R() * H, 40 + R() * 300 * I, 10 + R() * 120 * I); }
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < N(p, 'slices') * I; i++) {
      const y = R() * H, sh = 3 + R() * 60 * I, x = (R() - 0.5) * 300 * I;
      ctx.globalAlpha = 0.35 + R() * 0.5; ctx.fillStyle = R() < 0.5 ? S(p, 'color1') : S(p, 'color2'); ctx.fillRect(x + R() * W * 0.4, y, W * (0.2 + R() * 0.8), sh);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.25 * clamp(I); ctx.fillStyle = '#ffffff';
    for (let y = R() * 6; y < H; y += 6 + R() * 30) ctx.fillRect(0, y, W, 1);
    ctx.restore();
  },
};

export const MORE_COMPONENTS: ComponentDef[] = [
  kineticType, wordCycle, marquee, highlighter, quote, blockReveal, splitFlap, countdown,
  chatBubbles, notificationToast, phoneFrame, socialPost, searchBar, button,
  lineChart, donutChart, comparison, timelineSteps, flowDiagram,
  particles, overlay, burst, spotlight, gradientOrb, scribble,
  shapeWipe, glitchTransition,
];
