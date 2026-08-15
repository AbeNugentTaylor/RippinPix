import { permanentMarker, sourceSerif } from "./font";
import { jit } from "./designs";
import type { Design } from "./types";

// The pack cover art, painted to a 2D canvas. Lives here rather than inside
// PackScene so the configurator can render exactly what the 3D pack will be
// textured with — a CSS approximation cannot show collisions between the
// label lines and the LIMITED RUN / KEEP OUT banner, which is the whole
// point of previewing a label edit before it ships.
export const PACK_ART_W = 700;
export const PACK_ART_H = 1024;

// Printed across the top of every pack. Lives here so the live scene and the
// configurator's preview can't drift apart on it.
export const SHOP_NAME = "RippinPix";

// jitter used only for the hand-drawn cover-art wobble (distinct from the
// symmetric jit() used for 3D slot placement / cardboard grime)
export function artJit(a: number, b: number, amp: number): number {
  return ((Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1) * amp;
}

export interface PackArtOptions {
  shopName: string;
  // 1-based series number, printed in the "no.N" stamp.
  designNumber: number;
}

export async function drawPackArt(
  design: Design,
  { shopName, designNumber }: PackArtOptions
): Promise<HTMLCanvasElement> {
  try {
    await document.fonts.ready;
  } catch {
    /* noop */
  }
  const markerFamily = permanentMarker.style.fontFamily;
  const serifFamily = sourceSerif.style.fontFamily;
  const W = PACK_ART_W;
  const H = PACK_ART_H;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const INK = "#1b1512";

  g.fillStyle = design.stock || "#efe7d8";
  g.fillRect(0, 0, W, H);

  const wob = (x0v: number, y0: number, x1: number, y1: number, lw: number, seed: number) => {
    g.strokeStyle = INK;
    g.lineWidth = lw;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.beginPath();
    const pts: [number, number][] = [];
    const push = (x: number, y: number, i: number) =>
      pts.push([x + artJit(i, seed, 5), y + artJit(i, seed + 3, 5)]);
    let i = 0;
    for (let x = x0v; x <= x1; x += 60) push(x, y0, i++);
    for (let y = y0; y <= y1; y += 60) push(x1, y, i++);
    for (let x = x1; x >= x0v; x -= 60) push(x, y1, i++);
    for (let y = y1; y >= y0; y -= 60) push(x0v, y, i++);
    pts.push(pts[0]);
    pts.forEach((p, n) => (n ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
  };
  wob(40, 40, W - 40, H - 40, 9, 1);
  wob(58, 58, W - 58, H - 58, 3, 9);

  g.save();
  g.translate(96, 132);
  g.rotate(-0.02);
  g.fillStyle = INK;
  g.font = `400 30px ${markerFamily}, ${serifFamily}, cursive`;
  g.fillText(shopName.toUpperCase(), 0, 0);
  g.strokeStyle = INK;
  g.lineWidth = 4;
  g.lineCap = "round";
  const mw = g.measureText(shopName).width;
  g.beginPath();
  for (let x = -4; x <= mw + 4; x += 18) {
    const yy = 14 + artJit(x, 4, 4);
    if (x === -4) g.moveTo(x, yy);
    else g.lineTo(x, yy);
  }
  g.stroke();
  g.restore();

  g.save();
  g.translate(92, 360);
  g.fillStyle = INK;
  design.art.forEach((line, i) => {
    g.save();
    g.translate(artJit(i, 6, 9), i * 132);
    g.rotate(artJit(i, 8, 0.045));
    const words = line.toUpperCase();
    let size = words.length > 6 ? 104 : 126;
    g.font = `400 ${size}px ${markerFamily}, ${serifFamily}, cursive`;
    const maxW = W - 200;
    const wNow = g.measureText(words).width;
    if (wNow > maxW) {
      size = Math.floor(size * (maxW / wNow));
      g.font = `400 ${size}px ${markerFamily}, ${serifFamily}, cursive`;
    }
    g.fillText(words, 0, 0);
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.strokeText(words, 0, 0);
    g.restore();
  });
  g.restore();

  g.save();
  g.translate(96, 790);
  g.rotate(-0.015);
  g.fillStyle = INK;
  g.font = `400 40px ${markerFamily}, ${serifFamily}, cursive`;
  g.fillText(design.sub, 0, 0);
  g.restore();

  const star = (x: number, y: number, r: number, rot: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.strokeStyle = INK;
    g.lineWidth = 5;
    g.lineCap = "round";
    for (let n = 0; n < 3; n++) {
      const A = (n / 3) * Math.PI;
      g.beginPath();
      g.moveTo(-Math.cos(A) * r, -Math.sin(A) * r);
      g.lineTo(Math.cos(A) * r, Math.sin(A) * r);
      g.stroke();
    }
    g.restore();
  };
  star(W - 118, 214, 26, 0.3);
  star(W - 176, 846, 15, -0.2);

  const banner = design.locked ? "KEEP OUT" : design.limited ? "LIMITED RUN" : null;
  if (banner) {
    g.save();
    g.translate(W - 214, 300);
    g.rotate(-0.34);
    g.fillStyle = INK;
    g.font = `400 30px ${markerFamily}, ${serifFamily}, cursive`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const bw = g.measureText(banner).width / 2 + 18;
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    for (let n = 0; n <= 20; n++) {
      const px2 = -bw + (n / 20) * bw * 2;
      const py2 = (n % 2 ? -26 : -25) + artJit(n, 3, 3);
      if (!n) g.moveTo(px2, py2);
      else g.lineTo(px2, py2);
    }
    for (let n = 0; n <= 20; n++) {
      const px2 = bw - (n / 20) * bw * 2;
      g.lineTo(px2, 26 + artJit(n, 7, 3));
    }
    g.closePath();
    g.stroke();
    g.fillText(banner, 0, 2);
    g.textAlign = "start";
    g.textBaseline = "alphabetic";
    g.restore();
  }

  g.save();
  g.translate(96, H - 108);
  g.rotate(-0.01);
  g.fillStyle = INK;
  g.font = `400 27px ${markerFamily}, ${serifFamily}, cursive`;
  g.fillText("8 PHOTOS INSIDE", 0, 0);
  g.restore();
  g.save();
  g.translate(W - 150, H - 120);
  g.rotate(0.06);
  g.strokeStyle = INK;
  g.lineWidth = 4;
  g.beginPath();
  for (let n = 0; n <= 24; n++) {
    const A = (n / 24) * Math.PI * 2;
    const rr = 40 + artJit(n, 12, 4);
    const x = Math.cos(A) * rr;
    const y = Math.sin(A) * rr * 0.78;
    if (!n) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.stroke();
  g.fillStyle = INK;
  g.font = `400 25px ${markerFamily}, ${serifFamily}, cursive`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("no." + (designNumber), 0, 2);
  g.textAlign = "start";
  g.textBaseline = "alphabetic";
  g.restore();

  for (let i = 0; i < 8; i++) {
    const x = Math.abs(jit(i, 3, 1)) * W;
    const y = Math.abs(jit(i, 7, 1)) * H;
    const r = 120 + Math.abs(jit(i, 11, 1)) * 160;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,.16)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, 6.3);
    g.fill();
  }

  return c;
}

// --- label / banner collision check -----------------------------------
//
// The LIMITED RUN (or KEEP OUT) banner sits at a fixed spot on the right,
// while the label lines grow leftward-to-rightward from x=92 — so a long
// first line runs straight through the banner. The art has always drawn
// both regardless; this reports the overlap so the configurator can warn
// before it ships. Geometry below mirrors drawPackArt's exactly; keep the
// two in step.

// A rect expressed the way canvas actually places it: an origin the context
// was translated to, a rotation *about that origin*, and the rect's extent in
// the resulting local space. Rotating about the origin rather than the rect's
// centre matters — a label line pivots around its baseline start, not its
// middle.
interface Box {
  ox: number;
  oy: number;
  rot: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function corners({ ox, oy, rot, x0, x1, y0, y1 }: Box): [number, number][] {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => [ox + x * cos - y * sin, oy + x * sin + y * cos] as [number, number]);
}

// Separating-axis test on two oriented boxes — an axis-aligned approximation
// would over-report, and a warning that cries wolf is worse than none.
function overlaps(a: Box, b: Box): boolean {
  const pa = corners(a);
  const pb = corners(b);
  for (const [p, q] of [
    [pa, pb],
    [pb, pa],
  ]) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = p[i];
      const [x2, y2] = p[(i + 1) % 4];
      const ax = -(y2 - y1);
      const ay = x2 - x1;
      const proj = (pts: [number, number][]) => pts.map(([x, y]) => x * ax + y * ay);
      const s1 = proj(p);
      const s2 = proj(q);
      if (Math.max(...s1) < Math.min(...s2) || Math.max(...s2) < Math.min(...s1)) return false;
    }
  }
  return true;
}

export interface LabelCollision {
  // 0-based index into design.art of the first colliding label line.
  line: number;
  text: string;
  banner: string;
}

// Returns the first label line that runs into the corner banner, or null if
// the layout is clear (or the design has no banner at all).
export async function findLabelCollision(design: Design): Promise<LabelCollision | null> {
  const banner = design.locked ? "KEEP OUT" : design.limited ? "LIMITED RUN" : null;
  if (!banner || design.art.length === 0) return null;

  try {
    await document.fonts.ready;
  } catch {
    /* noop */
  }
  const markerFamily = permanentMarker.style.fontFamily;
  const serifFamily = sourceSerif.style.fontFamily;
  const g = document.createElement("canvas").getContext("2d");
  if (!g) return null;

  g.font = `400 30px ${markerFamily}, ${serifFamily}, cursive`;
  const bw = g.measureText(banner).width / 2 + 18;
  const bannerBox: Box = { ox: PACK_ART_W - 214, oy: 300, rot: -0.34, x0: -bw, x1: bw, y0: -26, y1: 26 };

  for (let i = 0; i < design.art.length; i++) {
    const words = design.art[i].toUpperCase();
    let size = words.length > 6 ? 104 : 126;
    g.font = `400 ${size}px ${markerFamily}, ${serifFamily}, cursive`;
    const maxW = PACK_ART_W - 200;
    const wNow = g.measureText(words).width;
    if (wNow > maxW) {
      size = Math.floor(size * (maxW / wNow));
      g.font = `400 ${size}px ${markerFamily}, ${serifFamily}, cursive`;
    }
    const m = g.measureText(words);
    const width = m.width;
    const ascent = m.actualBoundingBoxAscent || size * 0.72;
    const descent = m.actualBoundingBoxDescent || 0;

    // Drawn at baseline (0,0) after translating to (92 + jitter, 360 + i*132)
    // and rotating about that point.
    const lineBox: Box = {
      ox: 92 + artJit(i, 6, 9),
      oy: 360 + i * 132,
      rot: artJit(i, 8, 0.045),
      x0: 0,
      x1: width,
      y0: -ascent,
      y1: descent,
    };

    if (overlaps(lineBox, bannerBox)) return { line: i, text: design.art[i], banner };
  }
  return null;
}
