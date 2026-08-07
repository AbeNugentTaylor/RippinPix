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

## Configurator (local only)

`src/app/configurator` is a local authoring tool for turning real photos into real cards —
it's not part of the deployed site (both the page and its API routes 404 whenever
`NODE_ENV === "production"`).

```bash
npm run dev
```

Open [http://localhost:3000/configurator](http://localhost:3000/configurator), browse to a
folder on your machine (it starts at your Desktop), pick a photo, drag/zoom it into the 63:88
card frame, choose a rarity (and holo foil), add attributes, and hit **Save card**. Saving:

1. Copies the original photo — full resolution, untouched — into `public/photos/<designId>/<NN>.<ext>`.
2. Writes an entry into [`src/data/card-configs.json`](src/data/card-configs.json) with the crop,
   rarity, holo flag, attributes, and any title/date/medium overrides.

The pack-opening site (`/`) reads both automatically: a slot with a saved config renders as a
full-art holo card with your crop/rarity/attributes; every other slot keeps rendering the
original generated-placeholder plate. Commit both the new photo and the updated
`card-configs.json` to hand the cards off.

## Deploying

A server component reads `public/photos/` at build time to build the photo
manifest, so Next prerenders the page statically — add or swap photos and
redeploy to pick them up. `netlify.toml` wires up the Netlify Next.js runtime —
connect the repo in Netlify and point a subdomain (e.g. `cards.abe.cool`) at
the site.

## Attribution

The booster pack 3D model is "Booster Pack (TCG Pack)" by Hasan Ajami (Sketchfab),
licensed CC BY 4.0. Credited in the page footer — keep that credit if you redesign
the footer. The version number next to it is read live from `package.json`.
