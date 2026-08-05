"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Crop, Rarity } from "@/lib/types";

// Live-tunable overrides for the debug panel (src/components/configurator/
// LightingDebugPanel.tsx) — anything left undefined falls back to the normal
// rarity-driven default, so this is safe to leave unset in production usage.
export interface Card3DOverrides {
  ambient?: number;
  key?: number;
  rim?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  roughness?: number;
  envMapIntensity?: number;
  ior?: number;
  holoStrength?: number;
  normalScale?: number;
  baseTiltX?: number;
  baseTiltY?: number;
}

interface Card3DProps {
  photoUrl: string | null;
  crop?: Crop;
  rarity?: Rarity;
  holo?: boolean;
  overrides?: Card3DOverrides;
}

// How strongly the hue-shift rainbow overlay (see HOLO_VERTEX_SHADER /
// HOLO_FRAGMENT_SHADER below) shows on top of the card. Physically-based
// `iridescence` used to drive this and never worked: three.js's clearcoat
// layer computes its own plain dielectric Fresnel with zero reference to
// iridescence anywhere in the shader (confirmed by reading
// lights_physical_pars_fragment.glsl.js), so the visible glare — which comes
// from clearcoat — could never pick up any color from it. This overlay is a
// second, purpose-built mesh instead: the same "rotate hue by view angle"
// trick real TCG-style holo shaders use (e.g. the Pokémon TCG Pocket effect
// in github.com/daniel-ilett/shaders-holo-card), not a physical simulation.
export const HOLO_STRENGTH: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.25,
  rare: 0.45,
  holo: 0.75,
  secret: 0.9,
};

// Clearcoat/env reflection is an *additive* layer on top of the diffuse
// read, not multiplied by it — so it disproportionately lifts and desaturates
// dark pixels relative to bright ones (a small add is huge % change on a
// dark shadow, barely visible on a bright highlight). Kept low outside holo.
// A touch of it on `common` (confirmed against the real site) reads as a
// satin print finish rather than fully matte.
export const CLEARCOAT: Record<Rarity, number> = {
  common: 0.13,
  uncommon: 0.3,
  rare: 0.55,
  holo: 0.85,
  secret: 0.9,
};

export const CLEARCOAT_ROUGHNESS: Record<Rarity, number> = {
  common: 0.12,
  uncommon: 0.15,
  rare: 0.1,
  holo: 0.1,
  secret: 0.08,
};

// Clearcoat's own Fresnel reflectance in three.js's shader never references
// `iridescence` at all (confirmed by reading lights_physical_pars_fragment —
// clearcoat computes a plain dielectric fresnelClearcoat, iridescence only
// mixes into the *base* material's specular term). So the highlight that
// should show a rainbow has to come from the base specular, not clearcoat —
// which means it needs to be tight and bright enough to actually be visible,
// i.e. low roughness, for holo/secret specifically.
export const ROUGHNESS: Record<Rarity, number> = {
  common: 0.7,
  uncommon: 0.55,
  rare: 0.4,
  holo: 0.18,
  secret: 0.12,
};

// MeshPhysicalMaterial always has a baseline specular reflectance from ior
// even with clearcoat at 0 (default ior 1.5 -> ~4% F0) — that residual
// glassiness was still adding a faint additive lift on top of the diffuse
// read. ior 1.0 (matching air) zeroes it out for common so a non-holo card
// is genuinely just the photo, no glassy quality at all.
export const IOR: Record<Rarity, number> = {
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
// Safe to push these higher than before now that the environment itself is
// mostly black (see makeHoloEnv) — a dark source contributes ~0 regardless
// of intensity, so raising this only makes the occasional bright spot it
// catches more vivid, not the overall card brighter/greyer.
export const ENV_INTENSITY: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.08,
  rare: 0.2,
  holo: 0.5,
  secret: 0.65,
};

// Etched-foil bump (see makeFoilNormalMap below) — the reference shader's
// "heightmap -> normals" technique, ported as a normalMap so key/rim
// lighting catches a fine embossed ridge pattern instead of a perfectly flat
// surface. 0 for common: a plain print has no physical texture to catch.
export const NORMAL_SCALE: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.08,
  rare: 0.16,
  holo: 0.3,
  secret: 0.38,
};

const PLANE_W = 6.3;
const PLANE_H = 8.8;
const BOX_ASPECT = PLANE_W / PLANE_H;
const CORNER_RADIUS = 0.32; // real trading cards run ~3mm on a 63mm width
const FOV = 26;
// Flat resting pose — an earlier permanent baseline tilt (added to guarantee
// *some* viewing angle for Fresnel/iridescence) turned out to not be the
// actual fix for holo visibility (the real issues were the clearcoat/
// iridescence material wiring above), so this reverts to dead flat; tilt now
// only comes from actual pointer interaction.
export const BASE_TILT_Y = 0;
export const BASE_TILT_X = 0;
// Default light rig, confirmed against the real site via the debug panel —
// see the mount effect below for why ambient carries most of the exposure
// and key/rim stay off-axis.
export const DEFAULT_LIGHTS = { ambient: 1.33, key: 1.84, rim: 0.89 };

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

// Real holo foil is backed *dark* on purpose: a black backing means the
// clearcoat/iridescent layer shows the card's true colors almost everywhere,
// and only flashes color where a reflection happens to catch one of a few
// bright spots at the right angle. A pale/white environment (the previous
// version of this map) reflects pale light back across most viewing angles
// instead — a broad, low-contrast wash rather than a rare, vivid glint.
function makeHoloEnv(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#050505";
  g.fillRect(0, 0, 256, 128);
  const spots: [number, number, number, string][] = [
    [40, 24, 22, "#ff2f7a"],
    [110, 18, 26, "#2fd2ff"],
    [172, 34, 20, "#e8ff2f"],
    [64, 80, 22, "#2fff8f"],
    [152, 86, 24, "#a34bff"],
    [214, 62, 18, "#ff8a2f"],
  ];
  spots.forEach(([x, y, r, color]) => {
    const glow = g.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Procedural "etched foil" normal map — the reference shader's heightmap
// (a repeating diagonal ridge pattern, the classic holo-foil texture) baked
// straight to tangent-space normals instead of going through an actual
// height field, since a normal map is all MeshPhysicalMaterial needs. Tiled
// densely so the ridges read as a fine surface grain, not a visible pattern.
function makeFoilNormalMap(): THREE.Texture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const nx = Math.sin((x + y) * 0.5);
      const ny = Math.sin((x - y) * 0.5);
      d[i] = 128 + nx * 40;
      d[i + 1] = 128 + ny * 40;
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 14);
  return t;
}

// The holo overlay: a second mesh, same geometry as the card, sitting a
// hair in front and additively blended on top. Rotates hue by view angle
// (dot of surface normal and view direction) plus a diagonal sweep across
// the UV and a slow time drift, so it always reads as a bold, obviously-
// stylized rainbow — never a subtle physical glint that only shows at one
// exact angle, which is what made the PBR-iridescence attempt invisible.
const HOLO_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDirView;
  void main() {
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDirView = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const HOLO_FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDirView;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uTiltX;
  uniform float uTiltY;

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    vec3 N = normalize(vNormalView);
    vec3 V = normalize(vViewDirView);
    float ndotv = clamp(dot(N, V), 0.0, 1.0);

    // Parallax: sample the rainbow pattern from a UV offset by tilt, as if
    // it floats above the surface on its own layer (the reference shader's
    // "second view vector locked to card pivot point" trick) — this makes
    // the pattern visibly slide across the card as you tilt, not just
    // recolor in place.
    vec2 parallaxUv = vUv + vec2(uTiltX, uTiltY) * 0.22;
    float diag = (parallaxUv.x + parallaxUv.y) * 0.5;

    // Hue driven directly and linearly by tilt instead of dot(normal,view):
    // ndotv barely moves at the small angles this card actually tilts
    // through (1-cos(theta) is quadratically tiny near 0 deg), so the old
    // formula looked almost static. uTiltX/uTiltY span roughly -1..1 across
    // the full pointer range, giving a full, obvious hue sweep instead.
    float hue = fract(uTiltX * 0.9 + uTiltY * 0.7 + diag * 1.3 + uTime * 0.025);
    vec3 rainbow = hsv2rgb(vec3(hue, 0.8, 1.0));
    float sparkle = 0.85 + 0.15 * sin(vUv.x * 37.0 + vUv.y * 29.0 + uTime * 0.6);
    float tiltMag = clamp(abs(uTiltX) + abs(uTiltY), 0.0, 1.0);
    float alpha = uIntensity * (0.26 + 0.45 * (1.0 - ndotv) + 0.2 * tiltMag) * sparkle;
    gl_FragColor = vec4(rainbow, clamp(alpha, 0.0, 1.0));
  }
`;

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

export default function Card3D({ photoUrl, crop, rarity, holo, overrides }: Card3DProps) {
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
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const holoMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const holoMeshRef = useRef<THREE.Mesh | null>(null);
  const baseTiltRef = useRef({ x: BASE_TILT_X, y: BASE_TILT_Y });

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
    // Bigger than a bare-minimum fit — BASE_TILT + idle sway + pointer tilt
    // (see loop() below) now keep the card off dead-on by default, and this
    // needs enough headroom that the rounded corners don't clip against the
    // frame at that angle.
    const dist = (PLANE_H / 2 / Math.tan((FOV * Math.PI) / 360)) * 1.14;
    camera.position.set(0, 0, dist);
    cameraRef.current = camera;

    // AmbientLight only ever feeds three.js's *diffuse* irradiance term — it
    // has no direction, so it can't produce a specular/clearcoat reflection
    // at all. That makes it the right tool for tilt-stable exposure: cranking
    // this up can't create or brighten a glare, and — since it lights a flat
    // plane perfectly uniformly — it only ever scales the whole image, never
    // distorts shadow/highlight balance the way a strong axis-aligned light
    // did before. Carries most of the baseline exposure. key/rim are
    // off-axis, so unlike that previous light their specular reflection sits
    // away from dead-center view angle, where iridescence can actually shift
    // color — raised enough to read as a real, visible glint again, not just
    // shape/shading.
    const ambientLight = new THREE.AmbientLight(0xffffff, DEFAULT_LIGHTS.ambient);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;
    const key = new THREE.DirectionalLight(0xffffff, DEFAULT_LIGHTS.key);
    key.position.set(3, 4, 6);
    scene.add(key);
    keyLightRef.current = key;
    const rimLight = new THREE.DirectionalLight(0xffe6f8, DEFAULT_LIGHTS.rim);
    rimLight.position.set(-4, -2, 3);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    const foilNormal = makeFoilNormalMap();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: ROUGHNESS.common,
      clearcoat: CLEARCOAT.common,
      clearcoatRoughness: CLEARCOAT_ROUGHNESS.common,
      envMapIntensity: ENV_INTENSITY.common,
      ior: IOR.common,
      normalMap: foilNormal,
      normalScale: new THREE.Vector2(NORMAL_SCALE.common, NORMAL_SCALE.common),
    });
    materialRef.current = material;
    const geometry = createCardGeometry();
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Holo overlay — a child of `mesh` so it inherits the same rotation
    // every frame for free, offset a hair along local Z so it sits visually
    // in front without z-fighting. Hidden until a holo-tier card sets its
    // intensity above 0 (see the rarity/holo effect below).
    const holoMaterial = new THREE.ShaderMaterial({
      vertexShader: HOLO_VERTEX_SHADER,
      fragmentShader: HOLO_FRAGMENT_SHADER,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uTiltX: { value: 0 }, uTiltY: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    holoMaterialRef.current = holoMaterial;
    const holoMesh = new THREE.Mesh(geometry, holoMaterial);
    holoMesh.position.z = 0.02;
    holoMesh.renderOrder = 1;
    holoMesh.visible = false;
    mesh.add(holoMesh);
    holoMeshRef.current = holoMesh;

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
      const t = performance.now() / 1000;
      // BASE_TILT defaults to flat (0,0) — a slow idle sway still keeps the
      // holo overlay's hue drifting gently even without pointer interaction,
      // similar to how the CSS version's gradient reads as "alive" at rest.
      mesh.rotation.y = baseTiltRef.current.y + Math.sin(t * 0.5) * 0.035 + px * 0.16;
      mesh.rotation.x = baseTiltRef.current.x + Math.sin(t * 0.37) * 0.025 - py * 0.12;
      holoMaterial.uniforms.uTime.value = t;
      holoMaterial.uniforms.uTiltX.value = px;
      holoMaterial.uniforms.uTiltY.value = py;
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
      ambientLightRef.current = null;
      keyLightRef.current = null;
      rimLightRef.current = null;
      holoMaterialRef.current = null;
      holoMeshRef.current = null;
      material.dispose();
      holoMaterial.dispose();
      geometry.dispose();
      env.dispose();
      foilNormal.dispose();
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
    material.clearcoat = active ? CLEARCOAT[tier] : CLEARCOAT.common;
    material.clearcoatRoughness = active ? CLEARCOAT_ROUGHNESS[tier] : CLEARCOAT_ROUGHNESS.common;
    material.envMapIntensity = active ? ENV_INTENSITY[tier] : ENV_INTENSITY.common;
    material.ior = active ? IOR[tier] : IOR.common;
    material.roughness = active ? ROUGHNESS[tier] : ROUGHNESS.common;
    const normalScale = active ? NORMAL_SCALE[tier] : NORMAL_SCALE.common;
    material.normalScale.set(normalScale, normalScale);
    if (active && tier === "secret") {
      material.emissive = new THREE.Color("#3a2c00");
      material.emissiveIntensity = 0.2;
    } else {
      material.emissiveIntensity = 0;
    }
    material.needsUpdate = true;
    const holoMaterial = holoMaterialRef.current;
    const holoMesh = holoMeshRef.current;
    const strength = active ? HOLO_STRENGTH[tier] : 0;
    if (holoMaterial) holoMaterial.uniforms.uIntensity.value = strength;
    if (holoMesh) holoMesh.visible = strength > 0;
    renderNow();
  }, [rarity, holo]);

  // Debug-panel overrides — applied after the rarity/holo defaults above so
  // they always win. Each field is independently optional: only sliders the
  // panel actually renders (and the user has touched) affect anything.
  useEffect(() => {
    if (!overrides) return;
    if (overrides.ambient !== undefined && ambientLightRef.current) {
      ambientLightRef.current.intensity = overrides.ambient;
    }
    if (overrides.key !== undefined && keyLightRef.current) {
      keyLightRef.current.intensity = overrides.key;
    }
    if (overrides.rim !== undefined && rimLightRef.current) {
      rimLightRef.current.intensity = overrides.rim;
    }
    if (overrides.baseTiltX !== undefined) baseTiltRef.current.x = overrides.baseTiltX;
    if (overrides.baseTiltY !== undefined) baseTiltRef.current.y = overrides.baseTiltY;
    const material = materialRef.current;
    if (material) {
      if (overrides.clearcoat !== undefined) material.clearcoat = overrides.clearcoat;
      if (overrides.clearcoatRoughness !== undefined) material.clearcoatRoughness = overrides.clearcoatRoughness;
      if (overrides.roughness !== undefined) material.roughness = overrides.roughness;
      if (overrides.envMapIntensity !== undefined) material.envMapIntensity = overrides.envMapIntensity;
      if (overrides.ior !== undefined) material.ior = overrides.ior;
      if (overrides.normalScale !== undefined) material.normalScale.set(overrides.normalScale, overrides.normalScale);
      material.needsUpdate = true;
    }
    if (overrides.holoStrength !== undefined) {
      if (holoMaterialRef.current) holoMaterialRef.current.uniforms.uIntensity.value = overrides.holoStrength;
      if (holoMeshRef.current) holoMeshRef.current.visible = overrides.holoStrength > 0;
    }
    renderNow();
  }, [overrides, rarity, holo]);

  return <div ref={containerRef} className="card3d-container" />;
}
