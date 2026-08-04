import fs from "node:fs";
import path from "node:path";
import { DESIGNS, PLATE_OFFSET } from "./designs";

const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

// Convention: public/photos/<designId>/<local plate, 2-digit>.(jpg|jpeg|png|webp)
// Drop a real photograph at that path and it's picked up automatically. Card
// slot keys are "bin-<globalPlateNumber, 3-digit>" across the whole 256-plate run.
export function getPhotoManifest(): Record<string, string | null> {
  const manifest: Record<string, string | null> = {};
  for (const design of DESIGNS) {
    const count = design.packs * 8;
    for (let local = 0; local < count; local++) {
      const globalPlate = PLATE_OFFSET[design.id] + local + 1;
      const slot = `bin-${String(globalPlate).padStart(3, "0")}`;
      const localNo = String(local + 1).padStart(2, "0");
      const found = EXTENSIONS.map((ext) =>
        path.join(process.cwd(), "public", "photos", design.id, `${localNo}${ext}`)
      ).find((filePath) => fs.existsSync(filePath));
      manifest[slot] = found ? `/photos/${design.id}/${path.basename(found)}` : null;
    }
  }
  return manifest;
}
