// Edge-aware densification: spread sparse measured inverse-depths across the
// frame with color-gradient-weighted Jacobi relaxation (the trick behind
// scribble-colorization and AR depth densification). Depth flows freely
// inside smooth regions and stops at image edges, so the fill respects
// object boundaries instead of blurring across them.

import type { DepthMap } from "../depth";

export interface SparseSample {
  x: number; // pixel coords in the reference frame
  y: number;
  invz: number;
}

const ITERATIONS = 420;
const EDGE_SHARPNESS = 16; // higher = depth stops harder at color edges

export function densify(
  frame: HTMLCanvasElement,
  samples: SparseSample[],
  gridStep: number
): DepthMap {
  const gw = Math.max(8, Math.round(frame.width / gridStep));
  const gh = Math.max(8, Math.round(frame.height / gridStep));

  // Downscale the frame to grid resolution for the edge weights.
  const small = document.createElement("canvas");
  small.width = gw;
  small.height = gh;
  const ctx = small.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(frame, 0, 0, gw, gh);
  const px = ctx.getImageData(0, 0, gw, gh).data;

  // Robust range for the data: clip crazy triangulations before they anchor
  // the whole field.
  const values = samples.map((s) => s.invz).sort((a, b) => a - b);
  const lo = values[Math.floor(values.length * 0.02)];
  const hi = values[Math.floor(values.length * 0.98)] || lo + 1;

  const data = new Float32Array(gw * gh);
  const anchor = new Float32Array(gw * gh); // accumulated measurements
  const count = new Float32Array(gw * gh);
  for (const s of samples) {
    const gx = Math.min(gw - 1, Math.round((s.x / frame.width) * (gw - 1)));
    const gy = Math.min(gh - 1, Math.round((s.y / frame.height) * (gh - 1)));
    anchor[gy * gw + gx] += Math.min(hi, Math.max(lo, s.invz));
    count[gy * gw + gx]++;
  }
  let seedSum = 0;
  let seedN = 0;
  for (let i = 0; i < count.length; i++) {
    if (count[i] > 0) {
      anchor[i] /= count[i];
      seedSum += anchor[i];
      seedN++;
    }
  }
  const mean = seedN ? seedSum / seedN : 1;
  for (let i = 0; i < data.length; i++) data[i] = count[i] > 0 ? anchor[i] : mean;

  // Edge weights between horizontal / vertical neighbors.
  const wx = new Float32Array(gw * gh);
  const wy = new Float32Array(gw * gh);
  const span = hi - lo || 1;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      const o = i * 4;
      if (x < gw - 1) {
        const o2 = o + 4;
        const d =
          Math.abs(px[o] - px[o2]) + Math.abs(px[o + 1] - px[o2 + 1]) + Math.abs(px[o + 2] - px[o2 + 2]);
        wx[i] = Math.exp((-EDGE_SHARPNESS * d) / 765);
      }
      if (y < gh - 1) {
        const o2 = o + gw * 4;
        const d =
          Math.abs(px[o] - px[o2]) + Math.abs(px[o + 1] - px[o2 + 1]) + Math.abs(px[o + 2] - px[o2 + 2]);
        wy[i] = Math.exp((-EDGE_SHARPNESS * d) / 765);
      }
    }
  }

  let cur = data;
  let next = new Float32Array(gw * gh);
  for (let it = 0; it < ITERATIONS; it++) {
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        if (count[i] > 0) {
          next[i] = anchor[i]; // measurements are hard constraints
          continue;
        }
        let num = 0;
        let den = 0;
        if (x > 0) {
          num += wx[i - 1] * cur[i - 1];
          den += wx[i - 1];
        }
        if (x < gw - 1) {
          num += wx[i] * cur[i + 1];
          den += wx[i];
        }
        if (y > 0) {
          num += wy[i - gw] * cur[i - gw];
          den += wy[i - gw];
        }
        if (y < gh - 1) {
          num += wy[i] * cur[i + gw];
          den += wy[i];
        }
        next[i] = den > 1e-9 ? num / den : cur[i];
      }
    }
    const tmp = cur;
    cur = next;
    next = tmp;
  }

  // Normalize to the viewer's convention: 0..1, higher = nearer.
  const out = new Float32Array(gw * gh);
  for (let i = 0; i < out.length; i++) out[i] = (Math.min(hi, Math.max(lo, cur[i])) - lo) / span;
  return { width: gw, height: gh, data: out };
}
