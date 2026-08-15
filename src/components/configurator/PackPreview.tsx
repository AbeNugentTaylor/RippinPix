"use client";

import type { Design } from "@/lib/types";

// Lightweight CSS stand-in for the canvas art PackScene paints onto the 3D
// pack (see makeArtTexture there): stock-colored front, hand-drawn double
// border, marker-font label lines and sub line. Close enough to judge a
// label edit without spinning up three.js in the configurator.
export default function PackPreview({ design }: { design: Design }) {
  return (
    <div className="cfg-pack-preview" style={{ background: design.stock }}>
      <div className="cfg-pack-preview-crimp" style={{ background: design.foil }} />
      <div className="cfg-pack-preview-border">
        <div className="cfg-pack-preview-art">
          {design.art.map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </div>
        {design.sub && <p className="cfg-pack-preview-sub">{design.sub}</p>}
      </div>
      <div className="cfg-pack-preview-crimp" style={{ background: design.foil }} />
    </div>
  );
}
