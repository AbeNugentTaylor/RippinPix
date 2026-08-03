"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { sourceSerif } from "@/lib/font";
import type { Series } from "@/lib/types";

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

export interface PackSceneHandle {
  openAnother: () => void;
  restoreOpacity: () => void;
}

interface PackSceneProps {
  series: Series;
  reducedMotion: boolean;
  disabled: boolean;
  onProgress: (p: number) => void;
  onTearStart: () => void;
  onDeal: (anchor: { x: number; y: number }) => void;
}

function tween(
  dur: number,
  step: (k: number) => void,
  done: (() => void) | undefined,
  deadRef: { current: boolean }
) {
  const t0 = performance.now();
  const run = () => {
    if (deadRef.current) return;
    const k = Math.min(1, (performance.now() - t0) / dur);
    step(k);
    if (k < 1) requestAnimationFrame(run);
    else if (done) done();
  };
  requestAnimationFrame(run);
}

const PackScene = forwardRef<PackSceneHandle, PackSceneProps>(function PackScene(
  { series, reducedMotion, disabled, onProgress, onTearStart, onDeal },
  ref
) {
  const stageElRef = useRef<HTMLDivElement | null>(null);

  // Mutable scene state, mirroring the reference prototype's instance fields.
  const dead = useRef(false);
  const raf = useRef<number | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rootRef = useRef<THREE.Group | null>(null);
  const bodyRef = useRef<DressedGroup | null>(null);
  const stayRef = useRef<DressedGroup | null>(null);
  const flyRef = useRef<DressedGroup | null>(null);
  const texCache = useRef<Map<string, THREE.CanvasTexture>>(new Map());
  const seriesRef = useRef(series);
  const reducedMotionRef = useRef(reducedMotion);

  const p = useRef(0);
  const pTarget = useRef(0);
  const px = useRef(0);
  const py = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const baseY = useRef(-0.15);
  const launched = useRef(false);
  const localPhase = useRef<"idle" | "busy">("idle");

  const dragging = useRef(false);
  const x0 = useRef(0);
  const t0 = useRef(0);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    seriesRef.current = series;
  }, [series]);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  const runTween = (
    dur: number,
    step: (k: number) => void,
    done?: () => void
  ) => tween(dur, step, done, dead);

  const setProgress = (val: number) => {
    pTarget.current = Math.max(0, Math.min(1, val));
    onProgress(pTarget.current);
  };

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

  async function makeArtTexture(s: Series) {
    try {
      await document.fonts.ready;
    } catch {
      /* noop */
    }
    const family = sourceSerif.style.fontFamily;
    const W = 700;
    const H = 1024;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f3f2f2";
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 16) {
      for (let x = 0; x < W; x += 16) {
        const f = 1 - y / H;
        const r = 6.2 * f * f;
        if (r < 0.4) continue;
        g.fillStyle =
          s.id === "port"
            ? `rgba(214,0,108,${0.14 + 0.1 * f})`
            : `rgba(0,136,176,${0.16 + 0.12 * f})`;
        g.beginPath();
        g.arc(x + 8, y + 8, r, 0, 6.3);
        g.fill();
      }
    }
    g.fillStyle = "#201e1d";
    g.fillRect(64, 92, W - 128, 6);
    g.fillRect(64, 118, W - 128, 1.5);
    const title = "THE PLATE SERIES";
    g.font = `600 26px ${family}`;
    g.letterSpacing = "6px";
    g.fillText(title, 64, 158);
    g.letterSpacing = "0px";
    g.fillStyle = "#201e1d";
    g.font = `600 96px ${family}`;
    s.art.forEach((line, i) => g.fillText(line, 60, 420 + i * 92));
    g.fillStyle = s.id === "still" ? "#201e1d" : s.id === "port" ? "#aa0b56" : "#006786";
    g.font = `italic 400 40px ${family}`;
    g.fillText(s.sub, 62, 672);
    g.strokeStyle = s.dot;
    g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      g.beginPath();
      g.moveTo(560 - Math.cos(a) * 46, 300 - Math.sin(a) * 46);
      g.lineTo(560 + Math.cos(a) * 46, 300 + Math.sin(a) * 46);
      g.stroke();
    }
    g.strokeStyle = "#201e1d";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(560, 300, 26, 0, 6.3);
    g.stroke();
    g.fillStyle = "#201e1d";
    g.fillRect(64, H - 150, W - 128, 1.5);
    g.font = `600 22px ${family}`;
    g.letterSpacing = "5px";
    g.fillText("DO NOT BEND", 64, H - 104);
    g.letterSpacing = "0px";
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = true;
    t.center.set(0.5, 0.5);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  async function getArtTexture(s: Series) {
    const cached = texCache.current.get(s.id);
    if (cached) return cached;
    const tex = await makeArtTexture(s);
    texCache.current.set(s.id, tex);
    return tex;
  }

  function syncPlanes() {
    const body = bodyRef.current;
    const stay = stayRef.current;
    const fly = flyRef.current;
    if (!body || !stay || !fly) return;
    const xb = XMIN + p.current * (XMAX - XMIN + 0.14);
    stay.basePlanes[1].constant = -xb;
    fly.basePlanes[1].constant = xb;
    for (const g of [body, stay, fly]) {
      g.group.updateMatrixWorld(true);
      g.planes.forEach((pl, i) => pl.copy(g.basePlanes[i]).applyMatrix4(g.group.matrixWorld));
    }
  }

  function loop() {
    if (dead.current) return;
    raf.current = requestAnimationFrame(loop);
    const t = performance.now() / 1000;
    p.current += (pTarget.current - p.current) * 0.22;
    const fly = flyRef.current;
    const body = bodyRef.current;
    const root = rootRef.current;
    if (fly && !launched.current) {
      const pv = p.current;
      fly.group.position.set(pv * 0.1, pv * 0.42, pv * 0.75);
      fly.group.rotation.set(-pv * 0.6, 0, -pv * 0.16);
    }
    if (body && root) {
      px.current += (pointer.current.x - px.current) * 0.08;
      py.current += (pointer.current.y - py.current) * 0.08;
      root.rotation.y = px.current * 0.42 + Math.sin(t * 0.5) * 0.05;
      root.rotation.x = -py.current * 0.24 + Math.sin(t * 0.42) * 0.025;
      root.position.y = baseY.current + Math.sin(t * 0.8) * 0.07;
      syncPlanes();
    }
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }

  function onHover(e: PointerEvent) {
    const el = stageElRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pointer.current.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.current.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }

  function stageAnchor() {
    const el = stageElRef.current!;
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 + window.scrollX,
      y: r.top + r.height * 0.44 + window.scrollY,
    };
  }

  function dealNow() {
    onDeal(stageAnchor());
  }

  function launchSeal() {
    setProgress(1);
    launched.current = true;
    const fly = flyRef.current!;
    const body = bodyRef.current!;
    const stay = stayRef.current!;
    const el = stageElRef.current;

    if (reducedMotionRef.current) {
      fly.group.visible = false;
      timeouts.current.push(setTimeout(dealNow, 60));
      return;
    }

    const fmats = fly.mats;
    const bmats = [...body.mats, ...stay.mats];
    runTween(
      680,
      (k) => {
        fly.group.position.set(0.1 + k * 2.6, 0.42 + k * 2.4 - k * k * 2.9, 0.75 + k * 2.2);
        fly.group.rotation.set(-0.6 - k * 2.6, k * 1.2, -0.16 - k * 0.9);
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
        runTween(620, (k) => {
          const e = 1 - Math.pow(1 - k, 2);
          baseY.current = -0.15 - e * 2.2;
          if (rootRef.current) {
            rootRef.current.rotation.z = e * 0.16;
            rootRef.current.scale.setScalar(1 - e * 0.12);
          }
          bmats.forEach((m) => {
            m.opacity = 1 - Math.max(0, (k - 0.35) / 0.65);
          });
        });
        if (el) el.style.opacity = "0.12";
      }, 380)
    );
    timeouts.current.push(setTimeout(dealNow, 620));
  }

  function completeTear() {
    if (localPhase.current !== "idle") return;
    localPhase.current = "busy";
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

  function autoTear() {
    if (reducedMotionRef.current) {
      completeTear();
      return;
    }
    runTween(420, (k) => setProgress(k * k), () => completeTear());
  }

  function finishDrag(complete: boolean) {
    dragging.current = false;
    const el = stageElRef.current;
    if (el) el.style.cursor = "grab";
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    const tap = pTarget.current < 0.06 && performance.now() - t0.current < 320;
    if (complete || pTarget.current >= 0.62) completeTear();
    else if (tap) autoTear();
    else setProgress(0);
  }

  function onMove(e: PointerEvent) {
    if (!dragging.current) return;
    const el = stageElRef.current!;
    const span = Math.max(190, el.getBoundingClientRect().width * 0.62);
    setProgress((e.clientX - x0.current) / span);
    if (pTarget.current >= 1) finishDrag(true);
  }

  function onUp() {
    if (dragging.current) finishDrag(false);
  }

  function onDown(e: React.PointerEvent) {
    if (disabled || localPhase.current !== "idle" || !bodyRef.current) return;
    dragging.current = true;
    x0.current = e.clientX;
    t0.current = performance.now();
    const el = stageElRef.current;
    if (el) el.style.cursor = "grabbing";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onKey(e: React.KeyboardEvent) {
    if (
      (e.key === "Enter" || e.key === " ") &&
      !disabled &&
      localPhase.current === "idle" &&
      bodyRef.current
    ) {
      e.preventDefault();
      autoTear();
    }
  }

  function dress(root: THREE.Object3D, artTex: THREE.CanvasTexture, foil: string) {
    const mats: THREE.MeshStandardMaterial[] = [];
    const foilMats: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const mesh = o as THREE.Mesh;
      const isFoil = mesh.name === "Object_4";
      const m = isFoil
        ? new THREE.MeshStandardMaterial({
            color: foil,
            metalness: 0.92,
            roughness: 0.24,
            side: THREE.DoubleSide,
            transparent: true,
          })
        : new THREE.MeshStandardMaterial({
            map: artTex,
            color: 0xffffff,
            metalness: 0.05,
            roughness: 0.78,
            side: THREE.DoubleSide,
            transparent: true,
          });
      mesh.material = m;
      mats.push(m);
      if (isFoil) foilMats.push(m);
    });
    return { mats, foilMats };
  }

  useEffect(() => {
    dead.current = false;
    let cancelled = false;
    const pendingTimeouts = timeouts.current;

    async function init() {
      const el = stageElRef.current;
      if (!el) return;

      const w = el.clientWidth || 640;
      const h = el.clientHeight || 520;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      renderer.localClippingEnabled = true;
      renderer.domElement.style.display = "block";
      el.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
      camera.position.set(0, 0, 12.6);
      sceneRef.current = scene;
      cameraRef.current = camera;

      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const key = new THREE.DirectionalLight(0xffffff, 1.7);
      key.position.set(4, 7, 9);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xbfe6f4, 0.7);
      fill.position.set(-7, -3, 5);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffffff, 1.1);
      rim.position.set(-3, 5, -7);
      scene.add(rim);
      scene.environment = makeEnv();

      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      if (cancelled) return;

      const s = seriesRef.current;
      const artTex = await getArtTexture(s);
      if (cancelled) return;

      const P = (nx: number, ny: number, c: number) =>
        new THREE.Plane(new THREE.Vector3(nx, ny, 0), c);

      const mkGroup = (source: THREE.Object3D, basePlanes: THREE.Plane[]): DressedGroup => {
        const g = new THREE.Group();
        g.add(source);
        const { mats } = dress(source, artTex, s.foil);
        const planes = basePlanes.map((pl) => pl.clone());
        mats.forEach((m) => {
          m.clippingPlanes = planes;
          m.clipShadows = true;
        });
        return { group: g, basePlanes, planes, mats };
      };

      const body = mkGroup(gltf.scene, [P(0, -1, TEAR_Y)]);
      const stay = mkGroup(gltf.scene.clone(true), [P(0, 1, -TEAR_Y), P(1, 0, -XMIN)]);
      const fly = mkGroup(gltf.scene.clone(true), [P(0, 1, -TEAR_Y), P(-1, 0, XMIN)]);
      bodyRef.current = body;
      stayRef.current = stay;
      flyRef.current = fly;

      const root = new THREE.Group();
      root.add(body.group, stay.group, fly.group);
      root.position.y = -0.15;
      scene.add(root);
      rootRef.current = root;

      el.addEventListener("pointermove", onHover);
      el.addEventListener("pointerleave", () => {
        pointer.current.x = 0;
        pointer.current.y = 0;
      });

      const observer = new ResizeObserver(() => {
        const nw = el.clientWidth;
        const nh = el.clientHeight;
        if (!nw || !nh) return;
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
      });
      observer.observe(el);
      ro.current = observer;

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
    // Scene boots once; series changes are applied via applySeriesLook below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-tint foil + swap art texture when the chosen series changes while idle.
  useEffect(() => {
    if (!bodyRef.current) return;
    const body = bodyRef.current;
    const stay = stayRef.current!;
    const fly = flyRef.current!;
    [...body.mats, ...stay.mats, ...fly.mats].forEach((m) => {
      if (m.map) {
        // art material: swap map once ready
      } else {
        m.color.set(series.foil);
      }
    });
    getArtTexture(series).then((tex) => {
      [...body.mats, ...stay.mats, ...fly.mats].forEach((m) => {
        if (m.map !== undefined && m.map !== null) {
          m.map = tex;
          m.needsUpdate = true;
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.id]);

  useImperativeHandle(ref, () => ({
    openAnother() {
      const body = bodyRef.current;
      const stay = stayRef.current;
      const fly = flyRef.current;
      const root = rootRef.current;
      const el = stageElRef.current;
      if (!body || !stay || !fly || !root) return;
      launched.current = false;
      fly.group.visible = true;
      setProgress(0);
      p.current = 0;
      [...body.mats, ...stay.mats, ...fly.mats].forEach((m) => {
        m.opacity = 1;
      });
      root.rotation.z = 0;
      root.scale.setScalar(1);
      if (el) el.style.opacity = "1";
      localPhase.current = "idle";

      if (reducedMotionRef.current) {
        baseY.current = -0.15;
        root.rotation.y = 0;
        return;
      }

      baseY.current = -3.6;
      runTween(
        620,
        (k) => {
          const e = 1 - Math.pow(1 - k, 3);
          baseY.current = -3.6 + e * 3.45;
          root.rotation.y = (1 - e) * -0.5;
        },
        () => {
          baseY.current = -0.15;
        }
      );
    },
    restoreOpacity() {
      const el = stageElRef.current;
      if (el) el.style.opacity = "1";
    },
  }));

  return (
    <div
      ref={stageElRef}
      onPointerDown={onDown}
      onKeyDown={onKey}
      tabIndex={0}
      role="button"
      aria-label="Booster pack — swipe right across the top to open"
      style={{
        height: "clamp(340px, 60vh, 640px)",
        width: "100%",
        touchAction: "none",
        cursor: "grab",
        outlineOffset: "6px",
        transition: "opacity 420ms ease",
      }}
    />
  );
});

export default PackScene;
