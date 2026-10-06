import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { saveMe, useEditor } from '../lib/store.ts';
import { navigate } from '../main.tsx';

interface Info { id: string; name: string; updatedAt: number; width: number; height: number; fps: number }

const SIZES: Record<string, [number, number]> = {
  'Landscape 16:9 (1920×1080)': [1920, 1080],
  'Vertical 9:16 — Reels / TikTok / Shorts (1080×1920)': [1080, 1920],
  'Square 1:1 (1080×1080)': [1080, 1080],
  'Portrait 4:5 (1080×1350)': [1080, 1350],
  '4K 16:9 (3840×2160)': [3840, 2160],
};

export function Home() {
  const me = useEditor((s) => s.me);
  const [name, setName] = useState(me.name);
  const [list, setList] = useState<Info[]>([]);
  const [title, setTitle] = useState('');
  const [size, setSize] = useState(Object.keys(SIZES)[0]);
  const [fps, setFps] = useState(30);
  const [err, setErr] = useState('');

  const load = () => api<Info[]>('/api/projects').then(setList).catch((e) => setErr(String(e.message)));
  useEffect(() => { load(); const i = setInterval(load, 4000); return () => clearInterval(i); }, []);

  const saveName = () => { const m = { ...me, name: name.trim() }; saveMe(m); useEditor.setState({ me: m }); };

  const create = async () => {
    const [width, height] = SIZES[size];
    const p = await api<{ id: string }>('/api/projects', { method: 'POST', json: { name: title || 'Untitled video', width, height, fps } });
    navigate(`/p/${p.id}`);
  };

  return (
    <div className="home">
      <header className="home-head">
        <div className="logo"><span className="logo-mark">▶</span> Cutroom</div>
        <div className="muted">A video editor you and Claude share. Watch every edit land, then change anything.</div>
      </header>
      {!me.name ? (
        <section className="card narrow">
          <h2>What should collaborators call you?</h2>
          <div className="row">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && saveName()} placeholder="Your name" />
            <button className="primary" disabled={!name.trim()} onClick={saveName}>Continue</button>
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>New project</h2>
            <div className="row wrap">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project name" onKeyDown={(e) => e.key === 'Enter' && create()} />
              <select value={size} onChange={(e) => setSize(e.target.value)}>{Object.keys(SIZES).map((k) => <option key={k}>{k}</option>)}</select>
              <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>{[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select>
              <button className="primary" onClick={create}>Create</button>
            </div>
            <p className="muted small">Or just ask Claude: <code>make me a video of this project</code> — it shows up here and you can watch it being edited.</p>
          </section>
          <section className="card">
            <h2>Projects <span className="muted small">signed in as {me.name} · <a onClick={() => useEditor.setState({ me: { ...me, name: '' } })}>change</a></span></h2>
            {err && <div className="error">{err}</div>}
            {!list.length && <div className="muted">No projects yet.</div>}
            <div className="project-grid">
              {list.map((p) => (
                <a key={p.id} className="project-card" href={`/p/${p.id}`} onClick={(e) => { e.preventDefault(); navigate(`/p/${p.id}`); }}>
                  <img src={`/api/projects/${p.id}/frame?t=1&scale=0.2`} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
                  <div className="pc-name">{p.name}</div>
                  <div className="muted small">{p.width}×{p.height} · {p.fps} fps · {new Date(p.updatedAt).toLocaleString()}</div>
                </a>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
