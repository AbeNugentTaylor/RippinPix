// Pyramidal Lucas–Kanade tracking on a regular grid of points, plus the
// grayscale pyramid it runs on. This is the "read the actual footage" half of
// the measured-depth pipeline: every surviving track is a real observation of
// how a piece of the scene moved between two frames.

export interface Pyramid {
  levels: { data: Float32Array; width: number; height: number }[];
}

export interface Track {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const LK_LEVELS = 4;
const LK_HALF_WIN = 10; // 21×21 window
const LK_ITERS = 12;
const FB_THRESHOLD = 0.8; // forward-backward error gate, px

export function toGrayscale(canvas: HTMLCanvasElement): {
  data: Float32Array;
  width: number;
  height: number;
} {
  const { width, height } = canvas;
  const px = canvas
    .getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, width, height).data;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
  }
  return { data: gray, width, height };
}

function downsample(src: Float32Array, w: number, h: number) {
  const w2 = w >> 1;
  const h2 = h >> 1;
  const out = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      const o = 2 * y * w + 2 * x;
      out[y * w2 + x] = 0.25 * (src[o] + src[o + 1] + src[o + w] + src[o + w + 1]);
    }
  }
  return { data: out, width: w2, height: h2 };
}

export function buildPyramid(gray: { data: Float32Array; width: number; height: number }): Pyramid {
  const levels = [gray];
  for (let l = 1; l < LK_LEVELS; l++) {
    const prev = levels[l - 1];
    if (prev.width < 32 || prev.height < 32) break;
    levels.push(downsample(prev.data, prev.width, prev.height));
  }
  return { levels };
}

function bilinear(img: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) return 0;
  const fx = x - x0;
  const fy = y - y0;
  const o = y0 * w + x0;
  return (
    img[o] * (1 - fx) * (1 - fy) +
    img[o + 1] * fx * (1 - fy) +
    img[o + w] * (1 - fx) * fy +
    img[o + w + 1] * fx * fy
  );
}

/**
 * Track one point from pyramid A to pyramid B. Returns the location in B or
 * null when the point leaves the frame or the local system is degenerate
 * (flat texture — the aperture problem).
 */
function trackPoint(pa: Pyramid, pb: Pyramid, x: number, y: number): { x: number; y: number } | null {
  const top = pa.levels.length - 1;
  let gx = 0;
  let gy = 0; // guess displacement at current level
  for (let l = top; l >= 0; l--) {
    const A = pa.levels[l];
    const B = pb.levels[l];
    const s = 1 / (1 << l);
    const px = x * s;
    const py = y * s;

    // Precompute template patch + gradients (central differences on A).
    const size = 2 * LK_HALF_WIN + 1;
    const patch = new Float32Array(size * size);
    const gradX = new Float32Array(size * size);
    const gradY = new Float32Array(size * size);
    let a11 = 0;
    let a12 = 0;
    let a22 = 0;
    for (let dy = -LK_HALF_WIN; dy <= LK_HALF_WIN; dy++) {
      for (let dx = -LK_HALF_WIN; dx <= LK_HALF_WIN; dx++) {
        const i = (dy + LK_HALF_WIN) * size + (dx + LK_HALF_WIN);
        patch[i] = bilinear(A.data, A.width, A.height, px + dx, py + dy);
        const ix =
          0.5 *
          (bilinear(A.data, A.width, A.height, px + dx + 1, py + dy) -
            bilinear(A.data, A.width, A.height, px + dx - 1, py + dy));
        const iy =
          0.5 *
          (bilinear(A.data, A.width, A.height, px + dx, py + dy + 1) -
            bilinear(A.data, A.width, A.height, px + dx, py + dy - 1));
        gradX[i] = ix;
        gradY[i] = iy;
        a11 += ix * ix;
        a12 += ix * iy;
        a22 += iy * iy;
      }
    }
    const det = a11 * a22 - a12 * a12;
    if (det < 1e-4 || a11 + a22 < 1) return null; // untextured window
    const i11 = a22 / det;
    const i12 = -a12 / det;
    const i22 = a11 / det;

    for (let it = 0; it < LK_ITERS; it++) {
      let b1 = 0;
      let b2 = 0;
      for (let dy = -LK_HALF_WIN; dy <= LK_HALF_WIN; dy++) {
        for (let dx = -LK_HALF_WIN; dx <= LK_HALF_WIN; dx++) {
          const i = (dy + LK_HALF_WIN) * size + (dx + LK_HALF_WIN);
          const diff =
            bilinear(B.data, B.width, B.height, px + gx + dx, py + gy + dy) - patch[i];
          b1 += diff * gradX[i];
          b2 += diff * gradY[i];
        }
      }
      const ux = -(i11 * b1 + i12 * b2);
      const uy = -(i12 * b1 + i22 * b2);
      gx += ux;
      gy += uy;
      if (ux * ux + uy * uy < 0.0009) break;
    }
    if (l > 0) {
      gx *= 2;
      gy *= 2;
    }
  }
  const rx = x + gx;
  const ry = y + gy;
  const base = pb.levels[0];
  if (rx < 1 || ry < 1 || rx > base.width - 2 || ry > base.height - 2) return null;
  return { x: rx, y: ry };
}

/**
 * Track a regular grid of points A→B with a forward-backward consistency
 * check, yielding periodically so long runs don't freeze the UI.
 */
export async function trackGrid(
  pa: Pyramid,
  pb: Pyramid,
  step: number,
  onProgress?: (fraction: number) => void
): Promise<Track[]> {
  const { width, height } = pa.levels[0];
  const tracks: Track[] = [];
  const margin = LK_HALF_WIN + 2;
  const rows: number[] = [];
  for (let y = margin; y < height - margin; y += step) rows.push(y);
  for (let r = 0; r < rows.length; r++) {
    const y = rows[r];
    for (let x = margin; x < width - margin; x += step) {
      const fwd = trackPoint(pa, pb, x, y);
      if (!fwd) continue;
      const back = trackPoint(pb, pa, fwd.x, fwd.y);
      if (!back) continue;
      const err = Math.hypot(back.x - x, back.y - y);
      if (err < FB_THRESHOLD) tracks.push({ x0: x, y0: y, x1: fwd.x, y1: fwd.y });
    }
    onProgress?.((r + 1) / rows.length);
    if (r % 8 === 7) await new Promise((res) => setTimeout(res, 0));
  }
  return tracks;
}
