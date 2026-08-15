"use client";

import { useEffect, useRef, useState } from "react";
import { drawPackArt, PACK_ART_H, PACK_ART_W, SHOP_NAME } from "@/lib/pack-art";
import type { Design } from "@/lib/types";

interface PackPreviewProps {
  design: Design;
  // 1-based series number printed in the pack's "no.N" stamp. The live site
  // derives it from the design's position in the run, so pass that through
  // rather than guessing, or the preview lies about the stamp.
  designNumber: number;
}

// The real thing: the exact canvas PackScene textures the 3D pack with (see
// lib/pack-art.ts), not a CSS lookalike. That's the point — collisions like
// the LIMITED RUN banner running through a long label line only show up in
// the actual render.
export default function PackPreview({ design, designNumber }: PackPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Which art key is currently painted — "still rendering" is derived from it
  // rather than being its own flag flipped inside the effect.
  const [drawnKey, setDrawnKey] = useState<string | null>(null);

  // Redraw on any field the art actually reads. Serialized rather than
  // depending on `design` itself, since the editor rebuilds that object on
  // every keystroke and would otherwise redraw on unrelated changes.
  const artKey = JSON.stringify([
    design.stock,
    design.art,
    design.sub,
    design.limited ?? false,
    design.locked ?? false,
    designNumber,
  ]);

  useEffect(() => {
    let cancelled = false;
    drawPackArt(design, { shopName: SHOP_NAME, designNumber })
      .then((art) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, PACK_ART_W, PACK_ART_H);
        ctx.drawImage(art, 0, 0);
        setDrawnKey(artKey);
      })
      .catch(() => {
        if (!cancelled) setDrawnKey(artKey);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artKey]);

  return (
    <div className="cfg-pack-preview">
      <canvas
        ref={canvasRef}
        width={PACK_ART_W}
        height={PACK_ART_H}
        className="cfg-pack-preview-canvas"
        aria-label={`Pack front for ${design.name}`}
      />
      {drawnKey === null && <span className="cfg-pack-preview-loading">Rendering…</span>}
    </div>
  );
}
