"use client";

export interface CompressOptions {
  maxDimension?: number; // longest side, px
  quality?: number; // 0-1, JPEG quality
}

const DEFAULT_MAX_DIMENSION = 2400;
const DEFAULT_QUALITY = 0.85;

// Downscale + re-encode as JPEG before uploading in remote mode. Netlify's
// synchronous Functions cap request bodies well under what an unedited phone
// photo produces (base64-over-Lambda transport puts the practical binary
// ceiling around ~4.5MB, and phone JPEGs routinely run 5-12MB), so this is
// required there, not just an optimization. Local dev writes straight to
// disk and keeps full-resolution originals, so it never calls this.
export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;

  // HEIC/HEIF (and anything else the browser can't decode) fails through to
  // the original file — the server's extension check will reject it with a
  // clear "export as JPEG" message rather than this silently producing a
  // broken image.
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;

    // Didn't actually help (e.g. an already-small PNG) — keep the original
    // rather than trading quality for nothing.
    if (blob.size >= file.size && scale === 1) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
