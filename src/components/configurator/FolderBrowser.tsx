"use client";

import { useEffect, useState } from "react";

export interface Entry {
  name: string;
  path: string;
  type: "dir" | "image";
}

interface BrowseResponse {
  dir: string;
  parent: string | null;
  entries: Entry[];
}

interface FolderBrowserProps {
  onSelectImage: (entry: Entry) => void;
}

export default function FolderBrowser({ onSelectImage }: FolderBrowserProps) {
  const [dir, setDir] = useState<string | null>(null); // null = default (Desktop)
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    const url = dir ? `/api/browse?dir=${encodeURIComponent(dir)}` : "/api/browse";
    fetch(url)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Failed to load folder");
          return;
        }
        setError(null);
        setData(body);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load folder");
      });
    return () => {
      cancelled = true;
    };
  }, [dir]);

  return (
    <div className="cfg-panel cfg-browser">
      <h2 className="cfg-panel-title">Folder</h2>
      <form
        className="cfg-path-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (pathInput.trim()) setDir(pathInput.trim());
        }}
      >
        <input
          type="text"
          className="cfg-path-input"
          placeholder="Paste a folder path…"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
        />
        <button type="submit">Go</button>
      </form>
      {data && (
        <button className="cfg-breadcrumb" title={data.dir} onClick={() => setDir(data.dir)}>
          {data.dir}
        </button>
      )}
      {error && <p className="cfg-error">{error}</p>}
      <div className="cfg-file-list">
        {data?.parent && (
          <button className="cfg-file-row cfg-file-row--dir" onClick={() => setDir(data.parent)}>
            .. up
          </button>
        )}
        {data?.entries.map((entry) => (
          <button
            key={entry.path}
            className={`cfg-file-row cfg-file-row--${entry.type}`}
            onClick={() => (entry.type === "dir" ? setDir(entry.path) : onSelectImage(entry))}
          >
            {entry.name}
          </button>
        ))}
        {data && data.entries.length === 0 && <p className="cfg-empty">Empty folder.</p>}
      </div>
    </div>
  );
}
