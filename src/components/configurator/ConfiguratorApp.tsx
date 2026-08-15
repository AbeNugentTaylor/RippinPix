"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FolderBrowser from "./FolderBrowser";
import PhotoPicker, { type UploadImage } from "./PhotoPicker";
import CardEditor, { type EditorTarget } from "./CardEditor";
import CategoryBoard from "./CategoryBoard";
import PackEditor from "./PackEditor";
import GitPushPanel from "./GitPushPanel";
import { compressImage } from "@/lib/image-compress";
import type { CardConfig, Design } from "@/lib/types";

let uploadIdSeq = 0;

interface ConfiguratorAppProps {
  // True only on the deployed, password-gated instance (see
  // remote-mode.server.ts's isRemoteBackend). Local dev is always false —
  // it keeps the original filesystem-browsing + local-git flow untouched.
  remote?: boolean;
}

type SlotIntent = { designId: string; local: number };
type PackEdit = { mode: "edit"; id: string } | { mode: "new" };

export default function ConfiguratorApp({ remote = false }: ConfiguratorAppProps) {
  const [target, setTarget] = useState<EditorTarget | null>(null);
  // Slot the next upload is aimed at, set by tapping an empty slot on the
  // category board — consumed by CardEditor as its initial design/slot.
  const [slotIntent, setSlotIntent] = useState<SlotIntent | null>(null);
  const [packEdit, setPackEdit] = useState<PackEdit | null>(null);
  const [configs, setConfigs] = useState<Record<string, CardConfig>>({});
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadImage[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [designsError, setDesignsError] = useState<string | null>(null);
  // Bumped on every config refresh so GitPushPanel knows to re-check git
  // status — otherwise a save/delete never re-fetches its "pending" count.
  const [changeTick, setChangeTick] = useState(0);

  const pendingSlotRef = useRef<SlotIntent | null>(null);
  const slotInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/card-config")
      .then(async (res) => {
        const body = await res.json();
        // A failed remote-mode read used to silently render as "no saved
        // cards" — surface the real error instead of swallowing it, since
        // that's exactly the kind of thing a misconfigured GITHUB_REPO/
        // GITHUB_BRANCH produces.
        if (!res.ok) {
          setLoadError(body?.error ?? "Could not load saved cards.");
          return;
        }
        setLoadError(null);
        setConfigs(body);
      })
      .catch(() => setLoadError("Could not reach the configurator server."))
      .finally(() => setChangeTick((t) => t + 1));
  }, []);

  const refreshDesigns = useCallback(() => {
    fetch("/api/designs")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setDesignsError(body?.error ?? "Could not load categories.");
          return;
        }
        setDesignsError(null);
        setDesigns(body);
      })
      .catch(() => setDesignsError("Could not reach the configurator server."))
      .finally(() => setChangeTick((t) => t + 1));
  }, []);

  useEffect(() => {
    refresh();
    refreshDesigns();
  }, [refresh, refreshDesigns]);

  // Revoke every still-outstanding blob: preview URL when the whole app
  // unmounts, since nothing else owns their lifetime.
  useEffect(() => {
    return () => {
      uploads.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appendUploads = (files: File[], slot: SlotIntent | null) => {
    const added = files.map((file) => ({
      id: `u${++uploadIdSeq}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setUploads((u) => [...u, ...added]);
    if (added.length) {
      setSlotIntent(slot);
      setPackEdit(null);
      setTarget({ kind: "upload", image: added[0] });
    }
  };

  const addUploads = async (files: File[], slot: SlotIntent | null = null) => {
    if (!remote) {
      appendUploads(files, slot);
      return;
    }
    // Remote saves go over the network to a Netlify Function with a body-size
    // ceiling well under an unedited phone photo — shrink client-side first.
    setCompressing(true);
    try {
      appendUploads(await Promise.all(files.map((f) => compressImage(f))), slot);
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

  // Empty slot tapped on the board: remember which slot, then hand off to
  // the device's photo picker — the chosen photo opens the card editor
  // pre-aimed at that slot.
  const fillSlot = (designId: string, local: number) => {
    pendingSlotRef.current = { designId, local };
    slotInputRef.current?.click();
  };

  const openEditor = (nextTarget: EditorTarget) => {
    setSlotIntent(null);
    setPackEdit(null);
    setTarget(nextTarget);
  };

  const closeEditor = () => {
    setTarget(null);
    setSlotIntent(null);
  };

  const activeDesign =
    designs && designs.length
      ? (designs.find((d) => d.id === activeDesignId) ?? designs[0])
      : null;
  const packEditDesign =
    packEdit?.mode === "edit" ? ((designs ?? []).find((d) => d.id === packEdit.id) ?? null) : null;

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
              Each tab is a pack category — filled slots show the saved card, empty ones show the
              placeholder that would appear on the live site. Tap an empty slot to drop a photo
              straight into it, tap a card to edit it, or hit <strong>Edit pack</strong> to rename a
              pack, recolor it, change how many packs it runs to, or remove it. Saves queue onto a
              staging branch; nothing goes live until you hit <strong>Publish</strong> below.
            </>
          ) : (
            <>
              Local-only tool — each tab is a pack category showing what&rsquo;s saved and what still
              falls back to placeholders. Tap an empty slot to drop a photo into it, tap a card to
              edit it, or use <strong>Edit pack</strong> to change a pack&rsquo;s label, colors, and
              pack count. Saving writes <code>public/photos/</code>, <code>src/data/card-configs.json</code>{" "}
              and <code>src/data/designs.json</code>; push to hand it all off to the site.
            </>
          )}
        </p>
        {loadError && <p className="cfg-error cfg-load-error">Couldn&rsquo;t load saved cards: {loadError}</p>}
        {designsError && <p className="cfg-error cfg-load-error">Couldn&rsquo;t load categories: {designsError}</p>}
      </header>
      <div className="cfg-layout">
        <div className="cfg-main">
          {target && designs ? (
            <CardEditor
              key={editorKey}
              target={target}
              configs={configs}
              designs={designs}
              initial={slotIntent}
              onSaved={target.kind === "upload" ? () => handleUploadSaved(target.image.id) : refresh}
              onDeleted={() => {
                closeEditor();
                refresh();
              }}
              onClose={closeEditor}
              remote={remote}
            />
          ) : packEdit ? (
            <PackEditor
              key={packEdit.mode === "edit" ? `pack:${packEdit.id}` : "pack:new"}
              design={packEditDesign}
              existingIds={(designs ?? []).map((d) => d.id)}
              cardCount={
                packEditDesign
                  ? Object.values(configs).filter((c) => c.designId === packEditDesign.id).length
                  : 0
              }
              onSaved={(id) => {
                setPackEdit(null);
                setActiveDesignId(id);
                refreshDesigns();
              }}
              onDeleted={() => {
                setPackEdit(null);
                refreshDesigns();
              }}
              onClose={() => setPackEdit(null)}
            />
          ) : designs ? (
            <CategoryBoard
              designs={designs}
              configs={configs}
              activeId={activeDesign?.id ?? ""}
              onSelect={setActiveDesignId}
              onEditPack={(id) => setPackEdit({ mode: "edit", id })}
              onAddCategory={() => setPackEdit({ mode: "new" })}
              onEditCard={(key) => openEditor({ kind: "edit", key })}
              onFillSlot={fillSlot}
              remote={remote}
            />
          ) : (
            <div className="cfg-panel cfg-panel--placeholder">
              {designsError ? "Categories failed to load — see the error above." : "Loading categories…"}
            </div>
          )}
        </div>
        <div className="cfg-left-col">
          <PhotoPicker
            images={uploads}
            onAdd={(files) => addUploads(files)}
            onSelect={(image) => openEditor({ kind: "upload", image })}
            onRemove={removeUpload}
            selectedId={target?.kind === "upload" ? target.image.id : null}
            busy={compressing}
          />
          {!remote && (
            <FolderBrowser
              onSelectImage={(image) => openEditor({ kind: "new", image })}
              selectedPath={target?.kind === "new" ? target.image.path : null}
            />
          )}
        </div>
      </div>
      <GitPushPanel refreshSignal={changeTick} remote={remote} />
      {/* Hidden picker for the tap-an-empty-slot flow. */}
      <input
        ref={slotInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const slot = pendingSlotRef.current;
          pendingSlotRef.current = null;
          if (files.length) addUploads(files, slot);
          e.target.value = "";
        }}
      />
    </div>
  );
}
