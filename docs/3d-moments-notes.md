# 3D Moments — how we turn a casual video into a 3D image

Notes from the investigation behind `/moments` (capture a quick clip → lo-fi
3D memory), including why this approach was chosen and where it can go next.

> **v2 update — measured depth is now the primary source.** The first
> version used AI depth only; testing against a clip with real sideways
> motion showed the AI map can be flat-out wrong (it called the nearest
> doorframe "far") while triangulation from the footage's own parallax got
> the scene right (387 tracked points, 0.2px reprojection error, 2.7°
> median triangulation angle). The shipped pipeline now measures depth from
> the video first and uses AI only as comparison/fallback — see
> "Measured depth pipeline" below.

## The test clip

The reference capture was a 4.5s handheld iPhone clip (480×360, H.264, indoor
dining room, low light): heavy motion blur, and — critically — the camera
motion is mostly **rotation** (a pan), not translation. That shaped the whole
decision below.

## Approaches considered

| Approach | Verdict |
| --- | --- |
| Photogrammetry / SfM (COLMAP → mesh) | ❌ Needs real camera translation and sharp frames. A casual pan gives near-zero parallax; feature matching dies on motion blur. Minutes of compute, native tooling, frequent hard failures. |
| Gaussian splatting (incl. WebGPU trainers like Brush) | ❌ Same capture requirements as SfM (it needs COLMAP-style poses first), plus minutes of GPU training. Beautiful when it works; wrong fit for "quick capture, always works". |
| Hosted APIs (Luma, Polycam…) | ❌ Not self-contained: accounts, uploads, cost, privacy. |
| **Two-view triangulation from video parallax** | ✅ **(primary)** When the clip translates even slightly, tracked parallax triangulates real, measured 3D — no model, no downloads, and it's *your footage's* geometry. Fails informatively on pans. |
| **Monocular depth → displaced surface ("3D photo")** | ✅ **(fallback + comparison)** Works from a *single frame*, so pans and stills still produce something. Can be badly wrong on unusual scenes — that's why it's not primary. |

Validation: MiDaS-small (ONNX) on the sharpest frame of the test clip produced
a clean relief (floor near, wall far, rocking chair popping out), and
re-projected novel views showed convincing parallax despite the blur and low
resolution. This is the approach `/moments` ships.

## Measured depth pipeline (`src/lib/moments/parallax/`)

Runs entirely in the page, no wasm, no downloads (~4–7s for a few-second
clip):

1. **Partner scouting** — the sharpest frame is the reference; a handful of
   candidate partners (immediate neighbors ±1/±2/±4 plus frames spread
   across the clip) are coarsely tracked and the one with the most residual
   parallax wins. Near neighbors matter: on blurry handheld footage only
   frames ~0.1–0.3s apart may track at all.
2. **Tracking** (`lk.ts`) — pyramidal Lucas–Kanade on a 6px grid with a
   forward-backward consistency gate. Every surviving track is a real
   observation of scene motion between the two frames.
3. **Pan detection** (`twoview.ts`) — RANSAC homography absorbs camera
   rotation/dominant plane; the residuals are the true parallax. Median
   residual < 1.2px ⇒ "no-parallax" (a pan/static shot) and the app falls
   back to AI depth, telling the user why.
4. **Two-view geometry** (`twoview.ts`) — 8-point essential matrix under
   RANSAC (Sampson gating), pose recovery via cheirality voting over the
   four (R,t) candidates, then midpoint triangulation of every inlier
   track. Small dense linear algebra (Jacobi eigen / 3×3 SVD) lives in
   `linalg.ts`.
5. **Densification** (`densify.ts`) — the sparse measured inverse depths
   are spread across the frame by color-edge-aware Jacobi relaxation
   (measurements are hard constraints; depth flows in smooth regions and
   stops at image edges). Output is the same `DepthMap` the viewer already
   consumes.

The "Nerd stats" panel in the UI shows the raw material: track vectors
colored by parallax, the measured depth map, the AI map beside it, and the
numbers (track count, pose inliers, median parallax px, % triangulated).

Moving subjects (people, pets — or a blink mid-clip) violate the
static-scene assumption. The epipolar RANSAC treats them as outliers, so
they get no measured depth and inherit propagated surroundings; the frame
strip lets you pick which instant (eyes open/closed) becomes the moment.
That failure mode is intentionally visible in the playground — it's half
the fun.

## AI fallback pipeline (all client-side)

1. **Capture** — `<input type="file" accept="video/*,image/*">`; on phones
   this offers the camera directly. Stills are accepted too.
2. **Frame picking** (`src/lib/moments/frame-extract.ts`) — sample ~4 fps
   across the clip onto canvases, score each with variance-of-Laplacian,
   auto-pick the sharpest. A thumbnail strip lets the user re-pick (spread
   across time so the choices aren't all from the same instant). Browsers
   apply the MOV's rotation metadata when drawing to canvas, so portrait
   clips come out upright for free.
3. **Depth** (`src/lib/moments/depth.ts`) — Depth Anything V2 (small) via
   `@huggingface/transformers`, WebGPU with WASM fallback. Weights
   (~25–50 MB) come from the Hugging Face CDN on first use, then live in the
   browser cache — no server, no key, offline after first run. To be fully
   network-independent, the model files could be vendored under `public/`
   and pointed at via `env.localModelPath`; not done yet to keep the repo
   light.
4. **Render** (`src/components/moments/MomentViewer.tsx`) — the frame is
   unprojected through a 55° frustum: each grid vertex gets
   `z = 1 / lerp(invFar, invNear, depth)`, so the scene occupies a real
   camera frustum rather than a flat displaced plane. Two modes share the
   geometry: textured mesh ("Photo") and vertex-colored points
   ("Particles", the lo-fi memory look). Triangles spanning big depth jumps
   are dropped rather than letting foreground smear into background.
   Parallax comes from pointer position + device tilt (iOS needs the
   "Enable tilt" button for its permission gesture) plus a slow idle drift.

## Known limits / next steps

- **Occlusion reveals**: peeking behind a foreground object shows the dark
  backdrop through the dropped "tear" triangles. Classic fix is background
  inpainting into a layered depth image (what Facebook 3D photos did) —
  doable client-side with a small inpainting model, or cheaply with a
  blurred-stretch fill.
- **Single-frame only**: the video currently just donates its sharpest
  frame. Multi-frame upgrades, in increasing order of effort: median-stack
  nearby frames for denoising; fuse depth across frames for stability; true
  multi-view (needs the capture UX to demand translation, e.g. "arc around
  your subject", at which point splatting becomes plausible).
- **Depth model download** is the one non-bundled piece (see vendoring note
  above).
- **Metric scale**: relative depth only; the "Depth" slider is taste, not
  measurement.

## What was verified where

- Depth quality + novel-view parallax: offline against the real test clip
  (MiDaS-small stand-in for the same model family).
- Frame extraction, sharpness picking, error paths, and the full viewer
  (both modes, parallax, tear-culling): headless Chromium against the real
  clip (VP9-transcoded — the sandbox Chromium lacks H.264; real browsers
  don't).
- The transformers.js call was checked against the installed package's
  pipeline source, but the sandbox's network policy blocks huggingface.co,
  so the first live end-to-end depth run needs a normal browser: open
  `/moments`, drop in a clip, wait out the one-time model download.
