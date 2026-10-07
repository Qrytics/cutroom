import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { applyOps, audioPlan, CLAUDE, initDoc, readProject, resolveProps, sampleKeyframes, synthesize, visibleLayers, SFX, catalog } from '../src/index.ts';

const media = { id: 'm1', name: 'clip.mp4', kind: 'video' as const, url: '/media/x.webm', duration: 10, width: 1920, height: 1080, hasAudio: true };

function fresh() {
  const d = new Y.Doc();
  initDoc(d, { name: 'Test' });
  applyOps(d, [{ op: 'addMedia', media }], CLAUDE);
  return d;
}

describe('ops', () => {
  it('adds clips on auto tracks without overlap', () => {
    const d = fresh();
    const r = applyOps(d, [
      { op: 'addClip', id: 'a', type: 'video', mediaId: 'm1', start: 0, duration: 4 },
      { op: 'addClip', id: 'b', type: 'component', component: 'title', start: 1 },
      { op: 'addClip', id: 's', type: 'sfx', component: 'whoosh', start: 0.8 },
    ], CLAUDE);
    expect(r.map((x) => x.id)).toEqual(['a', 'b', 's']);
    const p = readProject(d);
    expect(p.clips.a.trackId).not.toBe(p.clips.b.trackId);
    expect(p.tracks[p.clips.s.trackId].kind).toBe('audio');
    expect(p.clips.b.duration).toBe(4);
    expect(p.log.at(-1)?.authorName).toBe('Claude');
  });

  it('rejects a bad batch atomically', () => {
    const d = fresh();
    expect(() => applyOps(d, [
      { op: 'addClip', id: 'ok', type: 'component', component: 'text', start: 0 },
      { op: 'addClip', type: 'component', component: 'nope', start: 0 },
    ], CLAUDE)).toThrow(/unknown component/);
    expect(readProject(d).clips.ok).toBeUndefined();
  });

  it('splits with inPoint and keyframes carried over', () => {
    const d = fresh();
    applyOps(d, [
      { op: 'addClip', id: 'v', type: 'video', mediaId: 'm1', start: 2, duration: 6, inPoint: 1 },
      { op: 'setKeyframes', id: 'v', prop: 'scale', keyframes: [{ t: 0, v: 1 }, { t: 6, v: 2 }] },
      { op: 'splitClip', id: 'v', t: 5, newId: 'v2' },
    ], CLAUDE);
    const p = readProject(d);
    expect(p.clips.v.duration).toBeCloseTo(3);
    expect(p.clips.v2.start).toBe(5);
    expect(p.clips.v2.inPoint).toBeCloseTo(4);
    expect(p.clips.v2.keyframes.scale[0].t).toBeCloseTo(3);
  });
});

describe('engine', () => {
  it('interpolates keyframes and colors', () => {
    expect(sampleKeyframes([{ t: 0, v: 0, ease: 'linear' }, { t: 2, v: 10 }], 1)).toBe(5);
    expect(sampleKeyframes([{ t: 0, v: '#000000', ease: 'linear' }, { t: 1, v: '#ffffff' }], 0.5)).toBe('rgba(128,128,128,1)');
  });
  it('orders layers by track and resolves defaults', () => {
    const d = fresh();
    applyOps(d, [
      { op: 'addClip', id: 'bg', type: 'component', component: 'background', start: 0, duration: 5 },
      { op: 'addClip', id: 't', type: 'component', component: 'text', start: 0, props: { text: 'hi' } },
    ], CLAUDE);
    const p = readProject(d);
    const L = visibleLayers(p, 1);
    expect(L.map((l) => l.clip.id)).toEqual(['bg', 't']);
    expect(L[1].props.x).toBe(960);
    expect(resolveProps(p.clips.t, 0).size).toBe(96);
  });
  it('ducks music under voice', () => {
    const d = fresh();
    applyOps(d, [
      { op: 'addClip', id: 'mu', type: 'sfx', component: 'music', start: 0, duration: 10, props: { duckUnder: true } },
      { op: 'addClip', id: 'vo', type: 'video', mediaId: 'm1', start: 3, duration: 3, props: { voice: true } },
    ], CLAUDE);
    const mu = audioPlan(readProject(d)).find((a) => a.clip.id === 'mu')!;
    const at = (t: number) => mu.gain.find(([x]) => Math.abs(x - t) < 1e-3)?.[1];
    expect(at(4.5) ?? at(6)).toBeCloseTo(0.3);
    expect(at(0)).toBe(1);
  });
  it('synthesizes every sfx preset', () => {
    for (const k of Object.keys(SFX)) {
      const st = synthesize(k, {}, k === 'music' ? 6 : 1, 1);
      expect(st[0].length).toBeGreaterThan(0);
      expect(st[0].some((v) => v !== 0)).toBe(true);
    }
    expect(catalog().components.length).toBeGreaterThan(10);
  });
});

describe('lint', () => {
  it('warns on typos, bad options, ranges, keyframe times and overlaps — but still applies', () => {
    const d = fresh();
    const r = applyOps(d, [
      { op: 'addClip', id: 't', type: 'component', component: 'title', start: 0, duration: 3, trackId: 'v1', props: { txt: 'hi', layout: 'stackd', size: 9999, color: 'blu' } },
      { op: 'addClip', id: 'u', type: 'component', component: 'text', start: 2, duration: 3, trackId: 'v1', keyframes: { x: [{ t: 7, v: 1 }] } },
      { op: 'setProps', id: 't', props: { animIn: 'maskUp' } },
    ], CLAUDE);
    const w = r.flatMap((x) => x.warnings ?? []).join('\n');
    expect(w).toMatch(/unknown prop "txt" — did you mean "text"/);
    expect(w).toMatch(/"layout"="stackd" is not an option — did you mean "stacked"/);
    expect(w).toMatch(/size"=9999 is above/);
    expect(w).toMatch(/"color"="blu" is not a color/);
    expect(w).toMatch(/keyframe at t=7 is outside the clip/);
    expect(w).toMatch(/overlaps "t"/);
    expect(r[2].warnings).toBeUndefined();
    expect(readProject(d).clips.t.props.txt).toBe('hi');
  });
});
