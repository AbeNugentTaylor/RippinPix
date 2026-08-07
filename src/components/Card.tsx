"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { Card as CardT } from "@/lib/types";
import { useTiltPointer } from "@/lib/useTiltPointer";
import { preloadImage } from "@/lib/preload-image";
import CardCaptionOverlay from "./CardCaptionOverlay";

interface CardProps {
  card: CardT;
  shopName: string;
  packPrice: string;
  registerRefs: (key: string, outer: HTMLDivElement | null, inner: HTMLDivElement | null) => void;
  onSelect?: (card: CardT) => void;
}

export default function Card({ card, shopName, packPrice, registerRefs, onSelect }: CardProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const { onPointerMove, onPointerLeave } = useTiltPointer(outerRef);

  useEffect(() => {
    registerRefs(card.key, outerRef.current, innerRef.current);
    return () => registerRefs(card.key, null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.key]);

  const fullArt = Boolean(card.rarity);
  const crop = card.crop ?? { x: 50, y: 50, zoom: 1 };
  // The configurator's live preview points photoUrl at /api/local-image?path=...
  // (an uncropped, un-optimized original) rather than a static /photos/ file —
  // skip Next's optimizer for that case so the browser scales from full source
  // resolution instead of a pre-shrunk copy. Also over-request resolution
  // proportional to crop.zoom so a tight crop doesn't upscale a small raster.
  const isLocalPreview = card.photoUrl?.startsWith("/api/local-image");
  const zoomedSizes = `(max-width: 600px) ${Math.round(45 * crop.zoom)}vw, ${Math.round(172 * crop.zoom)}px`;

  return (
    <div
      ref={outerRef}
      data-card-key={card.key}
      className={`plate-card${fullArt ? " plate-card--full-art" : ""}`}
      style={{ order: card.order, display: card.display }}
      onPointerMove={card.holo ? onPointerMove : undefined}
      onPointerLeave={card.holo ? onPointerLeave : undefined}
      onPointerEnter={onSelect ? () => preloadImage(card.photoUrl) : undefined}
      onFocus={onSelect ? () => preloadImage(card.photoUrl) : undefined}
      onClick={onSelect ? () => onSelect(card) : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(card);
              }
            }
          : undefined
      }
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `View ${card.title} full size` : undefined}
    >
      <div className="plate-card-tilt" style={{ transform: `rotate(${card.tilt}deg)` }}>
        <div ref={innerRef} className="plate-card-inner">
          <div className="plate-card-front">
            {fullArt ? (
              <div className="plate-card-photo plate-card-photo--full">
                {card.photoUrl ? (
                  <Image
                    src={card.photoUrl}
                    alt={card.title}
                    fill
                    unoptimized={isLocalPreview}
                    sizes={zoomedSizes}
                    style={{
                      objectFit: "cover",
                      objectPosition: `${crop.x}% ${crop.y}%`,
                      transform: `scale(${crop.zoom})`,
                    }}
                  />
                ) : (
                  <div className="plate-card-photo-placeholder">Drop a photograph</div>
                )}
                {card.holo && <span className="card-holo-sheen" data-rarity={card.rarity} />}
                <CardCaptionOverlay card={card} />
              </div>
            ) : (
              <>
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
              </>
            )}
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
