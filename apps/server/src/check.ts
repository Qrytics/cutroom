// `check`: a text-only QA pass over a project, so Claude can verify a video without looking at images.
// Renders sample frames through the real compositor, measures every layer's pixels and the final mix,
// and turns that into a short list of concrete problems with clip ids and times.
import { lintClip, lintPlacement, projectDuration, resolveProps, type Clip, type Project } from '@cutroom/core';
import { withStage } from './render.ts';
import { project } from './store.ts';

// components whose job is to be text the viewer must read
const TEXT = new Set(['text', 'title', 'lowerThird', 'captions', 'checklist', 'logoReveal', 'kineticType', 'wordCycle', 'blockReveal', 'splitFlap', 'highlighter',
  'quote', 'countdown', 'chatBubbles', 'notificationToast', 'socialPost', 'searchBar', 'button', 'callout', 'counter', 'barChart', 'lineChart', 'donutChart',
  'comparison', 'timelineSteps', 'flowDiagram', 'codeTyping', 'terminal', 'progressBar']);
// bare text drawn straight onto the scene — the only ones whose average color is a fair contrast measure
// (cards, tiles, markers, bubbles and code windows bring their own backing)
const BARE_TEXT = new Set(['text', 'title', 'captions', 'kineticType', 'wordCycle', 'quote', 'countdown', 'logoReveal', 'counter', 'checklist', 'timelineSteps']);
// full-frame / deliberately oversized or edge-bleeding things — never flagged for edges or overlap
const FULLFRAME = new Set(['background', 'overlay', 'particles', 'gradientOrb', 'confetti', 'flash', 'stripeWipe', 'shapeWipe', 'glitchTransition', 'marquee', 'spotlight', 'burst']);

interface Layer { id: string; name: string; kind?: string; localT: number; coverage: number; bbox: number[] | null; color: number[] | null; backdrop: number | null; contrast: number | null }
interface Frame { t: number; luma: number; std: number; layers: Layer[] }

const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Is the clip mid-entrance/exit at local time lt (where positions and opacity are still moving)? */
function animating(c: Clip, lt: number) {
  const p = resolveProps(c, lt);
  const inD = Math.max(p.animIn && p.animIn !== 'none' ? num(p.inDur, 0.6) + num(p.stagger, 0) * 6 : 0, p.transitionIn && p.transitionIn !== 'none' ? num(p.transitionInDuration, 0.5) : 0);
  const outD = Math.max(p.animOut && p.animOut !== 'none' ? num(p.outDur, 0.4) : 0, p.transitionOut && p.transitionOut !== 'none' ? num(p.transitionOutDuration, 0.5) : 0);
  return lt < inD + 0.15 || lt > c.duration - outD - 0.1;
}

/** Sample times: an even grid plus each text clip's settled moment. */
export function sampleTimes(p: Project, every = 2) {
  const dur = projectDuration(p);
  const ts = new Set<number>();
  for (let t = 0.25; t < dur; t += every) ts.add(+t.toFixed(2));
  for (const c of Object.values(p.clips)) {
    if (c.type !== 'component' || !TEXT.has(c.component ?? '')) continue;
    const pr = resolveProps(c, 0);
    const settle = Math.min(c.duration * 0.7, num(pr.inDur, 0.6) + num(pr.stagger, 0) * 6 + 0.4);
    ts.add(+(c.start + Math.max(0.1, settle)).toFixed(2));
  }
  const sorted = [...ts].filter((t) => t < dur).sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of sorted) if (!out.length || t - out[out.length - 1] > 0.3) out.push(t);
  return out.slice(0, 60);
}

export async function checkProject(id: string, opts: { times?: number[]; audio?: boolean } = {}) {
  const p = project(id);
  const dur = projectDuration(p);
  const issues: { t?: number; clip?: string; level: 'error' | 'warn'; msg: string }[] = [];
  const add = (level: 'error' | 'warn', msg: string, clip?: string, t?: number) => issues.push({ level, msg, clip, t });
  const clips = Object.values(p.clips);
  if (!clips.length) add('error', 'the project has no clips');

  // ---- structure (no rendering)
  for (const c of clips) {
    for (const w of [...lintClip(c), ...lintPlacement(p, c)]) if (!/^.*overlaps/.test(w)) add('warn', w, c.id);
    if (c.type === 'component' && TEXT.has(c.component ?? '')) {
      const pr = resolveProps(c, 0);
      const words = String(pr.text ?? pr.words ?? pr.items ?? pr.messages ?? '').split(/\s+/).filter(Boolean).length;
      if (words > 3 && words / c.duration > 4.5 && !['captions', 'kineticType', 'wordCycle', 'codeTyping', 'terminal', 'marquee'].includes(c.component!))
        add('warn', `${words} words in ${c.duration.toFixed(1)}s is too fast to read (aim ≤ 3–4 words/s) — lengthen the clip or cut words`, c.id, c.start);
    }
  }
  if (!clips.some((c) => c.type === 'sfx' && c.component === 'music') && !clips.some((c) => c.type === 'audio')) add('warn', 'no music bed or audio track — the video will be silent between sound effects');

  // ---- frames
  const times = opts.times?.length ? opts.times : sampleTimes(p);
  const frames: Frame[] = await withStage(p, (page) => page.evaluate(async (ts) => (window as never as { __cutroom: { inspect(t: number[]): Promise<unknown> } }).__cutroom.inspect(ts), times)) as Frame[];
  const W = p.meta.width, H = p.meta.height, reel = H > W;
  const margin = Math.round(Math.min(W, H) * 0.012);
  const seen = new Set<string>();
  const once = (key: string, level: 'error' | 'warn', msg: string, clip?: string, t?: number) => { if (!seen.has(key)) { seen.add(key); add(level, msg, clip, t); } };
  for (const f of frames) {
    // starting/ending on a plain color (fade from black/white) is normal; anywhere else a flat frame means nothing shows
    if (f.std < 1.5 && f.t > 0.5 && f.t < dur - 0.5) once(`flat${Math.round(f.t)}`, 'warn', `frame is a flat color (luma ${f.luma}) — nothing visible`, undefined, f.t);
    const texts: Layer[] = [];
    for (const L of f.layers) {
      const c = p.clips[L.id];
      if (!c) continue;
      const busy = animating(c, L.localT);
      if (!L.bbox || L.coverage < 0.00005) {
        if ((c.type === 'image' || c.type === 'video') && !busy) once(`empty${c.id}`, 'error', `${c.type} draws nothing at ${f.t}s — media not loaded, off-frame, or fully transparent`, c.id, f.t);
        else if (c.type === 'component' && !busy && TEXT.has(L.kind ?? '')) once(`empty${c.id}`, 'warn', `draws nothing at ${f.t}s (off-frame? transparent? still typing in?)`, c.id, f.t);
        continue;
      }
      if (busy || FULLFRAME.has(L.kind ?? '') || !TEXT.has(L.kind ?? '')) continue;
      const [x0, y0, x1, y1] = L.bbox;
      const sides = [x0 <= margin && 'left', y0 <= margin && 'top', x1 >= W - margin && 'right', y1 >= H - margin && 'bottom'].filter(Boolean);
      if (sides.length) once(`edge${c.id}`, 'error', `touches the ${sides.join('/')} edge of the frame (bbox ${L.bbox.join(',')}) — text is probably cut off; reduce size/maxWidth or move it`, c.id, f.t);
      else if (x0 < W * 0.04 || x1 > W * 0.96 || y0 < H * 0.04 || y1 > H * 0.96) once(`safe${c.id}`, 'warn', `sits outside the title-safe area (bbox ${L.bbox.join(',')}) — keep text ≥ 4% from the edges`, c.id, f.t);
      if (reel && (y1 > H * 0.78 || x1 > W * 0.86)) once(`reel${c.id}`, 'warn', `enters the Reels/TikTok UI zone (bottom 22% / right 14%) — bbox ${L.bbox.join(',')}`, c.id, f.t);
      if (BARE_TEXT.has(L.kind ?? '') && L.contrast !== null && L.contrast < 2.2 && L.coverage > 0.0008) once(`contrast${c.id}`, 'warn', `low contrast ${L.contrast}:1 against what's behind it — darken/lighten the backdrop, add a stroke/shadow/box, or change the color`, c.id, f.t);
      texts.push(L);
    }
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i].bbox!, b = texts[j].bbox!;
      const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
      const area = (r: number[]) => (r[2] - r[0]) * (r[3] - r[1]);
      if (ix * iy > 0.12 * Math.min(area(a), area(b))) once(`ov${texts[i].id}|${texts[j].id}`, 'error', `overlaps "${texts[j].id}" (${Math.round(100 * ix * iy / Math.min(area(a), area(b)))}% of the smaller one) — move one or shift their timing`, texts[i].id, f.t);
    }
  }

  // ---- sound
  let audio: { t: number; peak: number; rms: number }[] = [];
  if (opts.audio !== false && dur > 0) {
    audio = await withStage(p, (page) => page.evaluate(async ([a, b]) => (window as never as { __cutroom: { audioStats(a: number, b: number): Promise<unknown> } }).__cutroom.audioStats(a, b), [0, dur] as const)) as typeof audio;
    let silentFrom = -1;
    for (const s of audio) {
      if (s.peak > -0.3) once(`clip${Math.round(s.t)}`, 'warn', `audio peaks at ${s.peak} dBFS around ${s.t}s — lower the loudest overlapping sounds`, undefined, s.t);
      if (s.rms < -55) { if (silentFrom < 0) silentFrom = s.t; } else { if (silentFrom >= 0 && s.t - silentFrom >= 2) add('warn', `near-silence from ${silentFrom}s to ${s.t}s`, undefined, silentFrom); silentFrom = -1; }
    }
    if (silentFrom >= 0 && dur - silentFrom >= 2) add('warn', `near-silence from ${silentFrom}s to the end`, undefined, silentFrom);
  }

  issues.sort((a, b) => (a.level === b.level ? (a.t ?? -1) - (b.t ?? -1) : a.level === 'error' ? -1 : 1));
  const name = (cid?: string) => (cid && p.clips[cid] ? `${cid}${p.clips[cid].name && p.clips[cid].name !== cid ? ` ("${p.clips[cid].name}")` : ''}` : '');
  const lines = issues.map((i) => `${i.level === 'error' ? '✖' : '⚠'} ${i.t !== undefined ? `${i.t.toFixed(2).padStart(6)}s ` : '        '}${name(i.clip) ? name(i.clip) + ': ' : ''}${i.msg.replace(new RegExp(`^${i.clip}: `), '')}`);
  const loud = audio.length ? `audio: peak ${Math.max(...audio.map((a) => a.peak))} dBFS, mean RMS ${(audio.reduce((s, a) => s + a.rms, 0) / audio.length).toFixed(1)} dBFS` : 'audio: not checked';
  const timeline = frames.map((f) => `${f.t.toFixed(2).padStart(6)}s luma ${String(Math.round(f.luma)).padStart(3)}  ${f.layers.filter((l) => l.bbox).map((l) => `${l.id}${l.bbox && TEXT.has(l.kind ?? '') ? `[${l.bbox.join(',')}]` : ''}`).join(' ')}`);
  const errors = issues.filter((i) => i.level === 'error').length, warns = issues.length - errors;
  const text = [
    `${p.meta.name}: ${W}×${H}, ${dur.toFixed(1)}s, ${clips.length} clips — ${errors} error${errors === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'} (${frames.length} frames sampled)`,
    ...(lines.length ? lines : ['✔ no problems found']),
    loud,
    '', 'visible layers per sample (text layers with pixel bbox x0,y0,x1,y1):', ...timeline,
  ].join('\n');
  return { ok: errors === 0, errors, warnings: warns, issues, text, frames: frames.length, audio };
}
