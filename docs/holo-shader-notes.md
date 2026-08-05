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
2. **Etched foil bump** — `makeFoilNormalMap()` procedurally bakes a tiled diagonal-ridge pattern
   straight to a normal map (no real heightmap, since three.js only needs the normal map itself),
   wired into the base `MeshPhysicalMaterial.normalMap` + a per-rarity `NORMAL_SCALE` table.

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
- **Holo Density** — probably controls how many rainbow bands/repeats show across the card
  surface. Our current version has one continuous sweep; this could add a stripe/banding control.
- **Holo Direction** — likely the axis the pattern travels along (currently hardcoded as the
  UV diagonal in our version).
- **Holo Noise Scale** — probably breaks up the rainbow with a noise texture so it's not a
  perfectly clean gradient (real foil isn't uniform).
- **Holo Rotation Scroll Speed** / **Holo Anim Speed** — likely separate idle-animation controls;
  we currently only have one `uTime`-driven drift term.

None of these are implemented — just confirmed to exist as named, exposed properties in the
shader graph. Next step is opening the `.shadergraph` JSON (re-clone the repo — it was only
cloned into a session-scoped scratchpad temp dir last time, not kept in this repo) and tracing
each property's node graph the same way the hue-shift and parallax nodes were traced, then port
whichever ones look good in the live debug-panel preview.

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
