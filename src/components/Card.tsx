"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { Card as CardT } from "@/lib/types";

interface CardProps {
  card: CardT;
  shopName: string;
  packPrice: string;
  registerRefs: (key: string, outer: HTMLDivElement | null, inner: HTMLDivElement | null) => void;
}

export default function Card({ card, shopName, packPrice, registerRefs }: CardProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    registerRefs(card.key, outerRef.current, innerRef.current);
    return () => registerRefs(card.key, null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.key]);

  return (
    <div
      ref={outerRef}
      data-card-key={card.key}
      className="plate-card"
      style={{ order: card.order, display: card.display }}
    >
      <div className="plate-card-tilt" style={{ transform: `rotate(${card.tilt}deg)` }}>
        <div ref={innerRef} className="plate-card-inner">
          <div className="plate-card-front">
            <div className="plate-card-photo">
              {card.photoUrl ? (
                <Image
                  src={card.photoUrl}
                  alt={card.title}
                  fill
                  sizes="(max-width: 600px) 45vw, 172px"
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <div className="plate-card-photo-placeholder">Drop a photograph</div>
              )}
            </div>
            <div className="plate-card-caption">
              <span className="plate-card-kicker" style={{ color: card.ink }}>
                No. {card.plate} · {card.tier}
              </span>
              <span className="plate-card-title">{card.title}</span>
              <span className="plate-card-meta">
                {card.date} · {card.medium}
              </span>
            </div>
            <span className="plate-card-tape" />
            <span className="plate-card-price-tag" style={{ background: card.tag }}>
              {packPrice}
            </span>
          </div>
          <div className="plate-card-back">
            <span className="plate-card-back-label">{shopName}</span>
            <div className="plate-card-rosette">
              <span style={{ left: 0, top: 4, background: "var(--color-accent)", opacity: 0.85 }} />
              <span style={{ left: 12, top: 0, background: "var(--color-accent-2)", opacity: 0.8 }} />
              <span
                style={{ left: 6, top: 13, background: "var(--color-process-yellow)", opacity: 0.8 }}
              />
            </div>
            <span className="plate-card-back-label">{packPrice} · as-is</span>
          </div>
        </div>
      </div>
    </div>
  );
}
