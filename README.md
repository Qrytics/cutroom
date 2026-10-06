# Cutroom

A collaborative video editor that Claude edits **live**.

Ask Claude for a video from any project ("make me a 30-second launch video for this"). The editor opens in your
browser and you, plus anyone you share the link with, watch every cut, title, animation and sound effect land on a
real multi-track timeline. When Claude finishes, everything it made is an ordinary clip: click it, drag it, trim it,
retype it, re-color it, re-keyframe it, or undo Claude's whole run in one click.

Everything visual is drawn in code and every sound is synthesized: there are no stock assets, no templates, and no
network calls at render time. Each video gets its own **art direction** (palette, fonts, shading, texture, motion,
music genre, sound kit), so two videos don't come out looking like copy-paste.

- [Quick start](#quick-start)
- [Using it with Claude](#using-it-with-claude)
- [What Claude can make](#what-claude-can-make)
- [Art directions ("looks")](#art-directions-looks)
- [The editor](#the-editor)
- [Export](#export)
- [Architecture](#architecture)
- [HTTP API](#http-api)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

---

## Quick start

Requirements: **Node 20+** (developed on Node 24), macOS/Linux/Windows. ffmpeg/ffprobe come bundled via npm; the
headless renderer uses Playwright's Chromium.

```bash
git clone <this repo> ~/gitProjects/cutroom
cd ~/gitProjects/cutroom
npm install
npx playwright install chromium   # headless renderer for screenshots and export
npm start                         # → http://localhost:4317 (this machine only)
```

If npm blocked install scripts (`npm install-scripts ls`), approve the two that matter:

```bash
npm install-scripts approve esbuild ffmpeg-static
```

To let collaborators on your network join the same session:

```bash
npm run team                      # binds 0.0.0.0 and prints your LAN URL
```

Projects, media, versions and exports live in `data/` (git-ignored).

## Using it with Claude

### Connect once

```bash
# the MCP server (the tools Claude calls)
claude mcp add -s user cutroom -- ~/gitProjects/cutroom/node_modules/.bin/tsx ~/gitProjects/cutroom/apps/mcp/src/index.ts
# the skill (the workflow + taste rules Claude follows)
ln -s ~/gitProjects/cutroom/skill/video-editor ~/.claude/skills/video-editor
```

The MCP tools start the editor server in the background if it isn't running (log: `data/server.log`).

### Then ask, from any project

> "Make me a 45-second launch video for this repo, 16:9."
> "Cut these three screen recordings into a 30 s reel with captions and punchy sound design."
> "Make it feel like a retro arcade trailer."

What happens:

1. **Art direction.** Claude reads your project (README, landing copy, real code and numbers) and calls
   `design_direction` with a vibe from the brief. It gets back a look that none of your 6 most recent projects used.
2. **Lock.** `begin_editing` takes the edit lock, snapshots a version and opens the editor in your browser. Everyone
   else is view-only but can play, scrub and inspect.
3. **Live build.** Claude builds scene by scene through `edit` calls. Each op lands live (paced so you can follow),
   with the changed clip highlighted and the playhead following along.
4. **Self-check.** Claude renders `screenshot`s and a `contact_sheet` exactly as the export will look, and fixes
   overlaps, contrast and timing.
5. **Hand-off.** `finish_editing` releases the lock with a summary. You can now change anything, and Claude can export
   (`export_video`) or keep iterating on the same project later.

### MCP tools

| Tool | What it does |
|---|---|
| `list_projects` / `create_project` / `get_project` | Find, create (1920×1080, 1080×1920 reel, 1080×1080 square…) or read a readable outline of a project |
| `catalog` | Every component, prop, default, sfx preset, transition, text animation, easing and look |
| `design_direction` | Roll an art direction for a new video (see [Looks](#art-directions-looks)) |
| `begin_editing` / `finish_editing` | Take / release the edit lock (snapshot + browser open on begin) |
| `import_media` | Import video/audio/images/GIF/SVG from disk; non-web codecs are transcoded |
| `analyze_media` | Silences (cut dead air), loudness, beat grid (cut on the beat), scene cuts |
| `edit` | Apply a batch of edit ops (atomic, validated, paced for viewers) |
| `screenshot` / `contact_sheet` | Render exact frames / a grid across the whole video |
| `export_video` | Render mp4 / draft / webm / prores / gif and return the file path |
| `versions` | List or restore saved versions |

### Edit ops

All edits — Claude's and yours — are the same small set of ops:

```jsonc
{"op":"setMeta", "name":"Launch", "width":1920, "height":1080, "fps":30, "background":"#060912", "look":"midnightTech"}
{"op":"addTrack", "id":"titles", "kind":"visual", "order":5}
{"op":"addClip", "id":"t1", "type":"component", "component":"title", "start":0.4, "duration":4,
  "props":{"text":"Cutroom", "kicker":"Introducing", "layout":"split", "animIn":"maskUp", "font":"Syne"}}
{"op":"setKeyframes", "id":"t1", "prop":"scale", "keyframes":[{"t":0,"v":1,"ease":"linear"},{"t":4,"v":1.06}]}
{"op":"addClip", "id":"music", "type":"sfx", "component":"music", "start":0, "duration":45,
  "props":{"style":"synthwave", "mood":"tense", "drop":14, "intro":3.5, "duckUnder":true}}
// also: updateClip, setProps, addKeyframe, removeKeyframe, splitClip, duplicateClip, removeClip, rippleDelete,
//       updateTrack, removeTrack, addMarker, removeMarker, clear
```

Clip types: `video`, `image`, `audio`, `component` (motion graphics), `sfx` (synthesized sound or music).
Any numeric or color prop can be keyframed.

## What Claude can make

Every item below is a parametric component or preset. It is a pure function of its props and time, so preview,
scrubbing and export are frame-identical, and every option is editable in the inspector.

### Motion graphics (46 components)

| Category | Components |
|---|---|
| **Text** | `text`, `title` (7 layouts: classic, stacked, boxed, outline, split, editorial, huge), `lowerThird` (7 variants), `captions` (12 styles incl. karaoke, neon, bounce, stack; word-timed), `logoReveal` (7 styles), `kineticType`, `wordCycle`, `blockReveal`, `splitFlap`, `highlighter`, `quote`, `marquee`, `countdown`, `checklist` |
| **Screen / UI** | `codeTyping` (syntax-colored, 4 themes), `terminal`, `browserFrame`, `phoneFrame`, `cursor` (waypoints + click ripples), `callout`, `spotlight`, `chatBubbles`, `notificationToast`, `socialPost`, `searchBar`, `button` |
| **Data** | `counter`, `barChart`, `lineChart`, `donutChart`, `comparison`, `timelineSteps`, `flowDiagram` (auto-layout from `A -> B` lines), `progressBar` |
| **Background & depth** | `background` (19 styles: solid, linear, radial, glow, grid, dots, blobs, noise, mesh, aurora, waves, starfield, stripes, conic, perspectiveGrid, topo, bokeh, halftone, paper), `gradientOrb`, `particles` (dust, bokeh, sparks, snow, stars, bubbles, fireflies, rain, embers) |
| **Texture & effects** | `overlay` (grain, scanlines, lightLeak, vhs, letterbox, halftone, filmBurn, chromatic, crt), `burst`, `confetti` (4 styles incl. emoji), `scribble` (hand-drawn arrows, circles, checks…), `shape` (13 shapes incl. a morphing blob) |
| **Transitions** | `shapeWipe` (circle, diamond, blinds, grid, clock, doors, zoomRings, slats, liquid), `stripeWipe`, `glitchTransition`, `flash` |

### Motion system

- **Text animation**: 26 entrances (fade, rise, drop, pop, slide, blurIn, typewriter, wordsUp/Pop, letters,
  charsUp/Pop, scramble, maskUp, tracking, flipUp, skewIn, glitchIn, zoomBlur, stamp, splitIn, waveIn, elastic…),
  17 exits, per-word/char stagger, plus a settled `loop` (float, wave, pulse, jitter, shimmer, glow).
- **Clip transitions** (any visual clip, in and out): 28. These are fade, slide ×4, zoom ×2, wipe ×4, iris, diagonal,
  blinds, split, whip ×2, blur, zoomBlur, spin, flipX/Y, drop, rise, glitch, swing and stretch.
- **Camera motion** (any visual clip): `motion` = float, sway, wiggle, shake, handheld, pulse, breathe, spin, orbit,
  bob or flicker, with amount and speed. It is deterministic per clip.
- **Keyframes** on any numeric/color prop, with 20 easings: linear, hold, ease in/out/inOut, back, elastic, bounce,
  expo, circ, sine, quart, quint, spring, snap and anticipate.
- **Effects** on any visual clip: blur, brightness, contrast, saturation, hue, grayscale, sepia, invert, crop,
  corner radius, drop shadow, blend modes, vignette.

### Sound (71 synthesized presets)

Every sound is generated from parameters at 48 kHz. Nothing is sampled, so pitch, length, tone and variation stay
editable, and the same seed always gives the same sound in preview and export.

| Category | Presets |
|---|---|
| **Transitions** | whoosh, swish, riser, downlifter, reverseSwell, sweepUp, whooshHit, warp, tapeStop, vinylScratch, zap, glitch, airPuff |
| **UI** | click, key, typing, pop, tick, tick2, notification, camera, alert, bubble, blip, bloop, toggle, swipe, hover, success, error, coin, levelUp, sendMessage, receiveMessage, shutterBurst, trash |
| **Foley** | snap, clap, keyboardClack, mouseScroll, slam, heartbeat |
| **Impacts** | thud, boom, impact, punch, subDrop, braam, taiko, gong, metalClang, glassTing, cymbal, drumroll |
| **Tonal / stingers** | chime, shimmer, beep, ding, sparkle, magic, harp, piano (8 chord types), stinger (rise, hit, success, magic, dark, playful, epic, in any mood/key) |
| **Textures** | roomTone, vinylCrackle, wind, rain, cityHum, crowdCheer, drone |

Shared sound props: `pitch` (semitones), `variation` (seed), plus `tone`/`decay` where it makes sense. Audio clips
also get volume (keyframable), pan, fades, mute, and automatic **ducking** under clips marked as voice.

### Music engine

The `music` preset writes an original track for the clip length:

- **15 styles**: ambient, lofi, house, synthwave, trap, cinematic, corporate, dnb, chiptune, piano, minimal, funk,
  orchestral, garage, indie. There is also `auto`, which picks a style from the mood, and `classic`, the original engine.
- **14 moods**: hopeful, epic, chill, tech, dark, bright, dreamy, tense, playful, triumphant, melancholy,
  mysterious, warm, aggressive. Each has its own scale and several chord progressions.
- **Structure**: intro → A → build → **drop** → A′ → outro. Put the drop on the video's big reveal: the engine
  builds for 2 bars, leaves a beat of silence, then lands a crash and boom on that exact second.
- **Controls**: `bpm`, `transpose`, `energy`, `intro`, `drop`, `outro`, `swing`, `progression`, part toggles
  (drums, bass, pad, arp, melody), and `variation`, which gives a new melody, chord progression and drum fills.
- **Instruments**: FM electric piano and bells, supersaw and string pads, a plucked guitar, square/pulse leads,
  organ, felt piano, 808 with glide, reese bass and a full drum kit. Effects include tape saturation, bitcrush,
  sidechain pump and reverb.
- **Speed**: 90 s of music renders in about 1–3 s, in the browser or in Node.

### Fonts

23 fonts are bundled offline, so preview and export match. Inter, IBM Plex Sans/Mono, JetBrains Mono, Space Grotesk,
Playfair Display, Bebas Neue, Syne, DM Serif Display, Archivo Black, Instrument Serif, Unbounded, Sora, Fraunces,
Anton, Space Mono, Manrope, Outfit, Major Mono Display, Caveat, plus system-ui, Georgia and Helvetica.

## Art directions ("looks")

The usual reason generated videos look samey is that every one gets the same blue glow, the same font, the same
fade and the same whoosh. Cutroom fixes this with **23 art directions** in `packages/core/src/looks.ts`:

Midnight tech · Neon arcade · Editorial paper · Swiss grid · Pastel pop · Brutalist · Luxury noir · Terminal ·
Aurora dream · Cinematic teal & orange · Carbon enterprise · Organic · Sunset gradient · Blueprint · Vaporwave ·
Cozy lo-fi · Sports energy · Clinical clean · Risograph · Monochrome · Chrome Y2K · Upbeat product · Dark matter

Each look has several options for every slot:

- 2–3 **palettes** (stage, surface, text, muted, three accents)
- 2–3 **font pairings** (display, body, mono, weight, case, tracking)
- a **shading** style (flat, gradient, glow, neon, duotone, soft, outline, shadow)
- a **texture** (grain, halftone, scanlines, VHS, CRT, light leak, film burn, letterbox… or clean)
- **background** styles
- title, lower-third, caption and logo **layouts**
- **text, transition and camera motion**, plus easing
- signature accent components and particles
- **music** style and mood
- a **sound kit** (moves, appears, hits, reveals, UI)

`rollLook({ vibe, avoid, look, seed })` works like this:

1. It scores the looks against the brief.
2. It drops looks the recent projects used. The server passes the last 6 projects' `meta.look` automatically.
3. It picks among the closest matches, then picks one option for each slot.
4. It returns `rules` (a short art-direction brief) and `recipes`, ready-to-merge props for background, title,
   headline, body, lowerThird, captions, logo, code, wipe, texture, particles and music.

The same brief therefore still yields different palettes, fonts and motion each time. `test/looks.test.ts` checks
that every value a look references exists in the catalog, and that every recipe prop is a real prop.

The skill (`skill/video-editor/SKILL.md`) adds anti-template rules on top:

- Vary the composition instead of centering everything.
- Use at least 6 different devices per video.
- Never use the same text entrance twice in a row.
- Make most cuts hard cuts, and save section wipes for major breaks.
- Mix punch shots with breathers.
- Build frames in 3–5 layers.
- Fire one sound effect per visual hit, varying it on repeats.
- Never ship a component on its default props.

## The editor

- **Library**: media (drag in files), components by category, and sounds; click ▶ to audition a sound.
- **Preview**: drag to move (snaps to center lines), ⌥-scroll to scale, safe-area guides (incl. Reels UI zones).
- **Inspector**: every prop grouped (Content, Style, Animation, Layout, Transform, Motion, Effects, Transitions,
  Audio), keyframe toggles (◆), and a curve view.
- **Timeline**: multiple tracks, trim/move/split, snapping, waveforms, markers, and collaborators' selections.
- **Activity log & versions**: every edit is attributed to Claude or a person. Versions are snapshotted when Claude
  starts, and **Undo Claude's last run** restores the version saved before it.
- **Lock banner**: shows who's editing and their task. You can take over a stalled lock.

Keyboard: Space play · S split · ⌫ delete · ⇧⌫ ripple delete · ⌘D duplicate · ⌘Z / ⇧⌘Z undo/redo · M marker ·
←/→ frame step (⇧ = 1 s) · J/K/L shuttle · +/− or ⌘-scroll zoom · double-click a prop label to reset it.
Once a prop is animated, changing its value at the playhead adds a keyframe automatically.

## Export

| Preset | Output |
|---|---|
| `mp4` | H.264 CRF 17, AAC 256k — final delivery |
| `draft` | half size, fast — quick review |
| `webm` | VP9 + Opus |
| `prores` | ProRes 422 HQ `.mov` — for Premiere/Resolve/FCP |
| `gif` | half size, 15 fps, palette-optimized |

Export renders headlessly with the same `drawFrame()` and audio mixer as the preview, frame by frame, then muxes
with ffmpeg. Files land in `data/projects/<id>/exports/`. A time range (`from`/`to`) is supported.

## Architecture

```
packages/core     the shared brain — used by the server, the web app and tests
  schema/         project types, prop definitions, Yjs document, edit ops (applyOps)
  engine/         easing + keyframes, timeline evaluation, transitions, camera motion, audio plan, drawFrame()
  components/     motion-graphics components (index.ts, more.ts), text layout + animation (draw.ts), helpers (kit.ts)
  audio/          sfx presets (synth.ts), DSP (dsp.ts), instruments (instruments.ts), music generator (music.ts)
  looks.ts        art directions + rollLook()
  catalog.ts      machine-readable description of everything above, for Claude
apps/server       Express + Yjs websocket sync with lock enforcement, ops API, media import (ffmpeg/ffprobe),
                  analysis, versions, headless frame rendering and export (Playwright + ffmpeg)
apps/web          React editor (Vite): library, preview, inspector, timeline, activity, versions
apps/mcp          MCP server — the tools Claude calls; starts the server on demand
skill/            the video-editor Claude skill (workflow, art direction, anti-slop rules, recipes)
scripts/          visual smoke tests that report in text (no image viewing needed)
```

Key ideas:

- **One source of truth.** A project is a Yjs CRDT document of tracks, clips, props and keyframes. Claude's MCP
  calls and your mouse go through the same `applyOps`, which is why everything Claude makes is editable.
- **Live multi-user.** Websocket sync gives presence avatars, live selections and a shared activity log.
- **The lock.** While someone holds it (Claude, or a person who clicked *Hold lock*), the server rejects everyone
  else's writes. Their UI still plays, scrubs and inspects.
- **Deterministic rendering.** Components and sounds are pure functions of (props, time, seed). Preview, Claude's
  screenshots and the exported file are identical.

## HTTP API

The server (default `http://127.0.0.1:4317`, env `PORT`/`HOST`) exposes what the MCP tools use:

```
GET    /api/health                           GET  /api/catalog            GET /api/looks/roll?vibe=&look=&avoid=&seed=
GET    /api/projects                         POST /api/projects           GET /api/projects/:id   DELETE /api/projects/:id
GET    /api/projects/:id/summary             GET  /api/projects/:id/presence
POST   /api/projects/:id/lock                DELETE /api/projects/:id/lock
POST   /api/projects/:id/ops                 {ops:[…], pace?, author?}
GET    /api/projects/:id/snapshots           POST /api/projects/:id/snapshots   POST /api/projects/:id/snapshots/:sid/restore
POST   /api/projects/:id/media               (multipart upload or {path})
GET    /api/projects/:id/media/:mid/analyze
GET    /api/projects/:id/frame?t=&scale=     GET  /api/projects/:id/sheet?times=&cols=
GET    /api/presets                          POST /api/projects/:id/export   GET /api/projects/:id/jobs   GET /api/jobs/:jid
WS     /yjs/:projectId                       Yjs sync + awareness
```

Environment: `PORT` (4317), `HOST` (127.0.0.1; `npm run team` sets 0.0.0.0), `CUTROOM_STATIC=1` (serve the
prebuilt `apps/web/dist` instead of Vite middleware). For the MCP server, `CUTROOM_URL` points at another server
and `CUTROOM_PACE` sets the default ms between live ops (250).

## Development

```bash
npm run dev                             # server with auto-reload (Vite HMR for the UI)
npm test                                # vitest: ops, engine, audio (every preset/style), looks consistency
npm run typecheck
npx tsx scripts/check-components.ts     # renders every component; prints ink/motion stats + draw errors
npx tsx scripts/check-variants.ts       # renders every animation/transition/motion/style value (-v for all)
(cd apps/web && npx vite build)         # production bundle
```

### Adding things

- **A component**: add a `ComponentDef` to `packages/core/src/components/more.ts`. Build its props with the
  helpers in `kit.ts`. It shows up in the library, inspector, catalog and smoke tests automatically.
- **A sound**: add an `sfx(...)` entry in `packages/core/src/audio/synth.ts`. `test/audio.test.ts` checks it's
  finite, audible and doesn't clip.
- **A look**: add an entry to `LOOKS` in `packages/core/src/looks.ts`. `test/looks.test.ts` fails if it references
  anything that doesn't exist.
- **A font**: `npm i -w @cutroom/web @fontsource/<name>`, import its weights in `apps/web/src/fonts.ts`, and add the
  family to `FONTS` in `packages/core/src/schema/props.ts`.

## Troubleshooting

- **Claude doesn't see the `cutroom` tools**: re-run the `claude mcp add` command above, then restart Claude Code.
- **Server won't start**: check `data/server.log`. Port 4317 may be taken; set `PORT`.
- **Screenshots or export fail**: run `npx playwright install chromium`.
- **ffmpeg errors on import**: run `npm install-scripts approve ffmpeg-static`, then `npm rebuild ffmpeg-static`.
- **Text renders in the wrong font**: fonts load before first paint; hard-refresh the editor after adding new ones.
