# RippinPix — Discount Bin

A booster-pack-opening hero for photography, built for an abe.cool subdomain. A
grubby cardboard box holds 32 sealed packs across 18 photo series (256 photos
total). Click a pack, it pulls out of the bin; swipe across its crimped top and
the seal tears off, the pack drops, and eight "art cards" fly out and flip
face-up into a growing, filterable "haul" grid below.

Ported from a design handoff prototype into Next.js (App Router) + TypeScript +
three.js. See [`src/components/PackScene.tsx`](src/components/PackScene.tsx) for
the 3D bin/pull-out/tear mechanics and
[`src/components/PackOpeningApp.tsx`](src/components/PackOpeningApp.tsx) for the
app state machine. This is v2 ("Discount Bin") — see
[`docs/design-handoff.md`](docs/design-handoff.md) for the current spec and
[`docs/design-handoff-v1.md`](docs/design-handoff-v1.md) for the original
("The Plate Series") it replaced; §0 of the v2 doc lists exactly what changed.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Adding your photographs

Cards render with a placeholder until a real photo is dropped in. See
[`public/photos/README.md`](public/photos/README.md) — the short version:

```
public/photos/<designId>/<01..NN>.jpg
```

one folder per series `id` in `src/lib/designs.ts`'s `DESIGNS` array, `NN` up to
`packs * 8`. Card titles/dates/mediums are currently generated from each
series' `subjects`/`conds` word lists — replace those (or the `POOLS`
generator) with real captions once you have them.

## Design

Colors, type, spacing, and the tear/deal animation timings are intentionally
fixed — see [`docs/design-handoff.md`](docs/design-handoff.md) for the full
spec. Treat `globals.css` tokens and the `PackScene.tsx`/`CollectionGrid.tsx`
timing constants as final unless asked to change the design.

`prefers-reduced-motion: reduce` skips the tear/flight/deal animation and
reveals cards directly (the pack pull-out/box-slide flight itself is not yet
covered — see "Known gaps" in the v2 handoff).

## Deploying

A server component reads `public/photos/` at build time to build the photo
manifest, so Next prerenders the page statically — add or swap photos and
redeploy to pick them up. `netlify.toml` wires up the Netlify Next.js runtime —
connect the repo in Netlify and point a subdomain (e.g. `cards.abe.cool`) at
the site.

## Attribution

The booster pack 3D model is "Booster Pack (TCG Pack)" by Hasan Ajami (Sketchfab),
licensed CC BY 4.0. Credited in the page footer — keep that credit if you redesign
the footer.
