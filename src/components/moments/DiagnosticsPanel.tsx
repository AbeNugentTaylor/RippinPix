"use client";

import { useEffect, useRef } from "react";
import type { DepthMap } from "@/lib/moments/depth";
import type { MeasuredDepthResult } from "@/lib/moments/parallax";
import type { FrameCandidate } from "@/lib/moments/frame-extract";

interface DiagnosticsPanelProps {
  frame: HTMLCanvasElement;
  measured: MeasuredDepthResult | null;
  aiDepth: DepthMap | null;
  aiError: string | null;
  allFrames: FrameCandidate[];
}

// Blue (no parallax) → red (strong parallax), for the track overlay.
function parallaxColor(p: number, max: number): string {
  const t = Math.min(1, p / (max || 1));
  const r = Math.round(40 + 215 * t);
  const b = Math.round(255 - 215 * t);
  return `rgba(${r}, ${Math.round(80 + 60 * (1 - t))}, ${b}, 0.85)`;
}

function drawDepth(canvas: HTMLCanvasElement, depth: DepthMap) {
  canvas.width = depth.width;
  canvas.height = depth.height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(depth.width, depth.height);
  for (let i = 0; i < depth.data.length; i++) {
    // Simple inferno-ish ramp: dark purple → orange → light yellow.
    const t = depth.data[i];
    img.data[i * 4] = Math.round(255 * Math.min(1, t * 1.6));
    img.data[i * 4 + 1] = Math.round(255 * Math.max(0, t * 1.4 - 0.35));
    img.data[i * 4 + 2] = Math.round(255 * Math.max(0, 0.45 - t) + 255 * Math.max(0, t - 0.8) * 2);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export default function DiagnosticsPanel({
  frame,
  measured,
  aiDepth,
  aiError,
  allFrames,
}: DiagnosticsPanelProps) {
  const tracksRef = useRef<HTMLCanvasElement | null>(null);
  const measuredRef = useRef<HTMLCanvasElement | null>(null);
  const aiRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = tracksRef.current;
    if (!canvas) return;
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(frame, 0, 0);
    ctx.filter = "none";
    const tracks =
      measured && (measured.status === "ok" || measured.status === "no-parallax")
        ? measured.tracks
        : [];
    if (tracks.length) {
      let max = 0;
      for (const t of tracks) max = Math.max(max, t.parallax);
      ctx.lineWidth = Math.max(1, frame.width / 400);
      for (const t of tracks) {
        ctx.strokeStyle = parallaxColor(t.parallax, max);
        ctx.beginPath();
        ctx.moveTo(t.x0, t.y0);
        ctx.lineTo(t.x1, t.y1);
        ctx.stroke();
      }
    }
  }, [frame, measured]);

  useEffect(() => {
    if (measuredRef.current && measured?.status === "ok") drawDepth(measuredRef.current, measured.depth);
  }, [measured]);

  useEffect(() => {
    if (aiRef.current && aiDepth) drawDepth(aiRef.current, aiDepth);
  }, [aiDepth]);

  let summary: string;
  if (!measured) {
    summary = allFrames.length > 1 ? "Measured pipeline didn't run." : "Still photo — nothing to track, AI depth only.";
  } else if (measured.status === "ok") {
    const s = measured.stats;
    const partnerTime = allFrames[s.partnerIndex]?.time;
    summary =
      `${s.trackCount} tracks · ${s.inliers} pose inliers · ` +
      `median parallax ${s.medianParallaxPx.toFixed(1)}px · ` +
      `${Math.round(s.measuredFraction * 100)}% triangulated` +
      (partnerTime !== undefined ? ` · partner frame @ ${partnerTime.toFixed(1)}s` : "");
  } else if (measured.status === "no-parallax") {
    summary =
      `Pan or static shot: median parallax ${measured.medianParallaxPx.toFixed(1)}px after removing ` +
      "camera rotation — nothing to triangulate. Move sideways while filming for real 3D.";
  } else {
    summary = `Only ${measured.trackCount} trackable points (blur or low texture) — couldn't measure.`;
  }

  return (
    <div className="moments-diag">
      <p className="moments-diag-summary">{summary}</p>
      <div className="moments-diag-maps">
        <figure>
          <canvas ref={tracksRef} />
          <figcaption>Tracked motion (red = parallax)</figcaption>
        </figure>
        {measured?.status === "ok" && (
          <figure>
            <canvas ref={measuredRef} />
            <figcaption>Measured depth (bright = near)</figcaption>
          </figure>
        )}
        {aiDepth ? (
          <figure>
            <canvas ref={aiRef} />
            <figcaption>AI depth estimate</figcaption>
          </figure>
        ) : (
          <figure>
            <div className="moments-diag-missing">{aiError ?? "AI depth still loading…"}</div>
            <figcaption>AI depth estimate</figcaption>
          </figure>
        )}
      </div>
    </div>
  );
}
