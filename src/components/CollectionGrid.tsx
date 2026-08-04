"use client";

import { useEffect, useRef } from "react";
import Card from "./Card";
import type { Card as CardT } from "@/lib/types";

export interface DealBatch {
  keys: string[];
  anchor: { x: number; y: number };
  reducedMotion: boolean;
}

interface FilterChip {
  id: string;
  label: string;
  bg: string;
  fg: string;
  tilt: number;
  select: () => void;
}

interface CollectionGridProps {
  shopName: string;
  packPrice: string;
  cards: CardT[];
  filterList: FilterChip[];
  hasCards: boolean;
  isEmpty: boolean;
  haulLabel: string;
  dealBatch: DealBatch | null;
}

export default function CollectionGrid({
  shopName,
  packPrice,
  cards,
  filterList,
  hasCards,
  isEmpty,
  haulLabel,
  dealBatch,
}: CollectionGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<Map<string, { outer: HTMLDivElement | null; inner: HTMLDivElement | null }>>(
    new Map()
  );

  const registerRefs = (key: string, outer: HTMLDivElement | null, inner: HTMLDivElement | null) => {
    if (outer === null && inner === null) {
      refs.current.delete(key);
    } else {
      refs.current.set(key, { outer, inner });
    }
  };

  useEffect(() => {
    if (!dealBatch || !gridRef.current) return;
    const { keys, anchor, reducedMotion } = dealBatch;

    if (reducedMotion) return; // cards render already in their resting state

    keys.forEach((key, i) => {
      const els = refs.current.get(key);
      if (!els?.outer || !els.inner) return;
      const { outer, inner } = els;
      const r = outer.getBoundingClientRect();
      const dx = anchor.x - (r.left + r.width / 2 + window.scrollX);
      const dy = anchor.y - (r.top + r.height / 2 + window.scrollY);
      const back = inner.children[1] as HTMLElement | undefined;

      outer.style.transition = "none";
      inner.style.transition = "none";
      if (back) back.style.visibility = "visible";
      outer.style.opacity = "0";
      outer.style.transform = `translate(${dx}px,${dy}px) scale(.34) rotate(${(
        (i - (keys.length - 1) / 2) *
        6
      ).toFixed(1)}deg)`;
      inner.style.transform = "rotateY(180deg)";

      requestAnimationFrame(() => {
        const d = i * 80;
        outer.style.transition = `transform 660ms cubic-bezier(.17,.89,.24,1.06) ${d}ms, opacity 180ms linear ${d}ms`;
        inner.style.transition = `transform 460ms cubic-bezier(.2,.85,.3,1) ${d + 240}ms`;
        outer.style.opacity = "1";
        outer.style.transform = "none";
        inner.style.transform = "none";
        setTimeout(() => {
          if (back) back.style.visibility = "hidden";
        }, d + 760);
      });
    });

    const top = gridRef.current.getBoundingClientRect().top + window.scrollY - 220;
    setTimeout(
      () => window.scrollTo({ top: Math.max(0, top), behavior: "smooth" }),
      340
    );
  }, [dealBatch]);

  return (
    <section className="haul">
      <div className="haul-heading-row">
        <h2 className="haul-heading">The haul</h2>
        <span className="haul-meta">{haulLabel}</span>
      </div>
      {isEmpty && <p className="haul-empty">Nothing yet. The bin&apos;s right there.</p>}
      {hasCards && (
        <div className="filter-row">
          {filterList.map((f) => (
            <button
              key={f.id}
              onClick={f.select}
              className="filter-chip"
              style={{ background: f.bg, color: f.fg, transform: `rotate(${f.tilt}deg)` }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <div ref={gridRef} className="grid">
        {cards.map((card) => (
          <Card
            key={card.key}
            card={card}
            shopName={shopName}
            packPrice={packPrice}
            registerRefs={registerRefs}
          />
        ))}
      </div>
    </section>
  );
}
