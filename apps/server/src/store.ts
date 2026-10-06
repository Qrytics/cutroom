// Project persistence: one Y.Doc per project, saved as a binary update, plus JSON snapshots (versions).
import fs from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { initDoc, readProject, replaceContent, uid, type Meta, type Project } from '@cutroom/core';

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const DATA = process.env.CUTROOM_DATA || path.join(ROOT, 'data');
export const PROJECTS = path.join(DATA, 'projects');
export const MEDIA = path.join(DATA, 'media');
export const EXPORTS = path.join(DATA, 'exports');
for (const d of [PROJECTS, MEDIA, EXPORTS]) fs.mkdirSync(d, { recursive: true });

export interface Room {
  id: string;
  doc: Y.Doc;
  awareness: Awareness;
}

const rooms = new Map<string, Room>();
const saveTimers = new Map<string, NodeJS.Timeout>();

const dir = (id: string) => path.join(PROJECTS, id.replace(/[^\w-]/g, ''));
const docFile = (id: string) => path.join(dir(id), 'doc.bin');
const infoFile = (id: string) => path.join(dir(id), 'project.json');

export interface ProjectInfo { id: string; name: string; createdAt: number; updatedAt: number; width: number; height: number; fps: number; look?: string }

export function exists(id: string) {
  return rooms.has(id) || fs.existsSync(docFile(id));
}

export function getRoom(id: string): Room {
  let r = rooms.get(id);
  if (r) return r;
  if (!fs.existsSync(docFile(id))) throw Object.assign(new Error(`no project "${id}"`), { status: 404 });
  const doc = new Y.Doc();
  Y.applyUpdate(doc, fs.readFileSync(docFile(id)));
  r = { id, doc, awareness: new Awareness(doc) };
  r.awareness.setLocalState(null);
  doc.on('update', () => scheduleSave(id));
  rooms.set(id, r);
  return r;
}

function scheduleSave(id: string) {
  clearTimeout(saveTimers.get(id));
  saveTimers.set(id, setTimeout(() => save(id), 600));
}

export function save(id: string) {
  const r = rooms.get(id);
  if (!r) return;
  fs.mkdirSync(dir(id), { recursive: true });
  fs.writeFileSync(docFile(id) + '.tmp', Y.encodeStateAsUpdate(r.doc));
  fs.renameSync(docFile(id) + '.tmp', docFile(id));
  const m = readProject(r.doc).meta;
  const prev = readInfo(id);
  fs.writeFileSync(infoFile(id), JSON.stringify({ id, name: m.name, width: m.width, height: m.height, fps: m.fps, look: m.look, createdAt: prev?.createdAt ?? Date.now(), updatedAt: Date.now() }));
}

export function saveAll() { for (const id of rooms.keys()) save(id); }

function readInfo(id: string): ProjectInfo | null {
  try { return JSON.parse(fs.readFileSync(infoFile(id), 'utf8')); } catch { return null; }
}

export function listProjects(): ProjectInfo[] {
  return fs.readdirSync(PROJECTS).map(readInfo).filter(Boolean).sort((a, b) => b!.updatedAt - a!.updatedAt) as ProjectInfo[];
}

export function createProject(meta: Partial<Meta>, id?: string): Room {
  id = (id || uid('p')).replace(/[^\w-]/g, '');
  if (exists(id)) throw Object.assign(new Error(`project "${id}" already exists`), { status: 409 });
  fs.mkdirSync(dir(id), { recursive: true });
  const doc = new Y.Doc();
  initDoc(doc, meta);
  fs.writeFileSync(docFile(id), Y.encodeStateAsUpdate(doc));
  doc.destroy();
  const r = getRoom(id);
  save(id);
  return r;
}

export function deleteProject(id: string) {
  const r = rooms.get(id);
  if (r) { r.doc.destroy(); rooms.delete(id); }
  fs.rmSync(dir(id), { recursive: true, force: true });
}

export function project(id: string): Project {
  return readProject(getRoom(id).doc, id);
}

// ---------------------------------------------------------------- snapshots (versions)
export interface SnapshotInfo { id: string; label: string; at: number; author: string; clips: number }

const snapDir = (id: string) => path.join(dir(id), 'snapshots');

export function createSnapshot(id: string, label: string, author: string): SnapshotInfo {
  const p = project(id);
  fs.mkdirSync(snapDir(id), { recursive: true });
  const info: SnapshotInfo = { id: `s${Date.now().toString(36)}`, label, at: Date.now(), author, clips: Object.keys(p.clips).length };
  fs.writeFileSync(path.join(snapDir(id), `${info.id}.json`), JSON.stringify({ ...info, project: { meta: p.meta, tracks: p.tracks, clips: p.clips, markers: p.markers } }));
  return info;
}

export function listSnapshots(id: string): SnapshotInfo[] {
  if (!fs.existsSync(snapDir(id))) return [];
  return fs.readdirSync(snapDir(id)).filter((f) => f.endsWith('.json')).map((f) => {
    const { project: _p, ...info } = JSON.parse(fs.readFileSync(path.join(snapDir(id), f), 'utf8'));
    return info as SnapshotInfo;
  }).sort((a, b) => b.at - a.at);
}

export function readSnapshot(id: string, sid: string) {
  const f = path.join(snapDir(id), `${sid.replace(/[^\w]/g, '')}.json`);
  if (!fs.existsSync(f)) throw Object.assign(new Error('no such snapshot'), { status: 404 });
  return JSON.parse(fs.readFileSync(f, 'utf8')) as SnapshotInfo & { project: Pick<Project, 'meta' | 'tracks' | 'clips' | 'markers'> };
}

export { replaceContent };
