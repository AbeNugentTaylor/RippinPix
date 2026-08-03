# The Plate Series

A booster-pack-opening hero for photography, built for an abe.cool subdomain. Pick a
pack (Landscape / Portrait / Architecture / Still life), swipe across the crimped
top of a 3D foil pack, watch the seal tear off and the pack drop away, then eight
"art cards" deal into a growing, filterable collection grid.

Ported from a design handoff prototype into Next.js (App Router) + TypeScript +
three.js. See [`src/components/PackScene.tsx`](src/components/PackScene.tsx) for the
3D tear mechanic and [`src/components/PackOpeningApp.tsx`](src/components/PackOpeningApp.tsx)
for the app state machine.

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
public/photos/<land|port|arch|still>/<01..10>.jpg
```

Titles, dates, and print mediums for each plate live in `src/lib/series.ts`.

## Design

Colors, type, spacing, and the tear/deal animation timings are intentionally fixed
— see [`docs/design-handoff.md`](docs/design-handoff.md) for the full spec. Treat
`globals.css` tokens and the `PackScene.tsx`/`CollectionGrid.tsx` timing constants
as final unless asked to change the design.

`prefers-reduced-motion: reduce` skips the tear/flight/deal animation and reveals
cards directly.

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
