// Art directions ("looks"). Each look is a coherent taste: palette, font pairing, shading, texture, background,
// text/transition motion, camera motion, music and sound kit — with several options per slot. rollLook() picks one
// concrete combination (seeded) and turns it into ready-to-use clip props, so two videos never share the same skin
// unless asked to. Values reference component/sfx option names; test/looks.test.ts checks they all exist.
import { hash, rng } from './engine/ease.ts';

export interface Palette { bg: string; bg2: string; surface: string; text: string; muted: string; accent: string; accent2: string; accent3: string }
export interface FontPair { display: string; body: string; mono: string; weight: number; uppercase?: boolean; tracking?: number; italic?: boolean }
export type Shading = 'flat' | 'gradient' | 'glow' | 'neon' | 'duotone' | 'soft' | 'outline' | 'shadow';
type Opt<T> = T[];

export interface Look {
  key: string;
  name: string;
  /** tags used to match a brief: tech, playful, luxury, editorial, retro, corporate, bold, calm, dark, light, gaming, … */
  vibe: string[];
  note: string;
  palettes: Opt<Palette>;
  fonts: Opt<FontPair>;
  shading: Opt<Shading>;
  backgrounds: Opt<Record<string, unknown>>;
  /** overlay component styles laid over everything (null = clean) */
  textures: Opt<{ style: string; intensity: number } | null>;
  titleLayouts: Opt<string>;
  lowerThirds: Opt<string>;
  captions: Opt<string>;
  logoStyles: Opt<string>;
  textIn: Opt<string>;
  textOut: Opt<string>;
  loops: Opt<string>;
  transitions: Opt<string>;
  wipes: Opt<{ component: string; props: Record<string, unknown> }>;
  enter: Opt<string>;
  camera: Opt<string>;
  accents: Opt<string>;
  particles: Opt<string | null>;
  music: Opt<{ style: string; mood: string }>;
  sfx: { move: Opt<string>; appear: Opt<string>; hit: Opt<string>; reveal: Opt<string>; ui: Opt<string> };
}

const P = (bg: string, bg2: string, surface: string, text: string, muted: string, accent: string, accent2: string, accent3: string): Palette =>
  ({ bg, bg2, surface, text, muted, accent, accent2, accent3 });
const F = (display: string, body: string, mono: string, weight: number, extra: Partial<FontPair> = {}): FontPair => ({ display, body, mono, weight, ...extra });

export const LOOKS: Look[] = [
  {
    key: 'midnightTech', name: 'Midnight tech', vibe: ['tech', 'dark', 'product', 'devtools', 'saas', 'calm'],
    note: 'Deep navy stage, one electric accent, precise motion. Let code and UI be the hero.',
    palettes: [P('#060912', '#0f1a3a', '#111827', '#f5f7ff', 'rgba(229,233,255,0.62)', '#4f8cff', '#8b5cf6', '#22d3ee'),
      P('#05070d', '#0b2230', '#0f1720', '#eefcff', 'rgba(220,245,255,0.6)', '#22d3ee', '#3b82f6', '#a3e635')],
    fonts: [F('Inter', 'Inter', 'JetBrains Mono', 800, { tracking: -2 }), F('Sora', 'Manrope', 'JetBrains Mono', 700, { tracking: -1 })],
    shading: ['glow', 'gradient'],
    backgrounds: [{ style: 'glow' }, { style: 'mesh' }, { style: 'grid', spacing: 90 }],
    textures: [null, { style: 'grain', intensity: 0.25 }],
    titleLayouts: ['classic', 'split'], lowerThirds: ['bar', 'glass'], captions: ['highlight', 'box'], logoStyles: ['sweep', 'blur'],
    textIn: ['wordsUp', 'maskUp', 'blurIn'], textOut: ['fade', 'maskDown'], loops: ['none', 'glow'],
    transitions: ['fade', 'slideLeft', 'zoomBlur'], wipes: [{ component: 'shapeWipe', props: { style: 'slats' } }, { component: 'stripeWipe', props: {} }],
    enter: ['expoOut', 'quintOut'], camera: ['handheld', 'none'], accents: ['burst', 'gradientOrb', 'spotlight'], particles: ['dust', null],
    music: [{ style: 'minimal', mood: 'tech' }, { style: 'synthwave', mood: 'tense' }, { style: 'house', mood: 'tech' }],
    sfx: { move: ['whoosh', 'sweepUp'], appear: ['blip', 'pop'], hit: ['impact', 'subDrop'], reveal: ['riser', 'reverseSwell'], ui: ['click', 'keyboardClack', 'toggle'] },
  },
  {
    key: 'neonArcade', name: 'Neon arcade', vibe: ['gaming', 'retro', 'bold', 'dark', 'playful', 'energetic', 'music'],
    note: 'Synthwave: magenta/cyan neon on near-black, perspective grid floor, glow everything, chunky display type.',
    palettes: [P('#0a0014', '#2a0040', '#14001f', '#fff0ff', 'rgba(255,220,255,0.65)', '#ff2bd6', '#00e5ff', '#ffd23f'),
      P('#03000d', '#1a0b3d', '#0e0726', '#f2f0ff', 'rgba(230,225,255,0.6)', '#7c3aed', '#f43f5e', '#22d3ee')],
    fonts: [F('Unbounded', 'Outfit', 'Space Mono', 900, { uppercase: true, tracking: 2 }), F('Major Mono Display', 'Space Mono', 'Space Mono', 400, { tracking: 4 })],
    shading: ['neon', 'glow'],
    backgrounds: [{ style: 'perspectiveGrid' }, { style: 'starfield' }, { style: 'stripes' }],
    textures: [{ style: 'scanlines', intensity: 0.5 }, { style: 'crt', intensity: 0.45 }, { style: 'vhs', intensity: 0.4 }],
    titleLayouts: ['outline', 'stacked', 'huge'], lowerThirds: ['boxed', 'stacked'], captions: ['neon', 'outline'], logoStyles: ['glitch', 'stroke'],
    textIn: ['glitchIn', 'scramble', 'stamp', 'charsPop'], textOut: ['glitchOut', 'blink', 'zoomOut'], loops: ['glow', 'jitter'],
    transitions: ['glitch', 'whipLeft', 'zoomBlur', 'iris'], wipes: [{ component: 'glitchTransition', props: {} }, { component: 'shapeWipe', props: { style: 'grid' } }],
    enter: ['backOut', 'snap'], camera: ['pulse', 'shake', 'none'], accents: ['burst', 'kineticType', 'marquee'], particles: ['stars', 'sparks'],
    music: [{ style: 'synthwave', mood: 'aggressive' }, { style: 'chiptune', mood: 'playful' }, { style: 'dnb', mood: 'tense' }],
    sfx: { move: ['zap', 'warp', 'whoosh'], appear: ['blip', 'coin', 'bloop'], hit: ['slam', 'impact', 'punch'], reveal: ['riser', 'levelUp'], ui: ['blip', 'toggle', 'keyboardClack'] },
  },
  {
    key: 'editorialPaper', name: 'Editorial paper', vibe: ['editorial', 'light', 'luxury', 'story', 'calm', 'premium', 'writing'],
    note: 'Magazine on warm paper: big serif headlines, italic accents, ink-black text, one red accent, slow elegant moves.',
    palettes: [P('#f4efe6', '#e9e1d2', '#fffaf2', '#1a1714', 'rgba(26,23,20,0.62)', '#c2410c', '#1e3a8a', '#0f766e'),
      P('#f1ece4', '#ded6c8', '#faf7f2', '#121212', 'rgba(18,18,18,0.6)', '#b91c1c', '#121212', '#a16207')],
    fonts: [F('Instrument Serif', 'Manrope', 'IBM Plex Mono', 400, { tracking: -1, italic: false }), F('Fraunces', 'Inter', 'IBM Plex Mono', 700, { tracking: -2 }),
      F('DM Serif Display', 'Outfit', 'Space Mono', 400)],
    shading: ['flat', 'shadow'],
    backgrounds: [{ style: 'paper' }, { style: 'solid' }],
    textures: [{ style: 'grain', intensity: 0.35 }, { style: 'halftone', intensity: 0.2 }],
    titleLayouts: ['editorial', 'classic', 'huge'], lowerThirds: ['underline', 'minimal'], captions: ['underline', 'plain'], logoStyles: ['typeOn', 'blur'],
    textIn: ['maskUp', 'fade', 'tracking', 'blurIn'], textOut: ['fade', 'maskDown'], loops: ['none'],
    transitions: ['fade', 'wipeRight', 'split'], wipes: [{ component: 'shapeWipe', props: { style: 'doors' } }, { component: 'blockReveal', props: {} }],
    enter: ['sineInOut', 'quartOut'], camera: ['breathe', 'none'], accents: ['highlighter', 'quote', 'scribble'], particles: [null],
    music: [{ style: 'piano', mood: 'warm' }, { style: 'ambient', mood: 'dreamy' }, { style: 'indie', mood: 'melancholy' }],
    sfx: { move: ['airPuff', 'swish'], appear: ['tick', 'snap'], hit: ['thud', 'piano'], reveal: ['harp', 'reverseSwell'], ui: ['click', 'tick'] },
  },
  {
    key: 'swissGrid', name: 'Swiss grid', vibe: ['corporate', 'light', 'design', 'minimal', 'bold', 'finance', 'architecture'],
    note: 'International style: white field, black type, one primary red, strict left alignment, hard cuts and wipes.',
    palettes: [P('#fafafa', '#eeeeee', '#ffffff', '#0a0a0a', 'rgba(10,10,10,0.6)', '#e11d2e', '#0a0a0a', '#2563eb'),
      P('#f5f5f0', '#e5e5df', '#ffffff', '#111111', 'rgba(17,17,17,0.55)', '#2563eb', '#f59e0b', '#111111')],
    fonts: [F('Inter', 'Inter', 'JetBrains Mono', 900, { tracking: -4 }), F('Archivo Black', 'Inter', 'IBM Plex Mono', 400, { uppercase: true, tracking: -1 })],
    shading: ['flat'],
    backgrounds: [{ style: 'solid' }, { style: 'grid', spacing: 120 }],
    textures: [null],
    titleLayouts: ['split', 'huge', 'classic'], lowerThirds: ['minimal', 'bar'], captions: ['box', 'plain'], logoStyles: ['split', 'stack'],
    textIn: ['maskUp', 'slideRight', 'splitIn'], textOut: ['maskDown', 'slideLeft'], loops: ['none'],
    transitions: ['wipeLeft', 'wipeUp', 'slideLeft', 'blinds'], wipes: [{ component: 'shapeWipe', props: { style: 'blinds' } }, { component: 'blockReveal', props: {} }],
    enter: ['quintOut', 'snap'], camera: ['none'], accents: ['timelineSteps', 'comparison', 'barChart'], particles: [null],
    music: [{ style: 'minimal', mood: 'bright' }, { style: 'corporate', mood: 'hopeful' }, { style: 'garage', mood: 'tech' }],
    sfx: { move: ['swish', 'swipe'], appear: ['tick2', 'snap'], hit: ['punch', 'thud'], reveal: ['sweepUp'], ui: ['click', 'toggle'] },
  },
  {
    key: 'pastelPop', name: 'Pastel pop', vibe: ['playful', 'light', 'consumer', 'social', 'friendly', 'kids', 'creator'],
    note: 'Candy pastels, rounded geometric type, bouncy springy motion, stickers and blobs. Nothing sharp.',
    palettes: [P('#fff4f8', '#ffe1ec', '#ffffff', '#2b1d3a', 'rgba(43,29,58,0.6)', '#ff5fa2', '#7c5cff', '#ffc93c'),
      P('#f0fbff', '#d8f3ff', '#ffffff', '#1e2a3a', 'rgba(30,42,58,0.6)', '#3ec7ff', '#ff7ab6', '#9be15d')],
    fonts: [F('Outfit', 'Outfit', 'Space Mono', 900, { tracking: -1 }), F('Unbounded', 'Manrope', 'Space Mono', 700), F('Caveat', 'Outfit', 'Space Mono', 700)],
    shading: ['soft', 'shadow'],
    backgrounds: [{ style: 'blobs' }, { style: 'dots', spacing: 60 }, { style: 'mesh' }],
    textures: [null, { style: 'grain', intensity: 0.15 }],
    titleLayouts: ['boxed', 'stacked'], lowerThirds: ['pill', 'boxed'], captions: ['bounce', 'pop', 'box'], logoStyles: ['stack', 'split'],
    textIn: ['charsPop', 'elastic', 'wordsPop', 'waveIn'], textOut: ['pop', 'charsDown'], loops: ['float', 'wave'],
    transitions: ['drop', 'zoomIn', 'iris', 'swing'], wipes: [{ component: 'shapeWipe', props: { style: 'circle' } }, { component: 'shapeWipe', props: { style: 'liquid' } }],
    enter: ['spring', 'backOut', 'elasticOut'], camera: ['float', 'bob'], accents: ['scribble', 'burst', 'chatBubbles', 'socialPost'], particles: ['bubbles', 'confetti'],
    music: [{ style: 'corporate', mood: 'playful' }, { style: 'funk', mood: 'bright' }, { style: 'chiptune', mood: 'playful' }],
    sfx: { move: ['swish', 'airPuff'], appear: ['bubble', 'pop', 'bloop'], hit: ['bloop', 'clap'], reveal: ['magic', 'success'], ui: ['bubble', 'toggle', 'sendMessage'] },
  },
  {
    key: 'brutalist', name: 'Brutalist', vibe: ['bold', 'loud', 'streetwear', 'launch', 'aggressive', 'fashion', 'creator'],
    note: 'Acid yellow on black, condensed ALL CAPS, slammed words, hard cuts, marquee bands, zero easing on exits.',
    palettes: [P('#0b0b0b', '#1a1a1a', '#141414', '#f5f5f5', 'rgba(245,245,245,0.6)', '#d7ff1f', '#ff3b1f', '#ffffff'),
      P('#f2f2f2', '#dcdcdc', '#ffffff', '#0b0b0b', 'rgba(11,11,11,0.6)', '#ff3b1f', '#0b0b0b', '#2b59ff')],
    fonts: [F('Anton', 'Space Grotesk', 'Space Mono', 400, { uppercase: true, tracking: 0 }), F('Bebas Neue', 'Inter', 'Space Mono', 400, { uppercase: true, tracking: 2 }),
      F('Archivo Black', 'Space Grotesk', 'Space Mono', 400, { uppercase: true, tracking: -2 })],
    shading: ['flat', 'outline'],
    backgrounds: [{ style: 'solid' }, { style: 'stripes' }, { style: 'halftone' }],
    textures: [{ style: 'grain', intensity: 0.4 }, { style: 'halftone', intensity: 0.3 }, null],
    titleLayouts: ['huge', 'outline', 'stacked'], lowerThirds: ['boxed', 'stacked'], captions: ['box', 'stack', 'outline'], logoStyles: ['stack', 'glitch'],
    textIn: ['stamp', 'splitIn', 'maskUp', 'charsUp'], textOut: ['blink', 'trackingOut', 'zoomOut'], loops: ['jitter', 'none'],
    transitions: ['whipLeft', 'whipRight', 'stretch', 'glitch'], wipes: [{ component: 'shapeWipe', props: { style: 'slats' } }, { component: 'stripeWipe', props: { stripes: 5 } }],
    enter: ['snap', 'expoOut'], camera: ['shake', 'pulse'], accents: ['kineticType', 'marquee', 'countdown'], particles: [null],
    music: [{ style: 'trap', mood: 'aggressive' }, { style: 'dnb', mood: 'aggressive' }, { style: 'house', mood: 'dark' }],
    sfx: { move: ['whooshHit', 'tapeStop'], appear: ['snap', 'punch'], hit: ['slam', 'impact', 'subDrop'], reveal: ['riser', 'braam'], ui: ['clap', 'click'] },
  },
  {
    key: 'luxuryNoir', name: 'Luxury noir', vibe: ['luxury', 'premium', 'dark', 'fashion', 'finance', 'calm', 'elegant'],
    note: 'Black and champagne gold, high-contrast serif, wide tracking, slow fades and light sweeps. Restraint.',
    palettes: [P('#070605', '#1a1510', '#12100d', '#f6efe3', 'rgba(246,239,227,0.58)', '#d4af6a', '#8c6a3a', '#f6efe3'),
      P('#050507', '#13131a', '#0e0e14', '#ecebf3', 'rgba(236,235,243,0.55)', '#c9b6ff', '#8a7fb3', '#ecebf3')],
    fonts: [F('Playfair Display', 'Manrope', 'IBM Plex Mono', 400, { tracking: 1 }), F('DM Serif Display', 'Sora', 'IBM Plex Mono', 400, { uppercase: true, tracking: 8 }),
      F('Fraunces', 'Manrope', 'IBM Plex Mono', 400, { italic: true })],
    shading: ['gradient', 'soft'],
    backgrounds: [{ style: 'radial' }, { style: 'conic' }, { style: 'aurora' }],
    textures: [{ style: 'grain', intensity: 0.3 }, { style: 'lightLeak', intensity: 0.25 }],
    titleLayouts: ['editorial', 'classic'], lowerThirds: ['minimal', 'underline'], captions: ['plain', 'underline'], logoStyles: ['sweep', 'blur'],
    textIn: ['tracking', 'blurIn', 'fade', 'maskUp'], textOut: ['fade', 'trackingOut'], loops: ['shimmer', 'none'],
    transitions: ['fade', 'blur', 'iris'], wipes: [{ component: 'flash', props: { color: '#000000', peak: 0.5 } }, { component: 'shapeWipe', props: { style: 'zoomRings' } }],
    enter: ['sineInOut', 'easeInOut'], camera: ['breathe', 'none'], accents: ['gradientOrb', 'particles', 'quote'], particles: ['bokeh', 'embers'],
    music: [{ style: 'cinematic', mood: 'mysterious' }, { style: 'ambient', mood: 'warm' }, { style: 'piano', mood: 'melancholy' }],
    sfx: { move: ['airPuff', 'whoosh'], appear: ['glassTing', 'sparkle'], hit: ['gong', 'boom'], reveal: ['reverseSwell', 'shimmer'], ui: ['tick', 'click'] },
  },
  {
    key: 'terminalGreen', name: 'Terminal', vibe: ['devtools', 'hacker', 'tech', 'dark', 'retro', 'cli', 'security'],
    note: 'Phosphor green mono on black, CRT scanlines, scramble/type-on text, blinking cursors, glitch cuts.',
    palettes: [P('#020602', '#041a0a', '#06120a', '#c8ffd4', 'rgba(200,255,212,0.6)', '#39ff7a', '#00d0ff', '#ffb000'),
      P('#0a0700', '#1c1200', '#140d00', '#ffe2a8', 'rgba(255,226,168,0.6)', '#ffb000', '#ff5f1f', '#39ff7a')],
    fonts: [F('JetBrains Mono', 'JetBrains Mono', 'JetBrains Mono', 700), F('Space Mono', 'IBM Plex Mono', 'IBM Plex Mono', 700, { uppercase: true }),
      F('Major Mono Display', 'IBM Plex Mono', 'IBM Plex Mono', 400)],
    shading: ['glow', 'flat'],
    backgrounds: [{ style: 'solid' }, { style: 'grid', spacing: 48 }, { style: 'noise' }],
    textures: [{ style: 'crt', intensity: 0.5 }, { style: 'scanlines', intensity: 0.45 }],
    titleLayouts: ['classic', 'split'], lowerThirds: ['minimal', 'boxed'], captions: ['plain', 'box'], logoStyles: ['typeOn', 'glitch'],
    textIn: ['typewriter', 'scramble', 'glitchIn'], textOut: ['scrambleOut', 'blink', 'glitchOut'], loops: ['jitter', 'glow'],
    transitions: ['glitch', 'blinds', 'wipeDown'], wipes: [{ component: 'glitchTransition', props: {} }, { component: 'shapeWipe', props: { style: 'grid' } }],
    enter: ['hold', 'snap'], camera: ['flicker', 'none'], accents: ['terminal', 'codeTyping', 'flowDiagram'], particles: ['rain', null],
    music: [{ style: 'minimal', mood: 'mysterious' }, { style: 'dnb', mood: 'dark' }, { style: 'ambient', mood: 'tense' }],
    sfx: { move: ['glitch', 'zap'], appear: ['blip', 'tick2'], hit: ['subDrop', 'metalClang'], reveal: ['drone', 'riser'], ui: ['keyboardClack', 'blip', 'beep'] },
  },
  {
    key: 'auroraDream', name: 'Aurora dream', vibe: ['calm', 'ai', 'dark', 'wellness', 'dreamy', 'premium', 'product'],
    note: 'Slow drifting aurora gradients, soft glows, rounded geometric type, floaty eases, airy pads.',
    palettes: [P('#050816', '#0d1b3d', '#0e1430', '#f0f4ff', 'rgba(240,244,255,0.6)', '#7cf5d4', '#8b7bff', '#ff8fd8'),
      P('#0b0614', '#2a1145', '#170c26', '#fbf3ff', 'rgba(251,243,255,0.6)', '#ff9ecd', '#b892ff', '#7fdbff')],
    fonts: [F('Sora', 'Sora', 'JetBrains Mono', 600, { tracking: -1 }), F('Outfit', 'Manrope', 'JetBrains Mono', 500), F('Syne', 'Manrope', 'JetBrains Mono', 700)],
    shading: ['gradient', 'glow', 'soft'],
    backgrounds: [{ style: 'aurora' }, { style: 'mesh' }, { style: 'blobs' }],
    textures: [{ style: 'grain', intensity: 0.2 }, null],
    titleLayouts: ['classic', 'editorial'], lowerThirds: ['glass', 'pill'], captions: ['gradient', 'highlight'], logoStyles: ['blur', 'sweep'],
    textIn: ['blurIn', 'waveIn', 'fade', 'flipUp'], textOut: ['fade', 'blurOut'], loops: ['float', 'shimmer'],
    transitions: ['blur', 'fade', 'zoomOut', 'iris'], wipes: [{ component: 'shapeWipe', props: { style: 'liquid' } }, { component: 'flash', props: { color: '#ffffff', maxOpacity: 0.8 } }],
    enter: ['sineInOut', 'quartOut'], camera: ['float', 'breathe'], accents: ['gradientOrb', 'particles', 'spotlight'], particles: ['fireflies', 'bokeh'],
    music: [{ style: 'ambient', mood: 'dreamy' }, { style: 'lofi', mood: 'chill' }, { style: 'cinematic', mood: 'hopeful' }],
    sfx: { move: ['airPuff', 'whoosh'], appear: ['sparkle', 'bubble'], hit: ['glassTing', 'chime'], reveal: ['shimmer', 'magic'], ui: ['hover', 'tick'] },
  },
  {
    key: 'cinematicTeal', name: 'Cinematic teal & orange', vibe: ['cinematic', 'trailer', 'epic', 'dark', 'story', 'launch', 'film'],
    note: 'Trailer grammar: letterbox, teal shadows / orange highlights, wide-tracked caps, braams on cuts, slow push-ins.',
    palettes: [P('#04090b', '#0d2a30', '#0a1518', '#fff4e8', 'rgba(255,244,232,0.6)', '#ff8a3d', '#1fb5b0', '#ffd8a8'),
      P('#07070a', '#1d1a24', '#111016', '#f7f3ee', 'rgba(247,243,238,0.55)', '#e8b04f', '#5b7c99', '#f7f3ee')],
    fonts: [F('Bebas Neue', 'Inter', 'IBM Plex Mono', 400, { uppercase: true, tracking: 10 }), F('Syne', 'Inter', 'IBM Plex Mono', 800, { uppercase: true, tracking: 6 })],
    shading: ['gradient', 'shadow'],
    backgrounds: [{ style: 'radial' }, { style: 'noise' }, { style: 'glow' }],
    textures: [{ style: 'letterbox', intensity: 1 }, { style: 'filmBurn', intensity: 0.3 }, { style: 'grain', intensity: 0.45 }],
    titleLayouts: ['classic', 'huge'], lowerThirds: ['minimal', 'underline'], captions: ['plain', 'outline'], logoStyles: ['sweep', 'stroke'],
    textIn: ['tracking', 'blurIn', 'zoomBlur'], textOut: ['trackingOut', 'fade', 'zoomOut'], loops: ['none', 'shimmer'],
    transitions: ['fade', 'zoomBlur', 'blur'], wipes: [{ component: 'flash', props: { color: '#000000', peak: 0.5 } }, { component: 'flash', props: { color: '#ffffff', peak: 0.2 } }],
    enter: ['easeInOut', 'expoOut'], camera: ['handheld', 'breathe'], accents: ['particles', 'overlay', 'countdown'], particles: ['embers', 'dust'],
    music: [{ style: 'cinematic', mood: 'epic' }, { style: 'orchestral', mood: 'triumphant' }, { style: 'cinematic', mood: 'tense' }],
    sfx: { move: ['whoosh', 'downlifter'], appear: ['impact', 'taiko'], hit: ['braam', 'boom', 'taiko'], reveal: ['riser', 'reverseSwell'], ui: ['click', 'heartbeat'] },
  },
  {
    key: 'carbon', name: 'Carbon enterprise', vibe: ['corporate', 'enterprise', 'tech', 'dark', 'data', 'b2b', 'ibm'],
    note: 'IBM Carbon feel: gray-100 stage, Plex type, blue-60 accent, square corners, 8px grid, productive motion.',
    palettes: [P('#161616', '#262626', '#262626', '#f4f4f4', 'rgba(244,244,244,0.62)', '#4589ff', '#a56eff', '#08bdba'),
      P('#f4f4f4', '#e0e0e0', '#ffffff', '#161616', 'rgba(22,22,22,0.62)', '#0f62fe', '#8a3ffc', '#007d79')],
    fonts: [F('IBM Plex Sans', 'IBM Plex Sans', 'IBM Plex Mono', 600, { tracking: -1 }), F('IBM Plex Sans', 'IBM Plex Sans', 'IBM Plex Mono', 300)],
    shading: ['flat'],
    backgrounds: [{ style: 'solid' }, { style: 'grid', spacing: 64 }],
    textures: [null],
    titleLayouts: ['classic', 'split'], lowerThirds: ['bar', 'minimal'], captions: ['box', 'plain'], logoStyles: ['split', 'typeOn'],
    textIn: ['maskUp', 'slideRight', 'fade'], textOut: ['fade', 'maskDown'], loops: ['none'],
    transitions: ['wipeLeft', 'fade', 'slideUp'], wipes: [{ component: 'shapeWipe', props: { style: 'slats' } }, { component: 'blockReveal', props: {} }],
    enter: ['quartOut', 'easeOut'], camera: ['none'], accents: ['lineChart', 'donutChart', 'flowDiagram', 'comparison'], particles: [null],
    music: [{ style: 'corporate', mood: 'tech' }, { style: 'minimal', mood: 'hopeful' }],
    sfx: { move: ['swish', 'sweepUp'], appear: ['tick2', 'blip'], hit: ['thud', 'punch'], reveal: ['sweepUp', 'chime'], ui: ['click', 'toggle'] },
  },
  {
    key: 'organicForest', name: 'Organic', vibe: ['nature', 'wellness', 'calm', 'food', 'sustainability', 'light', 'warm'],
    note: 'Sage, clay and cream, soft serif + humanist sans, gentle floaty motion, paper grain, acoustic music.',
    palettes: [P('#f3efe4', '#e2dccb', '#fbf8f0', '#23302a', 'rgba(35,48,42,0.62)', '#5f8a5a', '#c56b3e', '#d9a441'),
      P('#18211b', '#24352a', '#1e2b22', '#f1ede2', 'rgba(241,237,226,0.6)', '#a3c585', '#e0a36a', '#f1ede2')],
    fonts: [F('Fraunces', 'Manrope', 'IBM Plex Mono', 600), F('DM Serif Display', 'Outfit', 'Space Mono', 400), F('Caveat', 'Manrope', 'Space Mono', 700)],
    shading: ['soft', 'flat'],
    backgrounds: [{ style: 'paper' }, { style: 'topo' }, { style: 'waves' }],
    textures: [{ style: 'grain', intensity: 0.3 }, null],
    titleLayouts: ['editorial', 'classic'], lowerThirds: ['pill', 'underline'], captions: ['underline', 'highlight'], logoStyles: ['typeOn', 'blur'],
    textIn: ['fade', 'waveIn', 'rise', 'blurIn'], textOut: ['fade', 'sink'], loops: ['float', 'none'],
    transitions: ['fade', 'iris', 'wipeUp'], wipes: [{ component: 'shapeWipe', props: { style: 'liquid' } }, { component: 'shapeWipe', props: { style: 'circle' } }],
    enter: ['sineInOut', 'easeOut'], camera: ['sway', 'breathe'], accents: ['scribble', 'highlighter', 'particles'], particles: [null, 'dust'],
    music: [{ style: 'indie', mood: 'warm' }, { style: 'piano', mood: 'hopeful' }, { style: 'lofi', mood: 'warm' }],
    sfx: { move: ['airPuff', 'swish'], appear: ['bubble', 'snap'], hit: ['thud', 'harp'], reveal: ['harp', 'chime'], ui: ['tick', 'click'] },
  },
  {
    key: 'sunsetGradient', name: 'Sunset gradient', vibe: ['consumer', 'social', 'travel', 'music', 'warm', 'bold', 'lifestyle'],
    note: 'Hot coral→violet duotone gradients, big rounded type, sliding gradient fills, upbeat house groove.',
    palettes: [P('#1b0a2a', '#ff5e62', '#2a1240', '#fff6f0', 'rgba(255,246,240,0.72)', '#ff9966', '#ff5e9c', '#ffe066'),
      P('#0d1b3a', '#ff7e5f', '#162a52', '#fffaf2', 'rgba(255,250,242,0.72)', '#feb47b', '#ff7e5f', '#7ee8fa')],
    fonts: [F('Unbounded', 'Outfit', 'Space Mono', 800), F('Syne', 'Outfit', 'Space Mono', 800, { uppercase: true })],
    shading: ['duotone', 'gradient'],
    backgrounds: [{ style: 'linear', angle: 135 }, { style: 'conic' }, { style: 'mesh' }],
    textures: [{ style: 'grain', intensity: 0.25 }, { style: 'lightLeak', intensity: 0.35 }],
    titleLayouts: ['huge', 'stacked', 'boxed'], lowerThirds: ['pill', 'glass'], captions: ['gradient', 'bounce', 'pop'], logoStyles: ['stack', 'sweep'],
    textIn: ['charsUp', 'wordsPop', 'splitIn', 'flipUp'], textOut: ['charsDown', 'pop'], loops: ['wave', 'float'],
    transitions: ['slideLeft', 'zoomIn', 'swing', 'diagonal'], wipes: [{ component: 'shapeWipe', props: { style: 'diamond' } }, { component: 'stripeWipe', props: {} }],
    enter: ['backOut', 'spring'], camera: ['float', 'pulse'], accents: ['kineticType', 'wordCycle', 'socialPost'], particles: ['bokeh', null],
    music: [{ style: 'house', mood: 'bright' }, { style: 'garage', mood: 'playful' }, { style: 'funk', mood: 'warm' }],
    sfx: { move: ['whoosh', 'swipe'], appear: ['pop', 'clap'], hit: ['clap', 'impact'], reveal: ['riser', 'success'], ui: ['swipe', 'sendMessage'] },
  },
  {
    key: 'blueprint', name: 'Blueprint', vibe: ['engineering', 'tech', 'education', 'architecture', 'explainer', 'hardware'],
    note: 'Cyanotype blue with white line-work, mono labels, things draw on like technical drawings.',
    palettes: [P('#0b3a6e', '#0e4a8a', '#0d4380', '#eaf4ff', 'rgba(234,244,255,0.65)', '#ffffff', '#8fd3ff', '#ffd166'),
      P('#10213a', '#173156', '#142a4a', '#e8f1ff', 'rgba(232,241,255,0.6)', '#7fd1ff', '#ffffff', '#ff9f5a')],
    fonts: [F('Space Grotesk', 'Space Grotesk', 'Space Mono', 700), F('IBM Plex Mono', 'IBM Plex Mono', 'IBM Plex Mono', 600, { uppercase: true, tracking: 2 })],
    shading: ['outline', 'flat'],
    backgrounds: [{ style: 'grid', spacing: 60 }, { style: 'dots', spacing: 40 }],
    textures: [{ style: 'grain', intensity: 0.2 }, { style: 'halftone', intensity: 0.15 }],
    titleLayouts: ['outline', 'split', 'classic'], lowerThirds: ['underline', 'boxed'], captions: ['underline', 'box'], logoStyles: ['stroke', 'typeOn'],
    textIn: ['typewriter', 'maskUp', 'tracking'], textOut: ['maskDown', 'fade'], loops: ['none'],
    transitions: ['wipeRight', 'blinds', 'iris'], wipes: [{ component: 'shapeWipe', props: { style: 'grid' } }, { component: 'shapeWipe', props: { style: 'clock' } }],
    enter: ['quartOut', 'easeInOut'], camera: ['none', 'breathe'], accents: ['flowDiagram', 'scribble', 'callout', 'timelineSteps'], particles: [null],
    music: [{ style: 'minimal', mood: 'tech' }, { style: 'ambient', mood: 'mysterious' }, { style: 'corporate', mood: 'tech' }],
    sfx: { move: ['swish', 'sweepUp'], appear: ['tick2', 'blip'], hit: ['thud', 'metalClang'], reveal: ['sweepUp', 'chime'], ui: ['click', 'tick'] },
  },
  {
    key: 'vaporwave', name: 'Vaporwave', vibe: ['retro', 'playful', 'music', 'meme', 'internet', 'nostalgia', 'y2k'],
    note: '90s internet: pink/teal, chrome-ish gradients, VHS tracking, starfields, italic serif mixed with mono.',
    palettes: [P('#1a0b2e', '#ff71ce', '#2b1350', '#fff2ff', 'rgba(255,242,255,0.7)', '#01cdfe', '#ff71ce', '#fffb96'),
      P('#120458', '#7a04eb', '#1d0a6b', '#fef9ff', 'rgba(254,249,255,0.65)', '#ff2a6d', '#05d9e8', '#d1f7ff')],
    fonts: [F('DM Serif Display', 'Space Mono', 'Space Mono', 400, { italic: true }), F('Major Mono Display', 'Space Mono', 'Space Mono', 400)],
    shading: ['gradient', 'neon', 'shadow'],
    backgrounds: [{ style: 'perspectiveGrid' }, { style: 'linear', angle: 180 }, { style: 'starfield' }],
    textures: [{ style: 'vhs', intensity: 0.55 }, { style: 'chromatic', intensity: 0.4 }],
    titleLayouts: ['outline', 'stacked'], lowerThirds: ['boxed', 'glass'], captions: ['neon', 'gradient'], logoStyles: ['glitch', 'split'],
    textIn: ['glitchIn', 'waveIn', 'flipUp'], textOut: ['glitchOut', 'scrambleOut'], loops: ['wave', 'shimmer'],
    transitions: ['glitch', 'flipY', 'spin'], wipes: [{ component: 'glitchTransition', props: {} }, { component: 'shapeWipe', props: { style: 'zoomRings' } }],
    enter: ['backOut', 'easeOut'], camera: ['sway', 'float'], accents: ['marquee', 'particles', 'kineticType'], particles: ['stars', 'sparks'],
    music: [{ style: 'lofi', mood: 'dreamy' }, { style: 'synthwave', mood: 'melancholy' }, { style: 'funk', mood: 'dreamy' }],
    sfx: { move: ['tapeStop', 'warp'], appear: ['bloop', 'coin'], hit: ['vinylScratch', 'clap'], reveal: ['reverseSwell', 'magic'], ui: ['blip', 'receiveMessage'] },
  },
  {
    key: 'cozyLofi', name: 'Cozy lo-fi', vibe: ['chill', 'study', 'creator', 'warm', 'personal', 'vlog', 'calm'],
    note: 'Warm dusk tones, handwritten accents, film grain and light leaks, swung lo-fi beat, nothing rushes.',
    palettes: [P('#1f1a24', '#3b2c3f', '#2a2230', '#fbeee0', 'rgba(251,238,224,0.65)', '#f6a76b', '#c88ea7', '#9bc4a8'),
      P('#f6eadb', '#ead7c2', '#fffaf3', '#3a2b25', 'rgba(58,43,37,0.62)', '#d9774b', '#7a9e7e', '#c9a227')],
    fonts: [F('Caveat', 'Manrope', 'Space Mono', 700), F('Fraunces', 'Outfit', 'Space Mono', 600, { italic: true })],
    shading: ['soft', 'flat'],
    backgrounds: [{ style: 'radial' }, { style: 'bokeh' }, { style: 'paper' }],
    textures: [{ style: 'grain', intensity: 0.45 }, { style: 'lightLeak', intensity: 0.4 }, { style: 'filmBurn', intensity: 0.2 }],
    titleLayouts: ['editorial', 'classic'], lowerThirds: ['pill', 'minimal'], captions: ['plain', 'underline'], logoStyles: ['typeOn', 'blur'],
    textIn: ['typewriter', 'fade', 'waveIn'], textOut: ['fade', 'sink'], loops: ['float'],
    transitions: ['fade', 'blur', 'iris'], wipes: [{ component: 'flash', props: { color: '#f6a76b', maxOpacity: 0.6, peak: 0.5 } }, { component: 'shapeWipe', props: { style: 'liquid' } }],
    enter: ['sineInOut'], camera: ['handheld', 'breathe'], accents: ['scribble', 'highlighter', 'chatBubbles'], particles: ['dust', 'fireflies'],
    music: [{ style: 'lofi', mood: 'chill' }, { style: 'lofi', mood: 'warm' }, { style: 'piano', mood: 'dreamy' }],
    sfx: { move: ['airPuff', 'swish'], appear: ['bubble', 'snap'], hit: ['thud', 'vinylScratch'], reveal: ['harp', 'chime'], ui: ['click', 'mouseScroll'] },
  },
  {
    key: 'sportsEnergy', name: 'Sports energy', vibe: ['sports', 'fitness', 'energetic', 'bold', 'launch', 'aggressive', 'hype'],
    note: 'Slanted condensed type, speed lines, diagonal wipes, shake on hits, big stats, hard-hitting drums.',
    palettes: [P('#0a0d12', '#1c2430', '#121821', '#ffffff', 'rgba(255,255,255,0.65)', '#ff4d00', '#00e676', '#ffffff'),
      P('#0b0b18', '#1f1a4d', '#16133a', '#ffffff', 'rgba(255,255,255,0.65)', '#ffe600', '#ff1f6b', '#00d4ff')],
    fonts: [F('Anton', 'Outfit', 'Space Mono', 400, { uppercase: true, italic: true, tracking: 1 }), F('Archivo Black', 'Outfit', 'Space Mono', 400, { uppercase: true, italic: true })],
    shading: ['flat', 'shadow', 'outline'],
    backgrounds: [{ style: 'stripes' }, { style: 'radial' }, { style: 'noise' }],
    textures: [{ style: 'grain', intensity: 0.35 }, { style: 'halftone', intensity: 0.25 }],
    titleLayouts: ['huge', 'stacked', 'outline'], lowerThirds: ['stacked', 'boxed'], captions: ['stack', 'box', 'pop'], logoStyles: ['split', 'stack'],
    textIn: ['stamp', 'skewIn', 'slideRight', 'zoomBlur'], textOut: ['zoomOut', 'slideLeft'], loops: ['jitter', 'pulse'],
    transitions: ['whipLeft', 'diagonal', 'stretch', 'zoomBlur'], wipes: [{ component: 'stripeWipe', props: { stripes: 4, angle: 30 } }, { component: 'shapeWipe', props: { style: 'slats' } }],
    enter: ['snap', 'expoOut'], camera: ['shake', 'pulse'], accents: ['counter', 'kineticType', 'burst', 'countdown'], particles: ['sparks', null],
    music: [{ style: 'trap', mood: 'triumphant' }, { style: 'dnb', mood: 'epic' }, { style: 'house', mood: 'aggressive' }],
    sfx: { move: ['whooshHit', 'whoosh'], appear: ['punch', 'clap'], hit: ['slam', 'impact', 'taiko'], reveal: ['riser', 'braam'], ui: ['clap', 'snap'] },
  },
  {
    key: 'healthClean', name: 'Clinical clean', vibe: ['health', 'medical', 'fintech', 'light', 'trust', 'calm', 'saas'],
    note: 'Airy white with mint/teal, soft shadows and glass cards, friendly geometric sans, gentle confident motion.',
    palettes: [P('#f7fbfc', '#e4f3f2', '#ffffff', '#0f2a33', 'rgba(15,42,51,0.6)', '#14b8a6', '#3b82f6', '#f59e0b'),
      P('#fbfaff', '#ece9ff', '#ffffff', '#1b1740', 'rgba(27,23,64,0.6)', '#6d5dfc', '#22c55e', '#f43f5e')],
    fonts: [F('Manrope', 'Manrope', 'JetBrains Mono', 800, { tracking: -1 }), F('Sora', 'Inter', 'JetBrains Mono', 700), F('Outfit', 'Inter', 'JetBrains Mono', 700)],
    shading: ['soft', 'shadow'],
    backgrounds: [{ style: 'radial' }, { style: 'mesh' }, { style: 'dots', spacing: 56 }],
    textures: [null],
    titleLayouts: ['classic', 'boxed'], lowerThirds: ['glass', 'pill'], captions: ['highlight', 'box'], logoStyles: ['blur', 'sweep'],
    textIn: ['rise', 'wordsUp', 'blurIn', 'maskUp'], textOut: ['fade', 'lift'], loops: ['none', 'float'],
    transitions: ['fade', 'slideUp', 'zoomIn'], wipes: [{ component: 'shapeWipe', props: { style: 'circle' } }, { component: 'flash', props: { color: '#ffffff', maxOpacity: 0.9 } }],
    enter: ['quartOut', 'backOut'], camera: ['none', 'float'], accents: ['notificationToast', 'donutChart', 'button', 'checklist'], particles: [null],
    music: [{ style: 'corporate', mood: 'hopeful' }, { style: 'ambient', mood: 'bright' }, { style: 'indie', mood: 'hopeful' }],
    sfx: { move: ['swish', 'airPuff'], appear: ['pop', 'bubble'], hit: ['chime', 'thud'], reveal: ['success', 'chime'], ui: ['toggle', 'click', 'success'] },
  },
  {
    key: 'risograph', name: 'Risograph', vibe: ['creative', 'indie', 'art', 'light', 'playful', 'zine', 'education'],
    note: 'Two-ink print: fluorescent pink + blue on off-white, halftone shading, misregistered offsets, chunky type.',
    palettes: [P('#f6f1e7', '#ece4d4', '#fbf8f1', '#1d2a6b', 'rgba(29,42,107,0.65)', '#ff48b0', '#0078bf', '#ffe800'),
      P('#f4f0e8', '#e6dfd2', '#fbf8f1', '#2b2b2b', 'rgba(43,43,43,0.62)', '#ff6c2f', '#00a95c', '#765ba7')],
    fonts: [F('Archivo Black', 'Space Grotesk', 'Space Mono', 400, { tracking: -1 }), F('Syne', 'Space Grotesk', 'Space Mono', 800), F('Caveat', 'Space Grotesk', 'Space Mono', 700)],
    shading: ['shadow', 'flat', 'duotone'],
    backgrounds: [{ style: 'paper' }, { style: 'halftone' }],
    textures: [{ style: 'halftone', intensity: 0.35 }, { style: 'grain', intensity: 0.4 }],
    titleLayouts: ['stacked', 'boxed', 'huge'], lowerThirds: ['boxed', 'stacked'], captions: ['box', 'bounce'], logoStyles: ['split', 'stack'],
    textIn: ['stamp', 'charsPop', 'splitIn', 'skewIn'], textOut: ['pop', 'charsDown'], loops: ['jitter', 'wave'],
    transitions: ['swing', 'drop', 'blinds', 'split'], wipes: [{ component: 'shapeWipe', props: { style: 'diamond' } }, { component: 'shapeWipe', props: { style: 'blinds' } }],
    enter: ['backOut', 'anticipate'], camera: ['wiggle', 'bob'], accents: ['scribble', 'highlighter', 'burst'], particles: [null, 'confetti'],
    music: [{ style: 'indie', mood: 'playful' }, { style: 'funk', mood: 'playful' }, { style: 'chiptune', mood: 'bright' }],
    sfx: { move: ['swish', 'airPuff'], appear: ['snap', 'bloop', 'pop'], hit: ['clap', 'punch'], reveal: ['success', 'magic'], ui: ['click', 'snap'] },
  },
  {
    key: 'filmNoir', name: 'Monochrome', vibe: ['documentary', 'story', 'serious', 'dark', 'editorial', 'film', 'history'],
    note: 'Black & white only, grayscale footage, typewriter serif-mono, heavy grain and vignette, piano and drones.',
    palettes: [P('#0a0a0a', '#1c1c1c', '#151515', '#f2f2f2', 'rgba(242,242,242,0.58)', '#ffffff', '#9a9a9a', '#d0d0d0'),
      P('#efede8', '#d9d6cf', '#f8f7f3', '#111111', 'rgba(17,17,17,0.58)', '#111111', '#6b6b6b', '#8a1c1c')],
    fonts: [F('Playfair Display', 'IBM Plex Mono', 'IBM Plex Mono', 900, { tracking: -1 }), F('Space Mono', 'Space Mono', 'Space Mono', 700, { uppercase: true, tracking: 3 }),
      F('Instrument Serif', 'IBM Plex Sans', 'IBM Plex Mono', 400)],
    shading: ['flat', 'shadow'],
    backgrounds: [{ style: 'noise' }, { style: 'radial' }, { style: 'solid' }],
    textures: [{ style: 'grain', intensity: 0.6 }, { style: 'filmBurn', intensity: 0.25 }],
    titleLayouts: ['editorial', 'classic', 'huge'], lowerThirds: ['minimal', 'underline'], captions: ['plain', 'underline'], logoStyles: ['typeOn', 'blur'],
    textIn: ['typewriter', 'fade', 'tracking'], textOut: ['fade', 'blink'], loops: ['none', 'jitter'],
    transitions: ['fade', 'blur', 'iris'], wipes: [{ component: 'flash', props: { color: '#000000', peak: 0.5 } }, { component: 'shapeWipe', props: { style: 'clock' } }],
    enter: ['easeInOut', 'sineInOut'], camera: ['handheld', 'flicker'], accents: ['quote', 'splitFlap', 'spotlight'], particles: ['dust', null],
    music: [{ style: 'piano', mood: 'melancholy' }, { style: 'ambient', mood: 'tense' }, { style: 'cinematic', mood: 'dark' }],
    sfx: { move: ['airPuff', 'downlifter'], appear: ['tick', 'camera'], hit: ['thud', 'gong'], reveal: ['drone', 'reverseSwell'], ui: ['keyboardClack', 'tick'] },
  },
  {
    key: 'chromeY2K', name: 'Chrome Y2K', vibe: ['fashion', 'music', 'bold', 'retro', 'y2k', 'gen-z', 'launch'],
    note: 'Silver chrome gradients on deep black, liquid blobs, wide geometric type, sparkles, glossy highlights.',
    palettes: [P('#050505', '#2a2a30', '#141418', '#f4f4f8', 'rgba(244,244,248,0.6)', '#d9d9e3', '#8af3ff', '#ff8ae2'),
      P('#0a0a12', '#1a1036', '#120c24', '#f8f7ff', 'rgba(248,247,255,0.62)', '#c0c6ff', '#b8ff6b', '#ff6bd6')],
    fonts: [F('Unbounded', 'Sora', 'Space Mono', 900, { tracking: 1 }), F('Syne', 'Sora', 'Space Mono', 800, { uppercase: true, tracking: 3 })],
    shading: ['gradient', 'glow'],
    backgrounds: [{ style: 'blobs' }, { style: 'conic' }, { style: 'starfield' }],
    textures: [{ style: 'chromatic', intensity: 0.3 }, { style: 'grain', intensity: 0.2 }],
    titleLayouts: ['huge', 'stacked'], lowerThirds: ['glass', 'pill'], captions: ['gradient', 'pop'], logoStyles: ['sweep', 'stroke'],
    textIn: ['zoomBlur', 'elastic', 'flipUp', 'charsPop'], textOut: ['zoomOut', 'blurOut'], loops: ['shimmer', 'float'],
    transitions: ['zoomBlur', 'flipX', 'spin', 'iris'], wipes: [{ component: 'shapeWipe', props: { style: 'zoomRings' } }, { component: 'flash', props: { color: '#ffffff', peak: 0.25 } }],
    enter: ['spring', 'backOut'], camera: ['float', 'orbit'], accents: ['burst', 'gradientOrb', 'particles'], particles: ['sparks', 'stars'],
    music: [{ style: 'garage', mood: 'bright' }, { style: 'house', mood: 'dreamy' }, { style: 'trap', mood: 'mysterious' }],
    sfx: { move: ['warp', 'whoosh'], appear: ['sparkle', 'glassTing'], hit: ['impact', 'subDrop'], reveal: ['magic', 'shimmer'], ui: ['hover', 'blip'] },
  },
  {
    key: 'boldCorporate', name: 'Upbeat product', vibe: ['saas', 'startup', 'product', 'friendly', 'launch', 'light', 'explainer'],
    note: 'Bright, optimistic product launch: light canvas, saturated brand accent, UI mockups, springy pops, claps.',
    palettes: [P('#ffffff', '#f1f4ff', '#ffffff', '#0b1533', 'rgba(11,21,51,0.6)', '#3b5bfd', '#ff6a3d', '#14c38e'),
      P('#fffdf7', '#fff1d6', '#ffffff', '#1d1300', 'rgba(29,19,0,0.6)', '#ff7a00', '#7a3cff', '#00b3a4')],
    fonts: [F('Outfit', 'Inter', 'JetBrains Mono', 800, { tracking: -2 }), F('Manrope', 'Manrope', 'JetBrains Mono', 800, { tracking: -2 }), F('Space Grotesk', 'Inter', 'JetBrains Mono', 700)],
    shading: ['soft', 'shadow', 'flat'],
    backgrounds: [{ style: 'dots', spacing: 48 }, { style: 'mesh' }, { style: 'solid' }],
    textures: [null],
    titleLayouts: ['classic', 'boxed', 'split'], lowerThirds: ['pill', 'glass'], captions: ['highlight', 'box', 'bounce'], logoStyles: ['stack', 'blur'],
    textIn: ['wordsPop', 'rise', 'charsUp', 'flipUp'], textOut: ['fade', 'pop'], loops: ['none', 'float'],
    transitions: ['slideLeft', 'zoomIn', 'iris', 'slideUp'], wipes: [{ component: 'shapeWipe', props: { style: 'circle' } }, { component: 'stripeWipe', props: {} }],
    enter: ['backOut', 'spring'], camera: ['none', 'float'], accents: ['button', 'notificationToast', 'searchBar', 'cursor', 'checklist'], particles: ['confetti', null],
    music: [{ style: 'corporate', mood: 'bright' }, { style: 'house', mood: 'hopeful' }, { style: 'funk', mood: 'bright' }],
    sfx: { move: ['swish', 'swipe'], appear: ['pop', 'bubble', 'blip'], hit: ['clap', 'punch'], reveal: ['success', 'riser'], ui: ['click', 'toggle', 'success'] },
  },
  {
    key: 'darkMatter', name: 'Dark matter', vibe: ['ai', 'science', 'space', 'dark', 'epic', 'mysterious', 'deep tech'],
    note: 'Near-black void, cold starfields, thin wide-tracked type, slow orbits, sub-bass drones and gongs.',
    palettes: [P('#020205', '#0a0d24', '#0a0a14', '#e8ecff', 'rgba(232,236,255,0.55)', '#a0b4ff', '#ff7ad9', '#7affd6'),
      P('#030303', '#1a0d00', '#0f0a05', '#fff3e6', 'rgba(255,243,230,0.55)', '#ffb35c', '#ff5c5c', '#ffe1b3')],
    fonts: [F('Syne', 'Manrope', 'JetBrains Mono', 500, { uppercase: true, tracking: 10 }), F('Unbounded', 'Manrope', 'JetBrains Mono', 300, { uppercase: true, tracking: 6 }),
      F('Sora', 'Sora', 'JetBrains Mono', 300, { tracking: 4 })],
    shading: ['glow', 'gradient'],
    backgrounds: [{ style: 'starfield' }, { style: 'aurora' }, { style: 'radial' }],
    textures: [{ style: 'grain', intensity: 0.3 }, { style: 'chromatic', intensity: 0.2 }],
    titleLayouts: ['classic', 'editorial'], lowerThirds: ['minimal', 'glass'], captions: ['plain', 'gradient'], logoStyles: ['blur', 'stroke'],
    textIn: ['tracking', 'blurIn', 'scramble'], textOut: ['trackingOut', 'blurOut'], loops: ['glow', 'shimmer'],
    transitions: ['blur', 'iris', 'zoomOut'], wipes: [{ component: 'shapeWipe', props: { style: 'zoomRings' } }, { component: 'flash', props: { color: '#ffffff', peak: 0.15, maxOpacity: 0.85 } }],
    enter: ['sineInOut', 'expoOut'], camera: ['orbit', 'breathe'], accents: ['particles', 'gradientOrb', 'burst'], particles: ['stars', 'dust'],
    music: [{ style: 'ambient', mood: 'mysterious' }, { style: 'cinematic', mood: 'epic' }, { style: 'synthwave', mood: 'dreamy' }],
    sfx: { move: ['warp', 'downlifter'], appear: ['sparkle', 'glassTing'], hit: ['subDrop', 'gong', 'braam'], reveal: ['drone', 'reverseSwell'], ui: ['blip', 'hover'] },
  },
];

export interface Direction {
  look: string;
  name: string;
  note: string;
  seed: number;
  palette: Palette;
  fonts: FontPair;
  shading: Shading;
  texture: { style: string; intensity: number } | null;
  motion: { textIn: string[]; textOut: string; loop: string; enter: string; transitions: string[]; camera: string; wipe: { component: string; props: Record<string, unknown> } };
  layouts: { title: string; lowerThird: string; captions: string; logo: string };
  accents: string[];
  particles: string | null;
  music: { style: string; mood: string; bpmNudge: number; variation: number };
  sfx: Look['sfx'];
  /** ready-to-use props for the common clips — merge into addClip props */
  recipes: Record<string, { component: string; props: Record<string, unknown> }>;
  rules: string[];
}

export interface RollOptions { vibe?: string; avoid?: string[]; seed?: number; look?: string }

/** Score looks against a free-text brief, drop recently used ones, pick one, then pick one option per slot. */
export function rollLook(o: RollOptions = {}): Direction {
  const seed = o.seed ?? Math.floor(Math.random() * 1e9);
  // hash first: rng's opening values barely differ between neighbouring seeds
  const r = rng(hash(`look:${seed}`));
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length) % a.length];
  const shuffle = <T>(a: T[]) => a.map((v) => [r(), v] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const words = (o.vibe || '').toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
  const avoid = new Set(o.avoid || []);
  let look = o.look ? LOOKS.find((l) => l.key === o.look) : undefined;
  if (!look) {
    const scored = LOOKS.filter((l) => !avoid.has(l.key)).map((l) => {
      const hay = [l.key, l.name, l.note, ...l.vibe].join(' ').toLowerCase();
      return { l, s: words.reduce((a, w) => a + (l.vibe.some((v) => v === w || (w.length > 3 && v.startsWith(w.slice(0, -1)))) ? 3 : hay.includes(w) ? 1 : 0), 0) };
    }).sort((a, b) => b.s - a.s);
    // pick among the looks that match about as well as the best, so the same brief still lands on different looks
    const best = scored[0]?.s ?? 0;
    look = pick(best > 0 ? scored.filter((x) => x.s >= best * 0.6) : scored).l;
  }
  const L = look ?? LOOKS[0];
  const palette = pick(L.palettes), fonts = pick(L.fonts), shading = pick(L.shading), texture = pick(L.textures);
  const textIn = shuffle(L.textIn).slice(0, Math.min(3, L.textIn.length));
  const motion = { textIn, textOut: pick(L.textOut), loop: pick(L.loops), enter: pick(L.enter), transitions: shuffle(L.transitions).slice(0, 2), camera: pick(L.camera), wipe: pick(L.wipes) };
  const layouts = { title: pick(L.titleLayouts), lowerThird: pick(L.lowerThirds), captions: pick(L.captions), logo: pick(L.logoStyles) };
  const music = { ...pick(L.music), bpmNudge: Math.round((r() - 0.5) * 12), variation: Math.floor(r() * 1000) };
  const bg = { ...pick(L.backgrounds) };
  const particles = pick(L.particles);
  const light = luminance(palette.bg) > 0.5;

  const shade = shadeText(shading, palette);
  const typo = { font: fonts.display, uppercase: !!fonts.uppercase, letterSpacing: fonts.tracking ?? 0, italic: !!fonts.italic };
  const recipes: Direction['recipes'] = {
    background: { component: 'background', props: { color1: palette.bg, color2: palette.bg2, color3: palette.accent2, speed: 0.6 + r() * 0.8, ...bg } },
    title: { component: 'title', props: { ...typo, layout: layouts.title, weight: fonts.weight, color: palette.text, subColor: palette.muted, accent: palette.accent, animIn: textIn[0], animOut: motion.textOut, loop: motion.loop, ...pickKeys(shade, ['shadow', 'shadowColor']) } },
    headline: { component: 'text', props: { ...typo, weight: fonts.weight, color: palette.text, animIn: textIn[1] ?? textIn[0], animOut: motion.textOut, loop: motion.loop, ...shade } },
    body: { component: 'text', props: { font: fonts.body, weight: 500, size: 52, color: palette.muted, animIn: textIn[2] ?? 'fade', animOut: 'fade' } },
    lowerThird: { component: 'lowerThird', props: { font: fonts.body, variant: layouts.lowerThird, color: palette.text, subColor: palette.muted, bg: light ? 'rgba(255,255,255,0.88)' : 'rgba(10,12,20,0.78)', accent: palette.accent } },
    captions: { component: 'captions', props: { font: fonts.display === fonts.body ? fonts.display : fonts.body, style: layouts.captions, color: palette.text, highlight: palette.accent, stroke: light ? 'rgba(255,255,255,0.9)' : '#000000', uppercase: !!fonts.uppercase } },
    logo: { component: 'logoReveal', props: { font: fonts.display, weight: fonts.weight, style: layouts.logo, color: palette.text, glow: palette.accent } },
    code: { component: 'codeTyping', props: { font: fonts.mono, theme: light ? 'light' : pick(['dark', 'dracula', 'ibm']) } },
    wipe: { component: motion.wipe.component, props: { ...(motion.wipe.component === 'flash' ? { color: palette.accent } : motion.wipe.component === 'blockReveal' ? {} : { color1: palette.accent, color2: palette.accent2, color3: palette.accent3 }), ...motion.wipe.props } },
    ...(texture ? { texture: { component: 'overlay', props: { style: texture.style, intensity: texture.intensity } } } : {}),
    ...(particles ? { particles: { component: particles === 'confetti' ? 'confetti' : 'particles', props: particles === 'confetti' ? { color1: palette.accent, color2: palette.accent2, color3: palette.accent3, color4: palette.text } : { kind: particles, color1: palette.accent, color2: palette.accent3 } } } : {}),
    music: { component: 'music', props: { style: music.style, mood: music.mood, variation: music.variation, volume: 0.7, fadeIn: 1, fadeOut: 2.5, duckUnder: true } },
  };
  return {
    look: L.key, name: L.name, note: L.note, seed, palette, fonts, shading, texture, motion, layouts,
    accents: shuffle(L.accents), particles, music, sfx: L.sfx, recipes,
    rules: [
      `Stage ${palette.bg} → ${palette.bg2}; text ${palette.text}; accent ${palette.accent} (secondary ${palette.accent2}, rare third ${palette.accent3}). No other colors except media.`,
      `Display font ${fonts.display}${fonts.uppercase ? ' (caps)' : ''} ${fonts.weight}; body ${fonts.body}; code ${fonts.mono}. Never mix in other fonts.`,
      `Shading: ${shading}. Texture: ${texture ? `${texture.style} @ ${texture.intensity} on a top track for the whole video` : 'none (clean)'}.`,
      `Text enters with ${textIn.join(' / ')} (rotate them, don't repeat the same one back-to-back), exits ${motion.textOut}, easing ${motion.enter}.`,
      `Clip transitions: ${motion.transitions.join(', ')}; section wipe: ${motion.wipe.component}${motion.wipe.props.style ? ` (${motion.wipe.props.style})` : ''}. Footage camera motion: ${motion.camera}.`,
      `Music: ${music.style} / ${music.mood}, variation ${music.variation}${music.bpmNudge ? `, nudge bpm ${music.bpmNudge > 0 ? '+' : ''}${music.bpmNudge} off the style default` : ''}; set drop = the main reveal time.`,
      `SFX kit — moves: ${L.sfx.move.join('/')}, appear: ${L.sfx.appear.join('/')}, hits: ${L.sfx.hit.join('/')}, reveals: ${L.sfx.reveal.join('/')}, UI: ${L.sfx.ui.join('/')}.`,
      `Signature accents to feature: ${shuffle(L.accents).slice(0, 3).join(', ')}.`,
    ],
  };
}

function pickKeys(o: Record<string, unknown>, keys: string[]) { return Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k))); }

/** text-component props that realise a shading style */
function shadeText(s: Shading, p: Palette): Record<string, unknown> {
  switch (s) {
    case 'gradient': return { gradientTo: p.accent };
    case 'duotone': return { color: p.accent, gradientTo: p.accent2 };
    case 'glow': return { shadow: 40, shadowColor: p.accent };
    case 'neon': return { shadow: 60, shadowColor: p.accent, stroke: p.accent, strokeWidth: 2 };
    case 'soft': return { shadow: 30, shadowColor: 'rgba(0,0,0,0.18)' };
    case 'shadow': return { shadow: 6, shadowColor: p.accent2 };
    case 'outline': return { color: 'rgba(0,0,0,0)', stroke: p.text, strokeWidth: 2 };
    default: return {};
  }
}

function luminance(c: string) {
  const m = c.replace('#', '');
  if (m.length < 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

