import { memo, useEffect, useRef, useState } from 'react';
import { COMPONENTS, projectDuration, SFX, sortedTracks, type Clip, type Op, type Project, type Track } from '@cutroom/core';
import { player } from '../lib/player.ts';
import { session, useEditor, type Peer } from '../lib/store.ts';
import { fmtTime } from '../lib/api.ts';
import { addToTimeline, DND_TYPE, type LibItem } from './actions.ts';

const HEADER = 150;
const ROW_H: Record<Track['kind'], number> = { visual: 56, audio: 44 };

export function Timeline() {
  const project = useEditor((s) => s.project!);
  const pps = useEditor((s) => s.pxPerSec);
  const selection = useEditor((s) => s.selection);
  const peers = useEditor((s) => s.peers);
  const flashes = useEditor((s) => s.flashes);
  const [snap, setSnap] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const dur = projectDuration(project);
  const width = Math.max(30, dur + 15) * pps;
  const visual = sortedTracks(project, 'visual').reverse();
  const audio = sortedTracks(project, 'audio');
  const byTrack = new Map<string, Clip[]>();
  for (const c of Object.values(project.clips)) (byTrack.get(c.trackId) ?? byTrack.set(c.trackId, []).get(c.trackId)!).push(c);

  // keep the playhead in view while playing / following Claude
  useEffect(() => useEditor.subscribe((s, prev) => {
    if (s.time === prev.time || !scroller.current) return;
    const el = scroller.current;
    const x = s.time * s.pxPerSec;
    const view = el.clientWidth - HEADER;
    if (x < el.scrollLeft || x > el.scrollLeft + view - 40) el.scrollLeft = Math.max(0, x - (s.playing ? 40 : view / 3));
  }), []);

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const el = scroller.current!;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left - HEADER + el.scrollLeft;
    const t = px / pps;
    const next = Math.min(2000, Math.max(4, pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    useEditor.setState({ pxPerSec: next });
    requestAnimationFrame(() => { el.scrollLeft = t * next - (e.clientX - rect.left - HEADER); });
  };

  const fit = () => {
    const el = scroller.current!;
    useEditor.setState({ pxPerSec: Math.max(4, (el.clientWidth - HEADER - 40) / Math.max(5, dur)) });
    el.scrollLeft = 0;
  };

  const addTrack = (kind: Track['kind']) => session().edit([{ op: 'addTrack', kind }]);

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <button className="ghost small" onClick={() => addTrack('visual')}>+ Video track</button>
        <button className="ghost small" onClick={() => addTrack('audio')}>+ Audio track</button>
        <span className="sep" />
        <button className="ghost small" title="Split selected at playhead (S)" onClick={() => {
          const st = useEditor.getState(); const t = st.time;
          const ids = (st.selection.length ? st.selection : Object.keys(project.clips)).filter((id) => { const c = project.clips[id]; return c && t > c.start + 0.01 && t < c.start + c.duration - 0.01; });
          if (ids.length) session().edit(ids.map((id) => ({ op: 'splitClip', id, t })));
        }}>✂ Split</button>
        <button className="ghost small" title="Add marker (M)" onClick={() => session().edit([{ op: 'addMarker', t: useEditor.getState().time, label: `Marker ${Object.keys(project.markers).length + 1}` }])}>⚑ Marker</button>
        <label className="small"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap</label>
        <div className="spacer" />
        <button className="ghost small" onClick={fit}>Fit</button>
        <input type="range" min={Math.log(4)} max={Math.log(2000)} step={0.01} value={Math.log(pps)} onChange={(e) => useEditor.setState({ pxPerSec: Math.exp(Number(e.target.value)) })} />
      </div>
      <div className="tl-scroll" ref={scroller} onWheel={onWheel}>
        <div className="tl-inner" style={{ width: width + HEADER }}>
          <div className="tl-row ruler-row">
            <div className="tl-head corner">{fmtTime(dur)}</div>
            <Ruler width={width} pps={pps} project={project} />
          </div>
          {visual.map((t) => <TrackRow key={t.id} track={t} clips={byTrack.get(t.id) ?? []} width={width} pps={pps} selection={selection} peers={peers} flashes={flashes} snap={snap} project={project} />)}
          <div className="tl-divider"><div className="tl-head" /></div>
          {audio.map((t) => <TrackRow key={t.id} track={t} clips={byTrack.get(t.id) ?? []} width={width} pps={pps} selection={selection} peers={peers} flashes={flashes} snap={snap} project={project} />)}
          {!visual.length && !audio.length && <div className="tl-empty">Drag media, graphics or sounds here — or ask Claude to make the video.</div>}
          <Playhead pps={pps} />
        </div>
      </div>
    </div>
  );
}

function Playhead({ pps }: { pps: number }) {
  const time = useEditor((s) => s.time);
  return <div className="playhead" style={{ transform: `translateX(${HEADER + time * pps}px)` }}><div className="ph-knob" /></div>;
}

function Ruler({ width, pps, project }: { width: number; pps: number; project: Project }) {
  const steps = [1 / 30, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const major = steps.find((s) => s * pps >= 70) ?? 600;
  const minor = major / (major >= 1 ? (major % 5 === 0 ? 5 : 4) : 5);
  const ticks: React.ReactNode[] = [];
  for (let t = 0, i = 0; t * pps < width; i++, t = i * minor) {
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    ticks.push(<div key={i} className={`tick ${isMajor ? 'major' : ''}`} style={{ left: t * pps }}>{isMajor && <span>{fmtTime(t)}</span>}</div>);
  }
  const scrub = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const at = (x: number) => player.seek(Math.max(0, (x - r.left) / pps));
    at(e.clientX);
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => at(ev.clientX);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div className="ruler" style={{ width }} onPointerDown={scrub}>
      {ticks}
      {Object.values(project.markers).map((m) => (
        <div key={m.id} className="marker" style={{ left: m.t * pps, borderColor: m.color }} title={`${m.label} — alt-click to remove, double-click to rename`}
          onPointerDown={(e) => { e.stopPropagation(); if (e.altKey) session().edit([{ op: 'removeMarker', id: m.id }]); else player.seek(m.t); }}
          onDoubleClick={() => { const label = prompt('Marker label', m.label); if (label) session().edit([{ op: 'removeMarker', id: m.id }, { op: 'addMarker', id: m.id, t: m.t, label, color: m.color }]); }}>
          <span>{m.label}</span>
        </div>
      ))}
    </div>
  );
}

interface RowProps { track: Track; clips: Clip[]; width: number; pps: number; selection: string[]; peers: Peer[]; flashes: Record<string, number>; snap: boolean; project: Project }

const TrackRow = memo(function TrackRow({ track, clips, width, pps, selection, peers, flashes, snap, project }: RowProps) {
  const [renaming, setRenaming] = useState(false);
  const h = ROW_H[track.kind];
  const upd = (patch: Partial<Track>) => session().edit([{ op: 'updateTrack', id: track.id, ...patch }]);
  const move = (dir: 1 | -1) => {
    const same = sortedTracks(project, track.kind);
    const i = same.findIndex((t) => t.id === track.id), j = i + (track.kind === 'visual' ? dir : -dir);
    if (j < 0 || j >= same.length) return;
    session().edit([{ op: 'updateTrack', id: track.id, order: same[j].order }, { op: 'updateTrack', id: same[j].id, order: track.order }]);
  };

  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DND_TYPE);
    if (!raw) return;
    e.preventDefault();
    const item = JSON.parse(raw) as LibItem;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = Math.max(0, (e.clientX - r.left) / pps);
    const kind = item.type === 'audio' || item.type === 'sfx' ? 'audio' : 'visual';
    addToTimeline(item, t, kind === track.kind ? track.id : undefined);
  };

  return (
    <div className={`tl-row ${track.kind} ${track.hidden || track.muted ? 'dim' : ''}`} style={{ height: h }} data-track-id={track.id} data-kind={track.kind}>
      <div className="tl-head">
        <div className="th-name" onDoubleClick={() => setRenaming(true)}>
          {renaming ? <input autoFocus defaultValue={track.name} onBlur={(e) => { setRenaming(false); upd({ name: e.target.value || track.name }); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            : <span>{track.name}</span>}
        </div>
        <div className="th-btns">
          {track.kind === 'visual'
            ? <button className={`ghost tiny ${track.hidden ? 'off' : ''}`} title="Show/hide" onClick={() => upd({ hidden: !track.hidden })}>{track.hidden ? '◌' : '●'}</button>
            : <button className={`ghost tiny ${track.muted ? 'off' : ''}`} title="Mute" onClick={() => upd({ muted: !track.muted })}>{track.muted ? '🔇' : '🔊'}</button>}
          <button className={`ghost tiny ${track.locked ? 'on' : ''}`} title="Lock track" onClick={() => upd({ locked: !track.locked })}>{track.locked ? '🔒' : '🔓'}</button>
          <button className="ghost tiny" title="Move up" onClick={() => move(1)}>↑</button>
          <button className="ghost tiny" title="Move down" onClick={() => move(-1)}>↓</button>
          <button className="ghost tiny" title="Delete track and its clips" onClick={() => (clips.length === 0 || confirm(`Delete ${track.name} and its ${clips.length} clips?`)) && session().edit([{ op: 'removeTrack', id: track.id }])}>✕</button>
        </div>
      </div>
      <div className="lane" style={{ width }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes(DND_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
        onDrop={onDrop}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const r = e.currentTarget.getBoundingClientRect();
          useEditor.setState({ selection: [] });
          player.seek((e.clientX - r.left) / pps);
        }}>
        {clips.map((c) => (
          <ClipBox key={c.id} clip={c} pps={pps} h={h} selected={selection.includes(c.id)} peers={peers.filter((p) => p.selection.includes(c.id))}
            flash={flashes[c.id]} snap={snap} project={project} locked={track.locked} />
        ))}
      </div>
    </div>
  );
});

const peaksCache = new Map<string, Promise<{ perSecond: number; peaks: number[] } | null>>();
function usePeaks(url?: string) {
  const [data, setData] = useState<{ perSecond: number; peaks: number[] } | null>(null);
  useEffect(() => {
    if (!url) return;
    if (!peaksCache.has(url)) peaksCache.set(url, fetch(url).then((r) => r.json()).catch(() => null));
    peaksCache.get(url)!.then(setData);
  }, [url]);
  return data;
}

function Wave({ clip, url, w, h }: { clip: Clip; url?: string; w: number; h: number }) {
  const data = usePeaks(url);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !data) return;
    const W = Math.min(4000, Math.max(1, Math.round(w))), H = h;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const n = data.peaks.length / 2;
    for (let x = 0; x < W; x++) {
      const t = clip.inPoint + (x / W) * clip.duration * (clip.speed || 1);
      const i = Math.floor(t * data.perSecond);
      if (i >= n) break;
      const mn = data.peaks[i * 2] / 127, mx = data.peaks[i * 2 + 1] / 127;
      ctx.fillRect(x, H / 2 - mx * H / 2, 1, Math.max(1, (mx - mn) * H / 2));
    }
  }, [data, w, h, clip.inPoint, clip.duration, clip.speed]);
  return <canvas ref={ref} className="wave" />;
}

function clipLabel(c: Clip, p: Project) {
  if (c.name) return c.name;
  if (c.type === 'component') {
    const txt = typeof c.props.text === 'string' ? c.props.text.split('\n')[0] : '';
    return `${COMPONENTS[c.component ?? '']?.label ?? c.component}${txt ? `: ${txt}` : ''}`;
  }
  if (c.type === 'sfx') return `${SFX[c.component ?? '']?.label ?? c.component}${c.props.mood ? ` · ${c.props.mood}` : ''}`;
  return p.media[c.mediaId ?? '']?.name ?? c.type;
}

interface ClipProps { clip: Clip; pps: number; h: number; selected: boolean; peers: Peer[]; flash?: number; snap: boolean; project: Project; locked: boolean }

function ClipBox({ clip, pps, h, selected, peers, flash, snap, project, locked }: ClipProps) {
  const media = project.media[clip.mediaId ?? ''];
  const w = Math.max(2, clip.duration * pps);
  const recent = flash && Date.now() - flash < 1600;
  const kfTimes = [...new Set(Object.values(clip.keyframes).flat().map((k) => +k.t.toFixed(3)))];
  const byClaude = project.log.some((l) => l.targetId === clip.id && l.author === 'claude' && l.summary.startsWith('Added'));

  const startDrag = (e: React.PointerEvent, mode: 'move' | 'trimL' | 'trimR') => {
    e.stopPropagation();
    const st = useEditor.getState();
    let sel = st.selection;
    if (e.shiftKey || e.metaKey) {
      sel = sel.includes(clip.id) ? sel.filter((x) => x !== clip.id) : [...sel, clip.id];
      st.set({ selection: sel });
      return;
    }
    if (!sel.includes(clip.id)) { sel = [clip.id]; st.set({ selection: sel }); }
    if (session().readOnly || locked) return;
    const x0 = e.clientX;
    const ids = mode === 'move' ? sel.filter((id) => project.clips[id]) : [clip.id];
    const orig = new Map(ids.map((id) => [id, { ...project.clips[id] }]));
    const others = Object.values(project.clips).filter((c) => !ids.includes(c.id));
    const snapPts = [0, st.time, ...others.flatMap((c) => [c.start, c.start + c.duration]), ...Object.values(project.markers).map((m) => m.t)];
    const snapTo = (t: number) => {
      if (!snap) return null;
      let best: number | null = null, bd = 8 / pps;
      for (const s of snapPts) if (Math.abs(s - t) < bd) { bd = Math.abs(s - t); best = s; }
      return best;
    };
    let moved = false;
    let last: Op[] = [];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      let dt = (ev.clientX - x0) / pps;
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      moved = true;
      const o = orig.get(clip.id)!;
      const ops: Op[] = [];
      if (mode === 'move') {
        const s1 = snapTo(o.start + dt), s2 = snapTo(o.start + o.duration + dt);
        if (s1 !== null) dt = s1 - o.start; else if (s2 !== null) dt = s2 - o.start - o.duration;
        const minStart = Math.min(...[...orig.values()].map((c) => c.start));
        dt = Math.max(dt, -minStart);
        let trackId: string | undefined;
        if (ids.length === 1) {
          const row = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-track-id]') as HTMLElement | null;
          const tid = row?.dataset.trackId;
          if (tid && project.tracks[tid]?.kind === project.tracks[o.trackId]?.kind && !project.tracks[tid].locked) trackId = tid;
        }
        for (const [id, c] of orig) ops.push({ op: 'updateClip', id, start: +(c.start + dt).toFixed(4), ...(trackId && id === clip.id ? { trackId } : {}) });
      } else if (mode === 'trimL') {
        const speed = o.speed || 1;
        const hasSource = o.type === 'video' || o.type === 'audio' || o.type === 'sfx';
        let ns = o.start + dt;
        const sn = snapTo(ns); if (sn !== null) ns = sn;
        if (hasSource) ns = Math.max(ns, o.start - o.inPoint / speed);
        ns = Math.max(0, Math.min(ns, o.start + o.duration - 0.05));
        const d = ns - o.start;
        ops.push({ op: 'updateClip', id: o.id, start: +ns.toFixed(4), duration: +(o.duration - d).toFixed(4), ...(hasSource ? { inPoint: +Math.max(0, o.inPoint + d * speed).toFixed(4) } : {}) });
      } else {
        let ne = o.start + o.duration + dt;
        const sn = snapTo(ne); if (sn !== null) ne = sn;
        let nd = Math.max(0.05, ne - o.start);
        if (media && (o.type === 'video' || o.type === 'audio')) nd = Math.min(nd, (media.duration - o.inPoint) / (o.speed || 1));
        ops.push({ op: 'updateClip', id: o.id, duration: +nd.toFixed(4) });
      }
      last = ops;
      session().edit(ops, { log: false });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved && last.length) session().edit(last, { log: true });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const tIn = !!clip.props.transitionIn && clip.props.transitionIn !== 'none';
  const tOut = !!clip.props.transitionOut && clip.props.transitionOut !== 'none';
  return (
    <div className={`clip ${clip.type} ${selected ? 'selected' : ''} ${recent ? 'flash' : ''}`}
      style={{ left: clip.start * pps, width: w, height: h - 6, backgroundImage: clip.type === 'video' && media?.thumbUrl ? `url(${media.thumbUrl})` : undefined, boxShadow: peers.length ? `0 0 0 2px ${peers[0].color}` : undefined }}
      onPointerDown={(e) => startDrag(e, 'move')}
      title={`${clipLabel(clip, project)}\n${fmtTime(clip.start)} → ${fmtTime(clip.start + clip.duration)} (${clip.duration.toFixed(2)}s)`}>
      {(clip.type === 'audio' || (clip.type === 'video' && media?.hasAudio)) && <Wave clip={clip} url={media?.peaksUrl} w={w} h={h - 6} />}
      <div className="clip-label">{byClaude && <span className="by-claude" title="Made by Claude">✳</span>}{clipLabel(clip, project)}</div>
      {tIn && <div className="tr-in" style={{ width: Math.min(w / 2, Number(clip.props.transitionInDuration ?? 0.5) * pps) }} />}
      {tOut && <div className="tr-out" style={{ width: Math.min(w / 2, Number(clip.props.transitionOutDuration ?? 0.5) * pps) }} />}
      {kfTimes.map((t) => <div key={t} className="kf-dot" style={{ left: t * pps }} />)}
      {peers.length > 0 && <div className="peer-tag" style={{ background: peers[0].color }}>{peers[0].name}</div>}
      <div className="trim l" onPointerDown={(e) => startDrag(e, 'trimL')} />
      <div className="trim r" onPointerDown={(e) => startDrag(e, 'trimR')} />
    </div>
  );
}
