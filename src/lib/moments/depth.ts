// Client-side monocular depth estimation for 3D Moments.
//
// Runs Depth Anything V2 (small) entirely in the browser via
// @huggingface/transformers — WebGPU where available, WASM otherwise. The
// model weights (~25–50 MB depending on backend) download from the Hugging
// Face CDN on first use and are cached by the browser after that, so the app
// stays self-contained: no server, no API key, works offline once cached.

export interface DepthMap {
  width: number;
  height: number;
  /** Row-major, normalized 0..1. Higher = closer to the camera. */
  data: Float32Array;
}

export type DepthProgress = (message: string, fraction: number | null) => void;

const MODEL_ID = "onnx-community/depth-anything-v2-small";

// The pipeline type is huge and we only touch one call signature; keeping it
// loose avoids importing transformers types into every consumer.
type DepthPipeline = (input: string) => Promise<{
  depth: { width: number; height: number; data: Uint8ClampedArray | Uint8Array };
}>;

let pipelinePromise: Promise<DepthPipeline> | null = null;

async function loadPipeline(onProgress?: DepthProgress): Promise<DepthPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const fileProgress = new Map<string, number>();
      const progress_callback = (p: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (p.status === "progress" && p.file && p.total) {
          fileProgress.set(p.file, (p.loaded ?? 0) / p.total);
          let sum = 0;
          for (const v of fileProgress.values()) sum += v;
          onProgress?.("Downloading depth model", sum / fileProgress.size);
        }
      };
      const useWebGPU =
        typeof navigator !== "undefined" && "gpu" in navigator && !!navigator.gpu;
      try {
        return (await pipeline("depth-estimation", MODEL_ID, {
          device: useWebGPU ? "webgpu" : "wasm",
          dtype: useWebGPU ? "fp16" : "q8",
          progress_callback,
        })) as unknown as DepthPipeline;
      } catch {
        // WebGPU adapters can exist but fail on init (headless, old drivers);
        // WASM q8 is slower but runs everywhere.
        return (await pipeline("depth-estimation", MODEL_ID, {
          device: "wasm",
          dtype: "q8",
          progress_callback,
        })) as unknown as DepthPipeline;
      }
    })();
    // A failed load shouldn't poison every later attempt.
    pipelinePromise.catch(() => {
      pipelinePromise = null;
    });
  }
  return pipelinePromise;
}

export async function estimateDepth(
  frame: HTMLCanvasElement,
  onProgress?: DepthProgress
): Promise<DepthMap> {
  let pipe: DepthPipeline;
  try {
    pipe = await loadPipeline(onProgress);
  } catch (err) {
    // The raw failure is usually an opaque "Failed to fetch" — say what
    // actually needs to happen instead.
    throw new Error(
      "Couldn't download the depth model (first use needs a network connection). " +
        `Check your connection and try again. (${err instanceof Error ? err.message : err})`
    );
  }
  onProgress?.("Estimating depth", null);
  const result = await pipe(frame.toDataURL("image/jpeg", 0.92));
  const { width, height, data } = result.depth;
  const out = new Float32Array(width * height);
  // transformers.js already normalizes the depth image to 0..255 with 255 =
  // nearest; rescale to 0..1 floats for the viewer.
  for (let i = 0; i < out.length; i++) out[i] = data[i] / 255;
  return { width, height, data: out };
}

/** Kick off the model download early (e.g. while frames extract). */
export function preloadDepthModel(onProgress?: DepthProgress): void {
  loadPipeline(onProgress).catch(() => {
    // Surfaced properly when estimateDepth is actually awaited.
  });
}
