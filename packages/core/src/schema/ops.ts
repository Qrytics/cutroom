// Edit operations. Claude (via the server API) and humans (via the editor UI) both go through these,
// which is why anything Claude builds is editable with the same tools.
import * as Y from 'yjs';
import { COMPONENTS } from '../components/index.ts';
import { SFX } from '../audio/synth.ts';
import { appendLog, readClip, readProject, replaceContent, uid, writeClip, writeTrack, yClips, yMarkers, yMedia, yMeta, yTracks } from './doc.ts';
import { isAudible } from './props.ts';
import { hash } from '../engine/ease.ts';
import { lintClip, lintPlacement } from './lint.ts';
import type { Author, Clip, ClipType, Ease, Keyframe, Marker, Media, Meta, Project, Props, Track, TrackKind } from './types.ts';

export type Op =
  | ({ op: 'setMeta' } & Partial<Meta>)
  | { op: 'addTrack'; id?: string; name?: string; kind: TrackKind; order?: number }
  | { op: 'updateTrack'; id: string; name?: string; order?: number; muted?: boolean; hidden?: boolean; locked?: boolean }
  | { op: 'removeTrack'; id: string }
  | { op: 'addClip'; id?: string; trackId?: string; type: ClipType; start: number; duration?: number; mediaId?: string; component?: string;
      name?: string; inPoint?: number; speed?: number; props?: Props; keyframes?: Record<string, Keyframe[]> }
  | { op: 'updateClip'; id: string; start?: number; duration?: number; inPoint?: number; speed?: number; trackId?: string; name?: string }
  | { op: 'setProps'; id: string; props: Props }
  | { op: 'setKeyframes'; id: string; prop: string; keyframes: Keyframe[] }
  | { op: 'addKeyframe'; id: string; prop: string; t: number; v: number | string; ease?: Ease }
  | { op: 'removeKeyframe'; id: string; prop: string; t: number }
  | { op: 'removeClip'; id: string }
  | { op: 'rippleDelete'; id: string }
  | { op: 'splitClip'; id: string; t: number; newId?: string }
  | { op: 'duplicateClip'; id: string; newId?: string; start?: number; trackId?: string }
  | { op: 'addMarker'; id?: string; t: number; label: string; color?: string }
  | { op: 'removeMarker'; id: string }
  | { op: 'addMedia'; media: Media }
  | { op: 'removeMedia'; id: string }
  | { op: 'clear' }
  | { op: 'replaceProject'; project: Pick<Project, 'meta' | 'tracks' | 'clips' | 'markers'> };

export interface OpResult { op: string; id?: string; summary: string; warnings?: string[] }

export const fmtT = (t: number) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

const EPS = 1e-4;

function clipY(d: Y.Doc, id: string) {
  const y = yClips(d).get(id);
  if (!y) throw new Error(`no clip "${id}"`);
  return y;
}

function labelOf(c: Pick<Clip, 'type' | 'component' | 'name' | 'props'>) {
  if (c.name) return `"${c.name}"`;
  const txt = typeof c.props?.text === 'string' ? `"${String(c.props.text).slice(0, 28)}"` : '';
  if (c.type === 'component') return `${COMPONENTS[c.component ?? '']?.label ?? c.component} ${txt}`.trim();
  if (c.type === 'sfx') return `${SFX[c.component ?? '']?.label ?? c.component} sound`;
  return c.type;
}

export function defaultDuration(p: Project, o: { type: ClipType; mediaId?: string; component?: string; inPoint?: number }) {
  if (o.type === 'component') return COMPONENTS[o.component ?? '']?.defaultDuration ?? 4;
  if (o.type === 'sfx') return SFX[o.component ?? '']?.defaultDuration ?? 1;
  if (o.type === 'image') return 5;
  const m = p.media[o.mediaId ?? ''];
  return m ? Math.max(0.1, m.duration - (o.inPoint ?? 0)) : 5;
}

/** First track of the right kind with a free slot, or a new one. */
function pickTrack(d: Y.Doc, p: Project, type: ClipType, start: number, dur: number, exclude?: string): string {
  const kind: TrackKind = type === 'audio' || type === 'sfx' ? 'audio' : 'visual';
  const tracks = Object.values(p.tracks).filter((t) => t.kind === kind && !t.locked).sort((a, b) => (kind === 'visual' ? a.order - b.order : a.order - b.order));
  for (const t of tracks) {
    const busy = Object.values(p.clips).some((c) => c.id !== exclude && c.trackId === t.id && c.start < start + dur - EPS && c.start + c.duration > start + EPS);
    if (!busy) return t.id;
  }
  return newTrack(d, p, kind).id;
}

function newTrack(d: Y.Doc, p: Project, kind: TrackKind, o: { id?: string; name?: string; order?: number } = {}): Track {
  const same = Object.values(p.tracks).filter((t) => t.kind === kind);
  const order = o.order ?? (same.length ? Math.max(...same.map((t) => t.order)) + 1 : 0);
  const t: Track = { id: o.id || uid('trk'), name: o.name || `${kind === 'visual' ? 'V' : 'A'}${same.length + 1}`, kind, order, muted: false, hidden: false, locked: false };
  writeTrack(d, t);
  p.tracks[t.id] = t;
  return t;
}

function setKfs(y: Y.Map<unknown>, prop: string, kfs: Keyframe[]) {
  const m = y.get('keyframes') as Y.Map<Keyframe[]>;
  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  if (sorted.length) m.set(prop, sorted); else m.delete(prop);
}

/** Apply one op inside the current transaction. `p` is a live working copy kept in sync for lookups within a batch. */
function applyOne(d: Y.Doc, p: Project, o: Op): OpResult {
  switch (o.op) {
    case 'setMeta': {
      const { op: _op, ...rest } = o;
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) yMeta(d).set(k, v);
      Object.assign(p.meta, rest);
      return { op: o.op, summary: `Project settings: ${Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(', ')}` };
    }
    case 'addTrack': {
      const t = newTrack(d, p, o.kind, o);
      return { op: o.op, id: t.id, summary: `Added ${o.kind} track ${t.name}` };
    }
    case 'updateTrack': {
      const y = yTracks(d).get(o.id); if (!y) throw new Error(`no track "${o.id}"`);
      const { op: _op, id: _id, ...rest } = o;
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) y.set(k, v);
      Object.assign(p.tracks[o.id], rest);
      return { op: o.op, id: o.id, summary: `Track ${p.tracks[o.id].name}: ${Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(', ')}` };
    }
    case 'removeTrack': {
      for (const c of Object.values(p.clips)) if (c.trackId === o.id) { yClips(d).delete(c.id); delete p.clips[c.id]; }
      const name = p.tracks[o.id]?.name;
      yTracks(d).delete(o.id); delete p.tracks[o.id];
      return { op: o.op, id: o.id, summary: `Removed track ${name}` };
    }
    case 'addClip': {
      if (o.id && p.clips[o.id]) throw new Error(`clip id "${o.id}" already exists`);
      if ((o.type === 'video' || o.type === 'image' || o.type === 'audio') && !p.media[o.mediaId ?? '']) throw new Error(`no media "${o.mediaId}"`);
      if (o.type === 'component' && !COMPONENTS[o.component ?? '']) throw new Error(`unknown component "${o.component}". Known: ${Object.keys(COMPONENTS).join(', ')}`);
      if (o.type === 'sfx' && !SFX[o.component ?? '']) throw new Error(`unknown sfx preset "${o.component}". Known: ${Object.keys(SFX).join(', ')}`);
      const duration = o.duration ?? defaultDuration(p, o);
      let trackId = o.trackId;
      if (trackId && !p.tracks[trackId]) {
        // allow callers to name a track that does not exist yet
        trackId = newTrack(d, p, o.type === 'audio' || o.type === 'sfx' ? 'audio' : 'visual', { id: trackId }).id;
      }
      trackId ||= pickTrack(d, p, o.type, o.start, duration);
      const media = p.media[o.mediaId ?? ''];
      const c: Clip = {
        id: o.id || uid('clip'), trackId, type: o.type, start: Math.max(0, o.start), duration, inPoint: o.inPoint ?? 0, speed: o.speed ?? 1,
        mediaId: o.mediaId, component: o.component, name: o.name ?? (media ? media.name : ''), props: o.props ?? {}, keyframes: o.keyframes ?? {},
      };
      writeClip(d, c);
      p.clips[c.id] = c;
      return { op: o.op, id: c.id, summary: `Added ${labelOf(c)} at ${fmtT(c.start)} (${c.duration.toFixed(2)}s) on ${p.tracks[trackId].name}` };
    }
    case 'updateClip': {
      const y = clipY(d, o.id);
      const { op: _op, id: _id, ...rest } = o;
      if (rest.duration !== undefined) rest.duration = Math.max(0.01, rest.duration);
      if (rest.start !== undefined) rest.start = Math.max(0, rest.start);
      if (rest.trackId && !p.tracks[rest.trackId]) throw new Error(`no track "${rest.trackId}"`);
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) y.set(k, v);
      Object.assign(p.clips[o.id], rest);
      const c = p.clips[o.id];
      return { op: o.op, id: o.id, summary: `${labelOf(c)}: ${Object.entries(rest).map(([k, v]) => `${k}=${typeof v === 'number' ? +v.toFixed(3) : v}`).join(', ')}` };
    }
    case 'setProps': {
      const y = clipY(d, o.id);
      const pm = y.get('props') as Y.Map<unknown>;
      for (const [k, v] of Object.entries(o.props)) { if (v === null || v === undefined) pm.delete(k); else pm.set(k, v); }
      Object.assign(p.clips[o.id].props, o.props);
      const keys = Object.keys(o.props);
      return { op: o.op, id: o.id, summary: `${labelOf(p.clips[o.id])}: set ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '…' : ''}` };
    }
    case 'setKeyframes': {
      setKfs(clipY(d, o.id), o.prop, o.keyframes);
      p.clips[o.id].keyframes[o.prop] = o.keyframes;
      return { op: o.op, id: o.id, summary: `${labelOf(p.clips[o.id])}: ${o.keyframes.length} keyframes on ${o.prop}` };
    }
    case 'addKeyframe': {
      const y = clipY(d, o.id);
      const cur = (p.clips[o.id].keyframes[o.prop] ?? []).filter((k) => Math.abs(k.t - o.t) > 1e-3);
      const kfs = [...cur, { t: o.t, v: o.v, ease: o.ease }];
      setKfs(y, o.prop, kfs);
      p.clips[o.id].keyframes[o.prop] = kfs.sort((a, b) => a.t - b.t);
      return { op: o.op, id: o.id, summary: `${labelOf(p.clips[o.id])}: keyframe ${o.prop}=${o.v} at +${o.t.toFixed(2)}s` };
    }
    case 'removeKeyframe': {
      const kfs = (p.clips[o.id].keyframes[o.prop] ?? []).filter((k) => Math.abs(k.t - o.t) > 1e-3);
      setKfs(clipY(d, o.id), o.prop, kfs);
      p.clips[o.id].keyframes[o.prop] = kfs;
      return { op: o.op, id: o.id, summary: `${labelOf(p.clips[o.id])}: removed ${o.prop} keyframe` };
    }
    case 'removeClip': {
      const c = p.clips[o.id]; if (!c) throw new Error(`no clip "${o.id}"`);
      yClips(d).delete(o.id); delete p.clips[o.id];
      return { op: o.op, id: o.id, summary: `Removed ${labelOf(c)}` };
    }
    case 'rippleDelete': {
      const c = p.clips[o.id]; if (!c) throw new Error(`no clip "${o.id}"`);
      yClips(d).delete(o.id); delete p.clips[o.id];
      for (const k of Object.values(p.clips)) if (k.trackId === c.trackId && k.start >= c.start + c.duration - EPS) {
        k.start = Math.max(0, k.start - c.duration); clipY(d, k.id).set('start', k.start);
      }
      return { op: o.op, id: o.id, summary: `Ripple-deleted ${labelOf(c)}` };
    }
    case 'splitClip': {
      const c = p.clips[o.id]; if (!c) throw new Error(`no clip "${o.id}"`);
      const lt = o.t - c.start;
      if (lt <= EPS || lt >= c.duration - EPS) throw new Error('split point is outside the clip');
      const right: Clip = JSON.parse(JSON.stringify(c));
      right.id = o.newId || uid('clip');
      right.start = o.t; right.duration = c.duration - lt;
      right.inPoint = c.inPoint + lt * (c.speed || 1);
      right.keyframes = Object.fromEntries(Object.entries(c.keyframes).map(([k, v]) => [k, v.filter((f) => f.t >= lt).map((f) => ({ ...f, t: f.t - lt }))]));
      // transitions stay on the outer edges
      right.props = { ...c.props, transitionIn: 'none' };
      // a split sound keeps the original's seed so the right half continues the same waveform
      if (c.type === 'sfx') right.props.seed = c.props.seed ?? hash(c.id);
      const y = clipY(d, o.id);
      y.set('duration', lt);
      (y.get('props') as Y.Map<unknown>).set('transitionOut', 'none');
      for (const [k, v] of Object.entries(c.keyframes)) setKfs(y, k, v.filter((f) => f.t <= lt));
      c.duration = lt;
      writeClip(d, right); p.clips[right.id] = right;
      return { op: o.op, id: right.id, summary: `Split ${labelOf(c)} at ${fmtT(o.t)}` };
    }
    case 'duplicateClip': {
      const c = p.clips[o.id]; if (!c) throw new Error(`no clip "${o.id}"`);
      const n: Clip = JSON.parse(JSON.stringify(c));
      n.id = o.newId || uid('clip');
      n.start = o.start ?? c.start + c.duration;
      n.trackId = o.trackId ?? pickTrack(d, p, c.type, n.start, n.duration);
      writeClip(d, n); p.clips[n.id] = n;
      return { op: o.op, id: n.id, summary: `Duplicated ${labelOf(c)} to ${fmtT(n.start)}` };
    }
    case 'addMarker': {
      const m: Marker = { id: o.id || uid('mk'), t: o.t, label: o.label, color: o.color };
      yMarkers(d).set(m.id, m); p.markers[m.id] = m;
      return { op: o.op, id: m.id, summary: `Marker "${o.label}" at ${fmtT(o.t)}` };
    }
    case 'removeMarker': {
      yMarkers(d).delete(o.id); delete p.markers[o.id];
      return { op: o.op, id: o.id, summary: 'Removed marker' };
    }
    case 'addMedia': {
      yMedia(d).set(o.media.id, o.media); p.media[o.media.id] = o.media;
      return { op: o.op, id: o.media.id, summary: `Imported ${o.media.kind} "${o.media.name}" (${o.media.duration.toFixed(1)}s)` };
    }
    case 'removeMedia': {
      for (const c of Object.values(p.clips)) if (c.mediaId === o.id) { yClips(d).delete(c.id); delete p.clips[c.id]; }
      yMedia(d).delete(o.id); delete p.media[o.id];
      return { op: o.op, id: o.id, summary: 'Removed media' };
    }
    case 'clear': {
      replaceContent(d, { meta: p.meta, tracks: {}, clips: {}, markers: {} });
      p.tracks = {}; p.clips = {}; p.markers = {};
      return { op: o.op, summary: 'Cleared the timeline' };
    }
    case 'replaceProject': {
      replaceContent(d, o.project);
      Object.assign(p, JSON.parse(JSON.stringify(o.project)));
      return { op: o.op, summary: 'Restored a saved version' };
    }
  }
}

export interface ApplyOptions {
  log?: boolean;
  /** extra origin object for the transaction (undo tracking) */
  origin?: unknown;
  /** dry-run on a scratch copy first so a failing op never half-applies a batch (default true) */
  validate?: boolean;
}

/** Apply ops atomically as `author`. Returns one result per op. Throws (and applies nothing) if any op fails. */
export function applyOps(d: Y.Doc, ops: Op[], author: Author, opts: ApplyOptions = {}): OpResult[] {
  const p = readProject(d);
  const results: OpResult[] = [];
  // validate against a scratch doc first so a bad op in the middle never leaves a half-applied batch
  if (opts.validate !== false && ops.length > 1) {
    const scratch = new Y.Doc();
    Y.applyUpdate(scratch, Y.encodeStateAsUpdate(d));
    const sp = readProject(scratch);
    try { scratch.transact(() => { for (const o of ops) applyOne(scratch, sp, o); }); } finally { scratch.destroy(); }
  }
  d.transact(() => {
    for (const o of ops) {
      const r = applyOne(d, p, o);
      const w = lintOp(p, o, r);
      if (w.length) r.warnings = w;
      results.push(r);
      if (opts.log !== false) {
        const c = r.id ? p.clips[r.id] : undefined;
        appendLog(d, { id: uid('log'), at: Date.now(), author: author.id, authorName: author.name, summary: r.summary, targetId: r.id, t: c?.start ?? ('t' in o ? (o as { t: number }).t : undefined) });
      }
    }
  }, opts.origin ?? author);
  return results;
}

function lintOp(p: Project, o: Op, r: OpResult): string[] {
  const c = r.id ? p.clips[r.id] : undefined;
  if (!c) return [];
  switch (o.op) {
    case 'addClip': return [...lintClip(c), ...lintPlacement(p, c)];
    case 'duplicateClip': case 'updateClip': return lintPlacement(p, c);
    case 'setProps': return lintClip(c, o.props, {});
    case 'setKeyframes': return lintClip(c, {}, { [o.prop]: o.keyframes });
    case 'addKeyframe': return lintClip(c, {}, { [o.prop]: [{ t: o.t, v: o.v, ease: o.ease }] });
    default: return [];
  }
}

/** Convenience used by the UI: one clip read straight from the doc. */
export function getClip(d: Y.Doc, id: string) {
  const y = yClips(d).get(id);
  return y ? readClip(y) : null;
}

export { isAudible };
