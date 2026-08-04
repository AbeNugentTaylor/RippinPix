# Handoff: Booster-pack opening animation ("The Plate Series")

## Overview
A standalone hero experience for a photography website. The visitor picks one of four pack
types, swipes across the crimped top of a 3D foil booster pack, the seal tears off left-to-right
and flies away, the pack drops out of frame, and eight "art cards" fly out and flip face-up into
a growing collection grid below. Opening more packs appends to the same collection, newest pack
on top, filterable by category.

## About the Design Files
The files in `reference/` are **design references written in HTML** — a working prototype of the
intended look, motion, and behavior. They are not production code to lift wholesale. The task is
to **recreate this experience in the target codebase's own environment** (React/Next, Vue, Svelte,
Astro, plain TS — whatever the site already uses) with its established patterns, then wire the real
photographs and links. If the site has no framework yet, plain TypeScript + three.js is entirely
sufficient; nothing here needs a UI framework except the card grid state.

`reference/Pack Opening.dc.html` is authored in a proprietary streaming-component format: the
markup between `<x-dc>…</x-dc>` is the template (holes are `{{ dotted.path }}`), and the
`class Component extends DCLogic` script is the logic (React class component semantics minus
`render()`; `renderVals()` returns the values the template interpolates). `reference/support.js`
is that runtime and is included only so the prototype opens in a browser — **do not port it**.
Read the file as: template = JSX, `renderVals()` = derived state/handlers.

## Fidelity
**High fidelity.** Colors, type, spacing, timings, and easings below are final and should be matched.
The one deliberately unfinished part is content: card titles/dates/media are placeholder copy, and
the card photographs are drag-and-drop placeholders (`<image-slot>`, prototype-only) that must be
replaced by real `<img>`/`next/image` elements fed from the site's photo data.

## Screens / Views

There is one page, with three phases of the same layout.

### 1. Masthead (always)
- Max width 1440px, centered, `margin-bottom: 40px`.
- Thick rule 5px `#201e1d`, then a row, then a 1px rule `#201e1d` (this is the only place rules are
  allowed — front-page furniture).
- Row: `display:flex; align-items:baseline; justify-content:space-between; gap:30px; padding:5px 0`.
  Three items, all 12px, `letter-spacing:.18em`, uppercase:
  left "THE PLATE SERIES" (weight 600), center "Sealed photographic art cards" (`#605d5d`),
  right the live count "N CARDS COLLECTED" (`#006786`); empty state "No cards yet".

### 2. Hero (phase: idle → tearing)
- `display:grid; grid-template-columns: minmax(280px,5fr) minmax(320px,6fr); gap:40px;
  align-items:center; min-height:62vh`. Max width 1440px.
- **Left column** (`display:flex; flex-direction:column; gap:20px; max-width:30ch`):
  - Kicker, 12px uppercase `letter-spacing:.18em`, `#aa0b56`: `Pack No. 01 · Landscape`
    (pack number zero-padded, then the selected category).
  - `h1` "Tear the seal." — Source Serif 4 600, `clamp(44px, 5.4vw, 86px)`, `line-height:.96`,
    `letter-spacing:-.015em`.
  - Blurb, 19px/1.5, `#444141`, per category: "Eight landscapes, sealed in foil and printed as
    art cards. Swipe across the crimped top to open the pack."
  - **Pack chooser** (idle only): label "CHOOSE A PACK" (11px uppercase `.18em`, `#7d7979`) over a
    wrapping flex row (`gap:10px`) of four buttons. Each button: 14px body font, padding `7px 13px`,
    `border-radius:2px`, `1px` border, and a 9px round dot in the category's ink.
    Selected = border in the category dot color, background `#eae7e7`, text `#201e1d`.
    Unselected = border `#d7d3d3`, transparent background, text `#605d5d`.
  - **Swipe hint** (idle only): "SWIPE RIGHT ACROSS THE SEAL" 13px uppercase `.16em`, `#006786`,
    pulsing `opacity .55 → 1` over 2.4s ease-in-out; beside it a 34×12 arrow SVG (1.6px stroke,
    `#0088b0`) translating 0 → 14px → 0 on a 1.6s `cubic-bezier(.4,0,.2,1)` loop. Below, 13px
    `#7d7979`: "Or tap the pack — keyboard: focus it and press Enter."
  - **After opening** (phase collected): 13px uppercase `.16em` `#aa0b56`
    "PACK 01 OPENED — 8 LANDSCAPE CARDS PULLED", then a primary button "Choose another pack"
    (design-system `.btn.btn-primary`: solid `#0088b0` fill, paper text, 2px radius; hover
    `#1186ac`, active `#006786`).
- **Right column**: the 3D stage — a focusable `div` (`role="button"`, `tabindex="0"`,
  `touch-action:none`, `cursor:grab`, `outline-offset:6px`), height `clamp(340px, 60vh, 640px)`,
  full width, holding the WebGL canvas. `transition: opacity 420ms ease` (it dims to .12 while the
  pack drops away and returns to 1).
  Under it, centered, width 56% (max 340px): a 2px track `#d7d3d3` with a `#d6006c` fill whose width
  is the tear progress (`transition: width 90ms linear`), and below it two 11px uppercase `.16em`
  `#7d7979` labels "Seal" / "Torn".

### 3. Collection (below the fold)
- Heading row: `h2` "The collection" (Source Serif 4 600, `clamp(24px,2.4vw,36px)`,
  `letter-spacing:-.01em`) + 12px uppercase `.18em` `#7d7979` meta "8 CARDS COLLECTED · 1 PACK OPENED".
  `gap:30px`, baseline aligned, `margin-bottom:30px`.
- Empty state: 17px italic `#7d7979` "Nothing pulled yet. Pick a pack above and tear it open."
- Filter chips (only once cards exist): wrapping flex `gap:10px`, `margin-bottom:30px`.
  13px, padding `5px 11px`, 2px radius, 1px border. Chips are "All N" plus one per category that has
  cards ("Landscape 8"). Active chip = filled with the chip tint (`#201e1d` for All, else the category
  dot color) and `#f8f4f4` text; inactive = border `#bab6b6`, transparent, text `#444141`.
- Grid: `display:grid; grid-template-columns:repeat(auto-fill, minmax(172px,1fr)); gap:30px 20px`.
  Cards are appended in draw order but each card carries `order: -packNumber`, so the newest pack
  renders in the first rows. Filtering hides non-matching cards with `display:none`.
  (Important: append + CSS `order` rather than prepending the array — prepending makes an
  index-keyed list reuse existing DOM nodes, which kills the entry animation of new cards.)

### Card (63 × 88 aspect — real trading-card proportions)
- Outer: `perspective:1400px; aspect-ratio:63/88; will-change:transform,opacity`.
- Inner: `position:relative; width:100%; height:100%; transform-style:preserve-3d`. This is what flips.
- **Front face**: `backface-visibility:hidden`, background `#f8f4f4`, `box-shadow:0 3px 10px rgba(45,43,43,.16)`,
  padding `7px 7px 0`, column flex.
  - Photo area: `flex:1; min-height:0`, background `#eae7e7`, photograph `object-fit:cover`, no radius,
    no treatment (the photographs are the point — do not halftone or CMYK them).
  - Caption block, padding `8px 2px 10px`, `gap:2px`:
    - 9.5px uppercase `.18em` in the category ink (`#006786` cyan, `#aa0b56` magenta for the press
      proof): "PLATE 04 · LANDSCAPE" (or "· PRESS PROOF").
    - Title: Source Serif 4 600, 14px, `line-height:1.15`.
    - Meta: 11px italic `#605d5d`: "2024 · Gelatin silver print".
- **Back face**: `backface-visibility:hidden; transform:rotateY(180deg)`, background `#eae7e7`, same shadow,
  padding 12px, `justify-content:space-between; align-items:center`.
  - Top and bottom: 8.5px uppercase `.2em` `#605d5d` — series title, and "SEALED".
  - Center: three 40px circles in cyan `#0088b0`, magenta `#d6006c`, process yellow `#edbb00`,
    `mix-blend-mode:multiply`, offsets `(0,4) (12,0) (6,13)` in a 54×54 box — a misregistered
    process-dot rosette.
  - After a card finishes flipping, the back is set to `visibility:hidden` (keeps html-to-image
    exports and screenshots faithful; also avoids backface artifacts in some browsers).

## Interactions & Behavior

### 3D scene (three.js r184)
- Renderer: `antialias:true, alpha:true`, `pixelRatio = min(devicePixelRatio, 2)`,
  `localClippingEnabled = true`. Sized to the stage element and kept in sync with a `ResizeObserver`.
- Camera: `PerspectiveCamera(30, w/h, .1, 100)` at `(0, 0, 12.6)`.
- Lights: ambient `#ffffff` 0.5; directional `#ffffff` 1.7 at `(4,7,9)`; directional `#bfe6f4` 0.7 at
  `(-7,-3,5)`; directional `#ffffff` 1.1 at `(-3,5,-7)`.
- Environment: a 256×128 canvas gradient (white → `#dfe7ea` → `#8fa4ad` → `#3d4548`, with one bright
  patch and one cyan patch) as an `EquirectangularReflectionMapping` texture — this is what makes the
  foil read as foil.
- Model: `assets/booster_pack_tcg_pack.glb` (Sketchfab, "Booster Pack (TCG Pack)" by Hasan Ajami,
  **CC-BY-4.0 — attribution required somewhere on the page or in the site credits**). Two meshes:
  `Object_4` = the foil body (crimped top, zigzag bottom), and a front plane that takes the pack art.
  Model bounds after load: x ±2.03, y −3.35…3.27, z −0.09…0.16.
- Materials (replace the GLB's own): foil = `MeshStandardMaterial({ metalness:.92, roughness:.24,
  side:DoubleSide, transparent:true })` in the category foil color; pack art = `MeshStandardMaterial
  ({ map: artTexture, metalness:.05, roughness:.78, side:DoubleSide, transparent:true })`.
- Pack art texture: a 700×1024 canvas drawn at runtime — paper `#f3f2f2`; a halftone dot field fading
  from the top (dots in cyan, magenta for the Portrait pack); a 6px/1.5px rule pair with the series
  title in 26px 600 caps with 6px letter-spacing; three lines of 96px 600 serif ("Eight / land- /
  scapes"); a 40px italic subtitle in the category ink; a six-spoke registration star target with a
  26px circle at (560,300); a bottom rule with "DO NOT BEND" in 22px caps. `flipY:true`,
  `colorSpace: SRGB`. Cache one texture per category.

### The tear (the core mechanic)
The pack never moves during the tear — **the camera does the tilting** (`root.rotation` follows the
pointer, ±0.42 rad on Y, ±0.24 on X, plus a slow sine breathe and a 0.07 amplitude bob). This matters
because clipping planes are world-space.

Three copies of the model are in the scene, each with its own cloned materials and clipping planes:
| Group | Clipping | Role |
| --- | --- | --- |
| body | `y < 2.89` | the pack below the tear line |
| stay | `y > 2.89` and `x > xb` | the part of the seal not yet torn |
| fly | `y > 2.89` and `x < xb` | the torn strip, which lifts and peels |

`xb = -2.12 + p * 4.38` where `p` is tear progress 0→1. Each frame, every plane is recomputed as
`plane.copy(basePlane).applyMatrix4(group.matrixWorld)` so the boundaries follow the group's own
transform (this is what lets the torn strip move without smearing the cut).
`p` chases its target with `p += (target - p) * 0.22`.

While tearing, `fly` sits at `position(p*0.1, p*0.42, p*0.75)` and
`rotation(-p*0.6, 0, -p*0.16)` — the corner peels up toward the viewer.

**Input**: pointerdown on the stage starts a drag; progress = `dx / max(190, stageWidth * 0.62)`.
Release below 0.62 springs back to 0; at or above 0.62 it completes. A tap (movement < 6% and under
320ms) or Enter/Space on the focused stage auto-tears (`p` eased `k²` over 420ms).

**Opening sequence** (timings are the felt rhythm — keep them):
1. `max(180, (1-p) * 620)` ms — the remaining seal peels to fully torn (ease-out quad).
2. 680ms — the strip launches: `x: .1→2.7`, `y` an arc (`+2.4k − 2.9k²`), `z: .75→2.95`,
   `rotation.x −0.6→−3.2`, `rotation.y 0→1.2`, `rotation.z −0.16→−1.06`; opacity fades over the
   last 45%; then `visible = false`.
3. +380ms — the pack drops: 620ms ease-out, `y −0.15 → −2.35`, `rotation.z 0→0.16`,
   `scale 1→0.88`, materials fade out over the last 65%; the stage element dims to opacity .12.
4. +620ms — cards deal.

### Card deal
- Capture the pack's anchor point in **page coordinates**: stage center X, 44% down its height, plus
  `scrollX/scrollY`. Measure each card's center the same way. Viewport coordinates break here: the
  grid grows and the page scrolls between the two measurements, and the cards then start at their
  destination (this was a real bug).
- Each new card starts (no transition) at
  `translate(dx, dy) scale(.34) rotate((i - (n-1)/2) * 4deg)`, `opacity:0`, inner `rotateY(180deg)` —
  i.e. small, at the pack, showing its back.
- Then, per card with an 80ms stagger:
  - outer: `transform 660ms cubic-bezier(.17,.89,.24,1.03) {80i}ms` to `none`,
    `opacity 180ms linear {80i}ms` to 1.
  - inner: `transform 460ms cubic-bezier(.2,.85,.3,1) {80i + 240}ms` to `none` — the flip lands
    just after the flight.
  - at `{80i + 760}ms`, hide the back face.
- 340ms after dealing starts, smooth-scroll so the grid top sits 220px below the viewport top — late
  enough that the flight is still visible.
- Phase becomes `collected` at `n * 80 + 1000`ms.

### Opening another pack
Returns to the chooser: reset progress to 0, restore the three groups (visible, opacity 1, scale 1,
rotation 0), increment the pack number, smooth-scroll to top, and slide the pack up from
`y = −3.6` to `−0.15` over 620ms ease-out cubic while un-yawing from −0.5 rad.
The card filter resets to "All" whenever a pack is dealt.

### Accessibility
The stage is a focusable `role="button"` with an aria-label ("Booster pack — swipe right across the
top to open") and opens on Enter/Space. Focus ring is the design system's
`:focus-visible { outline: 2px solid #0088b0; outline-offset: 2px }`. Consider honoring
`prefers-reduced-motion` by skipping the tear/flight and revealing the cards directly — the prototype
does not do this yet.

## State Management
- `phase`: `idle | tearing | dealing | collected` — drives which hero copy shows and blocks input.
- `packNo`: integer, starts at 1; also the CSS `order` of that pack's cards (`-packNo`).
- `seriesId`: selected pack type; changing it while idle re-tints the foil and swaps the pack-art texture.
- `cards[]`: appended per pack. Each card: `{ key, order, seriesId, slot, plate, tier, ink, title,
  date, medium }`. `plate` is the pool index + 1 zero-padded; `tier` is the category name, or
  "Press proof" for the last card of every pack (magenta ink).
- `filter`: `all` or a category id.
- Draw logic: each category has its own pool of 10 plates; a pack takes the next 8 by
  `(alreadyDrawnInThisCategory + i) % pool.length`, so a second pack of the same category shows
  different plates before repeating.
- Non-render refs: the three.js renderer/scene/camera/groups, tear progress `p`, and the pointer
  drag state. Progress is written straight to the progress-bar element, never through render state —
  re-rendering the whole grid on pointermove is too expensive.
- Data to fetch in the real site: the photograph for each plate (and ideally a link to its full
  gallery entry). Everything else is static config.

## Design Tokens (Broadsheet — `assets/broadsheet-styles.css`, guide in `assets/broadsheet-readme.md`)
- Ground `#f3f2f2`; surface `#eae9e9`; ink `#201e1d`.
- Cyan accent `#0088b0` (ramp 100–900: `#e9f8ff #cbeeff #99e0ff #62c5ee #38a6cf #1186ac #006786
  #004961 #0a303e`) — interactive elements. Body-size text in cyan uses `#006786`.
- Magenta accent `#d6006c` (ramp: `#fff1f4 #ffdee6 #ffc0d0 #ff90b1 #ff458e #d82071 #aa0b56 #790e3d
  #4b1528`) — the rarer second spot color.
- Neutrals: `#f8f4f4 #eae7e7 #d7d3d3 #bab6b6 #9b9797 #7d7979 #605d5d #444141 #2d2b2b`.
- Process yellow `#edbb00` — print treatments only, never chrome.
- Type: Source Serif 4 for everything, headings 600, body 400, true italic for emphasis. No sans-serif.
- Spacing scale: 5, 10, 15, 20, 30, 40px. Radii: 1, 2, 4px. Shadows: `0 1px 2px rgba(45,43,43,.14)`,
  `0 3px 10px rgba(45,43,43,.16)`, `0 12px 32px rgba(45,43,43,.22)`.
- Pack foils by category: Landscape `#004961`, Portrait `#790e3d`, Architecture `#0a303e`,
  Still life `#201e1d`. Category dots/inks: `#0088b0`/`#006786`, `#d6006c`/`#aa0b56`,
  `#38a6cf`/`#006786`, `#201e1d`/`#444141`.
- Layout: left-aligned and asymmetric, no boxes or dividers between sections — whitespace does the
  organizing. The masthead rules and the card faces are the only enclosed shapes.

## Assets
- `assets/booster_pack_tcg_pack.glb` — the pack model. Sketchfab "Booster Pack (TCG Pack)" by
  Hasan Ajami, **CC-BY-4.0**; attribution is required.
- `assets/broadsheet-styles.css`, `assets/broadsheet-readme.md` — the design system's tokens and rules.
- Fonts: Source Serif 4 (Google Fonts) — ital + weights 400/600/700.
- three.js r184, loaded in the prototype from `https://esm.sh/three@0.184.0` plus
  `examples/jsm/loaders/GLTFLoader.js`. In a real build, install `three` and import normally.
- Photographs: none included. The prototype uses `<image-slot>` placeholders keyed
  `<categoryId>-<plateIndex>`.

## Files
- `reference/Pack Opening.dc.html` — the whole design: template + logic (three.js scene, tear, deal).
- `reference/support.js` — prototype runtime only, so the file opens in a browser. Do not port.
- `reference/image-slot.js` — the drag-and-drop photo placeholder used in the prototype. Replace with
  real images.
