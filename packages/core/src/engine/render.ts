// Canvas compositor. drawFrame(project, t) is the only drawing path — the editor preview,
// Claude's frame screenshots and the final export all call it.
import { COMPONENTS, componentSeed, type Ctx } from '../components/index.ts';
import { roundRect } from '../components/draw.ts';
import type { Clip, Media, Project, Props } from '../schema/types.ts';
import { motionState, transitionState, type TransitionState, visibleLayers } from './evaluate.ts';

export interface SourceProvider {
  /** a decoded frame for a video/image clip at its current source time, or null if not ready */
  visual(clip: Clip, media: Media): CanvasImageSource | null;
}

export interface DrawOptions {
  /** highlight these clip ids with an outline (editor only) */
  outline?: string[];
  outlineColor?: string;
}

const num = (p: Props, k: string, d = 0) => { const v = Number(p[k]); return Number.isFinite(v) ? v : d; };

function sourceSize(src: CanvasImageSource): [number, number] {
  const s = src as { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; width?: number | { baseVal: { value: number } }; height?: number | { baseVal: { value: number } } };
  if (s.videoWidth) return [s.videoWidth, s.videoHeight!];
  if (s.naturalWidth) return [s.naturalWidth, s.naturalHeight!];
  return [Number(s.width) || 1, Number(s.height) || 1];
}

/** Destination rect of media fitted into the W×H canvas box. */
export function fitRect(fit: string, sw: number, sh: number, W: number, H: number) {
  if (fit === 'fill') return { x: 0, y: 0, w: W, h: H };
  if (fit === 'none') return { x: (W - sw) / 2, y: (H - sh) / 2, w: sw, h: sh };
  const s = fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  return { x: (W - sw * s) / 2, y: (H - sh * s) / 2, w: sw * s, h: sh * s };
}

function filterString(p: Props, extraBlur: number) {
  const f: string[] = [];
  const blur = num(p, 'blur') + extraBlur;
  if (blur > 0.1) f.push(`blur(${blur.toFixed(2)}px)`);
  if (num(p, 'brightness', 1) !== 1) f.push(`brightness(${num(p, 'brightness', 1)})`);
  if (num(p, 'contrast', 1) !== 1) f.push(`contrast(${num(p, 'contrast', 1)})`);
  if (num(p, 'saturate', 1) !== 1) f.push(`saturate(${num(p, 'saturate', 1)})`);
  if (num(p, 'hue')) f.push(`hue-rotate(${num(p, 'hue')}deg)`);
  if (num(p, 'grayscale')) f.push(`grayscale(${num(p, 'grayscale')})`);
  if (num(p, 'sepia')) f.push(`sepia(${num(p, 'sepia')})`);
  if (num(p, 'invert')) f.push(`invert(${num(p, 'invert')})`);
  if (num(p, 'shadow')) { const s = num(p, 'shadow'); f.push(`drop-shadow(0px ${(s / 3).toFixed(1)}px ${s.toFixed(1)}px rgba(0,0,0,0.55))`); }
  return f.length ? f.join(' ') : 'none';
}

/** The local→canvas transform for a layer (also used by the editor for hit-testing and handles). */
export function layerMatrix(p: Props, W: number, H: number, tr: Pick<TransitionState, 'dx' | 'dy' | 'scale' | 'rotate'> & Partial<TransitionState> = { dx: 0, dy: 0, scale: 1, rotate: 0 }) {
  const m = new DOMMatrix();
  m.translateSelf(num(p, 'x', W / 2) + tr.dx * W, num(p, 'y', H / 2) + tr.dy * H);
  if (tr.swing) { const s0 = num(p, 'scale', 1) * num(p, 'scaleY', 1); m.translateSelf(0, -H / 2 * s0); m.rotateSelf(tr.swing); m.translateSelf(0, H / 2 * s0); }
  m.rotateSelf(num(p, 'rotation') + tr.rotate);
  const s = num(p, 'scale', 1) * tr.scale;
  m.scaleSelf(s * num(p, 'scaleX', 1) * (tr.sx ?? 1), s * num(p, 'scaleY', 1) * (tr.sy ?? 1));
  m.translateSelf(-num(p, 'anchorX', 0.5) * W, -num(p, 'anchorY', 0.5) * H);
  return m;
}

/** Content bounds in layer-local coordinates (before transform). */
export function contentRect(clip: Clip, p: Props, project: Project, src?: CanvasImageSource | null) {
  const W = project.meta.width, H = project.meta.height;
  if (clip.type === 'video' || clip.type === 'image') {
    const m = project.media[clip.mediaId ?? ''];
    const [sw, sh] = src ? sourceSize(src) : [m?.width || W, m?.height || H];
    return fitRect(String(p.fit ?? 'contain'), sw, sh, W, H);
  }
  return { x: 0, y: 0, w: W, h: H };
}

/** Path for the shaped reveal masks (iris circle, venetian blinds, slanted wipe). */
function shapeMask(ctx: Ctx, kind: string, k: number, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  if (kind === 'iris') ctx.arc(x + w / 2, y + h / 2, Math.max(0, k) * Math.hypot(w, h) / 2, 0, Math.PI * 2);
  else if (kind === 'blinds') { const n = 8, bh = h / n; for (let i = 0; i < n; i++) ctx.rect(x, y + i * bh + bh * (1 - k) / 2, w, bh * k); }
  else { const sl = h * 0.4, e = x - sl + k * (w + sl * 2); ctx.moveTo(x, y); ctx.lineTo(e + sl, y); ctx.lineTo(e - sl, y + h); ctx.lineTo(x, y + h); ctx.closePath(); }
}

export function drawFrame(ctx: Ctx, project: Project, t: number, sources: SourceProvider, opts: DrawOptions = {}) {
  const W = project.meta.width, H = project.meta.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = project.meta.background || '#000';
  ctx.fillRect(0, 0, W, H);
  const outlines: { m: DOMMatrix; r: { x: number; y: number; w: number; h: number } }[] = [];
  for (const L of visibleLayers(project, t)) {
    const { clip, props: p, localT } = L;
    const seed = componentSeed(clip.id);
    const tr = transitionState(p, localT, clip.duration, seed);
    const mo = motionState(p, localT, seed, W);
    if (mo.dx || mo.dy || mo.rot || mo.scale !== 1) { tr.dx += mo.dx / W; tr.dy += mo.dy / H; tr.rotate += mo.rot; tr.scale *= mo.scale; }
    const alpha = num(p, 'opacity', 1) * tr.alpha * mo.alpha;
    if (alpha <= 0.001) continue;
    let src: CanvasImageSource | null = null;
    if (clip.type === 'video' || clip.type === 'image') {
      const media = project.media[clip.mediaId ?? ''];
      if (!media) continue;
      src = sources.visual(clip, media);
      if (!src) continue;
    }
    const m = layerMatrix(p, W, H, tr);
    const r = contentRect(clip, p, project, src);
    ctx.save();
    ctx.setTransform(m);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = String(p.blend || 'source-over') as GlobalCompositeOperation;
    ctx.filter = filterString(p, tr.blur);
    // crop / rounded corners / wipe → clip path in local space
    const cl = num(p, 'cropLeft'), cr = num(p, 'cropRight'), ct = num(p, 'cropTop'), cb = num(p, 'cropBottom'), rad = num(p, 'cornerRadius');
    let cx = r.x + r.w * cl, cy = r.y + r.h * ct, cw = r.w * (1 - cl - cr), ch = r.h * (1 - ct - cb);
    const mk = tr.mask;
    if (mk?.kind === 'wipeLeft') cw *= mk.k;
    else if (mk?.kind === 'wipeRight') { cx += cw * (1 - mk.k); cw *= mk.k; }
    else if (mk?.kind === 'wipeDown') ch *= mk.k;
    else if (mk?.kind === 'wipeUp') { cy += ch * (1 - mk.k); ch *= mk.k; }
    else if (mk?.kind === 'split') { cx += cw * (1 - mk.k) / 2; cw *= mk.k; }
    if (cl || cr || ct || cb || rad || mk) { roundRect(ctx, cx, cy, Math.max(0, cw), Math.max(0, ch), rad); ctx.clip(); }
    if (mk && ['iris', 'blinds', 'diagonal'].includes(mk.kind)) { shapeMask(ctx, mk.kind, mk.k, cx, cy, cw, ch); ctx.clip(); }
    if (src) {
      ctx.drawImage(src, r.x, r.y, r.w, r.h);
    } else if (clip.type === 'component') {
      const def = COMPONENTS[clip.component ?? ''];
      if (def) {
        try { def.draw(ctx, p, { t: localT, duration: clip.duration, width: W, height: H, seed: componentSeed(clip.id) }); }
        catch (e) { console.error('component draw failed', clip.component, e); }
      }
    }
    const vig = num(p, 'vignette');
    if (vig > 0) {
      ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-atop';
      const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.3, r.x + r.w / 2, r.y + r.h / 2, Math.hypot(r.w, r.h) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${vig})`);
      ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
    if (opts.outline?.includes(clip.id)) outlines.push({ m, r: { x: cx, y: cy, w: cw, h: ch } });
  }
  for (const o of outlines) {
    ctx.save(); ctx.setTransform(o.m);
    const s = Math.hypot(o.m.a, o.m.b) || 1;
    ctx.lineWidth = 3 / s; ctx.strokeStyle = opts.outlineColor || '#4f8cff'; ctx.setLineDash([10 / s, 6 / s]);
    ctx.strokeRect(o.r.x, o.r.y, o.r.w, o.r.h);
    ctx.restore();
  }
  ctx.restore();
}
