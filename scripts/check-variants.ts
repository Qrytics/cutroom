// Text-only smoke test for every animation / transition / motion / style value: renders each one at a few moments
// in headless Chromium and reports draw errors and variants that never put anything on screen.
//   npx tsx scripts/check-variants.ts
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');

const entry = `
import { ANIM_IN, ANIM_OUT, COMPONENTS, DEFAULT_META, drawFrame, MOTIONS, TRANSITIONS } from './packages/core/src/index.ts';
import { TEXT_LOOPS } from './packages/core/src/components/draw.ts';
window.runAll = () => {
  const W = 960, H = 540;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const out = [];
  const ink = () => { const d = ctx.getImageData(0, 0, W, H).data; let n = 0, m = 0; for (let i = 0; i < d.length; i += 4 * 53) { m++; if (Math.abs(d[i] - 20) + Math.abs(d[i + 1] - 24) + Math.abs(d[i + 2] - 33) > 24) n++; } return n / m; };
  const run = (label, component, props, dur, times) => {
    const p = { id: 'x', meta: { ...DEFAULT_META, width: W, height: H, background: '#141821' }, media: {}, markers: {}, lock: null, log: [],
      tracks: { t: { id: 't', name: 'V1', kind: 'visual', order: 0, muted: false, hidden: false, locked: false } },
      clips: { c: { id: 'c' + label, trackId: 't', type: 'component', component, name: '', start: 0, duration: dur, inPoint: 0, speed: 1, props, keyframes: {} } } };
    const errs = []; const inks = [];
    const orig = console.error; console.error = (...a) => errs.push(a.map(String).join(' '));
    for (const t of times) { try { drawFrame(ctx, p, t, { visual: () => null }); inks.push(ink()); } catch (e) { errs.push(String(e && e.stack || e)); } }
    console.error = orig;
    out.push({ label, errs, inks });
  };
  const T = [0.05, 0.2, 0.5, 1.5, 3.8, 3.95];
  for (const a of ANIM_IN) { run('text in ' + a, 'text', { text: 'Hello motion world', animIn: a, animOut: 'none' }, 4, T); run('title in ' + a, 'title', { animIn: a }, 4, T); run('shape in ' + a, 'shape', { animIn: a }, 4, T); }
  for (const a of ANIM_OUT) { run('text out ' + a, 'text', { text: 'Hello motion world', animIn: 'none', animOut: a, outDur: 0.6 }, 4, [3.5, 3.7, 3.9]); run('shape out ' + a, 'shape', { animIn: 'none', animOut: a, outDur: 0.6 }, 4, [3.5, 3.7]); }
  for (const l of TEXT_LOOPS) { run('text loop ' + l, 'text', { text: 'Loop me', loop: l }, 4, [1, 2, 3]); run('shape loop ' + l, 'shape', { loop: l }, 4, [1, 2]); }
  for (const tr of TRANSITIONS) { run('transition ' + tr, 'shape', { transitionIn: tr, transitionOut: tr, animIn: 'none', transitionInDuration: 0.6, transitionOutDuration: 0.6 }, 4, [0.1, 0.3, 0.55, 2, 3.5, 3.8]); }
  for (const m of MOTIONS) run('motion ' + m, 'shape', { motion: m, animIn: 'none' }, 4, [0.5, 1.3, 2.9]);
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
type Row = { label: string; errs: string[]; inks: number[] };
const rows = await page.evaluate(() => (window as never as { runAll(): Row[] }).runAll());
await browser.close();
let bad = 0;
for (const r of rows) {
  const blank = r.inks.every((x) => x < 0.001), moved = Math.max(...r.inks) - Math.min(...r.inks);
  const flag = r.errs.length ? `ERROR ${r.errs[0].slice(0, 160)}` : blank ? 'BLANK' : '';
  if (flag) bad++;
  if (flag || process.argv.includes('-v')) console.log(`${r.label.padEnd(30)} ink ${r.inks.map((x) => (x * 100).toFixed(1).padStart(5)).join(' ')}  Δ${(moved * 100).toFixed(1)}  ${flag}`);
}
console.log(`${rows.length} variants checked, ${bad} flagged`);
