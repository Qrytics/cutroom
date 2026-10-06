// Yjs websocket sync (y-websocket wire protocol) with lock enforcement:
// while someone holds the session lock, document updates from anyone else are refused and that client is told to resync.
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { readProject } from '@cutroom/core';
import { getRoom, type Room } from './store.ts';

export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;
/** custom: the server refused this client's edits (doc is locked) — client must drop local state and resync */
export const MSG_REJECTED = 100;

interface Conn { ws: WebSocket; user: string; name: string; clientIds: Set<number> }
const conns = new Map<string, Set<Conn>>();
const wired = new WeakSet<Room>();

function send(c: Conn, buf: Uint8Array) {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(buf, (err) => { if (err) c.ws.close(); });
}

function wire(room: Room) {
  if (wired.has(room)) return;
  wired.add(room);
  room.doc.on('update', (update: Uint8Array, origin: unknown) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const buf = encoding.toUint8Array(enc);
    for (const c of conns.get(room.id) ?? []) if (c !== origin) send(c, buf);
  });
  room.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    const changed = [...added, ...updated, ...removed];
    if (origin && typeof origin === 'object' && 'clientIds' in origin) {
      const c = origin as Conn;
      for (const id of added) c.clientIds.add(id);
      for (const id of removed) c.clientIds.delete(id);
    }
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed));
    const buf = encoding.toUint8Array(enc);
    for (const c of conns.get(room.id) ?? []) send(c, buf);
  });
}

function isEmptyUpdate(u: Uint8Array) {
  if (u.length <= 2) return true;
  const d = Y.decodeUpdate(u);
  return d.structs.length === 0 && d.ds.clients.size === 0;
}

export function handleConnection(ws: WebSocket, req: IncomingMessage) {
  const url = new URL(req.url || '', 'http://x');
  const id = decodeURIComponent(url.pathname.replace(/^\/yjs\//, ''));
  let room: Room;
  try { room = getRoom(id); } catch { ws.close(4404, 'no such project'); return; }
  wire(room);
  const c: Conn = { ws, user: url.searchParams.get('user') || 'anon', name: url.searchParams.get('name') || 'Guest', clientIds: new Set() };
  if (!conns.has(id)) conns.set(id, new Set());
  conns.get(id)!.add(c);
  ws.binaryType = 'arraybuffer';

  ws.on('message', (data: ArrayBuffer) => {
    try {
      const dec = decoding.createDecoder(new Uint8Array(data));
      const type = decoding.readVarUint(dec);
      if (type === MSG_SYNC) {
        const sub = decoding.readVarUint(dec);
        if (sub === syncProtocol.messageYjsSyncStep1) {
          const enc = encoding.createEncoder();
          encoding.writeVarUint(enc, MSG_SYNC);
          syncProtocol.writeSyncStep2(enc, room.doc, decoding.readVarUint8Array(dec));
          send(c, encoding.toUint8Array(enc));
        } else {
          const update = decoding.readVarUint8Array(dec);
          const lock = readProject(room.doc).lock;
          if (lock && lock.holder !== c.user && !isEmptyUpdate(update)) {
            const enc = encoding.createEncoder();
            encoding.writeVarUint(enc, MSG_REJECTED);
            encoding.writeVarString(enc, `${lock.holderName} is editing — your change was not applied`);
            send(c, encoding.toUint8Array(enc));
            return;
          }
          Y.applyUpdate(room.doc, update, c);
        }
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(dec), c);
      }
    } catch (e) {
      console.error('sync message failed', e);
    }
  });

  ws.on('close', () => {
    conns.get(id)?.delete(c);
    awarenessProtocol.removeAwarenessStates(room.awareness, [...c.clientIds], null);
  });

  // greet: our state vector (client answers with what we lack) + current awareness
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeSyncStep1(enc, room.doc);
  send(c, encoding.toUint8Array(enc));
  const states = [...room.awareness.getStates().keys()];
  if (states.length) {
    const a = encoding.createEncoder();
    encoding.writeVarUint(a, MSG_AWARENESS);
    encoding.writeVarUint8Array(a, awarenessProtocol.encodeAwarenessUpdate(room.awareness, states));
    send(c, encoding.toUint8Array(a));
  }
}

export function presence(id: string) {
  return [...(conns.get(id) ?? [])].map((c) => ({ user: c.user, name: c.name }));
}
