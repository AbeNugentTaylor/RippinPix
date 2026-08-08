"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { CardOrientation, Crop, HoloPattern, Rarity } from "@/lib/types";

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
  baseTiltX?: number;
  baseTiltY?: number;
}

interface Card3DProps {
  photoUrl: string | null;
  crop?: Crop;
  rarity?: Rarity;
  holo?: boolean;
  holoPattern?: HoloPattern;
  orientation?: CardOrientation;
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

// A 63:88 plane at 0.1 world-units-per-mm, matching a real trading card's
// short/long edges — swapped for a "landscape" card (CardConfig.orientation)
// rather than kept fixed, so the geometry/camera/holo-mask below all size
// themselves to whichever edge is actually "up" for that card.
const PLANE_SHORT = 6.3;
const PLANE_LONG = 8.8;
const CORNER_RADIUS = 0.32; // real trading cards run ~3mm on a 63mm width

function planeSize(orientation?: CardOrientation): { w: number; h: number } {
  return orientation === "landscape"
    ? { w: PLANE_LONG, h: PLANE_SHORT }
    : { w: PLANE_SHORT, h: PLANE_LONG };
}
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

// Multiplies a mask's per-fleck flicker frequency, for masks that pack a
// per-shape frequency/phase into their G/B channels (see the "Channel
// layout" comment above MASK_W) — nothing currently does; kept for a future
// mask that wants it. Lower = calmer, slower flicker; higher = twitchier.
export const HOLO_SPARKLE_FREQ = 1;

// A 63:88 (or, for a landscape card, 88:63) plane with rounded corners (real
// cards aren't sharp-cornered rectangles).
function createCardGeometry(planeW: number, planeH: number): THREE.BufferGeometry {
  const w = planeW / 2;
  const h = planeH / 2;
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
    uv.setXY(i, (pos.getX(i) + w) / planeW, (pos.getY(i) + h) / planeH);
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

// "Cosmos holo" mask, sourced directly from /public/holo-mask.png (the
// scattered star/cross pattern classic Pokémon TCG "cosmos holofoil" cards
// use) rather than synthesized: R = a contrast-boosted version of the
// image's own luminance, so the sparkle clusters stencil the rainbow
// overlay's visibility (see HOLO_FRAGMENT_SHADER / makeHoloMaskTextures),
// same mechanism "stripes"/"sunburst" use. Centered on the image's own mean
// brightness (not a fixed constant) so it adapts to the actual photo instead
// of assuming its exposure. An earlier version also baked this image into a
// normal-map bump for physical depth, but that turned out to be nearly
// invisible under normal lighting (see docs/holo-shader-notes.md) — the mask
// alone is what makes "cosmos" read as different from "none", so the bump
// was dropped.
//
// Cached at module scope, not per-mount: CardLightbox (src/components/
// CardLightbox.tsx) renders a fresh Card3D instance every time it opens, and
// without this cache each fresh instance would re-fetch and re-decode the
// image from scratch, racing its own first render — until that finished, the
// shader would fall back to the blank placeholder mask (fully unmasked, so
// the rainbow shows everywhere instead of clustered), which is what made the
// full-size lightbox preview intermittently look different from the live
// editor preview (already loaded, never re-mounts). Caching the promise
// means only the very first Card3D on the page ever actually waits on it.
let cosmosMaskDataPromise: Promise<{ width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }> | null = null;

function loadCosmosMaskData(url: string): Promise<{ width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }> {
  if (cosmosMaskDataPromise) return cosmosMaskDataPromise;
  cosmosMaskDataPromise = new Promise((resolve, reject) => {
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
      let sum = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) sum += lum(x, y);
      }
      const mean = sum / (w * h);
      // Sigmoid contrast centered above the image's own average brightness —
      // only the sparkle clusters (brighter than the dark background) show
      // through as visible rainbow, not the whole card.
      const alphaFor = (v: number) => 1 / (1 + Math.exp(-14 * (v - mean * 1.3)));

      const data = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          data[i] = Math.round(alphaFor(lum(x, y)) * 255);
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 255;
        }
      }
      resolve({ width: w, height: h, data });
    };
    img.onerror = () => {
      cosmosMaskDataPromise = null; // allow a retry on the next mount
      reject(new Error("failed to load cosmos mask source"));
    };
    img.src = url;
  });
  return cosmosMaskDataPromise;
}

// Every Card3D instance needs its own THREE.Texture/canvas (textures get
// disposed per-instance on unmount — see the mount effect's cleanup), so the
// cached pixel data above is turned into a fresh texture here rather than
// sharing one Texture object across instances.
function textureFromCosmosMaskData(maskData: { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = maskData.width;
  c.height = maskData.height;
  const g = c.getContext("2d")!;
  g.putImageData(new ImageData(maskData.data, maskData.width, maskData.height), 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Holo mask textures — stencils the rainbow overlay shows through, sampled
// straight at vUv (fixed to the card) rather than the rainbow's own
// parallax-shifted UV, so the pattern itself stays put while the color
// slides across it. Ported from the named `_Holo_Mask` textures in the
// reference shader graph (see docs/holo-shader-notes.md) — "stripes" is a
// diagonal foil pattern, "sunburst" rays from a bright core. Generated
// procedurally rather than importing the reference PNGs (Unity assets of
// unclear license, baked at the wrong aspect for this card). "cosmos" starts
// out pointing at the same blank (unmasked) texture as "none" — the real
// mask is derived asynchronously from the actual reference photo by
// loadCosmosMaskData (see above) and swapped in once it loads, since
// deriving it from an <img> can't happen synchronously at mount like the
// other three.
//
// Channel layout: R is the visibility mask HOLO_FRAGMENT_SHADER multiplies
// into alpha, same as a plain grayscale mask. G/B are reserved for a
// per-fleck random frequency/phase pair (see the sparkle-gate math in
// HOLO_FRAGMENT_SHADER) that no current mask populates — every mask here
// keeps G=B=0 so the shader treats it as "always on" rather than reading
// garbage into that gate — canvas draw calls (fillRect/stroke) write equal
// R/G/B for white, so those masks explicitly zero G/B after drawing.
const MASK_W = 256;
function maskHeight(planeW: number, planeH: number): number {
  return Math.round(MASK_W * (planeH / planeW));
}

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

function makeStripesMask(maskW: number, maskH: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = maskW;
  c.height = maskH;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, maskW, maskH);
  g.strokeStyle = "#fff";
  g.lineWidth = 3;
  g.save();
  g.translate(maskW / 2, maskH / 2);
  g.rotate(Math.PI / 8);
  const diag = Math.sqrt(maskW * maskW + maskH * maskH);
  for (let x = -diag; x <= diag; x += 9) {
    g.beginPath();
    g.moveTo(x, -diag);
    g.lineTo(x, diag);
    g.stroke();
  }
  g.restore();
  g.putImageData(zeroGB(g.getImageData(0, 0, maskW, maskH)), 0, 0);
  return new THREE.CanvasTexture(c);
}

function makeSunburstMask(maskW: number, maskH: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = maskW;
  c.height = maskH;
  const g = c.getContext("2d")!;
  const img = g.createImageData(maskW, maskH);
  const d = img.data;
  const cx = maskW / 2;
  const cy = maskH / 2;
  const rays = 40;
  for (let y = 0; y < maskH; y++) {
    for (let x = 0; x < maskW; x++) {
      const i = (y * maskW + x) * 4;
      // Normalize by each half-axis so rays radiate as true circles despite
      // the card's non-square aspect, instead of stretching into an ellipse.
      const dx = (x - cx) / (maskW / 2);
      const dy = (y - cy) / (maskH / 2);
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

function makeHoloMaskTextures(planeW: number, planeH: number): Record<HoloPattern, THREE.Texture> {
  const maskH = maskHeight(planeW, planeH);
  const textures = {
    none: makeBlankMask(),
    // Placeholder until loadCosmosMaskData's async photo-derived mask loads
    // and replaces this (see the mount effect below) — blank rather than
    // empty so the overlay isn't invisible during the brief loading window.
    cosmos: makeBlankMask(),
    stripes: makeStripesMask(MASK_W, maskH),
    sunburst: makeSunburstMask(MASK_W, maskH),
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
    // G/B would pack a per-fleck random frequency/phase so individual
    // sparkles flicker in and out independently as the tilt angle changes,
    // instead of the whole mask brightening/dimming as one flat layer — each
    // fleck only lights up when its own sine wave over the tilt angle
    // crosses a threshold. No current mask populates G/B (see the "Channel
    // layout" comment above MASK_W), so this is a no-op today.
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
function applyCrop(texture: THREE.Texture, crop: Crop, imgAspect: number, boxAspect: number) {
  let repeatX: number;
  let repeatY: number;
  if (imgAspect > boxAspect) {
    repeatY = 1;
    repeatX = boxAspect / imgAspect;
  } else {
    repeatX = 1;
    repeatY = imgAspect / boxAspect;
  }
  const zoom = Math.max(1, crop.zoom || 1);
  repeatX /= zoom;
  repeatY /= zoom;
  texture.repeat.set(repeatX, repeatY);
  texture.offset.set((1 - repeatX) * (crop.x / 100), (1 - repeatY) * (1 - crop.y / 100));
  texture.needsUpdate = true;
}

export default function Card3D({ photoUrl, crop, rarity, holo, holoPattern, orientation, overrides }: Card3DProps) {
  // Fixed for the life of this instance — a caller that lets orientation
  // change (CardEditor's live preview) keys the component to force a fresh
  // mount instead, since the geometry/camera built below are one-shot.
  const { w: planeW, h: planeH } = planeSize(orientation);
  const boxAspect = planeW / planeH;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dead = useRef(false);
  const raf = useRef<number | null>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const imgAspectRef = useRef(boxAspect);
  const cropRef = useRef(crop);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const holoMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const holoMeshRef = useRef<THREE.Mesh | null>(null);
  const holoMaskTexturesRef = useRef<Record<HoloPattern, THREE.Texture> | null>(null);
  const baseTiltRef = useRef({ x: BASE_TILT_X, y: BASE_TILT_Y });
  // Starts transparent and fades to 1 once there's something worth showing
  // (photo texture applied, or the no-photo placeholder tint) — without
  // this the card renders as a solid white rectangle (the material's default
  // color with no map yet) for however long the full-res fetch takes, which
  // reads as a blank-white flash rather than the backdrop showing through.
  const opacityTargetRef = useRef(0);

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
    const h = el.clientHeight || Math.round((w * planeH) / planeW);
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
    // Otherwise a finger-drag meant to tilt the card gets read by the
    // browser as a scroll/swipe-to-dismiss gesture instead.
    el.style.touchAction = "none";

    const scene = new THREE.Scene();
    const env = makeHoloEnv();
    scene.environment = env;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(FOV, w / h, 0.1, 100);
    // Bigger than a bare-minimum fit — BASE_TILT + idle sway + pointer tilt
    // (see loop() below) now keep the card off dead-on by default, and this
    // needs enough headroom that the rounded corners don't clip against the
    // frame at that angle.
    const dist = (planeH / 2 / Math.tan((FOV * Math.PI) / 360)) * 1.14;
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
      transparent: true,
      opacity: 0,
    });
    materialRef.current = material;
    const geometry = createCardGeometry(planeW, planeH);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Holo overlay — a child of `mesh` so it inherits the same rotation
    // every frame for free, offset a hair along local Z so it sits visually
    // in front without z-fighting. Hidden until a holo-tier card sets its
    // intensity above 0 (see the rarity/holo effect below).
    const holoMaskTextures = makeHoloMaskTextures(planeW, planeH);
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

    // A per-invocation flag, not the shared `dead` ref: React Strict Mode
    // (on by default for the app router in dev) double-invokes this whole
    // effect once on mount — setup, cleanup, setup again — and the second
    // setup resets `dead.current` back to false. That means the *first*,
    // thrown-away setup's callback below would no longer see itself as
    // cancelled, and would run against a torn-down `holoMaterial` while
    // still mutating/disposing whatever the live (second) mount's
    // `holoMaskTexturesRef` currently holds — corrupting the real mount's
    // mask swap and leaving `uHoloMask` stuck on a disposed blank
    // placeholder forever. `cancelled` is a fresh local for every
    // invocation, so only *this* setup's own cleanup can flip it (same
    // pattern the photo-texture effect below already uses correctly).
    let cancelled = false;
    loadCosmosMaskData("/holo-mask.png")
      .then((maskData) => {
        if (cancelled) return;
        const mask = textureFromCosmosMaskData(maskData);

        const textures = holoMaskTexturesRef.current;
        if (textures) {
          const placeholder = textures.cosmos;
          textures.cosmos = mask;
          // If "cosmos" is the pattern currently showing, the overlay is
          // still bound to the blank placeholder (created synchronously at
          // mount, before this photo finished loading) — swap it live so
          // the real mask appears without needing a pattern re-selection.
          if (holoMaterial.uniforms.uHoloMask.value === placeholder) {
            holoMaterial.uniforms.uHoloMask.value = mask;
          }
          placeholder.dispose();
        }
        renderNow();
      })
      .catch(() => {});

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

    // Ambient tilt from the device's orientation sensor, layered under the
    // pointer/touch tilt above. `active` tracks whether a drag is currently
    // driving the tilt (or just finished a moment ago) so a real drag always
    // wins over ambient gyro instead of the two fighting each other.
    const gyro = { x: 0, y: 0 };
    let hasGyro = false;
    let active = false;
    let activeTimeout: number | null = null;
    const setActive = (v: boolean, delay = 0) => {
      if (activeTimeout !== null) {
        window.clearTimeout(activeTimeout);
        activeTimeout = null;
      }
      if (delay > 0) activeTimeout = window.setTimeout(() => { active = v; }, delay);
      else active = v;
    };
    const onDown = (e: PointerEvent) => {
      setActive(true);
      // Capturing keeps pointermove firing for the rest of this drag even
      // once the finger crosses outside the card's own (fairly small)
      // bounds — without it, touch tracking silently stops there.
      if (e.pointerType === "touch") el.setPointerCapture(e.pointerId);
    };
    const onRelease = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        pointer.x = 0;
        pointer.y = 0;
      }
      setActive(false, 500);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onRelease);
    el.addEventListener("pointercancel", onRelease);

    // Only where reading orientation needs no permission prompt — iOS 13+
    // gates DeviceOrientationEvent behind a user-gesture dialog, which we
    // deliberately don't surface here. Calibrated relative to whatever
    // orientation the device was in when the card opened, not absolute
    // angles, since "flat" varies with how someone is holding their phone.
    let gyroBase: { beta: number; gamma: number } | null = null;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (!gyroBase) gyroBase = { beta: e.beta, gamma: e.gamma };
      hasGyro = true;
      gyro.x = Math.max(-1, Math.min(1, (e.gamma - gyroBase.gamma) / 30));
      gyro.y = Math.max(-1, Math.min(1, (e.beta - gyroBase.beta) / 30));
    };
    const DOE = typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined;
    const gyroNeedsPermission =
      !!DOE &&
      typeof (DOE as unknown as { requestPermission?: unknown }).requestPermission === "function";
    if (DOE && !gyroNeedsPermission) {
      window.addEventListener("deviceorientation", onOrientation);
    }

    let px = 0;
    let py = 0;
    const loop = () => {
      if (dead.current) return;
      raf.current = requestAnimationFrame(loop);
      const useGyro = hasGyro && !active;
      const targetX = useGyro ? gyro.x : pointer.x;
      const targetY = useGyro ? gyro.y : pointer.y;
      px += (targetX - px) * 0.12;
      py += (targetY - py) * 0.12;
      const t = performance.now() / 1000;
      // BASE_TILT defaults to flat (0,0) — a slow idle sway still keeps the
      // holo overlay's hue drifting gently even without pointer interaction,
      // similar to how the CSS version's gradient reads as "alive" at rest.
      mesh.rotation.y = baseTiltRef.current.y + Math.sin(t * 0.5) * 0.035 + px * 0.16;
      mesh.rotation.x = baseTiltRef.current.x + Math.sin(t * 0.37) * 0.025 - py * 0.12;
      material.opacity += (opacityTargetRef.current - material.opacity) * 0.2;
      holoMaterial.uniforms.uTime.value = t;
      holoMaterial.uniforms.uTiltX.value = px;
      holoMaterial.uniforms.uTiltY.value = py;
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      dead.current = true;
      cancelled = true;
      if (raf.current) cancelAnimationFrame(raf.current);
      observer.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onRelease);
      el.removeEventListener("pointercancel", onRelease);
      window.removeEventListener("deviceorientation", onOrientation);
      if (activeTimeout !== null) window.clearTimeout(activeTimeout);
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
      Object.values(holoMaskTextures).forEach((t) => t.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.remove();
    };
    // planeW/planeH/boxAspect are derived from `orientation`, treated as
    // fixed for this instance's lifetime (see the comment above them).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      opacityTargetRef.current = 1;
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
      applyCrop(texture, cropRef.current ?? { x: 50, y: 50, zoom: 1 }, imgAspectRef.current, boxAspect);
      textureRef.current?.dispose();
      textureRef.current = texture;
      material.map = texture;
      material.color.set(0xffffff); // white so the color/contrast is the photo's own, not tinted
      material.needsUpdate = true;
      opacityTargetRef.current = 1;
      renderNow();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoUrl]);

  // Re-apply crop when it changes (same texture, new repeat/offset).
  useEffect(() => {
    const texture = textureRef.current;
    if (!texture || !crop) return;
    applyCrop(texture, crop, imgAspectRef.current, boxAspect);
    renderNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
