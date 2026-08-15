import designData from "@/data/designs.json";
import type { Design, Pack, Plate, Slot } from "./types";

// One entry per series, editable via the configurator (which is why the data
// lives in src/data/designs.json rather than here). `packs` is the only knob
// for run size: 8 photos per pack, so packs: 3 -> 24 photographs in that
// series. The live site reads this build-time snapshot; the configurator
// fetches the current file through /api/designs instead, so freshly
// added/edited categories show up there before a publish/rebuild.
export const DESIGNS: Design[] = designData as Design[];

export const PER_PACK = 8;
export const COL_GAP = 4.3;
export const ROW_GAP = 1.5;
const MEDIA = ["Gelatin silver print", "Archival pigment print", "Chromogenic print", "Platinum palladium"];

// Placeholder vocabulary for categories created in the configurator, which
// have no hand-written subjects/conds of their own yet.
export const DEFAULT_SUBJECTS = ["Untitled frame", "Test roll", "First pick", "Second look", "Contact sheet", "Outtake", "Keeper", "Stray frame", "Last light", "Spare shot"];
export const DEFAULT_CONDS = ["on film", "in passing", "up close", "in soft light", "at dusk", "unplanned", "mid-roll", "at first light"];

// every series gets packs * 8 distinct plates, built from its own subjects x conditions
export function poolsFor(designs: Design[]): Record<string, Plate[]> {
  const out: Record<string, Plate[]> = {};
  designs.forEach((d, di) => {
    const subjects = d.subjects.length ? d.subjects : DEFAULT_SUBJECTS;
    const conds = d.conds.length ? d.conds : DEFAULT_CONDS;
    const list: Plate[] = [];
    for (let k = 0; k < d.packs * PER_PACK; k++) {
      list.push({
        title: `${subjects[k % subjects.length]}, ${conds[(k * 3 + di) % conds.length]}`,
        date: String(2019 + ((k * 5 + di) % 7)),
        medium: MEDIA[(k + di) % MEDIA.length],
      });
    }
    out[d.id] = list;
  });
  return out;
}

export const POOLS: Record<string, Plate[]> = poolsFor(DESIGNS);

// running plate number so every photograph has one number across the whole run
export function plateOffsetsFor(designs: Design[]): Record<string, number> {
  const out: Record<string, number> = {};
  let n = 0;
  designs.forEach((d) => {
    out[d.id] = n;
    n += d.packs * PER_PACK;
  });
  return out;
}

export const PLATE_OFFSET: Record<string, number> = plateOffsetsFor(DESIGNS);

export const TOTAL_PACKS = DESIGNS.reduce((n, d) => n + d.packs, 0);

export function jit(a: number, b: number, span: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 2 * span;
}

// how many across, given the stage's aspect ratio
export function layoutFor(aspect: number): { cols: number; rows: number } {
  const cols = aspect < 0.72 ? 2 : aspect < 1.05 ? 3 : aspect < 1.62 ? 4 : 5;
  return { cols, rows: Math.ceil(TOTAL_PACKS / cols) };
}

export function binSize(cols: number, rows: number): { width: number; depth: number } {
  return { width: cols * COL_GAP + 2.9, depth: rows * ROW_GAP + 3.4 };
}

// slot i in a cols x rows bin; salt re-jitters the mess without changing the grid
export function slotFor(i: number, cols: number, rows: number, salt: number): Slot {
  const c = i % cols;
  const r = Math.floor(i / cols);
  return {
    x: (c - (cols - 1) / 2) * COL_GAP + jit(r + salt, c, 0.7),
    y: -0.34 + jit(c + salt, r, 0.12) + r * 0.05,
    z: ((rows - 1) / 2 - r) * ROW_GAP + jit(r + 3, c + salt, 0.18),
    rx: -0.34 + jit(r + salt, c + 5, 0.06),
    ry: jit(r + 9, c + salt, 0.26),
    rz: jit(r + salt, c + 11, 0.14),
  };
}

export const PACKS: Pack[] = (() => {
  const out: Pack[] = [];
  let i = 0;
  DESIGNS.forEach((design, di) => {
    for (let n = 0; n < design.packs; n++) {
      out.push({
        id: `p${String(i + 1).padStart(2, "0")}`,
        design,
        designIdx: di,
        name: design.name,
        from: n * PER_PACK,
        price: "Free",
        slot: slotFor(i, 4, Math.ceil(TOTAL_PACKS / 4), 0),
      });
      i++;
    }
  });
  return out;
})();

export function plateAt(pack: Pack, i: number): { plate: number; info: Plate } {
  const local = pack.from + i;
  return {
    plate: PLATE_OFFSET[pack.design.id] + local + 1,
    info: POOLS[pack.design.id][local],
  };
}
