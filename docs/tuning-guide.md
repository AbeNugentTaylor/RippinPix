# Tuning guide — visual constants you can hand-edit and preview live

A catalog of the numeric knobs that exist purely for hand-tuning "does this
look right" — as opposed to logic/data that shouldn't be touched casually.
Goal: let you iterate on feel (bin hover, card lighting, holo strength, pack
geometry) by editing a number, saving, and looking at the browser, without a
round trip through chat.

## How live-editing actually works here

- `npm run dev` (Turbopack) hot-reloads on save. For most of these files
  that's instant — the component re-renders with the new value.
- **Exception:** `PackScene.tsx` builds its whole three.js scene once, in a
  mount-effect with an empty dependency array (see the comment at the bottom
  of the file: "Scene boots once; phase/props are read through refs kept
  fresh above"). Editing a module-level constant in that file changes the
  module, so Fast Refresh remounts the component and rebuilds the scene from
  scratch — you'll see the whole bin flash/rebuild on save. That's expected,
  not a bug. If a change to that file doesn't seem to take effect, hard
  refresh the tab (Fast Refresh occasionally fails to remount a component
  that owns imperative side effects like a WebGL context).
- `Card3D.tsx`'s per-rarity tables (holo/lighting) have a **dedicated live
  UI** instead of edit-save-look — see below. Use it before hand-editing
  those constants.

---

## Card lighting & holo — use the debug panel, not hand-editing

Go to `/configurator`, pick a card, and use the **Lighting debug** panel
(`src/components/configurator/LightingDebugPanel.tsx`) — sliders drive the
live 3D preview directly via `Card3DOverrides`, no save/reload loop at all.
Drag until it looks right, read off the numbers, then bake them into the
matching per-rarity table in `src/components/Card3D.tsx`:

| Constant | File:line | Slider label |
|---|---|---|
| `DEFAULT_LIGHTS` (ambient/key/rim) | `Card3D.tsx:137` | Ambient / Key light / Rim light |
| `CLEARCOAT` | `Card3D.tsx:60` | Clearcoat (white glare) |
| `CLEARCOAT_ROUGHNESS` | `Card3D.tsx:68` | Clearcoat roughness |
| `ROUGHNESS` | `Card3D.tsx:83` | Base roughness |
| `ENV_INTENSITY` | `Card3D.tsx:114` | Env map intensity |
| `IOR` | `Card3D.tsx:96` | IOR |
| `HOLO_STRENGTH` | `Card3D.tsx:46` | Holo rainbow strength |
| `HOLO_BAND_WIDTH` | `Card3D.tsx:144` | Holo band width |
| `HOLO_PATTERN_SCALE` | `Card3D.tsx:151` | Holo pattern scale |
| `HOLO_SPARKLE_FREQ` | `Card3D.tsx:157` | Holo sparkle flicker speed |
| `BASE_TILT_X` / `BASE_TILT_Y` | `Card3D.tsx:132-133` | Base tilt X / Base tilt Y |

The panel doesn't save anything — it's scratch state per session. Nothing
here affects the real site until you (or Claude) copy the numbers into the
constant.

Rarely-touched geometry constants in the same file, no debug UI for these —
edit and reload the configurator to preview: `PLANE_W`/`PLANE_H` (card
aspect, `Card3D.tsx:122-123`), `CORNER_RADIUS` (`Card3D.tsx:125`), `FOV`
(`Card3D.tsx:126`).

---

## Bin hover-pull (the "read the label" pack lift)

`src/components/PackScene.tsx:22-34`. Preview by running the real site,
scrolling to the bin, and hovering a pack (no debug UI — this is a straight
edit/save/look loop; see the Fast Refresh note above).

| Constant | Current | What it does |
|---|---|---|
| `HOVER_LIFT_Y` | `5` | How far a hovered pack rises, straight up, out of the bin. |
| `HOVER_LIFT_Z` | `-2` | How far it moves along the bin's depth axis. Positive = toward the camera/viewer; negative = back away from the viewer (current setting: it rises and tips back rather than crowding the camera). |
| `HOVER_SCALE` | `1.12` | Scale multiplier at full hover (`1` = no scale change). |

These three are blended in by `p.hover`, which itself eases toward 0/1 over
several frames (`p.hover += (target - p.hover) * 0.16` inside `loop()`,
`PackScene.tsx` — raise `0.16` for a snappier pop, lower it for a lazier
rise). The rotation a hovered pack eases toward isn't a separate constant —
it's `counter.rx` (the same pitch the actively-picked pack rests at, see
`frameCamera()`), with yaw/roll eased to 0. If the hover pose ever needs to
diverge from that "picked up" pitch, that's the line to change (search
`loop()` for `counter.rx - s.rx`).

Related, same file:

| Constant | Line | What it does |
|---|---|---|
| `TEAR_Y` | 22 | Y position of the tear line across an opening pack — raise/lower to move where the "rip" happens. |
| `XMIN` / `XMAX` | 23-24 | Horizontal bounds of the tear drag gesture. |

---

## Bin layout / grid spacing

`src/lib/designs.ts`:

| Constant | Line | What it does |
|---|---|---|
| `COL_GAP` | 82 | Horizontal spacing between pack slots in the bin grid. |
| `ROW_GAP` | 83 | Depth spacing between rows. |

`layoutFor()` (line 120) picks column count from the stage's aspect ratio;
`binSize()` (line 125) derives the physical box dimensions from
cols/rows/gap. Changing the gaps changes both how crowded the bin looks and
the box's overall proportions — check a few window widths/aspects after
touching these, not just one.

---

## Camera framing, animation timing, and other in-function numbers

A lot of the remaining feel in `PackScene.tsx` is inline literals inside
functions rather than named constants at the top of the file — these are
real knobs too, just not hoisted out. Worth knowing where to look rather than
cataloging every literal here (they'd go stale fast):

- **`frameCamera()`** — camera distance/pitch from bin size. The `0.3 +
  rows * 0.062` and `0.86` cap control how steeply the camera looks down as
  the bin gets more rows.
- **`focusScale()` / `fitFocus()`** — how large the actively-picked pack
  scales up to fill the frame.
- **`flyTo()` callers** (`pickPack`, `sendHome`, `launchSeal`) — the
  duration arguments (`620`, `480`, `680`, `640` ms) control how snappy vs.
  floaty each transition feels.
- **`finishDrag()`** — `0.06`/`0.62` are the tear-drag release thresholds
  (how far you have to drag before it commits vs. springs back); `340` is
  the tap-vs-drag time window in ms.

If one of these turns into something you tune often, it's worth promoting to
a named constant next to `HOVER_LIFT_Y` and adding a row to this doc — ask
for that explicitly and it's a small change.
