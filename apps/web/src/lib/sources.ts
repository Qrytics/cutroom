// Media elements for the compositor: one <video> per video clip (so two clips of one file can show different
// frames) and a shared <img> per image. Kept in sync with the playhead for preview, or seeked exactly for export.
import { clipActive, sourceTime, type Clip, type Media, type Project, type SourceProvider } from '@cutroom/core';

export class MediaPool implements SourceProvider {
  private videos = new Map<string, HTMLVideoElement>();
  private images = new Map<string, HTMLImageElement>();
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
    return v && v.readyState >= 2 ? v : null;
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
        v.playbackRate = c.speed || 1;
        if (v.paused) { v.currentTime = target; v.play().catch(() => {}); }
        else if (Math.abs(v.currentTime - target) > 0.2) v.currentTime = target;
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - target) > 0.01 && !v.seeking) v.currentTime = target;
      }
    }
    for (const [id, v] of this.videos) if (!live.has(id) && !v.paused) v.pause();
    for (const [id, v] of this.videos) if (!p.clips[id]) { v.removeAttribute('src'); v.load(); this.videos.delete(id); }
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
