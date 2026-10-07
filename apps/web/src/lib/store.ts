// Editor state: the live project (from the shared Y.Doc), selection, playhead, collaborators.
import { create } from 'zustand';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import * as decoding from 'lib0/decoding';
import { applyOps, hash, readProject, yClips, yMarkers, yMeta, yTracks, type Author, type Op, type OpResult, type Project } from '@cutroom/core';

export interface Me extends Author { color: string }
export interface Peer { clientId: number; id: string; name: string; color: string; selection: string[]; time: number }

export const colorFor = (id: string) => (id === 'claude' ? '#d97757' : `hsl(${hash(id) % 360} 75% 62%)`);

export function loadMe(): Me {
  let me: Author | null = null;
  try { me = JSON.parse(localStorage.getItem('cutroom.me') || 'null'); } catch { /* storage unavailable */ }
  if (!me?.id) me = { id: `u${Math.random().toString(36).slice(2, 9)}`, name: '' };
  // links opened by Claude carry ?name=<the user's name> so the first visit goes straight into the editor
  const fromUrl = new URLSearchParams(location.search).get('name')?.trim();
  if (!me.name && fromUrl) { me = { ...me, name: fromUrl.slice(0, 40) }; saveMe(me); }
  return { ...me, color: colorFor(me.id) };
}
export function saveMe(me: Author) {
  try { localStorage.setItem('cutroom.me', JSON.stringify({ id: me.id, name: me.name })); } catch { /* storage unavailable */ }
}

interface Toast { id: number; text: string; kind?: 'info' | 'error' | 'ok' }

interface State {
  project: Project | null;
  connected: boolean;
  me: Me;
  peers: Peer[];
  selection: string[];
  time: number;
  playing: boolean;
  pxPerSec: number;
  follow: boolean;
  safeArea: boolean;
  flashes: Record<string, number>;
  toasts: Toast[];
  set: (p: Partial<State>) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
}

export const useEditor = create<State>((set, get) => ({
  project: null,
  connected: false,
  me: loadMe(),
  peers: [],
  selection: [],
  time: 0,
  playing: false,
  pxPerSec: 80,
  follow: true,
  safeArea: false,
  flashes: {},
  toasts: [],
  set: (p) => set(p),
  toast: (text, kind = 'info') => {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === 'error' ? 6000 : 3500);
  },
}));

const MSG_REJECTED = 100;

/** One open project: the shared doc, its websocket, awareness and the local undo stack. */
export class Session {
  doc!: Y.Doc;
  provider!: WebsocketProvider;
  undo!: Y.UndoManager;
  readonly origin = { local: true };
  private raf = 0;
  private lastLogId: string | null = null;
  private lastLog = { key: '', at: 0 };

  constructor(readonly id: string) { this.connect(); }

  private connect() {
    const st = useEditor.getState();
    this.doc = new Y.Doc();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.provider = new WebsocketProvider(`${proto}://${location.host}/yjs`, this.id, this.doc, { params: { user: st.me.id, name: st.me.name } });
    this.provider.messageHandlers[MSG_REJECTED] = (_enc, dec) => {
      const why = decoding.readVarString(dec);
      useEditor.getState().toast(why, 'error');
      setTimeout(() => this.reconnect(), 0);
    };
    this.provider.on('status', ({ status }: { status: string }) => useEditor.setState({ connected: status === 'connected' }));
    this.provider.on('sync', (synced: boolean) => { if (synced) this.refresh(); });
    this.undo = new Y.UndoManager([yMeta(this.doc), yTracks(this.doc), yClips(this.doc), yMarkers(this.doc)], { trackedOrigins: new Set([this.origin]), captureTimeout: 400 });
    this.undo.on('stack-item-added', () => this.refresh());
    this.doc.on('update', (_u: Uint8Array, origin: unknown) => this.onUpdate(origin));
    const aw = this.provider.awareness;
    aw.setLocalStateField('user', { id: st.me.id, name: st.me.name, color: st.me.color });
    aw.on('change', () => {
      const peers: Peer[] = [];
      aw.getStates().forEach((s, clientId) => {
        if (clientId === aw.clientID || !s.user) return;
        peers.push({ clientId, id: s.user.id, name: s.user.name, color: s.user.color, selection: s.selection ?? [], time: s.time ?? 0 });
      });
      useEditor.setState({ peers });
    });
  }

  /** Drop local state and resync from the server (after a rejected edit). */
  reconnect() {
    this.provider.destroy(); this.undo.destroy(); this.doc.destroy();
    this.lastLogId = null;
    this.connect();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.provider.destroy(); this.undo.destroy(); this.doc.destroy();
  }

  private onUpdate(origin: unknown) {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.refresh(origin !== this.origin));
  }

  refresh(remote = false) {
    const p = readProject(this.doc, this.id);
    const st = useEditor.getState();
    const patch: Partial<State> = { project: p };
    const lastId = p.log[p.log.length - 1]?.id ?? '';
    if (this.lastLogId !== null && lastId !== this.lastLogId && remote) {
      const seen = p.log.findIndex((e) => e.id === this.lastLogId);
      const fresh = p.log.slice(seen + 1).filter((e) => e.author !== st.me.id);
      if (fresh.length) {
        const flashes = { ...st.flashes };
        for (const e of fresh) if (e.targetId) flashes[e.targetId] = Date.now();
        patch.flashes = flashes;
        const last = fresh[fresh.length - 1];
        if (st.follow && p.lock && p.lock.holder === last.author && !st.playing) {
          if (last.targetId && p.clips[last.targetId]) patch.selection = [last.targetId];
          if (typeof last.t === 'number') patch.time = Math.max(0, last.t + 0.05);
        }
      }
    }
    this.lastLogId = lastId;
    useEditor.setState(patch);
  }

  get readOnly() {
    const p = useEditor.getState().project;
    return !!p?.lock && p.lock.holder !== useEditor.getState().me.id;
  }

  /** Every UI edit goes through here: lock check, op application, undo tracking, throttled activity log. */
  edit(ops: Op[], opts: { log?: boolean; key?: string } = {}): OpResult[] | null {
    if (this.readOnly) {
      const l = useEditor.getState().project!.lock!;
      useEditor.getState().toast(`${l.holderName} is editing — you can watch, play and scrub until they finish.`, 'info');
      return null;
    }
    const me = useEditor.getState().me;
    let log = opts.log ?? true;
    if (log && opts.key) {
      const now = Date.now();
      if (this.lastLog.key === opts.key && now - this.lastLog.at < 2500) log = false;
      this.lastLog = { key: opts.key, at: now };
    }
    try {
      return applyOps(this.doc, ops, me, { origin: this.origin, log, validate: ops.length > 1 });
    } catch (e) {
      useEditor.getState().toast((e as Error).message, 'error');
      return null;
    }
  }

  setAwareness(fields: Record<string, unknown>) {
    for (const [k, v] of Object.entries(fields)) this.provider.awareness.setLocalStateField(k, v);
  }
}

let current: Session | null = null;
export const session = () => current!;
export function openSession(id: string) { current?.destroy(); current = new Session(id); return current; }
export function closeSession() { current?.destroy(); current = null; useEditor.setState({ project: null, selection: [], time: 0, playing: false }); }
