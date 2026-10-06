import { describe, expect, it } from 'vitest';
import { MUSIC_MOODS, MUSIC_STYLES, SFX, synthesize, type Stereo } from '../src/index.ts';

const stats = (st: Stereo) => {
  let peak = 0, finite = true;
  for (const ch of st) for (let i = 0; i < ch.length; i++) { const v = ch[i]; if (!Number.isFinite(v)) finite = false; else if (Math.abs(v) > peak) peak = Math.abs(v); }
  return { peak, finite };
};
const same = (a: Stereo, b: Stereo) => a[0].length === b[0].length && a.every((ch, c) => ch.every((v, i) => v === b[c][i]));

describe('sfx presets', () => {
  for (const def of Object.values(SFX)) {
    if (def.key === 'music') continue;
    it(`${def.key} renders finite, audible, unclipped audio`, () => {
      const { peak, finite } = stats(synthesize(def.key, {}, def.defaultDuration, 42));
      expect(finite).toBe(true);
      expect(peak).toBeGreaterThan(1e-3);
      expect(peak).toBeLessThanOrEqual(1);
    });
  }
  it('is deterministic per seed and changes with variation', () => {
    expect(same(synthesize('impact', {}, 2, 5), synthesize('impact', {}, 2, 5))).toBe(true);
    expect(same(synthesize('keyboardClack', {}, 2, 5), synthesize('keyboardClack', { variation: 3 }, 2, 5))).toBe(false);
  });
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
