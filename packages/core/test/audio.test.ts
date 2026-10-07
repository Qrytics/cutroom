import { describe, expect, it } from 'vitest';
import { MUSIC_MOODS, MUSIC_STYLES, SFX, synthesize, type Stereo } from '../src/index.ts';

const stats = (st: Stereo) => {
  let peak = 0, finite = true;
  for (const ch of st) for (let i = 0; i < ch.length; i++) { const v = ch[i]; if (!Number.isFinite(v)) finite = false; else if (Math.abs(v) > peak) peak = Math.abs(v); }
  return { peak, finite };
};
const same = (a: Stereo, b: Stereo) => a[0].length === b[0].length && a.every((ch, c) => ch.every((v, i) => v === b[c][i]));

describe('sfx presets', () => {
  // presets whose sound is fully determined by their parameters (no noise / random placement)
  const PURE = new Set(['pop', 'chime', 'alert', 'shimmer', 'beep', 'notification', 'bubble', 'blip', 'bloop', 'hover', 'success', 'error', 'coin', 'levelUp',
    'receiveMessage', 'heartbeat', 'subDrop', 'glassTing', 'ding', 'piano', 'tick2', 'notificationSoft', 'badge', 'cameraFocus', 'confirm', 'deny', 'boing', 'slideWhistleUp',
    'slideWhistleDown', 'honk', 'squeak', 'laser', 'scanner', 'powerUp', 'powerDown', 'kick', 'waterDrop', 'heartbeatFast', 'bellTree', 'marimbaRun', 'bassDrop', 'flyBy',
    'tapeStop', 'gong', 'stinger', 'zap']);
  for (const def of Object.values(SFX)) {
    if (def.key === 'music') continue;
    it(`${def.key}: finite, audible, ≤ 0.98, deterministic${PURE.has(def.key) ? '' : ', varies'}`, () => {
      const len = Math.min(def.defaultDuration, 6);
      const a = synthesize(def.key, {}, len, 42);
      const { peak, finite } = stats(a);
      expect(finite).toBe(true);
      expect(peak).toBeGreaterThan(1e-3);
      expect(peak).toBeLessThanOrEqual(0.98 + 1e-6);
      expect(same(a, synthesize(def.key, {}, len, 42))).toBe(true);
      if (!PURE.has(def.key)) expect(same(a, synthesize(def.key, { variation: 7 }, len, 42))).toBe(false);
    });
  }
  it('every preset honours its own select/number props without breaking', () => {
    for (const def of Object.values(SFX)) {
      if (def.key === 'music') continue;
      for (const pd of def.props) {
        const v = pd.type === 'select' ? pd.options![pd.options!.length - 1] : pd.type === 'number' ? pd.max : undefined;
        if (v === undefined || pd.key === 'variation') continue;
        const { finite, peak } = stats(synthesize(def.key, { [pd.key]: v }, Math.min(def.defaultDuration, 3), 3));
        expect(finite, `${def.key}.${pd.key}=${v}`).toBe(true);
        expect(peak, `${def.key}.${pd.key}=${v}`).toBeLessThanOrEqual(0.98 + 1e-6);
      }
    }
  }, 120_000);
  it('keys are unique and described', () => {
    for (const def of Object.values(SFX)) { expect(def.description.length).toBeGreaterThan(10); expect(def.label).toBeTruthy(); }
    expect(Object.keys(SFX).length).toBeGreaterThan(170);
  });
  it('renders the whole library quickly', () => {
    const t0 = performance.now();
    for (const def of Object.values(SFX)) if (def.key !== 'music') synthesize(def.key, {}, Math.min(def.defaultDuration, 6), 1);
    const s = (performance.now() - t0) / 1000;
    console.log(`${Object.keys(SFX).length - 1} sfx presets rendered in ${s.toFixed(2)} s`);
    expect(s).toBeLessThan(30);
  }, 60_000);
});

describe('music', () => {
  const moods = ['hopeful', 'dark'];
  for (const style of [...Object.keys(MUSIC_STYLES), 'classic', 'auto']) {
    for (const mood of moods) {
      it(`${style} / ${mood} renders`, () => {
        const { peak, finite } = stats(synthesize('music', { style, mood, drop: 6 }, 12, 9));
        expect(finite).toBe(true);
        expect(peak).toBeGreaterThan(1e-3);
        expect(peak).toBeLessThanOrEqual(1);
      });
    }
  }
  it('every mood renders', () => {
    for (const mood of Object.keys(MUSIC_MOODS)) expect(stats(synthesize('music', { mood }, 8, 1)).peak).toBeGreaterThan(1e-3);
  });
  it('is deterministic and variation re-rolls it', () => {
    const p = { style: 'house', mood: 'tech' };
    expect(same(synthesize('music', p, 10, 77), synthesize('music', p, 10, 77))).toBe(true);
    expect(same(synthesize('music', p, 10, 77), synthesize('music', { ...p, variation: 1 }, 10, 77))).toBe(false);
  });
  it('renders 90 s of every style within budget', () => {
    for (const style of Object.keys(MUSIC_STYLES)) {
      const t0 = performance.now();
      synthesize('music', { style, mood: 'epic', drop: 30 }, 90, 3);
      const s = (performance.now() - t0) / 1000;
      console.log(`music ${style.padEnd(11)} 90 s → ${s.toFixed(2)} s`);
      expect(s).toBeLessThan(8);
    }
  }, 180_000);
});
