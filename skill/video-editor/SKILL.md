---
name: video-editor
description: Make or edit a video live in Cutroom, the user's collaborative editor, so they can watch every cut, title, animation and sound effect land on a real timeline and then edit any of it by hand. Handles any material — screen recordings, camera/phone footage, images, logos, audio, illustrated characters/scenes (authored as SVG), plus code-built motion graphics (titles, lower thirds, kinetic type, code typing, terminals, charts, captions, chat/UI mockups, callouts, cursors, particles, textures) and a synthesized soundtrack (multi-genre music + 230 distinct SFX). Use whenever the user asks to "make me a video", "cut a video/clip/reel/compilation/montage/trailer/animation", "edit this footage", "add captions/titles/sfx", "make a teaser/demo/launch/recap/explainer video" from any project, or asks to change a Cutroom project. Prefer this over motion-video unless the user explicitly wants the code-only motion-video pipeline.
---

# Video editor (Cutroom)

Cutroom is a collaborative video editor (the folder `npm run setup` installed it in — `claude mcp get cutroom` shows the path; usually `~/cutroom` or `~/gitProjects/cutroom`). You edit through the `cutroom` MCP tools; every op
lands live in every open editor window (the user is watching), and everything you make stays a normal, editable clip
with props, keyframes and effects. While you hold the lock, humans are view-only; when you finish they can change anything.

## 0. Preflight (10 seconds, every time)
- **Tools present?** You need `cutroom` tools (`create_project`, `edit`, `check`, …). If they are missing, run
  `cd <cutroom folder> && npm run setup` (not installed at all: `curl -fsSL https://raw.githubusercontent.com/Qrytics/cutroom/main/scripts/install.sh | bash`) (registers the MCP server + this skill, installs Chromium/ffmpeg), then
  tell the user to restart Claude Code so the tools load. If they can't restart now, use the HTTP fallback (§9) —
  the same operations, via `curl` against http://127.0.0.1:4317.
- The tools start the editor server themselves and replace it automatically when its code is outdated.
  If anything misbehaves: `cd <cutroom folder> && npm run doctor` (end-to-end self-test, prints the fix).
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
  write SVG files yourself (any folder, e.g. `<cutroom folder>/data/<project-id>/`) and import them. Give every SVG explicit
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
- **Stickers/stamps**: `badge` and `stamp` tilt with their own `tilt` prop. Components that own a prop with a shared
  name (text `shadow` glow, particles/orb `opacity`, scribble `x`/`y`) apply it once — the clip level leaves it alone.
- **Video clips in a vertical frame**: `fit:"contain"` + `scale` 0.92–0.96 + `cornerRadius` 20–30 + `muted: true`
  (the music carries the sound); hard-cut between 1.5–2 s segments of the same source (one clip per segment, alternating tracks).
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
- **Reels (1080×1920)**: keep text and faces out of the bottom ~22%, and out of the right ~14% in the lower half
  (the like/comment column); captions `yOffset` 250–450. See §5b for loops and composition.
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

### Toolbox (71 components, 233 sounds — `catalog({section:"index"})`, then `catalog({keys})` for props)
- **Text**: `title` (7 layouts), `text`, `kineticType`, `wordCycle`, `blockReveal`, `splitFlap`, `highlighter`, `quote`,
  `marquee`, `textPath` (text along an arc/wave/circle), `captions` (12 styles), `lowerThird` (7), `logoReveal` (7),
  `countdown`, `checklist`, `numberTicker` (odometer), `timer`.
- **Text motion**: 46 entrances (maskUp, scramble, stamp, tracking, charsPop/Fade/Blur/Rotate/Flip/Drop/Zoom, cascade,
  shuffle, unfold, spotlight, highlightSweep, neonFlicker, wave3d, linesUp, typewriterFade…), 29 exits (typeBack,
  charsScatter, linesDown, flipOut…), 12 loops (float, wave, pulse, jitter, shimmer, glow, bounce, sway, flicker,
  rainbow, breathe). Per-word/char `stagger`.
- **Icons & accents**: `icon` (57 line icons, draw-on, badge), `iconBurst` (reaction bursts), `stamp`, `badge`
  (pill/burst/ribbon/tag sticker), `arrowPointer`, `focusBox`, `checkmarkSuccess`, `starRating`, `ripple`, `burst`,
  `scribble`, `pathDraw` (any SVG path draws on + presets), `drawing` (hand-drawn stroke), `morphShape`, `orbit`, `shape`.
- **UI & social**: `chatBubbles`, `typingIndicator`, `calloutBubble`, `notificationToast`, `socialPost`, `searchBar`,
  `button`, `loader`, `swipeHint`, `phoneFrame`, `browserFrame`, `cursor`, `callout`, `spotlight`, `codeTyping`, `terminal`.
- **Data**: `counter`, `numberTicker`, `barChart`, `lineChart`, `donutChart`, `comparison`, `timelineSteps`,
  `flowDiagram`, `progressBar`, `waveform`.
- **Depth & texture**: `background` (19 styles), `gradientOrb`, `liquidBlob`, `particles` (9), `emojiRain`, `overlay`
  (9 textures), `confetti`.
- **Transitions**: clip `transitionIn/Out` — 66 (fades, push/slide, zoomPunch/zoomRotate, flips, cubeLeft/Right,
  rollIn, squeeze, elastic, bounceIn, jello, glitchSlice, pixelate, masks: iris, clockWipe, barnDoors, checker,
  diamond, venetian, stripes, inkReveal, diagonal wipes; light: lightLeak, dipToBlack/White, filmBurn) with
  `transitionInEase`/`transitionOutEase`. Section wipes: `shapeWipe` (9), `revealMask` (6), `gridReveal`,
  `stripeWipe`, `glitchTransition`, `flash`.
- **Emphasis** on any visual clip (one-shot attention move at a moment): `emphasis` = pulse, heartbeat, shake,
  wobble, tada, jello, bounce, rubberBand, swing, headShake, pop, spin, flip, jump, squash, nudge, tilt, blink…;
  `emphasisAt` (clip-local s), `emphasisDuration`, `emphasisRepeat` (0 = loop), `emphasisInterval`, `emphasisAmount`.
  Fire one on the exact beat a sound hits ("tada" + `taDa`, "shake" + `impact`).
- **Camera motion** on any visual clip: `motion` handheld/breathe/float/sway/wiggle/shake/pulse/orbit/bob/spin/flicker.
- **Effects** on any visual clip: blur, brightness, contrast, saturate, hue, grayscale, crop, cornerRadius, shadow,
  blend, vignette (all keyframable).

### Sound (233 presets, each acoustically distinct — `scripts/check-sfx.ts` verifies no near-duplicates)
- **Music**: `music` with `style` (15 genres) × `mood` (14), `energy`, `intro`, `drop`, `outro`, part toggles,
  `variation`. One bed per act; end a bed with `tapeStop`/`scratchStop`/`downlifter` when the story breaks.
- **Families** (see `catalog({section:"index"})` for every key): transitions (whoosh family, flyBy, spinWhoosh,
  portal, rewind, suctionIn, risers/downlifters, bassDrop, cut…), UI (taps, clicks, toggles, modal, notification,
  purchase, confirm/deny, countdownBeeps…), foley (keys, doors, footsteps, paper, pen, scissors, bottlePop, coins,
  dice, cards, glassClink…), impacts (hits, kicks, booms, crash, explosion, anvil, taiko, braam…), cartoon (boing,
  slide whistles, bonk, poof, honk, splat, retro 8-bit set), sci-fi (lasers, teleport, powerUp/Down, forceField,
  scanner, servo, robotBlip, modem), nature (thunder, ocean, birds, fire, rain, crickets, wind), human (applause,
  cheer, ooh, laugh, clapping), tonal/stingers (chordHit, brassStab, orchestraHit, choirAah, kalimba, singingBowl,
  magicWand, gameShowCorrect/Wrong, rimshot, sadTrombone, taDa, stinger).
- One sound per visual hit; on repeats change `variation` (0–999), `pitch` (±1–3) and `tone`; pitch quick runs up a
  scale. End a riser exactly on its hit. Match the sound to the motion: a whoosh only for real movement — use
  impacts, foley, UI and tonal sounds for everything else.
- The mixer limits and soft-clips at −1 dBFS; still keep impacts at volume 0.7–0.9 and music at 0.55–0.75.

## 5b. Reels / Shorts / TikTok — what works
- **Make it loop seamlessly** (these platforms replay forever): the last frame must equal the first. End with a
  `revealMask` (`inverse: true`, circle, the accent color) that fully closes by the final frame, and start with the
  same `revealMask` (same color + origin, not inverse, `delay: 0`) opening over ~0.5 s. Pair the sound: a
  `suctionIn` stopping dead on the last frame, `popOut` at 0. Keep the music bed's `fadeOut` short (≤ 0.5 s, no `outro`).
- **Composition**: anchor the main blocks on the vertical centre line — headlines, terminals/code windows, browser
  or phone frames, numbers, logo, URL — and verify with `check`'s bboxes (left margin ≈ right margin). Then break
  symmetry *on purpose* with accents: a tilted sticker/badge (`tilt`) overlapping a frame corner, an arrow, a
  scribble. "Everything centred" and "everything slightly off" both look unintentional.
- **Plain words on screen**: say what the viewer gets, not internal names. "23 visual styles", not "23 art
  directions"; "quality check passed", not "check: 0 errors"; "animated graphics", not "components".
- **Proof beats claims**: real screen recordings of the product + a real result clip + verified numbers.
- **Length**: 25–35 s; hook in the first 1–2 s; a new device every 3–6 s; end card ≥ 3 s with the URL.
- **Recording the product** (Playwright `recordVideo`): sign in via `localStorage` (`cutroom.me`) before the page
  loads, inject a visible cursor (Playwright doesn't draw one), and mock anything private (`page.route`) — never
  record invite links, tokens, IPs or emails. Find the cut points by measuring per-second frame change on the
  recording (ffmpeg → raw gray → diff), then compress slow parts with the clip's `speed` (1.3–1.6).
- **Clicking in recordings**: click an object where nothing else overlaps it (the ship's hull, not under a big
  title) and verify afterwards that the right clip changed (`get_project`).

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

## 7b. Team, restore, hand-made graphics
- **Team server**: if `CUTROOM_URL` points elsewhere, you're on a shared server. Same tools; `import_media` uploads
  local files, and `export_video` downloads the result to `~/Downloads`. Never ask the user to restart it. If they
  want collaborators: tell them to click **Share** in the editor (one click: anyone anywhere, or same network — it shows
  the invite and the teammate command), or run `npm run team` / `npm run team -- --internet`. Give them the printed
  invite link and the teammate install line.
- **Restore**: when you finish, the delivered version is saved as "Claude's original". The editor's ↺ Restore resets
  to it, to any version, or to a `.cutroom.json` (each export writes one next to the video). Offer it when the user
  wants to start over after their own edits, instead of rebuilding.
- **Hand-made graphics**: users draw with the editor tools, which create `drawing` (path in canvas px, looks
  pen/marker/highlighter/neon/chalk/brush, `drawOn`), `shape` and `text` clips. You can create the same:
  `{"component":"drawing","props":{"path":"M400 300 Q500 200 600 300","style":"marker","color":"#ffd43b","width":12}}`.
  Use it for hand-drawn arrows, circles and underlines, alongside `scribble`.

## 8. Changes later
`get_project` first, edit in place (`setProps`, `updateClip`, keyframes), `check`, re-export. Never start over.

## 9. HTTP fallback (only if the MCP tools are unavailable this session)
Start the server if needed: `cd <cutroom folder> && (curl -sf localhost:4317/api/health || (nohup npm start > data/server.log 2>&1 &))`. For a team server send `Authorization: Bearer <invite code>` on every request.
```
POST /api/projects {name,width,height,fps}            → {id}         GET /api/catalog       GET /api/looks/roll?vibe=…
POST /api/projects/:id/lock {holder:"claude",holderName:"Claude",task}  (open http://localhost:4317/p/:id?name=<user>)
POST /api/projects/:id/media {path}                   → media        POST /api/projects/:id/ops {ops:[…],pace}  → results (+warnings)
POST /api/projects/:id/check {times?,audio?}          → {text}       POST /api/projects/:id/export {preset} → job; GET /api/jobs/:jid
DELETE /api/projects/:id/lock?holder=claude {summary}                GET /api/projects/:id/summary
```
Write ops to a JSON file with a script and POST them; read `results[].warnings` and `check.text` exactly as above.
