"use client";

import { useCallback, useRef, useState } from "react";
import MomentViewer, { type ViewerMode } from "./MomentViewer";
import {
  extractFrames,
  frameFromImage,
  isVideoFile,
  type FrameCandidate,
} from "@/lib/moments/frame-extract";
import { estimateDepth, preloadDepthModel, type DepthMap } from "@/lib/moments/depth";

type Stage = "idle" | "working" | "view";

interface Progress {
  message: string;
  fraction: number | null;
}

// How many alternate frames to offer in the strip. Picked for temporal
// spread + sharpness, so a bad auto-pick is one tap away from fixed.
const STRIP_SIZE = 6;

// Sharpest-first, but never two frames from the same instant: greedily take
// the sharpest frame whose time isn't within `minGap` of an already-taken one.
function pickStrip(frames: FrameCandidate[], duration: number): FrameCandidate[] {
  const bySharpness = [...frames].sort((a, b) => b.sharpness - a.sharpness);
  const minGap = duration / (STRIP_SIZE * 2);
  const picked: FrameCandidate[] = [];
  for (const f of bySharpness) {
    if (picked.length >= STRIP_SIZE) break;
    if (picked.every((p) => Math.abs(p.time - f.time) >= minGap)) picked.push(f);
  }
  return picked.sort((a, b) => a.time - b.time);
}

export default function MomentsApp() {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<Progress>({ message: "", fraction: null });
  const [error, setError] = useState<string | null>(null);
  const [strip, setStrip] = useState<FrameCandidate[]>([]);
  const [frame, setFrame] = useState<HTMLCanvasElement | null>(null);
  const [depthMap, setDepthMap] = useState<DepthMap | null>(null);
  const [mode, setMode] = useState<ViewerMode>("photo");
  const [relief, setRelief] = useState(0.8);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Guards against a stale async run clobbering a newer capture.
  const runId = useRef(0);

  const runDepth = useCallback(async (candidate: FrameCandidate, id: number) => {
    setStage("working");
    setProgress({ message: "Estimating depth", fraction: null });
    try {
      const depth = await estimateDepth(candidate.canvas, (message, fraction) => {
        if (runId.current === id) setProgress({ message, fraction });
      });
      if (runId.current !== id) return;
      setFrame(candidate.canvas);
      setDepthMap(depth);
      setStage("view");
    } catch (err) {
      if (runId.current !== id) return;
      setError(err instanceof Error ? err.message : "Depth estimation failed.");
      setStage("idle");
    }
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      const id = ++runId.current;
      setError(null);
      setFrame(null);
      setDepthMap(null);
      setStage("working");
      // Model download (first visit only) overlaps with frame extraction.
      preloadDepthModel((message, fraction) => {
        if (runId.current === id) setProgress({ message, fraction });
      });
      try {
        let candidates: FrameCandidate[];
        if (isVideoFile(file)) {
          setProgress({ message: "Reading video frames", fraction: null });
          const frames = await extractFrames(file, (done, total) => {
            if (runId.current === id)
              setProgress({ message: "Reading video frames", fraction: done / total });
          });
          const duration = frames[frames.length - 1].time;
          candidates = pickStrip(frames, Math.max(duration, 0.001));
        } else {
          candidates = [await frameFromImage(file)];
        }
        if (runId.current !== id) return;
        setStrip(candidates);
        const sharpest = candidates.reduce((a, b) => (b.sharpness > a.sharpness ? b : a));
        await runDepth(sharpest, id);
      } catch (err) {
        if (runId.current !== id) return;
        setError(err instanceof Error ? err.message : "Couldn't read that file.");
        setStage("idle");
      }
    },
    [runDepth]
  );

  const reset = useCallback(() => {
    runId.current++;
    setStage("idle");
    setStrip([]);
    setFrame(null);
    setDepthMap(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // iOS requires an explicit permission gesture before tilt events flow.
  const enableTilt = useCallback(() => {
    const D = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    D.requestPermission?.().catch(() => {});
  }, []);

  return (
    <main className="moments-root">
      <header className="moments-header">
        <h1>3D Moments</h1>
        <p>Shoot a quick clip or photo — get a lo-fi 3D memory you can peer around.</p>
      </header>

      {stage !== "view" && (
        <section className="moments-capture">
          <label className="moments-drop">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
              disabled={stage === "working"}
            />
            {stage === "working" ? (
              <div className="moments-progress">
                <span>{progress.message}…</span>
                <div className="moments-bar">
                  <div
                    className="moments-bar-fill"
                    style={{
                      width: progress.fraction === null ? "100%" : `${Math.round(progress.fraction * 100)}%`,
                    }}
                    data-indeterminate={progress.fraction === null || undefined}
                  />
                </div>
              </div>
            ) : (
              <span className="moments-drop-hint">
                Tap to record or pick a video / photo
                <small>Everything runs on your device — nothing is uploaded.</small>
              </span>
            )}
          </label>
          {error && <p className="moments-error">{error}</p>}
        </section>
      )}

      {stage === "view" && frame && depthMap && (
        <section className="moments-stage">
          <MomentViewer frame={frame} depth={depthMap} mode={mode} relief={relief} />
          <div className="moments-controls">
            <div className="moments-buttons">
              <button
                type="button"
                data-active={mode === "photo" || undefined}
                onClick={() => setMode("photo")}
              >
                Photo
              </button>
              <button
                type="button"
                data-active={mode === "particles" || undefined}
                onClick={() => setMode("particles")}
              >
                Particles
              </button>
              <button type="button" onClick={enableTilt}>
                Enable tilt
              </button>
              <button type="button" onClick={reset}>
                New capture
              </button>
            </div>
            <label className="moments-slider">
              Depth
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={relief}
                onChange={(e) => setRelief(Number(e.target.value))}
              />
            </label>
            {strip.length > 1 && (
              <div className="moments-strip">
                {strip.map((c) => (
                  <button
                    key={c.time}
                    type="button"
                    data-active={c.canvas === frame || undefined}
                    onClick={() => {
                      if (c.canvas !== frame) runDepth(c, ++runId.current);
                    }}
                  >
                    <StripThumb candidate={c} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function StripThumb({ candidate }: { candidate: FrameCandidate }) {
  // Thumbnails render the extracted canvas via data URL once; the canvases
  // are small enough (≤1024px) that this is cheap.
  const [src] = useState(() => {
    const c = document.createElement("canvas");
    const scale = 96 / candidate.canvas.height;
    c.width = Math.round(candidate.canvas.width * scale);
    c.height = 96;
    c.getContext("2d")!.drawImage(candidate.canvas, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  });
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`Frame at ${candidate.time.toFixed(1)}s`} />;
}
