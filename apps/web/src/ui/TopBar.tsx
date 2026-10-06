import { useEffect, useState } from 'react';
import { projectDuration } from '@cutroom/core';
import { api, fmtTime } from '../lib/api.ts';
import { colorFor, session, useEditor } from '../lib/store.ts';
import { navigate } from '../main.tsx';

interface Job { id: string; status: string; progress: number; message: string; url?: string; error?: string; preset: string }

export function TopBar() {
  const project = useEditor((s) => s.project)!;
  const me = useEditor((s) => s.me);
  const peers = useEditor((s) => s.peers);
  const connected = useEditor((s) => s.connected);
  const safeArea = useEditor((s) => s.safeArea);
  const [exporting, setExporting] = useState(false);
  const lock = project.lock;
  const mine = lock?.holder === me.id;
  const readOnly = !!lock && !mine;
  const people = [...new Map(peers.map((p) => [p.id, p])).values()];

  const holdLock = async () => {
    try {
      if (mine) await api(`/api/projects/${project.id}/lock?holder=${encodeURIComponent(me.id)}`, { method: 'DELETE' });
      else await api(`/api/projects/${project.id}/lock`, { method: 'POST', json: { holder: me.id, holderName: me.name, task: 'Editing by hand' } });
    } catch (e) { useEditor.getState().toast((e as Error).message, 'error'); }
  };

  return (
    <div className="topbar">
      <button className="ghost" onClick={() => navigate('/')} title="All projects">◀</button>
      <div className="logo small"><span className="logo-mark">▶</span></div>
      <input className="title-input" value={project.meta.name} disabled={readOnly}
        onChange={(e) => session().edit([{ op: 'setMeta', name: e.target.value }], { key: 'rename' })} />
      <span className="muted small">{project.meta.width}×{project.meta.height} · {project.meta.fps}fps · {fmtTime(projectDuration(project))}</span>
      <span className={`dot ${connected ? 'on' : 'off'}`} title={connected ? 'Live — synced' : 'Reconnecting…'} />
      <div className="spacer" />
      <div className="avatars">
        {lock?.holder === 'claude' && <span className="avatar claude" title="Claude is editing">✳</span>}
        <span className="avatar" style={{ background: me.color }} title={`${me.name} (you)`}>{me.name.slice(0, 1).toUpperCase()}</span>
        {people.map((p) => <span key={p.id} className="avatar" style={{ background: p.color || colorFor(p.id) }} title={p.name}>{(p.name || '?').slice(0, 1).toUpperCase()}</span>)}
      </div>
      <button className="ghost" disabled={readOnly} title="Undo (⌘Z)" onClick={() => session().undo.undo()}>↶</button>
      <button className="ghost" disabled={readOnly} title="Redo (⇧⌘Z)" onClick={() => session().undo.redo()}>↷</button>
      <button className={`ghost ${safeArea ? 'active' : ''}`} title="Safe-area guides" onClick={() => useEditor.setState({ safeArea: !safeArea })}>▣</button>
      {(!lock || mine) && <button className={mine ? 'warn' : 'ghost'} title="Lock the project so nobody else edits while you work" onClick={holdLock}>{mine ? '🔓 Release lock' : '🔒 Hold lock'}</button>}
      <button className="ghost" title="Copy a link collaborators can open" onClick={() => { navigator.clipboard?.writeText(location.href); useEditor.getState().toast('Link copied — anyone on your network can join'); }}>Share</button>
      <button className="primary" onClick={() => setExporting(true)}>Export</button>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}

function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project)!;
  const [presets, setPresets] = useState<{ key: string; label: string }[]>([]);
  const [preset, setPreset] = useState('mp4');
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => { api<typeof presets>('/api/presets').then(setPresets); }, []);
  useEffect(() => {
    const load = () => api<Job[]>(`/api/projects/${project.id}/jobs`).then(setJobs).catch(() => {});
    load();
    const i = setInterval(load, 700);
    return () => clearInterval(i);
  }, [project.id]);
  const start = async () => {
    try { await api(`/api/projects/${project.id}/export`, { method: 'POST', json: { preset } }); }
    catch (e) { useEditor.getState().toast((e as Error).message, 'error'); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Export video</h3>
        <p className="muted small">Rendered frame-by-frame with the same engine as the preview — what you see is what you get.</p>
        <div className="row">
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>{presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
          <button className="primary" onClick={start}>Render</button>
        </div>
        <div className="jobs">
          {jobs.map((j) => (
            <div key={j.id} className="job">
              <div className="row between"><span>{j.preset.toUpperCase()} · {j.status}</span><span className="muted small">{j.message}</span></div>
              {j.status !== 'done' && j.status !== 'error' && <div className="bar"><div style={{ width: `${(j.progress * 100).toFixed(1)}%` }} /></div>}
              {j.url && <a className="primary-link" href={j.url} download>Download ↓</a>}
              {j.url && <video src={j.url} controls className="job-preview" />}
              {j.error && <div className="error small">{j.error}</div>}
            </div>
          ))}
        </div>
        <div className="row end"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
