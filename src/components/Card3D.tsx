"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Crop, Rarity } from "@/lib/types";

interface Card3DProps {
  photoUrl: string | null;
  crop?: Crop;
  rarity?: Rarity;
  holo?: boolean;
}

// Kept modest — iridescence recolors the specular/clearcoat lobe, and under
// the environment map's omnidirectional light that reads as a wash over the
// whole card if pushed too high. The moving "glare" comes mostly from
// clearcoatRoughness (low = tight, bright, dynamic highlight) rather than
// from a large iridescence value.
const IRIDESCENCE: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.15,
  rare: 0.25,
  holo: 0.4,
  secret: 0.5,
};

const THICKNESS: Record<Rarity, [number, number]> = {
  common: [100, 300],
  uncommon: [100, 300],
  rare: [100, 350],
  holo: [100, 400],
  secret: [200, 500],
};

// Clearcoat/env reflection is an *additive* layer on top of the diffuse
// read, not multiplied by it — so it disproportionately lifts and desaturates
// dark pixels relative to bright ones (a small add is huge % change on a
// dark shadow, barely visible on a bright highlight). Kept low outside holo.
const CLEARCOAT: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.3,
  rare: 0.55,
  holo: 0.85,
  secret: 0.9,
};

const CLEARCOAT_ROUGHNESS: Record<Rarity, number> = {
  common: 0.25,
  uncommon: 0.15,
  rare: 0.1,
  holo: 0.06,
  secret: 0.05,
};

// MeshPhysicalMaterial always has a baseline specular reflectance from ior
// even with clearcoat at 0 (default ior 1.5 -> ~4% F0) — that residual
// glassiness was still adding a faint additive lift on top of the diffuse
// read. ior 1.0 (matching air) zeroes it out for common so a non-holo card
// is genuinely just the photo, no glassy quality at all.
const IOR: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.3,
  rare: 1.4,
  holo: 1.5,
  secret: 1.5,
};

// scene.environment lights the material from *every* direction at once —
// literally a soft lightbox wrapped around the card, which is exactly what
// flattens contrast. The directional lights below are already the "hard,
// distant" source that should be doing the actual shading; this only needs
// to contribute enough for iridescence to have a hint of a reflection to
// color, not enough to add a visible wash on its own.
const ENV_INTENSITY: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.04,
  rare: 0.08,
  holo: 0.15,
  secret: 0.22,
};

const PLANE_W = 6.3;
const PLANE_H = 8.8;
const BOX_ASPECT = PLANE_W / PLANE_H;
const CORNER_RADIUS = 0.32; // real trading cards run ~3mm on a 63mm width
const FOV = 26;

// A 63:88 plane with rounded corners (real cards aren't sharp-cornered
// rectangles).
function createCardGeometry(): THREE.BufferGeometry {
  const w = PLANE_W / 2;
  const h = PLANE_H / 2;
  const r = CORNER_RADIUS;
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const geometry = new THREE.ShapeGeometry(shape, 24);

  // ShapeGeometry's default UVs are raw shape-space coordinates (roughly
  // -w..w / -h..h here), not normalized 0-1 like PlaneGeometry's — remap
  // them to the plane's own bounding box so applyCrop()'s texture.repeat/
  // offset (which assumes standard 0-1 UVs) samples the right region instead
  // of wrapping/clamping across wildly out-of-range coordinates.
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w) / PLANE_W, (pos.getY(i) + h) / PLANE_H);
  }
  uv.needsUpdate = true;

  return geometry;
}

// Colorful equirectangular gradient so the holo iridescence has something to
// reflect. Deliberately more chromatic than PackScene.tsx's makeEnv() (which
// stays neutral so the booster pack's foil doesn't rainbow) — here rainbow
// reflections are the entire point.
function makeHoloEnv(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.3, "#cdeaff");
  grad.addColorStop(0.55, "#ffd6ee");
  grad.addColorStop(0.75, "#d8ffe0");
  grad.addColorStop(1, "#2b2733");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "rgba(255,255,255,.9)";
  g.fillRect(30, 10, 70, 22);
  g.fillStyle = "rgba(255,90,180,.4)";
  g.fillRect(160, 24, 60, 16);
  g.fillStyle = "rgba(120,220,255,.4)";
  g.fillRect(60, 80, 80, 20);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Replicates CSS `object-fit:cover; object-position:{x}% {y}%; scale(zoom)`
// via texture.repeat/offset. CSS x=0%/100% = show the left/right edge of the
// source; three.js u=0/1 is also left/right, so offsetX maps directly. CSS
// y=0% = show the top of the source; three.js v=0 is the bottom of the image
// (TextureLoader's default flipY), so offsetY uses (1 - y/100).
function applyCrop(texture: THREE.Texture, crop: Crop, imgAspect: number) {
  let repeatX: number;
  let repeatY: number;
  if (imgAspect > BOX_ASPECT) {
    repeatY = 1;
    repeatX = BOX_ASPECT / imgAspect;
  } else {
    repeatX = 1;
    repeatY = imgAspect / BOX_ASPECT;
  }
  const zoom = Math.max(1, crop.zoom || 1);
  repeatX /= zoom;
  repeatY /= zoom;
  texture.repeat.set(repeatX, repeatY);
  texture.offset.set((1 - repeatX) * (crop.x / 100), (1 - repeatY) * (1 - crop.y / 100));
  texture.needsUpdate = true;
}

export default function Card3D({ photoUrl, crop, rarity, holo }: Card3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dead = useRef(false);
  const raf = useRef<number | null>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const imgAspectRef = useRef(BOX_ASPECT);
  const cropRef = useRef(crop);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Renders immediately rather than waiting for the next rAF tick, so a prop
  // change (new crop, new rarity, texture finishing its async load) shows up
  // right away instead of whenever the loop next happens to run — matters
  // most when the tab is backgrounded, where browsers throttle rAF hard.
  const renderNow = () => {
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  // Mount once: renderer/scene/camera/plane, pointer + resize listeners, render loop.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    dead.current = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const w = el.clientWidth || 220;
    const h = el.clientHeight || Math.round((w * PLANE_H) / PLANE_W);
    // setSize(w, h) sizes both the drawing buffer (scaled by pixelRatio, for
    // sharpness) and the canvas's own CSS width/height (in logical px) from
    // the same measurement — forcing the CSS side to "100%" afterward (as
    // this used to do) decouples them, so on any display with OS-level
    // scaling (125%/150% on Windows) the buffer and the box it's stretched
    // into drift apart and it reads as blurry. Let setSize own both.
    renderer.setSize(w, h);
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const env = makeHoloEnv();
    scene.environment = env;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(FOV, w / h, 0.1, 100);
    const dist = (PLANE_H / 2 / Math.tan((FOV * Math.PI) / 360)) * 1.08;
    camera.position.set(0, 0, dist);
    cameraRef.current = camera;

    // Ambient is flat, uniform, from every direction — same "soft lightbox"
    // problem as the environment map, just without the color. Kept low, with
    // the directional lights (genuinely distant/hard point sources — three.js
    // doesn't soften these) doing most of the work so the surface actually
    // shows shading/contrast instead of an even wash. Total irradiance at the
    // resting normal still lands close to 1.0 (ambient .08 + key
    // .85*cos(~43deg) + rim .45*cos(~53deg) ≈ 0.97) so overall exposure is
    // unchanged — only the mix shifted from flat fill to directional shape.
    scene.add(new THREE.AmbientLight(0xffffff, 0.08));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(3, 4, 6);
    scene.add(key);
    const rimLight = new THREE.DirectionalLight(0xffe6f8, 0.45);
    rimLight.position.set(-4, -2, 3);
    scene.add(rimLight);

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.7,
      clearcoat: CLEARCOAT.common,
      clearcoatRoughness: CLEARCOAT_ROUGHNESS.common,
      envMapIntensity: ENV_INTENSITY.common,
      ior: IOR.common,
    });
    materialRef.current = material;
    const geometry = createCardGeometry();
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const observer = new ResizeObserver(() => {
      const nw = el.clientWidth;
      const nh = el.clientHeight;
      if (!nw || !nh) return;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    });
    observer.observe(el);

    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    let px = 0;
    let py = 0;
    const loop = () => {
      if (dead.current) return;
      raf.current = requestAnimationFrame(loop);
      px += (pointer.x - px) * 0.12;
      py += (pointer.y - py) * 0.12;
      mesh.rotation.y = px * 0.22;
      mesh.rotation.x = -py * 0.16;
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      dead.current = true;
      if (raf.current) cancelAnimationFrame(raf.current);
      observer.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      textureRef.current?.dispose();
      textureRef.current = null;
      materialRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      material.dispose();
      geometry.dispose();
      env.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.remove();
    };
  }, []);

  // Load / swap the photo texture.
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    if (!photoUrl) {
      textureRef.current?.dispose();
      textureRef.current = null;
      material.map = null;
      material.color.set(0xdcdcdc); // neutral placeholder tint, only when there's no photo to read
      material.needsUpdate = true;
      renderNow();
      return;
    }
    let cancelled = false;
    new THREE.TextureLoader().load(photoUrl, (texture) => {
      if (cancelled || dead.current) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      const img = texture.image as HTMLImageElement;
      imgAspectRef.current = img.width / img.height;
      applyCrop(texture, cropRef.current ?? { x: 50, y: 50, zoom: 1 }, imgAspectRef.current);
      textureRef.current?.dispose();
      textureRef.current = texture;
      material.map = texture;
      material.color.set(0xffffff); // white so the color/contrast is the photo's own, not tinted
      material.needsUpdate = true;
      renderNow();
    });
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  // Re-apply crop when it changes (same texture, new repeat/offset).
  useEffect(() => {
    const texture = textureRef.current;
    if (!texture || !crop) return;
    applyCrop(texture, crop, imgAspectRef.current);
    renderNow();
  }, [crop]);

  // Update holo material properties.
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    const tier = rarity ?? "common";
    const active = Boolean(holo);
    material.iridescence = active ? IRIDESCENCE[tier] : 0;
    material.iridescenceIOR = 1.3;
    material.iridescenceThicknessRange = THICKNESS[tier];
    material.clearcoat = active ? CLEARCOAT[tier] : CLEARCOAT.common;
    material.clearcoatRoughness = active ? CLEARCOAT_ROUGHNESS[tier] : CLEARCOAT_ROUGHNESS.common;
    material.envMapIntensity = active ? ENV_INTENSITY[tier] : ENV_INTENSITY.common;
    material.ior = active ? IOR[tier] : IOR.common;
    if (active && tier === "secret") {
      material.emissive = new THREE.Color("#3a2c00");
      material.emissiveIntensity = 0.2;
    } else {
      material.emissiveIntensity = 0;
    }
    material.needsUpdate = true;
    renderNow();
  }, [rarity, holo]);

  return <div ref={containerRef} className="card3d-container" />;
}
