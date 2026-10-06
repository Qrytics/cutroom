import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { useEditor } from '../lib/store.ts';

export function LockBanner() {
  const lock = useEditor((s) => s.project?.lock);
  const id = useEditor((s) => s.project?.id);
  const last = useEditor((s) => (s.project?.lock ? s.project.log.filter((l) => l.author === s.project!.lock!.holder).at(-1) : undefined));
  const me = useEditor((s) => s.me);
  const follow = useEditor((s) => s.follow);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, []);
  if (!lock || lock.holder === me.id) return null;
  const secs = Math.floor((Date.now() - lock.since) / 1000);
  const idle = Math.floor((Date.now() - (lock.lastActivity ?? lock.since)) / 1000);
  const isClaude = lock.holder === 'claude';
  const takeOver = async () => {
    if (!confirm(`${lock.holderName} is still holding the lock. Take over editing anyway?`)) return;
    await api(`/api/projects/${id}/lock?force=1`, { method: 'DELETE' }).catch((e) => useEditor.getState().toast(e.message, 'error'));
  };
  return (
    <div className={`lock-banner ${isClaude ? 'claude' : ''}`}>
      <span className="pulse" />
      <b>{isClaude ? 'Claude is editing' : `${lock.holderName} is editing`}</b>
      <span className="task">— {lock.task}</span>
      <span className="muted small">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} elapsed</span>
      {last && <span className="last">{last.summary}</span>}
      <div className="spacer" />
      <span className="muted small">View-only: play, scrub and inspect freely. Editing unlocks when {isClaude ? 'Claude' : lock.holderName} is done.</span>
      <label className="follow"><input type="checkbox" checked={follow} onChange={(e) => useEditor.setState({ follow: e.target.checked })} /> Follow edits</label>
      <button className="ghost small" onClick={takeOver} title={idle > 90 ? `No edits for ${idle}s` : 'Force-release the lock'}>{idle > 90 ? `Idle ${Math.floor(idle / 60)}m — take over` : 'Take over'}</button>
    </div>
  );
}
