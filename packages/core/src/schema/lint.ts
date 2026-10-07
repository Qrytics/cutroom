// Non-fatal checks on edit ops. Ops still apply; the warnings come back in the op results so Claude (or a script)
// can fix typos and bad values right away instead of discovering them in a rendered frame.
import { propDefsFor } from '../engine/evaluate.ts';
import { EASES, parseColor } from '../engine/ease.ts';
import type { PropDef } from './props.ts';
import type { Clip, Keyframe, Project, Props } from './types.ts';

const EPS = 1e-4;
// props every clip may carry that are not in a registry (seed keeps a split sound continuous)
const ALWAYS_OK = new Set(['seed']);

function nearest(key: string, keys: string[]) {
  const lc = key.toLowerCase();
  let best = '', score = Infinity;
  for (const k of keys) {
    const d = lev(lc, k.toLowerCase());
    if (d < score) { score = d; best = k; }
  }
  return score <= Math.max(2, key.length / 3) ? best : '';
}
function lev(a: string, b: string) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

function checkValue(d: PropDef, v: unknown, where: string): string | null {
  if (v === null || v === undefined) return null;
  switch (d.type) {
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return `${where}: "${d.key}" should be a number, got ${JSON.stringify(v)}`;
      if (d.min !== undefined && v < d.min - EPS) return `${where}: "${d.key}"=${v} is below its minimum ${d.min}`;
      if (d.max !== undefined && v > d.max + EPS) return `${where}: "${d.key}"=${v} is above its maximum ${d.max}`;
      return null;
    case 'select': case 'font':
      if (d.options && !d.options.includes(String(v))) {
        const hint = nearest(String(v), d.options);
        return `${where}: "${d.key}"="${v}" is not an option${hint ? ` — did you mean "${hint}"?` : ''} (options: ${d.options.join('|')})`;
      }
      return null;
    case 'color':
      if (typeof v !== 'string' || (v !== '' && !parseColor(v))) return `${where}: "${d.key}"=${JSON.stringify(v)} is not a color (use #rrggbb, #rrggbbaa or rgba(); "" = none)`;
      return null;
    case 'bool':
      return typeof v === 'boolean' ? null : `${where}: "${d.key}" should be true/false, got ${JSON.stringify(v)}`;
    default:
      return typeof v === 'string' ? null : `${where}: "${d.key}" should be text, got ${JSON.stringify(v)}`;
  }
}

/** Warnings about a clip's props / keyframes against its prop definitions. */
export function lintClip(c: Clip, props: Props = c.props, keyframes: Record<string, Keyframe[]> | undefined = c.keyframes): string[] {
  const out: string[] = [];
  const defs = propDefsFor(c);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const where = c.id;
  for (const [k, v] of Object.entries(props ?? {})) {
    const d = byKey.get(k);
    if (!d) {
      if (ALWAYS_OK.has(k)) continue;
      const hint = nearest(k, [...byKey.keys()]);
      out.push(`${where}: unknown prop "${k}"${hint ? ` — did you mean "${hint}"?` : ''} (it is ignored)`);
      continue;
    }
    const w = checkValue(d, v, where);
    if (w) out.push(w);
  }
  for (const [k, kfs] of Object.entries(keyframes ?? {})) {
    const d = byKey.get(k);
    if (!d) { const hint = nearest(k, [...byKey.keys()]); out.push(`${where}: keyframes on unknown prop "${k}"${hint ? ` — did you mean "${hint}"?` : ''}`); continue; }
    if (d.animatable === false || !['number', 'color'].includes(d.type)) out.push(`${where}: "${k}" is not animatable — keyframes will step instead of moving smoothly`);
    for (const f of kfs ?? []) {
      if (typeof f.t !== 'number' || f.t < -EPS || f.t > c.duration + EPS) out.push(`${where}: ${k} keyframe at t=${f.t} is outside the clip (0..${+c.duration.toFixed(3)}) — keyframe times are clip-local seconds`);
      if (f.ease && !EASES.includes(f.ease)) out.push(`${where}: unknown ease "${f.ease}" on ${k} (eases: ${EASES.join('|')})`);
      const w = checkValue(d, f.v, `${where} ${k}@${f.t}`);
      if (w) out.push(w);
    }
  }
  return out;
}

/** Warnings about where a clip sits: overlaps on its track, past the project end, media in/out range. */
export function lintPlacement(p: Project, c: Clip): string[] {
  const out: string[] = [];
  // overlapping sounds on one audio track all play, so only visual tracks can hide a clip
  const visual = p.tracks[c.trackId]?.kind !== 'audio';
  const clash = visual && Object.values(p.clips).find((o) => o.id !== c.id && o.trackId === c.trackId && o.start < c.start + c.duration - EPS && o.start + o.duration > c.start + EPS);
  if (clash) out.push(`${c.id}: overlaps "${clash.id}" on track "${p.tracks[c.trackId]?.name ?? c.trackId}" — on one track the later clip draws over the earlier; use another track if both should show`);
  if (p.meta.duration > 0 && c.start + c.duration > p.meta.duration + EPS) out.push(`${c.id}: ends at ${(c.start + c.duration).toFixed(2)}s, after the project duration ${p.meta.duration}s (it will be cut off)`);
  const m = p.media[c.mediaId ?? ''];
  if (m && (c.type === 'video' || c.type === 'audio') && c.inPoint + c.duration * (c.speed || 1) > m.duration + 0.05)
    out.push(`${c.id}: needs ${(c.inPoint + c.duration * (c.speed || 1)).toFixed(2)}s of "${m.name}" but it is only ${m.duration.toFixed(2)}s long (the end holds the last frame / goes silent)`);
  return out;
}
