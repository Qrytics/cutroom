import { useEffect, useReducer, useRef } from 'react';
import { drawFrame, drawnMatrix as coreDrawnMatrix, projectDuration, visibleLayers, type Layer, type Op, type Project } from '@cutroom/core';
import { fmtTime } from '../lib/api.ts';
import { localBounds, coversPoint, type Rect } from '../lib/bounds.ts';
import { CreateLayer, Toolbar } from './CreateTools.tsx';
import { player } from '../lib/player.ts';
import { session, useEditor } from '../lib/store.ts';

// full-frame layers: only picked when nothing else is under the pointer
const FULL = new Set(['background', 'overlay', 'particles', 'gradientOrb', 'flash', 'stripeWipe', 'shapeWipe', 'glitchTransition', 'confetti', 'spotlight']);

/** The layer matrix exactly as drawn (incl. transitions + camera motion), so handles sit on the pixels. */
const drawnMatrix = (p: Project, L: Layer) => coreDrawnMatrix(L, p.meta.width, p.meta.height);

function corners(m: DOMMatrix, r: Rect) {
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([x, y]) => m.transformPoint(new DOMPoint(x, y)));
}

/** Set transform props on a clip at the playhead — keyframed props get a keyframe, others a plain value. */
function setTransform(id: string, values: Record<string, number>, key: string) {
  const st = useEditor.getState();
  const c = st.project!.clips[id];
  const lt = +(st.time - c.start).toFixed(3);
  const ops: Op[] = [];
  const plain: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) {
    if (c.keyframes[k]?.length) ops.push({ op: 'addKeyframe', id, prop: k, t: lt, v });
    else plain[k] = v;
  }
  if (Object.keys(plain).length) ops.push({ op: 'setProps', id, props: plain });
  if (ops.length) session().edit(ops, { key });
}

export function Preview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const meta = useEditor((s) => s.project!.meta);
  const safeArea = useEditor((s) => s.safeArea);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d', { alpha: false })!;
    let dirty = true, raf = 0;
    const unsub = useEditor.subscribe(() => { dirty = true; });
    player.pool.onFrame = () => { dirty = true; };
    const loop = () => {
      const st = useEditor.getState();
      const p = st.project;
      if (p) {
        if (cv.width !== p.meta.width || cv.height !== p.meta.height) { cv.width = p.meta.width; cv.height = p.meta.height; dirty = true; }
        player.pool.sync(p, st.time, st.playing);
        if (dirty || st.playing) {
          dirty = false;
          // a single selection gets the handle overlay; multi-select keeps the dashed outlines
          const outline = st.playing || st.selection.length < 2 ? [] : st.selection;
          drawFrame(ctx, p, st.time, player.pool, { outline, outlineColor: p.lock?.holder === 'claude' ? '#d97757' : '#4f8cff' });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); unsub(); };
  }, []);

  /** canvas pixel coords from a pointer event */
  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * meta.width, y: (e.clientY - r.top) / r.height * meta.height };
  };

  /** Every layer under the point, topmost first: real pixels for objects, full-frame layers last. */
  const hits = (x: number, y: number): Layer[] => {
    const st = useEditor.getState();
    const p = st.project!;
    const layers = visibleLayers(p, st.time).filter((L) => !L.track.locked).reverse();
    const objects: Layer[] = [], full: Layer[] = [];
    for (const L of layers) {
      const isFull = L.clip.type === 'component' && FULL.has(L.clip.component ?? '');
      const m = drawnMatrix(p, L);
      const q = m.inverse().transformPoint(new DOMPoint(x, y));
      const b = localBounds(p, L);
      const inBox = q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h;
      if (!inBox) continue;
      if (isFull) full.push(L);
      else if (L.clip.type !== 'component' || coversPoint(p, L, x, y)) objects.push(L);
    }
    return [...objects, ...full.reverse()];
  };

  const onDown = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    const p = st.project!;
    const { x, y } = toCanvas(e);
    // inside the current selection's box → keep it (lets you grab text between its letters)
    const selId = st.selection.length === 1 ? st.selection[0] : null;
    const sel = selId ? visibleLayers(p, st.time).find((L) => L.clip.id === selId) : undefined;
    let pick: Layer | undefined;
    const under = hits(x, y);
    // keep the selection when clicking inside its box (grab a title between its letters) — but never for full-frame
    // layers like the background, and never when another object drawn above it is under the pointer
    if (sel && !e.altKey && !(sel.clip.type === 'component' && FULL.has(sel.clip.component ?? ''))) {
      const q = drawnMatrix(p, sel).inverse().transformPoint(new DOMPoint(x, y));
      const b = localBounds(p, sel);
      const order = visibleLayers(p, st.time).map((L) => L.clip.id);
      const above = under.some((L) => !(L.clip.type === 'component' && FULL.has(L.clip.component ?? '')) && order.indexOf(L.clip.id) > order.indexOf(sel.clip.id));
      if (!above && q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h) pick = sel;
    }
    // Alt-click selects the next object underneath the current one at this spot (cycles through the stack)
    if (!pick) {
      if (e.altKey && sel && under.length > 1) {
        const i = under.findIndex((L) => L.clip.id === sel.clip.id);
        pick = under[(i + 1) % under.length];
      } else pick = under[0];
    }
    if (!pick) { st.set({ selection: [] }); return; }
    st.set({ selection: e.shiftKey ? [...new Set([...st.selection, pick.clip.id])] : [pick.clip.id] });
    if (session().readOnly) return;
    const sx = Number(pick.props.x), sy = Number(pick.props.y);
    const id = pick.clip.id;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const q = toCanvas(ev);
      let nx = sx + q.x - x, ny = sy + q.y - y;
      // snap to center lines
      if (Math.abs(nx - meta.width / 2) < 12) nx = meta.width / 2;
      if (Math.abs(ny - meta.height / 2) < 12) ny = meta.height / 2;
      setTransform(id, { x: Math.round(nx), y: Math.round(ny) }, `move:${id}`);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.altKey) return;
    const st = useEditor.getState();
    const id = st.selection[0];
    const c = id && st.project!.clips[id];
    if (!c || session().readOnly) return;
    const cur = Number(c.props.scale ?? 1);
    setTransform(id, { scale: Math.max(0.01, +(cur * (e.deltaY < 0 ? 1.04 : 1 / 1.04)).toFixed(4)) }, `scale:${id}`);
  };

  const aspect = meta.width / meta.height;
  return (
    <div className="preview">
      <Toolbar />
      <div className="stage-wrap">
        <div className="stage" style={{ aspectRatio: `${aspect}`, width: `min(100cqw, calc(100cqh * ${aspect}))` }}>
          <canvas ref={canvas} onPointerDown={onDown} onWheel={onWheel} />
          {safeArea && <SafeArea vertical={meta.height > meta.width} />}
          <Handles canvas={canvas} />
          <CreateLayer canvas={canvas} />
        </div>
      </div>
      <Transport />
    </div>
  );
}

/** Corner dots (scale) and a rotate knob above the selected object, drawn in canvas coordinates. */
function Handles({ canvas }: { canvas: React.RefObject<HTMLCanvasElement | null> }) {
  const project = useEditor((s) => s.project!);
  const time = useEditor((s) => s.time);
  const selection = useEditor((s) => s.selection);
  const playing = useEditor((s) => s.playing);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const cv = canvas.current; if (!cv) return;
    const ro = new ResizeObserver(() => rerender()); ro.observe(cv);
    return () => ro.disconnect();
  }, [canvas]);

  if (playing || selection.length !== 1 || !canvas.current) return null;
  const L = visibleLayers(project, time).find((l) => l.clip.id === selection[0]);
  if (!L) return null;
  const W = project.meta.width, H = project.meta.height;
  const k = W / Math.max(1, canvas.current.getBoundingClientRect().width); // canvas px per screen px
  const m = drawnMatrix(project, L);
  const b = localBounds(project, L);
  const pts = corners(m, b);
  const color = project.lock?.holder === 'claude' ? '#d97757' : '#4f8cff';
  const readOnly = session().readOnly;
  // rotate knob: above the top edge's midpoint, along the box's own "up"
  const topMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  const botMid = { x: (pts[3].x + pts[2].x) / 2, y: (pts[3].y + pts[2].y) / 2 };
  const len = Math.hypot(topMid.x - botMid.x, topMid.y - botMid.y) || 1;
  const up = { x: (topMid.x - botMid.x) / len, y: (topMid.y - botMid.y) / len };
  const knob = { x: topMid.x + up.x * 34 * k, y: topMid.y + up.y * 34 * k };
  const pivot = { x: Number(L.props.x), y: Number(L.props.y) };

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  };
  const drag = (e: React.PointerEvent, onMove: (q: { x: number; y: number }, ev: PointerEvent) => void) => {
    e.stopPropagation(); e.preventDefault();
    if (readOnly) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onMove(toCanvas(ev), ev);
    const upFn = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', upFn); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', upFn);
  };
  const id = L.clip.id;
  const s0 = { scale: Number(L.props.scale ?? 1), sx: Number(L.props.scaleX ?? 1), sy: Number(L.props.scaleY ?? 1), rot: Number(L.props.rotation ?? 0) };

  const onCorner = (e: React.PointerEvent) => {
    const start = toCanvas(e);
    const d0 = Math.hypot(start.x - pivot.x, start.y - pivot.y) || 1;
    // local axes of the box (for Shift = free stretch along width/height)
    const ax = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y }, ay = { x: pts[3].x - pts[0].x, y: pts[3].y - pts[0].y };
    const al = Math.hypot(ax.x, ax.y) || 1, bl = Math.hypot(ay.x, ay.y) || 1;
    const proj = (q: { x: number; y: number }) => ({ u: ((q.x - pivot.x) * ax.x + (q.y - pivot.y) * ax.y) / al, v: ((q.x - pivot.x) * ay.x + (q.y - pivot.y) * ay.y) / bl });
    const p0 = proj(start);
    drag(e, (q, ev) => {
      if (ev.shiftKey) {
        const p1 = proj(q);
        const fx = Math.abs(p0.u) > 2 ? p1.u / p0.u : 1, fy = Math.abs(p0.v) > 2 ? p1.v / p0.v : 1;
        setTransform(id, { scaleX: +(s0.sx * fx).toFixed(4), scaleY: +(s0.sy * fy).toFixed(4) }, `scale:${id}`);
      } else {
        const f = Math.hypot(q.x - pivot.x, q.y - pivot.y) / d0;
        setTransform(id, { scale: +Math.max(0.01, s0.scale * f).toFixed(4) }, `scale:${id}`);
      }
    });
  };
  const onRotate = (e: React.PointerEvent) => {
    const start = toCanvas(e);
    const a0 = Math.atan2(start.y - pivot.y, start.x - pivot.x);
    drag(e, (q, ev) => {
      let r = s0.rot + (Math.atan2(q.y - pivot.y, q.x - pivot.x) - a0) * 180 / Math.PI;
      if (ev.shiftKey) r = Math.round(r / 15) * 15;
      setTransform(id, { rotation: +r.toFixed(1) }, `rotate:${id}`);
    });
  };

  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const cursors = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'];
  return (
    <svg className="handles" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polygon points={poly} fill="none" stroke={color} strokeWidth={1.5 * k} />
      {!readOnly && <>
        <line x1={topMid.x} y1={topMid.y} x2={knob.x} y2={knob.y} stroke={color} strokeWidth={1.5 * k} />
        <g className="handle rotate" onPointerDown={onRotate} style={{ cursor: 'grab' }}>
          <circle cx={knob.x} cy={knob.y} r={11 * k} fill="#fff" stroke={color} strokeWidth={1.5 * k} />
          <path d={`M ${knob.x - 5 * k} ${knob.y + 1 * k} A ${5 * k} ${5 * k} 0 1 1 ${knob.x + 1 * k} ${knob.y + 5 * k}`} fill="none" stroke={color} strokeWidth={1.8 * k} strokeLinecap="round" />
          <path d={`M ${knob.x - 7.5 * k} ${knob.y - 1 * k} L ${knob.x - 5 * k} ${knob.y + 2.5 * k} L ${knob.x - 1.8 * k} ${knob.y - 0.5 * k}`} fill="none" stroke={color} strokeWidth={1.8 * k} strokeLinecap="round" strokeLinejoin="round" />
          <title>Rotate (Shift = 15° steps)</title>
        </g>
        {pts.map((p, i) => (
          <circle key={i} className="handle" cx={p.x} cy={p.y} r={6 * k} fill="#fff" stroke={color} strokeWidth={1.5 * k} style={{ cursor: cursors[i] }} onPointerDown={onCorner}>
            <title>Resize (Shift = stretch freely)</title>
          </circle>
        ))}
      </>}
    </svg>
  );
}

function SafeArea({ vertical }: { vertical: boolean }) {
  return (
    <div className="safe">
      <div className="safe-action" />
      <div className="safe-title" />
      <div className="safe-cross" />
      {vertical && <div className="safe-reels" title="Reels/TikTok/Shorts UI covers this area" />}
    </div>
  );
}

function Transport() {
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const project = useEditor((s) => s.project!);
  const dur = projectDuration(project);
  return (
    <div className="transport">
      <button className="ghost" onClick={() => player.seek(0)} title="Start (Home)">⏮</button>
      <button className="ghost" onClick={() => player.step(-1)} title="Previous frame (←)">◀︎</button>
      <button className="play" onClick={() => player.toggle()} title="Play / pause (Space)">{playing ? '❚❚' : '▶'}</button>
      <button className="ghost" onClick={() => player.step(1)} title="Next frame (→)">▶︎</button>
      <button className="ghost" onClick={() => player.seek(dur)} title="End">⏭</button>
      <span className="tc">{fmtTime(time, project.meta.fps)}</span>
      <span className="muted">/ {fmtTime(dur, project.meta.fps)}</span>
    </div>
  );
}
