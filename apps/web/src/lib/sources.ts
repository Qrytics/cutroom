// Media elements for the compositor: one <video> per video clip (so two clips of one file can show different
// frames) and a shared <img> per image. Kept in sync with the playhead for preview, or seeked exactly for export.
import { clipActive, sourceTime, type Clip, type Media, type Project, type SourceProvider } from '@cutroom/core';

export class MediaPool implements SourceProvider {
  private videos = new Map<string, HTMLVideoElement>();
  private images = new Map<string, HTMLImageElement>();
  /** last good frame per video clip — shown while that video seeks/buffers, so playback never flashes to what's below */
  private held = new Map<string, { canvas: HTMLCanvasElement; at: number }>();
  /** frames where an active video had no picture at all (diagnostics) */
  stats = { frames: 0, held: 0, blank: 0 };
  onFrame: () => void = () => {};

  private video(clip: Clip, media: Media) {
    let v = this.videos.get(clip.id);
    if (v && v.dataset.src !== media.url) { v.src = media.url; v.dataset.src = media.url; }
    if (!v) {
      v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
      v.src = media.url; v.dataset.src = media.url;
      v.addEventListener('seeked', () => this.onFrame());
      v.addEventListener('loadeddata', () => this.onFrame());
      this.videos.set(clip.id, v);
    }
    return v;
  }

  image(media: Media) {
    let i = this.images.get(media.id);
    if (!i) {
      i = new Image();
      i.crossOrigin = 'anonymous';
      i.decoding = 'async';
      i.onload = () => this.onFrame();
      i.src = media.url;
      this.images.set(media.id, i);
    }
    return i;
  }

  visual(clip: Clip, media: Media): CanvasImageSource | null {
    if (clip.type === 'image') { const i = this.image(media); return i.complete && i.naturalWidth ? i : null; }
    const v = this.videos.get(clip.id);
    this.stats.frames++;
    if (v && v.readyState >= 2 && !v.seeking) { this.hold(clip.id, v); return v; }
    const h = this.held.get(clip.id);
    if (h) { this.stats.held++; return h.canvas; }
    if (v && v.readyState >= 2) return v;
    this.stats.blank++;
    return null;
  }

  /** Keep a copy of the current frame (at most ~8×/s — only needed as a stand-in during seeks). */
  private hold(id: string, v: HTMLVideoElement) {
    let h = this.held.get(id);
    const now = performance.now();
    if (h && now - h.at < 120) return;
    if (!v.videoWidth) return;
    if (!h) { h = { canvas: document.createElement('canvas'), at: 0 }; this.held.set(id, h); }
    if (h.canvas.width !== v.videoWidth || h.canvas.height !== v.videoHeight) { h.canvas.width = v.videoWidth; h.canvas.height = v.videoHeight; }
    h.canvas.getContext('2d')!.drawImage(v, 0, 0);
    h.at = now;
  }

  /** Bring every video element in line with timeline time t. */
  sync(p: Project, t: number, playing: boolean) {
    const live = new Set<string>();
    for (const c of Object.values(p.clips)) {
      if (c.type !== 'video' && c.type !== 'image') continue;
      const m = p.media[c.mediaId ?? ''];
      if (!m) continue;
      if (c.type === 'image') { this.image(m); continue; }
      const soon = t >= c.start - 2 && t < c.start + c.duration;
      if (!soon) continue;
      live.add(c.id);
      const v = this.video(c, m);
      const target = Math.min(Math.max(0, sourceTime(c, Math.max(t, c.start))), Math.max(0, m.duration - 0.05));
      if (playing && clipActive(c, t)) {
        const rate = c.speed || 1;
        // pre-rolled clips are already parked at their first frame — starting them must not seek again
        if (v.paused) { v.playbackRate = rate; if (Math.abs(v.currentTime - target) > 0.12) v.currentTime = target; v.play().catch(() => {}); }
        else {
          // nudge small drift with the playback rate; only a big gap is worth a seek (seeks stall the picture)
          const drift = v.currentTime - target;
          if (Math.abs(drift) > 0.75 && !v.seeking) v.currentTime = target;
          else v.playbackRate = Math.abs(drift) > 0.06 ? rate * (drift > 0 ? 0.92 : 1.08) : rate;
        }
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - target) > 0.01 && !v.seeking) v.currentTime = target;
        else if (v.readyState >= 2 && !v.seeking) this.hold(c.id, v); // a stand-in frame ready before the clip starts
      }
    }
    for (const [id, v] of this.videos) if (!live.has(id) && !v.paused) v.pause();
    for (const [id, v] of this.videos) if (!p.clips[id]) { v.removeAttribute('src'); v.load(); this.videos.delete(id); this.held.delete(id); }
  }

  /** Seek exactly and wait until every visible frame is decoded (export / screenshots). */
  async prepare(p: Project, t: number) {
    const waits: Promise<unknown>[] = [];
    for (const c of Object.values(p.clips)) {
      const m = p.media[c.mediaId ?? ''];
      if (!m || !clipActive(c, t)) continue;
      if (c.type === 'image') {
        const i = this.image(m);
        if (!i.complete) waits.push(new Promise((r) => { i.onload = i.onerror = r; }));
        continue;
      }
      if (c.type !== 'video') continue;
      const v = this.video(c, m);
      const target = Math.min(Math.max(0, sourceTime(c, t)), Math.max(0, m.duration - 0.04));
      waits.push((async () => {
        if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
        if (Math.abs(v.currentTime - target) > 1e-4) {
          const done = new Promise((r) => v.addEventListener('seeked', r, { once: true }));
          v.currentTime = target + 1e-4;
          await done;
        }
        if (v.readyState < 2) await new Promise((r) => v.addEventListener('canplay', r, { once: true }));
      })());
    }
    await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 15000))]);
  }
}
