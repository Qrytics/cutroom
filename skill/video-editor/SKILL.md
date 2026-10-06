---
name: video-editor
description: Make or edit a video live in Cutroom, the user's collaborative editor, so they can watch every cut, title, animation and sound effect land on a real timeline and then edit any of it by hand. Handles any material — screen recordings, camera/phone footage, images, logos, audio, plus code-built motion graphics (titles, lower thirds, code typing, terminals, charts, captions, callouts, cursors) and a synthesized soundtrack (music bed + SFX). Use whenever the user asks to "make me a video", "cut a video/clip/reel/compilation/montage", "edit this footage", "add captions/titles/sfx", "make a teaser/demo/launch/recap video" from any project, or asks to change a Cutroom project. Prefer this over motion-video unless the user explicitly wants the code-only motion-video pipeline.
---

# Video editor (Cutroom)

Cutroom is a collaborative video editor at `~/gitProjects/cutroom`. You edit through the `cutroom` MCP tools; every op
appears live in every open editor window (the user is watching), and everything you make stays a normal, editable clip
with props, keyframes and effects. While you hold the lock, humans are view-only; when you finish they can change anything.

If the `cutroom` tools are missing, tell the user to run (once):
`claude mcp add -s user cutroom -- ~/gitProjects/cutroom/node_modules/.bin/tsx ~/gitProjects/cutroom/apps/mcp/src/index.ts`
The tools start the editor server on their own (http://localhost:4317).

## 0. Ask only what you can't decide
- **Format**: landscape 1920×1080, reel 1080×1920 (Reels/TikTok/Shorts), square 1080×1080 — and rough length.
- **Footage**: which files/folders to use, or whether to record the product (see §3). Real logos only — never redraw a trademark.
- Everything else (story, pacing, music mood, sfx, graphics) is your call. Decide, build, let them tweak.

## 1. Gather
- Read the project the video is about (README, landing page copy, package.json, screenshots, demo recordings) to pull
  real names, numbers, code and claims. Show only verified facts; paste real code/output into `codeTyping`/`terminal`.
- `catalog` once per session: component keys, every prop + default, sfx presets, text animations, easings.
- `list_projects` → reuse the user's project if they named one (`get_project` to re-orient), else `create_project`.

## 1b. Pick an art direction — every video gets its own identity
- Call `design_direction({vibe})` once per **new** video (vibe = a few words from the brief + the product's category:
  "calm AI note-taking app", "loud streetwear drop", "B2B data platform explainer"). It skips the looks used by the
  last 6 projects and returns a concrete direction: palette, font pairing, shading, texture, background style, text /
  transition / camera motion, music style + mood + variation, an sfx kit, and `recipes` (ready props for background,
  title, headline, body, lowerThird, captions, logo, code, wipe, texture, particles, music). Record it right away:
  `{op:"setMeta", look:"<key>", background:"<palette.bg>"}`.
- If the product has a brand (colors/fonts on its site, logo), keep the direction's *structure* but swap in the brand
  palette and closest fonts. If the user names a style ("make it retro", "like Apple"), pass that as `vibe`, or pick
  a look by key from `catalog.looks`.
- Follow its `rules` for the whole video: only its palette, only its fonts, its shading on headlines, its texture as a
  full-length `overlay` on the top track, its camera `motion` on footage. A video that mixes three looks is slop.
- Editing an existing project: keep its `meta.look` — don't re-roll.

## 1c. Don't make copy-paste slop
These are the tells of a templated video. Check the storyboard against them before building:
- **Everything centered, same size.** Vary composition: left-aligned headline with a stat on the right, huge word
  cropped off-frame, small label top-left, text over the lower third of footage. Use `x`/`y`/`anchorX` and `align`.
- **Every scene is "title + subtitle, fade".** Each scene should use a different device. Rotate across
  kinetic type, word cycles, block reveals, split-flap, highlighter, quotes, charts, flow diagrams, chat bubbles,
  notifications, phone/browser mockups, code/terminal, comparison tables, counters, timelines, scribbles and callouts.
  A 30–60 s video should use ≥ 6 different components besides background/text.
- **One text animation everywhere.** Rotate the direction's `textIn` set; never the same entrance on two consecutive
  text clips. Vary `stagger`. Use a `loop` (float/wave/shimmer/glow) on text that stays up longer than ~2 s.
- **Same transition on every cut.** Mix hard cuts (most cuts!), the direction's two clip transitions, and its section
  wipe only between major sections (2–3 per video).
- **Uniform rhythm.** Mix 0.4–0.8 s punch shots (kinetic words, stats) with 3–5 s breathers. Cut on the beat.
- **Flat, depthless frames.** Build 3–5 layers: background → `gradientOrb`/`particles` (subtle) → content →
  accents (`burst`, `scribble`, `callout`) → `overlay` texture. Give footage `motion` (handheld/breathe) or a slow push.
- **Static holds.** Something moves every 1–2 s: a keyframed drift (x ±30 px, scale 1→1.04) on anything held.
- **Sound wallpaper.** One sfx per visual hit from the direction's kit; vary `variation` and `pitch` on each repeat;
  vary `tone`. Silence before a big hit is a tool. Set the music `drop` to the main reveal, `intro` to the hook
  length, and put a `riser`/`reverseSwell` ending exactly on the drop.
- **Default props.** Never ship a component on its defaults. Set the content, the direction's colors and fonts, and
  at least one style/variant prop.

## 2. Plan before touching the timeline
Write a short storyboard in chat: scenes with start/end seconds, what's on screen, which sounds hit where.
- Typical arc: hook/logo (3–6 s) → problem → product/how it works → proof (numbers, demo) → result → end card (3–4 s).
- Something should move every 1–2 s. Cut on the beat (`analyze_media` on the music/footage gives `beats`).
- Talking-head footage: `analyze_media` → `silences`; split around them and ripple-delete the dead air.

## 3. Footage
- `import_media` with absolute paths. Videos of any codec work (converted automatically); images, GIF, SVG, audio too.
- Screen recordings of a live site: record with Playwright (`page.video` or the motion-video skill's `capture.mjs`
  approach with a scripted cursor), then import the .webm. Put `browserFrame` above it and `cursor`/`callout` on top;
  add `click`/`typing` sfx at the action times.

## 4. Build — `begin_editing` first, then in passes
1. `begin_editing({project, task})` → takes the lock, snapshots a version, opens the editor in their browser.
2. Build **one scene per `edit` call** (5–25 ops) so the user sees it grow scene by scene. Give every clip a readable
   id (`intro_bg`, `title_1`, `whoosh_2`) and a `name` — that's what the user sees on the timeline.
3. Pass order: structure (backgrounds, footage, cuts) → text & graphics → transitions → sound → polish (keyframes).
4. Layering: `addClip` without `trackId` auto-picks a free track; name tracks explicitly when order matters
   (`trackId: "bg"`, `"footage"`, `"graphics"`, `"titles"` — visual tracks created later draw on top unless you set `order`).

### Recipes
```jsonc
// recipes come from design_direction — merge them, then set content
{"op":"setMeta","look":"<direction.look>","background":"<palette.bg>"}
{"op":"addClip","id":"bg1","type":"component","component":"background","start":0,"duration":45,"trackId":"bg","props":{...recipes.background.props}}
{"op":"addClip","id":"tex","type":"component","component":"overlay","start":0,"duration":45,"trackId":"texture","props":{...recipes.texture.props}}
{"op":"addClip","id":"t1","type":"component","component":"title","start":0.4,"duration":4,"name":"Hook","props":{...recipes.title.props,"kicker":"Introducing","text":"Cutroom","subtitle":"Edit videos with Claude"}}
{"op":"addClip","id":"sw1","type":"sfx","component":"whoosh","start":0.3,"duration":0.9}
// footage with Ken Burns push-in + fade in/out
{"op":"addClip","id":"demo","type":"video","mediaId":"m_…","start":6,"inPoint":3.2,"duration":8,"props":{"fit":"cover","transitionIn":"fade","transitionOut":"fade"}}
{"op":"setKeyframes","id":"demo","prop":"scale","keyframes":[{"t":0,"v":1,"ease":"linear"},{"t":8,"v":1.12}]}
// music bed under everything, ducked under any clip marked voice
{"op":"addClip","id":"music","type":"sfx","component":"music","start":0,"duration":45,"trackId":"music","props":{...recipes.music.props,"intro":3.5,"drop":14}}
// word-by-word captions for a voice clip
{"op":"addClip","id":"cap1","type":"component","component":"captions","start":12,"duration":5,"props":{"text":"0|Every\n0.4|edit\n0.7|lands\n1.1|live","style":"highlight"}}
```

### Toolbox (all in `catalog`; every option is a prop, so everything stays editable)
- **Text devices**: `title` (layout classic/stacked/boxed/outline/split/editorial/huge), `text`, `kineticType`, `wordCycle`,
  `blockReveal`, `splitFlap`, `highlighter`, `quote`, `marquee`, `captions` (12 styles), `lowerThird` (7 variants),
  `logoReveal` (7 styles), `countdown`, `checklist`.
- **Text motion**: 26 entrances (maskUp, scramble, stamp, tracking, charsPop, waveIn, glitchIn, flipUp, splitIn…),
  17 exits, plus a `loop` while settled (float/wave/pulse/jitter/shimmer/glow). Per-word/char `stagger`.
- **UI & social**: `chatBubbles`, `notificationToast`, `socialPost`, `searchBar`, `button`, `phoneFrame`, `browserFrame`,
  `cursor`, `callout`, `spotlight`, `codeTyping`, `terminal`.
- **Data**: `counter`, `barChart`, `lineChart`, `donutChart`, `comparison`, `timelineSteps`, `flowDiagram`, `progressBar`.
- **Depth & texture**: `background` (19 styles: mesh, aurora, perspectiveGrid, topo, paper, halftone, starfield…),
  `gradientOrb`, `particles` (9 kinds), `overlay` (grain/scanlines/lightLeak/vhs/letterbox/halftone/filmBurn/chromatic/crt),
  `burst`, `scribble`, `shape` (13 shapes incl. morphing blob), `confetti`.
- **Transitions**: 28 clip transitions (iris, whip, blinds, split, diagonal, flip, glitch, zoomBlur, drop, swing…);
  section wipes `shapeWipe` (9 styles), `stripeWipe`, `glitchTransition`, `flash`.
- **Camera motion** on any visual clip: `motion` = handheld/breathe/float/sway/wiggle/shake/pulse/orbit/bob/spin/flicker,
  with `motionAmount`, `motionSpeed`. Handheld or breathe on footage and screenshots instantly kills the "static slide" look.
- **Eases**: add spring, snap, anticipate, quintOut, sineInOut, backInOut to the classics.

### Sound
- **Music bed**: `music` with `style` (ambient, lofi, house, synthwave, trap, cinematic, corporate, dnb, chiptune, piano,
  minimal, funk, orchestral, garage, indie) × `mood` (14), `energy`, `intro` (= hook length), `drop` (= the main reveal
  second: build, a beat of silence, then full band), `outro`, part toggles, `swing`, and `variation` (new melody,
  progression and fills). Use the direction's style/mood/variation; never reuse last video's combo.
- **SFX (71)**: transitions (whoosh, whooshHit, swish, riser, downlifter, reverseSwell, sweepUp, warp, tapeStop,
  vinylScratch, zap, glitch, airPuff), UI (click, pop, blip, bloop, bubble, toggle, swipe, hover, success, error, coin,
  levelUp, send/receiveMessage, notification…), foley (snap, clap, keyboardClack, typing, mouseScroll, slam, heartbeat),
  impacts (impact, punch, subDrop, braam, taiko, boom, thud, gong, metalClang, glassTing, cymbal, drumroll), tonal
  (chime, ding, sparkle, magic, harp, piano chords, `stinger` in the music's mood/key), textures (roomTone, vinylCrackle,
  wind, rain, cityHum, crowdCheer, drone).
- One sound per visual hit, from the direction's kit. On repeats change `variation` (0–999) and `pitch` (±1–3), and vary
  `tone`. Pitch quick runs of pops up a scale (0, 2, 4, 5, 7…). Line a `riser`/`reverseSwell` end up exactly on a hit;
  `whooshHit` lands its impact 1.1 s before its clip end. A low `roomTone`/`vinylCrackle` texture glues quiet scenes.
- Give a logo end card a `stinger` (kind epic/success/magic) in the music's mood instead of the same chime every time.

### Layout rules
- Titles 90–160 px, body 40–60 px, code 30–36 px mono (landscape). Keep 80 px+ margins.
- **Reels (1080×1920)**: keep text/faces out of the bottom ~25% and the right ~15% (app UI); captions at `yOffset` ≈ 250–450.
- Animate with keyframes on any numeric/color prop (x, y, scale, rotation, opacity, blur, colors…).

## 5. Check your work
- `screenshot` at key moments (mid-animation and settled) — read them. Look for clipped/overlapping text, empty frames,
  unreadable contrast, things in the reel UI zones, wrong media fit.
- `contact_sheet` for the whole-video rhythm. Fix with `setProps` / `updateClip` / keyframes; don't rebuild from scratch.
- `get_project` shows the exact timeline if you lose track.

## 6. Finish
- `finish_editing({project, summary})` — always, even if you stop early, so the user gets their editor back.
- Tell the user: the editor URL, what you built scene by scene, and that every clip/title/sound/keyframe is editable
  (click it → Inspector; drag/trim on the timeline; ⌘Z; Versions → "Undo Claude's last run").
- Offer `export_video` (`mp4` final, `draft` quick review, `prores` for other editors, `gif`). Report the file path.
- If the user later asks for changes, `get_project` first and edit in place — don't start over.
