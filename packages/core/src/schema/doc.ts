// Y.Doc layout for a project and conversion to the plain Project object.
//   meta: Y.Map<value>            tracks: Y.Map<id, Y.Map>        clips: Y.Map<id, Y.Map{…, props: Y.Map, keyframes: Y.Map}>
//   media: Y.Map<id, Media>       markers: Y.Map<id, Marker>       session: Y.Map{lock}           log: Y.Array<LogEntry>
import * as Y from 'yjs';
import type { Clip, Keyframe, Lock, LogEntry, Marker, Media, Meta, Project, Track } from './types.ts';

export const DEFAULT_META: Meta = { name: 'Untitled', width: 1920, height: 1080, fps: 30, duration: 0, background: '#000000' };
export const LOG_LIMIT = 800;

export const yMeta = (d: Y.Doc) => d.getMap<unknown>('meta');
export const yTracks = (d: Y.Doc) => d.getMap<Y.Map<unknown>>('tracks');
export const yClips = (d: Y.Doc) => d.getMap<Y.Map<unknown>>('clips');
export const yMedia = (d: Y.Doc) => d.getMap<Media>('media');
export const yMarkers = (d: Y.Doc) => d.getMap<Marker>('markers');
export const ySession = (d: Y.Doc) => d.getMap<unknown>('session');
export const yLog = (d: Y.Doc) => d.getArray<LogEntry>('log');

let counter = 0;
export function uid(prefix = 'id') {
  counter = (counter + 1) % 1296;
  return `${prefix}_${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 6)}${counter.toString(36)}`;
}

export function initDoc(d: Y.Doc, meta: Partial<Meta> = {}) {
  d.transact(() => {
    const m = yMeta(d);
    for (const [k, v] of Object.entries({ ...DEFAULT_META, ...meta })) if (!m.has(k)) m.set(k, v);
  }, 'init');
}

export function readTrack(y: Y.Map<unknown>): Track {
  return y.toJSON() as Track;
}

export function readClip(y: Y.Map<unknown>): Clip {
  const props = y.get('props') as Y.Map<unknown> | undefined;
  const kf = y.get('keyframes') as Y.Map<Keyframe[]> | undefined;
  const o: Record<string, unknown> = {};
  y.forEach((v, k) => { if (k !== 'props' && k !== 'keyframes') o[k] = v; });
  return {
    ...(o as unknown as Clip),
    props: props ? (props.toJSON() as Clip['props']) : {},
    keyframes: kf ? (kf.toJSON() as Clip['keyframes']) : {},
  };
}

export function readProject(d: Y.Doc, id = ''): Project {
  const tracks: Record<string, Track> = {};
  yTracks(d).forEach((y, k) => { tracks[k] = readTrack(y); });
  const clips: Record<string, Clip> = {};
  yClips(d).forEach((y, k) => { clips[k] = readClip(y); });
  return {
    id,
    meta: { ...DEFAULT_META, ...(yMeta(d).toJSON() as Partial<Meta>) },
    tracks,
    clips,
    media: yMedia(d).toJSON() as Record<string, Media>,
    markers: yMarkers(d).toJSON() as Record<string, Marker>,
    lock: (ySession(d).get('lock') as Lock | null) ?? null,
    log: yLog(d).toArray(),
  };
}

export function writeClip(d: Y.Doc, c: Clip) {
  const y = new Y.Map<unknown>();
  const { props, keyframes, ...rest } = c;
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) y.set(k, v);
  const p = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(props || {})) if (v !== undefined) p.set(k, v);
  const kf = new Y.Map<Keyframe[]>();
  for (const [k, v] of Object.entries(keyframes || {})) if (v?.length) kf.set(k, v);
  y.set('props', p);
  y.set('keyframes', kf);
  yClips(d).set(c.id, y);
  return y;
}

export function writeTrack(d: Y.Doc, t: Track) {
  const y = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(t)) y.set(k, v);
  yTracks(d).set(t.id, y);
  return y;
}

export function setLock(d: Y.Doc, lock: Lock | null, origin: unknown = 'server') {
  d.transact(() => ySession(d).set('lock', lock), origin);
}

export function appendLog(d: Y.Doc, e: LogEntry) {
  const log = yLog(d);
  log.push([e]);
  if (log.length > LOG_LIMIT) log.delete(0, log.length - LOG_LIMIT);
}

/** Wipe and rewrite the editable content (tracks/clips/markers/meta) from a plain project. Media is kept and merged. */
export function replaceContent(d: Y.Doc, p: Pick<Project, 'meta' | 'tracks' | 'clips' | 'markers'> & { media?: Project['media'] }) {
  const m = yMeta(d);
  for (const k of [...m.keys()]) m.delete(k);
  for (const [k, v] of Object.entries(p.meta)) m.set(k, v);
  const tr = yTracks(d); for (const k of [...tr.keys()]) tr.delete(k);
  const cl = yClips(d); for (const k of [...cl.keys()]) cl.delete(k);
  const mk = yMarkers(d); for (const k of [...mk.keys()]) mk.delete(k);
  for (const t of Object.values(p.tracks)) writeTrack(d, t);
  for (const c of Object.values(p.clips)) writeClip(d, c);
  for (const mm of Object.values(p.markers || {})) mk.set(mm.id, mm);
  const md = yMedia(d);
  for (const mm of Object.values(p.media || {})) if (!md.has(mm.id)) md.set(mm.id, mm);
}

export function projectDuration(p: Pick<Project, 'meta' | 'clips'>) {
  if (p.meta.duration > 0) return p.meta.duration;
  let end = 0;
  for (const c of Object.values(p.clips)) end = Math.max(end, c.start + c.duration);
  return end;
}
