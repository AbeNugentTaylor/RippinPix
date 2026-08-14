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
}

// Ships the configurator's writes (public/photos + card-configs.json)
// straight to GitHub: bump version, commit, push — with a confirm step
// since a push is a shared, hard-to-reverse action even from a phone.
export default function GitPushPanel({ refreshSignal }: GitPushPanelProps) {
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
      <h2 className="cfg-panel-title">Push to GitHub</h2>
      {status?.branch && (
        <p className="cfg-git-branch">
          Branch <code>{status.branch}</code>
          {" · "}
          {count === 0 ? "up to date" : `${count} changed file${count === 1 ? "" : "s"} pending`}
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
          Push to GitHub
        </button>
      ) : (
        <div className="cfg-git-confirm">
          <p>
            Bump the version, commit {count} file{count === 1 ? "" : "s"}, and push{" "}
            <code>{status?.branch}</code> to <code>origin</code>?
          </p>
          <div className="cfg-git-confirm-actions">
            <button type="button" className="cfg-save-btn" disabled={pushing} onClick={handlePush}>
              {pushing ? "Pushing…" : "Confirm push"}
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
            : `Pushed v${result.version} to ${result.branch} (${result.files?.length ?? 0} file${
                result.files?.length === 1 ? "" : "s"
              }).`}
        </p>
      )}
    </div>
  );
}
