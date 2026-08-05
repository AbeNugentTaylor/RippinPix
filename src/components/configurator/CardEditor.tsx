"use client";

import { useMemo, useState } from "react";
import Card3D, {
  BASE_TILT_X,
  BASE_TILT_Y,
  CLEARCOAT,
  CLEARCOAT_ROUGHNESS,
  DEFAULT_LIGHTS,
  ENV_INTENSITY,
  HOLO_STRENGTH,
  IOR,
  NORMAL_SCALE,
  ROUGHNESS,
  type Card3DOverrides,
} from "@/components/Card3D";
import CardCaptionOverlay from "@/components/CardCaptionOverlay";
import CropEditor from "./CropEditor";
import LightingDebugPanel from "./LightingDebugPanel";
import type { Entry } from "./FolderBrowser";
import { DESIGNS, POOLS } from "@/lib/designs";
import { firstEmptySlot, configKey } from "@/lib/card-key";
import type { Attribute, Card as CardT, CardConfig, Crop, Rarity } from "@/lib/types";

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "holo", "secret"];

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
    ior: holo ? IOR[rarity] : IOR.common,
    normalScale: holo ? NORMAL_SCALE[rarity] : NORMAL_SCALE.common,
    baseTiltX: BASE_TILT_X,
    baseTiltY: BASE_TILT_Y,
  };
}

interface CardEditorProps {
  image: Entry;
  configs: Record<string, CardConfig>;
  onSaved: () => void;
}

function slotFor(designId: string, configs: Record<string, CardConfig>): number {
  const design = DESIGNS.find((d) => d.id === designId) ?? DESIGNS[0];
  return firstEmptySlot(designId, design.packs * 8, configs) ?? 1;
}

export default function CardEditor({ image, configs, onSaved }: CardEditorProps) {
  const [designId, setDesignId] = useState(DESIGNS[0].id);
  const [local, setLocal] = useState(() => slotFor(DESIGNS[0].id, configs));
  const [crop, setCrop] = useState<Crop>({ x: 50, y: 50, zoom: 1 });
  const [rarity, setRarity] = useState<Rarity>("common");
  const [holo, setHolo] = useState(false);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [medium, setMedium] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Card3DOverrides>(() => defaultOverridesFor("common", false));

  const design = DESIGNS.find((d) => d.id === designId) ?? DESIGNS[0];
  const totalSlots = design.packs * 8;
  const placeholder = POOLS[designId]?.[local - 1];
  const existing = configs[configKey(designId, local)];

  const src = `/api/local-image?path=${encodeURIComponent(image.path)}`;

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
      attributes,
      crop,
    }),
    [designId, local, design, title, placeholder, date, medium, src, rarity, holo, attributes, crop]
  );

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/card-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: image.path,
          designId,
          local,
          crop,
          rarity,
          holo,
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

  return (
    <div className="cfg-panel cfg-editor">
      <h2 className="cfg-panel-title">{image.name}</h2>

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
          <span className="cfg-field-label">Live preview</span>
          <div className="cfg-preview-frame">
            <Card3D photoUrl={src} crop={crop} rarity={rarity} holo={holo} overrides={overrides} />
            <CardCaptionOverlay card={previewCard} />
          </div>
        </div>

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
