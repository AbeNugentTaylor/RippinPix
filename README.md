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

Open [http://localhost:3000/configurator](http://localhost:3000/configurator). There are two ways
to pick a photo:

- **Choose photos…** (the "Photos from this device" panel) opens the browser's native photo
  picker — on a phone this surfaces your camera roll, so it's the way in for a Lightroom-mobile
  workflow: export/share your picks from Lightroom to the camera roll, then pick them here. Works
  the same from a laptop browser.
- The **folder browser** below it walks your machine's filesystem (starts at Desktop) — the
  original desktop-only flow.

Either way, drag/zoom the photo into the 63:88 card frame, choose a rarity (and holo foil), add
attributes, and hit **Save card**. Saving:

1. Copies the photo — full resolution, untouched — into `public/photos/<designId>/<NN>.<ext>`.
2. Writes an entry into [`src/data/card-configs.json`](src/data/card-configs.json) with the crop,
   rarity, holo flag, attributes, and any title/date/medium overrides.

The pack-opening site (`/`) reads both automatically: a slot with a saved config renders as a
full-art holo card with your crop/rarity/attributes; every other slot keeps rendering the
original generated-placeholder plate.

Once you've saved the cards you want, the **Push to GitHub** panel at the bottom shows what's
changed under `public/photos/` and `card-configs.json`; hit **Push to GitHub**, confirm, and it
bumps the version, commits, and pushes the current branch for you — no separate git step. (This
runs `git` on whatever machine is running `npm run dev`, using its existing credentials, so it's
still meant for your own machine/network, not a public deployment.)

### Reaching the configurator from your phone

`next dev` only listens on `localhost` by default. To open `/configurator` from a phone on the
same Wi-Fi, start it bound to your machine's LAN address instead:

```bash
npm run dev -- -H 0.0.0.0
```

then visit `http://<your-computer's-LAN-IP>:3000/configurator` from the phone.

### Remote configurator (deployed, password-gated)

The configurator can also run on the actual deployed site instead of `npm run dev` — useful if
you want to manage cards from anywhere without keeping a machine on your Wi-Fi. This is a
deliberately separate, opt-in mode: by default a deployed build behaves exactly like today (hard
404 on `/configurator` and its API routes).

In remote mode there's no local filesystem to write to (Netlify Functions don't have one), so
every **Save card** commits the photo, the updated `card-configs.json`, and a bumped
`package.json` version straight to GitHub in one push via [`src/lib/github-content.server.ts`](src/lib/github-content.server.ts)
— there's no separate "Push to GitHub" step in this mode, the save *is* the push. The route is
protected by HTTP Basic Auth (see [`src/proxy.ts`](src/proxy.ts)) — your browser will prompt for a
password the first time.

To turn it on, set these as **Netlify environment variables** (Site configuration → Environment
variables), available to both the build and the functions:

| Variable | Purpose |
| --- | --- |
| `CONFIGURATOR_REMOTE` | Set to `1` to enable. Unset = configurator stays hard-404'd, same as today. |
| `CONFIGURATOR_PASSWORD` | The Basic Auth password. If `CONFIGURATOR_REMOTE=1` and this is unset, the configurator fails closed (denies everything) rather than opening up. |
| `GITHUB_TOKEN` | A fine-grained [Personal Access Token](https://github.com/settings/personal-access-tokens/new), scoped to **this repo only**, with **Contents: Read and write** permission — nothing else. |
| `GITHUB_REPO` | `owner/repo`, e.g. `AbeNugentTaylor/RippinPix`. |
| `GITHUB_BRANCH` | Branch to commit to. Defaults to `main` if unset — make sure this is the branch Netlify auto-deploys from. |

Notes:

- New cards still need Netlify's next auto-rebuild to appear on the live site — same as a local
  `git push` today, just triggered remotely.
- Because `CONFIGURATOR_REMOTE` is read at build time too, flipping it off in the dashboard
  without a redeploy won't hide the page's URL — but Basic Auth (checked per-request, not baked
  into the build) is what's actually protecting it either way.
- Uploaded photos are downscaled/re-encoded client-side before sending, since Netlify's function
  request size limit is well under what an unedited phone photo produces. Full-resolution
  originals are preserved by the local `npm run dev` flow above.
- One shared password over HTTPS is meant for a single owner, not a multi-user system.

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
