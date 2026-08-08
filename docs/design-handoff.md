# Handoff v2: Booster-pack opening — "Discount bin"

**This replaces the v1 handoff.** If you already implemented v1 (four packs, broadsheet-white
layout, pack chooser buttons), read *§0 Resync* first — it lists exactly what changed and what
can stay.

---

## 0. Resync: what changed since v1

| Area | v1 (implemented) | v2 (this bundle) |
| --- | --- | --- |
| Pack selection | Four buttons in the left column | A 3D **cardboard discount bin** holding every pack; you click a pack in the bin |
| Catalogue | 4 categories × 5 packs, hardcoded | **18 categories**, each with its own `packs:` count — one data list drives everything |
| Pack faces | Broadsheet-style printed label (halftone, rules, "DO NOT BEND") | **Photocopied zine covers**: flat colored stock, hand-drawn wobbly frame, marker title |
| Page skin | Light paper `#f3f2f2`, quiet editorial | Dark thrift-shop: wood ground `#17110f`, yellow/pink slapped signage, crooked type |
| Camera | Fixed, pack centered | Camera framed from bin size + row count; responsive re-layout on resize |
| Tear mechanic | — | **Unchanged.** Clipping-plane tear, launch, drop, card deal all carry over verbatim |
| Card grid | Unchanged structure | Same grid/flip/stagger; card chrome restyled (tape strip, price tag, tilt) |
| Progress bar | Track under the stage | Removed — a cyan arrow indicator at the tear line replaces it |

**Practical resync order:** (1) swap the catalogue for the new `DESIGNS` data shape, (2) build the
bin scene + pack pull-out, (3) restyle page chrome and pack-art texture, (4) leave your tear/deal
code alone except for the two bug fixes noted in §6.

---

## Overview
A standalone hero experience for a photography site. A grubby cardboard box sits on a wood floor,
stuffed with sealed booster packs — each pack is one photo series. The visitor clicks a pack; the
box slides back out of the way while the pack lifts out and comes to the front, big. They swipe
across its crimped top; the seal tears off left-to-right and flies away, the pack drops, and eight
art cards fly out and flip face-up into a growing collection grid below. Every photograph in the
run lives in exactly one pack — emptying the bin means seeing the whole catalogue.

## About the Design Files
`reference/` holds **design references written in HTML** — a working prototype of look, motion and
behavior. Not production code. Recreate the experience in the target codebase's own environment
(React/Next, Vue, Svelte, Astro, plain TS) using its patterns, then wire real photographs.

`reference/Pack Opening - Discount Bin.dc.html` is authored in a proprietary streaming-component
format: markup between `<x-dc>…</x-dc>` is the template (holes are `{{ dotted.path }}`), and
`class Component extends DCLogic` is the logic (React class-component semantics minus `render()`;
`renderVals()` returns what the template interpolates). Read template = JSX, `renderVals()` =
derived state + handlers. `reference/support.js` is the prototype runtime — **do not port it**.
`reference/Pack Opening.dc.html` is the v1 design, kept only for diffing against your current build.

## Fidelity
**High fidelity** for layout, color, type, timings, easings. Content is deliberately unfinished:
card titles/dates/media are generated placeholder copy, and photographs are drag-and-drop
placeholders (`<image-slot>`, prototype-only) to be replaced with real `<img>`/`next/image`.

---

## 1. The catalogue (the part the client tunes)

One array at the top of the logic drives run size, colors, cover art, and card copy. `packs` is the
only number anyone needs to touch: 8 photos per pack, so `packs: 3` → 24 photographs in that series.

```js
const PER_PACK = 8;
const DESIGNS = [
  { id: "leaks", name: "Cheeky light leaks", packs: 2,
    stock: "#f9a17a",        // zine cover paper
    foil:  "#8a2f14",        // the pack's plastic tint
    ink:   "#7a2a12",        // caption ink on that series' cards
    art: ["Cheeky", "light", "leaks"],   // cover title, one line each
    sub: "the roll went wrong, nicely",  // cover tagline
    subjects: [ …10 strings… ],          // card-title generator
    conds:    [ …8 strings… ] },
  …
];
```

Optional flags: `limited: true` prints a scrawled **LIMITED RUN** banner on the cover;
`locked: true` prints **KEEP OUT** (currently cosmetic — Portraits is meant to become
password-gated; not implemented).

Derived, nothing else to maintain:

```js
const TOTAL_PACKS  = DESIGNS.reduce((n, d) => n + d.packs, 0);        // 32 in the current draft
const POOLS        = per-series list of packs*8 plates, title = `${subject}, ${cond}`,
                     date 2019+((k*5+di)%7), medium cycled from MEDIA[]
const PLATE_OFFSET = running start index per series → global plate numbers
const PACKS        = flat list; each { id, design, designIdx, name, from, slot }
plateAt(pack, i)   → { plate: PLATE_OFFSET[series] + pack.from + i + 1, info }
```

Current draft: 18 series, 32 packs, 256 photographs.
Counts as drafted — leaks 2, objects 3, landscapes 3, flowers 2, wife 2, animals 2, plants 2,
Austin 2, Weihnachten 1, the boys 2, MKE 2, cars 1, Josie 1, Hong Kong 1, Shanghai 1, Vienna 2,
European dreams 2, portraits 1.

In a real build these become CMS/config records; `subjects`/`conds` disappear once real photo
titles exist.

---

## 2. Page layout

Dark ground, max width 1500px per section, page padding `var(--space-6) var(--space-8) var(--space-8)`.

Background (on the page wrapper, `min-height:100vh`, `background:#17110f`):
```
radial-gradient(ellipse 50% 34% at 10%  6%, rgba(237,187,0,.12),  transparent 68%),
radial-gradient(ellipse 44% 30% at 90% 14%, rgba(214,0,108,.18), transparent 70%),
radial-gradient(ellipse 46% 34% at 76% 92%, rgba(56,166,207,.13), transparent 70%),
repeating-linear-gradient(3deg, rgba(97,60,28,.11) 0 26px, rgba(20,14,12,.13) 26px 54px)
```

**Masthead** — 9px process-yellow bar `rotate(-.4deg) skewX(-.6deg)`; row with shop name (heading
700, `clamp(22px,2.4vw,34px)`, uppercase, yellow block, `rotate(-1.4deg)`, `box-shadow:4px 4px 0`
magenta), centre italic 15px `cash only · no refunds · no regrets`, right a pink count chip
(12px `.18em` caps, `rotate(-2.4deg)`, yellow tape flake behind it); then a 3px neutral rule
`rotate(.28deg)`.

**Headline row** — left column max 44ch:
- bin phase: h1 "Dig through the bin." `clamp(34px,4.4vw,66px)`, `line-height:.92`, uppercase,
  `rotate(-.6deg)`; 17px/1.45 blurb "N packs in there, M photographs total, every one in exactly
  one pack. Pull a pack out, rip it open. Empty the bin, you've seen the whole run."
- idle (pack in hand): h1 "Rip it open."
- collected: h1 `{pulledLine}` = "Eight <series> in the bag."
Right column: yellow "Everything Free" sign `rotate(-3.2deg)` with an inverted italic
"yes really" tag; below it 12px caps bin count.

**Stage** — focusable `div`, `role="application"`, `tabindex="0"`, `touch-action:none`,
height `clamp(380px, 66vh, 760px)`, full width, holds the WebGL canvas. Cursor: `default` in the
bin, `pointer` over a hoverable pack, `grab` when a pack is out front.
When every pack is opened, a double-bordered yellow "Bin's empty" stamp overlays it at 42% height.

**Action row** — "Rather not dig:" · **Just grab me one** (pink block button, `rotate(-1.6deg)`,
hover yellow, active nudges 2px into its shadow) · italic "or click any pack in the bin — they're
all Free" · **Put it back** (dashed outline, shown while a pack is out) · **Back to the box**
(yellow block, shown after opening) · right-aligned "No refund on merchandise" stamp
`rotate(2.4deg)`.

**The haul** — h2 "The haul" + meta; empty state italic "Nothing yet. The bin's right there.";
filter chips (All N, then one per series with cards, tinted with that series' `stock`, `tilt`
±1deg); grid `repeat(auto-fill, minmax(172px,1fr))`, gap `var(--space-6) var(--space-4)`.

### Card (63 × 88)
Outer `perspective:1400px; aspect-ratio:63/88; order:-packNumber; will-change:transform,opacity`;
a static `rotate({tilt}deg)` wrapper (±2deg); inner `preserve-3d` flips.
- Front `#f8f4f4`, `box-shadow: var(--shadow-md)`, padding `7px 7px 0`: photo area `flex:1`,
  `object-fit:cover`, no treatment (the photographs are the point); caption block 8px/2px/10px —
  9.5px `.18em` caps in the series ink "No. 014 · Flowers" (or "Bent corner" for the last card of
  each pack), title Source Serif 4 600 14px/1.15, meta 11px italic "2024 · Gelatin silver print".
  A yellow tape strip (42×15, `rgba(237,187,0,.5)`, `rotate(-3deg)`) sits at top-left, and a small
  price tag chip at top-right (`rotate(4deg)`, tint `#edbb00` for the bent-corner card else
  `#7de08a`).
- Back `#eae7e7`: shop name / three 40px CMY circles with `mix-blend-mode:multiply` at offsets
  (0,4) (12,0) (6,13) in a 54×54 box / "Free · as-is". Hidden (`visibility:hidden`) once flipped.

---

## 3. The bin scene (three.js r184)

Renderer `antialias:true, alpha:true`, `pixelRatio min(dpr,2)`, `localClippingEnabled = true`,
`shadowMap.enabled = true` (PCFSoft). Camera `PerspectiveCamera(34, w/h, .1, 200)` — position is
computed, see `frameCamera`. Lights: ambient `#ffffff` .55; key `#ffffff` 1.8 at (6,12,11) casting
shadows (1024² map, ortho ±18); fill `#bfe6f4` .6 at (-9,-2,7); rim `#ffffff` 1.0 at (-4,6,-9).
Environment = 256×128 canvas gradient (white → `#dfe7ea` → `#8fa4ad` → `#3d4548` + one bright and
one cyan patch) as `EquirectangularReflectionMapping` — this is what makes the foil read as foil.

**The box** is built from `BoxGeometry` panels: board thickness `0.26`, wall height `4.4`,
base at `y=-4.05`, four walls at `y=-2.0`. Four flaps hinge at the wall top edge
(`TOP = -2.0 + WALL/2`) and fold *outward past horizontal*: long flaps `rotation.x = ±1.12`,
length `min(depth*0.36, 2.5)`; side flaps `rotation.z = ±1.3`, length `min(width*0.17, 2.3)`.
A `ShadowMaterial` plane (opacity .16) at `y=-4.34` catches the shadow and is parented to the box
so it can never clip the focal pack. Box group: `rotation.y = -0.035`, `position.y = 0.2`, inside
an outer "stage" group used for the slide-away.

Cardboard texture: a 2048×256 canvas — kraft base, vertical corrugation stripes every 6px, 34
blotch gradients, two water rings, 44 scuffs, a soft top lip, bottom shading, one packing-tape
strip. The outward-facing wall additionally gets **FREE** in 156px Permanent Marker with an ink
bleed pass, a wobbly double underline, and a stray tick. Face material order for the front wall is
`[card, card, cardDark, cardDark, sign, cardDark]` (BoxGeometry order +x −x +y −y +z −z).

**Responsive layout** (`ResizeObserver` on the stage):
```
cols = aspect < .72 ? 2 : aspect < 1.05 ? 3 : aspect < 1.62 ? 4 : 5
rows = ceil(TOTAL_PACKS / cols)
binSize = { width: cols*4.3 + 2.9, depth: rows*1.5 + 3.4 }        // COL_GAP 4.3, ROW_GAP 1.5
```
`frameCamera(width, depth, aspect, rows)`: `pitch = min(.86, .3 + rows*.062)` (deeper bins look
down harder), `vExtent = depth*(.5 + pitch*.55) + 9.5`,
`dist = max((width/2)/tan(hFov/2), (vExtent/2)/tan(vFov/2)) * 1.03`, camera at
`(0, dist*pitch/‖(1,pitch)‖ + 1.4, dist/‖(1,pitch)‖)` looking at `(0, -1.3, -depth*0.08)`.
It also sets `COUNTER.rx = -atan(pitch) * .94` so the focal pack squares up to the camera.

Slot placement, with deterministic jitter `jit(a,b,span)` (hashed sine, ±span):
```
x  = (col - (cols-1)/2) * 4.3 + jit(row+salt, col, .7)
y  = -0.34 + jit(col+salt, row, .12) + row*0.05
z  = ((rows-1)/2 - row) * 1.5 + jit(row+3, col+salt, .18)
rx = -0.34 + jit(row+salt, col+5, .06);  ry = jit(row+9, col+salt, .26);  rz = jit(row+salt, col+11, .14)
```
On every re-layout the slot *assignment* is reshuffled (Fisher–Yates seeded by
`salt = round(aspect*7)`) so the bin visibly re-jumbles; each pack tweens to its new slot over
460ms with a `(n % 5) * 40ms` stagger. First layout snaps without tweening.

**Packs in the bin** are cheap clones ("plain" rigs) sharing one material set per series. Hover is
raycast against them: `hover` eases toward 1 and lifts the pack `y + hover*0.95`, `z + hover*0.55`,
`rx + hover*0.07`, `rz - hover*0.05`, plus a slow idle sine bob `sin(t*0.7 + x) * 0.04`.

**One "tear rig"** (three groups with clipping planes — see §5) is reused for whichever pack is out
front; its foil color and art texture are swapped on pick.

---

## 4. Pulling a pack out

`pickPack(id)`:
1. Retint the rig (foil color, art texture), reset progress, hide the plain clone, show the rig at
   the plain pack's world slot (bin-stage offset included).
2. `flyTo(rig, slot, COUNTER, 620ms)` — position lerps with **a lift-then-travel split**, which is
   what keeps the pack from clipping through the box wall:
   ```
   travel = max(0, (k - 0.3) / 0.7);  e = 1 - (1-travel)³;  ey = 1 - (1-k)²
   lift   = sin(π * k^0.72) * 4.2
   pos    = from + (to-from)·e   (y uses ey, plus lift)
   rot    = from + (to-from)·e
   ```
3. `+220ms` → `slideBin(true)`: the box stage tweens 620ms `smoothstep` to
   `x = width*0.92 + 6`, `z = -depth*0.55 - 3`, `rotation.y = -0.42`, `scale 0.68`.
4. `+300ms` → `focusPack(rig, true)`: 560ms ease-out-cubic scale-up to `focusScale()`
   (delayed so the box has cleared before the pack gets big).

`COUNTER` (the front-and-centre pose) is `{ x:0, y:-1.3, z:min(depth*0.38, 3.6), rx:-atan(pitch)*.94 }`.

`focusScale()` estimates from the camera frustum at that distance:
`max(1.6, min(visH*0.86/6.62, visW*0.36/4.06))`. Then `fitFocus()` corrects it empirically —
project the pack's `Box3` corners to NDC, recentre vertically (biased ~10px above centre), and
shrink by the overrun if it exceeds 0.92 NDC vertically / 0.96 horizontally, up to 4 passes.
Re-run on resize. This is the reliable way to get "as big as fits" across aspect ratios.

`backToBin()` / `showBin()` reverse it: progress 0, `slideBin(false)`, `focusPack(rig,false)`,
`sendHome()` (flyTo back to the slot, 480ms, then hide the rig and re-show the plain clone), and
smooth-scroll the stage back into view. `sendHome` guards with a `pickSeq` counter so a pack picked
mid-flight doesn't get hidden by the previous return.

**Just grab me one** picks a random unopened pack; if the box is currently slid out it first slides
back (`480ms`) so the pull-out reads from the bin.

---

## 5. The tear (carried over from v1, unchanged)

The pack never moves during the tear — the **rig tilts toward the pointer** (±0.42 rad yaw,
±0.24 pitch, slow sine breathe, 0.07 bob). Three copies of the model, each with cloned materials
and world-space clipping planes recomputed every frame as
`plane.copy(basePlane).applyMatrix4(group.matrixWorld)`:

| Group | Clipping | Role |
| --- | --- | --- |
| body | `y < 2.89` | pack below the tear line |
| stay | `y > 2.89` and `x > xb` | seal not yet torn |
| fly  | `y > 2.89` and `x < xb` | the torn strip |

`xb = -2.12 + p * 4.38`; `p += (target - p) * 0.22`. While tearing, `fly` sits at
`position(p*.1, p*.42, p*.75)`, `rotation(-p*.6, 0, -p*.16)`.

**Input**: pointerdown on the stage over the focal pack starts a drag;
`progress = dx / max(190, stageWidth * .62)`. Release < 0.62 springs back; ≥ 0.62 completes.
Tap (<6% movement, <320ms) or Enter/Space auto-tears (`k²` over 420ms).
The v1 progress bar is gone; a cyan (`#62c5ee`) arrow + nick indicator sits at the left end of the
tear line, angled `-0.35 rad`, pulsing along that diagonal.

**Opening sequence** (felt rhythm — keep the timings):
1. `max(180, (1-p)*620)`ms — remaining seal peels (ease-out quad).
2. 680ms — strip launches: `x .1→2.7`, `y` arc `+2.4k − 2.9k²`, `z .75→2.95`,
   `rot.x −.6→−3.2`, `rot.y 0→1.2`, `rot.z −.16→−1.06`; opacity fades over the last 45%.
3. +380ms — pack drops: 620ms ease-out, `y −.15→−2.35`, `rot.z 0→.16`, `scale 1→.88`,
   materials fade over the last 65%.
4. +640ms — cards deal.

### Card deal
Anchor in **page coordinates** (stage center X, 44% down its height, + `scrollX/scrollY`); measure
card centers the same way — viewport coords break because the grid grows and the page scrolls
between the two measurements. Each card starts (no transition) at
`translate(dx,dy) scale(.34) rotate((i-(n-1)/2)*6deg)`, `opacity:0`, inner `rotateY(180deg)`. Then
per card, 80ms stagger: outer `transform 660ms cubic-bezier(.17,.89,.24,1.06) {80i}ms → none`,
`opacity 180ms linear`; inner `transform 460ms cubic-bezier(.2,.85,.3,1) {80i+240}ms → none`;
hide the back face at `{80i+760}ms`. 340ms in, smooth-scroll so the grid top sits 220px below the
viewport top. Phase → `collected` at `n*80 + 1000`ms.
Cards are **appended** with CSS `order: -packNumber` (prepending reuses DOM nodes and kills the
entry animation).

---

## 6. Two bug fixes worth copying

- **First-pull stall.** The tear rig's materials get their first texture on the first pick, which
  triggers a shader-program compile and eats a frame — the lift arc got skipped only on pull #1.
  Fix: pre-warm at load (assign any series texture to the rig's art materials, render one frame
  with the rig parked off-screen), and start every tween's clock on its **first painted frame**
  rather than at scheduling time, so a hitch can't jump the animation forward.
- **Interrupted returns.** `sendHome()` captures a `pickSeq` and bails on completion if another
  pack was picked mid-flight.
- **Touch arm/confirm picking the wrong pack, or collapsing right after the tap.** Touch has no
  hover, so selecting a pack in the bin is two taps: tap 1 raycasts on `pointerdown` and arms
  (`armedId.current`) — lifts the pack the same amount desktop hover does, and it stays lifted
  after the finger releases; tap 2 on the same pack confirms (`pickPack`). Two bugs, both in
  `PackScene.tsx`:
  - **Wrong pack on tap 2.** The armed pack's hover lift moves it in Z; if Z moves it *away* from
    the camera, a still-resting neighbor can end up nearer along the same screen ray and occlude
    it, so `onDown`'s general raycast (`raycastPackAtNdc`, nearest-hit-wins) resolves to the
    neighbor instead. Fix: `raycastHitsPack(ndcX, ndcY, armedId)` tests the armed pack's own mesh
    directly on tap 2, before falling back to the general raycast — occlusion by other packs no
    longer matters for confirming the one already armed.
  - **Lift collapses within a frame or two of the tap.** The per-frame hover raycast in `loop()`
    (`raycastPackAtNdc(ndc.current...)`) exists to track a moving desktop mouse every frame. It
    wasn't gated off for touch, and `ndc.current` for touch is just whatever the last `touchmove`
    reported — stale the instant the finger stops or lifts. Left running, it kept re-raycasting
    that stale point every frame and stomping the tap-armed `hoverId` back to `null` (or a
    different pack) as soon as the rising pack's mesh moved off that fixed ray, so the arm
    visibly collapsed almost immediately after the tap. A dragging finger *looked* fine only
    because it kept feeding the same loop fresh, correct positions each frame. Fix: gate that
    block on `!pointerIsTouch.current` — for touch, `hoverId` is owned entirely by `onDown`'s
    arm/confirm logic and nothing else should write to it while `phase === "bin"`.
  - There's an opt-in `?debug=1` overlay (`debugOn` state in `PackScene.tsx`) that logs every
    down/up/raycast/ARM/CONFIRM event straight onto the page — headless touch simulation can't
    reproduce real-device timing, so this was what actually diagnosed both bugs above.

---

## 7. Pack cover art (700 × 1024 canvas per series, cached)

Photocopied-zine look — flat, clean, deliberately *not* grimy:
1. Fill with the series' `stock` color.
2. Hand-drawn frame: two wobbly rounded rectangles (9px and 3px stroke, `#1b1512`), points placed
   every 60px with ±5px jitter — like a marker line gone round twice. Outer inset 40px, inner 58px.
3. Masthead: shop name in 30px Permanent Marker at (96,132) `rotate(-.02)`, with a wobbly 4px
   underline.
4. Title: `art[]` lines from (92,360), 132px line step, each line jittered ±9px and ±0.045 rad,
   font 126px (104px for lines over 6 chars) Permanent Marker, auto-shrunk to fit `W-200`, filled
   plus a 3px stroke pass for weight.
5. Tagline: 40px Permanent Marker at (96,790) `rotate(-.015)`.
6. Two three-spoke marker stars at (W−118, 214) r26 and (W−176, 846) r15.
7. `limited`/`locked` banner: 30px caps in a wobbly hand-drawn box, `rotate(-.34)` at (W−214, 300).
8. Footer: "8 PHOTOS INSIDE" 27px at (96, H−108); a wobbly ellipse (r≈40, jittered) at (W−150,
   H−120) holding "no.N" — N is the series index.
9. Eight faint white radial gradients at 16% — copier toner unevenness, not dirt.

`flipY: true`, `colorSpace: SRGB`, `ClampToEdgeWrapping`.
Pack materials: foil = `MeshStandardMaterial({ color: design.foil, metalness:.92, roughness:.26,
side:DoubleSide, transparent:true })`; art plane = `MeshStandardMaterial({ map, metalness:.05,
roughness:.78, side:DoubleSide, transparent:true })`.

Model: `assets/booster_pack_tcg_pack.glb` — two meshes, `Object_4` = foil body, the other = the art
plane. Bounds x ±2.03, y −3.35…3.27, z −0.09…0.16.

---

## 8. State

- `phase`: `bin | idle | tearing | dealing | collected`.
- `currentId`: the pack out front; `opened[]`: ids already torn; `openedCount`.
- `cards[]`: appended per pack, each `{ key, order, packId, slot, plate, tilt, tag, tier, ink,
  title, date, medium }`; `tier` = series name, or "Bent corner" for the last card of every pack.
- `filter`: `all` or a series id; resets to `all` whenever a pack is dealt.
- Non-render refs: renderer/scene/camera, the plain rigs map, the tear rig, tear progress `p`,
  pointer drag state, `binOut`, `lay` (cols/rows/salt), `binSizeNow`, `pickSeq`.
- Data to fetch in the real site: the photograph per plate (and ideally a link to its gallery
  entry). Everything else is static config.

## 9. Design tokens (Broadsheet — `assets/broadsheet-styles.css`)

Page ground `#17110f` (thrift-shop dark; the design system's `#f3f2f2` paper is used only on cards).
Ink `#201e1d`. Cyan ramp `#e9f8ff #cbeeff #99e0ff #62c5ee #38a6cf #1186ac #006786 #004961 #0a303e`.
Magenta ramp `#fff1f4 #ffdee6 #ffc0d0 #ff90b1 #ff458e #d82071 #aa0b56 #790e3d #4b1528`.
Neutrals `#f8f4f4 #eae7e7 #d7d3d3 #bab6b6 #9b9797 #7d7979 #605d5d #444141 #2d2b2b`.
Process yellow `#edbb00` — signage and tape. Marker ink `#1b1512`. Green chip `#7de08a`.
Type: Source Serif 4 (400/600/700 + italic) for all UI; **Permanent Marker** for everything
hand-written (bin FREE, zine covers). Spacing 5/10/15/20/30/40px. Shadows: cards use
`0 3px 10px rgba(45,43,43,.16)`; signage uses hard offsets `2–4px 2–4px 0 rgba(0,0,0,.5)`.
Nothing is axis-aligned: signs, chips, cards and buttons all carry ±0.5–3deg rotation.

## 10. Assets
- `assets/booster_pack_tcg_pack.glb` — Sketchfab "Booster Pack (TCG Pack)" by Hasan Ajami,
  **CC-BY-4.0 — attribution required** on the page or in site credits.
- `assets/broadsheet-styles.css`, `assets/broadsheet-readme.md` — design-system tokens.
- Fonts: Source Serif 4 + Permanent Marker (Google Fonts).
- three.js r184 (prototype loads from `https://esm.sh/three@0.184.0` + `examples/jsm/loaders/GLTFLoader.js`;
  in a real build install `three`).
- Photographs: none included. Placeholders are keyed `bin-<globalPlateNumber>` (001…256).

## 11. Files
- `reference/Pack Opening - Discount Bin.dc.html` — **the current design** (template + logic).
- `reference/Pack Opening.dc.html` — v1, for diffing only.
- `reference/support.js` — prototype runtime. Do not port.
- `reference/image-slot.js` — drag-and-drop photo placeholder. Replace with real images.

## 12. Known gaps
- `locked: true` (Portraits) is cosmetic; no password gate exists yet.
- No `prefers-reduced-motion` path — skipping the tear/flight and revealing cards directly is the
  intended fallback.
- Bin re-layout keeps opened packs hidden but still reserves their slots' shuffle indices.
