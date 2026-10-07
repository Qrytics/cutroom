import { useEffect, useRef, useState } from 'react';
import { COMPONENTS, DEFAULT_META, drawFrame, SFX, type ComponentDef, type Project } from '@cutroom/core';
import { uploadFiles, fmtTime } from '../lib/api.ts';
import { player } from '../lib/player.ts';
import { useEditor } from '../lib/store.ts';
import { loadFonts } from '../fonts.ts';
import { addToTimeline, DND_TYPE, type LibItem } from './actions.ts';
import { ToolButtons } from './CreateTools.tsx';

type Tab = 'media' | 'graphics' | 'sounds';

export function Library() {
  const [tab, setTab] = useState<Tab>('media');
  return (
    <div className="panel library">
      <div className="tabs">
        {(['media', 'graphics', 'sounds'] as Tab[]).map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      <div className="panel-body">
        {tab === 'media' && <MediaTab />}
        {tab === 'graphics' && <GraphicsTab />}
        {tab === 'sounds' && <SoundsTab />}
      </div>
    </div>
  );
}

const drag = (item: LibItem) => (e: React.DragEvent) => { e.dataTransfer.setData(DND_TYPE, JSON.stringify(item)); e.dataTransfer.effectAllowed = 'copy'; };

function MediaTab() {
  const media = useEditor((s) => s.project!.media);
  const id = useEditor((s) => s.project!.id);
  const me = useEditor((s) => s.me);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const items = Object.values(media);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    try { await uploadFiles(id, [...files], me, (n) => setBusy(n)); }
    catch (e) { useEditor.getState().toast((e as Error).message, 'error'); }
    setBusy('');
  };
  return (
    <>
      <button className="block" onClick={() => input.current?.click()} disabled={!!busy}>{busy ? `Importing ${busy}…` : '+ Import media'}</button>
      <input ref={input} type="file" multiple hidden accept="video/*,audio/*,image/*" onChange={(e) => pick(e.target.files)} />
      <p className="muted small">Or drag files anywhere onto the editor. Video, audio, images, GIFs, SVG.</p>
      <div className="media-grid">
        {items.map((m) => (
          <div key={m.id} className="media-item" draggable onDragStart={drag({ type: m.kind, mediaId: m.id })}
            onDoubleClick={() => addToTimeline({ type: m.kind, mediaId: m.id })} title="Drag to the timeline, or double-click to add at the playhead">
            <div className={`thumb ${m.kind}`}>{m.thumbUrl ? <img src={m.thumbUrl} alt="" /> : <span>{m.kind === 'audio' ? '♪' : '▶'}</span>}
              {m.kind !== 'image' && <span className="dur">{fmtTime(m.duration)}</span>}</div>
            <div className="name">{m.name}</div>
          </div>
        ))}
      </div>
    </>
  );
}

const thumbCache = new Map<string, string>();
async function componentThumb(def: ComponentDef) {
  if (thumbCache.has(def.key)) return thumbCache.get(def.key)!;
  await loadFonts();
  const c = document.createElement('canvas');
  c.width = 1920; c.height = 1080;
  const t = Math.min(def.defaultDuration * 0.6, 2.2);
  const p: Project = {
    id: 'thumb', meta: { ...DEFAULT_META, background: '#141821' }, media: {}, markers: {}, lock: null, log: [],
    tracks: { t: { id: 't', name: 'V1', kind: 'visual', order: 0, muted: false, hidden: false, locked: false } },
    clips: { c: { id: 'c', trackId: 't', type: 'component', component: def.key, name: '', start: 0, duration: def.defaultDuration, inPoint: 0, speed: 1, props: { animOut: 'none' }, keyframes: {} } },
  };
  drawFrame(c.getContext('2d')!, p, def.key === 'stripeWipe' || def.key === 'flash' ? def.defaultDuration * 0.35 : t, { visual: () => null });
  const small = document.createElement('canvas');
  small.width = 256; small.height = 144;
  small.getContext('2d')!.drawImage(c, 0, 0, 256, 144);
  const url = small.toDataURL('image/jpeg', 0.8);
  thumbCache.set(def.key, url);
  return url;
}

function Thumb({ def }: { def: ComponentDef }) {
  const [src, setSrc] = useState(thumbCache.get(def.key) || '');
  useEffect(() => { if (!src) componentThumb(def).then(setSrc); }, [def, src]);
  return src ? <img src={src} alt="" /> : <span />;
}

function GraphicsTab() {
  const groups = new Map<string, ComponentDef[]>();
  for (const c of Object.values(COMPONENTS)) (groups.get(c.category) ?? groups.set(c.category, []).get(c.category)!).push(c);
  return (
    <>
      <div className="group-label">Create your own</div>
      <div className="create-tools"><ToolButtons /></div>
      <p className="muted small">Pick a tool, then click or drag on the preview. Color, thickness and look are in the bar above the preview.</p>
      {[...groups].map(([cat, defs]) => (
        <div key={cat}>
          <div className="group-label">{cat}</div>
          <div className="comp-grid">
            {defs.map((d) => (
              <div key={d.key} className="comp-item" draggable onDragStart={drag({ type: 'component', component: d.key })}
                onClick={() => addToTimeline({ type: 'component', component: d.key })} title={d.description}>
                <div className="thumb"><Thumb def={d} /></div>
                <div className="name">{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function SoundsTab() {
  const groups = new Map<string, (typeof SFX)[string][]>();
  for (const s of Object.values(SFX)) (groups.get(s.category) ?? groups.set(s.category, []).get(s.category)!).push(s);
  return (
    <>
      <p className="muted small">Every sound is synthesized live, so pitch, length, mood and variation stay editable. ▶ to audition.</p>
      {[...groups].map(([cat, defs]) => (
        <div key={cat}>
          <div className="group-label">{cat}</div>
          {defs.map((d) => (
            <div key={d.key} className="sound-item" draggable onDragStart={drag({ type: 'sfx', component: d.key })} title={d.description}>
              <button className="ghost small" onClick={() => player.audio().audition(d.key)}>▶</button>
              <span className="name" onDoubleClick={() => addToTimeline({ type: 'sfx', component: d.key })}>{d.label}</span>
              <span className="muted small">{d.stretch ? 'stretch' : `${d.defaultDuration}s`}</span>
              <button className="ghost small" onClick={() => addToTimeline({ type: 'sfx', component: d.key })} title="Add at playhead">＋</button>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
