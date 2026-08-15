import fs from "node:fs";
import path from "node:path";
import { DESIGNS } from "./designs";
import type { Design } from "./types";

// Repo-relative form, reused by design-configs.remote.server.ts so the local
// (fs) and remote (GitHub API) backends can't drift on where this file lives.
export const DESIGNS_REL_PATH = "src/data/designs.json";

const DESIGNS_PATH = path.join(process.cwd(), DESIGNS_REL_PATH);

// Reads straight off disk on every call (like card-configs.server.ts) so
// `next dev` picks up configurator writes without a restart. Falls back to
// the build-time snapshot if the file is unreadable.
export function getDesigns(): Design[] {
  try {
    const raw = fs.readFileSync(DESIGNS_PATH, "utf-8");
    return JSON.parse(raw) as Design[];
  } catch {
    return DESIGNS;
  }
}

export function saveDesigns(designs: Design[]): void {
  fs.writeFileSync(DESIGNS_PATH, JSON.stringify(designs, null, 2) + "\n", "utf-8");
}

export function serializeDesigns(designs: Design[]): string {
  return JSON.stringify(designs, null, 2) + "\n";
}
