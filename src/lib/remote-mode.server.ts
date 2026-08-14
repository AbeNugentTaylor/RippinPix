// Single source of truth for whether the configurator is reachable at all —
// shared by proxy.ts, the configurator page, and every configurator API
// route, so the gates can't drift out of sync with each other.
//
// Local dev (`npm run dev`, NODE_ENV !== "production"): always enabled, same
// as before this feature existed.
// Deployed (NODE_ENV === "production"): disabled unless CONFIGURATOR_REMOTE
// is explicitly opted in via a Netlify env var. Default stays hard-off.
export function isRemoteModeEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CONFIGURATOR_REMOTE === "1";
}

// True only for the actually-deployed, opted-in case — used wherever code
// needs to pick the GitHub-API-backed path over the local-filesystem path
// (local dev should keep using fs/git even if CONFIGURATOR_REMOTE happens to
// be set in a local .env for testing).
export function isRemoteBackend(): boolean {
  return process.env.NODE_ENV === "production" && process.env.CONFIGURATOR_REMOTE === "1";
}
