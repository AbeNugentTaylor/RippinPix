"use client";

import { useCallback, useRef, useState } from "react";
import MomentViewer, { type ViewerMode } from "./MomentViewer";
import DiagnosticsPanel from "./DiagnosticsPanel";
import {
  extractFrames,
  frameFromImage,
  isVideoFile,
  type FrameCandidate,
} from "@/lib/moments/frame-extract";
import { estimateDepth, preloadDepthModel, type DepthMap } from "@/lib/moments/depth";
import { measureDepthFromVideo, type MeasuredDepthResult } from "@/lib/moments/parallax";

type Stage = "idle" | "working" | "view";
type DepthSource = "measured" | "ai";

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
  const [allFrames, setAllFrames] = useState<FrameCandidate[]>([]);
  const [strip, setStrip] = useState<FrameCandidate[]>([]);
  const [frame, setFrame] = useState<HTMLCanvasElement | null>(null);
  const [measured, setMeasured] = useState<MeasuredDepthResult | null>(null);
  const [aiDepth, setAiDepth] = useState<DepthMap | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [source, setSource] = useState<DepthSource>("measured");
  const [mode, setMode] = useState<ViewerMode>("photo");
  const [relief, setRelief] = useState(0.8);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Guards against a stale async run clobbering a newer capture.
  const runId = useRef(0);

  /**
   * Run both depth paths for a chosen reference frame: measured parallax from
   * the footage (primary) and the AI estimate (comparison + fallback). The
   * viewer opens as soon as either one lands.
   */
  const processReference = useCallback(
    async (frames: FrameCandidate[], candidate: FrameCandidate, id: number) => {
      setStage("working");
      setMeasured(null);
      setAiDepth(null);
      setAiError(null);

      // AI depth runs concurrently; it must never block a successful measured
      // capture (e.g. offline after a failed model download).
      const aiPromise = estimateDepth(candidate.canvas, (message, fraction) => {
        if (runId.current === id) setProgress({ message, fraction });
      }).then(
        (d) => {
          if (runId.current === id) setAiDepth(d);
          return d;
        },
        (err: unknown) => {
          if (runId.current === id)
            setAiError(err instanceof Error ? err.message : "AI depth failed.");
          return null;
        }
      );

      let measuredResult: MeasuredDepthResult | null = null;
      if (frames.length > 1) {
        const refIndex = frames.indexOf(
          frames.find((f) => f.canvas === candidate.canvas) ?? candidate
        );
        try {
          measuredResult = await measureDepthFromVideo(frames, refIndex, (message, fraction) => {
            if (runId.current === id) setProgress({ message, fraction });
          });
        } catch (err) {
          console.error("measured-depth pipeline failed", err);
          measuredResult = { status: "too-few-tracks", trackCount: 0 };
        }
      }
      if (runId.current !== id) return;
      setMeasured(measuredResult);

      if (measuredResult?.status === "ok") {
        setFrame(candidate.canvas);
        setSource("measured");
        setStage("view");
        return;
      }
      // No measured depth — wait for the AI path.
      setProgress({ message: "Estimating depth with AI", fraction: null });
      const ai = await aiPromise;
      if (runId.current !== id) return;
      if (ai) {
        setFrame(candidate.canvas);
        setSource("ai");
        setStage("view");
      } else {
        setError(
          frames.length > 1
            ? "Couldn't measure parallax in this clip, and the AI fallback failed too."
            : "Depth estimation failed."
        );
        setStage("idle");
      }
    },
    []
  );

  const onFile = useCallback(
    async (file: File) => {
      const id = ++runId.current;
      setError(null);
      setFrame(null);
      setStage("working");
      // Model download (first visit only) overlaps with frame extraction.
      preloadDepthModel((message, fraction) => {
        if (runId.current === id) setProgress({ message, fraction });
      });
      try {
        let frames: FrameCandidate[];
        if (isVideoFile(file)) {
          setProgress({ message: "Reading video frames", fraction: null });
          frames = await extractFrames(file, (done, total) => {
            if (runId.current === id)
              setProgress({ message: "Reading video frames", fraction: done / total });
          });
        } else {
          frames = [await frameFromImage(file)];
        }
        if (runId.current !== id) return;
        setAllFrames(frames);
        const duration = frames[frames.length - 1].time;
        setStrip(frames.length > 1 ? pickStrip(frames, Math.max(duration, 0.001)) : []);
        const sharpest = frames.reduce((a, b) => (b.sharpness > a.sharpness ? b : a));
        await processReference(frames, sharpest, id);
      } catch (err) {
        if (runId.current !== id) return;
        setError(err instanceof Error ? err.message : "Couldn't read that file.");
        setStage("idle");
      }
    },
    [processReference]
  );

  const reset = useCallback(() => {
    runId.current++;
    setStage("idle");
    setAllFrames([]);
    setStrip([]);
    setFrame(null);
    setMeasured(null);
    setAiDepth(null);
    setAiError(null);
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

  const measuredDepth = measured?.status === "ok" ? measured.depth : null;
  const activeDepth = source === "measured" ? measuredDepth : aiDepth;

  return (
    <main className="moments-root">
      <header className="moments-header">
        <h1>3D Moments</h1>
        <p>Shoot a quick clip — the parallax in your own footage becomes real 3D.</p>
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
                <small>
                  Move the camera <em>sideways</em> a little while you shoot — that motion is the
                  3D. Everything runs on your device.
                </small>
              </span>
            )}
          </label>
          {error && <p className="moments-error">{error}</p>}
        </section>
      )}

      {stage === "view" && frame && activeDepth && (
        <section className="moments-stage">
          <MomentViewer frame={frame} depth={activeDepth} mode={mode} relief={relief} />
          <div className="moments-controls">
            <div className="moments-buttons">
              <span className="moments-group-label">Depth</span>
              <button
                type="button"
                data-active={source === "measured" || undefined}
                disabled={!measuredDepth}
                title={
                  measuredDepth
                    ? "Triangulated from your footage's parallax"
                    : measured?.status === "no-parallax"
                      ? "No usable parallax in this clip (pan or static shot)"
                      : "Needs a video with sideways motion"
                }
                onClick={() => setSource("measured")}
              >
                Footage
              </button>
              <button
                type="button"
                data-active={source === "ai" || undefined}
                disabled={!aiDepth}
                title={aiError ?? "Single-frame AI depth estimate"}
                onClick={() => setSource("ai")}
              >
                AI
              </button>
              <span className="moments-group-label">View</span>
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
              <button
                type="button"
                data-active={showDiagnostics || undefined}
                onClick={() => setShowDiagnostics((v) => !v)}
              >
                Nerd stats
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
                      if (c.canvas !== frame) processReference(allFrames, c, ++runId.current);
                    }}
                  >
                    <StripThumb candidate={c} />
                  </button>
                ))}
              </div>
            )}
            {showDiagnostics && (
              <DiagnosticsPanel
                frame={frame}
                measured={measured}
                aiDepth={aiDepth}
                aiError={aiError}
                allFrames={allFrames}
              />
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
