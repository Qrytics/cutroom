// Create tools for the preview: type text where you click, draw freehand, lines and arrows, drag out rectangles
// and ellipses. Everything becomes an ordinary clip (text / drawing / shape) on the top track, editable afterwards.
import { useEffect, useRef, useState } from 'react';
import type { Op, Project } from '@cutroom/core';
import { saveBrush, session, useEditor, type Brush, type Tool } from '../lib/store.ts';

type Pt = { x: number; y: number };

export const TOOLS: { key: Tool; icon: string; label: string; hotkey: string }[] = [
  { key: 'select', icon: '↖', label: 'Select & move', hotkey: 'V' },
  { key: 'text', icon: 'T', label: 'Text — click to type', hotkey: 'T' },
  { key: 'pen', icon: '✎', label: 'Draw freehand', hotkey: 'P' },
  { key: 'line', icon: '╱', label: 'Line (Shift = 45° steps)', hotkey: 'U' },
  { key: 'arrow', icon: '↗', label: 'Arrow (Shift = 45° steps)', hotkey: 'A' },
  { key: 'rect', icon: '▭', label: 'Rectangle (Shift = square)', hotkey: 'R' },
  { key: 'ellipse', icon: '◯', label: 'Ellipse (Shift = circle)', hotkey: 'O' },
];
export const TOOL_KEYS: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.hotkey.toLowerCase(), t.key]));
const STYLES: Brush['style'][] = ['pen', 'marker', 'highlighter', 'neon', 'chalk', 'brush'];

export function ToolButtons({ compact = false }: { compact?: boolean }) {
  const tool = useEditor((s) => s.tool);
  return (
    <>
      {TOOLS.map((t) => (
        <button key={t.key} className={`tool ${tool === t.key ? 'active' : ''}`} title={`${t.label} (${t.hotkey})`}
          onClick={() => useEditor.setState({ tool: t.key })}>
          <span className="tool-icon">{t.icon}</span>{!compact && <span className="tool-label">{t.label.split(' —')[0].split(' (')[0]}</span>}
        </button>
      ))}
    </>
  );
}

export function Toolbar() {
  const brush = useEditor((s) => s.brush);
  const readOnly = useEditor((s) => !!s.project?.lock && s.project.lock.holder !== s.me.id);
  const set = (b: Partial<Brush>) => { const n = { ...brush, ...b }; saveBrush(n); useEditor.setState({ brush: n }); };
  return (
    <div className={`tools ${readOnly ? 'disabled' : ''}`}>
      <ToolButtons compact />
      <span className="tools-sep" />
      <input type="color" value={brush.color} onChange={(e) => set({ color: e.target.value })} title="Color for new text and drawings" />
      <input type="range" min={1} max={60} value={brush.width} onChange={(e) => set({ width: Number(e.target.value) })} title={`Thickness ${brush.width}px`} />
      <select value={brush.style} onChange={(e) => set({ style: e.target.value as Brush['style'] })} title="Stroke look">
        {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <label className="small" title="Shapes are filled instead of outlined"><input type="checkbox" checked={brush.fill} onChange={(e) => set({ fill: e.target.checked })} /> fill</label>
      <label className="small" title="New drawings animate on, the way you drew them"><input type="checkbox" checked={brush.drawOn} onChange={(e) => set({ drawOn: e.target.checked })} /> draw on</label>
    </div>
  );
}

// ---------------------------------------------------------------- geometry helpers
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / (Math.hypot(dx, dy) || 1);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Smooth freehand path: quadratic curves through the midpoints of a simplified polyline. */
function smoothPath(raw: Pt[]): string {
  const pts = simplify(raw, 1.6);
  if (pts.length < 2) { const p = raw[0]; return `M${r1(p.x)} ${r1(p.y)} L${r1(p.x + 0.1)} ${r1(p.y + 0.1)}`; }
  if (pts.length === 2) return `M${r1(pts[0].x)} ${r1(pts[0].y)} L${r1(pts[1].x)} ${r1(pts[1].y)}`;
  let d = `M${r1(pts[0].x)} ${r1(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
    d += ` Q${r1(pts[i].x)} ${r1(pts[i].y)} ${r1(m.x)} ${r1(m.y)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${r1(last.x)} ${r1(last.y)}`;
}
function snap45(a: Pt, b: Pt): Pt {
  const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}
function arrowPath(a: Pt, b: Pt, width: number): string {
  const ang = Math.atan2(b.y - a.y, b.x - a.x), head = Math.max(26, width * 3.2), spread = 0.5;
  const h1 = { x: b.x - Math.cos(ang - spread) * head, y: b.y - Math.sin(ang - spread) * head };
  const h2 = { x: b.x - Math.cos(ang + spread) * head, y: b.y - Math.sin(ang + spread) * head };
  return `M${r1(a.x)} ${r1(a.y)} L${r1(b.x)} ${r1(b.y)} M${r1(h1.x)} ${r1(h1.y)} L${r1(b.x)} ${r1(b.y)} L${r1(h2.x)} ${r1(h2.y)}`;
}

/** Add one clip on the topmost visual track (a new one if that track is busy then), select it, return its id. */
export function addOnTop(p: Project, clip: Omit<Extract<Op, { op: 'addClip' }>, 'op' | 'trackId'>, name: string): string | undefined {
  const tracks = Object.values(p.tracks).filter((t) => t.kind === 'visual').sort((a, b) => b.order - a.order);
  const end = clip.start + (clip.duration ?? 5);
  const top = tracks[0];
  const free = top && !top.locked && !Object.values(p.clips).some((c) => c.trackId === top.id && c.start < end - 1e-4 && c.start + c.duration > clip.start + 1e-4);
  const ops: Op[] = [];
  let trackId = top?.id;
  if (!free) { trackId = `draw${Date.now().toString(36)}`; ops.push({ op: 'addTrack', id: trackId, kind: 'visual', name: 'Drawings', order: (top?.order ?? 0) + 1 }); }
  ops.push({ op: 'addClip', ...clip, trackId, name });
  const r = session().edit(ops);
  const id = r?.[r.length - 1]?.id;
  if (id) useEditor.setState({ selection: [id] });
  return id;
}

// ---------------------------------------------------------------- the create layer over the preview
export function CreateLayer({ canvas }: { canvas: React.RefObject<HTMLCanvasElement | null> }) {
  const tool = useEditor((s) => s.tool);
  const meta = useEditor((s) => s.project!.meta);
  const W = meta.width, H = meta.height;
  const rect = () => canvas.current!.getBoundingClientRect();
  const toCanvas = (e: { clientX: number; clientY: number }): Pt => { const r = rect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  const scale = canvas.current ? W / Math.max(1, rect().width) : 1;
  const brush = useEditor((s) => s.brush);
  const [sketch, setSketch] = useState<{ pts: Pt[]; a: Pt; b: Pt; shift: boolean } | null>(null);
  const [typing, setTyping] = useState<{ id: string; at: Pt } | null>(null);
  if (tool === 'select' && !typing) return null;

  const onDown = (e: React.PointerEvent) => {
    if (session().readOnly) { useEditor.getState().toast('Someone else holds the lock — you can draw when they finish', 'error'); return; }
    e.preventDefault();
    const st = useEditor.getState(), p = st.project!;
    const a = toCanvas(e);
    if (tool === 'text') {
      const id = addOnTop(p, { type: 'component', component: 'text', start: st.time, duration: 4,
        props: { text: '', x: Math.round(a.x), y: Math.round(a.y), size: 96, weight: 800, color: brush.color, maxWidth: 1400, animIn: 'fade', inDur: 0.4, animOut: 'fade' } }, 'Text');
      if (id) setTyping({ id, at: a });
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    const s = { pts: [a], a, b: a, shift: e.shiftKey };
    setSketch(s);
    const move = (ev: PointerEvent) => {
      const q = toCanvas(ev);
      s.pts.push(q); s.b = q; s.shift = ev.shiftKey;
      setSketch({ ...s, pts: [...s.pts] });
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setSketch(null);
      commit(s);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const commit = (s: { pts: Pt[]; a: Pt; b: Pt; shift: boolean }) => {
    const st = useEditor.getState(), p = st.project!;
    const base = { start: st.time, duration: 5 };
    const strokeProps = { color: brush.color, width: brush.width, style: brush.style, drawOn: brush.drawOn, drawDur: 0.8 };
    let b = s.b;
    if ((tool === 'line' || tool === 'arrow') && s.shift) b = snap45(s.a, b);
    const tiny = Math.hypot(b.x - s.a.x, b.y - s.a.y) < 6;
    if (tool === 'pen') {
      if (s.pts.length < 2) return;
      addOnTop(p, { type: 'component', component: 'drawing', ...base, props: { ...strokeProps, path: smoothPath(s.pts), drawDur: Math.min(3, Math.max(0.4, s.pts.length / 90)) } }, 'Drawing');
    } else if (tool === 'line' || tool === 'arrow') {
      if (tiny) return;
      const path = tool === 'arrow' ? arrowPath(s.a, b, brush.width) : `M${r1(s.a.x)} ${r1(s.a.y)} L${r1(b.x)} ${r1(b.y)}`;
      addOnTop(p, { type: 'component', component: 'drawing', ...base, props: { ...strokeProps, path, drawDur: 0.5 } }, tool === 'arrow' ? 'Arrow' : 'Line');
    } else if (tool === 'rect' || tool === 'ellipse') {
      let w = Math.abs(b.x - s.a.x), h = Math.abs(b.y - s.a.y);
      if (s.shift) w = h = Math.max(w, h);
      if (w < 6 || h < 6) return;
      const cx = s.a.x + Math.sign(b.x - s.a.x || 1) * w / 2, cy = s.a.y + Math.sign(b.y - s.a.y || 1) * h / 2;
      const props: Record<string, unknown> = { shape: tool, width: Math.round(w), height: Math.round(h), x: Math.round(cx), y: Math.round(cy), radius: tool === 'rect' ? 12 : 0,
        fill: brush.fill ? brush.color : '', strokeColor: brush.color, strokeWidth: brush.fill ? 0 : brush.width, animIn: brush.drawOn && brush.fill ? 'pop' : 'none', inDur: 0.4, animOut: 'fade' };
      const keyframes = brush.drawOn && !brush.fill ? { draw: [{ t: 0, v: 0, ease: 'easeInOut' as const }, { t: 0.6, v: 1 }] } : undefined;
      addOnTop(p, { type: 'component', component: 'shape', ...base, props, keyframes }, tool === 'rect' ? 'Rectangle' : 'Ellipse');
    }
    // the pen stays armed for the next stroke; the other tools hand back to select so you can adjust what you made
    if (tool !== 'pen') useEditor.setState({ tool: 'select' });
  };

  // live preview of the stroke/shape being drawn, in canvas coordinates
  let preview: React.ReactNode = null;
  if (sketch) {
    const sw = Math.max(1, brush.width), col = brush.color;
    let b = sketch.b;
    if ((tool === 'line' || tool === 'arrow') && sketch.shift) b = snap45(sketch.a, b);
    if (tool === 'pen') preview = <path d={sketch.pts.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join(' ')} stroke={col} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    else if (tool === 'line') preview = <line x1={sketch.a.x} y1={sketch.a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={sw} strokeLinecap="round" />;
    else if (tool === 'arrow') preview = <path d={arrowPath(sketch.a, b, sw)} stroke={col} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    else {
      let w = Math.abs(b.x - sketch.a.x), h = Math.abs(b.y - sketch.a.y);
      if (sketch.shift) w = h = Math.max(w, h);
      const x = b.x < sketch.a.x ? sketch.a.x - w : sketch.a.x, y = b.y < sketch.a.y ? sketch.a.y - h : sketch.a.y;
      const common = { stroke: col, strokeWidth: brush.fill ? 0 : sw, fill: brush.fill ? col : 'none' };
      preview = tool === 'rect' ? <rect x={x} y={y} width={w} height={h} rx={12} {...common} /> : <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />;
    }
  }

  return (
    <>
      {tool !== 'select' && (
        <svg className={`create-layer tool-${tool}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerDown={onDown}>
          {preview}
        </svg>
      )}
      {typing && <InlineText id={typing.id} at={typing.at} scale={scale} W={W} H={H} onDone={() => { setTyping(null); useEditor.setState({ tool: 'select' }); }} />}
    </>
  );
}

/** Type straight onto the video: a text box at the click point that writes into the new text clip. */
function InlineText({ id, at, scale, W, H, onDone }: { id: string; at: Pt; scale: number; W: number; H: number; onDone: () => void }) {
  const clip = useEditor((s) => s.project?.clips[id]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState('');
  useEffect(() => { ref.current?.focus(); }, []);
  const finish = (keep: boolean) => {
    const text = value.trim();
    if (!keep || !text) session().edit([{ op: 'removeClip', id }], { log: false });
    else session().edit([{ op: 'setProps', id, props: { text } }]);
    onDone();
  };
  if (!clip) return null;
  const size = Number(clip.props.size ?? 96) / scale;
  return (
    <textarea ref={ref} className="inline-text" value={value} placeholder="Type…" rows={Math.max(1, value.split('\n').length)}
      // transparent text + visible caret: what you see is the real rendered clip updating as you type
      style={{ left: `${(at.x / W) * 100}%`, top: `${(at.y / H) * 100}%`, fontSize: `${size}px`, caretColor: String(clip.props.color ?? '#fff') }}
      onChange={(e) => { setValue(e.target.value); session().edit([{ op: 'setProps', id, props: { text: e.target.value || ' ' } }], { key: `type:${id}`, log: false }); }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); } if (e.key === 'Escape') finish(false); }}
      onBlur={() => finish(true)} />
  );
}
