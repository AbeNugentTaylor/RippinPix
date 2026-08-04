"use client";

import Image from "next/image";
import type { CardConfig } from "@/lib/types";

interface ImportedListProps {
  configs: Record<string, CardConfig>;
  onDeleted: () => void;
}

export default function ImportedList({ configs, onDeleted }: ImportedListProps) {
  const entries = Object.entries(configs).sort(([a], [b]) => a.localeCompare(b));

  const remove = async (key: string) => {
    await fetch(`/api/card-config?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    onDeleted();
  };

  return (
    <div className="cfg-panel cfg-imported">
      <h2 className="cfg-panel-title">Saved cards ({entries.length})</h2>
      <div className="cfg-imported-list">
        {entries.length === 0 && <p className="cfg-empty">Nothing saved yet.</p>}
        {entries.map(([key, config]) => (
          <div className="cfg-imported-row" key={key}>
            <div className="cfg-imported-thumb">
              <Image
                src={`/photos/${config.designId}/${config.fileName}`}
                alt={config.title ?? key}
                fill
                unoptimized
                style={{
                  objectFit: "cover",
                  objectPosition: `${config.crop.x}% ${config.crop.y}%`,
                  transform: `scale(${config.crop.zoom})`,
                }}
              />
            </div>
            <div className="cfg-imported-meta">
              <strong>{key}</strong>
              <span>
                {config.rarity}
                {config.holo ? " · holo" : ""}
              </span>
              <span>{config.title}</span>
            </div>
            <button type="button" onClick={() => remove(key)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
