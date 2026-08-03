import fs from "node:fs";
import path from "node:path";
import { SERIES } from "./series";

const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

// Convention: public/photos/<seriesId>/<plateIndex, 2-digit>.(jpg|jpeg|png|webp)
// Drop a real photograph at that path and it's picked up automatically —
// no code change needed. Card slot keys match "<seriesId>-<plateIndex>".
export function getPhotoManifest(): Record<string, string | null> {
  const manifest: Record<string, string | null> = {};
  for (const series of SERIES) {
    series.pool.forEach((_, idx) => {
      const slot = `${series.id}-${idx}`;
      const plateNo = String(idx + 1).padStart(2, "0");
      const found = EXTENSIONS.map((ext) =>
        path.join(process.cwd(), "public", "photos", series.id, `${plateNo}${ext}`)
      ).find((filePath) => fs.existsSync(filePath));
      manifest[slot] = found
        ? `/photos/${series.id}/${path.basename(found)}`
        : null;
    });
  }
  return manifest;
}
