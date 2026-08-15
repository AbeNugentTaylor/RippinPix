"use client";

import { useMemo, useState } from "react";
import PackPreview from "./PackPreview";
import { PER_PACK } from "@/lib/designs";
import type { Design } from "@/lib/types";

interface PackEditorProps {
  // null = creating a brand-new category.
  design: Design | null;
  // Ids already in use, for slugging a new category's id client-side.
  existingIds: string[];
  // Saved cards in this category (delete is blocked server-side while > 0,
  // but surface it up-front too).
  cardCount: number;
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onClose: () => void;
}

const MAX_PACKS = 8;

function slugFor(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "series";
  const slug = base.length < 2 ? `${base}xx`.slice(0, 2) : base;
  if (!taken.includes(slug)) return slug;
  for (let n = 2; ; n++) {
    const candidate = `${slug.slice(0, 20)}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

// Edit screen for one pack/category: the label lines printed on the pack
// front, the small sub line, colors, and how many packs the series runs to.
// Also where categories get added and removed.
export default function PackEditor({ design, existingIds, cardCount, onSaved, onDeleted, onClose }: PackEditorProps) {
  const [name, setName] = useState(design?.name ?? "");
  const [artText, setArtText] = useState(design?.art.join("\n") ?? "");
  const [sub, setSub] = useState(design?.sub ?? "");
  const [stock, setStock] = useState(design?.stock ?? "#e8e3d3");
  const [foil, setFoil] = useState(design?.foil ?? "#201e1d");
  const [ink, setInk] = useState(design?.ink ?? "#3a3634");
  const [packs, setPacks] = useState(design?.packs ?? 1);
  const [limited, setLimited] = useState(design?.limited ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const artLines = useMemo(
    () =>
      artText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 4),
    [artText]
  );

  // Live preview of the label as typed — falls back to the name so the
  // preview never renders an entirely blank pack.
  const draft: Design = {
    id: design?.id ?? "new",
    name: name || "New category",
    packs,
    stock,
    foil,
    ink,
    art: artLines.length ? artLines : [name || "New"],
    sub,
    subjects: design?.subjects ?? [],
    conds: design?.conds ?? [],
    ...(limited ? { limited: true } : {}),
    ...(design?.locked ? { locked: true } : {}),
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = design?.id ?? slugFor(name, existingIds);
      const res = await fetch("/api/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          create: !design,
          design: { id, name, packs, stock, foil, ink, art: artLines, sub, limited },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      onSaved(id);
    } catch {
      setError("Save failed — could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!design) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/designs?id=${encodeURIComponent(design.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Delete failed");
        setConfirmingDelete(false);
        return;
      }
      onDeleted();
    } catch {
      setError("Delete failed — could not reach the server.");
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cfg-panel cfg-pack-editor">
      <div className="cfg-editor-heading">
        <h2 className="cfg-panel-title">{design ? `Edit pack — ${design.name}` : "New category"}</h2>
        <button type="button" className="cfg-editor-close" onClick={onClose}>
          {design ? "Done" : "Cancel"}
        </button>
      </div>

      <div className="cfg-pack-editor-body">
        <div className="cfg-pack-editor-preview">
          <span className="cfg-field-label">Pack preview</span>
          <PackPreview design={draft} />
        </div>

        <div className="cfg-editor-form">
          <label className="cfg-field">
            Category name
            <input type="text" value={name} placeholder="e.g. Street corners" onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="cfg-field">
            Pack label (one line per row, big marker text on the pack)
            <textarea
              className="cfg-art-input"
              rows={3}
              value={artText}
              placeholder={"Street\ncorners"}
              onChange={(e) => setArtText(e.target.value)}
            />
          </label>

          <label className="cfg-field">
            Sub line (small text under the label)
            <input type="text" value={sub} onChange={(e) => setSub(e.target.value)} />
          </label>

          <label className="cfg-field">
            Packs in this category ({packs * PER_PACK} card slots)
            <input
              type="number"
              min={1}
              max={MAX_PACKS}
              value={packs}
              onChange={(e) => setPacks(Math.max(1, Math.min(MAX_PACKS, Number(e.target.value) || 1)))}
            />
          </label>

          <div className="cfg-color-row">
            <label className="cfg-field">
              Stock
              <input type="color" value={stock} onChange={(e) => setStock(e.target.value)} />
            </label>
            <label className="cfg-field">
              Foil
              <input type="color" value={foil} onChange={(e) => setFoil(e.target.value)} />
            </label>
            <label className="cfg-field">
              Ink
              <input type="color" value={ink} onChange={(e) => setInk(e.target.value)} />
            </label>
          </div>

          <label className="cfg-field cfg-field--inline">
            <input type="checkbox" checked={limited} onChange={(e) => setLimited(e.target.checked)} />
            Limited run
          </label>

          <button className="cfg-save-btn" onClick={save} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : design ? "Save pack" : "Add category"}
          </button>

          {design &&
            (confirmingDelete ? (
              <div className="cfg-git-confirm">
                <p>Remove the whole “{design.name}” category?</p>
                <div className="cfg-git-confirm-actions">
                  <button type="button" className="cfg-save-btn cfg-delete-btn" onClick={remove} disabled={busy}>
                    {busy ? "Removing…" : "Yes, remove it"}
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="cfg-delete-link" onClick={() => setConfirmingDelete(true)} disabled={busy}>
                Remove this category…
              </button>
            ))}
          {design && cardCount > 0 && (
            <p className="cfg-picker-hint">
              This category has {cardCount} saved card{cardCount === 1 ? "" : "s"} — it can only be removed once
              they&rsquo;re gone.
            </p>
          )}
          {error && <p className="cfg-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
