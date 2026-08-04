"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { permanentMarker, sourceSerif } from "@/lib/font";
import {
  DESIGNS,
  PACKS,
  binSize,
  jit,
  layoutFor,
  slotFor,
} from "@/lib/designs";
import type { Design, Pack, Phase, Slot } from "@/lib/types";

const TEAR_Y = 2.89;
const XMIN = -2.12;
const XMAX = 2.12;
const MODEL_URL = "/models/booster_pack_tcg_pack.glb";

interface DressedGroup {
  group: THREE.Group;
  basePlanes: THREE.Plane[];
  planes: THREE.Plane[];
  mats: THREE.MeshStandardMaterial[];
}

interface TearRig {
  root: THREE.Group;
  body: DressedGroup;
  stay: DressedGroup;
  fly: DressedGroup;
  foilMats: THREE.MeshStandardMaterial[];
  artMats: THREE.MeshStandardMaterial[];
  hint: THREE.Group;
  hintMat: THREE.MeshBasicMaterial;
  p: number;
  active: PlainRig | null;
  launched: boolean;
  flying: boolean;
  dropY: number;
  dropZ: number;
}

interface PlainTween {
  from: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
  to: Slot;
  t0: number;
  dur: number;
}

interface PlainRig {
  pack: Pack;
  root: THREE.Group;
  hover: number;
  gone: boolean;
  tween: PlainTween | null;
}

interface DesignMats {
  tex: THREE.CanvasTexture;
  foil: THREE.MeshStandardMaterial;
  art: THREE.MeshStandardMaterial;
}

// jitter used only for the hand-drawn cover-art wobble (distinct from the
// symmetric jit() used for 3D slot placement / cardboard grime)
function artJit(a: number, b: number, amp: number): number {
  return ((Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1) * amp;
}

export interface PackSceneHandle {
  pickRandom: () => void;
  backToBin: () => void;
  showBin: () => void;
}

interface PackSceneProps {
  phase: Phase;
  reducedMotion: boolean;
  shopName: string;
  packPrice: string;
  onPick: (pack: Pack) => void;
  onTearStart: () => void;
  onDeal: (pack: Pack, anchor: { x: number; y: number }) => void;
  onEnterBin: () => void;
  onReady: () => void;
}

function tween(
  dur: number,
  step: (k: number) => void,
  done: (() => void) | undefined,
  deadRef: { current: boolean }
) {
  let t0: number | null = null;
  const run = () => {
    if (deadRef.current) return;
    if (t0 === null) t0 = performance.now();
    const k = Math.min(1, (performance.now() - t0) / dur);
    step(k);
    if (k < 1) requestAnimationFrame(run);
    else if (done) done();
  };
  requestAnimationFrame(run);
}

const PackScene = forwardRef<PackSceneHandle, PackSceneProps>(function PackScene(
  { phase, reducedMotion, shopName, packPrice, onPick, onTearStart, onDeal, onEnterBin, onReady },
  ref
) {
  const stageElRef = useRef<HTMLDivElement | null>(null);

  const dead = useRef(false);
  const raf = useRef<number | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const binRef = useRef<THREE.Group | null>(null);
  const binStageRef = useRef<THREE.Group | null>(null);
  const binMatsRef = useRef<{
    card: THREE.MeshStandardMaterial;
    cardDark: THREE.MeshStandardMaterial;
    front: THREE.MeshStandardMaterial[];
  } | null>(null);
  const binOut = useRef(false);
  const binSizeNow = useRef({ width: 24, depth: 11 });
  const flapReach = useRef({ long: 2.6, side: 2 });
  const layRef = useRef<{ cols: number; rows: number; salt: number } | null>(null);

  const designMatsRef = useRef<Record<string, DesignMats>>({});
  const rigsRef = useRef<Record<string, PlainRig> | null>(null);
  const tearRigRef = useRef<TearRig | null>(null);

  const counterRef = useRef({ x: 0, y: 2.5, z: 4.4, rx: -0.05, ry: 0, rz: 0 });

  const pTarget = useRef(0);
  const px = useRef(0);
  const py = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const ndc = useRef(new THREE.Vector2(-2, -2));
  const rayRef = useRef<THREE.Raycaster | null>(null);
  const hoverId = useRef<string | null>(null);
  const hoverBin = useRef(false);

  const dragging = useRef(false);
  const x0 = useRef(0);
  const downX = useRef(0);
  const t0Ref = useRef(0);
  const pickSeq = useRef(0);
  const currentId = useRef<string | null>(null);
  const openedIds = useRef<Set<string>>(new Set());
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const phaseRef = useRef(phase);
  const reducedMotionRef = useRef(reducedMotion);
  const shopNameRef = useRef(shopName);
  const packPriceRef = useRef(packPrice);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);
  useEffect(() => {
    shopNameRef.current = shopName;
  }, [shopName]);
  useEffect(() => {
    packPriceRef.current = packPrice;
  }, [packPrice]);

  const runTween = (dur: number, step: (k: number) => void, done?: () => void) =>
    tween(dur, step, done, dead);

  const setProgress = (val: number) => {
    pTarget.current = Math.max(0, Math.min(1, val));
  };

  /* ---------- environment + textures ---------- */

  function makeEnv() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.45, "#dfe7ea");
    grad.addColorStop(0.62, "#8fa4ad");
    grad.addColorStop(1, "#3d4548");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = "rgba(255,255,255,.9)";
    g.fillRect(40, 8, 80, 26);
    g.fillStyle = "rgba(0,136,176,.35)";
    g.fillRect(170, 30, 60, 18);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // beat-up cardboard: stains, scuffs, creases, tape — plus one FREE sticker on the face
  function makeBinSkin(withSticker: boolean) {
    const W = 2048;
    const H = 256;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const markerFamily = permanentMarker.style.fontFamily;
    const serifFamily = sourceSerif.style.fontFamily;

    g.fillStyle = "#8a6134";
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 6) {
      g.fillStyle = x % 12 === 0 ? "rgba(60,38,18,.10)" : "rgba(214,171,120,.07)";
      g.fillRect(x, 0, 3, H);
    }
    for (let i = 0; i < 34; i++) {
      const x = Math.abs(jit(i, 3, 1)) * W;
      const y = Math.abs(jit(i, 7, 1)) * H;
      const r = 40 + Math.abs(jit(i, 11, 1)) * 120;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = i % 3 === 0;
      grad.addColorStop(0, dark ? "rgba(48,29,13,.17)" : "rgba(224,182,131,.11)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, 6.3);
      g.fill();
    }
    for (let i = 0; i < 2; i++) {
      const x = Math.abs(jit(i + 40, 5, 1)) * W;
      const y = Math.abs(jit(i + 40, 9, 1)) * H;
      const r = 34 + Math.abs(jit(i, 21, 1)) * 46;
      g.strokeStyle = "rgba(56,34,15,.12)";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(x, y, r, 0, 6.3);
      g.stroke();
    }
    for (let i = 0; i < 44; i++) {
      const x = Math.abs(jit(i + 5, 13, 1)) * W;
      const y = Math.abs(jit(i + 5, 17, 1)) * H;
      const len = 20 + Math.abs(jit(i, 29, 1)) * 120;
      const ang = jit(i, 31, 1) * 0.4;
      g.strokeStyle = i % 3 === 0 ? "rgba(232,196,151,.14)" : "rgba(52,32,14,.16)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.4);
      g.stroke();
    }
    g.fillStyle = "rgba(206,166,116,.22)";
    g.beginPath();
    g.moveTo(0, 0);
    for (let x = 0; x <= W; x += 64) g.lineTo(x, 3 + Math.abs(jit(x, 2, 1)) * 5);
    g.lineTo(W, 0);
    g.closePath();
    g.fill();
    const bot = g.createLinearGradient(0, H - 70, 0, H);
    bot.addColorStop(0, "rgba(38,22,9,0)");
    bot.addColorStop(1, "rgba(38,22,9,.34)");
    g.fillStyle = bot;
    g.fillRect(0, H - 70, W, 70);
    [[1180, -0.04]].forEach(([x, rot]) => {
      g.save();
      g.translate(x, H / 2);
      g.rotate(rot);
      g.fillStyle = "rgba(237,187,0,.09)";
      g.fillRect(-52, -H, 104, H * 2);
      g.strokeStyle = "rgba(48,29,13,.16)";
      g.lineWidth = 2;
      g.strokeRect(-52, -H, 104, H * 2);
      g.restore();
    });

    if (withSticker) {
      g.save();
      g.translate(W - 360, 128);
      g.rotate(-0.05);
      g.lineJoin = "round";
      g.lineCap = "round";
      const word = packPriceRef.current.toUpperCase();
      g.font = `400 156px ${markerFamily}, ${serifFamily}, cursive`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      ([[0, 0, 0.88], [1.5, 1, 0.28]] as [number, number, number][]).forEach(([dx, dy, a]) => {
        g.fillStyle = `rgba(22,16,12,${a})`;
        g.fillText(word, dx, dy);
      });
      g.strokeStyle = "rgba(22,16,12,.3)";
      g.lineWidth = 4;
      g.strokeText(word, 0, 0);
      const half = g.measureText(word).width / 2 + 16;
      ([[96, 9], [114, 6]] as [number, number][]).forEach(([y, w], n) => {
        g.strokeStyle = "rgba(22,16,12,.82)";
        g.lineWidth = w;
        g.beginPath();
        for (let x = -half; x <= half; x += 18) {
          const yy = y + jit(x + n * 9, 7, 5);
          if (x === -half) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
      });
      g.strokeStyle = "rgba(22,16,12,.55)";
      g.lineWidth = 6;
      ([[half + 34, -46, half + 54, 26]] as [number, number, number, number][]).forEach(
        ([x1, y1, x2, y2]) => {
          g.beginPath();
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
          g.stroke();
        }
      );
      g.restore();
    }
    return c;
  }

  async function makeArtTexture(design: Design) {
    try {
      await document.fonts.ready;
    } catch {
      /* noop */
    }
    const markerFamily = permanentMarker.style.fontFamily;
    const serifFamily = sourceSerif.style.fontFamily;
    const W = 700;
    const H = 1024;
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
    g.fillText(shopNameRef.current.toUpperCase(), 0, 0);
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.lineCap = "round";
    const mw = g.measureText(shopNameRef.current).width;
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
    g.fillText("no." + (DESIGNS.findIndex((d) => d.id === design.id) + 1), 0, 2);
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
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = true;
    t.center.set(0.5, 0.5);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  /* ---------- the box ---------- */

  function buildBin(scene: THREE.Scene) {
    const grime = new THREE.CanvasTexture(makeBinSkin(false));
    grime.colorSpace = THREE.SRGBColorSpace;
    const skin = new THREE.CanvasTexture(makeBinSkin(true));
    skin.colorSpace = THREE.SRGBColorSpace;
    const card = new THREE.MeshStandardMaterial({ map: grime, roughness: 0.98, metalness: 0 });
    const cardDark = new THREE.MeshStandardMaterial({
      map: grime,
      color: 0x9d938c,
      roughness: 0.99,
      metalness: 0,
    });
    const sign = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.97, metalness: 0 });
    binMatsRef.current = { card, cardDark, front: [card, card, cardDark, cardDark, sign, cardDark] };

    const bin = new THREE.Group();
    bin.rotation.y = -0.035;
    bin.position.y = 0.2;
    const stageGroup = new THREE.Group();
    stageGroup.add(bin);
    scene.add(stageGroup);
    binRef.current = bin;
    binStageRef.current = stageGroup;
    binOut.current = false;
  }

  function shapeBin(width: number, depth: number) {
    const bin = binRef.current;
    const mats = binMatsRef.current;
    if (!bin || !mats) return;
    while (bin.children.length) {
      const m = bin.children.pop()!;
      m.traverse((o) => {
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      });
    }
    const { card, cardDark, front } = mats;
    const T = 0.26;
    const WALL = 4.4;
    const TOP = -2.0 + WALL / 2;
    const hw = width / 2;
    const hd = depth / 2;

    const panel = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material | THREE.Material[],
      rx?: number
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      m.castShadow = true;
      m.receiveShadow = true;
      bin.add(m);
      return m;
    };
    panel(width, T, depth, 0, -4.05, 0, cardDark);
    panel(width, WALL, T, 0, -2.0, -hd, card);
    panel(width, WALL, T, 0, -2.0, hd, front);
    panel(T, WALL, depth, -hw, -2.0, 0, card);
    panel(T, WALL, depth, hw, -2.0, 0, card);

    const flap = (w: number, len: number, hx: number, hz: number, axis: "x" | "z", dir: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(hx, TOP, hz);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, T), cardDark);
      m.position.y = len / 2;
      m.castShadow = true;
      m.receiveShadow = true;
      pivot.add(m);
      const tilt = 1.12 * dir;
      if (axis === "x") pivot.rotation.x = tilt;
      else pivot.rotation.z = tilt;
      bin.add(pivot);
    };
    const longLen = Math.min(depth * 0.36, 2.5);
    const sideLen = Math.min(width * 0.17, 2.3);
    flap(width - 0.12, longLen, 0, hd, "x", 1);
    flap(width - 0.12, longLen, 0, -hd, "x", -1);
    const sf = new THREE.Mesh(new THREE.BoxGeometry(depth - 0.12, sideLen, T), cardDark);
    ([[-hw, 1], [hw, -1]] as [number, number][]).forEach(([x, dir]) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, TOP, 0);
      const m = sf.clone();
      m.geometry = new THREE.BoxGeometry(T, sideLen, depth - 0.12);
      m.position.y = sideLen / 2;
      m.castShadow = true;
      m.receiveShadow = true;
      pivot.add(m);
      pivot.rotation.z = 1.3 * dir;
      bin.add(pivot);
    });
    sf.geometry.dispose();
    flapReach.current = { long: longLen, side: sideLen };

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 1.5, depth * 2.4),
      new THREE.ShadowMaterial({ opacity: 0.16 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4.34;
    floor.receiveShadow = true;
    bin.add(floor);
  }

  function slideBin(out: boolean) {
    const stageGroup = binStageRef.current;
    if (!stageGroup || binOut.current === out) return;
    binOut.current = out;
    const size = binSizeNow.current;
    const from = {
      x: stageGroup.position.x,
      z: stageGroup.position.z,
      ry: stageGroup.rotation.y,
      s: stageGroup.scale.x,
    };
    const to = out
      ? { x: size.width * 0.92 + 6, z: -size.depth * 0.55 - 3, ry: -0.42, s: 0.68 }
      : { x: 0, z: 0, ry: 0, s: 1 };
    runTween(620, (k) => {
      const e = out ? k * k * (3 - 2 * k) : 1 - Math.pow(1 - k, 3);
      stageGroup.position.x = from.x + (to.x - from.x) * e;
      stageGroup.position.z = from.z + (to.z - from.z) * e;
      stageGroup.rotation.y = from.ry + (to.ry - from.ry) * e;
      stageGroup.scale.setScalar(from.s + (to.s - from.s) * e);
    });
  }

  function focusScale() {
    const cam = cameraRef.current;
    if (!cam) return 2.2;
    const counter = counterRef.current;
    const d = cam.position.distanceTo(new THREE.Vector3(counter.x, counter.y, counter.z));
    const visH = 2 * Math.tan(((cam.fov * Math.PI) / 180) / 2) * d;
    const visW = visH * cam.aspect;
    return Math.max(1.6, Math.min((visH * 0.86) / 6.62, (visW * 0.36) / 4.06));
  }

  function fitFocus(rig: TearRig) {
    const cam = cameraRef.current;
    if (!cam || !rig.root.visible) return;
    const measure = () => {
      rig.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rig.body.group);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 8; i++) {
        pts.push(
          new THREE.Vector3(
            i & 1 ? box.max.x : box.min.x,
            i & 2 ? box.max.y : box.min.y,
            i & 4 ? box.max.z : box.min.z
          ).project(cam)
        );
      }
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      pts.forEach((p) => {
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
      });
      return { minY, maxY, minX, maxX };
    };
    const LIMIT = 0.92;
    const counter = counterRef.current;
    for (let pass = 0; pass < 4; pass++) {
      const m = measure();
      const midY = (m.minY + m.maxY) / 2;
      const bias = (10 * 2) / ((stageElRef.current && stageElRef.current.clientHeight) || 400);
      if (Math.abs(midY - bias) > 0.01) {
        const d = cam.position.distanceTo(rig.root.position);
        const visH = 2 * Math.tan(((cam.fov * Math.PI) / 180) / 2) * d;
        counter.y -=
          (((midY - bias) * visH) / 2) *
          Math.cos(Math.atan2(cam.position.y, cam.position.z));
        rig.root.position.y = counter.y + (rig.dropY || 0);
      }
      const m2 = measure();
      const overH = Math.max(Math.abs(m2.minY), Math.abs(m2.maxY)) / LIMIT;
      const overW = Math.max(Math.abs(m2.minX), Math.abs(m2.maxX)) / 0.96;
      const over = Math.max(overH, overW);
      if (over <= 1.002) break;
      rig.root.scale.multiplyScalar(1 / over);
    }
  }

  function focusPack(rig: TearRig, on: boolean) {
    const from = rig.root.scale.x;
    const to = on ? focusScale() : 1;
    runTween(560, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      rig.root.scale.setScalar(from + (to - from) * e);
      if (k >= 1 && on) fitFocus(rig);
    });
  }

  function frameCamera(width: number, depth: number, aspect: number, rows: number) {
    const cam = cameraRef.current;
    if (!cam) return;
    const vf = (cam.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const pitch = Math.min(0.86, 0.3 + rows * 0.062);
    const vExtent = depth * (0.5 + pitch * 0.55) + 9.5;
    const dist = Math.max(width / 2 / Math.tan(hf / 2), vExtent / 2 / Math.tan(vf / 2)) * 1.03;
    const norm = Math.hypot(1, pitch);
    cam.position.set(0, (dist * pitch) / norm + 1.4, dist / norm);
    cam.lookAt(0, -1.3, -depth * 0.08);
    cam.updateProjectionMatrix();
    counterRef.current.rx = -Math.atan(pitch) * 0.94;
  }

  function relayout(aspect: number, force?: boolean) {
    const rigs = rigsRef.current;
    if (!rigs) return;
    const lay = layoutFor(aspect);
    const salt = Math.max(0, Math.round(aspect * 7));
    if (!force && layRef.current && layRef.current.cols === lay.cols && layRef.current.salt === salt) return;
    const first = !layRef.current;
    layRef.current = { cols: lay.cols, rows: lay.rows, salt };

    const size = binSize(lay.cols, lay.rows);
    binSizeNow.current = size;
    shapeBin(size.width, size.depth);
    const reach = flapReach.current;
    frameCamera(size.width + reach.side * 1.35, size.depth + reach.long * 1.2, aspect, lay.rows);
    counterRef.current.y = -1.3;
    counterRef.current.z = Math.min(size.depth * 0.38, 3.6);

    const rig = tearRigRef.current;
    if (rig && rig.active && rig.root.visible && !rig.launched) {
      rig.root.scale.setScalar(focusScale());
      requestAnimationFrame(() => fitFocus(rig));
    }

    const idx = PACKS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const r = Math.abs(jit(i + salt, lay.cols, 0.5) + 0.5);
      const j = Math.floor(r * (i + 1)) % (i + 1);
      const t = idx[i];
      idx[i] = idx[j];
      idx[j] = t;
    }
    PACKS.forEach((pack, n) => {
      pack.slot = slotFor(idx[n], lay.cols, lay.rows, salt);
      const plain = rigs[pack.id];
      if (!plain || plain.gone) return;
      if (first) {
        plain.root.position.set(pack.slot.x, pack.slot.y, pack.slot.z);
        plain.root.rotation.set(pack.slot.rx, pack.slot.ry, pack.slot.rz);
        return;
      }
      plain.tween = {
        from: {
          x: plain.root.position.x,
          y: plain.root.position.y,
          z: plain.root.position.z,
          rx: plain.root.rotation.x,
          ry: plain.root.rotation.y,
          rz: plain.root.rotation.z,
        },
        to: pack.slot,
        t0: performance.now() + (n % 5) * 40,
        dur: 460,
      };
    });
  }

  /* ---------- rigs ---------- */

  function dress(root: THREE.Object3D, mat: THREE.MeshStandardMaterial, artMat: THREE.MeshStandardMaterial) {
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const mesh = o as THREE.Mesh;
      const isFoil = mesh.name === "Object_4";
      mesh.material = isFoil ? mat : artMat;
      mesh.castShadow = true;
    });
  }

  function buildPlain(source: THREE.Object3D, pack: Pack): PlainRig {
    const obj = source.clone(true);
    const mats = designMatsRef.current[pack.design.id];
    dress(obj, mats.foil, mats.art);
    const root = new THREE.Group();
    root.add(obj);
    root.position.set(pack.slot.x, pack.slot.y, pack.slot.z);
    root.rotation.set(pack.slot.rx, pack.slot.ry, pack.slot.rz);
    root.userData.packId = pack.id;
    (binStageRef.current || sceneRef.current)!.add(root);
    return { pack, root, hover: 0, gone: false, tween: null };
  }

  function buildTearRig(source: THREE.Object3D, scene: THREE.Scene): TearRig {
    const foilMats: THREE.MeshStandardMaterial[] = [];
    const artMats: THREE.MeshStandardMaterial[] = [];
    const dressTear = (root: THREE.Object3D) => {
      const mats: THREE.MeshStandardMaterial[] = [];
      root.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        const mesh = o as THREE.Mesh;
        const isFoil = mesh.name === "Object_4";
        const m = isFoil
          ? new THREE.MeshStandardMaterial({
              color: DESIGNS[0].foil,
              metalness: 0.92,
              roughness: 0.26,
              side: THREE.DoubleSide,
              transparent: true,
            })
          : new THREE.MeshStandardMaterial({
              color: 0xffffff,
              metalness: 0.05,
              roughness: 0.78,
              side: THREE.DoubleSide,
              transparent: true,
            });
        mesh.material = m;
        mesh.castShadow = true;
        (isFoil ? foilMats : artMats).push(m);
        mats.push(m);
      });
      return mats;
    };
    const P = (nx: number, ny: number, c: number) => new THREE.Plane(new THREE.Vector3(nx, ny, 0), c);
    const mkGroup = (obj: THREE.Object3D, basePlanes: THREE.Plane[]): DressedGroup => {
      const g = new THREE.Group();
      g.add(obj);
      const mats = dressTear(obj);
      const planes = basePlanes.map((p) => p.clone());
      mats.forEach((m) => {
        m.clippingPlanes = planes;
      });
      return { group: g, basePlanes, planes, mats };
    };
    const body = mkGroup(source.clone(true), [P(0, -1, TEAR_Y)]);
    const stay = mkGroup(source.clone(true), [P(0, 1, -TEAR_Y), P(1, 0, -XMIN)]);
    const fly = mkGroup(source.clone(true), [P(0, 1, -TEAR_Y), P(-1, 0, XMIN)]);
    const root = new THREE.Group();
    root.add(body.group, stay.group, fly.group);
    root.visible = false;

    const hintMat = new THREE.MeshBasicMaterial({
      color: 0x62c5ee,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const hint = new THREE.Group();
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.36, 3), hintMat);
    arrow.rotation.z = -Math.PI / 2;
    arrow.position.x = 0.34;
    const nick = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.07), hintMat);
    hint.add(arrow, nick);
    hint.rotation.z = -0.35;
    hint.position.set(XMIN - 0.5, TEAR_Y + 0.28, 0.22);
    root.add(hint);
    scene.add(root);

    return {
      root,
      body,
      stay,
      fly,
      foilMats,
      artMats,
      hint,
      hintMat,
      p: 0,
      active: null,
      launched: false,
      flying: false,
      dropY: 0,
      dropZ: 0,
    };
  }

  /* ---------- tear mechanic ---------- */

  function syncPlanes(rig: TearRig) {
    const xb = XMIN + rig.p * (XMAX - XMIN + 0.14);
    rig.stay.basePlanes[1].constant = -xb;
    rig.fly.basePlanes[1].constant = xb;
    for (const g of [rig.body, rig.stay, rig.fly]) {
      g.group.updateMatrixWorld(true);
      g.planes.forEach((pl, i) => pl.copy(g.basePlanes[i]).applyMatrix4(g.group.matrixWorld));
    }
  }

  function flyTo(
    rig: TearRig,
    from: { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number },
    to: { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number },
    dur: number,
    done?: () => void
  ) {
    rig.flying = true;
    runTween(
      dur,
      (k) => {
        const travel = Math.max(0, (k - 0.3) / 0.7);
        const e = 1 - Math.pow(1 - travel, 3);
        const ey = 1 - Math.pow(1 - k, 2);
        const lift = Math.sin(Math.PI * Math.pow(k, 0.72)) * 4.2;
        rig.root.position.set(
          from.x + (to.x - from.x) * e,
          from.y + (to.y - from.y) * ey + lift,
          from.z + (to.z - from.z) * e
        );
        rig.root.rotation.set(
          (from.rx ?? 0) + ((to.rx ?? 0) - (from.rx ?? 0)) * e,
          (from.ry ?? 0) + ((to.ry ?? 0) - (from.ry ?? 0)) * e,
          (from.rz ?? 0) + ((to.rz ?? 0) - (from.rz ?? 0)) * e
        );
      },
      () => {
        rig.flying = false;
        if (done) done();
      }
    );
  }

  function sendHome() {
    const rig = tearRigRef.current;
    const plain = rig?.active;
    if (!rig || !plain) return;
    rig.active = null;
    const seq = pickSeq.current;
    const from = {
      x: rig.root.position.x,
      y: rig.root.position.y,
      z: rig.root.position.z,
      rx: rig.root.rotation.x,
      ry: rig.root.rotation.y,
      rz: rig.root.rotation.z,
    };
    flyTo(rig, from, plain.pack.slot, 480);
    focusPack(rig, false);
    timeouts.current.push(
      setTimeout(() => {
        if (pickSeq.current !== seq) return;
        rig.root.visible = false;
        rig.root.scale.setScalar(1);
        if (!plain.gone) plain.root.visible = true;
      }, 480)
    );
  }

  function scrollStageIntoView() {
    const el = stageElRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY - Math.max(0, (window.innerHeight - r.height) / 2);
    window.scrollTo({ top: Math.max(0, top), behavior: reducedMotionRef.current ? "auto" : "smooth" });
  }

  function pickPack(id: string) {
    const ph = phaseRef.current;
    if (ph === "tearing" || ph === "dealing") return;
    if (openedIds.current.has(id)) return;
    const rigs = rigsRef.current;
    const rig = tearRigRef.current;
    const plain = rigs?.[id];
    if (!plain || plain.gone || !rig) return;
    if (rig.active) {
      if (rig.active.gone) rig.active = null;
      else if (rig.active.pack.id !== id) sendHome();
    }
    pickSeq.current += 1;
    const mats = designMatsRef.current[plain.pack.design.id];
    rig.foilMats.forEach((m) => m.color.set(plain.pack.design.foil));
    rig.artMats.forEach((m) => {
      m.map = mats.tex;
      m.needsUpdate = true;
    });
    setProgress(0);
    rig.p = 0;
    rig.launched = false;
    rig.dropY = 0;
    rig.dropZ = 0;
    rig.fly.group.visible = true;
    rig.root.visible = true;
    rig.active = plain;
    [...rig.body.mats, ...rig.stay.mats, ...rig.fly.mats].forEach((m) => {
      m.opacity = 1;
    });
    plain.root.visible = false;
    plain.hover = 0;
    hoverId.current = null;
    currentId.current = id;

    onPick(plain.pack);

    const stageGroup = binStageRef.current;
    const start = { ...plain.pack.slot };
    if (stageGroup) {
      start.x += stageGroup.position.x;
      start.z += stageGroup.position.z;
    }
    flyTo(rig, start, counterRef.current, 620);
    timeouts.current.push(setTimeout(() => focusPack(rig, true), 300));
    timeouts.current.push(setTimeout(() => slideBin(true), 220));
    if (stageElRef.current) stageElRef.current.style.cursor = "grab";
  }

  function autoTear() {
    if (reducedMotionRef.current) {
      completeTear();
      return;
    }
    runTween(420, (k) => setProgress(k * k), () => completeTear());
  }

  function completeTear() {
    const rig = tearRigRef.current;
    if (phaseRef.current !== "idle" || !rig || !rig.active) return;
    onTearStart();
    if (reducedMotionRef.current) {
      setProgress(1);
      launchSeal();
      return;
    }
    const from = pTarget.current;
    const peel = Math.max(180, (1 - from) * 620);
    runTween(
      peel,
      (k) => {
        const e = 1 - Math.pow(1 - k, 2);
        setProgress(from + (1 - from) * e);
      },
      () => launchSeal()
    );
  }

  function packAnchor() {
    const el = stageElRef.current;
    const cam = cameraRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    if (!cam) {
      return {
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.top + rect.height / 2 + window.scrollY,
      };
    }
    const counter = counterRef.current;
    const v = new THREE.Vector3(counter.x, counter.y, counter.z).project(cam);
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width + window.scrollX,
      y: rect.top + ((1 - v.y) / 2) * rect.height + window.scrollY,
    };
  }

  function dealNow() {
    const rig = tearRigRef.current;
    if (!rig || !rig.active) return;
    const pack = rig.active.pack;
    openedIds.current.add(pack.id);
    onDeal(pack, packAnchor());
  }

  function launchSeal() {
    const rig = tearRigRef.current;
    if (!rig || !rig.active) return;
    setProgress(1);
    rig.launched = true;

    if (reducedMotionRef.current) {
      rig.fly.group.visible = false;
      if (rig.active) rig.active.gone = true;
      rig.root.visible = false;
      rig.root.scale.setScalar(1);
      timeouts.current.push(setTimeout(dealNow, 60));
      return;
    }

    const fly = rig.fly;
    const fmats = fly.mats;
    const bmats = [...rig.body.mats, ...rig.stay.mats];
    runTween(
      680,
      (k) => {
        fly.group.position.set(0.1 + k * 3.1, 0.42 + k * 2.8 - k * k * 3.4, 0.75 + k * 2.4);
        fly.group.rotation.set(-0.6 - k * 3.2, k * 1.6, -0.16 - k * 1.2);
        fmats.forEach((m) => {
          m.opacity = 1 - Math.max(0, (k - 0.55) / 0.45);
        });
      },
      () => {
        fly.group.visible = false;
      }
    );
    timeouts.current.push(
      setTimeout(() => {
        runTween(
          640,
          (k) => {
            const e = 1 - Math.pow(1 - k, 2);
            rig.dropY = -e * 3.4;
            rig.dropZ = e * 0.3;
            bmats.forEach((m) => {
              m.opacity = 1 - Math.max(0, (k - 0.3) / 0.7);
            });
          },
          () => {
            if (rig.active) rig.active.gone = true;
            rig.root.visible = false;
            rig.root.scale.setScalar(1);
          }
        );
      }, 380)
    );
    timeouts.current.push(setTimeout(dealNow, 640));
  }

  /* ---------- bin navigation ---------- */

  function backToBin() {
    const rig = tearRigRef.current;
    if (!rig || !rig.active) return;
    setProgress(0);
    rig.p = 0;
    currentId.current = null;
    onEnterBin();
    slideBin(false);
    focusPack(rig, false);
    sendHome();
    scrollStageIntoView();
    if (stageElRef.current) stageElRef.current.style.cursor = "default";
  }

  function showBin() {
    slideBin(false);
    currentId.current = null;
    onEnterBin();
    scrollStageIntoView();
    if (stageElRef.current) stageElRef.current.style.cursor = "default";
  }

  function pickRandom() {
    const left = PACKS.filter((p) => !openedIds.current.has(p.id) && currentId.current !== p.id);
    if (!left.length) return;
    const id = left[Math.floor(Math.random() * left.length)].id;
    if (binOut.current) {
      slideBin(false);
      timeouts.current.push(setTimeout(() => pickPack(id), 480));
    } else {
      pickPack(id);
    }
  }

  /* ---------- pointer ---------- */

  function onHover(e: PointerEvent) {
    const el = stageElRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pointer.current.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.current.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    px.current += (pointer.current.x - px.current) * 0.35;
    py.current += (pointer.current.y - py.current) * 0.35;
    ndc.current.set(pointer.current.x, -pointer.current.y);
  }

  function finishDrag(complete: boolean) {
    dragging.current = false;
    if (stageElRef.current) stageElRef.current.style.cursor = "grab";
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    const tap = pTarget.current < 0.06 && performance.now() - t0Ref.current < 340;
    if (complete || pTarget.current >= 0.62) completeTear();
    else if (tap) autoTear();
    else setProgress(0);
  }

  function onMove(e: PointerEvent) {
    if (!dragging.current) return;
    const el = stageElRef.current;
    if (!el) return;
    const span = Math.max(190, el.getBoundingClientRect().width * 0.34);
    setProgress((e.clientX - x0.current) / span);
    if (pTarget.current >= 1) finishDrag(true);
  }

  function onUp(e: PointerEvent) {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    const quick =
      performance.now() - t0Ref.current < 340 &&
      Math.abs((e && e.clientX != null ? e.clientX : downX.current) - downX.current) < 8;
    const ph = phaseRef.current;
    if (ph === "bin") {
      if (quick && hoverId.current) pickPack(hoverId.current);
      return;
    }
    if (quick && hoverBin.current) {
      const rig = tearRigRef.current;
      if (rig && rig.active) backToBin();
      else showBin();
      return;
    }
    if (dragging.current) finishDrag(false);
  }

  function onDown(e: React.PointerEvent) {
    if (!rigsRef.current) return;
    downX.current = e.clientX;
    t0Ref.current = performance.now();
    dragging.current = phaseRef.current === "idle" && !hoverBin.current;
    if (dragging.current) {
      x0.current = e.clientX;
      if (stageElRef.current) stageElRef.current.style.cursor = "grabbing";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onKey(e: React.KeyboardEvent) {
    if ((e.key === "Enter" || e.key === " ") && phaseRef.current === "idle") {
      e.preventDefault();
      autoTear();
    }
  }

  /* ---------- render loop ---------- */

  function loop() {
    if (dead.current) return;
    raf.current = requestAnimationFrame(loop);
    const t = performance.now() / 1000;
    const rig = tearRigRef.current;
    const counter = counterRef.current;

    if (rig && rig.active) {
      rig.p += (pTarget.current - rig.p) * 0.22;
      if (!rig.launched) {
        const p = rig.p;
        rig.fly.group.position.set(p * 0.1, p * 0.42, p * 0.75);
        rig.fly.group.rotation.set(-p * 0.6, 0, -p * 0.16);
      }
      if (!rig.flying) {
        rig.root.position.set(
          counter.x,
          counter.y + Math.sin(t * 0.9) * 0.08 + (rig.dropY || 0),
          counter.z
        );
        rig.root.rotation.set(
          counter.rx + py.current * -0.06,
          px.current * 0.16 + Math.sin(t * 0.5) * 0.025,
          counter.rz + (rig.dropZ || 0)
        );
      }
      const showHint = phaseRef.current === "idle" && rig.p < 0.06;
      rig.hint.visible = showHint;
      if (showHint) {
        rig.hintMat.opacity = 0.4 + 0.45 * (0.5 + 0.5 * Math.sin(t * 3.4));
        const slide = Math.sin(t * 3.4) * 0.09;
        rig.hint.position.x = XMIN - 0.5 + slide * Math.cos(0.35);
        rig.hint.position.y = TEAR_Y + 0.28 - slide * Math.sin(0.35);
      }
      syncPlanes(rig);
    }

    const rigs = rigsRef.current;
    const cam = cameraRef.current;
    const ray = rayRef.current;
    if (rigs && ray && cam) {
      if (phaseRef.current === "bin") {
        ray.setFromCamera(ndc.current, cam);
        const targets = Object.values(rigs).filter((r) => !r.gone).map((r) => r.root);
        const hit = ray.intersectObjects(targets, true)[0];
        let id: string | null = null;
        if (hit) {
          let o: THREE.Object3D | null = hit.object;
          while (o && !o.userData.packId) o = o.parent;
          if (o) id = o.userData.packId as string;
        }
        if (id !== hoverId.current) {
          hoverId.current = id;
          if (stageElRef.current) stageElRef.current.style.cursor = id ? "pointer" : "default";
        }
      } else if (hoverId.current) {
        hoverId.current = null;
        if (stageElRef.current) stageElRef.current.style.cursor = "grab";
      }

      const stageGroup = binStageRef.current;
      if (binOut.current && stageGroup && (phaseRef.current === "idle" || phaseRef.current === "collected")) {
        ray.setFromCamera(ndc.current, cam);
        const onBin = ray.intersectObject(stageGroup, true).length > 0;
        if (onBin !== hoverBin.current) {
          hoverBin.current = onBin;
          if (stageElRef.current) {
            stageElRef.current.style.cursor = onBin
              ? "pointer"
              : phaseRef.current === "idle"
                ? "grab"
                : "default";
          }
        }
      } else if (!binOut.current) {
        hoverBin.current = false;
      }

      for (const p of Object.values(rigs)) {
        if (p.gone || !p.root.visible) continue;
        const target = hoverId.current === p.pack.id ? 1 : 0;
        p.hover += (target - p.hover) * 0.16;
        const s = p.pack.slot;
        if (p.tween) {
          const k = Math.min(1, Math.max(0, (performance.now() - p.tween.t0) / p.tween.dur));
          const e = 1 - Math.pow(1 - k, 3);
          const f = p.tween.from;
          const to = p.tween.to;
          p.root.position.set(
            f.x + (to.x - f.x) * e,
            f.y + (to.y - f.y) * e + Math.sin(Math.PI * k) * 1.1,
            f.z + (to.z - f.z) * e
          );
          p.root.rotation.set(
            f.rx + (to.rx - f.rx) * e,
            f.ry + (to.ry - f.ry) * e,
            f.rz + (to.rz - f.rz) * e
          );
          if (k >= 1) p.tween = null;
          continue;
        }
        p.root.position.set(s.x, s.y + p.hover * 0.95 + Math.sin(t * 0.7 + s.x) * 0.04, s.z + p.hover * 0.55);
        p.root.rotation.set(s.rx + p.hover * 0.07, s.ry, s.rz - p.hover * 0.05);
      }
    }

    if (rendererRef.current && sceneRef.current && cam) {
      rendererRef.current.render(sceneRef.current, cam);
    }
  }

  /* ---------- mount ---------- */

  useEffect(() => {
    dead.current = false;
    let cancelled = false;
    const pendingTimeouts = timeouts.current;

    async function init() {
      const el = stageElRef.current;
      if (!el) return;

      const w = el.clientWidth || 900;
      const h = el.clientHeight || 520;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      renderer.localClippingEnabled = true;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.display = "block";
      el.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 200);
      camera.position.set(0, 6.4, 21);
      camera.lookAt(0, -1.2, 0.6);
      sceneRef.current = scene;
      cameraRef.current = camera;

      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 1.8);
      key.position.set(6, 12, 11);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -18;
      key.shadow.camera.right = 18;
      key.shadow.camera.top = 18;
      key.shadow.camera.bottom = -18;
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xbfe6f4, 0.6);
      fill.position.set(-9, -2, 7);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffffff, 1.0);
      rim.position.set(-4, 6, -9);
      scene.add(rim);
      scene.environment = makeEnv();

      try {
        await document.fonts.load(`400 148px ${permanentMarker.style.fontFamily}`);
      } catch {
        /* noop */
      }
      if (cancelled) return;

      buildBin(scene);

      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      if (cancelled) return;

      const designMats: Record<string, DesignMats> = {};
      for (const d of DESIGNS) {
        const tex = await makeArtTexture(d);
        designMats[d.id] = {
          tex,
          foil: new THREE.MeshStandardMaterial({
            color: d.foil,
            metalness: 0.92,
            roughness: 0.26,
            side: THREE.DoubleSide,
          }),
          art: new THREE.MeshStandardMaterial({
            map: tex,
            color: 0xffffff,
            metalness: 0.05,
            roughness: 0.78,
            side: THREE.DoubleSide,
          }),
        };
      }
      if (cancelled) return;
      designMatsRef.current = designMats;

      const rigs: Record<string, PlainRig> = {};
      for (const pack of PACKS) {
        rigs[pack.id] = buildPlain(gltf.scene, pack);
      }
      rigsRef.current = rigs;

      const rig = buildTearRig(gltf.scene, scene);
      tearRigRef.current = rig;

      // Pre-compile every shader program the scene will ever need (bin +
      // all 32 plain rigs across 18 designs + the tear rig) up front, so no
      // pick — not just the first one — ever stalls on a shader compile.
      // The tear rig needs a real texture assigned before compiling, since
      // going from no map to a map is itself a different shader variant.
      const warm = designMats[DESIGNS[0].id];
      rig.artMats.forEach((m) => {
        m.map = warm.tex;
        m.needsUpdate = true;
      });
      const wasVisible = rig.root.visible;
      rig.root.visible = true;
      await renderer.compileAsync(scene, camera);
      rig.root.visible = wasVisible;
      if (cancelled) return;

      rayRef.current = new THREE.Raycaster();
      el.addEventListener("pointermove", onHover);
      el.addEventListener("pointerleave", () => {
        pointer.current.x = 0;
        pointer.current.y = 0;
        ndc.current.set(-2, -2);
      });

      const observer = new ResizeObserver(() => {
        const nw = el.clientWidth;
        const nh = el.clientHeight;
        if (!nw || !nh) return;
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        relayout(nw / nh);
      });
      observer.observe(el);
      ro.current = observer;

      relayout((el.clientWidth || 900) / (el.clientHeight || 520), true);

      onReady();
      loop();
    }

    init();

    return () => {
      cancelled = true;
      dead.current = true;
      if (raf.current) cancelAnimationFrame(raf.current);
      if (ro.current) ro.current.disconnect();
      pendingTimeouts.forEach(clearTimeout);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try {
        rendererRef.current?.dispose();
      } catch {
        /* noop */
      }
      const dom = rendererRef.current?.domElement;
      if (dom?.parentNode) dom.remove();
    };
    // Scene boots once; phase/props are read through refs kept fresh above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    pickRandom,
    backToBin,
    showBin,
  }));

  return (
    <div
      ref={stageElRef}
      onPointerDown={onDown}
      onKeyDown={onKey}
      tabIndex={0}
      role="application"
      aria-label="Discount bin of booster packs — click a pack to pull it out, then swipe right across its top to tear it open"
      style={{
        height: "clamp(380px, 66vh, 760px)",
        width: "100%",
        touchAction: "none",
        cursor: "default",
        outlineOffset: "4px",
      }}
    />
  );
});

export default PackScene;
