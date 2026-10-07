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
- [Share it with your team](#share-it-with-your-team)
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
git clone https://github.com/Qrytics/cutroom.git ~/gitProjects/cutroom
cd ~/gitProjects/cutroom
npm install
npm run setup     # once: ffmpeg, headless Chromium, registers the `cutroom` MCP server + installs the skill
npm run doctor    # end-to-end self-test through the MCP server (project → edits → check → export), prints fixes
```

`setup` is safe to re-run; it only fixes what's missing (including approving the `esbuild`/`ffmpeg-static` install
scripts that newer npm versions block). Restart any open Claude Code session afterwards so it loads the tools.
You don't need to start the server yourself: the MCP tools start it and replace it automatically when its code is
outdated. To use the editor without Claude: `npm start` → http://localhost:4317.

To work on the same videos with other people, in the office or anywhere: [Share it with your team](#share-it-with-your-team).

Projects, media, versions and exports live in `data/` (git-ignored).

## Using it with Claude

### Connect once

`npm run setup` does this for you. By hand it is:

```bash
claude mcp add -s user cutroom -- ~/gitProjects/cutroom/node_modules/.bin/tsx ~/gitProjects/cutroom/apps/mcp/src/index.ts
ln -s ~/gitProjects/cutroom/skill/video-editor ~/.claude/skills/video-editor
```

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
4. **Self-check.** Claude runs `check`, a text-only QA pass through the real renderer. It reports text cut off at
   the frame edge, overlapping text, low contrast, media that fails to draw, Reels UI-zone intrusions, bad props and
   audio clipping, each with clip ids and times. Claude fixes them before exporting; no image support is needed.
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
| `edit` | Apply a batch of edit ops (atomic, validated, paced for viewers); returns warnings for unknown props, bad options, out-of-range values, keyframes outside clips and hidden overlaps |
| `check` | Text-only QA: cut-off/overlapping/low-contrast text, empty media, safe zones, prop mistakes, audio peaks & silence, per-layer pixel bounds |
| `screenshot` / `contact_sheet` | Render exact frames / a grid across the whole video (image output; optional) |
| `export_video` | Render mp4 / draft / webm / prores / gif, open it for the user, return the path and a URL |
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

### Motion graphics (71 components)

| Category | Components |
|---|---|
| **Text** | `text`, `title` (7 layouts: classic, stacked, boxed, outline, split, editorial, huge), `lowerThird` (7 variants), `captions` (12 styles incl. karaoke, neon, bounce, stack; word-timed), `logoReveal` (7 styles), `kineticType`, `wordCycle`, `blockReveal`, `splitFlap`, `highlighter`, `quote`, `marquee`, `countdown`, `checklist` |
| **Screen / UI** | `codeTyping` (syntax-colored, 4 themes), `terminal`, `browserFrame`, `phoneFrame`, `cursor` (waypoints + click ripples), `callout`, `spotlight`, `chatBubbles`, `notificationToast`, `socialPost`, `searchBar`, `button` |
| **Data** | `counter`, `barChart`, `lineChart`, `donutChart`, `comparison`, `timelineSteps`, `flowDiagram` (auto-layout from `A -> B` lines), `progressBar` |
| **Background & depth** | `background` (19 styles: solid, linear, radial, glow, grid, dots, blobs, noise, mesh, aurora, waves, starfield, stripes, conic, perspectiveGrid, topo, bokeh, halftone, paper), `gradientOrb`, `particles` (dust, bokeh, sparks, snow, stars, bubbles, fireflies, rain, embers) |
| **Texture & effects** | `overlay` (grain, scanlines, lightLeak, vhs, letterbox, halftone, filmBurn, chromatic, crt), `burst`, `confetti` (4 styles incl. emoji), `scribble` (hand-drawn arrows, circles, checks…), `shape` (13 shapes incl. a morphing blob) |
| **Icons, accents & UI bits** | `icon` (57 line icons, draw-on), `iconBurst`, `stamp`, `badge`, `arrowPointer`, `focusBox`, `checkmarkSuccess`, `starRating`, `ripple`, `pathDraw`, `drawing` (hand-drawn in the editor), `morphShape`, `orbit`, `textPath`, `numberTicker`, `timer`, `loader`, `typingIndicator`, `calloutBubble`, `swipeHint`, `waveform`, `liquidBlob`, `emojiRain` |
| **Transitions** | `shapeWipe` (circle, diamond, blinds, grid, clock, doors, zoomRings, slats, liquid), `revealMask`, `gridReveal`, `stripeWipe`, `glitchTransition`, `flash` |

### Motion system

- **Text animation**: 46 entrances (fade, rise, drop, pop, slide, blurIn, typewriter, wordsUp/Pop, letters,
  charsUp/Pop, scramble, maskUp, tracking, flipUp, skewIn, glitchIn, zoomBlur, stamp, splitIn, waveIn, elastic…),
  17 exits, per-word/char stagger, plus a settled `loop` (float, wave, pulse, jitter, shimmer, glow).
- **Emphasis** (any visual clip): 27 one-shot or repeating attention moves (pulse, heartbeat, shake, tada, jello,
  rubberBand, headShake, pop, jump, squash…) fired at a chosen moment.
- **Clip transitions** (any visual clip, in and out): 66, with their own easing. These are fade, slide ×4, zoom ×2, wipe ×4, iris, diagonal,
  blinds, split, whip ×2, blur, zoomBlur, spin, flipX/Y, drop, rise, glitch, swing and stretch.
- **Camera motion** (any visual clip): `motion` = float, sway, wiggle, shake, handheld, pulse, breathe, spin, orbit,
  bob or flicker, with amount and speed. It is deterministic per clip.
- **Keyframes** on any numeric/color prop, with 20 easings: linear, hold, ease in/out/inOut, back, elastic, bounce,
  expo, circ, sine, quart, quint, spring, snap and anticipate.
- **Effects** on any visual clip: blur, brightness, contrast, saturation, hue, grayscale, sepia, invert, crop,
  corner radius, drop shadow, blend modes, vignette.

### Sound (233 synthesized presets)

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

### Reels, Shorts and TikTok

Ask for a vertical video (1080×1920) and the skill builds for those platforms:

- The video loops seamlessly: the last frame matches the first, closing into a colored iris and opening from it,
  with a matching sound.
- Text stays out of the app's caption area and like/comment column, and `check` flags anything that strays in.
- Main blocks sit on the center line, with accents like a tilted sticker breaking symmetry on purpose.
- On-screen copy is plain language.
- Claude can record real screen captures of a product, with a visible cursor and private details hidden.

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

## Share it with your team

One person hosts. Everyone else opens an invite link in a browser, and can optionally connect their own Claude Code
so it builds videos on the shared server too. Everyone sees every edit live.

### 1. Host a session

Easiest: click **Share** in the editor's top bar and choose **🌐 Share with anyone** (people anywhere, through a
secure link) or **🏢 Share on my network**. Cutroom restarts itself in team mode, and the dialog shows the invite link
plus the exact command a teammate runs to connect their Claude, each with a Copy button. **Stop sharing** makes it
private again.

From a terminal instead:

```bash
npm run team                 # people on the same network or VPN can join
npm run team -- --internet   # anyone, anywhere: a free, encrypted Cloudflare tunnel (no account, no router setup)
```

It prints an **invite link** and a one-line command for teammates. Keep it running; Ctrl+C ends the session, and
projects stay saved.

### 2. Teammates join

- **In a browser:** open the invite link. It signs them in and they pick a name; no install needed.
- **With their own Claude** (so "make me a video" works for them too, live on your server), they run once:

  ```bash
  curl -fsSL https://raw.githubusercontent.com/Qrytics/cutroom/main/scripts/install.sh | bash -s -- --join "<invite link>"
  ```

  It installs Cutroom to `~/cutroom`, connects their Claude Code to your server and installs the skill.
  Their media uploads from their own computer and exports download back to their `~/Downloads`. To switch back to a
  local Cutroom later: `npm run setup -- --local`.
- **To share just the skill with someone who'll host their own:** send them the same command without `--join`.

### Access and security

- Everyone except the host machine needs the invite. Without it they get a "this Cutroom server is private" page,
  and the API, media and live sync all refuse them. Tunnelled traffic counts as remote.
- The invite link sets a long-lived, HttpOnly cookie in their browser (Secure over https). Teammates' Claude sends
  the invite as a bearer token.
- `npm run team -- --new-invite` replaces the invite; old links stop working.
- The `--internet` quick-tunnel address changes every time you restart it, so send the new invite then.

### Always-on team server

For a permanent address everyone keeps (an office machine, a cloud VM, Fly.io, Render, Railway…), use the Dockerfile:

```bash
docker build -t cutroom .
docker run -d --name cutroom -p 4317:4317 -v cutroom-data:/data \
  -e CUTROOM_PUBLIC_URL=https://video.example.com -e CUTROOM_TOKEN=pick-a-long-random-code cutroom
docker logs cutroom          # prints the invite link
```

Put it behind HTTPS (your platform's TLS or a reverse proxy) and share `https://video.example.com/join/<code>`.
Or keep it on an office machine with `npm run team` and give remote people access through your VPN or
[Tailscale](https://tailscale.com); use the LAN invite link then.

## The editor

- **Library**: media (drag in files), components by category, and sounds; click ▶ to audition a sound.
- **Preview**: click an object to select exactly what's under the pointer. Alt-click selects the object underneath.
  Drag to move (snaps to center lines); drag a **corner dot** to resize (Shift = stretch); drag the **⟳ knob** to
  rotate (Shift = 15° steps). ⌥-scroll scales. Safe-area guides include the Reels UI zones.
- **Create your own** (toolbar above the preview, also under Library → Graphics):
  - **T** text: click and type right on the video
  - **P** pen: freehand drawing
  - **U** line and **A** arrow: Shift snaps to 45°
  - **R** rectangle and **O** ellipse: Shift makes a square or circle

  Each takes a color, thickness and look (pen, marker, highlighter, neon, chalk, brush), with fill and draw-on
  toggles. Drawings replay the way you drew them, and each becomes a normal clip you can move, resize, rotate,
  keyframe and restyle.
- **Inspector**: every prop grouped (Content, Style, Animation, Layout, Transform, Motion, Effects, Transitions,
  Audio), keyframe toggles (◆), and a curve view.
- **Timeline**: multiple tracks, trim/move/split, snapping, waveforms, markers, and collaborators' selections.
- **↺ Restore**: **Reset to Claude's original** (saved automatically when Claude finishes), restore any saved
  version, or restore from a file on your computer. Every export writes a `.cutroom.json` next to the video, and
  "Save this version to a file" downloads one any time. A restore first saves what you have, so it can be undone.
- **Activity log & versions**: every edit is attributed to Claude or a person; versions are saved automatically
  before every Claude run and every restore.
- **Lock banner**: shows who's editing and their task. You can take over a stalled lock.

Keyboard: V select · T text · P pen · U line · A arrow · R rect · O ellipse · Esc back to select · Space play · S split · ⌫ delete · ⇧⌫ ripple delete · ⌘D duplicate · ⌘Z / ⇧⌘Z undo/redo · M marker ·
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
node scripts/check-looks.mjs            # builds a scene from every look's recipes and runs `check` on it
npm run doctor                          # end-to-end through the MCP server (add -- --quick to skip the export)
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

Run `npm run doctor` first. It tests every step Claude uses and prints the fix for anything that fails.

- **Claude doesn't see the `cutroom` tools**: run `npm run setup`, then restart Claude Code.
- **The editor says "Connecting to project…"**: after 6 s it tells you why (missing project, sync not connected, or
  server down) and offers Retry.
- **Server won't start**: check `data/server.log`. Port 4317 may be taken; set `PORT`.
- **Screenshots fail in your client** (some gateways reject images): nothing depends on them; `check` covers the
  same ground in text.
- **ffmpeg / Chromium missing**: `npm run setup` reinstalls them.
