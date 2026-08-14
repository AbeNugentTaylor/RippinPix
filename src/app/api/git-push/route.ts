import { NextResponse } from "next/server";
import { addTrackedPaths, bumpPatchVersion, changedFiles, commit, currentBranch, push } from "@/lib/git.server";

// Local-only: commits and pushes the configurator's own writes
// (public/photos + card-configs.json) straight from the browser. Never
// available in a deployed build.
export async function POST() {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });

  const files = changedFiles();
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Nothing to push — no changes under public/photos or card-configs.json." },
      { status: 400 }
    );
  }

  const branch = currentBranch();
  if (!branch) {
    return NextResponse.json({ error: "Could not determine the current git branch." }, { status: 500 });
  }

  const version = bumpPatchVersion();

  const add = addTrackedPaths();
  if (!add.ok) {
    return NextResponse.json({ error: `git add failed: ${add.stderr || add.stdout}` }, { status: 500 });
  }

  const count = files.length;
  const message = `Add ${count} card${count === 1 ? "" : "s"} via configurator\n\nv${version}`;
  const committed = commit(message);
  if (!committed.ok) {
    return NextResponse.json({ error: `git commit failed: ${committed.stderr || committed.stdout}` }, { status: 500 });
  }

  const pushed = push(branch);
  if (!pushed.ok) {
    return NextResponse.json(
      {
        error: `Committed locally as v${version} but the push failed: ${pushed.stderr || pushed.stdout}`,
        committed: true,
        version,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    branch,
    version,
    files: files.map((f) => f.path),
    output: pushed.stdout || pushed.stderr,
  });
}
