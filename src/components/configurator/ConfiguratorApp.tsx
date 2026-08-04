"use client";

import { useCallback, useEffect, useState } from "react";
import FolderBrowser, { type Entry } from "./FolderBrowser";
import CardEditor from "./CardEditor";
import ImportedList from "./ImportedList";
import type { CardConfig } from "@/lib/types";

export default function ConfiguratorApp() {
  const [selected, setSelected] = useState<Entry | null>(null);
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

  return (
    <div className="cfg-shell">
      <header className="cfg-header">
        <h1>RippinPix card configurator</h1>
        <p>
          Local-only tool — pick a photo, crop it into the card frame, tag rarity and attributes,
          save. Saving copies the photo into <code>public/photos/</code> and writes{" "}
          <code>src/data/card-configs.json</code>; commit both to hand the card off to the site.
        </p>
      </header>
      <div className="cfg-layout">
        <FolderBrowser onSelectImage={setSelected} />
        {selected ? (
          <CardEditor key={selected.path} image={selected} configs={configs} onSaved={refresh} />
        ) : (
          <div className="cfg-panel cfg-panel--placeholder">Select a photo from the folder browser to start.</div>
        )}
        <ImportedList configs={configs} onDeleted={refresh} />
      </div>
    </div>
  );
}
