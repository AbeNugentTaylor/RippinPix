import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { describeReadError } from "@/lib/cloud-file.server";

// Local-only: streams an arbitrary local photo back so /configurator can
// preview it before it's copied into public/photos/. Never available in a
// deployed build.
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });

  const requested = request.nextUrl.searchParams.get("path");
  if (!requested) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const filePath = path.resolve(requested);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });

  let data: Buffer;
  try {
    data = fs.readFileSync(filePath);
  } catch (err) {
    return NextResponse.json({ error: describeReadError(err, filePath) }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": mime, "Cache-Control": "no-store" },
  });
}
