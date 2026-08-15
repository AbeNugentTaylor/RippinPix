# 3D Moments — how we turn a casual video into a 3D image

Notes from the investigation behind `/moments` (capture a quick clip → lo-fi
3D memory), including why this approach was chosen and where it can go next.

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
| Stereo from video parallax | ❌ Only works when the clip happens to translate; a pan (like the test clip) produces nothing. |
| **Monocular depth → displaced surface ("3D photo")** | ✅ Works from a *single frame*, so any clip or even a still qualifies. Runs in-browser in ~1s. Lo-fi by nature but very recognizable — the iOS "spatial photo" / old Facebook 3D-photo trick. |

Validation: MiDaS-small (ONNX) on the sharpest frame of the test clip produced
a clean relief (floor near, wall far, rocking chair popping out), and
re-projected novel views showed convincing parallax despite the blur and low
resolution. This is the approach `/moments` ships.

## Pipeline (all client-side)

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
