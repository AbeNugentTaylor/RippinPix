// Shared with client components — no fs import here, see card-configs.server.ts for that.
export function configKey(designId: string, local: number): string {
  return `${designId}/${local}`;
}

// First empty 1..total slot for a design, given an already-fetched configs
// map — shared by the client-side editor and both server-side (local fs /
// remote GitHub) save routes, so the "next free slot" logic lives in one
// place regardless of where the configs map came from.
export function firstEmptySlot(
  designId: string,
  total: number,
  configs: Record<string, unknown>
): number | null {
  for (let local = 1; local <= total; local++) {
    if (!configs[configKey(designId, local)]) return local;
  }
  return null;
}
