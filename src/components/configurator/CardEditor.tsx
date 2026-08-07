"use client";

import { useMemo, useState } from "react";
import Card3D, {
  BASE_TILT_X,
  BASE_TILT_Y,
  CLEARCOAT,
  CLEARCOAT_ROUGHNESS,
  DEFAULT_LIGHTS,
  ENV_INTENSITY,
  HOLO_BAND_WIDTH,
  HOLO_PATTERN_SCALE,
  HOLO_SPARKLE_FREQ,
  HOLO_STRENGTH,
  IOR,
  ROUGHNESS,
  type Card3DOverrides,
} from "@/components/Card3D";
import CardCaptionOverlay from "@/components/CardCaptionOverlay";
import CardLightbox from "@/components/CardLightbox";
import CropEditor from "./CropEditor";
import LightingDebugPanel from "./LightingDebugPanel";
import type { Entry } from "./FolderBrowser";
import { DESIGNS, POOLS } from "@/lib/designs";
import { firstEmptySlot, configKey } from "@/lib/card-key";
import type { Attribute, Card as CardT, CardConfig, Crop, HoloPattern, Rarity } from "@/lib/types";

export type EditorTarget = { kind: "new"; image: Entry } | { kind: "edit"; key: string };

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "holo", "secret"];
const HOLO_PATTERNS: { value: HoloPattern; label: string }[] = [
  { value: "none", label: "None (plain rainbow)" },
  { value: "cosmos", label: "Cosmos" },
  { value: "stripes", label: "Stripes" },
  { value: "sunburst", label: "Sunburst" },
];

// Mirrors the defaulting logic in Card3D's own holo-properties effect, so the
// debug panel's sliders start at whatever the current tier would normally
// render, not an arbitrary zero.
function defaultOverridesFor(rarity: Rarity, holo: boolean): Card3DOverrides {
  return {
    ambient: DEFAULT_LIGHTS.ambient,
    key: DEFAULT_LIGHTS.key,
    rim: DEFAULT_LIGHTS.rim,
    clearcoat: holo ? CLEARCOAT[rarity] : CLEARCOAT.common,
    clearcoatRoughness: holo ? CLEARCOAT_ROUGHNESS[rarity] : CLEARCOAT_ROUGHNESS.common,
    roughness: holo ? ROUGHNESS[rarity] : ROUGHNESS.common,
    envMapIntensity: holo ? ENV_INTENSITY[rarity] : ENV_INTENSITY.common,
    holoStrength: holo ? HOLO_STRENGTH[rarity] : 0,
    holoBandWidth: HOLO_BAND_WIDTH,
    holoPatternScale: HOLO_PATTERN_SCALE,
    holoSparkleFreq: HOLO_SPARKLE_FREQ,
    ior: holo ? IOR[rarity] : IOR.common,
    baseTiltX: BASE_TILT_X,
    baseTiltY: BASE_TILT_Y,
  };
}

interface CardEditorProps {
  target: EditorTarget;
  configs: Record<string, CardConfig>;
  onSaved: () => void;
  onClose: () => void;
}

function slotFor(designId: string, configs: Record<string, CardConfig>): number {
  const design = DESIGNS.find((d) => d.id === designId) ?? DESIGNS[0];
  return firstEmptySlot(designId, design.packs * 8, configs) ?? 1;
}

export default function CardEditor({ target, configs, onSaved, onClose }: CardEditorProps) {
  const editingConfig = target.kind === "edit" ? configs[target.key] : null;

  const [designId, setDesignId] = useState(() => editingConfig?.designId ?? DESIGNS[0].id);
  const [local, setLocal] = useState(() => editingConfig?.local ?? slotFor(DESIGNS[0].id, configs));
  const [crop, setCrop] = useState<Crop>(() => editingConfig?.crop ?? { x: 50, y: 50, zoom: 1 });
  const [rarity, setRarity] = useState<Rarity>(() => editingConfig?.rarity ?? "common");
  const [holo, setHolo] = useState(() => editingConfig?.holo ?? false);
  const [holoPattern, setHoloPattern] = useState<HoloPattern>(() => editingConfig?.holoPattern ?? "none");
  const [attributes, setAttributes] = useState<Attribute[]>(() => editingConfig?.attributes ?? []);
  const [title, setTitle] = useState(() => editingConfig?.title ?? "");
  const [date, setDate] = useState(() => editingConfig?.date ?? "");
  const [medium, setMedium] = useState(() => editingConfig?.medium ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [overrides, setOverrides] = useState<Card3DOverrides>(() =>
    defaultOverridesFor(editingConfig?.rarity ?? "common", editingConfig?.holo ?? false)
  );

  const design = DESIGNS.find((d) => d.id === designId) ?? DESIGNS[0];
  const totalSlots = design.packs * 8;
  const placeholder = POOLS[designId]?.[local - 1];
  const occupyingKey = configKey(designId, local);
  const occupiedBySelf = target.kind === "edit" && target.key === occupyingKey;
  const existing = occupiedBySelf ? undefined : configs[occupyingKey];

  const src =
    target.kind === "edit" && editingConfig
      ? `/photos/${editingConfig.designId}/${editingConfig.fileName}`
      : target.kind === "new"
        ? `/api/local-image?path=${encodeURIComponent(target.image.path)}`
        : "";

  const heading =
    target.kind === "edit"
      ? `Editing ${editingConfig?.title || target.key}`
      : target.image.name;

  const handleDesignChange = (id: string) => {
    setDesignId(id);
    setLocal(slotFor(id, configs));
  };

  const setRarityAndHolo = (r: Rarity) => {
    setRarity(r);
    const nextHolo = r === "holo" || r === "secret";
    setHolo(nextHolo);
    setOverrides(defaultOverridesFor(r, nextHolo));
  };

  const setHoloAndOverrides = (nextHolo: boolean) => {
    setHolo(nextHolo);
    setOverrides(defaultOverridesFor(rarity, nextHolo));
  };

  const addAttribute = () => setAttributes((a) => [...a, { label: "", value: "" }]);
  const updateAttribute = (i: number, field: "label" | "value", v: string) =>
    setAttributes((a) => a.map((attr, idx) => (idx === i ? { ...attr, [field]: v } : attr)));
  const removeAttribute = (i: number) => setAttributes((a) => a.filter((_, idx) => idx !== i));

  const previewCard: CardT = useMemo(
    () => ({
      key: "preview",
      order: 0,
      designId,
      slot: "preview",
      plate: String(local).padStart(3, "0"),
      tilt: 0,
      tag: "#7de08a",
      tier: design.name,
      ink: design.ink,
      title: title || placeholder?.title || "Untitled",
      date: date || placeholder?.date || "",
      medium: medium || placeholder?.medium || "",
      photoUrl: src,
      rarity,
      holo,
      holoPattern,
      attributes,
      crop,
    }),
    [designId, local, design, title, placeholder, date, medium, src, rarity, holo, holoPattern, attributes, crop]
  );

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/card-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingKey: target.kind === "edit" ? target.key : undefined,
          sourcePath: target.kind === "new" ? target.image.path : undefined,
          designId,
          local,
          crop,
          rarity,
          holo,
          holoPattern,
          attributes: attributes.filter((a) => a.label.trim() || a.value.trim()),
          title: title || undefined,
          date: date || undefined,
          medium: medium || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Save failed");
      } else {
        setMessage(`Saved as ${designId}/${String(local).padStart(2, "0")}`);
        onSaved();
      }
    } catch {
      setMessage("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (target.kind === "edit" && !editingConfig) {
    return (
      <div className="cfg-panel cfg-editor">
        <p className="cfg-empty">This card was deleted elsewhere — nothing to edit.</p>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="cfg-panel cfg-editor">
      <div className="cfg-editor-heading">
        <h2 className="cfg-panel-title">{heading}</h2>
        <button type="button" className="cfg-editor-close" onClick={onClose}>
          {target.kind === "edit" ? "Done editing" : "Clear"}
        </button>
      </div>

      <div className="cfg-editor-body">
        <div className="cfg-editor-crop">
          <CropEditor src={src} crop={crop} onChange={setCrop} />
          <label className="cfg-field">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={crop.zoom}
              onChange={(e) => setCrop((c) => ({ ...c, zoom: Number(e.target.value) }))}
            />
          </label>
        </div>

        <div className="cfg-editor-preview">
          <span className="cfg-field-label">Live preview — click to view full size</span>
          <div
            className="cfg-preview-frame cfg-preview-frame--clickable"
            role="button"
            tabIndex={0}
            onClick={() => setLightboxOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setLightboxOpen(true);
              }
            }}
            aria-label="View full size, as it will appear in the production app"
          >
            <Card3D
              photoUrl={src}
              crop={crop}
              rarity={rarity}
              holo={holo}
              holoPattern={holoPattern}
              overrides={overrides}
            />
            <CardCaptionOverlay card={previewCard} />
          </div>
        </div>
        {lightboxOpen && <CardLightbox card={previewCard} onClose={() => setLightboxOpen(false)} />}

        <div className="cfg-editor-form">
          <label className="cfg-field">
            Series
            <select value={designId} onChange={(e) => handleDesignChange(e.target.value)}>
              {DESIGNS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <label className="cfg-field">
            Slot ({totalSlots} total)
            <input
              type="number"
              min={1}
              max={totalSlots}
              value={local}
              onChange={(e) => setLocal(Number(e.target.value))}
            />
          </label>
          {existing && <p className="cfg-warning">Slot already has a saved card — saving will overwrite it.</p>}

          <label className="cfg-field">
            Rarity
            <select value={rarity} onChange={(e) => setRarityAndHolo(e.target.value as Rarity)}>
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="cfg-field cfg-field--inline">
            <input type="checkbox" checked={holo} onChange={(e) => setHoloAndOverrides(e.target.checked)} />
            Holo foil effect
          </label>

          {holo && (
            <label className="cfg-field">
              Holo pattern
              <select value={holoPattern} onChange={(e) => setHoloPattern(e.target.value as HoloPattern)}>
                {HOLO_PATTERNS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="cfg-field">
            Title
            <input
              type="text"
              value={title}
              placeholder={placeholder?.title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="cfg-field">
            Date
            <input
              type="text"
              value={date}
              placeholder={placeholder?.date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="cfg-field">
            Medium
            <input
              type="text"
              value={medium}
              placeholder={placeholder?.medium}
              onChange={(e) => setMedium(e.target.value)}
            />
          </label>

          <div className="cfg-attributes">
            <span className="cfg-field-label">Attributes</span>
            {attributes.map((a, i) => (
              <div className="cfg-attr-row" key={i}>
                <input
                  type="text"
                  placeholder="Label"
                  value={a.label}
                  onChange={(e) => updateAttribute(i, "label", e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={a.value}
                  onChange={(e) => updateAttribute(i, "value", e.target.value)}
                />
                <button type="button" onClick={() => removeAttribute(i)}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={addAttribute}>
              Add attribute
            </button>
          </div>

          <button className="cfg-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save card"}
          </button>
          {message && <p className="cfg-message">{message}</p>}
        </div>
      </div>

      <LightingDebugPanel overrides={overrides} onChange={setOverrides} />
    </div>
  );
}
