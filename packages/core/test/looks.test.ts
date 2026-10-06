import { describe, expect, it } from 'vitest';
import { ANIM_IN, ANIM_OUT, basePropDefs, COMPONENTS, EASES, FONTS, LOOKS, propDefsFor, rollLook, SFX, TRANSITIONS } from '../src/index.ts';

const opts = (type: 'component' | 'sfx', key: string, prop: string) => {
  const d = propDefsFor({ type, component: key }).find((x) => x.key === prop);
  return d?.options ?? [];
};

describe('looks', () => {
  it('reference only things that exist', () => {
    const missing: string[] = [];
    const need = (ok: boolean, what: string) => { if (!ok) missing.push(what); };
    const motion = basePropDefs('component').find((d) => d.key === 'motion')?.options ?? [];
    for (const l of LOOKS) {
      const at = (s: string) => `${l.key}: ${s}`;
      for (const f of l.fonts) for (const n of [f.display, f.body, f.mono]) need(FONTS.includes(n), at(`font ${n}`));
      for (const a of l.textIn) need(ANIM_IN.includes(a), at(`animIn ${a}`));
      for (const a of l.textOut) need(ANIM_OUT.includes(a), at(`animOut ${a}`));
      for (const a of l.loops) need(opts('component', 'title', 'loop').includes(a), at(`loop ${a}`));
      for (const t of l.transitions) need(TRANSITIONS.includes(t), at(`transition ${t}`));
      for (const c of l.camera) need(motion.includes(c), at(`motion ${c}`));
      for (const e of l.enter) need(EASES.includes(e as never), at(`ease ${e}`));
      for (const b of l.backgrounds) need(opts('component', 'background', 'style').includes(String(b.style)), at(`background ${b.style}`));
      for (const t of l.textures) if (t) need(opts('component', 'overlay', 'style').includes(t.style), at(`texture ${t.style}`));
      for (const v of l.titleLayouts) need(opts('component', 'title', 'layout').includes(v), at(`title layout ${v}`));
      for (const v of l.lowerThirds) need(opts('component', 'lowerThird', 'variant').includes(v), at(`lowerThird ${v}`));
      for (const v of l.captions) need(opts('component', 'captions', 'style').includes(v), at(`captions ${v}`));
      for (const v of l.logoStyles) need(opts('component', 'logoReveal', 'style').includes(v), at(`logo ${v}`));
      for (const w of l.wipes) {
        need(!!COMPONENTS[w.component], at(`wipe ${w.component}`));
        if (w.props.style) need(opts('component', w.component, 'style').includes(String(w.props.style)), at(`wipe style ${w.props.style}`));
      }
      for (const a of l.accents) need(!!COMPONENTS[a], at(`accent ${a}`));
      for (const p of l.particles) if (p && p !== 'confetti') need(opts('component', 'particles', 'kind').includes(p), at(`particles ${p}`));
      for (const m of l.music) {
        need(opts('sfx', 'music', 'style').includes(m.style), at(`music style ${m.style}`));
        need(opts('sfx', 'music', 'mood').includes(m.mood), at(`music mood ${m.mood}`));
      }
      for (const k of Object.values(l.sfx).flat()) need(!!SFX[k], at(`sfx ${k}`));
    }
    expect(missing).toEqual([]);
  });

  it('recipes only set props their component defines', () => {
    const bad: string[] = [];
    for (let seed = 1; seed < 400; seed++) {
      const d = rollLook({ seed });
      for (const [name, r] of Object.entries(d.recipes)) {
        const type = SFX[r.component] ? 'sfx' : 'component';
        const keys = new Set(propDefsFor({ type, component: r.component }).map((x) => x.key));
        for (const k of Object.keys(r.props)) if (!keys.has(k)) bad.push(`${d.look}.${name}.${k}`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it('varies: avoids recent looks and spreads picks', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => rollLook({ seed: i }).look));
    expect(seen.size).toBeGreaterThan(LOOKS.length * 0.8);
    for (let i = 0; i < 50; i++) expect(rollLook({ seed: i, avoid: ['midnightTech', 'neonArcade'] }).look).not.toMatch(/^(midnightTech|neonArcade)$/);
    expect(rollLook({ seed: 3, vibe: 'retro gaming arcade' }).fonts).toBeTruthy();
    expect(rollLook({ seed: 9 })).toEqual(rollLook({ seed: 9 }));
  });
});
