// Client-side frame extraction for the 3D Moments capture flow.
//
// Given a short video file, samples frames onto canvases and scores each for
// sharpness so the flow can auto-pick the least motion-blurred frame — casual
// handheld clips (the whole point of "quick capture") are mostly blur, and
// depth estimation on a blurry frame produces mush. Browsers honor the
// video's rotation metadata when drawing to canvas, so portrait iPhone clips
// come out upright without any handling here.

export interface FrameCandidate {
  canvas: HTMLCanvasElement;
  /** Seconds into the video this frame was sampled from. */
  time: number;
  /** Variance-of-Laplacian sharpness score; higher = sharper. */
  sharpness: number;
}

// Cap the stored frame size — depth models downscale to ~518px anyway, and
// keeping full 4K frames around just burns memory on phones.
const MAX_FRAME_DIM = 1024;
// Sharpness is scored on a small grayscale copy; blur is a low-frequency
// property so this loses nothing and keeps scoring cheap.
const SCORE_WIDTH = 128;
// Dense enough that neighboring samples are ~0.12s apart: the measured-depth
// tracker needs a partner frame close to the reference when the clip is
// blurry, and handheld blur comes and goes on that timescale.
const SAMPLES_PER_SECOND = 8;
const MAX_SAMPLES = 40;

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mov|mp4|webm|m4v)$/i.test(file.name);
}

/** Variance of a 3x3 Laplacian over a downscaled grayscale copy. */
export function scoreSharpness(source: HTMLCanvasElement): number {
  const w = SCORE_WIDTH;
  const h = Math.max(2, Math.round((source.height / source.width) * w));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

  let sum = 0;
  let sumSq = 0;
  const n = (w - 2) * (h - 2);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
      sum += lap;
      sumSq += lap * lap;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function drawScaled(source: CanvasImageSource, sw: number, sh: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_FRAME_DIM / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Load a still image file as a single already-"sharpest" candidate. */
export async function frameFromImage(file: File): Promise<FrameCandidate> {
  const bitmap = await createImageBitmap(file);
  const canvas = drawScaled(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return { canvas, time: 0, sharpness: scoreSharpness(canvas) };
}

/**
 * Sample frames across the whole clip and return them sorted by time.
 * Rejects with a readable error if the browser can't decode the file.
 */
export function extractFrames(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<FrameCandidate[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Couldn't decode this video in the browser. Try a different clip."));
    };

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      if (!isFinite(duration) || duration <= 0 || !video.videoWidth) {
        cleanup();
        reject(new Error("This video has no readable frames."));
        return;
      }
      const count = Math.min(MAX_SAMPLES, Math.max(3, Math.ceil(duration * SAMPLES_PER_SECOND)));
      const frames: FrameCandidate[] = [];
      try {
        for (let i = 0; i < count; i++) {
          // Skip the first/last instants — they're where shaky starts and
          // pocket-bound endings live.
          const t = duration * ((i + 0.5) / count);
          await seekTo(video, t);
          const canvas = drawScaled(video, video.videoWidth, video.videoHeight);
          frames.push({ canvas, time: t, sharpness: scoreSharpness(canvas) });
          onProgress?.(i + 1, count);
        }
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("Frame extraction failed."));
        return;
      }
      cleanup();
      resolve(frames);
    };
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out reading video frames.")), 8000);
    video.onseeked = () => {
      clearTimeout(timeout);
      resolve();
    };
    video.currentTime = time;
  });
}
