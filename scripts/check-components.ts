// Visual smoke test: render every motion-graphics component at a few moments into one contact sheet.
//   npx tsx scripts/check-components.ts  →  data/check/components.png
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'data', 'check');
fs.mkdirSync(OUT, { recursive: true });

const entry = `
import { COMPONENTS, DEFAULT_META, drawFrame } from './packages/core/src/index.ts';
window.renderAll = (fractions) => {
  const keys = Object.keys(COMPONENTS);
  const W = 1920, H = 1080, tw = 384, th = 216;
  const sheet = document.createElement('canvas');
  sheet.width = tw * fractions.length; sheet.height = (th + 22) * keys.length;
  const s = sheet.getContext('2d');
  s.fillStyle = '#222'; s.fillRect(0, 0, sheet.width, sheet.height);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const errors = [];
  const stats = [];
  const bg = [0x14, 0x18, 0x21];
  // Fraction of pixels that differ from the background, plus a coarse fingerprint to detect motion between moments.
  const measure = () => {
    const d = ctx.getImageData(0, 0, W, H).data;
    let ink = 0; const fp = [];
    for (let i = 0; i < d.length; i += 4 * 97) {
      const diff = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
      if (diff > 24) ink++;
      fp.push(d[i] + d[i + 1] + d[i + 2]);
    }
    return { ink: ink / fp.length, fp };
  };
  keys.forEach((k, row) => {
    const shots = [];
    const def = COMPONENTS[k];
    const p = { id: 'x', meta: { ...DEFAULT_META, background: '#141821' }, media: {}, markers: {}, lock: null, log: [],
      tracks: { t: { id: 't', name: 'V1', kind: 'visual', order: 0, muted: false, hidden: false, locked: false } },
      clips: { c: { id: 'c' + k, trackId: 't', type: 'component', component: k, name: '', start: 0, duration: def.defaultDuration, inPoint: 0, speed: 1, props: {}, keyframes: {} } } };
    fractions.forEach((f, col) => {
      const orig = console.error; console.error = (...a) => errors.push(k + ': ' + a.join(' '));
      drawFrame(ctx, p, def.defaultDuration * f, { visual: () => null });
      console.error = orig;
      shots.push(measure());
      s.drawImage(c, col * tw, row * (th + 22) + 22, tw, th);
    });
    let moved = 0;
    for (let i = 1; i < shots.length; i++) {
      let n = 0; shots[i].fp.forEach((v, j) => { if (Math.abs(v - shots[i - 1].fp[j]) > 24) n++; });
      moved = Math.max(moved, n / shots[i].fp.length);
    }
    stats.push({ k, ink: shots.map((x) => x.ink), moved });
    s.fillStyle = '#fff'; s.font = '600 15px sans-serif'; s.fillText(k + '  (' + fractions.map((f) => (def.defaultDuration * f).toFixed(1) + 's').join(' · ') + ')', 6, row * (th + 22) + 16);
  });
  return { png: sheet.toDataURL('image/png'), errors, stats };
};`;

const res = await build({ stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' }, bundle: true, format: 'iife', write: false, platform: 'browser' });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: res.outputFiles[0].text });
const fractions = (process.argv[2] || '0.1,0.35,0.6,0.95').split(',').map(Number);
type Stat = { k: string; ink: number[]; moved: number };
const { png, errors, stats } = await page.evaluate(
  (f) => (window as never as { renderAll(f: number[]): { png: string; errors: string[]; stats: Stat[] } }).renderAll(f),
  fractions,
);
fs.writeFileSync(path.join(OUT, 'components.png'), Buffer.from(png.split(',')[1], 'base64'));
await browser.close();
// Text report so the sheet can be judged without viewing it: ink = share of frame drawn at each moment, moved = max change between moments.
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);
for (const st of stats) {
  const flags = [st.ink.every((x) => x < 0.002) && 'BLANK', st.moved < 0.001 && 'STATIC'].filter(Boolean).join(' ');
  console.log(`${st.k.padEnd(18)} ink ${st.ink.map(pct).join(' ')}   moved ${pct(st.moved)}  ${flags}`);
}
console.log(`${path.join(OUT, 'components.png')}${errors.length ? `\nerrors:\n${errors.join('\n')}` : '\nno draw errors'}`);
