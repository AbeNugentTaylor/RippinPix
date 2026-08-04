// Shared with client components — no fs import here, see card-configs.server.ts for that.
export function configKey(designId: string, local: number): string {
  return `${designId}/${local}`;
}

// Client-safe mirror of card-configs.server.ts's nextLocalSlot, operating on
// an already-fetched configs map instead of reading the file itself.
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
