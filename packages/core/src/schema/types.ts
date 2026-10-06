// The project document. Everything Claude or a human makes is one of these plain objects,
// so anything on the timeline can be inspected and edited with the same tools.

export type Ease =
  | 'linear' | 'hold'
  | 'easeIn' | 'easeOut' | 'easeInOut'
  | 'backOut' | 'backIn' | 'elasticOut' | 'bounceOut'
  | 'expoOut' | 'expoIn' | 'circOut'
  | 'sineInOut' | 'quartOut' | 'quintOut' | 'circIn' | 'backInOut' | 'anticipate' | 'spring' | 'snap';

export interface Keyframe {
  /** seconds, relative to the clip start */
  t: number;
  v: number | string;
  /** easing used from this keyframe to the next */
  ease?: Ease;
}

export type ClipType = 'video' | 'image' | 'audio' | 'component' | 'sfx';
export type TrackKind = 'visual' | 'audio';

export type Props = Record<string, unknown>;

export interface Clip {
  id: string;
  trackId: string;
  type: ClipType;
  name: string;
  /** timeline position, seconds */
  start: number;
  duration: number;
  /** source offset into media, seconds (video/audio) */
  inPoint: number;
  speed: number;
  mediaId?: string;
  /** component key for type=component, synth preset key for type=sfx */
  component?: string;
  props: Props;
  keyframes: Record<string, Keyframe[]>;
  /** who created it — 'claude' or a user id */
  createdBy?: string;
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  /** stacking order; higher draws on top */
  order: number;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export interface Media {
  id: string;
  name: string;
  kind: 'video' | 'image' | 'audio';
  /** url the browser should play (proxy when the source codec is not web-safe) */
  url: string;
  /** decoded-audio url (wav) for media that carries sound */
  audioUrl?: string;
  /** waveform peaks url */
  peaksUrl?: string;
  thumbUrl?: string;
  sourcePath?: string;
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
}

export interface Marker {
  id: string;
  t: number;
  label: string;
  color?: string;
}

export interface Meta {
  name: string;
  width: number;
  height: number;
  fps: number;
  /** explicit length; 0 = end of last clip */
  duration: number;
  background: string;
  /** art-direction key from LOOKS (set by Claude so later videos can avoid repeating it) */
  look?: string;
}

export interface Lock {
  holder: string;
  holderName: string;
  task: string;
  since: number;
  /** last time the holder made an edit — lets the UI offer a take-over when it stalls */
  lastActivity?: number;
}

export interface LogEntry {
  id: string;
  at: number;
  author: string;
  authorName: string;
  summary: string;
  targetId?: string;
  /** timeline time the edit concerns, so the UI can jump there */
  t?: number;
}

export interface Project {
  id: string;
  meta: Meta;
  tracks: Record<string, Track>;
  clips: Record<string, Clip>;
  media: Record<string, Media>;
  markers: Record<string, Marker>;
  lock: Lock | null;
  log: LogEntry[];
}

export interface Author {
  id: string;
  name: string;
}

export const CLAUDE: Author = { id: 'claude', name: 'Claude' };
