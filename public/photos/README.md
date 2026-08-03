# Dropping in real photographs

Each series has its own folder here (`land`, `port`, `arch`, `still` — landscape,
portrait, architecture, still life). Each folder holds up to 10 plates, named
by two-digit plate number:

```
public/photos/land/01.jpg
public/photos/land/02.jpg
...
public/photos/land/10.jpg
```

`.jpg`, `.jpeg`, `.png`, and `.webp` all work. Drop a file at the right path and
it appears automatically on next build/refresh — no code changes needed. Any
plate without a matching file falls back to a placeholder card.

Plate titles, dates, and mediums are edited in `src/lib/series.ts` (the `pool`
array for each series, in the same 1–10 order as the file names).

Recommended: portrait-oriented, at least 900×1260px (63:88 ratio) so the crop
in the card's photo area looks intentional rather than squeezed.
