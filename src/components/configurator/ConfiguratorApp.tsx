"use client";

import { useCallback, useEffect, useState } from "react";
import FolderBrowser from "./FolderBrowser";
import PhotoPicker, { type UploadImage } from "./PhotoPicker";
import CardEditor, { type EditorTarget } from "./CardEditor";
import ImportedList from "./ImportedList";
import GitPushPanel from "./GitPushPanel";
import { compressImage } from "@/lib/image-compress";
import type { CardConfig } from "@/lib/types";

let uploadIdSeq = 0;

interface ConfiguratorAppProps {
  // True only on the deployed, password-gated instance (see
  // remote-mode.server.ts's isRemoteBackend). Local dev is always false —
  // it keeps the original filesystem-browsing + local-git flow untouched.
  remote?: boolean;
}

export default function ConfiguratorApp({ remote = false }: ConfiguratorAppProps) {
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [configs, setConfigs] = useState<Record<string, CardConfig>>({});
  const [uploads, setUploads] = useState<UploadImage[]>([]);
  const [compressing, setCompressing] = useState(false);
  // Bumped on every config refresh so GitPushPanel knows to re-check git
  // status — otherwise a save/delete never re-fetches its "pending" count.
  const [changeTick, setChangeTick] = useState(0);

  const refresh = useCallback(() => {
    fetch("/api/card-config")
      .then((res) => res.json())
      .then(setConfigs)
      .catch(() => {})
      .finally(() => setChangeTick((t) => t + 1));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Revoke every still-outstanding blob: preview URL when the whole app
  // unmounts, since nothing else owns their lifetime.
  useEffect(() => {
    return () => {
      uploads.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appendUploads = (files: File[]) => {
    const added = files.map((file) => ({
      id: `u${++uploadIdSeq}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setUploads((u) => [...u, ...added]);
    if (added.length) setTarget({ kind: "upload", image: added[0] });
  };

  const addUploads = async (files: File[]) => {
    if (!remote) {
      appendUploads(files);
      return;
    }
    // Remote saves go over the network to a Netlify Function with a body-size
    // ceiling well under an unedited phone photo — shrink client-side first.
    setCompressing(true);
    try {
      appendUploads(await Promise.all(files.map((f) => compressImage(f))));
    } finally {
      setCompressing(false);
    }
  };

  const removeUpload = (id: string) => {
    setUploads((u) => {
      const match = u.find((img) => img.id === id);
      if (match) URL.revokeObjectURL(match.previewUrl);
      return u.filter((img) => img.id !== id);
    });
    setTarget((t) => (t?.kind === "upload" && t.image.id === id ? null : t));
  };

  // Saving an upload consumes it: it's now a normal saved card, and the blob:
  // preview URL is only good for the current tab's lifetime anyway.
  const handleUploadSaved = (id: string) => {
    removeUpload(id);
    refresh();
  };

  const editorKey = target
    ? target.kind === "new"
      ? `new:${target.image.path}`
      : target.kind === "upload"
        ? `upload:${target.image.id}`
        : `edit:${target.key}`
    : null;

  return (
    <div className="cfg-shell">
      <header className="cfg-header">
        <h1>RippinPix card configurator</h1>
        <p>
          {remote ? (
            <>
              Pick a photo, crop it into the card frame, tag rarity and attributes, save — each
              save commits and pushes straight to GitHub, no separate step. The live site picks it
              up after Netlify&rsquo;s next automatic rebuild. Click a saved card below to edit it.
            </>
          ) : (
            <>
              Local-only tool — pick a photo, crop it into the card frame, tag rarity and
              attributes, save. Saving copies the photo into <code>public/photos/</code> and
              writes <code>src/data/card-configs.json</code>; push to hand the cards off to the
              site. Click a saved card below to edit it.
            </>
          )}
        </p>
      </header>
      <div className="cfg-layout">
        <div className="cfg-left-col">
          <PhotoPicker
            images={uploads}
            onAdd={addUploads}
            onSelect={(image) => setTarget({ kind: "upload", image })}
            onRemove={removeUpload}
            selectedId={target?.kind === "upload" ? target.image.id : null}
            busy={compressing}
          />
          {!remote && (
            <FolderBrowser
              onSelectImage={(image) => setTarget({ kind: "new", image })}
              selectedPath={target?.kind === "new" ? target.image.path : null}
            />
          )}
        </div>
        {target ? (
          <CardEditor
            key={editorKey}
            target={target}
            configs={configs}
            onSaved={target.kind === "upload" ? () => handleUploadSaved(target.image.id) : refresh}
            onClose={() => setTarget(null)}
          />
        ) : (
          <div className="cfg-panel cfg-panel--placeholder">
            {remote
              ? "Choose a photo from this device, or a saved card, to start."
              : "Choose a photo (from this device, or the folder browser), or a saved card, to start."}
          </div>
        )}
        <ImportedList
          configs={configs}
          editingKey={target?.kind === "edit" ? target.key : null}
          onEdit={(key) => setTarget({ kind: "edit", key })}
          onDeleted={refresh}
        />
      </div>
      {!remote && <GitPushPanel refreshSignal={changeTick} />}
    </div>
  );
}
