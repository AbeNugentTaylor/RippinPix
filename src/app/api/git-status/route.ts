import { NextResponse } from "next/server";
import { changedFiles, currentBranch } from "@/lib/git.server";

// Local-only: lets the configurator show what's about to be pushed. Never
// available in a deployed build.
export async function GET() {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  return NextResponse.json({ branch: currentBranch(), files: changedFiles() });
}
