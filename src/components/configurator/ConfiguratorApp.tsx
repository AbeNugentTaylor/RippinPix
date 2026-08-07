"use client";

import { useCallback, useEffect, useState } from "react";
import FolderBrowser from "./FolderBrowser";
import CardEditor, { type EditorTarget } from "./CardEditor";
import ImportedList from "./ImportedList";
import type { CardConfig } from "@/lib/types";

export default function ConfiguratorApp() {
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [configs, setConfigs] = useState<Record<string, CardConfig>>({});

  const refresh = useCallback(() => {
    fetch("/api/card-config")
      .then((res) => res.json())
      .then(setConfigs)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const editorKey = target ? (target.kind === "new" ? `new:${target.image.path}` : `edit:${target.key}`) : null;

  return (
    <div className="cfg-shell">
      <header className="cfg-header">
        <h1>RippinPix card configurator</h1>
        <p>
          Local-only tool — pick a photo, crop it into the card frame, tag rarity and attributes,
          save. Saving copies the photo into <code>public/photos/</code> and writes{" "}
          <code>src/data/card-configs.json</code>; commit both to hand the card off to the site.
          Click a saved card below to edit it.
        </p>
      </header>
      <div className="cfg-layout">
        <FolderBrowser
          onSelectImage={(image) => setTarget({ kind: "new", image })}
          selectedPath={target?.kind === "new" ? target.image.path : null}
        />
        {target ? (
          <CardEditor key={editorKey} target={target} configs={configs} onSaved={refresh} onClose={() => setTarget(null)} />
        ) : (
          <div className="cfg-panel cfg-panel--placeholder">
            Select a photo from the folder browser, or a saved card, to start.
          </div>
        )}
        <ImportedList
          configs={configs}
          editingKey={target?.kind === "edit" ? target.key : null}
          onEdit={(key) => setTarget({ kind: "edit", key })}
          onDeleted={refresh}
        />
      </div>
    </div>
  );
}
