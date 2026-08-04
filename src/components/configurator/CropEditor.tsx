"use client";

import Image from "next/image";
import { useRef, useState, type PointerEvent } from "react";
import type { Crop } from "@/lib/types";

async function describeLoadFailure(src: string): Promise<string> {
  try {
    const res = await fetch(src);
    const body = await res.json();
    return body.error ?? "Could not load this photo.";
  } catch {
    return "Could not load this photo.";
  }
}

interface CropEditorProps {
  src: string;
  crop: Crop;
  onChange: (crop: Crop) => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Drag pans (adjusts crop.x/y, the CSS object-position), a zoom slider next
// to this component adjusts crop.zoom (a scale() on top of object-fit:cover).
// Same three numbers Card.tsx applies on the live site.
export default function CropEditor({ src, crop, onChange }: CropEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startCropX: number; startCropY: number } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startCropX: crop.x, startCropY: crop.y };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
    onChange({
      ...crop,
      x: clamp(dragRef.current.startCropX - dxPct, 0, 100),
      y: clamp(dragRef.current.startCropY - dyPct, 0, 100),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className={`cfg-crop-frame${dragging ? " cfg-crop-frame--dragging" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        onDragStart={(e) => e.preventDefault()}
        onLoad={() => setError(null)}
        onError={() => {
          describeLoadFailure(src).then(setError);
        }}
        style={{
          objectFit: "cover",
          objectPosition: `${crop.x}% ${crop.y}%`,
          transform: `scale(${crop.zoom})`,
        }}
      />
      {error && <p className="cfg-crop-error">{error}</p>}
    </div>
  );
}
