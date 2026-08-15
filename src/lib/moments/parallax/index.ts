// Measured depth from real footage. Orchestrates: pick the partner frame
// with the most parallax against the reference, track a dense grid between
// them, solve two-view geometry, triangulate, and densify into a DepthMap.
// Falls back (returns a diagnosis, not a depth) when the clip has no usable
// parallax — e.g. a pure pan — so the caller can use AI depth instead and
// say why.

import type { DepthMap } from "../depth";
import { buildPyramid, toGrayscale, trackGrid, type Pyramid } from "./lk";
import { parallaxResiduals, solveTwoView } from "./twoview";
import { densify } from "./densify";

export interface MeasuredDepthStats {
  partnerIndex: number;
  trackCount: number;
  inliers: number;
  medianParallaxPx: number;
  /** Fraction of tracked grid points that produced a real 3D measurement. */
  measuredFraction: number;
}

export interface TrackVector {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Residual parallax in px (0 = fully explained by rotation). */
  parallax: number;
}

export type MeasuredDepthResult =
  | { status: "ok"; depth: DepthMap; stats: MeasuredDepthStats; tracks: TrackVector[] }
  | { status: "no-parallax"; medianParallaxPx: number; tracks: TrackVector[] }
  | { status: "too-few-tracks"; trackCount: number };

// A pan/static clip: homography explains nearly all motion. Below this median
// residual (px) triangulation would just amplify noise.
const MIN_PARALLAX_PX = 1.2;
const MIN_TRACKS = 60;
const COARSE_STEP = 14; // partner scouting
const FINE_STEP = 6; // final measurement grid
const MIN_MEASURED_INVZ_SAMPLES = 40;

export async function measureDepthFromVideo(
  frames: { canvas: HTMLCanvasElement; time: number }[],
  refIndex: number,
  onProgress?: (message: string, fraction: number | null) => void
): Promise<MeasuredDepthResult> {
  const ref = frames[refIndex];
  const refPyr = buildPyramid(toGrayscale(ref.canvas));

  // Scout a handful of candidate partners spread across the clip; the best
  // partner is the one with the largest median residual parallax (most
  // baseline), not just the farthest in time.
  const candidates = pickCandidateIndices(frames.length, refIndex);
  let best: { index: number; pyr: Pyramid; median: number } | null = null;
  for (let c = 0; c < candidates.length; c++) {
    onProgress?.("Scanning clip for parallax", c / candidates.length);
    const idx = candidates[c];
    const pyr = buildPyramid(toGrayscale(frames[idx].canvas));
    const tracks = await trackGrid(refPyr, pyr, COARSE_STEP);
    if (tracks.length < MIN_TRACKS / 2) continue;
    const med = median(parallaxResiduals(tracks));
    if (!best || med > best.median) best = { index: idx, pyr, median: med };
  }
  if (!best) return { status: "too-few-tracks", trackCount: 0 };

  onProgress?.("Tracking the footage", null);
  const tracks = await trackGrid(refPyr, best.pyr, FINE_STEP, (f) =>
    onProgress?.("Tracking the footage", f)
  );
  if (tracks.length < MIN_TRACKS) return { status: "too-few-tracks", trackCount: tracks.length };

  const residuals = parallaxResiduals(tracks);
  const vectors: TrackVector[] = tracks.map((t, i) => ({ ...t, parallax: residuals[i] }));
  const medPar = median(residuals);
  if (medPar < MIN_PARALLAX_PX) {
    return { status: "no-parallax", medianParallaxPx: medPar, tracks: vectors };
  }

  onProgress?.("Solving camera motion", null);
  const two = solveTwoView(tracks, ref.canvas.width, ref.canvas.height);
  if (!two) return { status: "no-parallax", medianParallaxPx: medPar, tracks: vectors };

  // Only trust triangulations where this track actually exhibited parallax —
  // homography-consistent points (e.g. distant background under near-pure
  // rotation) have unbounded depth noise.
  const samples: { x: number; y: number; invz: number }[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const d = two.depths[i];
    if (!isNaN(d) && d > 0 && residuals[i] > MIN_PARALLAX_PX * 0.6) {
      samples.push({ x: tracks[i].x0, y: tracks[i].y0, invz: 1 / d });
    }
  }
  if (samples.length < MIN_MEASURED_INVZ_SAMPLES) {
    return { status: "no-parallax", medianParallaxPx: medPar, tracks: vectors };
  }

  onProgress?.("Filling in between measurements", null);
  await new Promise((r) => setTimeout(r, 0)); // let the progress paint
  const depth = densify(ref.canvas, samples, FINE_STEP);

  return {
    status: "ok",
    depth,
    stats: {
      partnerIndex: best.index,
      trackCount: tracks.length,
      inliers: two.inliers,
      medianParallaxPx: medPar,
      measuredFraction: samples.length / tracks.length,
    },
    tracks: vectors,
  };
}

function pickCandidateIndices(total: number, refIndex: number): number[] {
  // Mix near neighbors of the reference (short baselines survive motion blur
  // — handheld clips often only track across a few tenths of a second) with
  // frames spread across the whole clip (bigger baselines when they do
  // track). The scout phase then keeps whichever actually measures the most
  // parallax.
  const wanted = [
    refIndex - 1,
    refIndex + 1,
    refIndex - 2,
    refIndex + 2,
    refIndex - 4,
    refIndex + 4,
    0,
    Math.floor(total / 4),
    Math.floor(total / 2),
    Math.floor((3 * total) / 4),
    total - 1,
  ];
  const out: number[] = [];
  for (const i of wanted) {
    if (i >= 0 && i < total && i !== refIndex && !out.includes(i)) out.push(i);
  }
  return out;
}

function median(arr: Float32Array): number {
  if (arr.length === 0) return 0;
  const sorted = Array.from(arr).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
