# Dropping in real photographs

Each series has its own folder here, one per `id` in `src/lib/designs.ts`'s
`DESIGNS` array (`leaks`, `objects`, `landbw`, `flowers`, `wife`, `animals`,
`nature`, `austin`, `weihn`, `boys`, `mke`, `cars`, `josie`, `hk`, `sh`,
`vienna`, `euro`, `portr`). Each folder holds `packs * 8` plates, named by
two-digit **local** plate number within that series:

```
public/photos/leaks/01.jpg   (leaks has packs: 2, so 01..16)
public/photos/leaks/02.jpg
...
public/photos/objects/01.jpg (objects has packs: 3, so 01..24)
...
```

`.jpg`, `.jpeg`, `.png`, and `.webp` all work. Drop a file at the right path
and it appears automatically on next build/refresh — no code changes needed.
Any plate without a matching file falls back to a placeholder card.

Card titles/dates/mediums are currently generated from each series'
`subjects`/`conds` word lists in `src/lib/designs.ts` — replace those lists
(or the generator in `POOLS`) with real captions once you have them.

Recommended: portrait-oriented, at least 900×1260px (63:88 ratio) so the crop
in the card's photo area looks intentional rather than squeezed.
