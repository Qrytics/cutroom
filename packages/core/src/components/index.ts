// Parametric motion-graphics components. Each one is a pure function of (props, clip-local time),
// so preview, scrubbing and export are frame-identical, and every prop is editable in the inspector.
import { clamp, ease, hash, lerp, mixColor, rng, win, withAlpha } from '../engine/ease.ts';
import { type Ctx, drawText, fontStr, mix, type FrameInfo, layoutText, roundRect, type TextStyle, tokenize } from './draw.ts';

import { animOf, animProps, applyEnvelope, B, bool, color, type ComponentDef, envelope, font, G, N, num, S, select, styleOf, text } from './kit.ts';
import { MORE_COMPONENTS } from './more.ts';

export type { Ctx, FrameInfo } from './draw.ts';
export type { ComponentDef } from './kit.ts';


// ---------------------------------------------------------------- components
const textComp: ComponentDef = {
  key: 'text', label: 'Text', category: 'Text', defaultDuration: 4,
  description: 'Any text: headline, caption, label. Per-word or typewriter animation, stroke, shadow, background box.',
  props: [
    text('text', 'Text', 'Your text here', G.content, true),
    font(), num('size', 'Size', 96, 4, 800), num('weight', 'Weight', 700, 100, 900, 100), color('color', 'Color', '#ffffff'),
    select('align', 'Align', 'center', ['left', 'center', 'right']),
    num('lineHeight', 'Line height', 1.15, 0.6, 3, 0.01), num('letterSpacing', 'Letter spacing', 0, -20, 80, 0.5),
    num('maxWidth', 'Max width (0 = none)', 1500, 0, 8000, 10), bool('uppercase', 'Uppercase', false), bool('italic', 'Italic', false),
    color('stroke', 'Outline color', '#000000'), num('strokeWidth', 'Outline width', 0, 0, 40, 0.5),
    num('shadow', 'Shadow blur', 0, 0, 120), color('shadowColor', 'Shadow color', 'rgba(0,0,0,0.6)'),
    color('gradientTo', 'Gradient to (blank = none)', ''),
    color('boxColor', 'Box color (blank = none)', ''), num('boxPadding', 'Box padding', 28, 0, 300), num('boxRadius', 'Box radius', 18, 0, 300),
    ...animProps('rise', 'fade'),
  ],
  draw(ctx, p, f) {
    const s = styleOf(p);
    const L = layoutText(ctx, S(p, 'text'), s);
    const cx = f.width / 2, cy = f.height / 2;
    const ax = s.align === 'center' ? cx : s.align === 'left' ? cx - L.width / 2 : cx + L.width / 2;
    if (S(p, 'boxColor')) {
      ctx.save();
      const { alpha } = envelope(p, f);
      ctx.globalAlpha *= animOf(p).animIn === 'typewriter' ? 1 : alpha;
      const pad = N(p, 'boxPadding');
      ctx.fillStyle = S(p, 'boxColor');
      roundRect(ctx, cx - L.width / 2 - pad, cy - L.height / 2 - pad * 0.6, L.width + pad * 2, L.height + pad * 1.2, N(p, 'boxRadius'));
      ctx.fill();
      ctx.restore();
    }
    drawText(ctx, L, s, ax, cy, animOf(p), f, {
      stroke: S(p, 'stroke'), strokeWidth: N(p, 'strokeWidth'), shadow: N(p, 'shadow'), shadowColor: S(p, 'shadowColor'),
      gradient: S(p, 'gradientTo') ? [s.color, S(p, 'gradientTo')] : null,
    });
  },
};

const title: ComponentDef = {
  key: 'title', label: 'Title', category: 'Text', defaultDuration: 4,
  description: 'Headline with optional kicker above, subtitle below and an animated accent. Layouts: classic, stacked (big outlined kicker), boxed (title on an accent block), outline (hollow), split (title | subtitle around a vertical rule), editorial (rule + italic serif subtitle), huge (fills the width).',
  props: [
    text('kicker', 'Kicker (small, above)', ''), text('text', 'Title', 'Big Bold Title', G.content, true), text('subtitle', 'Subtitle', 'A short supporting line', G.content, true),
    select('layout', 'Layout', 'classic', ['classic', 'stacked', 'boxed', 'outline', 'split', 'editorial', 'huge'], G.content),
    font(), num('size', 'Title size', 120, 8, 600), num('weight', 'Weight', 800, 100, 900, 100), color('color', 'Title color', '#ffffff'),
    color('subColor', 'Subtitle color', 'rgba(255,255,255,0.72)'), color('accent', 'Accent', '#4f8cff'),
    select('align', 'Align', 'center', ['left', 'center', 'right']), num('maxWidth', 'Max width', 1600, 0, 8000, 10),
    num('letterSpacing', 'Letter spacing', -1, -20, 40, 0.5), bool('accentBar', 'Accent bar', true), bool('uppercase', 'Uppercase', false), bool('italic', 'Italic', false),
    num('shadow', 'Shadow blur', 0, 0, 120), color('shadowColor', 'Shadow color', 'rgba(0,0,0,0.6)'),
    ...animProps('wordsUp', 'fade', 0.7, 0.4),
  ],
  draw(ctx, p, f) {
    const layout = S(p, 'layout') || 'classic';
    const a = animOf(p);
    let s: TextStyle = { ...styleOf(p), lineHeight: 1.05 };
    if (layout === 'huge') {
      const probe = layoutText(ctx, S(p, 'text'), { ...s, maxWidth: 0 });
      const target = (N(p, 'maxWidth') || f.width * 0.9);
      s = { ...s, size: Math.min(s.size * 4, s.size * target / Math.max(1, probe.width)), maxWidth: 0, lineHeight: 0.9, letterSpacing: Math.min(s.letterSpacing, -2) };
    }
    if (layout === 'split') s = { ...s, align: 'right', maxWidth: Math.min(s.maxWidth || 1e9, f.width * 0.42) };
    const base = N(p, 'size');
    const L = layoutText(ctx, S(p, 'text'), s);
    const subS: TextStyle = { ...s, size: base * 0.36, weight: 400, color: S(p, 'subColor'), letterSpacing: 0, lineHeight: 1.3, uppercase: false,
      ...(layout === 'editorial' ? { font: 'Instrument Serif', italic: true, size: base * 0.44, weight: 400 } : {}),
      ...(layout === 'split' ? { align: 'left' as const, maxWidth: f.width * 0.36 } : {}) };
    const SL = layoutText(ctx, S(p, 'subtitle'), subS);
    const kS: TextStyle = layout === 'stacked'
      ? { ...s, size: base * 0.7, weight: 900, color: 'rgba(0,0,0,0)', letterSpacing: 0, uppercase: true, lineHeight: 1 }
      : { ...s, size: base * 0.2, weight: 700, color: S(p, 'accent'), letterSpacing: base * 0.03, uppercase: true, lineHeight: 1.2, maxWidth: 0 };
    const KL = layoutText(ctx, S(p, 'kicker'), kS);
    const gap = base * 0.32, cx = f.width / 2, accent = S(p, 'accent');
    const kout = a.animOut === 'none' ? 0 : win(f.t, f.duration - a.outDur, a.outDur, 'easeIn');
    const deco = { shadow: N(p, 'shadow'), shadowColor: S(p, 'shadowColor'), ...(layout === 'outline' ? { stroke: s.color, strokeWidth: Math.max(1.5, s.size * 0.018) } : {}) };
    const titleStyle = layout === 'outline' ? { ...s, color: 'rgba(0,0,0,0)' } : s;
    if (layout === 'split') {
      const g = base * 0.45, h = Math.max(L.height, SL.height) + base * 0.3, cy = f.height / 2;
      const k = win(f.t, 0, a.inDur, 'expoOut') * (1 - kout);
      ctx.fillStyle = accent; ctx.fillRect(cx - 3, cy - h / 2 * k, 6, h * k);
      drawText(ctx, L, s, cx - g, cy, a, f);
      drawText(ctx, SL, subS, cx + g, cy, { ...a, animIn: 'slideRight', stagger: 0 }, { ...f, t: f.t - a.inDur * 0.4 });
      return;
    }
    const total = (S(p, 'kicker') ? KL.height + gap * 0.6 : 0) + L.height + (S(p, 'subtitle') ? gap + SL.height + (layout === 'editorial' ? gap * 0.6 : 0) : 0);
    const blockW = Math.max(L.width, SL.width);
    const ax = s.align === 'center' ? cx : s.align === 'left' ? cx - blockW / 2 : cx + blockW / 2;
    let y = f.height / 2 - total / 2;
    if (S(p, 'kicker')) {
      if (layout === 'stacked') drawText(ctx, KL, kS, ax, y + KL.height / 2, { ...a, animIn: 'tracking', stagger: 0 }, f, { stroke: accent, strokeWidth: Math.max(1.5, kS.size * 0.02) });
      else drawText(ctx, KL, kS, ax, y + KL.height / 2, { ...a, animIn: 'fade' }, f);
      y += KL.height + gap * 0.6;
    }
    if (layout === 'boxed') {
      const k = win(f.t, 0, a.inDur * 0.8, 'expoOut') * (1 - kout), pad = s.size * 0.28;
      const bx = (s.align === 'center' ? cx - L.width / 2 : s.align === 'left' ? ax : ax - L.width) - pad;
      ctx.fillStyle = accent; roundRect(ctx, bx, y - pad * 0.5, (L.width + pad * 2) * k, L.height + pad, s.size * 0.08); ctx.fill();
    }
    drawText(ctx, L, titleStyle, ax, y + L.height / 2, layout === 'boxed' ? { ...a, inDur: a.inDur, easeIn: 'easeOut' } : a, layout === 'boxed' ? { ...f, t: f.t - a.inDur * 0.25 } : f, deco);
    y += L.height;
    const rule = layout === 'editorial' || (B(p, 'accentBar') && layout !== 'boxed');
    if (rule) {
      const k = win(f.t, a.inDur * 0.6, 0.6, 'expoOut') * (1 - kout);
      const bw = (layout === 'editorial' ? Math.max(blockW, base * 3) : base * 1.2) * k;
      ctx.fillStyle = layout === 'editorial' ? withAlpha(s.color, 0.6) : accent;
      const bx = s.align === 'center' ? cx - bw / 2 : s.align === 'left' ? ax : ax - bw;
      const bh = layout === 'editorial' ? Math.max(2, base * 0.012) : Math.max(4, base * 0.055);
      roundRect(ctx, bx, y + gap * 0.35, bw, bh, 4); ctx.fill();
      if (layout === 'editorial') y += gap * 0.6;
    }
    if (S(p, 'subtitle')) {
      const sf = { ...f, t: f.t - a.inDur * 0.5 };
      drawText(ctx, SL, subS, ax, y + gap + SL.height / 2, { ...a, animIn: a.animIn === 'typewriter' ? 'fade' : layout === 'editorial' ? 'blurIn' : 'rise', stagger: 0 }, sf);
    }
  },
};

const LT_VARIANTS = ['bar', 'pill', 'underline', 'minimal', 'boxed', 'glass', 'stacked'];
const lowerThird: ComponentDef = {
  key: 'lowerThird', label: 'Lower third', category: 'Text', defaultDuration: 5,
  description: 'Name + role strap near the bottom of frame. Variants: bar, pill, underline, minimal, boxed, glass, stacked.',
  props: [
    text('text', 'Name', 'Ada Lovelace'), text('subtitle', 'Role', 'Founder & CEO'),
    select('variant', 'Variant', 'bar', LT_VARIANTS, G.content),
    font(), num('size', 'Name size', 54, 8, 300), color('color', 'Name color', '#ffffff'), color('subColor', 'Role color', 'rgba(255,255,255,0.75)'),
    color('bg', 'Panel color', 'rgba(12,14,22,0.82)'), color('accent', 'Accent', '#4f8cff'),
    select('side', 'Side', 'left', ['left', 'right'], G.layout), num('margin', 'Margin', 90, 0, 1000, 1, G.layout),
    num('bottom', 'Bottom offset', 120, 0, 2000, 1, G.layout),
    ...animProps('slideRight', 'slideLeft', 0.55, 0.4),
  ],
  draw(ctx, p, f) {
    const size = N(p, 'size'), v = S(p, 'variant') || 'bar';
    const stacked = v === 'stacked';
    const ns: TextStyle = { ...styleOf(p), align: 'left', maxWidth: 0, lineHeight: 1.1, weight: stacked ? 900 : 700, uppercase: stacked || B(p, 'uppercase'), letterSpacing: stacked ? size * 0.04 : 0 };
    const rs: TextStyle = { ...ns, size: size * (stacked ? 0.42 : 0.55), weight: stacked ? 700 : 400, color: stacked ? S(p, 'accent') : S(p, 'subColor'), uppercase: stacked, letterSpacing: stacked ? size * 0.08 : 0 };
    const NL = layoutText(ctx, S(p, 'text'), ns), RL = layoutText(ctx, S(p, 'subtitle'), rs);
    const panel = ['bar', 'pill', 'boxed', 'glass'].includes(v);
    const padX = panel ? size * 0.6 : 0, padY = panel ? size * 0.45 : size * 0.2;
    const w = Math.max(NL.width, RL.width) + padX * 2 + (v === 'bar' ? 10 : v === 'pill' ? size * 0.5 : 0), h = NL.height + RL.height + padY * 2 + size * 0.1;
    const right = S(p, 'side') === 'right';
    const x = right ? f.width - N(p, 'margin') - w : N(p, 'margin');
    const y = f.height - N(p, 'bottom') - h;
    const a = animOf(p);
    const kin = win(f.t, 0, a.inDur, 'expoOut');
    const kout = a.animOut === 'none' ? 0 : win(f.t, f.duration - a.outDur, a.outDur, 'easeIn');
    const accent = S(p, 'accent');
    ctx.save();
    ctx.globalAlpha *= 1 - kout;
    const reveal = w * kin * (1 - (a.animOut.startsWith('slide') ? kout : 0));
    if (panel || v === 'underline') { ctx.beginPath(); ctx.rect(right ? x + w - reveal : x, y - size, reveal, h + size * 2); ctx.clip(); }
    let tx = x + padX, nameY = y + padY + NL.height / 2, roleY = y + padY + NL.height + size * 0.1 + RL.height / 2;
    if (v === 'bar') { ctx.fillStyle = S(p, 'bg'); roundRect(ctx, x, y, w, h, 10); ctx.fill(); ctx.fillStyle = accent; ctx.fillRect(right ? x + w - 8 : x, y, 8, h); tx += right ? 0 : 6; }
    else if (v === 'pill') {
      ctx.fillStyle = S(p, 'bg'); roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x + padX * 0.9, y + h / 2, size * 0.16, 0, Math.PI * 2); ctx.fill(); tx += size * 0.5;
    } else if (v === 'boxed') {
      const k2 = win(f.t, 0.12, a.inDur, 'expoOut');
      ctx.fillStyle = accent; roundRect(ctx, x, y, NL.width + padX * 2, NL.height + padY * 1.2, 6); ctx.fill();
      ctx.fillStyle = S(p, 'bg'); roundRect(ctx, x + size * 0.3, y + NL.height + padY * 1.2, (RL.width + padX * 2) * k2, RL.height + padY, 6); ctx.fill();
      nameY = y + padY * 0.6 + NL.height / 2; roleY = y + NL.height + padY * 1.7 + RL.height / 2; tx = x + padX;
    } else if (v === 'glass') {
      const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0.07)');
      ctx.fillStyle = g; roundRect(ctx, x, y, w, h, size * 0.35); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; roundRect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, size * 0.35); ctx.stroke();
    } else if (v === 'underline') {
      const k2 = win(f.t, a.inDur * 0.3, a.inDur, 'expoOut');
      ctx.fillStyle = accent; ctx.fillRect(x, y + padY + NL.height + size * 0.04, Math.max(NL.width, RL.width) * k2, Math.max(3, size * 0.06));
      roleY += size * 0.15;
    } else if (v === 'minimal') {
      const k2 = win(f.t, 0, a.inDur, 'expoOut');
      ctx.fillStyle = accent; ctx.fillRect(x, nameY - size * 0.04, size * 0.5 * k2, Math.max(3, size * 0.07)); tx = x + size * 0.75;
    } else if (stacked) { const t1 = roleY; roleY = nameY - NL.height / 2 + RL.height / 2; nameY = t1 - RL.height / 2 + NL.height / 2 + size * 0.05; }
    if (right && !panel) tx = x + w - Math.max(NL.width, RL.width);
    const tf = { ...f, t: f.t - a.inDur * 0.3 };
    const tin = v === 'minimal' || stacked ? 'maskUp' : 'rise';
    drawText(ctx, NL, ns, tx, nameY, { ...a, animIn: tin, animOut: 'none', stagger: 0, inDur: 0.5 }, tf);
    drawText(ctx, RL, rs, tx, roleY, { ...a, animIn: stacked ? 'tracking' : 'rise', animOut: 'none', stagger: 0, inDur: 0.5 }, { ...tf, t: tf.t - 0.12 });
    ctx.restore();
  },
};

const THEMES: Record<string, { bg: string; bar: string; fg: string; kw: string; str: string; num: string; com: string; fn: string; punct: string }> = {
  dark: { bg: '#0d1117', bar: '#161b22', fg: '#e6edf3', kw: '#ff7b72', str: '#a5d6ff', num: '#79c0ff', com: '#8b949e', fn: '#d2a8ff', punct: '#c9d1d9' },
  light: { bg: '#ffffff', bar: '#f0f2f5', fg: '#1f2328', kw: '#cf222e', str: '#0a3069', num: '#0550ae', com: '#6e7781', fn: '#8250df', punct: '#24292f' },
  dracula: { bg: '#282a36', bar: '#21222c', fg: '#f8f8f2', kw: '#ff79c6', str: '#f1fa8c', num: '#bd93f9', com: '#6272a4', fn: '#50fa7b', punct: '#f8f8f2' },
  ibm: { bg: '#161616', bar: '#262626', fg: '#f4f4f4', kw: '#78a9ff', str: '#42be65', num: '#ff7eb6', com: '#8d8d8d', fn: '#be95ff', punct: '#c6c6c6' },
};

function windowChrome(ctx: Ctx, x: number, y: number, w: number, h: number, bar: string, bg: string, titleText: string, fg: string, r = 18, barH = 52) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
  ctx.fillStyle = bg; roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, h, r); ctx.clip();
  ctx.fillStyle = bar; ctx.fillRect(x, y, w, barH);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 28 + i * 24, y + barH / 2, 7, 0, Math.PI * 2); ctx.fill(); });
  if (titleText) {
    ctx.fillStyle = withAlpha(fg, 0.6); ctx.font = `500 20px "Inter", system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(titleText, x + w / 2, y + barH / 2);
  }
  ctx.restore();
}

const codeTyping: ComponentDef = {
  key: 'codeTyping', label: 'Code typing', category: 'Screen', defaultDuration: 6,
  description: 'Editor window that types code with syntax colors and a caret.',
  props: [
    text('code', 'Code', 'const video = await claude.edit({\n  clips: 12,\n  sfx: "whoosh",\n});\n\nvideo.render(); // ✨', G.content, true),
    text('title', 'Window title', 'index.ts'),
    select('theme', 'Theme', 'dark', Object.keys(THEMES)), num('size', 'Font size', 34, 6, 200), font('font', 'JetBrains Mono'),
    num('width', 'Window width', 1300, 100, 4000, 10, G.layout), num('height', 'Window height', 680, 100, 4000, 10, G.layout),
    num('cps', 'Typing speed (chars/s)', 28, 1, 400, 1, G.anim, false), num('typeDelay', 'Start typing after', 0.4, 0, 30, 0.05, G.anim, false),
    bool('lineNumbers', 'Line numbers', true),
    ...animProps('pop', 'fade', 0.5, 0.4),
  ],
  draw(ctx, p, f) {
    const th = THEMES[S(p, 'theme')] || THEMES.dark;
    const w = N(p, 'width'), h = N(p, 'height'), x = (f.width - w) / 2, y = (f.height - h) / 2;
    ctx.save();
    applyEnvelope(ctx, { ...p, animOut: p.animOut }, f, f.width / 2, f.height / 2);
    windowChrome(ctx, x, y, w, h, th.bar, th.bg, S(p, 'title'), th.fg);
    const size = N(p, 'size'), lh = size * 1.5;
    const shown = Math.max(0, Math.floor((f.t - N(p, 'typeDelay')) * N(p, 'cps')));
    const lines = S(p, 'code').split('\n');
    ctx.font = `400 ${size}px "${S(p, 'font')}", monospace`;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const gutter = B(p, 'lineNumbers') ? size * 2.4 : size * 0.8;
    let used = 0, caret: [number, number] | null = null;
    ctx.save(); roundRect(ctx, x, y + 52, w, h - 52, 0); ctx.clip();
    for (let i = 0; i < lines.length && used <= shown; i++) {
      const ly = y + 52 + size * 1.2 + i * lh;
      if (B(p, 'lineNumbers')) { ctx.fillStyle = withAlpha(th.com, 0.6); ctx.textAlign = 'right'; ctx.fillText(String(i + 1), x + gutter - size * 0.7, ly); ctx.textAlign = 'left'; }
      let cx = x + gutter, left = Math.min(shown - used, lines[i].length);
      for (const tok of tokenize(lines[i])) {
        if (left <= 0) break;
        const t = left < tok.text.length ? tok.text.slice(0, left) : tok.text;
        ctx.fillStyle = (th as Record<string, string>)[tok.kind] || th.fg;
        ctx.fillText(t, cx, ly);
        cx += ctx.measureText(t).width; left -= t.length;
      }
      caret = [cx, ly];
      used += lines[i].length + 1;
    }
    if (caret && Math.floor(f.t * 2.2) % 2 === 0) { ctx.fillStyle = th.fg; ctx.fillRect(caret[0] + 2, caret[1] - size * 0.55, Math.max(2, size * 0.09), size * 1.1); }
    ctx.restore();
    ctx.restore();
  },
};

const terminal: ComponentDef = {
  key: 'terminal', label: 'Terminal', category: 'Screen', defaultDuration: 6,
  description: 'Terminal window. Lines starting with "$ " are typed as commands; other lines print as output after the command.',
  props: [
    text('lines', 'Lines', '$ npm create cutroom@latest\n✔ Project ready\n$ claude "make me a launch video"\n▸ Building timeline… 24 clips, 9 sfx\n✔ Done in 41s', G.content, true),
    text('title', 'Window title', 'zsh — 120×32'), text('prompt', 'Prompt color', '#42be65'),
    select('theme', 'Theme', 'ibm', Object.keys(THEMES)), num('size', 'Font size', 32, 6, 200), font('font', 'JetBrains Mono'),
    num('width', 'Window width', 1300, 100, 4000, 10, G.layout), num('height', 'Window height', 620, 100, 4000, 10, G.layout),
    num('cps', 'Typing speed (chars/s)', 30, 1, 400, 1, G.anim, false), num('outputDelay', 'Output delay', 0.35, 0, 10, 0.05, G.anim, false),
    ...animProps('pop', 'fade', 0.5, 0.4),
  ],
  draw(ctx, p, f) {
    const th = THEMES[S(p, 'theme')] || THEMES.ibm;
    const w = N(p, 'width'), h = N(p, 'height'), x = (f.width - w) / 2, y = (f.height - h) / 2;
    ctx.save();
    applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    windowChrome(ctx, x, y, w, h, th.bar, th.bg, S(p, 'title'), th.fg);
    const size = N(p, 'size'), lh = size * 1.45;
    ctx.font = `400 ${size}px "${S(p, 'font')}", monospace`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    // schedule: commands type at cps, outputs appear after outputDelay
    let clock = N(p, 'inDur') * 0.6;
    const rows: { txt: string; cmd: boolean; at: number; end: number }[] = [];
    for (const raw of S(p, 'lines').split('\n')) {
      const cmd = raw.startsWith('$ ');
      const txt = cmd ? raw.slice(2) : raw;
      const at = clock, end = cmd ? at + txt.length / N(p, 'cps') : at;
      rows.push({ txt, cmd, at, end });
      clock = end + (cmd ? N(p, 'outputDelay') : 0.12);
    }
    const visible = rows.filter((r) => f.t >= r.at);
    const maxRows = Math.floor((h - 52 - size) / lh);
    const first = Math.max(0, visible.length - maxRows);
    ctx.save(); roundRect(ctx, x, y + 52, w, h - 52, 0); ctx.clip();
    visible.slice(first).forEach((r, i) => {
      const ly = y + 52 + size * 1.1 + i * lh;
      let cx = x + size * 0.8;
      if (r.cmd) { ctx.fillStyle = S(p, 'prompt'); ctx.fillText('❯', cx, ly); cx += size * 1.2; }
      const n = r.cmd ? Math.floor((f.t - r.at) * N(p, 'cps')) : r.txt.length;
      const t = r.txt.slice(0, n);
      ctx.fillStyle = r.cmd ? th.fg : r.txt.startsWith('✔') ? '#42be65' : r.txt.startsWith('✖') ? '#fa4d56' : withAlpha(th.fg, 0.72);
      ctx.fillText(t, cx, ly);
      const last = i === visible.length - first - 1;
      if (last && Math.floor(f.t * 2.2) % 2 === 0) { ctx.fillStyle = th.fg; ctx.fillRect(cx + ctx.measureText(t).width + 3, ly - size * 0.5, size * 0.55, size); }
    });
    ctx.restore();
    ctx.restore();
  },
};

const counter: ComponentDef = {
  key: 'counter', label: 'Counter / stat', category: 'Data', defaultDuration: 3,
  description: 'Big number that counts up, with prefix/suffix and a label.',
  props: [
    num('from', 'From', 0, -1e12, 1e12, 1, G.content), num('to', 'To', 1250, -1e12, 1e12, 1, G.content), num('decimals', 'Decimals', 0, 0, 6, 1, G.content, false),
    text('prefix', 'Prefix', ''), text('suffix', 'Suffix', '+'), text('label', 'Label', 'videos made'), bool('separator', 'Thousands separator', true),
    font('font', 'Inter'), num('size', 'Size', 200, 8, 800), num('weight', 'Weight', 800, 100, 900, 100),
    color('color', 'Number color', '#ffffff'), color('labelColor', 'Label color', 'rgba(255,255,255,0.7)'),
    num('countDur', 'Count duration', 1.6, 0.05, 60, 0.05, G.anim, false), select('countEase', 'Count easing', 'expoOut', ['linear', 'easeOut', 'expoOut', 'easeInOut'], G.anim),
    ...animProps('pop', 'fade', 0.4, 0.4),
  ],
  draw(ctx, p, f) {
    const k = ease(S(p, 'countEase') as never, (f.t - N(p, 'inDur') * 0.3) / N(p, 'countDur'));
    const v = lerp(N(p, 'from'), N(p, 'to'), k);
    let s = v.toFixed(N(p, 'decimals'));
    if (B(p, 'separator')) { const [i, d] = s.split('.'); s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : ''); }
    ctx.save();
    applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    const size = N(p, 'size');
    ctx.font = `${N(p, 'weight')} ${size}px "${S(p, 'font')}", system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = S(p, 'color');
    const label = S(p, 'label');
    const cy = f.height / 2 - (label ? size * 0.22 : 0);
    ctx.fillText(`${S(p, 'prefix')}${s}${S(p, 'suffix')}`, f.width / 2, cy);
    if (label) {
      ctx.font = `500 ${size * 0.22}px "${S(p, 'font')}", system-ui`; ctx.fillStyle = S(p, 'labelColor');
      ctx.fillText(label, f.width / 2, cy + size * 0.72);
    }
    ctx.restore();
  },
};

const barChart: ComponentDef = {
  key: 'barChart', label: 'Bar chart', category: 'Data', defaultDuration: 5,
  description: 'Horizontal bars that grow in, one per "Label: value" line.',
  props: [
    text('data', 'Data (Label: value per line)', 'Manual editing: 240\nTemplate tool: 95\nCutroom + Claude: 12', G.content, true),
    text('title', 'Title', 'Minutes per video'), text('unit', 'Value suffix', ' min'),
    font(), num('size', 'Text size', 38, 6, 200), color('color', 'Text color', '#ffffff'),
    color('barColor', 'Bar color', 'rgba(255,255,255,0.25)'), color('highlight', 'Last bar color', '#4f8cff'),
    num('width', 'Chart width', 1400, 100, 4000, 10, G.layout), num('barHeight', 'Bar height', 64, 4, 400, 1, G.layout),
    num('growDur', 'Grow duration', 0.9, 0.05, 20, 0.05, G.anim, false),
    ...animProps('fade', 'fade', 0.4, 0.4),
  ],
  draw(ctx, p, f) {
    const rows = S(p, 'data').split('\n').map((l) => { const m = l.match(/^(.*?):\s*(-?[\d.]+)/); return m ? { label: m[1], v: parseFloat(m[2]) } : null; }).filter(Boolean) as { label: string; v: number }[];
    if (!rows.length) return;
    const max = Math.max(...rows.map((r) => r.v));
    const w = N(p, 'width'), bh = N(p, 'barHeight'), gap = bh * 0.9, size = N(p, 'size');
    const titleH = S(p, 'title') ? size * 2 : 0;
    const total = titleH + rows.length * (bh + gap + size * 1.1);
    const x0 = (f.width - w) / 2; let y = (f.height - total) / 2;
    ctx.save();
    applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if (titleH) { ctx.font = `700 ${size * 1.3}px "${S(p, 'font')}"`; ctx.fillStyle = S(p, 'color'); ctx.fillText(S(p, 'title'), x0, y + size * 0.6); y += titleH; }
    rows.forEach((r, i) => {
      const k = win(f.t, N(p, 'inDur') * 0.5 + i * 0.18, N(p, 'growDur'), 'expoOut');
      ctx.font = `500 ${size}px "${S(p, 'font')}"`; ctx.fillStyle = withAlpha(S(p, 'color'), 0.85);
      ctx.fillText(r.label, x0, y + size * 0.5);
      y += size * 1.1;
      const bw = Math.max(bh * 0.2, (w * 0.82) * (r.v / max) * k);
      ctx.fillStyle = i === rows.length - 1 ? S(p, 'highlight') : S(p, 'barColor');
      roundRect(ctx, x0, y, bw, bh, bh * 0.22); ctx.fill();
      ctx.font = `700 ${size}px "${S(p, 'font')}"`; ctx.fillStyle = S(p, 'color');
      const val = (r.v * k).toFixed(Number.isInteger(r.v) ? 0 : 1);
      ctx.fillText(`${val}${S(p, 'unit')}`, x0 + bw + size * 0.5, y + bh / 2);
      y += bh + gap;
    });
    ctx.restore();
  },
};

const shape: ComponentDef = {
  key: 'shape', label: 'Shape', category: 'Graphics', defaultDuration: 4,
  description: 'Rectangle, ellipse, line, triangle, star, arrow, ring, hexagon, blob (organic, morphing), cross, heart, squircle or burst with fill, stroke and draw-on animation.',
  props: [
    select('shape', 'Shape', 'rect', ['rect', 'ellipse', 'line', 'triangle', 'star', 'arrow', 'ring', 'hexagon', 'blob', 'cross', 'heart', 'squircle', 'burst'], G.content),
    num('width', 'Width', 600, 0, 8000, 1, G.layout), num('height', 'Height', 360, 0, 8000, 1, G.layout), num('radius', 'Corner radius', 24, 0, 2000),
    color('fill', 'Fill (blank = none)', '#4f8cff'), color('strokeColor', 'Stroke', '#ffffff'), num('strokeWidth', 'Stroke width', 0, 0, 200, 0.5),
    num('draw', 'Draw-on progress (0–1)', 1, 0, 1, 0.01), bool('dash', 'Dashed', false),
    ...animProps('pop', 'fade', 0.45, 0.35),
  ],
  draw(ctx, p, f) {
    const w = N(p, 'width'), h = N(p, 'height'), cx = f.width / 2, cy = f.height / 2;
    ctx.save();
    applyEnvelope(ctx, p, f, cx, cy);
    ctx.beginPath();
    const sh = S(p, 'shape');
    if (sh === 'rect') roundRect(ctx, cx - w / 2, cy - h / 2, w, h, N(p, 'radius'));
    else if (sh === 'ellipse' || sh === 'ring') ctx.ellipse(cx, cy, w / 2, h / 2, 0, -Math.PI / 2, Math.PI * 1.5);
    else if (sh === 'line') { ctx.moveTo(cx - w / 2, cy); ctx.lineTo(cx + w / 2, cy); }
    else if (sh === 'triangle') { ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx + w / 2, cy + h / 2); ctx.lineTo(cx - w / 2, cy + h / 2); ctx.closePath(); }
    else if (sh === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.45 : 1; ctx.lineTo(cx + Math.cos(a) * w / 2 * r, cy + Math.sin(a) * h / 2 * r); } ctx.closePath(); }
    else if (sh === 'hexagon') { for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; ctx.lineTo(cx + Math.cos(a) * w / 2, cy + Math.sin(a) * h / 2); } ctx.closePath(); }
    else if (sh === 'burst') { for (let i = 0; i < 32; i++) { const a = -Math.PI / 2 + i * Math.PI / 16, r = i % 2 ? 0.8 : 1; ctx.lineTo(cx + Math.cos(a) * w / 2 * r, cy + Math.sin(a) * h / 2 * r); } ctx.closePath(); }
    else if (sh === 'squircle') { for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); ctx.lineTo(cx + Math.sign(c) * Math.abs(c) ** 0.5 * w / 2, cy + Math.sign(sn) * Math.abs(sn) ** 0.5 * h / 2); } ctx.closePath(); }
    else if (sh === 'cross') { const tw = w * 0.17, th = h * 0.17; ctx.moveTo(cx - tw, cy - h / 2); ctx.lineTo(cx + tw, cy - h / 2); ctx.lineTo(cx + tw, cy - th); ctx.lineTo(cx + w / 2, cy - th); ctx.lineTo(cx + w / 2, cy + th); ctx.lineTo(cx + tw, cy + th); ctx.lineTo(cx + tw, cy + h / 2); ctx.lineTo(cx - tw, cy + h / 2); ctx.lineTo(cx - tw, cy + th); ctx.lineTo(cx - w / 2, cy + th); ctx.lineTo(cx - w / 2, cy - th); ctx.lineTo(cx - tw, cy - th); ctx.closePath(); }
    else if (sh === 'heart') {
      const x = (u: number) => cx + u * w / 2, y = (v: number) => cy + v * h / 2;
      ctx.moveTo(x(0), y(-0.45)); ctx.bezierCurveTo(x(0.25), y(-1.05), x(1.15), y(-0.7), x(0.95), y(-0.1)); ctx.bezierCurveTo(x(0.8), y(0.35), x(0.3), y(0.65), x(0), y(1));
      ctx.bezierCurveTo(x(-0.3), y(0.65), x(-0.8), y(0.35), x(-0.95), y(-0.1)); ctx.bezierCurveTo(x(-1.15), y(-0.7), x(-0.25), y(-1.05), x(0), y(-0.45)); ctx.closePath();
    } else if (sh === 'blob') {
      const R = rng(f.seed), n = 9, ph = Array.from({ length: n }, () => [R() * 6.28, 0.8 + R() * 0.9]);
      const pts = ph.map(([a0, sp], i) => { const a = i / n * Math.PI * 2, r = 0.82 + 0.16 * Math.sin(f.t * sp + a0); return [cx + Math.cos(a) * w / 2 * r, cy + Math.sin(a) * h / 2 * r]; });
      const mid = (i: number) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
      ctx.moveTo(mid(0)[0], mid(0)[1]);
      for (let i = 1; i <= n; i++) { const m = mid(i); ctx.quadraticCurveTo(pts[i % n][0], pts[i % n][1], m[0], m[1]); }
      ctx.closePath();
    }
    else if (sh === 'arrow') { const hw = Math.min(h, w * 0.4); ctx.moveTo(cx - w / 2, cy - h * 0.18); ctx.lineTo(cx + w / 2 - hw, cy - h * 0.18); ctx.lineTo(cx + w / 2 - hw, cy - h / 2); ctx.lineTo(cx + w / 2, cy); ctx.lineTo(cx + w / 2 - hw, cy + h / 2); ctx.lineTo(cx + w / 2 - hw, cy + h * 0.18); ctx.lineTo(cx - w / 2, cy + h * 0.18); ctx.closePath(); }
    const draw = N(p, 'draw');
    if (S(p, 'fill') && sh !== 'line' && sh !== 'ring') { ctx.save(); ctx.globalAlpha *= draw; ctx.fillStyle = S(p, 'fill'); ctx.fill(); ctx.restore(); }
    const sw = sh === 'ring' && !N(p, 'strokeWidth') ? 12 : N(p, 'strokeWidth');
    if (sw > 0) {
      const per = sh === 'line' ? w : sh === 'ellipse' || sh === 'ring' ? Math.PI * (w + h) / 2 : 2 * (w + h) + 400;
      ctx.lineWidth = sw; ctx.strokeStyle = sh === 'ring' && !S(p, 'strokeColor') ? S(p, 'fill') : S(p, 'strokeColor'); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (B(p, 'dash')) ctx.setLineDash([sw * 3, sw * 2]);
      else if (draw < 1) { ctx.setLineDash([per * draw, per]); }
      ctx.stroke();
    }
    ctx.restore();
  },
};

const BG_STYLES = ['solid', 'linear', 'radial', 'glow', 'grid', 'dots', 'blobs', 'noise', 'mesh', 'aurora', 'waves', 'starfield', 'stripes', 'conic', 'perspectiveGrid', 'topo', 'bokeh', 'halftone', 'paper'];

const background: ComponentDef = {
  key: 'background', label: 'Background', category: 'Background', defaultDuration: 10,
  description: 'Full-frame animated background. Styles: solid, linear, radial, glow, grid, dots, blobs, noise, mesh (drifting gradient mesh), aurora (blurred light curtains), waves (layered sine hills), starfield (flying stars), stripes (moving diagonals), conic (rotating sweep), perspectiveGrid (retro synthwave floor + sun), topo (contour lines), bokeh (soft light orbs), halftone (wave of dots), paper (warm textured stock — use light colors).',
  props: [
    select('style', 'Style', 'glow', BG_STYLES, G.content),
    color('color1', 'Color 1', '#0b1020'), color('color2', 'Color 2', '#1d3a8a'), color('color3', 'Color 3', '#6d28d9'),
    num('angle', 'Angle°', 135, -360, 360), num('speed', 'Motion speed', 1, 0, 10, 0.05), num('spacing', 'Grid spacing', 80, 8, 600),
    ...animProps('fade', 'none', 0.5, 0.4),
  ],
  draw(ctx, p, f) {
    const W = f.width, H = f.height, st = S(p, 'style'), sp = N(p, 'speed'), t = f.t * sp;
    ctx.save();
    applyEnvelope(ctx, { ...p, animIn: p.animIn === 'none' ? 'none' : 'fade' }, f, W / 2, H / 2);
    ctx.fillStyle = S(p, 'color1'); ctx.fillRect(0, 0, W, H);
    if (st === 'linear') {
      const a = N(p, 'angle') * Math.PI / 180, r = Math.hypot(W, H) / 2;
      const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
      g.addColorStop(0, S(p, 'color1')); g.addColorStop(1, S(p, 'color2')); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (st === 'radial' || st === 'glow') {
      const ox = st === 'glow' ? Math.sin(t * 0.3) * W * 0.12 : 0, oy = st === 'glow' ? Math.cos(t * 0.23) * H * 0.1 : 0;
      const g = ctx.createRadialGradient(W / 2 + ox, H * 0.42 + oy, 0, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, S(p, 'color2')); g.addColorStop(1, S(p, 'color1')); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (st === 'glow') {
        const g2 = ctx.createRadialGradient(W * 0.8 - ox, H * 0.85, 0, W * 0.8, H * 0.85, W * 0.5);
        g2.addColorStop(0, withAlpha(S(p, 'color3'), 0.55)); g2.addColorStop(1, withAlpha(S(p, 'color3'), 0)); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
      }
    } else if (st === 'grid' || st === 'dots') {
      const s = N(p, 'spacing'), off = (t * 20) % s;
      ctx.fillStyle = ctx.strokeStyle = withAlpha(S(p, 'color2'), 0.5); ctx.lineWidth = 1.5;
      for (let x = -s + off; x < W + s; x += s) for (let y = -s + off; y < H + s; y += s) {
        if (st === 'dots') { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); }
      }
      if (st === 'grid') {
        ctx.beginPath();
        for (let x = -s + off; x < W + s; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (let y = -s + off; y < H + s; y += s) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();
      }
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      v.addColorStop(0, withAlpha(S(p, 'color1'), 0)); v.addColorStop(1, S(p, 'color1')); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    } else if (st === 'blobs') {
      ctx.filter = `blur(${Math.round(W * 0.06)}px)`;
      const cols = [S(p, 'color2'), S(p, 'color3'), mixColor(S(p, 'color2'), S(p, 'color3'), 0.5)];
      cols.forEach((c, i) => {
        const x = W * (0.3 + 0.4 * Math.sin(t * 0.21 + i * 2.1)), y = H * (0.5 + 0.3 * Math.cos(t * 0.17 + i * 1.7));
        ctx.fillStyle = withAlpha(c, 0.75); ctx.beginPath(); ctx.arc(x, y, W * 0.22, 0, Math.PI * 2); ctx.fill();
      });
    } else if (st === 'mesh') {
      const cols = [S(p, 'color2'), S(p, 'color3'), mixColor(S(p, 'color2'), S(p, 'color3'), 0.5), mixColor(S(p, 'color1'), S(p, 'color3'), 0.4)];
      cols.forEach((c, i) => {
        const x = W * (0.5 + 0.42 * Math.sin(t * (0.13 + i * 0.03) + i * 1.9)), y = H * (0.5 + 0.42 * Math.cos(t * (0.11 + i * 0.04) + i * 2.6)), r = W * (0.45 + 0.1 * Math.sin(t * 0.2 + i));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, withAlpha(c, 0.8)); g.addColorStop(1, withAlpha(c, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      });
    } else if (st === 'aurora') {
      ctx.filter = `blur(${Math.round(H * 0.05)}px)`; ctx.globalCompositeOperation = 'lighter';
      [S(p, 'color2'), S(p, 'color3'), mixColor(S(p, 'color2'), '#ffffff', 0.3)].forEach((c, i) => {
        const g = ctx.createLinearGradient(0, H * 0.1, 0, H * 0.8); g.addColorStop(0, withAlpha(c, 0)); g.addColorStop(0.5, withAlpha(c, 0.55)); g.addColorStop(1, withAlpha(c, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += W / 24) ctx.lineTo(x, H * (0.35 + i * 0.08) + Math.sin(x / W * 5 + t * (0.4 + i * 0.15) + i * 2) * H * 0.12 + Math.sin(x / W * 11 - t * 0.3) * H * 0.04);
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      });
      ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
    } else if (st === 'waves') {
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = mixColor(S(p, 'color2'), S(p, 'color3'), i / 4).replace(/[\d.]+\)$/, `${0.35 + i * 0.12})`);
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += W / 48) ctx.lineTo(x, H * (0.45 + i * 0.1) + Math.sin(x / W * (3 + i) * Math.PI + t * (0.5 + i * 0.2) + i) * H * (0.05 - i * 0.006));
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      }
    } else if (st === 'starfield') {
      const R = rng(f.seed);
      ctx.fillStyle = S(p, 'color2');
      for (let i = 0; i < 320; i++) {
        const ax = R() * 2 - 1, ay = R() * 2 - 1, z = (R() + t * 0.12) % 1, d = 0.05 + (1 - z) * 0.95;
        const x = W / 2 + ax / d * W * 0.25, y = H / 2 + ay / d * H * 0.25, r = Math.max(0.6, (1 - d) * 4);
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        ctx.globalAlpha = clamp((1 - d) * 1.5); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (st === 'stripes') {
      const sp = N(p, 'spacing'), a = N(p, 'angle') * Math.PI / 180, D = Math.hypot(W, H), off = (t * 40) % (sp * 2);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(a); ctx.fillStyle = withAlpha(S(p, 'color2'), 0.22);
      for (let x = -D + off; x < D; x += sp * 2) ctx.fillRect(x, -D, sp, D * 2);
      ctx.restore();
    } else if (st === 'conic') {
      const c2 = ctx as Ctx & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient };
      const g = c2.createConicGradient ? c2.createConicGradient(t * 0.25, W / 2, H / 2) : ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      [S(p, 'color1'), S(p, 'color2'), S(p, 'color3'), S(p, 'color1')].forEach((c, i) => g.addColorStop(i / 3, c));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const v = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      v.addColorStop(0, withAlpha(S(p, 'color1'), 0.2)); v.addColorStop(1, withAlpha(S(p, 'color1'), 0.85)); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    } else if (st === 'perspectiveGrid') {
      const hz = H * 0.55;
      const sky = ctx.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, S(p, 'color1')); sky.addColorStop(1, withAlpha(S(p, 'color3'), 0.65)); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz);
      const sr = H * 0.22, sun = ctx.createLinearGradient(0, hz - sr * 2, 0, hz); sun.addColorStop(0, mixColor(S(p, 'color3'), '#ffd43b', 0.6)); sun.addColorStop(1, S(p, 'color3'));
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hz); ctx.clip(); ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(W / 2, hz - sr * 0.15, sr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = S(p, 'color1'); for (let i = 0; i < 6; i++) ctx.fillRect(W / 2 - sr, hz - sr * 0.15 + i * sr * 0.16 - sr * 0.05, sr * 2, 2 + i * 2.2); ctx.restore();
      ctx.fillStyle = S(p, 'color1'); ctx.fillRect(0, hz, W, H - hz);
      ctx.strokeStyle = withAlpha(S(p, 'color2'), 0.9); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = -24; i <= 24; i++) { ctx.moveTo(W / 2 + i * W * 0.012, hz); ctx.lineTo(W / 2 + i * W * 0.16, H); }
      const ph = (t * 0.5) % 1;
      for (let j = 0; j < 14; j++) { const z = (j + ph) / 14, y = hz + (H - hz) * z * z; ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      const hg = ctx.createLinearGradient(0, hz, 0, hz + H * 0.12); hg.addColorStop(0, withAlpha(S(p, 'color3'), 0.6)); hg.addColorStop(1, withAlpha(S(p, 'color3'), 0)); ctx.fillStyle = hg; ctx.fillRect(0, hz, W, H * 0.12);
    } else if (st === 'topo') {
      const R = rng(f.seed);
      const centers = [0, 1, 2].map(() => [R() * W, R() * H, R() * 6]);
      ctx.strokeStyle = withAlpha(S(p, 'color2'), 0.35); ctx.lineWidth = 1.5;
      for (const [x0, y0, ph] of centers) for (let r = 40; r < W * 0.45; r += N(p, 'spacing') * 0.45) {
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, rr = r * (1 + 0.12 * Math.sin(a * 3 + ph + t * 0.25 + r * 0.01) + 0.06 * Math.sin(a * 5 - t * 0.2)); i ? ctx.lineTo(x0 + Math.cos(a) * rr, y0 + Math.sin(a) * rr) : ctx.moveTo(x0 + Math.cos(a) * rr, y0 + Math.sin(a) * rr); }
        ctx.closePath(); ctx.stroke();
      }
    } else if (st === 'bokeh') {
      const R = rng(f.seed); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 36; i++) {
        const c = i % 2 ? S(p, 'color2') : S(p, 'color3'), r = H * (0.03 + R() * 0.12), sp = 0.2 + R() * 0.6;
        const x = (R() * W + Math.sin(t * sp * 0.3 + i) * W * 0.05 + t * sp * 15) % (W + r * 2) - r, y = (R() * H - t * sp * 20 % H + H) % H;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r); const al = 0.15 + R() * 0.3;
        g.addColorStop(0, withAlpha(c, al)); g.addColorStop(0.7, withAlpha(c, al * 0.7)); g.addColorStop(1, withAlpha(c, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (st === 'halftone') {
      const sp = Math.max(12, N(p, 'spacing') * 0.4); ctx.fillStyle = withAlpha(S(p, 'color2'), 0.7);
      for (let y = sp / 2; y < H; y += sp) for (let x = sp / 2; x < W; x += sp) {
        const v = 0.5 + 0.5 * Math.sin(x / W * 6 + y / H * 4 - t * 1.2) * Math.cos(y / H * 3 + t * 0.4);
        const r = sp * 0.45 * v; if (r < 0.5) continue; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (st === 'paper') {
      const R = rng(f.seed);
      for (let i = 0; i < 1800; i++) { ctx.fillStyle = withAlpha(R() < 0.5 ? S(p, 'color2') : '#000000', 0.03 + R() * 0.04); ctx.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2); }
      const lx = W * (0.3 + 0.2 * Math.sin(t * 0.15)), lg = ctx.createRadialGradient(lx, H * 0.3, 0, lx, H * 0.3, W * 0.8);
      lg.addColorStop(0, 'rgba(255,255,255,0.18)'); lg.addColorStop(1, 'rgba(0,0,0,0.12)'); ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    } else if (st === 'noise') {
      const R = rng(mix(f.seed + Math.floor(f.t * 24)));
      ctx.fillStyle = withAlpha(S(p, 'color2'), 0.08);
      for (let i = 0; i < 2500; i++) ctx.fillRect(R() * W, R() * H, 2, 2);
    }
    ctx.restore();
  },
};

const stripeWipe: ComponentDef = {
  key: 'stripeWipe', label: 'Stripe wipe', category: 'Transition', defaultDuration: 1.2,
  description: 'Diagonal colored stripes sweep across and off the screen — place over a cut between two clips.',
  props: [
    color('color1', 'Color 1', '#4f8cff'), color('color2', 'Color 2', '#a56eff'), color('color3', 'Color 3', '#ffffff'),
    num('stripes', 'Stripes', 3, 1, 12, 1, G.content), num('angle', 'Angle°', 20, -80, 80, 1, G.content),
    select('direction', 'Direction', 'right', ['right', 'left'], G.content),
  ],
  draw(ctx, p, f) {
    const W = f.width, H = f.height, n = N(p, 'stripes');
    const cols = [S(p, 'color1'), S(p, 'color2'), S(p, 'color3')];
    const A = Math.abs(Math.tan(N(p, 'angle') * Math.PI / 180) * H);
    const mx = (x: number) => (S(p, 'direction') === 'left' ? W - x : x);
    const span = W + A;
    for (let i = 0; i < n; i++) {
      // each stripe's leading edge sweeps across, then its trailing edge follows and uncovers the frame
      const d = i * 0.07;
      const lead = ease('easeInOut', (f.t / f.duration - d) / 0.5) * span;
      const trail = ease('easeInOut', (f.t / f.duration - 0.4 - d) / 0.5) * span;
      if (lead <= trail) continue;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.moveTo(mx(trail), 0); ctx.lineTo(mx(lead), 0); ctx.lineTo(mx(lead - A), H); ctx.lineTo(mx(trail - A), H); ctx.closePath(); ctx.fill();
    }
  },
};

const captions: ComponentDef = {
  key: 'captions', label: 'Captions', category: 'Text', defaultDuration: 6,
  description: 'Animated word-by-word captions. Text is spread evenly across the clip, or use "time|word" lines for exact timing (seconds, clip-local). Styles: highlight, pop, karaoke, plain, box, bounce, gradient, outline, neon, underline, stack (one big word at a time).',
  props: [
    text('text', 'Words', 'Every edit Claude makes is right here on the timeline', G.content, true),
    num('wordsPerPage', 'Words per page', 4, 1, 30, 1, G.content, false),
    select('style', 'Style', 'highlight', ['highlight', 'pop', 'karaoke', 'plain', 'box', 'bounce', 'gradient', 'outline', 'neon', 'underline', 'stack'], G.content),
    font('font', 'Inter'), num('size', 'Size', 76, 6, 400), num('weight', 'Weight', 800, 100, 900, 100),
    color('color', 'Color', '#ffffff'), color('highlight', 'Active color', '#ffd43b'), color('stroke', 'Outline', '#000000'),
    num('strokeWidth', 'Outline width', 5, 0, 30, 0.5), bool('uppercase', 'Uppercase', true), num('yOffset', 'Vertical offset', 300, -3000, 3000, 1, G.layout),
    num('maxWidth', 'Max width', 1400, 0, 8000, 10, G.layout),
  ],
  draw(ctx, p, f) {
    const src = S(p, 'text').trim();
    let words: { w: string; t: number }[];
    if (src.includes('|')) words = src.split('\n').map((l) => { const [t, w] = l.split('|'); return { t: parseFloat(t), w: (w || '').trim() }; }).filter((x) => x.w);
    else { const ws = src.split(/\s+/).filter(Boolean); words = ws.map((w, i) => ({ w, t: (i / ws.length) * f.duration })); }
    if (!words.length) return;
    let cur = 0; while (cur < words.length - 1 && f.t >= words[cur + 1].t) cur++;
    const style = S(p, 'style');
    const per = style === 'stack' ? 1 : N(p, 'wordsPerPage'), page = Math.floor(cur / per);
    const slice = words.slice(page * per, page * per + per);
    const s: TextStyle = { ...styleOf(p), align: 'center', lineHeight: 1.2, ...(style === 'stack' ? { size: N(p, 'size') * 1.8 } : {}) };
    const L = layoutText(ctx, slice.map((x) => x.w).join(' '), s);
    const active = cur - page * per;
    const cy = f.height / 2 + N(p, 'yOffset');
    const hi = S(p, 'highlight'), sw = N(p, 'strokeWidth');
    ctx.save();
    ctx.font = fontStr(s); ctx.textBaseline = 'middle';
    L.words.forEach((w, i) => {
      const wt = slice[i]?.t ?? 0;
      const k = win(f.t, wt, 0.18, 'backOut');
      if ((style === 'pop' || style === 'karaoke' || style === 'stack') && f.t < wt) return;
      const x = f.width / 2 + w.x, y = cy + L.lines[w.line].y;
      const on = i === active;
      ctx.save();
      if ((style === 'pop' && on) || style === 'stack') { const sc = lerp(style === 'stack' ? 0.5 : 0.7, 1, k); ctx.translate(x + w.w / 2, y); ctx.scale(sc, sc); ctx.translate(-x - w.w / 2, -y); }
      if (style === 'bounce' && on) ctx.translate(0, -Math.sin(clamp((f.t - wt) / 0.3) * Math.PI) * s.size * 0.22);
      if (style === 'box' && on) { ctx.fillStyle = hi; roundRect(ctx, x - s.size * 0.15, y - s.size * 0.6, w.w + s.size * 0.3, s.size * 1.2, s.size * 0.18); ctx.fill(); }
      if (style === 'underline' && on) { ctx.fillStyle = hi; ctx.fillRect(x, y + s.size * 0.5, w.w * win(f.t, wt, 0.2, 'expoOut'), Math.max(3, s.size * 0.08)); }
      if (style === 'neon') { ctx.shadowColor = on ? hi : withAlpha(hi, 0.6); ctx.shadowBlur = s.size * (on ? 0.45 : 0.2); }
      if (sw > 0 && style !== 'neon') { ctx.lineJoin = 'round'; ctx.lineWidth = sw * 2; ctx.strokeStyle = style === 'outline' ? (on ? hi : s.color) : S(p, 'stroke'); ctx.strokeText(w.text, x, y); }
      let fill: string | CanvasGradient = s.color;
      if ((style === 'highlight' || style === 'pop' || style === 'karaoke' || style === 'bounce' || style === 'underline') && on) fill = hi;
      if (style === 'karaoke' && i < active) fill = hi;
      if (style === 'box' && on) fill = S(p, 'stroke');
      if (style === 'gradient') { const g = ctx.createLinearGradient(x, y - s.size / 2, x + w.w, y + s.size / 2); g.addColorStop(0, on ? hi : s.color); g.addColorStop(1, on ? s.color : withAlpha(s.color, 0.55)); fill = g; }
      if (style === 'outline') fill = on ? hi : 'rgba(0,0,0,0)';
      if (style === 'neon') fill = on ? '#ffffff' : mixColor(hi, '#ffffff', 0.4);
      ctx.fillStyle = fill;
      ctx.fillText(w.text, x, y);
      ctx.restore();
    });
    ctx.restore();
  },
};

const confetti: ComponentDef = {
  key: 'confetti', label: 'Confetti burst', category: 'Effects', defaultDuration: 3,
  description: 'Seeded particle burst from a point, with gravity. Styles: confetti, streamers (ribbons), circles, emoji (uses the Emoji prop). Great on a reveal.',
  props: [
    select('style', 'Style', 'confetti', ['confetti', 'streamers', 'circles', 'emoji'], G.content), text('emoji', 'Emoji (style = emoji)', '🎉✨🚀'),
    num('count', 'Particles', 140, 1, 2000, 1, G.content, false), num('originX', 'Origin X (0–1)', 0.5, 0, 1, 0.01, G.layout), num('originY', 'Origin Y (0–1)', 0.6, 0, 1, 0.01, G.layout),
    num('power', 'Power', 1, 0.1, 5, 0.05), num('gravity', 'Gravity', 1, 0, 5, 0.05), num('size', 'Particle size', 14, 1, 100),
    color('color1', 'Color 1', '#4f8cff'), color('color2', 'Color 2', '#ffd43b'), color('color3', 'Color 3', '#ff6b9d'), color('color4', 'Color 4', '#42be65'),
  ],
  draw(ctx, p, f) {
    const R = rng(f.seed);
    const cols = [S(p, 'color1'), S(p, 'color2'), S(p, 'color3'), S(p, 'color4')];
    const style = S(p, 'style') || 'confetti', emoji = Array.from(S(p, 'emoji') || '🎉');
    const ox = N(p, 'originX') * f.width, oy = N(p, 'originY') * f.height, t = f.t;
    const alpha = clamp(1 - (t - f.duration * 0.6) / (f.duration * 0.4));
    const count = style === 'emoji' ? Math.min(N(p, 'count'), 80) : style === 'streamers' ? Math.min(N(p, 'count'), 60) : N(p, 'count');
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (R() - 0.5) * Math.PI * 1.1, v = (600 + R() * 1300) * N(p, 'power');
      const spin = (R() - 0.5) * 20, sz = N(p, 'size') * (0.5 + R()), c = cols[i % 4], drag = 0.9 + R() * 0.6, ph = R() * 6;
      const pos = (tt: number) => [ox + Math.cos(a) * v * (1 - Math.exp(-tt * drag)) / drag, oy + Math.sin(a) * v * (1 - Math.exp(-tt * drag)) / drag + 0.5 * 900 * N(p, 'gravity') * tt * tt * 0.6];
      const [x, y] = pos(t);
      ctx.save(); ctx.globalAlpha *= alpha;
      if (style === 'streamers') {
        ctx.strokeStyle = c; ctx.lineWidth = sz * 0.35; ctx.lineCap = 'round'; ctx.beginPath();
        for (let j = 0; j <= 8; j++) { const tt = Math.max(0, t - j * 0.035); const [px, py] = pos(tt); const wv = Math.sin(tt * 14 + ph) * sz * 0.8; j ? ctx.lineTo(px + wv, py) : ctx.moveTo(px + wv, py); }
        ctx.stroke();
      } else if (style === 'circles') { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, sz * 0.4, 0, Math.PI * 2); ctx.fill(); }
      else if (style === 'emoji') {
        ctx.translate(x, y); ctx.rotate(spin * t * 0.15); ctx.font = `${sz * 2.6}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(emoji[i % emoji.length], 0, 0);
      } else { ctx.translate(x, y); ctx.rotate(spin * t); ctx.scale(1, Math.cos(t * spin * 0.7)); ctx.fillStyle = c; ctx.fillRect(-sz / 2, -sz / 4, sz, sz / 2); }
      ctx.restore();
    }
  },
};

const callout: ComponentDef = {
  key: 'callout', label: 'Callout', category: 'Graphics', defaultDuration: 4,
  description: 'Highlight ring at a target point with a leader line and a label — for pointing at UI in screen recordings.',
  props: [
    text('text', 'Label', 'Click here'), num('targetX', 'Target X', 1200, -4000, 8000, 1, G.layout), num('targetY', 'Target Y', 420, -4000, 8000, 1, G.layout),
    num('labelX', 'Label X', 1500, -4000, 8000, 1, G.layout), num('labelY', 'Label Y', 260, -4000, 8000, 1, G.layout), num('ringSize', 'Ring size', 70, 4, 1000),
    color('color', 'Color', '#ffd43b'), color('textColor', 'Text color', '#111111'), font(), num('size', 'Text size', 40, 6, 300),
    ...animProps('pop', 'fade', 0.6, 0.35),
  ],
  draw(ctx, p, f) {
    const tx = N(p, 'targetX'), ty = N(p, 'targetY'), lx = N(p, 'labelX'), ly = N(p, 'labelY');
    const { alpha } = envelope(p, f);
    const k1 = win(f.t, 0, 0.45, 'backOut'), k2 = win(f.t, 0.2, 0.4, 'easeOut'), k3 = win(f.t, 0.45, 0.35, 'backOut');
    ctx.save(); ctx.globalAlpha *= alpha;
    const c = S(p, 'color');
    ctx.strokeStyle = c; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(tx, ty, N(p, 'ringSize') * k1, 0, Math.PI * 2); ctx.stroke();
    const pulse = (f.t % 1.4) / 1.4;
    ctx.save(); ctx.globalAlpha *= (1 - pulse) * 0.6; ctx.beginPath(); ctx.arc(tx, ty, N(p, 'ringSize') * (1 + pulse * 0.6), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    const ang = Math.atan2(ly - ty, lx - tx), r = N(p, 'ringSize');
    const sx = tx + Math.cos(ang) * r, sy = ty + Math.sin(ang) * r;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lerp(sx, lx, k2), lerp(sy, ly, k2)); ctx.stroke();
    if (k3 > 0) {
      ctx.font = `700 ${N(p, 'size')}px "${S(p, 'font')}"`;
      const w = ctx.measureText(S(p, 'text')).width + N(p, 'size') * 1.2, h = N(p, 'size') * 1.8;
      ctx.save(); ctx.translate(lx, ly); ctx.scale(k3, k3);
      ctx.fillStyle = c; roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.3); ctx.fill();
      ctx.fillStyle = S(p, 'textColor'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(S(p, 'text'), 0, 2);
      ctx.restore();
    }
    ctx.restore();
  },
};

const cursor: ComponentDef = {
  key: 'cursor', label: 'Animated cursor', category: 'Screen', defaultDuration: 4,
  description: 'Mouse pointer gliding through "x,y" waypoints (one per line, add ",click" to click there) with click ripples.',
  props: [
    text('path', 'Waypoints (x,y[,click] per line)', '700,700\n1100,450,click\n1400,620,click', G.content, true),
    num('size', 'Cursor size', 44, 8, 300), color('color', 'Cursor color', '#ffffff'), color('ripple', 'Click ripple', '#4f8cff'),
    num('moveDur', 'Seconds per move', 0.9, 0.05, 20, 0.05, G.anim, false),
  ],
  draw(ctx, p, f) {
    const pts = S(p, 'path').split('\n').map((l) => l.split(',')).filter((a) => a.length >= 2).map((a) => ({ x: +a[0], y: +a[1], click: (a[2] || '').trim() === 'click' }));
    if (!pts.length) return;
    const md = N(p, 'moveDur'), seg = md + 0.25;
    let x = pts[0].x, y = pts[0].y, pressed = 0;
    for (let i = 1; i < pts.length; i++) {
      const t0 = (i - 1) * seg, k = ease('easeInOut', (f.t - t0) / md);
      if (f.t < t0) break;
      x = lerp(pts[i - 1].x, pts[i].x, k); y = lerp(pts[i - 1].y, pts[i].y, k);
      if (pts[i].click) {
        const ct = f.t - (t0 + md);
        if (ct >= 0 && ct < 0.7) {
          pressed = ct < 0.12 ? 1 : 0;
          ctx.save(); ctx.globalAlpha *= 1 - ct / 0.7; ctx.strokeStyle = S(p, 'ripple'); ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 12 + ct * 110, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
      }
    }
    const s = N(p, 'size') / 24 * (pressed ? 0.88 : 1);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.lineTo(5.5, 17); ctx.lineTo(9.5, 25.5); ctx.lineTo(13, 24); ctx.lineTo(9, 15.5); ctx.lineTo(16, 15.5); ctx.closePath();
    ctx.fillStyle = S(p, 'color'); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 1.6; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.restore();
  },
};

const browserFrame: ComponentDef = {
  key: 'browserFrame', label: 'Browser frame', category: 'Screen', defaultDuration: 6,
  description: 'Browser window chrome with URL bar. Put it on a track ABOVE a screen recording; the content area is transparent (or filled).',
  props: [
    text('url', 'URL', 'cutroom.app/editor'), num('width', 'Width', 1600, 100, 8000, 1, G.layout), num('height', 'Height', 940, 100, 8000, 1, G.layout),
    select('theme', 'Theme', 'dark', ['dark', 'light']), color('contentFill', 'Content fill (blank = transparent)', ''),
    num('border', 'Outer margin (mask)', 0, 0, 2000, 1, G.layout), color('maskColor', 'Outside color', ''),
    ...animProps('none', 'none', 0.5, 0.4),
  ],
  draw(ctx, p, f) {
    const w = N(p, 'width'), h = N(p, 'height'), x = (f.width - w) / 2, y = (f.height - h) / 2;
    const dark = S(p, 'theme') === 'dark', bar = dark ? '#2b2d31' : '#e8eaed', fg = dark ? '#e8eaed' : '#202124', barH = 64;
    ctx.save();
    applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    if (S(p, 'maskColor')) {
      ctx.fillStyle = S(p, 'maskColor'); ctx.beginPath(); ctx.rect(0, 0, f.width, f.height); roundRect(ctx, x, y, w, h, 16); ctx.fill('evenodd');
    }
    ctx.save(); roundRect(ctx, x, y, w, h, 16); ctx.clip();
    if (S(p, 'contentFill')) { ctx.fillStyle = S(p, 'contentFill'); ctx.fillRect(x, y, w, h); }
    ctx.fillStyle = bar; ctx.fillRect(x, y, w, barH);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 30 + i * 26, y + barH / 2, 8, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = dark ? '#1e1f22' : '#ffffff'; roundRect(ctx, x + 130, y + 13, w - 260, barH - 26, (barH - 26) / 2); ctx.fill();
    ctx.fillStyle = withAlpha(fg, 0.8); ctx.font = '400 22px "Inter", system-ui'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('🔒  ' + S(p, 'url'), x + 160, y + barH / 2);
    ctx.restore();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; roundRect(ctx, x, y, w, h, 16); ctx.stroke();
    ctx.restore();
  },
};

const progressBar: ComponentDef = {
  key: 'progressBar', label: 'Progress bar', category: 'Graphics', defaultDuration: 4,
  description: 'Bar that fills from 0 to a target percent, with optional label.',
  props: [
    num('value', 'Target %', 100, 0, 100, 1, G.content), text('label', 'Label', 'Rendering'), num('width', 'Width', 1000, 10, 8000, 1, G.layout), num('height', 'Height', 28, 2, 400, 1, G.layout),
    color('track', 'Track color', 'rgba(255,255,255,0.15)'), color('fill', 'Fill color', '#4f8cff'), color('color', 'Text color', '#ffffff'), font(),
    num('fillDur', 'Fill duration', 2.5, 0.05, 120, 0.05, G.anim, false), ...animProps('fade', 'fade', 0.3, 0.3),
  ],
  draw(ctx, p, f) {
    const w = N(p, 'width'), h = N(p, 'height'), x = (f.width - w) / 2, y = f.height / 2 - h / 2;
    const k = ease('easeInOut', (f.t - N(p, 'inDur')) / N(p, 'fillDur')) * N(p, 'value') / 100;
    ctx.save(); applyEnvelope(ctx, p, f, f.width / 2, f.height / 2);
    ctx.fillStyle = S(p, 'track'); roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = S(p, 'fill'); roundRect(ctx, x, y, Math.max(h, w * k), h, h / 2); ctx.fill();
    if (S(p, 'label')) {
      ctx.fillStyle = S(p, 'color'); ctx.font = `600 ${h * 1.2}px "${S(p, 'font')}"`; ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left'; ctx.fillText(S(p, 'label'), x, y - h * 0.6);
      ctx.textAlign = 'right'; ctx.fillText(`${Math.round(k * 100)}%`, x + w, y - h * 0.6);
    }
    ctx.restore();
  },
};

const checklist: ComponentDef = {
  key: 'checklist', label: 'Checklist', category: 'Text', defaultDuration: 5,
  description: 'List of items that appear one by one and get checked off.',
  props: [
    text('items', 'Items (one per line)', 'Import footage\nCut to the beat\nAdd titles + SFX\nExport 1080p', G.content, true),
    font(), num('size', 'Text size', 56, 6, 300), color('color', 'Text color', '#ffffff'), color('accent', 'Check color', '#42be65'),
    num('interval', 'Seconds between items', 0.55, 0.05, 20, 0.05, G.anim, false), ...animProps('fade', 'fade', 0.4, 0.4),
  ],
  draw(ctx, p, f) {
    const items = S(p, 'items').split('\n').filter(Boolean), size = N(p, 'size'), lh = size * 1.7;
    ctx.font = `600 ${size}px "${S(p, 'font')}"`;
    const w = Math.max(...items.map((i) => ctx.measureText(i).width)) + size * 1.6;
    const x = (f.width - w) / 2, y0 = f.height / 2 - (items.length * lh) / 2 + lh / 2;
    ctx.save(); applyEnvelope(ctx, { ...p, animIn: 'none' }, f, f.width / 2, f.height / 2);
    items.forEach((it, i) => {
      const t0 = 0.2 + i * N(p, 'interval'), k = win(f.t, t0, 0.4, 'easeOut'), kc = win(f.t, t0 + 0.25, 0.3, 'backOut');
      if (k <= 0) return;
      const y = y0 + i * lh;
      ctx.save(); ctx.globalAlpha *= k; ctx.translate((1 - k) * 40, 0);
      ctx.strokeStyle = S(p, 'accent'); ctx.lineWidth = size * 0.08; roundRect(ctx, x, y - size * 0.4, size * 0.8, size * 0.8, size * 0.18); ctx.stroke();
      if (kc > 0) {
        ctx.fillStyle = S(p, 'accent'); ctx.save(); ctx.translate(x + size * 0.4, y); ctx.scale(kc, kc);
        roundRect(ctx, -size * 0.4, -size * 0.4, size * 0.8, size * 0.8, size * 0.18); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 0.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-size * 0.2, 0); ctx.lineTo(-size * 0.05, size * 0.16); ctx.lineTo(size * 0.22, -size * 0.17); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = S(p, 'color'); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(it, x + size * 1.3, y);
      ctx.restore();
    });
    ctx.restore();
  },
};

const flash: ComponentDef = {
  key: 'flash', label: 'Flash / color matte', category: 'Transition', defaultDuration: 0.6,
  description: 'Full-screen color that flashes in and out (white flash, dip to black, color matte).',
  props: [color('color', 'Color', '#ffffff'), num('peak', 'Peak at (0–1)', 0.3, 0, 1, 0.01, G.anim, false), num('maxOpacity', 'Max opacity', 1, 0, 1, 0.01)],
  draw(ctx, p, f) {
    const k = f.t / f.duration, pk = N(p, 'peak');
    const a = k < pk ? ease('easeOut', k / Math.max(0.001, pk)) : 1 - ease('easeIn', (k - pk) / Math.max(0.001, 1 - pk));
    ctx.save(); ctx.globalAlpha *= a * N(p, 'maxOpacity'); ctx.fillStyle = S(p, 'color'); ctx.fillRect(0, 0, f.width, f.height); ctx.restore();
  },
};

const image3d: ComponentDef = {
  key: 'logoReveal', label: 'Logo / word reveal', category: 'Text', defaultDuration: 3,
  description: 'Word mark reveal for intros and end cards, with a glow and tagline. Styles: sweep (light sweep), glitch (RGB split), split (halves slide together), stroke (outline draws on, then fills), blur (focus pull + tracking), stack (echo copies collapse into one), typeOn (letters type with a caret).',
  props: [
    text('text', 'Word mark', 'cutroom'), select('style', 'Style', 'sweep', ['sweep', 'glitch', 'split', 'stroke', 'blur', 'stack', 'typeOn'], G.content),
    font('font', 'Space Grotesk'), num('size', 'Size', 180, 8, 800), num('weight', 'Weight', 700, 100, 900, 100),
    color('color', 'Color', '#ffffff'), color('glow', 'Glow', '#4f8cff'), text('tagline', 'Tagline', 'edit with Claude'), ...animProps('scaleDown', 'fade', 0.9, 0.5),
  ],
  draw(ctx, p, f) {
    const cx = f.width / 2, cy = f.height / 2, size = N(p, 'size'), st = S(p, 'style') || 'sweep', word = S(p, 'text');
    const col = S(p, 'color'), glow = S(p, 'glow'), t = f.t;
    ctx.save(); applyEnvelope(ctx, st === 'sweep' ? p : { ...p, animIn: st === 'blur' ? 'fade' : 'none' }, f, cx, cy);
    ctx.font = `${N(p, 'weight')} ${size}px "${S(p, 'font')}"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(word).width;
    const glowAmt = 0.6 + 0.4 * Math.sin(t * 2);
    const fillWord = (x = cx, y = cy, c = col, blur = size * 0.4 * glowAmt) => { ctx.shadowColor = glow; ctx.shadowBlur = blur; ctx.fillStyle = c; ctx.fillText(word, x, y); ctx.shadowBlur = 0; };
    if (st === 'sweep') {
      fillWord();
      const sweep = win(t, 0.3, 1.1, 'easeInOut');
      if (sweep > 0 && sweep < 1) {
        ctx.save(); ctx.globalCompositeOperation = 'source-atop';
        const sx = cx - tw / 2 - size + sweep * (tw + size * 2);
        const g = ctx.createLinearGradient(sx - size * 0.5, 0, sx + size * 0.5, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(cx - tw, cy - size, tw * 2, size * 2); ctx.restore();
      }
    } else if (st === 'glitch') {
      const k = win(t, 0, 0.9, 'linear'), r = rng(mix(f.seed + Math.floor(t * 24) * 7919)), amt = (1 - k) * size * 0.12 + size * 0.012 * (r() < 0.06 ? 3 : 0);
      if (k > 0.02 || r() > 0.5) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= 0.85; ctx.fillStyle = '#ff2a6d'; ctx.fillText(word, cx - amt + (r() - 0.5) * amt, cy + (r() - 0.5) * amt * 0.4);
        ctx.fillStyle = '#05d9e8'; ctx.fillText(word, cx + amt + (r() - 0.5) * amt, cy - (r() - 0.5) * amt * 0.4);
        ctx.restore();
        if (k < 1) for (let i = 0; i < 4; i++) { const sy = cy - size / 2 + r() * size, sh = size * 0.08 * r(); ctx.save(); ctx.beginPath(); ctx.rect(cx - tw, sy, tw * 2, sh); ctx.clip(); ctx.fillStyle = col; ctx.fillText(word, cx + (r() - 0.5) * size * 0.5 * (1 - k), cy); ctx.restore(); }
        fillWord(cx, cy, col, size * 0.3 * k);
      }
    } else if (st === 'split') {
      const k = ease('expoOut', win(t, 0, 0.9, 'linear')), off = (1 - k) * (tw * 0.6 + size);
      for (const [top, dir] of [[true, -1], [false, 1]] as const) {
        ctx.save(); ctx.beginPath(); ctx.rect(cx - tw, top ? cy - size : cy, tw * 2, size); ctx.clip();
        ctx.globalAlpha *= clamp(k * 2); fillWord(cx + dir * off, cy, col, k > 0.95 ? size * 0.4 * glowAmt : 0); ctx.restore();
      }
      const lk = win(t, 0.6, 0.5, 'expoOut') * (1 - win(t, 1.1, 0.4, 'easeIn'));
      ctx.fillStyle = glow; ctx.fillRect(cx - tw * 0.55 * lk, cy - 1.5, tw * 1.1 * lk, 3);
    } else if (st === 'stroke') {
      const per = tw * 4 + size * 6, k = win(t, 0, 1.2, 'easeInOut'), kf = win(t, 1.0, 0.5, 'easeOut');
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, size * 0.012); ctx.setLineDash([per * k, per]); ctx.strokeText(word, cx, cy); ctx.restore();
      if (kf > 0) { ctx.save(); ctx.globalAlpha *= kf; fillWord(); ctx.restore(); }
    } else if (st === 'blur') {
      const k = ease('expoOut', win(t, 0, 1.2, 'linear'));
      const c = ctx as unknown as { letterSpacing?: string };
      if ('letterSpacing' in c) c.letterSpacing = `${(1 - k) * size * 0.4}px`;
      ctx.filter = k < 1 ? `blur(${((1 - k) * 30).toFixed(1)}px)` : 'none'; ctx.globalAlpha *= clamp(k * 1.5);
      fillWord(); ctx.filter = 'none';
      if ('letterSpacing' in c) c.letterSpacing = '0px';
    } else if (st === 'stack') {
      const k = ease('quintOut', win(t, 0, 1.1, 'linear'));
      for (let i = 3; i >= 1; i--) for (const d of [-1, 1]) {
        ctx.save(); ctx.globalAlpha *= (1 - k) * (0.6 - i * 0.12) + 0.001; ctx.strokeStyle = glow; ctx.lineWidth = Math.max(1, size * 0.01);
        ctx.strokeText(word, cx, cy + d * i * size * 0.9 * (1 - k)); ctx.restore();
      }
      ctx.save(); ctx.globalAlpha *= clamp(k * 1.4); fillWord(); ctx.restore();
    } else if (st === 'typeOn') {
      const chars = Array.from(word), n = Math.floor(clamp(t / 0.9) * chars.length), shown = chars.slice(0, n).join('');
      ctx.textAlign = 'left'; const x0 = cx - tw / 2;
      fillWord(x0, cy, col, n === chars.length ? size * 0.4 * glowAmt : 0);
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillRect(x0 + ctx.measureText(shown).width, cy - size, tw + size, size * 2); ctx.restore();
      if (t < 1.8 && Math.floor(t * 2.4) % 2 === 0) { ctx.fillStyle = glow; ctx.fillRect(x0 + ctx.measureText(shown).width + size * 0.04, cy - size * 0.42, size * 0.06, size * 0.84); }
      ctx.textAlign = 'center';
    }
    if (S(p, 'tagline')) {
      const k = win(t, st === 'stroke' || st === 'typeOn' ? 1.1 : 0.8, 0.6, 'easeOut');
      ctx.globalAlpha *= k; ctx.font = `400 ${size * 0.2}px "Inter"`; ctx.fillStyle = withAlpha(col, 0.7); ctx.textAlign = 'center';
      const c = ctx as unknown as { letterSpacing?: string }; if ('letterSpacing' in c) c.letterSpacing = '0px';
      ctx.fillText(S(p, 'tagline'), cx, cy + size * 0.75 + (1 - k) * 20);
    }
    ctx.restore();
  },
};

export const COMPONENTS: Record<string, ComponentDef> = Object.fromEntries(
  [textComp, title, lowerThird, captions, checklist, image3d, codeTyping, terminal, cursor, browserFrame, callout, counter, barChart, progressBar, shape, background, confetti, stripeWipe, flash, ...MORE_COMPONENTS]
    .map((c) => [c.key, c]),
);

export function componentSeed(clipId: string) { return hash(clipId); }
