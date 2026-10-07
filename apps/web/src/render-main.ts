// Headless stage used by the server for exports and Claude's frame screenshots.
import { drawFrame, visibleLayers, type Project } from '@cutroom/core';
import { loadFonts } from './fonts.ts';
import { mixStats, renderMix } from './lib/audio.ts';
import { MediaPool } from './lib/sources.ts';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
const pool = new MediaPool();
let project: Project | null = null;
let scale = 1;

const api = {
  async load(p: Project, s = 1) {
    project = p; scale = s;
    canvas.width = Math.round(p.meta.width * s);
    canvas.height = Math.round(p.meta.height * s);
    await loadFonts();
  },
  async seek(t: number) {
    if (!project) throw new Error('no project loaded');
    await pool.prepare(project, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.scale(scale, scale);
    // drawFrame resets the transform internally, so scale through a wrapper context
    drawScaled(t);
    ctx.restore();
  },
  renderAudio(from: number, to: number) {
    if (!project) throw new Error('no project loaded');
    return renderMix(project, from, to);
  },
  audioStats(from: number, to: number) {
    if (!project) throw new Error('no project loaded');
    return mixStats(project, from, to);
  },
  /** Text-only frame analysis: per-layer pixel bounds, coverage and backdrop contrast (no images leave the page). */
  async inspect(times: number[]) {
    if (!project) throw new Error('no project loaded');
    const out = [];
    for (const t of times) { await pool.prepare(project, t); out.push(inspectFrame(project, t)); }
    return out;
  },
};

// ---------------------------------------------------------------- inspection
const IW = 480;
const iso = document.createElement('canvas'), isoCtx = iso.getContext('2d', { willReadFrequently: true })!;
const small = document.createElement('canvas'), smallCtx = small.getContext('2d', { willReadFrequently: true })!;

/** Draw `clips` of the project at t (optionally on a transparent background) and return downsampled RGBA. */
function drawSubset(p: Project, t: number, clips: Project['clips'], transparent: boolean) {
  if (iso.width !== p.meta.width || iso.height !== p.meta.height) { iso.width = p.meta.width; iso.height = p.meta.height; }
  const sh = Math.round(IW * p.meta.height / p.meta.width);
  if (small.width !== IW || small.height !== sh) { small.width = IW; small.height = sh; }
  isoCtx.setTransform(1, 0, 0, 1, 0, 0); isoCtx.clearRect(0, 0, iso.width, iso.height);
  drawFrame(isoCtx, { ...p, clips, meta: transparent ? { ...p.meta, background: 'rgba(0,0,0,0)' } : p.meta }, t, pool);
  smallCtx.clearRect(0, 0, IW, sh); smallCtx.drawImage(iso, 0, 0, IW, sh);
  return smallCtx.getImageData(0, 0, IW, sh).data;
}

const lum = (r: number, g: number, b: number) => {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

function inspectFrame(p: Project, t: number) {
  const layers = visibleLayers(p, t);
  const k = p.meta.width / IW, sh = Math.round(IW * p.meta.height / p.meta.width);
  const full = drawSubset(p, t, Object.fromEntries(layers.map((l) => [l.clip.id, l.clip])), false);
  let s = 0, s2 = 0;
  for (let i = 0; i < full.length; i += 4) { const l = 0.2126 * full[i] + 0.7152 * full[i + 1] + 0.0722 * full[i + 2]; s += l; s2 += l * l; }
  const n = full.length / 4, mean = s / n;
  const res = layers.map((L, i) => {
    const px = drawSubset(p, t, { [L.clip.id]: L.clip }, true);
    let x0 = IW, y0 = sh, x1 = -1, y1 = -1, cov = 0, r = 0, g = 0, b = 0, wsum = 0;
    for (let y = 0; y < sh; y++) for (let x = 0; x < IW; x++) {
      const j = (y * IW + x) * 4, a = px[j + 3];
      if (a > 24) { cov++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (a > 160) { r += px[j] * a; g += px[j + 1] * a; b += px[j + 2] * a; wsum += a; }
    }
    const layer = {
      id: L.clip.id, name: L.clip.name, kind: L.clip.type === 'component' ? L.clip.component : L.clip.type, localT: +L.localT.toFixed(2),
      coverage: +(cov / n).toFixed(4), bbox: x1 < 0 ? null : [Math.round(x0 * k), Math.round(y0 * k), Math.round((x1 + 1) * k), Math.round((y1 + 1) * k)],
      color: wsum ? [Math.round(r / wsum), Math.round(g / wsum), Math.round(b / wsum)] : null, backdrop: null as number | null, contrast: null as number | null,
    };
    // what this layer sits on: everything below it, sampled under its own solid pixels
    if (wsum && L.clip.type === 'component') {
      const below = drawSubset(p, t, Object.fromEntries(layers.slice(0, i).map((l) => [l.clip.id, l.clip])), false);
      let bl = 0, bc = 0;
      const own: number[] = [];
      for (let j = 0; j < px.length; j += 4) if (px[j + 3] > 160) { bl += lum(below[j], below[j + 1], below[j + 2]); bc++; own.push(lum(px[j], px[j + 1], px[j + 2])); }
      // outlined/two-tone text reads by whichever tone stands out — score its darkest and lightest parts, keep the better
      own.sort((a, b) => a - b);
      const lo = own[Math.floor(own.length * 0.15)], hi = own[Math.floor(own.length * 0.85)], bg = bl / bc;
      const ratio = (f: number) => (Math.max(f, bg) + 0.05) / (Math.min(f, bg) + 0.05);
      layer.backdrop = +bg.toFixed(3);
      layer.contrast = +Math.max(ratio(lo), ratio(hi)).toFixed(2);
    }
    return layer;
  });
  return { t, luma: +mean.toFixed(1), std: +Math.sqrt(Math.max(0, s2 / n - mean * mean)).toFixed(1), layers: res };
}

const full = document.createElement('canvas');
const fctx = full.getContext('2d', { alpha: false })!;
function drawScaled(t: number) {
  const p = project!;
  if (scale === 1) { drawFrame(ctx, p, t, pool); return; }
  if (full.width !== p.meta.width || full.height !== p.meta.height) { full.width = p.meta.width; full.height = p.meta.height; }
  drawFrame(fctx, p, t, pool);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
}

(window as unknown as { __cutroom: typeof api }).__cutroom = api;
