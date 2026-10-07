// Objective sound-design QA: renders every SFX preset and fingerprints it (noisiness, brightness + sweep, pitch,
// transients, rhythm, modulation, band balance, envelope shape), then reports near-duplicates and which presets
// outside the Transitions category still sound like a whoosh.
//   npx tsx scripts/check-sfx.ts            summary + problems
//   npx tsx scripts/check-sfx.ts --table    also the per-preset feature table and nearest neighbours
//   npx tsx scripts/check-sfx.ts --json     machine-readable features
import { SFX, synthesize, SR } from '../packages/core/src/index.ts';

const N = 2048, HOP = 512;
const WIN = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

export interface Features {
  tonality: number; flatness: number; centroid: number; slope: number; bandwidth: number; pitch: number; attack: number; decay: number;
  onsets: number; am: number; low: number; mid: number; high: number; smooth: number; peakPos: number; dur: number;
}
export const FEATURE_KEYS: (keyof Features)[] = ['tonality', 'flatness', 'centroid', 'slope', 'bandwidth', 'pitch', 'attack', 'decay', 'onsets', 'am', 'low', 'mid', 'high', 'smooth', 'peakPos', 'dur'];

export function analyze(x: Float32Array): Features {
  const n = x.length;
  // ---- envelope (5 ms RMS)
  const E = Math.max(1, Math.round(SR * 0.005)), envl: number[] = [];
  for (let i = 0; i < n; i += E) { let s = 0; const e = Math.min(n, i + E); for (let j = i; j < e; j++) s += x[j] * x[j]; envl.push(Math.sqrt(s / Math.max(1, e - i))); }
  const pk = Math.max(...envl, 1e-9), pki = envl.indexOf(pk);
  let a90 = 0; while (a90 < envl.length && envl[a90] < pk * 0.9) a90++;
  let d = pki; while (d < envl.length && envl[d] > pk * 0.1) d++;
  const db = envl.map((v) => 20 * Math.log10(Math.max(v, pk * 1e-4) / pk));
  // smoothed envelope (30 ms RMS, 10 ms hop) — noise jitter must not count as structure
  const H2 = Math.round(SR * 0.01), W2 = Math.round(SR * 0.03), sm: number[] = [];
  for (let i = 0; i < n; i += H2) { let q = 0; const e = Math.min(n, i + W2); for (let j = i; j < e; j++) q += x[j] * x[j]; sm.push(Math.sqrt(q / Math.max(1, e - i))); }
  const spk = Math.max(...sm, 1e-9), sdb = sm.map((v) => 20 * Math.log10(Math.max(v, spk * 1e-4) / spk));
  // onsets: a real hit gains ≥ 20 % of peak level within 30 ms and at least doubles from its recent minimum (≥ 60 ms apart)
  let onsets = 0, last = -1e9;
  for (let i = 3; i < sm.length; i++) {
    const lo = Math.min(...sm.slice(Math.max(0, i - 6), i));
    if (sm[i] - sm[i - 3] >= 0.2 * spk && sm[i] >= 2 * lo + 1e-9 && sdb[i] > -35 && i - last >= 6) { onsets++; last = i; }
  }
  // smoothness: total variation of the normalized smoothed envelope (1 swell up and down = 2)
  const act = sm.map((v) => v / spk).filter((v) => v > 0.05);
  let tv = 0; for (let i = 1; i < act.length; i++) tv += Math.abs(act[i] - act[i - 1]);
  const smooth = act.length ? 1 / (1 + Math.max(0, tv - 2) / 1.5) : 0;
  // AM rate: autocorrelation of the active envelope, 2–40 Hz
  let am = 0;
  { const ev = envl.slice(0, Math.min(envl.length, 800)); const m = ev.reduce((s, v) => s + v, 0) / ev.length; const z = ev.map((v) => v - m);
    let best = 0, bestLag = 0, z0 = z.reduce((s, v) => s + v * v, 0) || 1;
    for (let lag = 5; lag <= 100; lag++) { let s = 0; for (let i = 0; i + lag < z.length; i++) s += z[i] * z[i + lag]; s /= z0; if (s > best) { best = s; bestLag = lag; } }
    am = best > 0.3 ? 200 / bestLag : 0; }
  // ---- spectral frames
  const re = new Float64Array(N), im = new Float64Array(N);
  let wsum = 0, flat = 0, cen = 0, bw = 0, lo = 0, mi = 0, hi = 0, ton = 0;
  const cs: [number, number, number][] = [];
  const binHz = SR / N;
  for (let s = 0; s + N <= Math.max(n, N); s += HOP) {
    let en = 0;
    for (let i = 0; i < N; i++) { const v = (x[s + i] ?? 0) * WIN[i]; re[i] = v; im[i] = 0; en += v * v; }
    if (en < 1e-7) continue;
    fft(re, im);
    let ps = 0, lg = 0, c = 0, cnt = 0, l = 0, m = 0, h = 0;
    const P = new Float64Array(N / 2);
    for (let k = 1; k < N / 2; k++) { const p = re[k] * re[k] + im[k] * im[k] + 1e-12; P[k] = p; ps += p; lg += Math.log(p); c += p * Math.log2(k * binHz); cnt++;
      const f = k * binHz; if (f < 250) l += p; else if (f < 2000) m += p; else h += p; }
    const am_ = ps / cnt, gm = Math.exp(lg / cnt), fl = gm / am_, cent = c / ps, w = Math.sqrt(en);
    let spread = 0; for (let k = 1; k < N / 2; k++) spread += P[k] * (Math.log2(k * binHz) - cent) ** 2;
    // tonality: share of power in sharp peaks ≥ 12 dB over their ±24-bin neighbourhood median
    let peakP = 0;
    for (let k = 3; k < N / 2 - 3; k++) {
      if (P[k] < P[k - 1] || P[k] < P[k + 1]) continue;
      const nb: number[] = []; for (let j = Math.max(1, k - 24); j < Math.min(N / 2, k + 25); j += 3) nb.push(P[j]);
      nb.sort((a, b) => a - b);
      if (P[k] > nb[nb.length >> 1] * 16) peakP += P[k - 1] + P[k] + P[k + 1];
    }
    ton += (peakP / ps) * w;
    wsum += w; flat += fl * w; cen += cent * w; bw += Math.sqrt(spread / ps) * w; lo += (l / ps) * w; mi += (m / ps) * w; hi += (h / ps) * w;
    cs.push([s / n, cent, w]);
  }
  wsum ||= 1;
  // energy-weighted regression of centroid (octaves) over normalized time → octaves swept over the whole sound
  let slope = 0;
  if (cs.length > 2) {
    const W = cs.reduce((a, c) => a + c[2], 0), mt = cs.reduce((a, c) => a + c[0] * c[2], 0) / W, mc = cs.reduce((a, c) => a + c[1] * c[2], 0) / W;
    let num = 0, den = 0; for (const [t, c, w] of cs) { num += w * (t - mt) * (c - mc); den += w * (t - mt) ** 2; }
    slope = den > 0 ? num / den : 0;
  }
  // ---- pitch strength: normalized autocorrelation peak (lags for 60–2000 Hz) on the loudest 4096 samples
  let pitch = 0;
  { const L = 4096, c0 = Math.max(0, Math.min(n - L, pki * E - L / 2)), seg = x.subarray(c0, c0 + L);
    let z0 = 0; for (let i = 0; i < seg.length; i++) z0 += seg[i] * seg[i];
    if (z0 > 0) for (let lag = Math.floor(SR / 2000); lag <= Math.floor(SR / 60); lag++) { let s = 0; for (let i = 0; i + lag < seg.length; i++) s += seg[i] * seg[i + lag]; pitch = Math.max(pitch, s / z0); } }
  return {
    tonality: ton / wsum, flatness: flat / wsum, centroid: cen / wsum, slope, bandwidth: bw / wsum, pitch, attack: Math.log10(0.002 + a90 * 0.005), decay: Math.log10(0.005 + (d - pki) * 0.005),
    onsets: Math.log1p(onsets), am, low: lo / wsum, mid: mi / wsum, high: hi / wsum, smooth, peakPos: pki / Math.max(1, envl.length), dur: Math.log10(n / SR),
  };
}

// weights: what makes two sounds *sound* different
const WEIGHT: Record<keyof Features, number> = { tonality: 1.6, flatness: 0.8, centroid: 1.2, slope: 1, bandwidth: 0.6, pitch: 1.4, attack: 0.8, decay: 0.8, onsets: 1.2, am: 0.7, low: 0.7, mid: 0.6, high: 0.7, smooth: 0.8, peakPos: 0.7, dur: 0.5 };

/** whoosh signature: noise-dominant, unpitched, one smooth swell, few onsets, soft attack */
export function whooshScore(f: Features) {
  const sig = (v: number, c: number, k: number) => 1 / (1 + Math.exp(-(v - c) / k));
  // noise (not tonal), no transients (≤ 1 onset, soft attack), one smooth swell, at least a quarter second long
  return (1 - sig(f.tonality, 0.25, 0.06)) * (1 - sig(f.pitch, 0.55, 0.08)) * (1 - sig(f.onsets, Math.log1p(1.5), 0.2))
    * sig(f.smooth, 0.5, 0.1) * sig(f.attack, Math.log10(0.04), 0.15) * sig(f.dur, Math.log10(0.25), 0.1);
}

export function fingerprints(keys = Object.keys(SFX).filter((k) => k !== 'music')) {
  const out: Record<string, Features> = {};
  for (const k of keys) {
    const d = SFX[k];
    const len = d.stretch ? 1.5 : Math.min(d.defaultDuration, 6);
    const st = synthesize(k, {}, len, 1234);
    const m = new Float32Array(st[0].length); for (let i = 0; i < m.length; i++) m[i] = (st[0][i] + st[1][i]) / 2;
    out[k] = analyze(m);
  }
  return out;
}

export function distances(F: Record<string, Features>) {
  const keys = Object.keys(F);
  const mean = {} as Record<keyof Features, number>, sd = {} as Record<keyof Features, number>;
  for (const f of FEATURE_KEYS) { const v = keys.map((k) => F[k][f]); mean[f] = v.reduce((a, b) => a + b, 0) / v.length; sd[f] = Math.sqrt(v.reduce((a, b) => a + (b - mean[f]) ** 2, 0) / v.length) || 1; }
  const z = (k: string) => FEATURE_KEYS.map((f) => ((F[k][f] - mean[f]) / sd[f]) * WEIGHT[f]);
  const Z = Object.fromEntries(keys.map((k) => [k, z(k)]));
  const dist = (a: string, b: string) => Math.sqrt(Z[a].reduce((s, v, i) => s + (v - Z[b][i]) ** 2, 0));
  return { dist, keys };
}

const DUP = 1.0; // weighted z-distance below this = near-duplicate to the ear
const CROWD = 1.6; // whoosh-like presets need a bigger margin from each other: they share the most cues

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = performance.now();
  const F = fingerprints();
  const { dist, keys } = distances(F);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(F, null, 1)); process.exit(0); }
  const nn = keys.map((k) => { const o = keys.filter((x) => x !== k).map((x) => [x, dist(k, x)] as const).sort((a, b) => a[1] - b[1]); return { k, o }; });
  if (process.argv.includes('--table')) {
    const f2 = (v: number) => v.toFixed(2).padStart(6);
    console.log('key'.padEnd(18), FEATURE_KEYS.map((k) => k.slice(0, 6).padStart(6)).join(' '), ' whoosh  nearest');
    for (const { k, o } of nn) console.log(k.padEnd(18), FEATURE_KEYS.map((f) => f2(F[k][f])).join(' '), f2(whooshScore(F[k])), ' ', o.slice(0, 3).map(([x, d]) => `${x} ${d.toFixed(2)}`).join(', '));
  }
  const whooshy = keys.filter((k) => SFX[k].category !== 'Transitions' && whooshScore(F[k]) > 0.3).sort((a, b) => whooshScore(F[b]) - whooshScore(F[a]));
  const pairs: [string, string, number][] = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const d = dist(keys[i], keys[j]); if (d < DUP) pairs.push([keys[i], keys[j], d]); }
  pairs.sort((a, b) => a[2] - b[2]);
  // whoosh crowding: noise swells must still be clearly different from each other (stricter threshold)
  const swells = keys.filter((k) => whooshScore(F[k]) > 0.3);
  const crowd: [string, string, number][] = [];
  for (let i = 0; i < swells.length; i++) for (let j = i + 1; j < swells.length; j++) { const dd = dist(swells[i], swells[j]); if (dd < CROWD) crowd.push([swells[i], swells[j], dd]); }
  crowd.sort((a, b) => a[2] - b[2]);
  let minD = Infinity, minPair = ''; for (const { k, o } of nn) if (o[0][1] < minD) { minD = o[0][1]; minPair = `${k} ↔ ${o[0][0]}`; }
  console.log(`${keys.length} presets fingerprinted in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`\nwhoosh-like presets outside Transitions: ${whooshy.length}`);
  for (const k of whooshy) console.log(`  ${k.padEnd(18)} ${SFX[k].category.padEnd(11)} score ${whooshScore(F[k]).toFixed(2)}  (flat ${F[k].flatness.toFixed(2)}, pitch ${F[k].pitch.toFixed(2)}, onsets ${Math.round(Math.expm1(F[k].onsets))}, smooth ${F[k].smooth.toFixed(2)})`);
  console.log(`\nnear-duplicate pairs (distance < ${DUP}): ${pairs.length}`);
  for (const [a, b, d] of pairs) console.log(`  ${a.padEnd(18)} ↔ ${b.padEnd(18)} ${d.toFixed(2)}`);
  console.log(`\nwhoosh-family presets (${swells.length}): ${swells.join(', ')}`);
  console.log(`whoosh crowding (two swells closer than ${CROWD}): ${crowd.length}`);
  for (const [a, b, dd] of crowd) console.log(`  ${a.padEnd(18)} ↔ ${b.padEnd(18)} ${dd.toFixed(2)}`);
  console.log(`\nmin pairwise distance: ${minD.toFixed(2)} (${minPair})`);
  process.exit(whooshy.length || pairs.length || crowd.length ? 1 : 0);
}
