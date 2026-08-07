// Warms the browser's HTTP cache for a full-res photo before the user ever
// opens the lightbox (see PackOpeningApp's onDeal) — CardLightbox/Card3D
// fetches the original file directly (not through Next's image optimizer,
// unlike the grid thumbnails), so without this the first TextureLoader.load
// on click pays the full network+decode cost with nothing on screen but the
// material's default white. A module-level Set instead of per-call de-dupe
// so repeat deals (or a re-hover) never re-request the same file.
const preloaded = new Set<string>();

export function preloadImage(url: string | null | undefined) {
  if (!url || typeof window === "undefined" || preloaded.has(url)) return;
  preloaded.add(url);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}
