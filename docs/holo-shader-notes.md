# Holo card shader — status + next-session notes

Reference doc for picking this back up. Everything below reflects the state as of the
"tilt-driven rainbow + etched foil" pass.

## Where things live

- `src/components/Card3D.tsx` — the whole three.js card renderer (configurator live preview +
  real site's click-to-view lightbox both use this same component).
- `src/components/configurator/LightingDebugPanel.tsx` — live sliders for tuning material/light
  values against the preview without round-tripping through chat. Nothing here saves anywhere;
  read off numbers that look right and bake them into `Card3D.tsx`'s per-rarity tables.
- `src/components/configurator/CardEditor.tsx` — hosts the preview + debug panel, has its own
  `defaultOverridesFor()` that mirrors Card3D's rarity defaulting so the sliders start sane.

## How the holo effect works now

Two independent pieces, both driven by rarity tier (`common` → `secret`):

1. **Rainbow overlay** — a second mesh (`holoMesh`) parented to the card mesh, additively
   blended, custom `ShaderMaterial` (`HOLO_VERTEX_SHADER` / `HOLO_FRAGMENT_SHADER` in
   `Card3D.tsx`). Hue is driven **linearly** by pointer-tilt uniforms `uTiltX`/`uTiltY` (range
   roughly -1..1), not by `dot(normal, view)` — that was the original approach and it barely
   moved (cosine is ~flat near 0°, so a card that only tilts a few degrees produced almost no hue
   shift). Also has a parallax UV offset (`vUv + tilt * 0.22`) so the pattern visibly slides as a
   floating layer, and glare alpha grows slightly with tilt magnitude.
2. **Etched foil bump** — `loadFoilNormalMap()` bakes a real cosmos-holofoil reference photo
   (`public/holo-mask.png`, user-provided) into a normal map by reading its luminance as height and
   taking the gradient (async — the image loads at mount, `foilNormalRef` holds the result once
   ready), wired into the base `MeshPhysicalMaterial.normalMap` + a per-rarity `NORMAL_SCALE` table.
   As of 2026-08-07 this only activates when `holoPattern === "cosmos"` (see "Holo Mask" below) —
   it's that pattern's whole distinguishing look now, not a generic always-on holo texture. An
   earlier version (`makeFoilNormalMap()`) procedurally synthesized a diagonal-ridge pattern instead
   of using a real photo, and applied unconditionally to every holo-tier card regardless of pattern.

Both replaced an earlier attempt using `MeshPhysicalMaterial`'s built-in PBR `iridescence`
property, which turned out to be a dead end: reading three.js's own shader source
(`lights_physical_pars_fragment.glsl.js`) confirmed `clearcoat` computes a completely separate
plain dielectric Fresnel with **zero reference to iridescence anywhere** — so the visible glare
(which comes from clearcoat) could never pick up color from iridescence, no matter how it was
tuned. Don't re-attempt PBR iridescence for this; the custom shader-overlay approach is the way.

## Reference repo

[`github.com/daniel-ilett/shaders-holo-card`](https://github.com/daniel-ilett/shaders-holo-card) —
Daniel Ilett's Unity URP Shader Graph tutorial recreating the *Pokémon TCG Pocket* holo effect
([YouTube walkthrough](https://www.youtube.com/watch?v=p-ifYSABUgg)). It's a Unity project, not
usable directly — everything useful gets ported by hand into GLSL. The graph to read is
`Assets/Shaders/CardArtworkHolo.shadergraph` (Unity ShaderGraph JSON — readable but verbose;
`grep` for node titles/sticky notes rather than trying to parse the whole thing).

**Already ported:** the `ViewVectorNode → DotProductNode → HueNode` hue-shift idea (though we
drive it from tilt instead of the raw dot product, for the reason above), the "second view
vector locked to card pivot point" parallax trick, and the "heightmap → normals" etched-bump
trick.

**Not yet ported** — confirmed present as exposed shader properties / sticky notes in the graph,
worth digging into next:
- **Holo Color Ramp** — likely a gradient texture the hue/position value samples into, instead of
  raw HSV rotation. Could make the rainbow feel more "designed" (matching a specific foil look)
  rather than a full even spectrum.
- **Holo Noise Scale** — probably breaks up the rainbow with a noise texture so it's not a
  perfectly clean gradient (real foil isn't uniform).
- **Holo Rotation Scroll Speed** / **Holo Anim Speed** — likely separate idle-animation controls;
  we currently only have one `uTime`-driven drift term.

**Holo Mask — traced and partially ported (2026-08-05).** There's a dedicated "Holo Mask" node
group in the shader graph (view-vector → dot-product → sine → saturate chain sampling a
`Texture2D` property) exposing four properties: `_Holo_Mask`, `_Holo_Density`, `_Holo_Offset`,
`_Holo_Direction`. So "Holo Density"/"Holo Direction" aren't independent noise/banding controls as
originally guessed — they're UV transforms (scale/offset/rotate) feeding the mask texture sample.
Swapping `_Holo_Mask` is literally how the reference project switches pattern styles. Reference
textures at `Assets/Textures/HoloMask{,2,3,4,5}.png`:
- `HoloMask.png` — blank/white, unused by any material (a "no mask" placeholder).
- `HoloMask2.png` — scattered soft-edged dot clusters, varying size/density. **This is the
  "cosmos" look.** Wired into `CardArtworkBG.mat`.
- `HoloMask3.png` — a photographed reference image of a real cosmos-foil card (colorful, not
  grayscale) — art reference only, not a shader input, not referenced by GUID anywhere.
- `HoloMask4.png` — plain vertical stripes. Wired into `CardArtworkBG2.mat` / `CardInterior.mat`.
- `HoloMask5.png` — radial sunburst/starburst rays from a bright center point.

Ported into `Card3D.tsx` as `HoloPattern = "none" | "cosmos" | "stripes" | "sunburst"`: rather than
importing the Unity PNGs (unclear license, and baked at the wrong aspect for this card), each
pattern is procedurally generated once at mount (`makeCosmosMask`/`makeStripesMask`/
`makeSunburstMask`, alongside the existing `makeFoilNormalMap`-style canvas approach) and sampled
in `HOLO_FRAGMENT_SHADER` via a new `uHoloMask` sampler at `vUv` (fixed to the card, unlike the
rainbow's own parallax-shifted UV — matches the reference's "pattern is a stencil baked to the
card, color slides across it" look), multiplied straight into the existing alpha term. `"none"`
samples a 1×1 white texture so intensity math is untouched when no pattern is selected.
`HoloMask3.png`'s art-reference photo was not ported (it's not a mask, nothing to port).

**Traveling glare band (2026-08-05, follow-up).** First pass had a real gap from the reference
video: alpha was near-uniform across the whole card (only weakly scaled by a *global* ndotv/tilt
term), so the whole card lit up evenly instead of a bright band sweeping across it as the card
tilts. Fixed in `HOLO_FRAGMENT_SHADER` by computing `cardDiag` (position along the card's diagonal,
fixed UV — not the parallax-offset one hue uses) and gating alpha by distance from a `bandCenter`
that moves with `uTiltX`/`uTiltY` via `smoothstep`. Width is `uBandWidth`
(`HOLO_BAND_WIDTH = 0.34` constant, also exposed as a "Holo band width" debug-panel slider —
narrower reads as a sharper/more localized streak, closer to the reference; wider approaches the
old always-lit look).

**Cosmos rework — hard edges + per-fleck flicker (2026-08-05, second follow-up).** Real reference
photos of cosmos foil (user-provided) showed two things the first port missed: (1) sharp-edged
flecks — circles, squares, diamonds, plus/cross glyphs — not soft radial-gradient blobs, and (2)
individual sparkles flicker in and out independently as the card rotates, rather than the whole
mask brightening/dimming together. `makeCosmosMask` now draws hard-edged shapes via direct
pixel-membership tests (`fleckContains`, no gradients) at varied sizes (mostly tiny, a few larger),
plus a dense fine-dust layer underneath. Each fleck gets its own random frequency/phase packed into
the mask texture's G/B channels; `HOLO_FRAGMENT_SHADER` reads those and drives a per-fleck
`sin(tiltAngle * freq + phase)` gate, so different flecks light up at different tilt angles instead
of uniformly. G=B=0 means "always on, no flicker" (used by the fine dust and by every other mask —
`makeStripesMask`/`makeSunburstMask` explicitly zero G/B after drawing since canvas draw calls
write equal R/G/B for white, which would otherwise misfire this gate).

**Tunable pattern scale + flicker speed (2026-08-05, third follow-up).** User feedback on the
sparkle rework: flecks read too big, and flickered too fast for ordinary mouse movement. Two new
live-tunable uniforms in `HOLO_FRAGMENT_SHADER`, both exposed as debug-panel sliders (and baked
defaults as module constants, same pattern as `HOLO_BAND_WIDTH`):
- `uMaskScale` (`HOLO_PATTERN_SCALE`, default 1) — the mask UV is sampled as
  `(vUv - 0.5) * uMaskScale + 0.5`, i.e. zoomed around the card's center. >1 tiles the mask more
  times across the card (smaller/denser shapes); <1 zooms in (bigger shapes). Needed
  `THREE.RepeatWrapping` on the cosmos/stripes/sunburst textures (set in `makeHoloMaskTextures`) so
  values >1 tile cleanly instead of clamping at the texture edge. This is the same lever as the
  reference shader graph's `_Holo_Density` property (a UV scale on the mask sample).
- `uSparkleFreqScale` (`HOLO_SPARKLE_FREQ`, default 1) — multiplies each fleck's per-shape flicker
  frequency. Also lowered the *baseline* frequency range baked into the mask itself
  (`freq = (1.0 + maskSample.g * 6.0) * uSparkleFreqScale`, down from `4.0 + g * 20.0`) since the
  original range meant even a ~30° pointer swing could push a fleck's `sin()` argument through more
  than a full cycle — the actual cause of the "flashes too fast" complaint, not just a matter of
  taste.

**Cosmos: procedural mask replaced by the real reference photo (2026-08-07).** The `HoloMask3.png`
equivalent — the user's own photographed cosmos-foil card — turned out to *not* be "art reference
only, nothing to port" as assumed above. It's now the actual texture source: `loadCosmosTextures()`
(see "Etched foil bump" above, and the follow-up note right below this one — the bump alone didn't
stay the whole story) bakes it into a normal map, and selecting `"cosmos"` in the pattern dropdown
activates that bump. `makeCosmosMask()` (the hard-edged
fleck/dust generator from the two follow-ups below) is removed — the `"cosmos"` entry in
`makeHoloMaskTextures()` now just reuses the blank/unmasked texture, same as `"none"`, since the
distinguishing look comes entirely from the physical bump (specular highlights) rather than a
rainbow-color stencil. `FleckShape`/`fleckContains`/the per-fleck G/B flicker-packing described in
the two sections immediately below are dead as far as `"cosmos"` goes; the flicker *gate* math
still lives in `HOLO_FRAGMENT_SHADER` (harmless no-op when G=B=0, which every remaining mask sets)
in case `"stripes"`/`"sunburst"` ever want per-shape flicker later — nothing currently populates it.
Rationale for photo-over-procedural: the reference image *is* the classic Pokémon "cosmos
holofoil" pattern, so using it directly is more authentic than re-deriving an approximation of it in
code, and it also means the bump automatically has real photographic irregularity (varied cluster
density, uneven speckle) that's hard to fake procedurally without a lot more tuning.

**Cosmos: bump-only was invisible, added a mask back (2026-08-07, follow-up).** The bump-only design
above turned out to be a dead end in practice, discovered by diffing screenshots of `"none"` vs
`"cosmos"` at identical tilt/lighting: under real default settings (default light rig, rainbow
overlay at its normal strength) the two were visually indistinguishable — only ~6% of pixels
differed by any meaningful amount, max single-pixel delta 52/255. Tripling the bump strength
(normal-map gradient multiplier 90→260, `NORMAL_SCALE` roughly doubled) barely helped (74/255 max) —
a sublinear response, because `MeshPhysicalMaterial`'s specular/clearcoat highlight only reads at
all in a narrow light-direction/tilt sweet-spot (confirmed by cranking key/rim lights to 2.5 and
zeroing ambient — *then* it clearly showed the star pattern, see the git history around this note for
the isolated test). **Don't try to push the bump-only approach further** — it's fighting a low
visual ceiling in this specific light rig, not a tuning problem.

Fix: `loadFoilNormalMap()` (renamed `loadCosmosTextures()`) now also derives a *mask* from the same
photo — R channel = a sigmoid-contrast-boosted version of the image's own luminance, centered on the
image's own mean brightness (`alphaFor = 1/(1+exp(-14*(v - mean*1.3)))`) so only the brighter
sparkle clusters pass through, not the whole card. That mask replaces the placeholder blank texture
`"cosmos"` was pointing at (loads async, swaps into the live `uHoloMask` uniform if `"cosmos"` is
already selected when it resolves) and uses the exact same stencil mechanism `"stripes"`/`"sunburst"`
already use — which doesn't depend on lighting angle at all, so it reads clearly regardless of tilt.
Same before/after diff test after this fix: ~41% of pixels differ meaningfully, max delta 150/255,
and the amplified diff image visibly shows the actual star/cross cluster shapes from the reference
photo. The bump is kept as a secondary physical-depth layer on top of the mask, not removed.

Next step if picking this back up: `_Holo_Color_Ramp` (see above) is probably the highest-value
remaining item — a real gradient texture instead of raw HSV rotation.

## Suggested approach for next session

1. Re-clone `shaders-holo-card` somewhere durable if you want to keep digging (last clone was in
   a temp scratchpad that doesn't survive between sessions).
2. Pick one property at a time (Color Ramp is probably highest value — a real gradient reads much
   more "trading card" than raw hue rotation), trace it in the shader graph, port to GLSL in
   `HOLO_FRAGMENT_SHADER`.
3. Add a matching slider to `LightingDebugPanel.tsx` + default value in `CardEditor.tsx`'s
   `defaultOverridesFor()` + per-rarity table in `Card3D.tsx`, same pattern as `NORMAL_SCALE`.
4. Tune live via the debug panel, bake final numbers into the per-rarity tables once it looks
   right.

## Other open item (not shader-related)

Moving the configurator to the second PC where the real photo library lives hasn't happened yet
as far as this repo shows — there's no special per-machine setup, it's just `git clone` +
`npm install` + `npm run dev` per the README's "Configurator (local only)" section. Flagging in
case it's still on the list.
