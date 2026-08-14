import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Backs the configurator's "push to GitHub" button. Local-only, like the rest
// of src/app/api/*.ts here — the routes that call this 404 in production.
const REPO_ROOT = process.cwd();
const TRACKED_PATHS = ["public/photos", "src/data/card-configs.json"];

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

// Args passed as an array (no shell) so nothing here is exposed to injection.
// Only trailing whitespace is stripped — `git status --porcelain`'s first
// column is a meaningful leading space (unstaged-modify), and a plain
// .trim() would eat it and misalign every fixed-offset slice downstream.
export function git(args: string[]): GitResult {
  const res = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf-8" });
  return {
    ok: res.status === 0,
    stdout: (res.stdout ?? "").replace(/\s+$/, ""),
    stderr: (res.stderr ?? "").trim(),
  };
}

export function currentBranch(): string | null {
  const res = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  return res.ok && res.stdout ? res.stdout : null;
}

export interface ChangedFile {
  status: string; // porcelain status code, e.g. "??", "M", "A"
  path: string;
}

// Scoped to what the configurator actually writes, so unrelated local changes
// elsewhere in the working tree never get swept into a push from this button.
export function changedFiles(): ChangedFile[] {
  const res = git(["status", "--porcelain", "--", ...TRACKED_PATHS]);
  if (!res.ok || !res.stdout) return [];
  return res.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2).trim(), path: line.slice(3) }));
}

export function hasUpstream(): boolean {
  return git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).ok;
}

// Mirrors AGENTS.md's versioning rule (bump the patch number on every commit
// that goes out) so the site footer's live version always moves when cards do.
export function bumpPatchVersion(): string {
  const pkgPath = path.join(REPO_ROOT, "package.json");
  const raw = fs.readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(raw);
  const parts = String(pkg.version).split(".").map(Number);
  parts[2] = (parts[2] ?? 0) + 1;
  pkg.version = parts.join(".");
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  return pkg.version;
}

export function addTrackedPaths(): GitResult {
  return git(["add", "--", ...TRACKED_PATHS, "package.json"]);
}

export function commit(message: string): GitResult {
  return git(["commit", "-m", message]);
}

export function push(branch: string): GitResult {
  return hasUpstream() ? git(["push"]) : git(["push", "-u", "origin", branch]);
}
