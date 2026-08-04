import fs from "node:fs";
import path from "node:path";
import { DESIGNS } from "./designs";
import { configKey } from "./card-key";
import type { CardConfig } from "./types";

export { configKey };

const CONFIG_PATH = path.join(process.cwd(), "src", "data", "card-configs.json");

// Reads straight off disk on every call (like photos.server.ts's manifest scan)
// so `next dev` picks up configurator writes without a restart.
export function getCardConfigs(): Record<string, CardConfig> {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as Record<string, CardConfig>;
  } catch {
    return {};
  }
}

export function saveCardConfig(config: CardConfig): void {
  const configs = getCardConfigs();
  configs[configKey(config.designId, config.local)] = config;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2) + "\n", "utf-8");
}

export function deleteCardConfig(key: string): void {
  const configs = getCardConfigs();
  delete configs[key];
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2) + "\n", "utf-8");
}

// First empty 1..packs*8 slot for a design, or null if every slot is taken.
export function nextLocalSlot(designId: string): number | null {
  const design = DESIGNS.find((d) => d.id === designId);
  if (!design) return null;
  const configs = getCardConfigs();
  const total = design.packs * 8;
  for (let local = 1; local <= total; local++) {
    if (!configs[configKey(designId, local)]) return local;
  }
  return null;
}
