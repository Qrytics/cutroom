// Headless stage used by the server for exports and Claude's frame screenshots.
import { drawFrame, type Project } from '@cutroom/core';
import { loadFonts } from './fonts.ts';
import { renderMix } from './lib/audio.ts';
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
};

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
