"use client";

import { useEffect } from "react";
import Card3D from "./Card3D";
import CardCaptionOverlay from "./CardCaptionOverlay";
import type { Card as CardT } from "@/lib/types";

interface CardLightboxProps {
  card: CardT | null;
  onClose: () => void;
}

export default function CardLightbox({ card, onClose }: CardLightboxProps) {
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

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        Close
      </button>
      <div className="lightbox-card-frame" onClick={(e) => e.stopPropagation()}>
        <Card3D
          photoUrl={card.photoUrl}
          crop={card.crop}
          rarity={card.rarity}
          holo={card.holo}
          holoPattern={card.holoPattern}
        />
        <CardCaptionOverlay card={card} />
      </div>
    </div>
  );
}
