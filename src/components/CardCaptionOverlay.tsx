import type { Card as CardT } from "@/lib/types";

export const RARITY_LABEL: Record<string, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  holo: "Holo Rare",
  secret: "Secret Rare",
};

// The full-art caption block (rarity badge, title, meta, attributes) — shared
// between the flat CSS card (Card.tsx) and the 3D-rendered views (Card3D's
// consumers), so both always show identical markup/styling.
export default function CardCaptionOverlay({ card }: { card: CardT }) {
  return (
    <div className="card-full-art-scrim">
      <div className="card-full-art-caption">
        <span className="card-rarity-badge" data-rarity={card.rarity}>
          {RARITY_LABEL[card.rarity ?? "common"]}
        </span>
        <span className="plate-card-title">{card.title}</span>
        <span className="plate-card-meta">
          {card.date} · {card.medium}
        </span>
        {card.attributes && card.attributes.length > 0 && (
          <div className="card-attr-row">
            {card.attributes.slice(0, 4).map((a) => (
              <span className="card-attr-chip" key={a.label}>
                {a.label}: {a.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
