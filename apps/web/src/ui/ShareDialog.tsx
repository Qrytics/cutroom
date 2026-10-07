// Share: one click turns this computer into a team server (same network, or anyone anywhere through a secure
// tunnel), then shows exactly what to send people — the invite link, and the one command that connects their Claude.
import { useEffect, useState } from 'react';
import { useEditor } from '../lib/store.ts';

interface Team { mode: 'off' | 'network' | 'internet'; lan?: string; public?: string; canStop: boolean; teammateCommand?: string; skillCommand: string }
const REOPEN = 'cutroom.reopenShare';

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project!);
  const [team, setTeam] = useState<Team | null>(null);
  const [host, setHost] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<'' | 'network' | 'internet' | 'stop'>(() => (sessionStorage.getItem(REOPEN) as 'network' | 'internet' | null) || '');
  const toast = useEditor.getState().toast;

  const load = async () => {
    try {
      const r = await fetch('/api/team');
      if (r.status === 403) { setHost(false); return null; }
      if (!r.ok) return null;
      const t = (await r.json()) as Team;
      // servers started before this dialog existed report no mode — infer it from the links
      t.mode ??= t.public ? 'internet' : t.lan ? 'network' : 'off';
      setHost(true); setTeam(t);
      return t;
    } catch { return null; }
  };
  useEffect(() => { load(); }, []);

  // while the server restarts in team mode, keep polling until the invite is ready (survives the page reload)
  useEffect(() => {
    if (!busy) return;
    let alive = true;
    const started = Date.now();
    const tick = async () => {
      if (!alive) return;
      const t = await load();
      const done = t && (busy === 'stop' ? t.mode === 'off' : busy === 'internet' ? t.mode === 'internet' : t.mode !== 'off');
      if (done) { sessionStorage.removeItem(REOPEN); setBusy(''); toast(busy === 'stop' ? 'Sharing stopped — private again' : 'Sharing is on — send the invite link', 'ok'); return; }
      if (Date.now() - started > 120000) { sessionStorage.removeItem(REOPEN); setBusy(''); toast('Sharing did not start — see cutroom/data/team-run.log', 'error'); return; }
      setTimeout(tick, 1500);
    };
    const t = setTimeout(tick, 1500);
    return () => { alive = false; clearTimeout(t); };
  }, [busy]);

  const start = async (internet: boolean) => {
    const mode = internet ? 'internet' : 'network';
    sessionStorage.setItem(REOPEN, mode);
    setBusy(mode);
    try { await fetch('/api/team/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ internet }) }); }
    catch { /* the server is restarting — the poll picks it up */ }
  };
  const stop = async () => {
    if (!confirm('Stop sharing? People using the invite will be disconnected. Your projects stay saved.')) return;
    sessionStorage.setItem(REOPEN, 'stop');
    setBusy('stop');
    try { await fetch('/api/team/stop', { method: 'POST' }); } catch { /* restarting */ }
  };
  const copy = (text: string, what: string) => { navigator.clipboard?.writeText(text).then(() => toast(`${what} copied`, 'ok'), () => toast('Copy failed — select the text and copy it', 'error')); };

  const invite = team?.public || team?.lan;
  const projectInvite = invite ? `${invite}?next=${encodeURIComponent(`/p/${project.id}`)}` : undefined;
  const busyText = busy === 'internet' ? 'Opening a secure tunnel to the internet… (10–30 s; the editor reconnects by itself)'
    : busy === 'network' ? 'Restarting Cutroom so people on your network can join… (a few seconds)' : busy === 'stop' ? 'Stopping sharing…' : '';

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal share" onClick={(e) => e.stopPropagation()}>
        <h3>Share</h3>
        {host === false && (
          <>
            <p className="muted">You joined this session through an invite. Send people this project's link, and they'll need the host's invite link the first time.</p>
            <Copyable value={location.origin + location.pathname} label="Project link" onCopy={copy} />
          </>
        )}

        {host && busy && <div className="share-busy"><span className="spinner" /> {busyText}</div>}

        {host && !busy && team?.mode === 'off' && (
          <>
            <p className="muted">Right now only this computer can open Cutroom. Turn on sharing to edit together live — everyone sees every change.</p>
            <div className="share-choices">
              <button className="primary big" onClick={() => start(true)}>🌐 Share with anyone<small>people anywhere, through a secure link — no setup on their side</small></button>
              <button className="big" onClick={() => start(false)}>🏢 Share on my network<small>people on the same Wi-Fi / office network / VPN</small></button>
            </div>
            <p className="muted small">Only people with the invite link can get in. You can stop sharing any time.</p>
          </>
        )}

        {host && !busy && team && team.mode !== 'off' && invite && (
          <>
            <div className="share-status"><span className="dot on" /> Sharing is on {team.mode === 'internet' ? '— anyone with the invite can join, from anywhere' : '— people on your network with the invite can join'}</div>

            <h4>1 · Send this link</h4>
            <p className="muted small">They open it in a browser — it signs them in and opens this project. Nothing to install.</p>
            <Copyable value={projectInvite!} label="Invite link" onCopy={copy} />
            {team.public && team.lan && <details className="small"><summary className="muted">Same-network link</summary><Copyable value={`${team.lan}?next=${encodeURIComponent(`/p/${project.id}`)}`} label="Network link" onCopy={copy} /></details>}

            <h4>2 · Optional — let their Claude make videos here too</h4>
            <p className="muted small">
              They paste this into <b>Terminal</b> (Mac/Linux; any folder), then restart Claude Code. Needs <a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js 20+</a> and
              {' '}<a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Claude Code</a>. After that, asking their Claude for a video builds it live in this shared editor.
            </p>
            <Copyable value={team.teammateCommand!} label="Command" onCopy={copy} code />

            <div className="share-foot">
              {team.mode === 'internet' && <span className="muted small">The internet address changes if sharing restarts — send the new link then.
                Opening the link on <i>this</i> computer can take a minute to work the first time (your DNS cache); it works for others right away.</span>}
              <div className="row">
                {team.mode === 'network' && <button onClick={() => start(true)}>🌐 Also share over the internet</button>}
                {team.canStop ? <button className="warn" onClick={stop}>Stop sharing</button> : <span className="muted small">Started from the terminal — stop it there with Ctrl+C.</span>}
              </div>
            </div>
          </>
        )}

        {host && !busy && (
          <details className="share-skill small">
            <summary className="muted">Give someone their own Cutroom instead (they host it themselves)</summary>
            <p className="muted small">They paste this into Terminal, then restart Claude Code:</p>
            <Copyable value={team?.skillCommand ?? 'curl -fsSL https://raw.githubusercontent.com/Qrytics/cutroom/main/scripts/install.sh | bash'} label="Command" onCopy={copy} code />
          </details>
        )}

        <div className="row end"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

export function shouldReopenShare() { try { return !!sessionStorage.getItem(REOPEN); } catch { return false; } }

function Copyable({ value, label, onCopy, code = false }: { value: string; label: string; onCopy: (v: string, label: string) => void; code?: boolean }) {
  return (
    <div className={`copyable ${code ? 'code' : ''}`}>
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
      <button className="primary" onClick={() => onCopy(value, label)}>Copy</button>
    </div>
  );
}
