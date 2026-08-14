// Fetch-based wrapper over GitHub's REST + Git Data API — no SDK dependency,
// since the whole surface area needed here is ~10 endpoints. Backs remote-mode
// card saves: the Contents API alone can only write one file per commit, so
// an atomic "photo + card-configs.json + package.json" save goes through the
// low-level blob -> tree -> commit -> ref-update sequence instead.
//
// Saves land on a staging branch, not the live branch directly — see
// stagingBranch() below and card-config/route.ts's remote handlers. A
// separate "Publish" action (git-push route, remote branch) fast-forwards
// the live branch to staging's tip once the owner is happy with a batch.
const GITHUB_API = "https://api.github.com";

export class GitHubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface GitHubEnv {
  token: string;
  repo: string; // "owner/repo"
  branch: string; // the live/production branch, e.g. "main"
}

export function githubEnv(): GitHubEnv {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    throw new Error("Remote mode requires GITHUB_TOKEN and GITHUB_REPO to be set.");
  }
  return { token, repo, branch: process.env.GITHUB_BRANCH || "main" };
}

// The queue branch every remote save/delete targets. Auto-created from the
// live branch's tip the first time it's needed (see ensureBranch).
export function stagingBranch(): string {
  return process.env.GITHUB_STAGING_BRANCH || "configurator-staging";
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const { token } = githubEnv();
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers as Record<string, string> | undefined),
    },
    // Next's fetch cache would otherwise happily serve a stale
    // card-configs.json from a warm Netlify Function container.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GitHubApiError(res.status, `GitHub API ${init?.method ?? "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function refSha(branch: string): Promise<string | null> {
  const { repo } = githubEnv();
  try {
    const ref = await gh<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    return ref.object.sha;
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) return null;
    throw err;
  }
}

// Idempotent: if `branch` already exists, no-op. Otherwise creates it
// pointing at `fromBranch`'s current tip, so a fresh staging branch always
// starts out identical to live.
export async function ensureBranch(branch: string, fromBranch: string): Promise<void> {
  const { repo } = githubEnv();
  if ((await refSha(branch)) !== null) return;
  const fromSha = await refSha(fromBranch);
  if (!fromSha) throw new Error(`Cannot create "${branch}" — base branch "${fromBranch}" was not found.`);
  await gh(`/repos/${repo}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
  });
}

// Moves `branch`'s ref to `toSha`. force:false means this only succeeds if
// it's a true fast-forward — if branch has moved independently in the
// meantime (e.g. someone pushed to it directly), this throws a
// GitHubApiError(422) rather than silently overwriting that history.
export async function fastForwardBranch(branch: string, toSha: string): Promise<void> {
  const { repo } = githubEnv();
  await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: toSha, force: false }),
  });
}

export interface CompareFile {
  status: string; // short code: "A" | "M" | "D" | "R" | other
  path: string;
}

const COMPARE_STATUS_CODES: Record<string, string> = {
  added: "A",
  modified: "M",
  removed: "D",
  renamed: "R",
  copied: "C",
  changed: "M",
  unchanged: " ",
};

// What's queued on `head` (staging) but not yet on `base` (live) — backs the
// "N cards pending publish" display, reusing GitHub's own diff instead of
// hand-rolling one against two fetched card-configs.json snapshots.
export async function compareBranches(base: string, head: string): Promise<{ aheadBy: number; files: CompareFile[] }> {
  const { repo } = githubEnv();
  const data = await gh<{ ahead_by: number; files?: { filename: string; status: string }[] }>(
    `/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
  );
  return {
    aheadBy: data.ahead_by,
    files: (data.files ?? []).map((f) => ({ status: COMPARE_STATUS_CODES[f.status] ?? "?", path: f.filename })),
  };
}

export interface FileMeta {
  sha: string | null; // null if the file doesn't exist yet
  text: string | null; // decoded utf-8 content, null if not found
}

export async function getFileMeta(path: string, branch?: string): Promise<FileMeta> {
  const { repo, branch: liveBranch } = githubEnv();
  const targetBranch = branch ?? liveBranch;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  try {
    const data = await gh<{ sha: string; content?: string; encoding?: string }>(
      `/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(targetBranch)}`
    );
    const text =
      data.content !== undefined
        ? Buffer.from(data.content, (data.encoding as BufferEncoding) ?? "base64").toString("utf-8")
        : null;
    return { sha: data.sha, text };
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) return { sha: null, text: null };
    throw err;
  }
}

export interface CommitWrite {
  path: string;
  content: string | Buffer; // string -> utf-8 blob, Buffer -> base64 blob
}

export interface CommitPlan {
  message: string;
  branch?: string; // defaults to the live branch (githubEnv().branch)
  writes?: CommitWrite[];
  deletes?: string[]; // paths to remove from the tree
  // Point a path at an existing blob sha without re-uploading bytes — used
  // for the "rename an already-imported photo" case, and sidesteps the
  // Contents API's 1MB inline-content ceiling that phone JPEGs routinely
  // exceed, since we never need to actually read the bytes back out.
  reuseBlob?: { path: string; sha: string }[];
}

type TreeEntry = { path: string; mode: "100644"; type: "blob"; sha: string | null };

// Two saves landing close together on the same branch is a real possibility
// (this is what the staging branch absorbs, but even staging alone can race
// across two tabs/devices), so retry a bounded number of times on the ref
// having moved between our read and our write, re-fetching the base each time.
const MAX_ATTEMPTS = 3;

export async function commitFiles(plan: CommitPlan): Promise<{ commitSha: string }> {
  const { repo, branch: liveBranch } = githubEnv();
  const branch = plan.branch ?? liveBranch;
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const ref = await gh<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
      const baseCommitSha = ref.object.sha;
      const baseCommit = await gh<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${baseCommitSha}`);

      const treeEntries: TreeEntry[] = [
        ...(plan.deletes ?? []).map((path): TreeEntry => ({ path, mode: "100644", type: "blob", sha: null })),
        ...(plan.reuseBlob ?? []).map(
          ({ path, sha }): TreeEntry => ({ path, mode: "100644", type: "blob", sha })
        ),
      ];

      for (const write of plan.writes ?? []) {
        const isBinary = Buffer.isBuffer(write.content);
        const blob = await gh<{ sha: string }>(`/repos/${repo}/git/blobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isBinary
              ? { content: (write.content as Buffer).toString("base64"), encoding: "base64" }
              : { content: write.content as string, encoding: "utf-8" }
          ),
        });
        treeEntries.push({ path: write.path, mode: "100644", type: "blob", sha: blob.sha });
      }

      const tree = await gh<{ sha: string }>(`/repos/${repo}/git/trees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeEntries }),
      });

      const commit = await gh<{ sha: string }>(`/repos/${repo}/git/commits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: plan.message, tree: tree.sha, parents: [baseCommitSha] }),
      });

      await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });

      return { commitSha: commit.sha };
    } catch (err) {
      lastErr = err;
      // Only the ref-moved race (422 on the PATCH, or a stale base by the
      // time we get there) is worth retrying — anything else (bad token,
      // malformed tree) will fail identically on a retry.
      const retryable = err instanceof GitHubApiError && (err.status === 422 || err.status === 409);
      if (!retryable || attempt === MAX_ATTEMPTS - 1) throw err;
    }
  }
  throw lastErr;
}

// Remote-mode sibling of git.server.ts's fs-based bumpPatchVersion — pure
// string transform so the route handler can fold it into a commit alongside
// other file changes instead of a separate write.
export function bumpPackageVersion(packageJsonText: string): { text: string; version: string } {
  const pkg = JSON.parse(packageJsonText);
  const parts = String(pkg.version).split(".").map(Number);
  parts[2] = (parts[2] ?? 0) + 1;
  pkg.version = parts.join(".");
  return { text: JSON.stringify(pkg, null, 2) + "\n", version: pkg.version };
}
