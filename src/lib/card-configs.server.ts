import fs from "node:fs";
import path from "node:path";
import { configKey } from "./card-key";
import type { CardConfig } from "./types";

export { configKey };

// Repo-relative form, reused by card-configs.remote.server.ts so the local
// (fs) and remote (GitHub API) backends can't drift on where this file lives.
export const CARD_CONFIGS_REL_PATH = "src/data/card-configs.json";

const CONFIG_PATH = path.join(process.cwd(), CARD_CONFIGS_REL_PATH);

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
