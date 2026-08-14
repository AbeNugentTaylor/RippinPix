"use client";

import Image from "next/image";
import { useState } from "react";
import CardLightbox from "@/components/CardLightbox";
import { configToPreviewCard } from "@/lib/preview-card";
import { photoSrc } from "@/lib/photo-src";
import type { CardConfig } from "@/lib/types";

interface ImportedListProps {
  configs: Record<string, CardConfig>;
  editingKey?: string | null;
  onEdit: (key: string) => void;
  onDeleted: () => void;
  remote?: boolean;
}

export default function ImportedList({ configs, editingKey, onEdit, onDeleted, remote = false }: ImportedListProps) {
  const entries = Object.entries(configs).sort(([a], [b]) => a.localeCompare(b));
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const previewCard =
    previewKey && configs[previewKey] ? configToPreviewCard(previewKey, configs[previewKey], remote) : null;

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
          <div
            className={`cfg-imported-row${key === editingKey ? " cfg-imported-row--active" : ""}`}
            key={key}
            role="button"
            tabIndex={0}
            onClick={() => onEdit(key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEdit(key);
              }
            }}
          >
            <div className="cfg-imported-thumb">
              <Image
                src={photoSrc(config.designId, config.fileName, remote)}
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
            <div className="cfg-imported-actions">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewKey(key);
                }}
              >
                View
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(key);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <CardLightbox card={previewCard} onClose={() => setPreviewKey(null)} />
    </div>
  );
}
