// Text-only smoke test for every animation / transition / motion / style value: renders each one at a few moments
// in headless Chromium and reports draw errors and variants that never put anything on screen.
//   npx tsx scripts/check-variants.ts
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');

const entry = `
import { ANIM_IN, ANIM_OUT, COMPONENTS, DEFAULT_META, drawFrame, EMPHASES, MOTIONS, TRANSITIONS } from './packages/core/src/index.ts';
import { TEXT_LOOPS } from './packages/core/src/components/draw.ts';
window.runAll = () => {
  const W = 960, H = 540;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const out = [];
  const ink = () => { const d = ctx.getImageData(0, 0, W, H).data; let n = 0, m = 0; for (let i = 0; i < d.length; i += 4 * 53) { m++; if (Math.abs(d[i] - 20) + Math.abs(d[i + 1] - 24) + Math.abs(d[i + 2] - 33) > 24) n++; } return n / m; };
  const fingerprint = () => { const d = ctx.getImageData(0, 0, W, H).data; const f = []; for (let i = 0; i < d.length; i += 4 * 29) f.push(d[i] + d[i + 1] + d[i + 2]); return f; };
  const run = (label, component, props, dur, times) => {
    const p = { id: 'x', meta: { ...DEFAULT_META, width: W, height: H, background: '#141821' }, media: {}, markers: {}, lock: null, log: [],
      tracks: { t: { id: 't', name: 'V1', kind: 'visual', order: 0, muted: false, hidden: false, locked: false } },
      clips: { c: { id: 'c' + label, trackId: 't', type: 'component', component, name: '', start: 0, duration: dur, inPoint: 0, speed: 1, props, keyframes: {} } } };
    const errs = []; const inks = []; const fps = [];
    const orig = console.error; console.error = (...a) => errs.push(a.map(String).join(' '));
    for (const t of times) { try { drawFrame(ctx, p, t, { visual: () => null }); inks.push(ink()); fps.push(fingerprint()); } catch (e) { errs.push(String(e && e.stack || e)); } }
    console.error = orig;
    // largest share of pixels that changed between consecutive samples — catches pure moves that keep the same ink
    let moved = 0;
    for (let i = 1; i < fps.length; i++) { let n = 0; for (let j = 0; j < fps[i].length; j++) if (Math.abs(fps[i][j] - fps[i - 1][j]) > 24) n++; moved = Math.max(moved, n / fps[i].length); }
    out.push({ label, errs, inks, moved });
  };
  const T = [0.05, 0.2, 0.5, 1.5, 3.8, 3.95];
  for (const a of ANIM_IN) { run('text in ' + a, 'text', { text: 'Hello motion world', animIn: a, animOut: 'none' }, 4, T); run('title in ' + a, 'title', { animIn: a }, 4, T); run('shape in ' + a, 'shape', { animIn: a }, 4, T); }
  for (const a of ANIM_OUT) { run('text out ' + a, 'text', { text: 'Hello motion world', animIn: 'none', animOut: a, outDur: 0.6 }, 4, [3.5, 3.7, 3.9]); run('shape out ' + a, 'shape', { animIn: 'none', animOut: a, outDur: 0.6 }, 4, [3.5, 3.7]); }
  const LT = Array.from({ length: 24 }, (_, i) => 1 + i * 0.113);
  for (const l of TEXT_LOOPS) { run('text loop ' + l, 'text', { text: 'Loop me', loop: l, loopAmount: 2 }, 4, LT); if (!['shimmer', 'glow'].includes(l)) run('shape loop ' + l, 'shape', { loop: l, loopAmount: 2 }, 4, LT); }
  for (const tr of TRANSITIONS) { run('transition ' + tr, 'shape', { transitionIn: tr, transitionOut: tr, animIn: 'none', transitionInDuration: 0.6, transitionOutDuration: 0.6 }, 4, [0.1, 0.3, 0.55, 2, 3.5, 3.8]); }
  for (const m of MOTIONS) run('motion ' + m, 'shape', { motion: m, motionAmount: 2, animIn: 'none' }, 4, Array.from({ length: 16 }, (_, i) => 0.5 + i * 0.137));
  for (const em of EMPHASES) { run('emphasis ' + em, 'shape', { emphasis: em, emphasisAt: 0.5, emphasisDuration: 0.8, emphasisRepeat: 2, animIn: 'none' }, 4, [0.3, 0.6, 0.9, 1.25, 1.9, 3]);
    run('emphasis text ' + em, 'text', { text: 'Look here', emphasis: em, emphasisRepeat: 0, animIn: 'none', animOut: 'none' }, 4, [0.83, 1.07, 1.41, 2.31]); }
  for (const ez of ['linear', 'backOut', 'bounceOut', 'spring']) run('transition ease ' + ez, 'shape', { transitionIn: 'zoomPunch', transitionInEase: ez, transitionOut: 'pushLeft', transitionOutEase: ez, animIn: 'none' }, 4, [0.1, 0.3, 3.7]);
  for (const a of ANIM_IN) run('multiline in ' + a, 'text', { text: 'First line here\\nSecond line', animIn: a, animOut: 'none', inDur: 0.8 }, 4, [0.1, 0.4, 1.6]);
  for (const a of ANIM_OUT) run('multiline out ' + a, 'text', { text: 'First line here\\nSecond line', animIn: 'none', animOut: a, outDur: 0.8 }, 4, [3.3, 3.6, 3.85]);
  const opts = (comp, key) => COMPONENTS[comp].props.find((d) => d.key === key).options;
  for (const v of opts('title', 'layout')) run('title layout ' + v, 'title', { layout: v, kicker: 'New' }, 4, [0.3, 1.5, 3]);
  for (const v of opts('lowerThird', 'variant')) run('lowerThird ' + v, 'lowerThird', { variant: v }, 5, [0.3, 1.5, 4]);
  for (const v of opts('captions', 'style')) run('captions ' + v, 'captions', { style: v }, 6, [0.5, 2, 4.5]);
  for (const v of opts('logoReveal', 'style')) run('logoReveal ' + v, 'logoReveal', { style: v }, 3, [0.2, 0.6, 1.5, 2.5]);
  for (const v of opts('background', 'style')) run('background ' + v, 'background', { style: v }, 10, [0.5, 3, 7]);
  for (const v of opts('shape', 'shape')) run('shape ' + v, 'shape', { shape: v, strokeWidth: 4 }, 4, [0.2, 1, 2]);
  for (const v of opts('confetti', 'style')) run('confetti ' + v, 'confetti', { style: v }, 3, [0.3, 1, 2]);
  return out;
};`;

const res = await build({ stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' }, bundle: true, format: 'iife', write: false, platform: 'browser' });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: res.outputFiles[0].text });
type Row = { label: string; errs: string[]; inks: number[]; moved: number };
const rows = await page.evaluate(() => (window as never as { runAll(): Row[] }).runAll());
await browser.close();
let bad = 0;
for (const r of rows) {
  const blank = r.inks.every((x) => x < 0.001), dInk = Math.max(...r.inks) - Math.min(...r.inks);
  // things that are supposed to animate: every non-"none" anim / loop / transition / motion / emphasis value
  const animated = /^(text|title|shape|multiline) (in|out|loop) |^(transition|motion|emphasis)/.test(r.label) && !/ none$/.test(r.label);
  const flag = r.errs.length ? `ERROR ${r.errs[0].slice(0, 160)}` : blank ? 'BLANK' : animated && r.moved < 0.0005 ? 'STATIC' : '';
  if (flag) bad++;
  if (flag || process.argv.includes('-v')) console.log(`${r.label.padEnd(30)} ink ${r.inks.map((x) => (x * 100).toFixed(1).padStart(5)).join(' ')}  Δink ${(dInk * 100).toFixed(1)}  moved ${(r.moved * 100).toFixed(1)}%  ${flag}`);
}
console.log(`${rows.length} variants checked, ${bad} flagged`);
