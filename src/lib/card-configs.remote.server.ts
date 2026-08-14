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
import { getFileMeta } from "./github-content.server";
import { CARD_CONFIGS_REL_PATH } from "./card-configs.server";
import type { CardConfig } from "./types";

export async function getCardConfigsRemote(): Promise<Record<string, CardConfig>> {
  const { text } = await getFileMeta(CARD_CONFIGS_REL_PATH);
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, CardConfig>;
  } catch {
    return {};
  }
}
