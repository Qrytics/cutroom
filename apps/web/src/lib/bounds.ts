// What an object really covers on screen. Components draw anywhere on the full canvas, so their transform box is
// useless for clicking or handles — render the clip on its own and read its pixels instead.
import { contentRect, drawFrame, type Clip, type Layer, type Project } from '@cutroom/core';
import { player } from './player.ts';

export interface Rect { x: number; y: number; w: number; h: number }

const SW = 480;
const big = document.createElement('canvas'), bctx = big.getContext('2d')!;
const small = document.createElement('canvas'), sctx = small.getContext('2d', { willReadFrequently: true })!;

// transform props reset so the render lands in the clip's own (local) coordinates
const TRANSFORM = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation', 'anchorX', 'anchorY', 'opacity', 'motion', 'motionAmount', 'transitionIn', 'transitionOut'];

function isolate(p: Project, clip: Clip, t: number, neutral: boolean) {
  const W = p.meta.width, H = p.meta.height, sh = Math.max(1, Math.round(SW * H / W));
  if (big.width !== W || big.height !== H) { big.width = W; big.height = H; }
  if (small.width !== SW || small.height !== sh) { small.width = SW; small.height = sh; }
  let c = clip;
  if (neutral) {
    const keyframes = Object.fromEntries(Object.entries(clip.keyframes).filter(([k]) => !TRANSFORM.includes(k)));
    c = { ...clip, keyframes, props: { ...clip.props, x: W / 2, y: H / 2, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, opacity: 1, motion: 'none', transitionIn: 'none', transitionOut: 'none' } };
  }
  bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, W, H);
  drawFrame(bctx, { ...p, clips: { [c.id]: c }, meta: { ...p.meta, background: 'rgba(0,0,0,0)' } }, t, player.pool);
  sctx.clearRect(0, 0, SW, sh); sctx.drawImage(big, 0, 0, SW, sh);
  return { px: sctx.getImageData(0, 0, SW, sh).data, sh, k: W / SW };
}

const cache = new Map<string, unknown>();
function memo<T>(key: string, fn: () => T): T {
  if (cache.has(key)) return cache.get(key) as T;
  const v = fn();
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  cache.set(key, v);
  return v;
}
const sig = (c: Clip, t: number) => `${c.id}|${t.toFixed(2)}|${JSON.stringify(c.props)}|${JSON.stringify(c.keyframes)}|${c.start}|${c.duration}`;

/** Tight box of a clip in its local (untransformed) coordinates. */
export function localBounds(p: Project, L: Layer): Rect {
  const { clip } = L;
  if (clip.type !== 'component') return contentRect(clip, L.props, p);
  return memo(`b|${sig(clip, L.localT)}`, () => {
    // at the playhead; if it is invisible right now (fading in, typing), use the moment it has settled
    for (const lt of [L.localT, Math.min(clip.duration * 0.6, 1.2), clip.duration * 0.5]) {
      const { px, sh, k } = isolate(p, clip, clip.start + lt, true);
      let x0 = SW, y0 = sh, x1 = -1, y1 = -1;
      for (let y = 0; y < sh; y++) for (let x = 0; x < SW; x++) if (px[(y * SW + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= 0) return { x: x0 * k - 4, y: y0 * k - 4, w: (x1 - x0 + 1) * k + 8, h: (y1 - y0 + 1) * k + 8 };
    }
    return { x: 0, y: 0, w: p.meta.width, h: p.meta.height };
  });
}

/** Does the clip actually draw something at canvas point (x, y)? (checks a small neighbourhood) */
export function coversPoint(p: Project, L: Layer, x: number, y: number): boolean {
  const { px, sh, k } = memo(`h|${sig(L.clip, L.localT)}`, () => isolate(p, L.clip, L.clip.start + L.localT, false));
  const cx = Math.round(x / k), cy = Math.round(y / k), r = 3;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const xx = cx + dx, yy = cy + dy;
    if (xx >= 0 && yy >= 0 && xx < SW && yy < sh && px[(yy * SW + xx) * 4 + 3] > 20) return true;
  }
  return false;
}

export function clearBounds() { cache.clear(); }
