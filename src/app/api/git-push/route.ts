import { NextResponse } from "next/server";
import { addTrackedPaths, bumpPatchVersion, changedFiles, commit, currentBranch, push } from "@/lib/git.server";
import {
  bumpPackageVersion,
  commitFiles,
  compareBranches,
  ensureBranch,
  fastForwardBranch,
  getFileMeta,
  githubEnv,
  stagingBranch,
} from "@/lib/github-content.server";
import { isRemoteBackend, isRemoteModeEnabled } from "@/lib/remote-mode.server";

// Local dev: commits and pushes the configurator's own writes straight from
// the local git working tree. Deployed remote mode: "Publish" — bumps the
// version once for the whole queued batch, then fast-forwards the live
// branch to the staging branch's tip (see card-config/route.ts, which is
// what queues cards onto staging in the first place). Blocked entirely
// unless the configurator is enabled at all (see isRemoteModeEnabled).
export async function POST() {
  if (!isRemoteModeEnabled()) return new NextResponse(null, { status: 404 });
  if (isRemoteBackend()) return publishRemote();
  return pushLocal();
}

async function pushLocal() {
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

async function publishRemote() {
  const { branch: liveBranch } = githubEnv();
  const branch = stagingBranch();

  try {
    await ensureBranch(branch, liveBranch);
  } catch (err) {
    return NextResponse.json({ error: `Could not prepare the staging branch: ${(err as Error).message}` }, { status: 502 });
  }

  let compared: Awaited<ReturnType<typeof compareBranches>>;
  try {
    compared = await compareBranches(liveBranch, branch);
  } catch (err) {
    return NextResponse.json({ error: `Could not check GitHub: ${(err as Error).message}` }, { status: 502 });
  }

  if (compared.aheadBy === 0) {
    return NextResponse.json({ error: "Nothing to publish — no cards queued." }, { status: 400 });
  }

  // Bump the version once for the whole batch, as one final commit on
  // staging, then fast-forward the live branch to that new tip.
  let version: string;
  let publishSha: string;
  try {
    const pkgMeta = await getFileMeta("package.json", branch);
    if (!pkgMeta.text) throw new Error("package.json not found on the staging branch");
    const bumped = bumpPackageVersion(pkgMeta.text);
    version = bumped.version;
    const result = await commitFiles({
      branch,
      message: `Bump version to v${bumped.version}`,
      writes: [{ path: "package.json", content: bumped.text }],
    });
    publishSha = result.commitSha;
  } catch (err) {
    return NextResponse.json({ error: `Could not finalize the version bump: ${(err as Error).message}` }, { status: 502 });
  }

  try {
    await fastForwardBranch(liveBranch, publishSha);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Queued changes are safe on "${branch}", but publishing to "${liveBranch}" failed: ${(err as Error).message}`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    branch: liveBranch,
    version,
    files: compared.files.map((f) => f.path),
  });
}
