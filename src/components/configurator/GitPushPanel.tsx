"use client";

import { useCallback, useEffect, useState } from "react";

interface ChangedFile {
  status: string;
  path: string;
}

interface StatusResponse {
  branch: string | null;
  files: ChangedFile[];
}

interface PushResult {
  ok?: boolean;
  branch?: string;
  version?: string;
  files?: string[];
  error?: string;
}

interface GitPushPanelProps {
  // Bump this (e.g. after every card save/delete) to re-check git status —
  // the panel otherwise only knows what was pending when it first mounted.
  refreshSignal?: number;
  // Remote mode: this button publishes the staging branch (where every save
  // already landed) to the live branch, rather than committing+pushing a
  // local working tree — same shape, different copy.
  remote?: boolean;
}

// Ships the configurator's queued writes to the live site: bump version,
// commit, push/publish — with a confirm step since this is a shared,
// hard-to-reverse action even from a phone.
export default function GitPushPanel({ refreshSignal, remote = false }: GitPushPanelProps) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/git-status")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshSignal]);

  const handlePush = async () => {
    setPushing(true);
    setResult(null);
    try {
      const res = await fetch("/api/git-push", { method: "POST" });
      const data = (await res.json()) as PushResult;
      setResult(data);
      refresh();
    } catch {
      setResult({ error: "Push failed — could not reach the configurator server." });
    } finally {
      setPushing(false);
      setConfirming(false);
    }
  };

  const files = status?.files ?? [];
  const count = files.length;

  return (
    <div className="cfg-panel cfg-git-panel">
      <h2 className="cfg-panel-title">{remote ? "Publish" : "Push to GitHub"}</h2>
      {status?.branch && (
        <p className="cfg-git-branch">
          {remote ? "Queued on " : "Branch "}
          <code>{status.branch}</code>
          {" · "}
          {count === 0
            ? remote
              ? "nothing queued"
              : "up to date"
            : `${count} changed file${count === 1 ? "" : "s"} pending`}
        </p>
      )}
      {count > 0 && (
        <ul className="cfg-git-files">
          {files.slice(0, 8).map((f) => (
            <li key={f.path}>
              <span className="cfg-git-file-status">{f.status}</span> {f.path}
            </li>
          ))}
          {files.length > 8 && <li>…and {files.length - 8} more</li>}
        </ul>
      )}

      {!confirming ? (
        <button
          type="button"
          className="cfg-save-btn"
          disabled={count === 0 || pushing}
          onClick={() => setConfirming(true)}
        >
          {remote ? "Publish to site" : "Push to GitHub"}
        </button>
      ) : (
        <div className="cfg-git-confirm">
          <p>
            {remote ? (
              <>
                Bump the version and publish {count} queued change{count === 1 ? "" : "s"} to the live site?
                It goes live after Netlify&rsquo;s next rebuild.
              </>
            ) : (
              <>
                Bump the version, commit {count} file{count === 1 ? "" : "s"}, and push{" "}
                <code>{status?.branch}</code> to <code>origin</code>?
              </>
            )}
          </p>
          <div className="cfg-git-confirm-actions">
            <button type="button" className="cfg-save-btn" disabled={pushing} onClick={handlePush}>
              {pushing ? (remote ? "Publishing…" : "Pushing…") : remote ? "Confirm publish" : "Confirm push"}
            </button>
            <button type="button" disabled={pushing} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className={`cfg-message${result.error ? " cfg-git-error" : ""}`}>
          {result.error
            ? result.error
            : remote
              ? `Published v${result.version} (${result.files?.length ?? 0} file${
                  result.files?.length === 1 ? "" : "s"
                }) — live after Netlify's next rebuild.`
              : `Pushed v${result.version} to ${result.branch} (${result.files?.length ?? 0} file${
                  result.files?.length === 1 ? "" : "s"
                }).`}
        </p>
      )}
    </div>
  );
}
