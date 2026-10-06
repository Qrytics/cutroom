// Canvas helpers shared by components: text layout, per-word animation, shapes.
import { clamp, ease, lerp, mixColor, rng, win } from '../engine/ease.ts';
import type { Ease } from '../schema/types.ts';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface FrameInfo {
  /** clip-local seconds */
  t: number;
  duration: number;
  width: number;
  height: number;
  /** stable per-clip seed */
  seed: number;
}

export const ANIM_IN = ['none', 'fade', 'rise', 'drop', 'pop', 'slideLeft', 'slideRight', 'blurIn', 'typewriter', 'wordsUp', 'wordsPop', 'letters', 'scaleDown',
  'charsUp', 'charsPop', 'scramble', 'maskUp', 'tracking', 'flipUp', 'skewIn', 'glitchIn', 'zoomBlur', 'stamp', 'splitIn', 'waveIn', 'elastic'];
export const ANIM_OUT = ['none', 'fade', 'sink', 'lift', 'pop', 'blurOut', 'slideLeft', 'slideRight', 'wordsDown',
  'maskDown', 'scrambleOut', 'charsDown', 'zoomOut', 'flipDown', 'glitchOut', 'trackingOut', 'blink'];
/** continuous motion while the text is on screen */
export const TEXT_LOOPS = ['none', 'float', 'wave', 'pulse', 'jitter', 'shimmer', 'glow'];
/** animations that move each character on its own (drawn char by char) */
const CHAR_IN = ['letters', 'charsUp', 'charsPop', 'scramble', 'tracking', 'waveIn'];
const CHAR_OUT = ['charsDown', 'scrambleOut', 'trackingOut'];
/** animations staggered word by word */
const WORD_IN = ['wordsUp', 'wordsPop', 'splitIn', 'flipUp', 'stamp', 'skewIn', 'elastic', 'glitchIn'];
/** integer hash, so neighbouring seeds (seed + frame step) give unrelated random streams */
export const mix = (n: number) => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return (n ^ (n >>> 16)) >>> 0; };
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/?$@';

export interface TextStyle {
  font: string;
  size: number;
  weight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  maxWidth: number;
  uppercase?: boolean;
  italic?: boolean;
}

export const fontStr = (s: Pick<TextStyle, 'font' | 'size' | 'weight' | 'italic'>) =>
  `${s.italic ? 'italic ' : ''}${s.weight} ${s.size}px "${s.font}", system-ui, sans-serif`;

function setSpacing(ctx: Ctx, px: number) {
  const c = ctx as unknown as { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
}

export interface Word { text: string; x: number; w: number; line: number; index: number; charStart: number }
export interface Layout { words: Word[]; lines: { y: number; w: number }[]; width: number; height: number; chars: number }

/** Wrap text into lines. Coordinates are relative to the block's anchor point (x by align, y = block center). */
export function layoutText(ctx: Ctx, text: string, s: TextStyle): Layout {
  ctx.font = fontStr(s);
  setSpacing(ctx, s.letterSpacing);
  const src = s.uppercase ? text.toUpperCase() : text;
  const space = ctx.measureText(' ').width + s.letterSpacing;
  const lines: { words: { text: string; w: number }[]; w: number }[] = [];
  for (const para of src.split('\n')) {
    let cur: { words: { text: string; w: number }[]; w: number } = { words: [], w: 0 };
    for (const word of para.split(/ +/).filter((w, i, a) => w || a.length === 1)) {
      const w = ctx.measureText(word).width;
      const nw = cur.words.length ? cur.w + space + w : w;
      if (cur.words.length && s.maxWidth > 0 && nw > s.maxWidth) { lines.push(cur); cur = { words: [], w: 0 }; }
      cur.w = cur.words.length ? cur.w + space + w : w;
      cur.words.push({ text: word, w });
    }
    lines.push(cur);
  }
  const lh = s.size * s.lineHeight;
  const height = lines.length * lh;
  const words: Word[] = [];
  let chars = 0, index = 0;
  const outLines = lines.map((ln, li) => {
    const y = -height / 2 + lh * (li + 0.5);
    let x = s.align === 'center' ? -ln.w / 2 : s.align === 'right' ? -ln.w : 0;
    for (const w of ln.words) {
      words.push({ text: w.text, x, w: w.w, line: li, index: index++, charStart: chars });
      chars += w.text.length + 1;
      x += w.w + space;
    }
    return { y, w: ln.w };
  });
  return { words, lines: outLines, width: Math.max(0, ...lines.map((l) => l.w)), height, chars };
}

export interface AnimOpts {
  animIn: string; animOut: string; inDur: number; outDur: number; stagger: number; easeIn?: Ease; loop?: string; loopAmount?: number;
}

interface UnitState { alpha: number; dx: number; dy: number; scale: number; sy: number; skew: number; rot: number; blur: number; chars: number; scramble: boolean; mask: boolean }

/** Animation state of one word or character at time t. `rel` = unit center x relative to its line center (for tracking). */
function unitState(a: AnimOpts, f: FrameInfo, inDelay: number, outDelay: number, outStart: number, idx: number, rel: number, size: number, lh: number): UnitState {
  const st: UnitState = { alpha: 1, dx: 0, dy: 0, scale: 1, sy: 1, skew: 0, rot: 0, blur: 0, chars: Infinity, scramble: false, mask: false };
  const k = win(f.t, inDelay, a.inDur, 'linear');
  const e = ease(a.easeIn ?? 'easeOut', k);
  const jit = (salt: number) => rng(mix(f.seed + idx * 131 + salt + Math.floor(f.t * 30) * 7919));
  switch (a.animIn) {
    case 'fade': st.alpha = e; break;
    case 'rise': st.alpha = e; st.dy = (1 - e) * 60; break;
    case 'drop': st.alpha = e; st.dy = -(1 - e) * 60; break;
    case 'pop': case 'wordsPop': st.alpha = clamp(k * 3); st.scale = ease('backOut', k); break;
    case 'scaleDown': st.alpha = e; st.scale = lerp(1.6, 1, e); break;
    case 'slideLeft': st.alpha = e; st.dx = (1 - e) * 160; break;
    case 'slideRight': st.alpha = e; st.dx = -(1 - e) * 160; break;
    case 'blurIn': st.alpha = e; st.blur = (1 - e) * 24; break;
    case 'wordsUp': st.alpha = e; st.dy = (1 - e) * 40; break;
    case 'letters': st.alpha = e; st.dy = (1 - e) * 20; break;
    case 'charsUp': { const q = ease('quintOut', k); st.alpha = clamp(k * 2.5); st.dy = (1 - q) * size * 0.7; break; }
    case 'charsPop': st.alpha = clamp(k * 4); st.scale = ease('backOut', k); break;
    case 'scramble': st.alpha = clamp(f.t / 0.15) * (k < 1 ? 0.8 : 1); st.scramble = k < 1; break;
    case 'maskUp': st.mask = true; st.dy = (1 - ease('quartOut', k)) * lh * 1.1; break;
    case 'tracking': st.alpha = e; st.dx = rel * (1 - ease('expoOut', k)) * 0.8; break;
    case 'flipUp': st.alpha = clamp(k * 2); st.sy = Math.max(0.001, ease('backOut', k)); st.dy = (1 - e) * 24; break;
    case 'skewIn': st.alpha = e; st.skew = -(1 - e) * 0.6; st.dx = (1 - e) * 90; break;
    case 'glitchIn': if (k < 1) { const r = jit(1); st.dx = (r() - 0.5) * size * 0.8 * (1 - k); st.dy = (r() - 0.5) * size * 0.15 * (1 - k); st.alpha = k <= 0 ? 0 : r() < 0.35 * (1 - k) ? 0.15 : 1; } break;
    case 'zoomBlur': st.alpha = e; st.scale = lerp(2.6, 1, e); st.blur = (1 - e) * 18; break;
    case 'stamp': {
      st.alpha = clamp(k * 6); st.scale = lerp(2.2, 1, ease('snap', k));
      const after = f.t - inDelay - a.inDur * 0.35;
      if (after > 0 && after < 0.3) { const d = 1 - after / 0.3; st.dx = Math.sin(after * 95) * size * 0.04 * d; st.dy = Math.cos(after * 80) * size * 0.03 * d; }
      break;
    }
    case 'splitIn': st.alpha = e; st.dx = (idx % 2 ? 1 : -1) * (1 - ease('expoOut', k)) * 320; break;
    case 'waveIn': st.alpha = clamp(k * 2.5); st.dy = (1 - e) * size * 0.45 - Math.sin(k * Math.PI) * size * 0.25; break;
    case 'elastic': st.alpha = clamp(k * 3); st.scale = Math.max(0, ease('elasticOut', k)); break;
  }
  if (a.animOut !== 'none' && f.t > outStart) {
    const lk = win(f.t, outStart + outDelay, a.outDur, 'linear'), ko = ease('easeIn', lk);
    switch (a.animOut) {
      case 'fade': st.alpha *= 1 - ko; break;
      case 'sink': case 'wordsDown': st.alpha *= 1 - ko; st.dy += ko * 50; break;
      case 'lift': st.alpha *= 1 - ko; st.dy -= ko * 50; break;
      case 'pop': st.alpha *= 1 - ko; st.scale *= 1 - ko * 0.6; break;
      case 'blurOut': st.alpha *= 1 - ko; st.blur += ko * 24; break;
      case 'slideLeft': st.alpha *= 1 - ko; st.dx -= ko * 160; break;
      case 'slideRight': st.alpha *= 1 - ko; st.dx += ko * 160; break;
      case 'maskDown': st.mask = true; st.dy += ko * lh * 1.1; break;
      case 'scrambleOut': st.scramble = st.scramble || lk > 0; st.alpha *= 1 - ease('easeIn', clamp((lk - 0.5) * 2)); break;
      case 'charsDown': st.alpha *= 1 - ko; st.dy += ko * size * 0.7; break;
      case 'zoomOut': st.alpha *= 1 - ko; st.scale *= 1 + ko * 1.4; st.blur += ko * 14; break;
      case 'flipDown': st.alpha *= 1 - ko * 0.6; st.sy *= Math.max(0.001, 1 - ko); st.dy += ko * 24; break;
      case 'glitchOut': if (lk > 0) { const r = jit(2); st.dx += (r() - 0.5) * size * 0.8 * lk; st.dy += (r() - 0.5) * size * 0.15 * lk; st.alpha *= lk >= 1 ? 0 : r() < 0.5 * lk ? 0.1 : 1; } break;
      case 'trackingOut': st.alpha *= 1 - ko; st.dx += rel * ko * 0.8; break;
      case 'blink': st.alpha *= lk >= 1 ? 0 : Math.floor(lk * 8) % 2 === 0 ? 1 : 0; break;
    }
  }
  // continuous loops, faded in as the entrance completes
  const amt = (a.loopAmount ?? 1) * (a.animIn === 'none' ? 1 : clamp(k));
  if (amt > 0) switch (a.loop) {
    case 'float': st.dy += Math.sin(f.t * 1.6) * size * 0.06 * amt; break;
    case 'wave': st.dy += Math.sin(f.t * 4 - idx * 0.45) * size * 0.07 * amt; break;
    case 'pulse': st.scale *= 1 + (Math.sin(f.t * 3.2) * 0.5 + 0.5) * 0.05 * amt; break;
    case 'jitter': { const r = rng(mix(f.seed + idx * 977 + Math.floor(f.t * 12) * 31)); st.dx += (r() - 0.5) * size * 0.04 * amt; st.dy += (r() - 0.5) * size * 0.04 * amt; st.rot += (r() - 0.5) * 0.06 * amt; break; }
  }
  return st;
}

export interface TextDecor {
  stroke?: string; strokeWidth?: number; shadow?: number; shadowColor?: string;
  highlight?: { index: number; color: string } | null;
  gradient?: [string, string] | null;
}

/** Draw a laid-out text block at (cx, cy) with animation. */
export function drawText(ctx: Ctx, L: Layout, s: TextStyle, cx: number, cy: number, a: AnimOpts, f: FrameInfo, d: TextDecor = {}) {
  ctx.save();
  ctx.font = fontStr(s);
  setSpacing(ctx, s.letterSpacing);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const charMode = CHAR_IN.includes(a.animIn) || CHAR_OUT.includes(a.animOut) || a.loop === 'wave' || a.loop === 'jitter';
  const lh = s.size * s.lineHeight, nW = L.words.length, nC = Math.max(1, L.chars);
  const inPer = CHAR_IN.includes(a.animIn) ? (a.animIn === 'tracking' ? 0 : a.stagger * (a.animIn === 'scramble' ? 0.5 : 0.35)) : WORD_IN.includes(a.animIn) ? a.stagger : 0;
  const inByChar = CHAR_IN.includes(a.animIn);
  const outPer = CHAR_OUT.includes(a.animOut) ? (a.animOut === 'trackingOut' ? 0 : a.stagger * 0.25) : a.animOut === 'wordsDown' ? a.stagger * 0.5 : 0;
  const outByChar = CHAR_OUT.includes(a.animOut);
  const outStart = f.duration - a.outDur - outPer * ((outByChar ? nC : nW) - 1);
  const lineLeft = (w: number) => (s.align === 'center' ? -w / 2 : s.align === 'right' ? -w : 0);
  let fill: string | CanvasGradient = s.color;
  if (d.gradient || a.loop === 'shimmer') {
    const g = ctx.createLinearGradient(cx + lineLeft(L.width), 0, cx + lineLeft(L.width) + L.width, 0);
    if (a.loop === 'shimmer') {
      const base = d.gradient ? d.gradient[0] : s.color, hi = mixColor(base, '#ffffff', clamp(0.75 * (a.loopAmount ?? 1)));
      const pos = ((f.t * 0.45) % 1.8) - 0.4;
      [[0, base], [pos - 0.15, base], [pos, hi], [pos + 0.15, d.gradient ? d.gradient[1] : base], [1, d.gradient ? d.gradient[1] : base]]
        .forEach(([o, c]) => g.addColorStop(clamp(o as number), c as string));
    } else { g.addColorStop(0, d.gradient![0]); g.addColorStop(1, d.gradient![1]); }
    fill = g;
  }
  const glow = a.loop === 'glow' ? s.size * 0.28 * (0.55 + 0.45 * Math.sin(f.t * 3)) * (a.loopAmount ?? 1) : 0;
  const drawUnit = (txt: string, x: number, y: number, w: number, st: UnitState, lineY: number, color: string | CanvasGradient) => {
    ctx.save();
    if (st.mask) { ctx.beginPath(); ctx.rect(-1e5, lineY - Math.max(lh, s.size * 1.25) / 2, 2e5, Math.max(lh, s.size * 1.25)); ctx.clip(); }
    ctx.globalAlpha *= st.alpha;
    if (st.blur > 0.2) ctx.filter = `blur(${st.blur.toFixed(1)}px)`;
    if (st.scale !== 1 || st.sy !== 1 || st.skew || st.rot) {
      const ox = x + w / 2, oy = y;
      ctx.translate(ox, oy); if (st.rot) ctx.rotate(st.rot); if (st.skew) ctx.transform(1, 0, st.skew, 1, 0, 0); ctx.scale(st.scale, st.scale * st.sy); ctx.translate(-ox, -oy);
    }
    if (glow) { ctx.shadowColor = s.color; ctx.shadowBlur = glow; }
    else if (d.shadow) { ctx.shadowColor = d.shadowColor || 'rgba(0,0,0,0.6)'; ctx.shadowBlur = d.shadow; ctx.shadowOffsetY = d.shadow / 3; }
    if (d.stroke && d.strokeWidth) { ctx.lineJoin = 'round'; ctx.strokeStyle = d.stroke; ctx.lineWidth = d.strokeWidth * 2; ctx.strokeText(txt, x, y); }
    ctx.fillStyle = color;
    ctx.fillText(txt, x, y);
    ctx.restore();
  };
  let caret: { x: number; y: number } | null = null;
  const typeShown = a.animIn === 'typewriter' ? Math.floor(clamp(f.t / Math.max(0.01, a.inDur)) * L.chars) : Infinity;
  for (const w of L.words) {
    const line = L.lines[w.line];
    const lineY = cy + line.y, lineMid = lineLeft(line.w) + line.w / 2;
    const color = d.highlight && d.highlight.index === w.index ? d.highlight.color : fill;
    const shown = clamp(typeShown - w.charStart, 0, w.text.length);
    if (shown <= 0) { if (a.animIn === 'typewriter' && !caret) caret = { x: cx + w.x, y: lineY }; continue; }
    if (!charMode) {
      const st = unitState(a, f, w.index * inPer, w.index * outPer, outStart, w.index, w.x + w.w / 2 - lineMid, s.size, lh);
      if (st.alpha <= 0.001) continue;
      const txt = shown < w.text.length ? w.text.slice(0, shown) : w.text;
      const wx = cx + w.x + st.dx, wy = lineY + st.dy;
      drawUnit(txt, wx, wy, w.w, st, lineY, color);
      if (a.animIn === 'typewriter' && shown < w.text.length + 1) caret = { x: wx + ctx.measureText(txt).width, y: wy };
      continue;
    }
    for (let j = 0; j < shown; j++) {
      const ci = w.charStart + j, ch = w.text[j];
      const x0 = ctx.measureText(w.text.slice(0, j)).width, cw = ctx.measureText(ch).width;
      const st = unitState(a, f, (inByChar ? ci : w.index) * inPer, (outByChar ? ci : w.index) * outPer, outStart, inByChar || a.loop === 'wave' || a.loop === 'jitter' ? ci : w.index, w.x + x0 + cw / 2 - lineMid, s.size, lh);
      if (st.alpha <= 0.001) continue;
      const g = st.scramble && ch.trim() ? GLYPHS[Math.floor(rng(mix(f.seed + ci * 131 + Math.floor(f.t * 20) * 7))() * GLYPHS.length)] : ch;
      drawUnit(g, cx + w.x + x0 + st.dx, lineY + st.dy, cw, st, lineY, color);
    }
    if (a.animIn === 'typewriter' && shown < w.text.length + 1) caret = { x: cx + w.x + ctx.measureText(w.text.slice(0, shown)).width, y: lineY };
  }
  if (a.animIn === 'typewriter' && f.t < a.inDur + 0.8 && caret && Math.floor(f.t * 2.2) % 2 === 0) {
    ctx.fillStyle = s.color;
    ctx.fillRect(caret.x + 3, caret.y - s.size * 0.42, Math.max(2, s.size * 0.06), s.size * 0.84);
  }
  ctx.restore();
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Simple per-token coloring for code: keywords, strings, numbers, comments. */
const KW = /^(const|let|var|function|return|if|else|for|while|import|from|export|default|class|new|async|await|def|in|of|true|false|null|None|True|False|type|interface|public|private|static|fn|pub|use|struct|impl|match|try|catch|throw|yield|lambda|package|func)$/;
export function tokenize(line: string): { text: string; kind: 'kw' | 'str' | 'num' | 'com' | 'fn' | 'plain' | 'punct' }[] {
  const out: { text: string; kind: 'kw' | 'str' | 'num' | 'com' | 'fn' | 'plain' | 'punct' }[] = [];
  const re = /(\/\/.*$|#.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$\d"'`]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1]) out.push({ text: m[1], kind: 'com' });
    else if (m[2]) out.push({ text: m[2], kind: 'str' });
    else if (m[3]) out.push({ text: m[3], kind: 'num' });
    else if (m[4]) out.push({ text: m[4], kind: KW.test(m[4]) ? 'kw' : line[re.lastIndex] === '(' ? 'fn' : 'plain' });
    else out.push({ text: m[0], kind: m[5] ? 'plain' : 'punct' });
  }
  return out;
}
