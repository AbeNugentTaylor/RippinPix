import path from "node:path";

// node:fs can't read a OneDrive "Files On-Demand" placeholder that hasn't
// been downloaded locally yet — it fails with this exact signature instead
// of a normal ENOENT, even though fs.existsSync/statSync succeed on it.
function isCloudPlaceholderError(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  return e?.code === "UNKNOWN" && e?.syscall === "read";
}

export function describeReadError(err: unknown, filePath: string): string {
  if (isCloudPlaceholderError(err)) {
    return `"${path.basename(
      filePath
    )}" hasn't downloaded from OneDrive yet (it's a cloud-only file). Open it once in File Explorer, or right-click its folder and choose "Always keep on this device", then try again.`;
  }
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return "File not found.";
  return "Could not read this file.";
}
