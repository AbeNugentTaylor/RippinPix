"use client";

import Image from "next/image";
import { useRef } from "react";

export interface UploadImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface PhotoPickerProps {
  images: UploadImage[];
  onAdd: (files: File[]) => void;
  onSelect: (image: UploadImage) => void;
  onRemove: (id: string) => void;
  selectedId?: string | null;
  // True while picked files are being compressed (remote mode only) — the
  // picker stays disabled and says so rather than looking stuck.
  busy?: boolean;
}

// Phone-friendly counterpart to FolderBrowser: no filesystem to browse from a
// phone, so this hands off to the device's native photo picker instead —
// on iOS/Android that picker surfaces whatever Lightroom mobile just
// exported/shared to the camera roll. Works from a laptop browser too.
export default function PhotoPicker({ images, onAdd, onSelect, onRemove, selectedId, busy = false }: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="cfg-panel cfg-picker">
      <h2 className="cfg-panel-title">Photos from this device</h2>
      <p className="cfg-picker-hint">
        In Lightroom, export/share the picks to your camera roll first, then choose them here.
      </p>
      <button type="button" className="cfg-picker-btn" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Compressing…" : "Choose photos…"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onAdd(files);
          e.target.value = "";
        }}
      />
      {images.length === 0 ? (
        <p className="cfg-empty">No photos picked yet.</p>
      ) : (
        <div className="cfg-image-grid">
          {images.map((img) => (
            <div key={img.id} className="cfg-image-thumb-wrap">
              <button
                type="button"
                className={`cfg-image-thumb${img.id === selectedId ? " cfg-image-thumb--active" : ""}`}
                onClick={() => onSelect(img)}
                title={img.file.name}
              >
                <Image src={img.previewUrl} alt={img.file.name} fill unoptimized sizes="120px" style={{ objectFit: "cover" }} />
                <span className="cfg-image-thumb-name">{img.file.name}</span>
              </button>
              <button
                type="button"
                className="cfg-image-thumb-remove"
                title="Remove from list (does not affect your photo library)"
                onClick={() => onRemove(img.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
