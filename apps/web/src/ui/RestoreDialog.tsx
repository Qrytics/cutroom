// Restore: back to Claude's original, to any saved version, or to a .cutroom.json file from your computer.
// Every restore first saves the current state as a version, so a reset can itself be undone.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { useEditor } from '../lib/store.ts';

interface Snap { id: string; label: string; at: number; author: string; clips: number; kind?: 'original' | 'auto' | 'manual' }

export function RestoreDialog({ onClose }: { onClose: () => void }) {
  const id = useEditor((s) => s.project!.id);
  const me = useEditor((s) => s.me);
  const locked = useEditor((s) => !!s.project!.lock && s.project!.lock.holder !== s.me.id);
  const [list, setList] = useState<Snap[] | null>(null);
  const [busy, setBusy] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const toast = useEditor.getState().toast;
  const load = () => api<Snap[]>(`/api/projects/${id}/snapshots`).then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, [id]);

  const restore = async (s: Snap) => {
    if (!confirm(`Restore "${s.label}"?\n\nYour current version is saved first, so you can come back to it.`)) return;
    setBusy(s.id);
    try { await api(`/api/projects/${id}/snapshots/${s.id}/restore`, { method: 'POST', json: { author: me } }); toast(`Restored "${s.label}"`, 'ok'); onClose(); }
    catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(''); }
  };
  const fromFile = async (f: File) => {
    setBusy('file');
    try {
      const text = await f.text();
      const r = await api<{ restored: string; savedAt?: string; missingMedia: string[] }>(`/api/projects/${id}/file`, { method: 'POST', json: { file: text, author: me } });
      toast(`Restored "${r.restored}"${r.savedAt ? ` from ${new Date(r.savedAt).toLocaleString()}` : ''}${r.missingMedia.length ? ` — missing media: ${r.missingMedia.join(', ')}` : ''}`, r.missingMedia.length ? 'error' : 'ok');
      onClose();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(''); if (file.current) file.current.value = ''; }
  };
  const save = async () => {
    const label = prompt('Name this version', `Saved by ${me.name}`);
    if (!label) return;
    await api(`/api/projects/${id}/snapshots`, { method: 'POST', json: { label, author: me } });
    toast('Version saved', 'ok'); load();
  };

  const original = list?.find((s) => s.kind === 'original' || s.label.startsWith("Claude's original"));
  const firstClaude = list ? [...list].reverse().find((s) => s.label.startsWith('Before Claude')) : undefined;
  const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal restore" onClick={(e) => e.stopPropagation()}>
        <h3>Restore a version</h3>
        <p className="muted small">Restoring saves what you have now as a version first — nothing is ever lost.</p>
        {locked && <p className="warn-text small">Someone else holds the lock — you can restore once they finish.</p>}

        <div className="restore-main">
          <button className="primary" disabled={locked || !original || !!busy} onClick={() => original && restore(original)}
            title={original ? original.label : 'Saved automatically when Claude finishes a video'}>
            ↺ Reset to Claude's original
          </button>
          <span className="muted small">{original ? `delivered ${when(original.at)} · ${original.clips} clips` : 'not available yet — saved when Claude finishes editing'}</span>
        </div>

        <div className="restore-row">
          <button disabled={locked || !!busy} onClick={() => file.current?.click()}>📂 Restore from a file on your computer…</button>
          <input ref={file} type="file" accept=".json,.cutroom.json,application/json" hidden onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])} />
          <span className="muted small">a <code>.cutroom.json</code> — every export saves one next to the video in <code>cutroom/data/exports/</code></span>
        </div>
        <div className="restore-row">
          <a className="button" href={`/api/projects/${id}/file`} download>💾 Save this version to a file</a>
          <button onClick={save} disabled={locked}>Save as a version</button>
        </div>

        <h4>All versions</h4>
        <div className="log restore-list">
          {list === null && <div className="muted small">Loading…</div>}
          {list?.length === 0 && <div className="muted small">No versions yet.</div>}
          {list?.map((s) => (
            <div key={s.id} className={`log-item ${s.kind === 'original' ? 'original' : ''}`}>
              <span className="what">{s.kind === 'original' ? '★ ' : ''}{s.label}{s === firstClaude ? ' (the very start)' : ''}</span>
              <span className="when muted">{when(s.at)} · {s.clips} clips</span>
              <button className="ghost small" disabled={locked || !!busy} onClick={() => restore(s)}>{busy === s.id ? '…' : 'Restore'}</button>
            </div>
          ))}
        </div>
        <div className="row end"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
