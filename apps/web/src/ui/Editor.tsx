import { useEffect, useState } from 'react';
import { projectDuration, type Op } from '@cutroom/core';
import { closeSession, openSession, saveMe, session, useEditor } from '../lib/store.ts';
import { player } from '../lib/player.ts';
import { uploadFiles } from '../lib/api.ts';
import { TopBar } from './TopBar.tsx';
import { LockBanner } from './LockBanner.tsx';
import { Library } from './Library.tsx';
import { Preview } from './Preview.tsx';
import { Inspector } from './Inspector.tsx';
import { Timeline } from './Timeline.tsx';
import { SidePanel } from './SidePanel.tsx';
import { Toasts } from './Toasts.tsx';

export function Editor({ projectId }: { projectId: string }) {
  const project = useEditor((s) => s.project);
  const me = useEditor((s) => s.me);
  const lock = useEditor((s) => s.project?.lock);
  const readOnly = !!lock && lock.holder !== me.id;
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // no name yet: ask in place (below) instead of redirecting, so a shared/opened project link keeps working
    if (!me.name) return;
    openSession(projectId);
    return () => { player.pause(); closeSession(); };
  }, [projectId, me.name]);

  // share selection + playhead with collaborators
  useEffect(() => useEditor.subscribe((s, prev) => {
    if (s.selection !== prev.selection) session()?.setAwareness({ selection: s.selection });
  }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.closest('input, textarea, select, [contenteditable]')) return;
      const st = useEditor.getState();
      const s = session();
      if (!st.project || !s) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); player.toggle(); }
      else if (mod && k === 'z') { e.preventDefault(); if (s.readOnly) return; if (e.shiftKey) s.undo.redo(); else s.undo.undo(); }
      else if (mod && k === 'y') { e.preventDefault(); if (!s.readOnly) s.undo.redo(); }
      else if (mod && k === 'd') {
        e.preventDefault();
        const res = s.edit(st.selection.map((id) => ({ op: 'duplicateClip', id }) as Op));
        if (res) st.set({ selection: res.map((r) => r.id!).filter(Boolean) });
      }
      else if (mod && k === 'a') { e.preventDefault(); st.set({ selection: Object.keys(st.project.clips) }); }
      else if (k === 's' || (mod && k === 'k')) {
        e.preventDefault();
        const t = st.time;
        const ids = (st.selection.length ? st.selection : Object.keys(st.project.clips)).filter((id) => {
          const c = st.project!.clips[id];
          return c && t > c.start + 0.01 && t < c.start + c.duration - 0.01;
        });
        if (ids.length) s.edit(ids.map((id) => ({ op: 'splitClip', id, t })));
      }
      else if (k === 'delete' || k === 'backspace') {
        if (!st.selection.length) return;
        e.preventDefault();
        if (s.edit(st.selection.filter((id) => st.project!.clips[id]).map((id) => ({ op: e.shiftKey ? 'rippleDelete' : 'removeClip', id }) as Op))) st.set({ selection: [] });
      }
      else if (k === 'arrowleft') { e.preventDefault(); e.shiftKey ? player.seek(st.time - 1) : player.step(-1); }
      else if (k === 'arrowright') { e.preventDefault(); e.shiftKey ? player.seek(st.time + 1) : player.step(1); }
      else if (k === 'home') player.seek(0);
      else if (k === 'end') player.seek(projectDuration(st.project));
      else if (k === 'j') player.seek(st.time - 2);
      else if (k === 'k') player.pause();
      else if (k === 'l') player.play();
      else if (k === 'm') s.edit([{ op: 'addMarker', t: st.time, label: `Marker ${Object.keys(st.project.markers).length + 1}` }]);
      else if (k === '=' || k === '+') st.set({ pxPerSec: Math.min(2000, st.pxPerSec * 1.25) });
      else if (k === '-') st.set({ pxPerSec: Math.max(4, st.pxPerSec / 1.25) });
      else if (k === 'escape') st.set({ selection: [] });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDrop = async (e: React.DragEvent) => {
    setDragging(false);
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    if (readOnly) { useEditor.getState().toast('Claude is editing — you can import once it finishes.'); return; }
    const files = [...e.dataTransfer.files];
    const st = useEditor.getState();
    try {
      await uploadFiles(projectId, files, me, (n) => st.toast(`Importing ${n}…`));
      st.toast(`Imported ${files.length} file${files.length > 1 ? 's' : ''}`, 'ok');
    } catch (err) { st.toast(String((err as Error).message), 'error'); }
  };

  if (!me.name) return <JoinPrompt />;
  if (!project) return <Connecting projectId={projectId} />;

  return (
    <div className={`editor ${readOnly ? 'readonly' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}>
      <TopBar />
      <LockBanner />
      <div className="workspace">
        <Library />
        <Preview />
        <div className="right-col">
          <Inspector />
          <SidePanel />
        </div>
      </div>
      <Timeline />
      <Toasts />
      {dragging && <div className="drop-overlay">Drop files to import into the media library</div>}
    </div>
  );
}

/** Loading state that never hangs silently: after a few seconds it says why and offers a retry. */
function Connecting({ projectId }: { projectId: string }) {
  const [problem, setProblem] = useState('');
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}?log=0`);
        setProblem(r.status === 404 ? `There is no project "${projectId}".` : 'The project exists but live sync has not connected yet.');
      } catch { setProblem('The Cutroom server is not responding — start it with `npm start` in the cutroom folder.'); }
    }, 6000);
    return () => clearTimeout(timer);
  }, [projectId]);
  return (
    <div className="loading">
      <div>Connecting to project…</div>
      {problem && (
        <div className="muted small" style={{ marginTop: 12 }}>
          {problem} <button className="ghost small" onClick={() => location.reload()}>Retry</button> <a href="/">All projects</a>
        </div>
      )}
    </div>
  );
}

function JoinPrompt() {
  const me = useEditor((s) => s.me);
  const [name, setName] = useState('');
  const join = () => { const m = { ...me, name: name.trim() }; saveMe(m); useEditor.setState({ me: m }); };
  return (
    <div className="home">
      <section className="card narrow">
        <h2>What should collaborators call you?</h2>
        <div className="row">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && join()} placeholder="Your name" />
          <button className="primary" disabled={!name.trim()} onClick={join}>Join project</button>
        </div>
      </section>
    </div>
  );
}
