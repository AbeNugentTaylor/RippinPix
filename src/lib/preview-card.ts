import { DESIGNS, POOLS } from "./designs";
import { photoSrc } from "./photo-src";
import type { Card, CardConfig } from "./types";

// Builds the same Card shape Card3D/CardCaptionOverlay render on the live
// site, straight from a saved CardConfig — used by the configurator to show
// a production-accurate preview of a card that isn't currently being edited.
// tag/tier/ink mirror the plain (non pack-rare-slot) case, since a saved
// config has no pack position to derive the "Bent corner" variant from.
export function configToPreviewCard(key: string, config: CardConfig, remote = false): Card {
  const design = DESIGNS.find((d) => d.id === config.designId) ?? DESIGNS[0];
  const placeholder = POOLS[config.designId]?.[config.local - 1];
  return {
    key,
    order: 0,
    designId: config.designId,
    slot: "preview",
    plate: String(config.local).padStart(3, "0"),
    tilt: 0,
    tag: "#7de08a",
    tier: design.name,
    ink: design.ink,
    title: config.title || placeholder?.title || "Untitled",
    date: config.date || placeholder?.date || "",
    medium: config.medium || placeholder?.medium || "",
    photoUrl: photoSrc(config.designId, config.fileName, remote),
    rarity: config.rarity,
    holo: config.holo,
    holoPattern: config.holoPattern,
    orientation: config.orientation,
    attributes: config.attributes,
    crop: config.crop,
  };
}
