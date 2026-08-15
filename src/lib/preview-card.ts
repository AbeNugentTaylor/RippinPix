import { DESIGNS, poolsFor } from "./designs";
import { photoSrc } from "./photo-src";
import type { Card, CardConfig, Design } from "./types";

// Builds the same Card shape Card3D/CardCaptionOverlay render on the live
// site, straight from a saved CardConfig — used by the configurator to show
// a production-accurate preview of a card that isn't currently being edited.
// tag/tier/ink mirror the plain (non pack-rare-slot) case, since a saved
// config has no pack position to derive the "Bent corner" variant from.
// `designs` should be the configurator's freshly-fetched list so cards in
// not-yet-published categories still resolve; it defaults to the build-time
// snapshot.
export function configToPreviewCard(
  key: string,
  config: CardConfig,
  remote = false,
  designs: Design[] = DESIGNS
): Card {
  const design = designs.find((d) => d.id === config.designId) ?? designs[0];
  const placeholder = poolsFor(designs)[config.designId]?.[config.local - 1];
  return {
    key,
    order: 0,
    designId: config.designId,
    slot: "preview",
    plate: String(config.local).padStart(3, "0"),
    tilt: 0,
    tag: "#7de08a",
    tier: design?.name ?? config.designId,
    ink: design?.ink ?? "#3a3634",
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
