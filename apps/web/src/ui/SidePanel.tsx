import { useEffect, useState } from 'react';
import { api, fmtTime } from '../lib/api.ts';
import { player } from '../lib/player.ts';
import { colorFor, useEditor } from '../lib/store.ts';

interface Snap { id: string; label: string; at: number; author: string; clips: number }

export function SidePanel() {
  const [tab, setTab] = useState<'activity' | 'versions'>('activity');
  return (
    <div className="panel side">
      <div className="tabs">
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Activity</button>
        <button className={tab === 'versions' ? 'active' : ''} onClick={() => setTab('versions')}>Versions</button>
      </div>
      <div className="panel-body">{tab === 'activity' ? <Activity /> : <Versions />}</div>
    </div>
  );
}

function Activity() {
  const log = useEditor((s) => s.project!.log);
  const clips = useEditor((s) => s.project!.clips);
  const [who, setWho] = useState<'all' | 'claude'>('all');
  const items = [...log].reverse().filter((l) => who === 'all' || l.author === 'claude').slice(0, 300);
  return (
    <>
      <div className="row between small">
        <span className="muted">Every edit, by everyone. Click one to jump to it.</span>
        <select value={who} onChange={(e) => setWho(e.target.value as 'all' | 'claude')}><option value="all">Everyone</option><option value="claude">Claude only</option></select>
      </div>
      <div className="log">
        {items.map((l) => (
          <div key={l.id} className={`log-item ${l.targetId && clips[l.targetId] ? 'link' : ''}`} onClick={() => {
            if (l.targetId && clips[l.targetId]) useEditor.setState({ selection: [l.targetId] });
            if (typeof l.t === 'number') player.seek(l.t);
          }}>
            <span className="who" style={{ color: colorFor(l.author) }}>{l.authorName}</span>
            <span className="what">{l.summary}</span>
            <span className="when muted">{new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{typeof l.t === 'number' ? ` · ${fmtTime(l.t)}` : ''}</span>
          </div>
        ))}
        {!items.length && <div className="muted small">Nothing yet.</div>}
      </div>
    </>
  );
}

function Versions() {
  const id = useEditor((s) => s.project!.id);
  const me = useEditor((s) => s.me);
  const locked = useEditor((s) => !!s.project!.lock && s.project!.lock.holder !== s.me.id);
  const [list, setList] = useState<Snap[]>([]);
  const load = () => api<Snap[]>(`/api/projects/${id}/snapshots`).then(setList).catch(() => {});
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [id]);
  const save = async () => {
    const label = prompt('Name this version', `Saved by ${me.name}`);
    if (!label) return;
    await api(`/api/projects/${id}/snapshots`, { method: 'POST', json: { label, author: me } });
    load();
  };
  const restore = async (s: Snap) => {
    if (!confirm(`Restore "${s.label}"? The current state is saved as a version first, so this can be undone.`)) return;
    try { await api(`/api/projects/${id}/snapshots/${s.id}/restore`, { method: 'POST', json: { author: me } }); useEditor.getState().toast(`Restored "${s.label}"`, 'ok'); load(); }
    catch (e) { useEditor.getState().toast((e as Error).message, 'error'); }
  };
  const lastClaude = list.find((s) => s.label.startsWith('Before Claude'));
  return (
    <>
      <div className="row wrap">
        <button onClick={save} disabled={locked}>Save version</button>
        {lastClaude && <button onClick={() => restore(lastClaude)} disabled={locked} title={lastClaude.label}>↺ Undo Claude's last run</button>}
      </div>
      <p className="muted small">A version is saved automatically every time Claude starts editing.</p>
      <div className="log">
        {list.map((s) => (
          <div key={s.id} className="log-item">
            <span className="what">{s.label}</span>
            <span className="when muted">{new Date(s.at).toLocaleString()} · {s.clips} clips</span>
            <button className="ghost small" disabled={locked} onClick={() => restore(s)}>Restore</button>
          </div>
        ))}
      </div>
    </>
  );
}
