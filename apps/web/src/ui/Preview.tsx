import { useEffect, useRef } from 'react';
import { contentRect, drawFrame, layerMatrix, projectDuration, transitionState, visibleLayers, type Op } from '@cutroom/core';
import { fmtTime } from '../lib/api.ts';
import { player } from '../lib/player.ts';
import { session, useEditor } from '../lib/store.ts';

export function Preview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
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
          drawFrame(ctx, p, st.time, player.pool, { outline: st.playing ? [] : st.selection, outlineColor: p.lock?.holder === 'claude' ? '#d97757' : '#4f8cff' });
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

  const hit = (x: number, y: number) => {
    const st = useEditor.getState();
    const p = st.project!;
    const layers = visibleLayers(p, st.time).reverse();
    for (const L of layers) {
      if (L.track.locked) continue;
      const tr = transitionState(L.props, L.localT, L.clip.duration);
      const m = layerMatrix(L.props, p.meta.width, p.meta.height, tr);
      const pt = m.inverse().transformPoint(new DOMPoint(x, y));
      const r = contentRect(L.clip, L.props, p);
      const full = L.clip.type === 'component' && ['background', 'flash', 'stripeWipe', 'confetti'].includes(L.clip.component ?? '');
      if (full && layers.length > 1 && L !== layers[layers.length - 1]) continue;
      if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) return L;
    }
    return null;
  };

  const setXY = (id: string, x: number, y: number) => {
    const st = useEditor.getState();
    const c = st.project!.clips[id];
    const lt = st.time - c.start;
    const ops: Op[] = [];
    for (const [k, v] of [['x', x], ['y', y]] as const) {
      if (c.keyframes[k]?.length) ops.push({ op: 'addKeyframe', id, prop: k, t: +lt.toFixed(3), v: Math.round(v) });
      else ops.push({ op: 'setProps', id, props: { [k]: Math.round(v) } });
    }
    session().edit(ops, { key: `move:${id}` });
  };

  const onDown = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    const { x, y } = toCanvas(e);
    const L = hit(x, y);
    if (!L) { st.set({ selection: [] }); return; }
    st.set({ selection: e.shiftKey ? [...new Set([...st.selection, L.clip.id])] : [L.clip.id] });
    if (session().readOnly) return;
    const sx = Number(L.props.x), sy = Number(L.props.y);
    const id = L.clip.id;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const q = toCanvas(ev);
      let nx = sx + q.x - x, ny = sy + q.y - y;
      // snap to center lines
      if (Math.abs(nx - meta.width / 2) < 12) nx = meta.width / 2;
      if (Math.abs(ny - meta.height / 2) < 12) ny = meta.height / 2;
      setXY(id, nx, ny);
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
    const next = Math.max(0.01, +(cur * (e.deltaY < 0 ? 1.04 : 1 / 1.04)).toFixed(4));
    if (c.keyframes.scale?.length) session().edit([{ op: 'addKeyframe', id, prop: 'scale', t: +(st.time - c.start).toFixed(3), v: next }], { key: `scale:${id}` });
    else session().edit([{ op: 'setProps', id, props: { scale: next } }], { key: `scale:${id}` });
  };

  const aspect = meta.width / meta.height;
  return (
    <div className="preview">
      <div className="stage-wrap" ref={wrap}>
        <div className="stage" style={{ aspectRatio: `${aspect}`, width: `min(100cqw, calc(100cqh * ${aspect}))` }}>
          <canvas ref={canvas} onPointerDown={onDown} onWheel={onWheel} />
          {safeArea && <SafeArea vertical={meta.height > meta.width} />}
        </div>
      </div>
      <Transport />
    </div>
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
