"use client";

import { useEffect, useState } from "react";
import Card3D from "./Card3D";
import CardCaptionOverlay from "./CardCaptionOverlay";
import type { Card as CardT } from "@/lib/types";

interface CardLightboxProps {
  card: CardT | null;
  onClose: () => void;
}

export default function CardLightbox({ card, onClose }: CardLightboxProps) {
  const [holoHidden, setHoloHidden] = useState(false);

  // Reset so the next card opened always starts with the effect on.
  const [prevCard, setPrevCard] = useState(card);
  if (card !== prevCard) {
    setPrevCard(card);
    setHoloHidden(false);
  }

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [card, onClose]);

  if (!card) return null;

  const isLandscape = card.orientation === "landscape";

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        Close
      </button>
      {card.holo && (
        <button
          className="lightbox-holo-toggle"
          onClick={() => setHoloHidden((v) => !v)}
          aria-pressed={holoHidden}
          aria-label={holoHidden ? "Show holo foil effect" : "Hide holo foil effect"}
        >
          {holoHidden ? "Show Holo" : "Hide Holo"}
        </button>
      )}
      <div
        className={`lightbox-card-frame${isLandscape ? " lightbox-card-frame--landscape" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Card3D
          photoUrl={card.photoUrl}
          crop={card.crop}
          rarity={card.rarity}
          holo={card.holo && !holoHidden}
          holoPattern={card.holoPattern}
          orientation={card.orientation}
        />
        <CardCaptionOverlay card={card} />
      </div>
    </div>
  );
}
