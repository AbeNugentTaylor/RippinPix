import { NextRequest, NextResponse } from "next/server";
import { getBlob, getFileMeta, stagingBranch } from "@/lib/github-content.server";
import { isRemoteBackend } from "@/lib/remote-mode.server";

// Remote-mode only: streams a photo's bytes straight from the staging
// branch on GitHub. Needed because a queued-but-unpublished card's photo
// only exists there — it isn't in the deployed site's static /photos/
// output, which is baked from the live branch at the last build, so the
// plain static path 404s for anything not yet published. See photo-src.ts.
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(request: NextRequest) {
  if (!isRemoteBackend()) return new NextResponse(null, { status: 404 });

  const designId = request.nextUrl.searchParams.get("designId");
  const fileName = request.nextUrl.searchParams.get("fileName");
  if (
    !designId ||
    !fileName ||
    designId.includes("/") ||
    designId.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("..")
  ) {
    return NextResponse.json({ error: "Invalid designId or fileName" }, { status: 400 });
  }

  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });

  try {
    const meta = await getFileMeta(`public/photos/${designId}/${fileName}`, stagingBranch());
    if (!meta.sha) return NextResponse.json({ error: "Photo not found on the staging branch." }, { status: 404 });
    const bytes = await getBlob(meta.sha);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": mime, "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json({ error: `Could not load photo from GitHub: ${(err as Error).message}` }, { status: 502 });
  }
}
