import { useMemo, useRef, useState } from 'react';
import { COMPONENTS, EASES, FONTS, propDefsFor, resolveProps, sampleKeyframes, SFX, type Clip, type Ease, type Keyframe, type Op, type PropDef } from '@cutroom/core';
import { fmtTime } from '../lib/api.ts';
import { player } from '../lib/player.ts';
import { colorFor, session, useEditor } from '../lib/store.ts';

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const clips = useEditor((s) => s.project!.clips);
  const sel = selection.map((id) => clips[id]).filter(Boolean);
  return (
    <div className="panel inspector">
      <div className="panel-title">Inspector</div>
      <div className="panel-body">
        {sel.length === 0 && <ProjectSettings />}
        {sel.length === 1 && <ClipInspector key={sel[0].id} clip={sel[0]} />}
        {sel.length > 1 && <Multi clips={sel} />}
      </div>
    </div>
  );
}

function ProjectSettings() {
  const meta = useEditor((s) => s.project!.meta);
  const set = (patch: Record<string, unknown>) => session().edit([{ op: 'setMeta', ...patch }], { key: `meta:${Object.keys(patch)}` });
  const sizes: [string, number, number][] = [['16:9 HD', 1920, 1080], ['9:16 Reel', 1080, 1920], ['1:1', 1080, 1080], ['4:5', 1080, 1350], ['4K', 3840, 2160], ['720p', 1280, 720]];
  return (
    <div>
      <div className="section-title">Project</div>
      <Row label="Name"><input value={meta.name} onChange={(e) => set({ name: e.target.value })} /></Row>
      <Row label="Size">
        <select value={`${meta.width}x${meta.height}`} onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); set({ width: w, height: h }); }}>
          {sizes.map(([n, w, h]) => <option key={n} value={`${w}x${h}`}>{n} · {w}×{h}</option>)}
          {!sizes.some(([, w, h]) => w === meta.width && h === meta.height) && <option value={`${meta.width}x${meta.height}`}>{meta.width}×{meta.height}</option>}
        </select>
      </Row>
      <Row label="FPS"><select value={meta.fps} onChange={(e) => set({ fps: Number(e.target.value) })}>{[24, 25, 30, 50, 60].map((f) => <option key={f}>{f}</option>)}</select></Row>
      <Row label="Background"><ColorInput value={meta.background} onChange={(v) => set({ background: v })} /></Row>
      <Row label="Length"><NumInput value={meta.duration} step={0.1} min={0} onChange={(v) => set({ duration: v })} /><span className="muted small">0 = auto</span></Row>
      <p className="muted small help">Select a clip on the timeline or in the preview to edit it. Shortcuts: Space play · S split · ⌫ delete · ⇧⌫ ripple delete · ⌘D duplicate · ⌘Z undo · M marker · ←/→ frame · J/K/L · +/− zoom. Alt+scroll in the preview scales the selected clip.</p>
    </div>
  );
}

function Multi({ clips }: { clips: Clip[] }) {
  const nudge = (dt: number) => session().edit(clips.map((c) => ({ op: 'updateClip', id: c.id, start: Math.max(0, c.start + dt) }) as Op), { key: 'nudge' });
  return (
    <div>
      <div className="section-title">{clips.length} clips selected</div>
      <div className="row wrap">
        <button onClick={() => nudge(-1 / 30)}>◀ 1f</button><button onClick={() => nudge(1 / 30)}>1f ▶</button>
        <button onClick={() => nudge(-1)}>◀ 1s</button><button onClick={() => nudge(1)}>1s ▶</button>
        <button className="danger" onClick={() => { if (session().edit(clips.map((c) => ({ op: 'removeClip', id: c.id }) as Op))) useEditor.setState({ selection: [] }); }}>Delete</button>
      </div>
    </div>
  );
}

function clipKind(c: Clip) {
  if (c.type === 'component') return COMPONENTS[c.component ?? '']?.label ?? c.component;
  if (c.type === 'sfx') return `${SFX[c.component ?? '']?.label ?? c.component} (sound)`;
  return c.type[0].toUpperCase() + c.type.slice(1);
}

function ClipInspector({ clip }: { clip: Clip }) {
  const time = useEditor((s) => s.time);
  const media = useEditor((s) => (clip.mediaId ? s.project!.media[clip.mediaId] : undefined));
  const creator = useEditor((s) => s.project!.log.find((l) => l.targetId === clip.id && l.summary.startsWith('Added')));
  const width = useEditor((s) => s.project!.meta.width);
  const height = useEditor((s) => s.project!.meta.height);
  const lt = Math.min(Math.max(0, time - clip.start), clip.duration);
  const inside = time >= clip.start && time <= clip.start + clip.duration;
  const props = useMemo(() => resolveProps(clip, lt, { width, height }), [clip, lt, width, height]);
  const defs = propDefsFor(clip);
  const groups = new Map<string, PropDef[]>();
  for (const d of defs) (groups.get(d.group) ?? groups.set(d.group, []).get(d.group)!).push(d);
  const [closed, setClosed] = useState<Record<string, boolean>>({ Effects: true, Transitions: false, Animation: false });
  const id = clip.id;
  const edit = (ops: Op[], key: string) => session().edit(ops, { key: `${key}:${id}` });

  const setProp = (k: string, v: unknown) => {
    if (clip.keyframes[k]?.length) edit([{ op: 'addKeyframe', id, prop: k, t: +lt.toFixed(3), v: v as number }], `kf-${k}`);
    else edit([{ op: 'setProps', id, props: { [k]: v } }], `prop-${k}`);
  };
  const toggleKf = (k: string) => {
    const kfs = clip.keyframes[k] ?? [];
    const at = kfs.find((f) => Math.abs(f.t - lt) < 1e-3);
    if (at) edit([{ op: 'removeKeyframe', id, prop: k, t: at.t }], `kfdel-${k}`);
    else edit([{ op: 'addKeyframe', id, prop: k, t: +lt.toFixed(3), v: props[k] as number }], `kfadd-${k}`);
  };
  const jumpKf = (k: string, dir: 1 | -1) => {
    const kfs = clip.keyframes[k] ?? [];
    const next = dir > 0 ? kfs.find((f) => f.t > lt + 1e-3) : [...kfs].reverse().find((f) => f.t < lt - 1e-3);
    if (next) player.seek(clip.start + next.t);
  };

  return (
    <div>
      <div className="clip-head">
        <span className={`badge ${clip.type}`}>{clipKind(clip)}</span>
        <input className="name-input" placeholder="Clip name" value={clip.name} onChange={(e) => edit([{ op: 'updateClip', id, name: e.target.value }], 'name')} />
      </div>
      {creator && <div className="muted small created">Added by <b style={{ color: colorFor(creator.author) }}>{creator.authorName}</b> {timeAgo(creator.at)}</div>}
      {!inside && <div className="hint small">Playhead is outside this clip — values shown at its {time < clip.start ? 'start' : 'end'}. <a onClick={() => player.seek(clip.start)}>Go to clip</a></div>}

      <Section title="Timing" closed={closed} setClosed={setClosed}>
        <Row label="Start"><NumInput value={clip.start} step={1 / 30} min={0} onChange={(v) => edit([{ op: 'updateClip', id, start: v }], 'start')} /><span className="muted small">{fmtTime(clip.start)}</span></Row>
        <Row label="Duration"><NumInput value={clip.duration} step={1 / 30} min={0.01} onChange={(v) => edit([{ op: 'updateClip', id, duration: v }], 'dur')} /></Row>
        {(clip.type === 'video' || clip.type === 'audio') && <>
          <Row label="Source in"><NumInput value={clip.inPoint} step={1 / 30} min={0} max={media?.duration} onChange={(v) => edit([{ op: 'updateClip', id, inPoint: v }], 'in')} /></Row>
          <Row label="Speed"><NumInput value={clip.speed} step={0.05} min={0.05} max={16} onChange={(v) => edit([{ op: 'updateClip', id, speed: v }], 'speed')} /><span className="muted small">×</span></Row>
        </>}
        {media && <div className="muted small">Source: {media.name} · {media.duration.toFixed(2)}s{media.width ? ` · ${media.width}×${media.height}` : ''}</div>}
      </Section>

      {[...groups].map(([g, ds]) => (
        <Section key={g} title={g} closed={closed} setClosed={setClosed}>
          {ds.map((d) => (
            <PropField key={d.key} def={d} value={props[d.key]} animated={!!clip.keyframes[d.key]?.length}
              onKf={clip.keyframes[d.key]?.some((f) => Math.abs(f.t - lt) < 1e-3)} canKf={!!d.animatable && inside}
              onChange={(v) => setProp(d.key, v)} onToggleKf={() => toggleKf(d.key)} onJump={(dir) => jumpKf(d.key, dir)}
              onReset={() => edit([{ op: 'setProps', id, props: { [d.key]: null } }, ...(clip.keyframes[d.key]?.length ? [{ op: 'setKeyframes', id, prop: d.key, keyframes: [] } as Op] : [])], `reset-${d.key}`)} />
          ))}
        </Section>
      ))}

      <Keyframes clip={clip} lt={lt} />

      <div className="row wrap actions">
        <button onClick={() => session().edit([{ op: 'duplicateClip', id }])}>Duplicate</button>
        <button onClick={() => session().edit([{ op: 'splitClip', id, t: time }])} disabled={!inside || lt < 0.02 || lt > clip.duration - 0.02}>Split at playhead</button>
        <button className="danger" onClick={() => { if (session().edit([{ op: 'removeClip', id }])) useEditor.setState({ selection: [] }); }}>Delete</button>
      </div>
    </div>
  );
}

function timeAgo(at: number) {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(at).toLocaleDateString();
}

function Section({ title, children, closed, setClosed }: { title: string; children: React.ReactNode; closed: Record<string, boolean>; setClosed: (f: (c: Record<string, boolean>) => Record<string, boolean>) => void }) {
  const isClosed = !!closed[title];
  return (
    <div className="section">
      <div className="section-title clickable" onClick={() => setClosed((c) => ({ ...c, [title]: !isClosed }))}>{isClosed ? '▸' : '▾'} {title}</div>
      {!isClosed && children}
    </div>
  );
}

function Row({ label, children, title }: { label: React.ReactNode; children: React.ReactNode; title?: string }) {
  return <div className="prop-row" title={title}><label>{label}</label><div className="prop-ctl">{children}</div></div>;
}

interface FieldProps {
  def: PropDef; value: unknown; animated: boolean; onKf?: boolean; canKf: boolean;
  onChange: (v: unknown) => void; onToggleKf: () => void; onJump: (dir: 1 | -1) => void; onReset: () => void;
}

function PropField({ def, value, animated, onKf, canKf, onChange, onToggleKf, onJump, onReset }: FieldProps) {
  const label = (
    <span className="label-wrap" onDoubleClick={onReset} title={`${def.hint ?? ''}${def.hint ? ' · ' : ''}double-click to reset`}>
      {def.animatable && (
        <span className="kf-ctl">
          {animated && <span className="kf-nav" onClick={() => onJump(-1)}>‹</span>}
          <span className={`kf-btn ${animated ? 'animated' : ''} ${onKf ? 'on' : ''} ${canKf ? '' : 'disabled'}`} title={animated ? 'Add/remove keyframe here' : 'Animate this property (adds a keyframe at the playhead)'} onClick={() => canKf && onToggleKf()}>◆</span>
          {animated && <span className="kf-nav" onClick={() => onJump(1)}>›</span>}
        </span>
      )}
      {def.label}
    </span>
  );
  let ctl: React.ReactNode;
  switch (def.type) {
    case 'number': ctl = <NumInput value={Number(value ?? def.default ?? 0)} min={def.min} max={def.max} step={def.step} onChange={onChange} scrub />; break;
    case 'text': ctl = <input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />; break;
    case 'longtext': ctl = <textarea rows={Math.min(8, Math.max(2, String(value ?? '').split('\n').length))} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />; break;
    case 'color': ctl = <ColorInput value={String(value ?? '')} onChange={onChange} />; break;
    case 'bool': ctl = <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />; break;
    case 'select': ctl = <select value={String(value)} onChange={(e) => onChange(e.target.value)}>{def.options!.map((o) => <option key={o}>{o}</option>)}</select>; break;
    case 'font': ctl = <select value={String(value)} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: String(value) }}>{FONTS.map((o) => <option key={o} style={{ fontFamily: o }}>{o}</option>)}</select>; break;
  }
  return <Row label={label}>{ctl}</Row>;
}

export function NumInput({ value, onChange, min, max, step = 1, scrub }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; scrub?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)) + (step < 0.05 ? 0 : 1));
  const start = useRef<{ x: number; v: number } | null>(null);
  const shown = Number.isFinite(value) ? +value.toFixed(decimals) : 0;
  return (
    <span className="num">
      {scrub && <span className="scrub" title="Drag to change" onPointerDown={(e) => {
        start.current = { x: e.clientX, v: value };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }} onPointerMove={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        onChange(clamp(+(start.current.v + dx * step * (e.shiftKey ? 10 : 1)).toFixed(6)));
      }} onPointerUp={() => { start.current = null; }}>⇔</span>}
      <input type="number" step={step} value={draft ?? shown}
        onChange={(e) => { setDraft(e.target.value); const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) onChange(clamp(v)); }}
        onBlur={() => setDraft(null)} />
    </span>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{3}$/i.test(value) ? '#' + value.slice(1).split('').map((c) => c + c).join('') : '#000000';
  return (
    <span className="color">
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} />
      <input value={value} placeholder="none" onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

/** Graph editor: every animated property as a curve over the clip, with editable keyframes. */
function Keyframes({ clip, lt }: { clip: Clip; lt: number }) {
  const entries = Object.entries(clip.keyframes).filter(([, v]) => v?.length);
  if (!entries.length) return null;
  const id = clip.id;
  const setKfs = (prop: string, kfs: Keyframe[]) => session().edit([{ op: 'setKeyframes', id, prop, keyframes: kfs }], { key: `kfs:${id}:${prop}` });
  return (
    <div className="section">
      <div className="section-title">Keyframes</div>
      {entries.map(([prop, kfs]) => {
        const numeric = kfs.every((k) => typeof k.v === 'number');
        const W = 260, H = 54;
        let path = '';
        let lo = Infinity, hi = -Infinity;
        if (numeric) {
          const vals: number[] = [];
          for (let i = 0; i <= 80; i++) vals.push(Number(sampleKeyframes(kfs, (i / 80) * clip.duration)));
          lo = Math.min(...vals); hi = Math.max(...vals);
          if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
          path = vals.map((v, i) => `${i ? 'L' : 'M'}${(i / 80 * W).toFixed(1)},${(H - 4 - (v - lo) / (hi - lo) * (H - 8)).toFixed(1)}`).join('');
        }
        return (
          <div key={prop} className="kf-block">
            <div className="row between"><b>{prop}</b><a className="small" onClick={() => setKfs(prop, [])}>remove animation</a></div>
            {numeric && (
              <svg className="graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <path d={path} />
                <line x1={lt / clip.duration * W} x2={lt / clip.duration * W} y1={0} y2={H} className="ph" />
                {kfs.map((k) => <circle key={k.t} cx={k.t / clip.duration * W} cy={H - 4 - (Number(k.v) - lo) / (hi - lo) * (H - 8)} r={4} onClick={() => player.seek(clip.start + k.t)} />)}
              </svg>
            )}
            {kfs.map((k, i) => (
              <div key={i} className="kf-row">
                <a onClick={() => player.seek(clip.start + k.t)} title="Go to keyframe">◆</a>
                <NumInput value={k.t} step={1 / 30} min={0} max={clip.duration} onChange={(t) => setKfs(prop, kfs.map((x, j) => (j === i ? { ...x, t } : x)))} />
                {typeof k.v === 'number'
                  ? <NumInput value={k.v} step={0.01} onChange={(v) => setKfs(prop, kfs.map((x, j) => (j === i ? { ...x, v } : x)))} />
                  : <input value={String(k.v)} onChange={(e) => setKfs(prop, kfs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />}
                <select value={k.ease ?? 'easeInOut'} onChange={(e) => setKfs(prop, kfs.map((x, j) => (j === i ? { ...x, ease: e.target.value as Ease } : x)))}>
                  {EASES.map((e) => <option key={e}>{e}</option>)}
                </select>
                <a onClick={() => setKfs(prop, kfs.filter((_, j) => j !== i))} title="Delete keyframe">✕</a>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
