---
name: video-editor
description: Make or edit a video live in Cutroom, the user's collaborative editor, so they can watch every cut, title, animation and sound effect land on a real timeline and then edit any of it by hand. Handles any material — screen recordings, camera/phone footage, images, logos, audio, illustrated characters/scenes (authored as SVG), plus code-built motion graphics (titles, lower thirds, kinetic type, code typing, terminals, charts, captions, chat/UI mockups, callouts, cursors, particles, textures) and a synthesized soundtrack (multi-genre music + 70 SFX). Use whenever the user asks to "make me a video", "cut a video/clip/reel/compilation/montage/trailer/animation", "edit this footage", "add captions/titles/sfx", "make a teaser/demo/launch/recap/explainer video" from any project, or asks to change a Cutroom project. Prefer this over motion-video unless the user explicitly wants the code-only motion-video pipeline.
---

# Video editor (Cutroom)

Cutroom is a collaborative video editor at `~/gitProjects/cutroom`. You edit through the `cutroom` MCP tools; every op
lands live in every open editor window (the user is watching), and everything you make stays a normal, editable clip
with props, keyframes and effects. While you hold the lock, humans are view-only; when you finish they can change anything.

## 0. Preflight (10 seconds, every time)
- **Tools present?** You need `cutroom` tools (`create_project`, `edit`, `check`, …). If they are missing, run
  `cd ~/gitProjects/cutroom && npm run setup` (registers the MCP server + this skill, installs Chromium/ffmpeg), then
  tell the user to restart Claude Code so the tools load. If they can't restart now, use the HTTP fallback (§9) —
  the same operations, via `curl` against http://127.0.0.1:4317.
- The tools start the editor server themselves and replace it automatically when its code is outdated.
  If anything misbehaves: `cd ~/gitProjects/cutroom && npm run doctor` (end-to-end self-test, prints the fix).
- **Images may not work in this client** (some API gateways reject image content). Never `Read` image files and never
  depend on `screenshot`/`contact_sheet`. Verify with `check` (§6) — it reports everything in text. If an image call
  errors once, don't retry it.

## 1. Ask only what you can't decide
- **Format**: landscape 1920×1080, reel 1080×1920 (Reels/TikTok/Shorts), square 1080×1080 — and rough length.
- **Footage**: which files/folders to use, or whether to record the product (§4). Real logos only (§4).
- Everything else (story, pacing, look, music, sfx, graphics) is your call. Decide, build, let them tweak.

## 2. Gather
- Read the project the video is about (README, landing copy, package.json, screenshots, demo recordings) for real
  names, numbers, code and claims. Show only verified facts; paste real code/output into `codeTyping`/`terminal`.
- `catalog({section:"index"})` once (one line per component/sfx/look), then `catalog({keys:[…]})` for the full props
  of just the components and sounds you'll use. Don't guess prop names — `edit` warns on unknown ones.
- `list_projects` → reuse the project they named (`get_project` to re-orient), else `create_project`.

## 3. Art direction — every video gets its own identity
- New video → `design_direction({vibe})` once (vibe = a few words from the brief + product category: "calm AI
  note-taking app", "loud streetwear drop", "retro arcade trailer"). It skips looks used by the last 6 projects and
  returns palette, fonts, shading, texture, background, text/transition/camera motion, music style/mood/variation, an
  sfx kit, and `recipes` (ready props for background, title, headline, body, lowerThird, captions, logo, code, wipe,
  texture, particles, music). Record it: `{op:"setMeta", look:"<key>", background:"<palette.bg>"}`.
- A story with distinct worlds (e.g. "3D, then 2D") may use a second look for the second act — switch completely
  at a hard transition, never blend.
- Brand present (site colors/fonts, logo) → keep the direction's structure, swap in brand palette + closest fonts.
- Follow its `rules` for the whole act: its palette, fonts, shading, texture as a full-length `overlay`, camera motion.
- Editing an existing project: keep its `meta.look`.

### Don't make copy-paste slop
- **Everything centered, same size** → vary composition (left headline + right stat, huge cropped word, small label).
- **Every scene "title + subtitle, fade"** → a different device per scene: kinetic type, word cycle, block reveal,
  split-flap, highlighter, quote, charts, flow diagram, chat bubbles, notification, phone/browser mockup, code,
  comparison, counter, timeline, scribble, callout. A 30–60 s video uses ≥ 6 components besides background/text.
- **One text animation** → rotate the direction's `textIn`; never the same entrance twice in a row; vary `stagger`;
  `loop` (float/wave/shimmer/glow) on text held > 2 s.
- **Same transition everywhere** → mostly hard cuts; the direction's two clip transitions; a section wipe only
  between major sections (2–3 per video).
- **Uniform rhythm** → mix 0.4–0.8 s punches with 3–5 s breathers; cut on the beat.
- **Flat frames** → 3–5 layers: background → orb/particles → content → accents → texture. Camera `motion` on footage.
- **Static holds** → something moves every 1–2 s (drift x ±30 px, scale 1→1.04, `motion: breathe`).
- **Sound wallpaper** → one sfx per visual hit from the kit; vary `variation`/`pitch`/`tone` on repeats.
- **Default props** → set content, the direction's colors/fonts and at least one style/variant prop on everything.

## 4. Material
- `import_media` with absolute paths: video (any codec, transcoded), audio, images, GIF, SVG.
- **Screen recordings**: record with Playwright (`page.video`, scripted cursor), import the .webm; `browserFrame` or
  `phoneFrame` above it, `cursor`/`callout`/`spotlight` on top; `click`/`keyboardClack` sfx at the action times.
- **Characters, props, scenery** (a pirate, a ship, a mascot, a product illustration): there are no stock assets —
  write SVG files yourself into `~/gitProjects/cutroom/data/<project-id>/` and import them. Give every SVG explicit
  `width`/`height` attributes (its pixel size). Validate them (`python3 -c "import xml.etree.ElementTree as E; E.parse('f.svg')"`).
  - "3D"/rendered look: radial/linear gradients for form, a warm key light from one side and a cool rim light on the
    other edge (blurred stroke), specular highlight dots, ambient-occlusion ellipses (blurred, 25–35% black) under
    overlaps, a soft contact shadow.
  - Flat/2D look: the same shapes with flat fills, one hard-edged cel-shadow tone, 6–8 px ink outlines.
  - Build both versions from **one shared geometry** so a swap (flipX transition, glitch) lines up exactly.
  - Long scenery (waves, skylines) as wide periodic strips (e.g. 3840 px) scrolled by keyframing `x`.
- **Real logos**: never redraw a trademark. Download the official file (the company's press kit/site, or Wikimedia
  Commons: `curl -sL "https://commons.wikimedia.org/wiki/Special:FilePath/<File_name>.svg"`) into its own new
  directory, confirm it is plain SVG (no `<script>`/`href`), add `width`/`height` if missing, then import.

## 5. Build — `begin_editing`, then one scene per `edit` call
1. `begin_editing({project, task})` → lock, snapshot, opens the editor for the user (already signed in by name).
2. Create tracks first in one `edit` (bottom → top), e.g. `bg, deco, far, ship, hero, hero2, front, fx, fx2, text,
   text2, ui, wipe, texture` (+ audio `music, sfx`). `order` = stacking; higher draws on top.
3. One `edit` per scene (5–30 ops). Readable ids (`intro_bg`, `title_1`, `whoosh_2`) and a `name` on every clip.
   For big batches pass `pace: 100`; default pacing is 250 ms per op.
4. **Read every `edit` result.** `⚠` lines are real mistakes (unknown prop → "did you mean…", option not in the list,
   value out of range, keyframe outside the clip, overlap on a visual track, clip past the project end) — fix them
   with `setProps`/`updateClip` before moving on.

### Rules that keep it correct the first time
- **Coordinates**: `x`/`y` = the clip's **center** in canvas px (default = canvas center). Components draw centered,
  so `x` moves the whole block; `align:"left"` only aligns lines within it. Don't estimate text widths — fonts render
  wider than you think (Syne/Anton/Archivo caps ≈ 0.8–1.0 × size per char). Place it, run `check`, adjust to the
  reported bbox.
- **Images/SVGs**: use `fit:"none"` for assets so they draw at their own pixel size (then `scale`). The default
  `fit:"contain"` scales every image to fill the canvas. Rotation/scale pivot on the clip center.
- **Tracks**: one visual clip at a time per track — overlapping clips on one visual track hide each other; put them
  on separate tracks. Overlapping sounds on one audio track all play. Omit `trackId` to auto-pick a free track
  (sfx: always fine to omit).
- **Keyframes**: `t` is clip-local seconds; a keyframe's `ease` shapes the segment *after* it. Use `hold` for steps.
  For bobbing/rocking use `motion` (float/bob/sway/handheld) or sample a sine every 0.4 s with `sineInOut`; give
  things that ride together (pirate on a ship) the same samples plus their offset.
- **Timing**: hard cuts = next clip starts where the last ends. One-shot sfx (impact, stinger, braam, chime…) have a
  fixed length — keep them inside the project. `music.drop`/`intro`/`outro` are clip-local seconds.
- **Readability**: ≤ 3–4 words per second on screen; titles 90–160 px, body 40–60 px, code 30–36 px (landscape);
  ≥ 4% margins. Text over busy/bright imagery needs a scrim (`shape` rect, dark fill ~0.6 alpha, `blur` 60–80)
  or a stroke/shadow/box.
- **Reels (1080×1920)**: keep text and faces out of the bottom ~22% and right ~14% (app UI); captions `yOffset` 250–450.
- `overlay` letterbox: `intensity` 0.5 = true 2.39:1 bars (1 doubles them).

### Recipe sketch
```jsonc
{"op":"setMeta","look":"<direction.look>","background":"<palette.bg>","duration":45}
{"op":"addClip","id":"bg1","type":"component","component":"background","start":0,"duration":45,"trackId":"bg","props":{...recipes.background.props}}
{"op":"addClip","id":"tex","type":"component","component":"overlay","start":0,"duration":45,"trackId":"texture","props":{...recipes.texture.props}}
{"op":"addClip","id":"t1","type":"component","component":"title","start":0.4,"duration":4,"trackId":"text","name":"Hook","props":{...recipes.title.props,"kicker":"Introducing","text":"Cutroom","subtitle":"Edit videos with Claude"}}
{"op":"addClip","id":"sw1","type":"sfx","component":"whoosh","start":0.3,"duration":0.9}
{"op":"addClip","id":"hero","type":"image","mediaId":"m_…","start":4,"duration":6,"trackId":"hero","props":{"fit":"none","x":620,"y":640,"scale":1.2,"motion":"handheld"}}
{"op":"addClip","id":"demo","type":"video","mediaId":"m_…","start":10,"inPoint":3.2,"duration":8,"trackId":"footage","props":{"fit":"cover","motion":"breathe","transitionIn":"fade"}}
{"op":"addClip","id":"music","type":"sfx","component":"music","start":0,"duration":45,"trackId":"music","props":{...recipes.music.props,"intro":3.5,"drop":14}}
{"op":"addClip","id":"cap1","type":"component","component":"captions","start":12,"duration":5,"trackId":"text2","props":{"text":"0|Every\n0.4|edit\n0.7|lands\n1.1|live","style":"highlight"}}
```

### Toolbox (full props via `catalog({keys})`)
- **Text**: `title` (layouts classic/stacked/boxed/outline/split/editorial/huge), `text`, `kineticType`, `wordCycle`,
  `blockReveal`, `splitFlap`, `highlighter`, `quote`, `marquee`, `captions` (12 styles), `lowerThird` (7 variants),
  `logoReveal` (7 styles), `countdown`, `checklist`. 26 entrances (maskUp, scramble, stamp, tracking, charsPop,
  waveIn, glitchIn, flipUp, splitIn, zoomBlur, elastic…), 17 exits, `loop` float/wave/pulse/jitter/shimmer/glow.
- **UI & social**: `chatBubbles`, `notificationToast`, `socialPost`, `searchBar`, `button`, `phoneFrame`,
  `browserFrame`, `cursor`, `callout`, `spotlight`, `codeTyping`, `terminal`.
- **Data**: `counter`, `barChart`, `lineChart`, `donutChart`, `comparison`, `timelineSteps`, `flowDiagram`, `progressBar`
  (keyframe `value` with `fillDur` 0.05 for health bars / live meters).
- **Depth & texture**: `background` (19 styles incl. mesh, aurora, perspectiveGrid, topo, paper, halftone, starfield,
  noise), `gradientOrb`, `particles` (dust, bokeh, sparks, snow, stars, bubbles, fireflies, rain, embers), `overlay`
  (grain, scanlines, lightLeak, vhs, letterbox, halftone, filmBurn, chromatic, crt), `burst` (rings, rays, sparkle,
  shockwave, lines, dots), `scribble`, `shape` (13 shapes), `confetti`.
- **Transitions**: clip `transitionIn/Out` (28: fade, slide×4, zoom×2, wipe×4, iris, diagonal, blinds, split, whip×2,
  blur, zoomBlur, spin, flipX/Y, drop, rise, glitch, swing, stretch); section wipes `shapeWipe` (9 styles),
  `stripeWipe`, `glitchTransition`, `flash` (also lightning / hit flashes: `peak` 0.1, `maxOpacity` ≤ 0.8).
- **Camera motion** on any visual clip: `motion` handheld/breathe/float/sway/wiggle/shake/pulse/orbit/bob/spin/flicker
  + `motionAmount`, `motionSpeed` (both keyframable — ramp `motionAmount` for building tension).
- **Effects** on any visual clip: blur, brightness, contrast, saturate, hue, grayscale, crop, cornerRadius, shadow,
  blend, vignette (all keyframable).

### Sound
- **Music**: `music` with `style` (ambient, lofi, house, synthwave, trap, cinematic, corporate, dnb, chiptune, piano,
  minimal, funk, orchestral, garage, indie) × `mood` (14), `energy`, `intro`, `drop` (build → a beat of silence →
  full band, on that second), `outro`, part toggles, `variation`. Use one bed per act; change style between worlds;
  end a bed with `tapeStop`/`downlifter` when the story breaks.
- **SFX (71)**: transitions (whoosh, whooshHit, swish, riser, downlifter, reverseSwell, sweepUp, warp, tapeStop,
  vinylScratch, zap, glitch, airPuff), UI (click, pop, blip, bloop, bubble, toggle, swipe, hover, success, error,
  coin, levelUp, sendMessage, receiveMessage, notification, beep…), foley (snap, clap, keyboardClack, typing,
  mouseScroll, slam, heartbeat), impacts (impact, punch, subDrop, braam, taiko, boom, thud, gong, metalClang,
  glassTing, cymbal, drumroll), tonal (chime, ding, sparkle, magic, harp, piano, `stinger`), textures (roomTone,
  vinylCrackle, wind, rain, cityHum, crowdCheer, drone).
- One sound per visual hit; on repeats change `variation` (0–999) and `pitch` (±1–3), vary `tone`; pitch quick runs
  up a scale (0, 2, 4, 5, 7). End a `riser`/`reverseSwell` exactly on its hit. Thunder = `boom` tone −0.6.
- The mixer has a limiter and a −1 dBFS ceiling, but stacking 3+ impacts at full volume still sounds harsh —
  keep impacts at volume 0.7–0.9 and music at 0.55–0.75 (`duckUnder: true` under voice).

## 6. Check — after every scene and before export
- `check({project})` renders sample frames through the real compositor and returns text: `✖` errors (text cut off
  at a frame edge, text overlapping text, media that draws nothing) and `⚠` warnings (outside title-safe, low
  contrast, Reels UI zone, bad props/values, too many words per second, audio peaks/silence), each with clip id and
  time, plus every sample's visible layers with **pixel bounding boxes** (x0,y0,x1,y1) — use them to place things.
- Fix every `✖` and every `⚠` that affects the viewer, re-run `check` until clean. `check({project, times:[…],
  audio:false})` re-checks just the moments you changed, fast.
- `get_project` shows the exact timeline if you lose track. `screenshot`/`contact_sheet` are optional extras when
  images work in this client.

## 7. Finish
- `export_video({project})` (mp4; `draft` for a quick review) — it opens the file for the user and returns the path
  and a `http://localhost:4317/exports/…` URL. Give the user both.
- `finish_editing({project, summary})` — always, even if you stop early or something failed, so the user gets their
  editor back.
- Tell the user: what you built scene by scene, where the file is, and that every clip/title/sound/keyframe is
  editable in the editor (click → Inspector, drag/trim on the timeline, ⌘Z, Versions → "Undo Claude's last run").

## 8. Changes later
`get_project` first, edit in place (`setProps`, `updateClip`, keyframes), `check`, re-export. Never start over.

## 9. HTTP fallback (only if the MCP tools are unavailable this session)
Start the server if needed: `cd ~/gitProjects/cutroom && (curl -sf localhost:4317/api/health || (nohup npm start > data/server.log 2>&1 &))`.
```
POST /api/projects {name,width,height,fps}            → {id}         GET /api/catalog       GET /api/looks/roll?vibe=…
POST /api/projects/:id/lock {holder:"claude",holderName:"Claude",task}  (open http://localhost:4317/p/:id?name=<user>)
POST /api/projects/:id/media {path}                   → media        POST /api/projects/:id/ops {ops:[…],pace}  → results (+warnings)
POST /api/projects/:id/check {times?,audio?}          → {text}       POST /api/projects/:id/export {preset} → job; GET /api/jobs/:jid
DELETE /api/projects/:id/lock?holder=claude {summary}                GET /api/projects/:id/summary
```
Write ops to a JSON file with a script and POST them; read `results[].warnings` and `check.text` exactly as above.
