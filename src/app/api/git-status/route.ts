import { NextResponse } from "next/server";
import { changedFiles, currentBranch } from "@/lib/git.server";
import { compareBranches, ensureBranch, githubEnv, stagingBranch } from "@/lib/github-content.server";
import { isRemoteBackend, isRemoteModeEnabled } from "@/lib/remote-mode.server";

// Local dev: shows what's staged-but-unpushed in the local git working tree.
// Deployed remote mode: shows what's queued on the staging branch but not
// yet published to the live branch. Either way, backs the configurator's
// "N changes pending" display. Blocked entirely unless the configurator is
// enabled at all (see isRemoteModeEnabled).
export async function GET() {
  if (!isRemoteModeEnabled()) return new NextResponse(null, { status: 404 });

  if (isRemoteBackend()) {
    const { branch: liveBranch } = githubEnv();
    const branch = stagingBranch();
    try {
      await ensureBranch(branch, liveBranch);
      const { files } = await compareBranches(liveBranch, branch);
      return NextResponse.json({ branch, files });
    } catch (err) {
      return NextResponse.json({ error: `Could not check GitHub: ${(err as Error).message}` }, { status: 502 });
    }
  }

  return NextResponse.json({ branch: currentBranch(), files: changedFiles() });
}
