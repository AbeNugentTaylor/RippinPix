"use client";

import Image from "next/image";
import { useMemo } from "react";
import PackPreview from "./PackPreview";
import { PER_PACK, poolsFor } from "@/lib/designs";
import { configKey } from "@/lib/card-key";
import { photoSrc } from "@/lib/photo-src";
import type { CardConfig, Design } from "@/lib/types";

interface CategoryBoardProps {
  designs: Design[];
  configs: Record<string, CardConfig>;
  activeId: string;
  onSelect: (id: string) => void;
  onEditPack: (id: string) => void;
  onAddCategory: () => void;
  onEditCard: (key: string) => void;
  // Tapping an empty slot: pick a photo for exactly this design + slot.
  onFillSlot: (designId: string, local: number) => void;
  remote?: boolean;
}

function filledCount(design: Design, configs: Record<string, CardConfig>): number {
  const total = design.packs * PER_PACK;
  let n = 0;
  for (let local = 1; local <= total; local++) {
    if (configs[configKey(design.id, local)]) n++;
  }
  return n;
}

// The configurator's home view: one tab per category so it's obvious at a
// glance what's finished and what will still fall back to placeholders, and
// per-slot entry points into the card editor.
export default function CategoryBoard({
  designs,
  configs,
  activeId,
  onSelect,
  onEditPack,
  onAddCategory,
  onEditCard,
  onFillSlot,
  remote = false,
}: CategoryBoardProps) {
  const pools = useMemo(() => poolsFor(designs), [designs]);
  const active = designs.find((d) => d.id === activeId) ?? designs[0];

  if (!active) {
    return (
      <div className="cfg-panel cfg-panel--placeholder">
        No categories yet — add one to get started.
        <button type="button" className="cfg-picker-btn" onClick={onAddCategory}>
          + New category
        </button>
      </div>
    );
  }

  const total = active.packs * PER_PACK;
  const filled = filledCount(active, configs);

  return (
    <div className="cfg-board">
      <div className="cfg-tabs" role="tablist" aria-label="Categories">
        {designs.map((d) => {
          const dTotal = d.packs * PER_PACK;
          const dFilled = filledCount(d, configs);
          const isActive = d.id === active.id;
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`cfg-tab${isActive ? " cfg-tab--active" : ""}`}
              onClick={() => onSelect(d.id)}
            >
              <span className="cfg-tab-name">{d.name}</span>
              <span className={`cfg-tab-count${dFilled >= dTotal ? " cfg-tab-count--done" : ""}`}>
                {dFilled}/{dTotal}
              </span>
            </button>
          );
        })}
        <button type="button" className="cfg-tab cfg-tab--add" onClick={onAddCategory}>
          + New category
        </button>
      </div>

      <div className="cfg-panel cfg-cat-panel">
        <div className="cfg-cat-summary">
          <PackPreview design={active} />
          <div className="cfg-cat-meta">
            <h3 className="cfg-cat-name">{active.name}</h3>
            {active.sub && <p className="cfg-cat-sub">{active.sub}</p>}
            <p className="cfg-cat-stats">
              {active.packs} pack{active.packs === 1 ? "" : "s"} · {PER_PACK} cards each · {filled}/{total} filled
              {active.limited ? " · limited run" : ""}
              {active.locked ? " · password protected" : ""}
            </p>
            <button type="button" className="cfg-cat-edit-btn" onClick={() => onEditPack(active.id)}>
              Edit pack…
            </button>
          </div>
        </div>

        {Array.from({ length: active.packs }, (_, p) => (
          <section key={p} className="cfg-pack-section">
            {active.packs > 1 && <h4 className="cfg-pack-section-title">Pack {p + 1}</h4>}
            <div className="cfg-slot-grid">
              {Array.from({ length: PER_PACK }, (_, i) => {
                const local = p * PER_PACK + i + 1;
                const key = configKey(active.id, local);
                const config = configs[key];
                const pool = pools[active.id]?.[local - 1];
                if (!config) {
                  return (
                    <button
                      key={local}
                      type="button"
                      className="cfg-slot cfg-slot--empty"
                      onClick={() => onFillSlot(active.id, local)}
                    >
                      <span className="cfg-slot-num">{local}</span>
                      <span className="cfg-slot-photo cfg-slot-photo--empty">
                        <span className="cfg-slot-plus" aria-hidden>
                          +
                        </span>
                      </span>
                      <span className="cfg-slot-title">{pool?.title}</span>
                      <span className="cfg-slot-tag">tap to add a photo</span>
                    </button>
                  );
                }
                return (
                  <button key={local} type="button" className="cfg-slot cfg-slot--filled" onClick={() => onEditCard(key)}>
                    <span className="cfg-slot-num">{local}</span>
                    <span className="cfg-slot-photo">
                      <Image
                        src={photoSrc(config.designId, config.fileName, remote)}
                        alt={config.title ?? key}
                        fill
                        unoptimized
                        sizes="160px"
                        style={{
                          objectFit: "cover",
                          objectPosition: `${config.crop.x}% ${config.crop.y}%`,
                          transform: `scale(${config.crop.zoom})`,
                        }}
                      />
                    </span>
                    <span className="cfg-slot-title">{config.title || pool?.title}</span>
                    <span className="cfg-slot-tag">
                      {config.rarity}
                      {config.holo ? " · holo" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
