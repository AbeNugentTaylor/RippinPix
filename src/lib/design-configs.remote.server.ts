// Remote-mode (deployed, GitHub-API-backed) reads of designs.json — the same
// split as card-configs.remote.server.ts and for the same reason: the live
// site keeps reading its build-time snapshot, only the configurator's API
// routes need the staging branch's current state.
import { ensureBranch, getFileMeta, githubEnv, stagingBranch } from "./github-content.server";
import { DESIGNS_REL_PATH } from "./design-configs.server";
import { DESIGNS } from "./designs";
import type { Design } from "./types";

export async function getDesignsRemote(): Promise<Design[]> {
  const { branch: liveBranch } = githubEnv();
  const branch = stagingBranch();
  await ensureBranch(branch, liveBranch);

  const { sha, text } = await getFileMeta(DESIGNS_REL_PATH, branch);
  // Unlike card-configs.json, this file may legitimately be missing on a
  // staging branch cut before designs became editable — fall back to the
  // snapshot bundled into this deploy, which is what that branch was built
  // from anyway. The first design edit will then commit the full file.
  if (sha === null || !text) return DESIGNS;
  try {
    return JSON.parse(text) as Design[];
  } catch (err) {
    throw new Error(`${DESIGNS_REL_PATH} exists but isn't valid JSON: ${(err as Error).message}`);
  }
}
