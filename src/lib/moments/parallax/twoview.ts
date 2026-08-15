// Two-view geometry: homography (to detect pans and measure residual
// parallax), essential matrix (8-point + RANSAC), pose recovery, and linear
// triangulation. Ports the standard textbook pipeline; every 3D point that
// comes out is measured from the footage, not estimated by a network.

import {
  det3,
  matVec3,
  minRightSingularVector,
  mul3,
  solveLinear,
  svd3,
  transpose3,
  type Mat3,
} from "./linalg";
import type { Track } from "./lk";

export interface CameraPose {
  R: Mat3;
  t: [number, number, number];
}

export interface TwoViewResult {
  pose: CameraPose;
  /** Per-track depth in view A (arbitrary global scale), NaN for outliers. */
  depths: Float32Array;
  inliers: number;
  /** Median residual parallax (px) after homography compensation. */
  medianParallax: number;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ---------------------------------------------------------------------------
// Homography (for pan detection + parallax residuals)
// ---------------------------------------------------------------------------

function estimateHomography(pts: Track[]): Mat3 | null {
  // DLT with h9 fixed to 1 (8×8 solve). Fine under RANSAC for our use: we
  // only need residuals, not a perfect H at infinity.
  const n = pts.length;
  const A = new Array(64).fill(0);
  const b = new Array(8).fill(0);
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (const p of pts) {
    rows.push([p.x0, p.y0, 1, 0, 0, 0, -p.x0 * p.x1, -p.y0 * p.x1]);
    rhs.push(p.x1);
    rows.push([0, 0, 0, p.x0, p.y0, 1, -p.x0 * p.y1, -p.y0 * p.y1]);
    rhs.push(p.y1);
  }
  // Normal equations: (RᵀR) h = Rᵀ y
  for (let i = 0; i < 2 * n; i++) {
    for (let r = 0; r < 8; r++) {
      b[r] += rows[i][r] * rhs[i];
      for (let c = r; c < 8; c++) A[r * 8 + c] += rows[i][r] * rows[i][c];
    }
  }
  for (let r = 1; r < 8; r++) for (let c = 0; c < r; c++) A[r * 8 + c] = A[c * 8 + r];
  const h = solveLinear(A, b, 8);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function homographyResidual(H: Mat3, t: Track): number {
  const w = H[6] * t.x0 + H[7] * t.y0 + H[8];
  if (Math.abs(w) < 1e-9) return Infinity;
  const px = (H[0] * t.x0 + H[1] * t.y0 + H[2]) / w;
  const py = (H[3] * t.x0 + H[4] * t.y0 + H[5]) / w;
  return Math.hypot(t.x1 - px, t.y1 - py);
}

/**
 * Fit the dominant homography with RANSAC and return each track's residual —
 * the motion the homography (rotation / dominant plane) cannot explain,
 * i.e. the real parallax signal.
 */
export function parallaxResiduals(tracks: Track[]): Float32Array {
  const rand = seededRandom(7);
  const n = tracks.length;
  const out = new Float32Array(n);
  if (n < 8) return out.fill(0);
  let bestH: Mat3 | null = null;
  let bestScore = -1;
  for (let iter = 0; iter < 96; iter++) {
    const sample: Track[] = [];
    const used = new Set<number>();
    while (sample.length < 4) {
      const i = Math.floor(rand() * n);
      if (!used.has(i)) {
        used.add(i);
        sample.push(tracks[i]);
      }
    }
    const H = estimateHomography(sample);
    if (!H) continue;
    let score = 0;
    for (const t of tracks) if (homographyResidual(H, t) < 2) score++;
    if (score > bestScore) {
      bestScore = score;
      bestH = H;
    }
  }
  if (!bestH) return out.fill(0);
  // Refit on inliers for a cleaner residual field.
  const inl = tracks.filter((t) => homographyResidual(bestH!, t) < 2);
  if (inl.length >= 8) bestH = estimateHomography(inl) ?? bestH;
  for (let i = 0; i < n; i++) out[i] = homographyResidual(bestH, tracks[i]);
  return out;
}

// ---------------------------------------------------------------------------
// Essential matrix + pose + triangulation
// ---------------------------------------------------------------------------

interface NormalizedTracks {
  a: Float64Array; // x,y in normalized camera coords, view A
  b: Float64Array;
}

function normalize(tracks: Track[], fx: number, cx: number, cy: number): NormalizedTracks {
  const n = tracks.length;
  const a = new Float64Array(n * 2);
  const b = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    a[i * 2] = (tracks[i].x0 - cx) / fx;
    a[i * 2 + 1] = (tracks[i].y0 - cy) / fx;
    b[i * 2] = (tracks[i].x1 - cx) / fx;
    b[i * 2 + 1] = (tracks[i].y1 - cy) / fx;
  }
  return { a, b };
}

function essentialFrom8(pts: NormalizedTracks, idx: number[]): Mat3 | null {
  const m = idx.length;
  const A: number[] = new Array(m * 9);
  for (let r = 0; r < m; r++) {
    const i = idx[r];
    const x0 = pts.a[i * 2];
    const y0 = pts.a[i * 2 + 1];
    const x1 = pts.b[i * 2];
    const y1 = pts.b[i * 2 + 1];
    A[r * 9] = x1 * x0;
    A[r * 9 + 1] = x1 * y0;
    A[r * 9 + 2] = x1;
    A[r * 9 + 3] = y1 * x0;
    A[r * 9 + 4] = y1 * y0;
    A[r * 9 + 5] = y1;
    A[r * 9 + 6] = x0;
    A[r * 9 + 7] = y0;
    A[r * 9 + 8] = 1;
  }
  const e = minRightSingularVector(A, m, 9);
  // Enforce the essential-matrix constraint: two equal singular values, one 0.
  const { U, S, V } = svd3(e as Mat3);
  const s = (S[0] + S[1]) / 2;
  const D: Mat3 = [s, 0, 0, 0, s, 0, 0, 0, 0];
  return mul3(mul3(U, D), transpose3(V));
}

function sampsonError(E: Mat3, pts: NormalizedTracks, i: number): number {
  const x0 = [pts.a[i * 2], pts.a[i * 2 + 1], 1];
  const x1 = [pts.b[i * 2], pts.b[i * 2 + 1], 1];
  const Ex0 = matVec3(E, x0);
  const Etx1 = matVec3(transpose3(E), x1);
  const x1Ex0 = x1[0] * Ex0[0] + x1[1] * Ex0[1] + x1[2] * Ex0[2];
  const denom = Ex0[0] ** 2 + Ex0[1] ** 2 + Etx1[0] ** 2 + Etx1[1] ** 2;
  return (x1Ex0 * x1Ex0) / (denom || 1e-12);
}

/** Depth of the point in view A via the midpoint of the two rays. */
function triangulateDepth(pose: CameraPose, pts: NormalizedTracks, i: number): number {
  // Ray in A: d0 = (x0, y0, 1). Ray in B expressed in A frame: d1 = Rᵀ·(x1,y1,1),
  // camera B center C = -Rᵀt. Solve least-squares for the two ray parameters.
  const d0 = [pts.a[i * 2], pts.a[i * 2 + 1], 1];
  const Rt = transpose3(pose.R);
  const d1 = matVec3(Rt, [pts.b[i * 2], pts.b[i * 2 + 1], 1]);
  const C = matVec3(Rt, pose.t).map((x) => -x);
  const d00 = d0[0] ** 2 + d0[1] ** 2 + 1;
  const d01 = d0[0] * d1[0] + d0[1] * d1[1] + d1[2];
  const d11 = d1[0] ** 2 + d1[1] ** 2 + d1[2] ** 2;
  const c0 = d0[0] * C[0] + d0[1] * C[1] + C[2];
  const c1 = d1[0] * C[0] + d1[1] * C[1] + d1[2] * C[2];
  const det = d00 * d11 - d01 * d01;
  if (Math.abs(det) < 1e-12) return NaN;
  const s = (c0 * d11 - c1 * d01) / det; // param along ray A = depth in A (z of d0·s)
  return s > 0 ? s : NaN;
}

function countCheirality(pose: CameraPose, pts: NormalizedTracks, idx: number[]): number {
  let good = 0;
  for (const i of idx) {
    const s = triangulateDepth(pose, pts, i);
    if (!isNaN(s)) {
      // Also require the point to sit in front of camera B.
      const X = [pts.a[i * 2] * s, pts.a[i * 2 + 1] * s, s];
      const zb = matVec3(pose.R, X)[2] + pose.t[2];
      if (zb > 0) good++;
    }
  }
  return good;
}

/**
 * Full two-view solve: RANSAC essential matrix on normalized tracks, pick the
 * (R, t) with the best cheirality, triangulate every inlier.
 */
export function solveTwoView(
  tracks: Track[],
  width: number,
  height: number
): TwoViewResult | null {
  if (tracks.length < 24) return null;
  const fx = 0.9 * Math.max(width, height);
  const pts = normalize(tracks, fx, width / 2, height / 2);
  const n = tracks.length;
  const rand = seededRandom(1234);
  const threshold = (1.2 / fx) ** 2; // ~1.2px Sampson gate in normalized units

  let bestE: Mat3 | null = null;
  let bestInliers: number[] = [];
  for (let iter = 0; iter < 220; iter++) {
    const idx: number[] = [];
    const used = new Set<number>();
    while (idx.length < 8) {
      const i = Math.floor(rand() * n);
      if (!used.has(i)) {
        used.add(i);
        idx.push(i);
      }
    }
    const E = essentialFrom8(pts, idx);
    if (!E) continue;
    const inl: number[] = [];
    for (let i = 0; i < n; i++) if (sampsonError(E, pts, i) < threshold) inl.push(i);
    if (inl.length > bestInliers.length) {
      bestInliers = inl;
      bestE = E;
    }
  }
  if (!bestE || bestInliers.length < 16) return null;
  // Refit on all inliers.
  bestE = essentialFrom8(pts, bestInliers) ?? bestE;

  // Decompose into the four (R, t) candidates, keep the one seeing the most
  // points in front of both cameras.
  const { U, V } = svd3(bestE);
  const W: Mat3 = [0, -1, 0, 1, 0, 0, 0, 0, 1];
  const fixDet = (M: Mat3): Mat3 => (det3(M) < 0 ? (M.map((x) => -x) as number[]) : M);
  const R1 = fixDet(mul3(mul3(U, W), transpose3(V)));
  const R2 = fixDet(mul3(mul3(U, transpose3(W)), transpose3(V)));
  const t1: [number, number, number] = [U[2], U[5], U[8]];
  const t2: [number, number, number] = [-U[2], -U[5], -U[8]];
  const candidates: CameraPose[] = [
    { R: R1, t: t1 },
    { R: R1, t: t2 },
    { R: R2, t: t1 },
    { R: R2, t: t2 },
  ];
  const sample = bestInliers.filter((_, i) => i % Math.ceil(bestInliers.length / 60) === 0);
  let pose = candidates[0];
  let bestCount = -1;
  for (const c of candidates) {
    const count = countCheirality(c, pts, sample);
    if (count > bestCount) {
      bestCount = count;
      pose = c;
    }
  }

  const inlierSet = new Set(bestInliers);
  const depths = new Float32Array(n).fill(NaN);
  for (const i of bestInliers) depths[i] = triangulateDepth(pose, pts, i);

  const residuals = parallaxResiduals(tracks);
  const sorted = Array.from(residuals).sort((a, b) => a - b);
  return {
    pose,
    depths,
    inliers: inlierSet.size,
    medianParallax: sorted[Math.floor(sorted.length / 2)] ?? 0,
  };
}
