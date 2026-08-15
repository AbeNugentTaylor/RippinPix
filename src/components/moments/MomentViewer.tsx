"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { DepthMap } from "@/lib/moments/depth";

export type ViewerMode = "photo" | "particles";

interface MomentViewerProps {
  frame: HTMLCanvasElement;
  depth: DepthMap;
  mode: ViewerMode;
  /** 0..1 — how much relief the depth map gets. */
  relief: number;
}

// Vertical FOV the frame is unprojected with — also the render camera's FOV,
// so at rest the moment fills the view exactly like the flat photo did.
const FOV_DEG = 55;
// Grid density for the displaced surface. ~250 across is plenty at lo-fi and
// keeps rebuilds instant on phones.
const GRID_MAX = 250;
// How far (world units) the camera drifts for pointer/tilt parallax.
const PARALLAX_AMP = 0.14;
// Triangles whose corners span a big depth jump are the rubber-sheet smears
// between foreground and background — drop them and let the dark backdrop
// show through instead. Threshold is relative to local depth.
const TEAR_RATIO = 0.22;

interface BuiltScene {
  mesh: THREE.Mesh;
  points: THREE.Points;
  zMid: number;
}

function buildScene(frame: HTMLCanvasElement, depth: DepthMap, relief: number): BuiltScene {
  const aspect = frame.width / frame.height;
  const gh = Math.max(2, Math.round(GRID_MAX / Math.max(1, aspect)));
  const gw = Math.max(2, Math.round(gh * aspect));

  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV_DEG) / 2);
  const tanH = tanV * aspect;
  // Map normalized inverse depth (1 = near) to metric-ish z. relief=0 is a
  // flat plane at z=1; relief=1 spreads the scene from z=1 out to z=4.
  const invNear = 1;
  const invFar = 1 / (1 + 3 * relief);

  const positions = new Float32Array(gw * gh * 3);
  const uvs = new Float32Array(gw * gh * 2);
  const zs = new Float32Array(gw * gh);

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const i = gy * gw + gx;
      const u = gx / (gw - 1);
      const v = gy / (gh - 1);
      // Nearest-sample the depth map; it's smoother than the grid anyway.
      const dx = Math.min(depth.width - 1, Math.round(u * (depth.width - 1)));
      const dy = Math.min(depth.height - 1, Math.round(v * (depth.height - 1)));
      const d = depth.data[dy * depth.width + dx];
      const z = 1 / (invFar + (invNear - invFar) * d);
      zs[i] = z;
      positions[i * 3] = (u - 0.5) * 2 * tanH * z;
      positions[i * 3 + 1] = (0.5 - v) * 2 * tanV * z;
      positions[i * 3 + 2] = -z;
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = 1 - v;
    }
  }

  // Index buffer, skipping triangles that tear across depth discontinuities.
  const indices: number[] = [];
  for (let gy = 0; gy < gh - 1; gy++) {
    for (let gx = 0; gx < gw - 1; gx++) {
      const a = gy * gw + gx;
      const b = a + 1;
      const c = a + gw;
      const d2 = c + 1;
      const pushIfSolid = (i0: number, i1: number, i2: number) => {
        const zmin = Math.min(zs[i0], zs[i1], zs[i2]);
        const zmax = Math.max(zs[i0], zs[i1], zs[i2]);
        if (zmax - zmin < TEAR_RATIO * zmin) indices.push(i0, i1, i2);
      };
      pushIfSolid(a, c, b);
      pushIfSolid(b, c, d2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const texture = new THREE.CanvasTexture(frame);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
  );

  // Particle twin of the same surface, vertex-colored from the frame.
  const ctx = frame.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, frame.width, frame.height).data;
  const colors = new Float32Array(gw * gh * 3);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const i = gy * gw + gx;
      const px = Math.min(frame.width - 1, Math.round((gx / (gw - 1)) * (frame.width - 1)));
      const py = Math.min(frame.height - 1, Math.round((gy / (gh - 1)) * (frame.height - 1)));
      const o = (py * frame.width + px) * 4;
      colors[i * 3] = (img[o] / 255) ** 2.2;
      colors[i * 3 + 1] = (img[o + 1] / 255) ** 2.2;
      colors[i * 3 + 2] = (img[o + 2] / 255) ** 2.2;
    }
  }
  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
  pointGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const zMid = 1 / ((invNear + invFar) / 2);
  const points = new THREE.Points(
    pointGeometry,
    new THREE.PointsMaterial({
      vertexColors: true,
      size: ((2 * tanV * zMid) / gh) * 2.2,
      sizeAttenuation: true,
    })
  );

  return { mesh, points, zMid };
}

function disposeObject(obj: THREE.Mesh | THREE.Points) {
  obj.geometry.dispose();
  const mat = obj.material as THREE.Material & { map?: THREE.Texture };
  mat.map?.dispose();
  mat.dispose();
}

export default function MomentViewer({ frame, depth, mode, relief }: MomentViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef(mode);
  const builtRef = useRef<BuiltScene | null>(null);
  // Bridge between the long-lived renderer effect (which owns the scene) and
  // the rebuild effect below (which reacts to prop changes).
  const sceneApiRef = useRef<{ swapIn: (b: BuiltScene) => void } | null>(null);

  // Renderer + camera + loop live for the component's whole life; geometry is
  // swapped underneath when the frame/depth/relief change.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0a09);
    const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.05, 30);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Parallax target from pointer (-1..1 both axes), with device tilt as an
    // additive source on mobile. Camera eases toward it every frame.
    const target = { x: 0, y: 0 };
    const tilt = { x: 0, y: 0, baseBeta: null as number | null };
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      target.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      target.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };
    const onPointerLeave = () => {
      target.x = 0;
      target.y = 0;
    };
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (tilt.baseBeta === null) tilt.baseBeta = e.beta;
      tilt.x = THREE.MathUtils.clamp(e.gamma / 25, -1, 1);
      tilt.y = THREE.MathUtils.clamp((e.beta - tilt.baseBeta) / 25, -1, 1);
    };
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("deviceorientation", onOrientation);

    let raf = 0;
    const start = performance.now();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const built = builtRef.current;
      if (built) {
        built.mesh.visible = modeRef.current === "photo";
        built.points.visible = modeRef.current === "particles";
        // Gentle idle drift keeps the moment alive even with no input.
        const t = (performance.now() - start) / 1000;
        const idleX = Math.sin(t * 0.5) * 0.25;
        const idleY = Math.cos(t * 0.33) * 0.15;
        const tx = THREE.MathUtils.clamp(target.x + tilt.x + idleX, -1.2, 1.2) * PARALLAX_AMP;
        const ty = THREE.MathUtils.clamp(target.y + tilt.y + idleY, -1.2, 1.2) * PARALLAX_AMP;
        camera.position.x += (tx - camera.position.x) * 0.06;
        camera.position.y += (-ty - camera.position.y) * 0.06;
        camera.lookAt(0, 0, -built.zMid);
      }
      renderer.render(scene, camera);
    };
    animate();

    const swapIn = (built: BuiltScene) => {
      const old = builtRef.current;
      if (old) {
        scene.remove(old.mesh, old.points);
        disposeObject(old.mesh);
        disposeObject(old.points);
      }
      scene.add(built.mesh, built.points);
      builtRef.current = built;
    };
    sceneApiRef.current = { swapIn };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("deviceorientation", onOrientation);
      const old = builtRef.current;
      if (old) {
        disposeObject(old.mesh);
        disposeObject(old.points);
        builtRef.current = null;
      }
      sceneApiRef.current = null;
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    sceneApiRef.current?.swapIn(buildScene(frame, depth, relief));
  }, [frame, depth, relief]);

  return <div ref={containerRef} className="moments-viewer" />;
}
