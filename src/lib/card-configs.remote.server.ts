// Remote-mode (deployed, GitHub-API-backed) reads of card-configs.json.
//
// Deliberately separate from card-configs.server.ts rather than branching
// inside it: that file's getCardConfigs() is also what src/app/page.tsx
// calls at *build* time to prerender the site, and a Netlify build already
// has the real repo checked out on local disk — redirecting that build-time
// read through the GitHub API would be pointless and would risk drift
// between "what the build embedded" and "what got fetched". Only the
// configurator's own API route (a request-time Netlify Function, which has
// no persistent filesystem) needs this GitHub-backed path.
//
// Reads come from the staging branch, not the live branch — that's the
// "what am I currently building toward publishing" view, which starts out
// identical to live and only diverges once a card gets queued.
import { ensureBranch, getFileMeta, githubEnv, stagingBranch } from "./github-content.server";
import { CARD_CONFIGS_REL_PATH } from "./card-configs.server";
import type { CardConfig } from "./types";

export async function getCardConfigsRemote(): Promise<Record<string, CardConfig>> {
  const { branch: liveBranch } = githubEnv();
  const branch = stagingBranch();
  await ensureBranch(branch, liveBranch);

  const { sha, text } = await getFileMeta(CARD_CONFIGS_REL_PATH, branch);
  // card-configs.json always exists in this repo — a missing sha here means
  // GITHUB_REPO points somewhere that doesn't have it (wrong repo, typo),
  // not a legitimately-empty project. Throw instead of silently returning
  // {}, so that ends up as a visible error instead of a confusing "no saved
  // cards".
  if (sha === null) {
    const repo = process.env.GITHUB_REPO ?? "(unset)";
    throw new Error(`${CARD_CONFIGS_REL_PATH} not found in ${repo}@${branch} — check GITHUB_REPO.`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, CardConfig>;
  } catch (err) {
    throw new Error(`${CARD_CONFIGS_REL_PATH} exists but isn't valid JSON: ${(err as Error).message}`);
  }
}
