"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Crop, HoloPattern, Rarity } from "@/lib/types";

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
  holoBandWidth?: number;
  holoPatternScale?: number;
  holoSparkleFreq?: number;
  normalScale?: number;
  baseTiltX?: number;
  baseTiltY?: number;
}

interface Card3DProps {
  photoUrl: string | null;
  crop?: Crop;
  rarity?: Rarity;
  holo?: boolean;
  holoPattern?: HoloPattern;
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

// Etched-foil bump (see loadFoilNormalMap below) — the reference shader's
// "heightmap -> normals" technique, ported as a normalMap so key/rim
// lighting catches the cosmos-holo star/cross pattern instead of a perfectly
// flat surface. 0 for common: a plain print has no physical texture to catch.
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

// How wide the traveling glare band is, as a fraction of the card's
// diagonal — narrower reads as a sharper, more localized streak (closer to
// the reference video); wider approaches the old "whole card lit at once"
// look. Same for every rarity; only holoStrength/HOLO_STRENGTH scale how
// bright the band gets.
export const HOLO_BAND_WIDTH = 0.34;

// Scales the UV the pattern mask is sampled at (around the card's center) —
// >1 tiles the mask more times across the card, so shapes/stripes read
// smaller and denser; <1 zooms in, so they read bigger. Mirrors the
// reference shader graph's `_Holo_Density` UV-scale property (see
// docs/holo-shader-notes.md).
export const HOLO_PATTERN_SCALE = 1;

// Multiplies the cosmos mask's per-fleck flicker frequency (itself packed
// per-shape into the mask texture — see makeCosmosMask). Lower = calmer,
// slower flicker for the same pointer movement; higher = twitchier.
export const HOLO_SPARKLE_FREQ = 1;

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

// "Cosmos holo" etched foil normal map, sourced directly from
// /public/holo-mask.png (the scattered star/cross pattern classic Pokémon
// TCG "cosmos holofoil" cards use) instead of a synthesized diagonal-ridge
// pattern. The PNG is a plain grayscale height image, not a normal map —
// MeshPhysicalMaterial needs tangent-space normals — so this loads it, reads
// luminance as height, and bakes a normal map from the height gradient the
// same way the old sine-wave version did (central difference -> RG, B=1).
// The image's own aspect ratio (285x400) is almost exactly the card plane's
// (6.3x8.8), so it's mapped once across the card's UVs, not tiled.
function loadFoilNormalMap(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const src = document.createElement("canvas");
      src.width = w;
      src.height = h;
      const sg = src.getContext("2d")!;
      sg.drawImage(img, 0, 0);
      const px = sg.getImageData(0, 0, w, h).data;
      const lum = (x: number, y: number) => {
        const cx = Math.min(w - 1, Math.max(0, x));
        const cy = Math.min(h - 1, Math.max(0, y));
        const i = (cy * w + cx) * 4;
        return (px[i] + px[i + 1] + px[i + 2]) / (3 * 255);
      };
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const og = out.getContext("2d")!;
      const normalImg = og.createImageData(w, h);
      const d = normalImg.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const nx = lum(x - 1, y) - lum(x + 1, y);
          const ny = lum(x, y - 1) - lum(x, y + 1);
          d[i] = 128 + nx * 90;
          d[i + 1] = 128 + ny * 90;
          d[i + 2] = 255;
          d[i + 3] = 255;
        }
      }
      og.putImageData(normalImg, 0, 0);
      resolve(new THREE.CanvasTexture(out));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Holo mask textures — stencils the rainbow overlay shows through, sampled
// straight at vUv (fixed to the card) rather than the rainbow's own
// parallax-shifted UV, so the pattern itself stays put while the color
// slides across it. Ported from the named `_Holo_Mask` textures in the
// reference shader graph (see docs/holo-shader-notes.md) — "cosmos" is a
// dot/nebula field, "stripes" a diagonal foil pattern, "sunburst" rays from a
// bright core. Generated procedurally rather than importing the reference
// PNGs (Unity assets of unclear license, baked at the wrong aspect for this
// card).
//
// Channel layout: R is the visibility mask HOLO_FRAGMENT_SHADER multiplies
// into alpha, same as a plain grayscale mask. G/B are only meaningful for
// "cosmos": a per-fleck random frequency/phase pair, packed in so each
// sparkle can flicker in and out independently as the view angle changes
// (see the sparkle-gate math in HOLO_FRAGMENT_SHADER) instead of the whole
// mask fading as one flat layer. Every other mask must keep G=B=0 so the
// shader treats it as "always on" rather than reading garbage into that gate
// — canvas draw calls (fillRect/stroke) write equal R/G/B for white, so
// those masks explicitly zero G/B after drawing.
const MASK_W = 256;
const MASK_H = Math.round(MASK_W * (PLANE_H / PLANE_W));

function zeroGB(imageData: ImageData): ImageData {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i + 1] = 0;
    d[i + 2] = 0;
  }
  return imageData;
}

function makeBlankMask(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const g = c.getContext("2d")!;
  const img = g.createImageData(1, 1);
  img.data[0] = 255;
  img.data[3] = 255;
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

type FleckShape = "circle" | "square" | "diamond" | "cross";
const FLECK_SHAPES: FleckShape[] = ["circle", "square", "diamond", "cross"];

// Hard-edged (no soft falloff) membership test — real foil glitter reads as
// crisp cut facets, not airbrushed blobs.
function fleckContains(shape: FleckShape, dx: number, dy: number, r: number): boolean {
  switch (shape) {
    case "circle":
      return dx * dx + dy * dy <= r * r;
    case "square":
      return Math.abs(dx) <= r && Math.abs(dy) <= r;
    case "diamond":
      return Math.abs(dx) + Math.abs(dy) <= r;
    case "cross": {
      const thin = Math.max(1, r * 0.3);
      return (Math.abs(dx) <= thin || Math.abs(dy) <= thin) && Math.max(Math.abs(dx), Math.abs(dy)) <= r;
    }
  }
}

function makeCosmosMask(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = MASK_W;
  c.height = MASK_H;
  const g = c.getContext("2d")!;
  const img = g.createImageData(MASK_W, MASK_H);
  const d = img.data;

  // Fine dust: dense, single-pixel, always-on grain (G=B=0, so the shader's
  // sparkle-flicker gate leaves it alone) — the constant noise floor real
  // holo foil has even where no distinct glint is catching the light.
  const dustCount = 1400;
  for (let i = 0; i < dustCount; i++) {
    const x = Math.floor(Math.random() * MASK_W);
    const y = Math.floor(Math.random() * MASK_H);
    const idx = (y * MASK_W + x) * 4;
    const v = Math.round(70 + Math.random() * 185);
    if (v > d[idx]) d[idx] = v;
    d[idx + 3] = 255;
  }

  // Sparkle flecks: hard-edged shapes, sizes skewed small with a few larger
  // ones, each stamped with its own random frequency/phase so it flickers
  // independently (see HOLO_FRAGMENT_SHADER's sparkle gate).
  const fleckCount = 190;
  for (let i = 0; i < fleckCount; i++) {
    const cx = Math.random() * MASK_W;
    const cy = Math.random() * MASK_H;
    const r = Math.random() < 0.85 ? 2 + Math.random() * 3.5 : 7 + Math.random() * 9;
    const shape = FLECK_SHAPES[Math.floor(Math.random() * FLECK_SHAPES.length)];
    const freqByte = Math.floor(Math.random() * 256);
    const phaseByte = Math.floor(Math.random() * 256);
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(MASK_W - 1, Math.ceil(cx + r));
    const minY = Math.max(0, Math.floor(cy - r));
    const maxY = Math.min(MASK_H - 1, Math.ceil(cy + r));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!fleckContains(shape, x - cx, y - cy, r)) continue;
        const idx = (y * MASK_W + x) * 4;
        d[idx] = 255;
        d[idx + 1] = freqByte;
        d[idx + 2] = phaseByte;
        d[idx + 3] = 255;
      }
    }
  }

  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

function makeStripesMask(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = MASK_W;
  c.height = MASK_H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, MASK_W, MASK_H);
  g.strokeStyle = "#fff";
  g.lineWidth = 3;
  g.save();
  g.translate(MASK_W / 2, MASK_H / 2);
  g.rotate(Math.PI / 8);
  const diag = Math.sqrt(MASK_W * MASK_W + MASK_H * MASK_H);
  for (let x = -diag; x <= diag; x += 9) {
    g.beginPath();
    g.moveTo(x, -diag);
    g.lineTo(x, diag);
    g.stroke();
  }
  g.restore();
  g.putImageData(zeroGB(g.getImageData(0, 0, MASK_W, MASK_H)), 0, 0);
  return new THREE.CanvasTexture(c);
}

function makeSunburstMask(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = MASK_W;
  c.height = MASK_H;
  const g = c.getContext("2d")!;
  const img = g.createImageData(MASK_W, MASK_H);
  const d = img.data;
  const cx = MASK_W / 2;
  const cy = MASK_H / 2;
  const rays = 40;
  for (let y = 0; y < MASK_H; y++) {
    for (let x = 0; x < MASK_W; x++) {
      const i = (y * MASK_W + x) * 4;
      // Normalize by each half-axis so rays radiate as true circles despite
      // the card's non-square aspect, instead of stretching into an ellipse.
      const dx = (x - cx) / (MASK_W / 2);
      const dy = (y - cy) / (MASK_H / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const ray = (Math.sin(angle * rays) + 1) / 2;
      const core = Math.max(0, 1 - dist * 3.2);
      const v = Math.min(1, Math.max(ray * (1 - Math.min(1, dist)), core));
      d[i] = Math.round(v * 255);
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

function makeHoloMaskTextures(): Record<HoloPattern, THREE.Texture> {
  const textures = {
    none: makeBlankMask(),
    cosmos: makeCosmosMask(),
    stripes: makeStripesMask(),
    sunburst: makeSunburstMask(),
  };
  // Repeat wrapping so uMaskScale (see HOLO_FRAGMENT_SHADER) can tile these
  // finer than 1:1 instead of clamping/stretching at the texture edges.
  for (const key of ["cosmos", "stripes", "sunburst"] as const) {
    textures[key].wrapS = THREE.RepeatWrapping;
    textures[key].wrapT = THREE.RepeatWrapping;
  }
  return textures;
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
  uniform float uBandWidth;
  uniform float uMaskScale;
  uniform float uSparkleFreqScale;
  uniform sampler2D uHoloMask;

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
    // Mask is sampled at the plain (non-parallax) UV — it's a stencil baked
    // fixed to the card, unlike the rainbow pattern that slides above it.
    // G/B (only meaningful for the cosmos pattern — see makeCosmosMask) pack
    // a per-fleck random frequency/phase so individual sparkles flicker in
    // and out independently as the tilt angle changes, instead of the whole
    // mask brightening/dimming as one flat layer — each fleck only lights up
    // when its own sine wave over the tilt angle crosses a threshold, so
    // rotating the card continuously reveals a different subset each moment.
    // uMaskScale zooms the mask sample around the card's center — >1 tiles
    // it smaller/denser, <1 zooms in for bigger shapes (mirrors the
    // reference shader graph's _Holo_Density UV-scale property).
    vec2 maskUv = (vUv - 0.5) * uMaskScale + 0.5;
    vec4 maskSample = texture2D(uHoloMask, maskUv);
    float baseMask = maskSample.r;
    float isFleck = step(0.001, maskSample.g + maskSample.b);
    float freq = (1.0 + maskSample.g * 6.0) * uSparkleFreqScale;
    float phase = maskSample.b * 6.2831853;
    float tiltAngle = atan(uTiltY, uTiltX);
    float twinkle = sin(tiltAngle * freq + phase) * 0.5 + 0.5;
    float flicker = smoothstep(0.55, 1.0, twinkle);
    float angleDriven = smoothstep(0.02, 0.15, length(vec2(uTiltX, uTiltY)));
    float fleckGate = mix(0.35, flicker, angleDriven);
    float maskVal = baseMask * mix(1.0, fleckGate, isFleck);

    // Real foil holo isn't visible everywhere at once — it's a bright glare
    // band that sweeps across the surface as the viewing angle changes,
    // with the rest of the card reading close to plain. cardDiag (fixed to
    // the card, unlike the parallax-offset diag above) is position along
    // the card's diagonal; the band's center is driven by tilt so it
    // visibly travels across the surface as the card rotates, instead of
    // the whole card lighting up uniformly.
    float cardDiag = (vUv.x + vUv.y) * 0.5;
    float bandCenter = 0.5 - uTiltX * 0.55 - uTiltY * 0.4;
    float band = 1.0 - smoothstep(0.0, uBandWidth, abs(cardDiag - bandCenter));

    float alpha = uIntensity * (0.03 + 0.95 * band * (0.6 + 0.4 * (1.0 - ndotv) + 0.2 * tiltMag)) * sparkle * maskVal;
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

export default function Card3D({ photoUrl, crop, rarity, holo, holoPattern, overrides }: Card3DProps) {
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
  const foilNormalRef = useRef<THREE.Texture | null>(null);
  const holoMaskTexturesRef = useRef<Record<HoloPattern, THREE.Texture> | null>(null);
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

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: ROUGHNESS.common,
      clearcoat: CLEARCOAT.common,
      clearcoatRoughness: CLEARCOAT_ROUGHNESS.common,
      envMapIntensity: ENV_INTENSITY.common,
      ior: IOR.common,
      normalScale: new THREE.Vector2(NORMAL_SCALE.common, NORMAL_SCALE.common),
    });
    materialRef.current = material;
    loadFoilNormalMap("/holo-mask.png")
      .then((t) => {
        if (dead.current) {
          t.dispose();
          return;
        }
        foilNormalRef.current = t;
        material.normalMap = t;
        material.needsUpdate = true;
        renderNow();
      })
      .catch(() => {});
    const geometry = createCardGeometry();
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Holo overlay — a child of `mesh` so it inherits the same rotation
    // every frame for free, offset a hair along local Z so it sits visually
    // in front without z-fighting. Hidden until a holo-tier card sets its
    // intensity above 0 (see the rarity/holo effect below).
    const holoMaskTextures = makeHoloMaskTextures();
    holoMaskTexturesRef.current = holoMaskTextures;
    const holoMaterial = new THREE.ShaderMaterial({
      vertexShader: HOLO_VERTEX_SHADER,
      fragmentShader: HOLO_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uTiltX: { value: 0 },
        uTiltY: { value: 0 },
        uBandWidth: { value: HOLO_BAND_WIDTH },
        uMaskScale: { value: HOLO_PATTERN_SCALE },
        uSparkleFreqScale: { value: HOLO_SPARKLE_FREQ },
        uHoloMask: { value: holoMaskTextures.none },
      },
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
      holoMaskTexturesRef.current = null;
      material.dispose();
      holoMaterial.dispose();
      geometry.dispose();
      env.dispose();
      foilNormalRef.current?.dispose();
      foilNormalRef.current = null;
      Object.values(holoMaskTextures).forEach((t) => t.dispose());
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

  // Swap which mask texture the holo overlay's alpha is stenciled through.
  useEffect(() => {
    const holoMaterial = holoMaterialRef.current;
    const textures = holoMaskTexturesRef.current;
    if (!holoMaterial || !textures) return;
    holoMaterial.uniforms.uHoloMask.value = textures[holoPattern ?? "none"];
    renderNow();
  }, [holoPattern]);

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
    if (overrides.holoBandWidth !== undefined && holoMaterialRef.current) {
      holoMaterialRef.current.uniforms.uBandWidth.value = overrides.holoBandWidth;
    }
    if (overrides.holoPatternScale !== undefined && holoMaterialRef.current) {
      holoMaterialRef.current.uniforms.uMaskScale.value = overrides.holoPatternScale;
    }
    if (overrides.holoSparkleFreq !== undefined && holoMaterialRef.current) {
      holoMaterialRef.current.uniforms.uSparkleFreqScale.value = overrides.holoSparkleFreq;
    }
    renderNow();
  }, [overrides, rarity, holo]);

  return <div ref={containerRef} className="card3d-container" />;
}
