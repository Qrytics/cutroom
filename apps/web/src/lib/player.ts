// Transport: play/pause/seek. The audio clock is the master clock so picture follows sound.
import { projectDuration } from '@cutroom/core';
import { LiveMixer } from './audio.ts';
import { MediaPool } from './sources.ts';
import { useEditor } from './store.ts';

class Player {
  mixer: LiveMixer | null = null;
  pool = new MediaPool();
  private startCtx = 0;
  private startT = 0;
  private raf = 0;
  private reschedule = 0;
  private loopRange: [number, number] | null = null;

  constructor() {
    // live edits while playing (e.g. Claude adding a sound) re-schedule the audio from the current time
    let last = useEditor.getState().project;
    useEditor.subscribe((s) => {
      if (s.project !== last) {
        last = s.project;
        if (s.playing) { clearTimeout(this.reschedule); this.reschedule = window.setTimeout(() => this.restartAudio(), 200); }
      }
    });
  }

  /** the live mixer, created on first use (browsers only allow audio after a user gesture) */
  audio() { return (this.mixer ??= new LiveMixer()); }

  async play() {
    const st = useEditor.getState();
    if (!st.project || st.playing) return;
    const dur = projectDuration(st.project);
    let t = st.time;
    if (t >= dur - 0.02) t = 0;
    useEditor.setState({ playing: true, time: t });
    this.startT = t;
    this.startCtx = await this.audio().play(st.project, t);
    if (!useEditor.getState().playing) { this.audio().stop(); return; }
    this.tick();
  }

  private async restartAudio() {
    const st = useEditor.getState();
    if (!st.playing || !st.project) return;
    const t = this.now();
    this.startT = t;
    this.startCtx = await this.audio().play(st.project, t);
  }

  now() { return this.startT + Math.max(0, this.audio().ctx.currentTime - this.startCtx); }

  private tick = () => {
    const st = useEditor.getState();
    if (!st.playing || !st.project) return;
    const dur = projectDuration(st.project);
    let t = this.now();
    if (this.loopRange && t >= this.loopRange[1]) { this.seek(this.loopRange[0]); return; }
    if (t >= dur) { t = dur; this.pause(); useEditor.setState({ time: t }); return; }
    useEditor.setState({ time: t });
    this.raf = requestAnimationFrame(this.tick);
  };

  pause() {
    cancelAnimationFrame(this.raf);
    this.mixer?.stop();
    useEditor.setState({ playing: false });
  }

  toggle() { if (useEditor.getState().playing) this.pause(); else this.play(); }

  seek(t: number) {
    const st = useEditor.getState();
    const dur = st.project ? projectDuration(st.project) : 0;
    t = Math.max(0, Math.min(t, Math.max(dur, 0)));
    if (st.playing) {
      this.pause();
      useEditor.setState({ time: t });
      this.play();
    } else useEditor.setState({ time: t });
  }

  step(frames: number) {
    const st = useEditor.getState();
    const fps = st.project?.meta.fps ?? 30;
    this.seek(Math.round((st.time + frames / fps) * fps) / fps);
  }

  setLoop(r: [number, number] | null) { this.loopRange = r; }
}

export const player = new Player();
// handy from the browser console / automated checks: __cutroomPlayer.pool.stats
(window as unknown as { __cutroomPlayer?: Player }).__cutroomPlayer = player;
