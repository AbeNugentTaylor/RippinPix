"use client";

import type { Card3DOverrides } from "@/components/Card3D";

interface LightingDebugPanelProps {
  overrides: Card3DOverrides;
  onChange: (overrides: Card3DOverrides) => void;
}

const FIELDS: { key: keyof Card3DOverrides; label: string; min: number; max: number; step: number }[] = [
  { key: "ambient", label: "Ambient", min: 0, max: 2.5, step: 0.01 },
  { key: "key", label: "Key light", min: 0, max: 2.5, step: 0.01 },
  { key: "rim", label: "Rim light", min: 0, max: 2.5, step: 0.01 },
  { key: "clearcoat", label: "Clearcoat (white glare)", min: 0, max: 1, step: 0.01 },
  { key: "clearcoatRoughness", label: "Clearcoat roughness", min: 0, max: 1, step: 0.01 },
  { key: "roughness", label: "Base roughness", min: 0, max: 1, step: 0.01 },
  { key: "envMapIntensity", label: "Env map intensity", min: 0, max: 1.5, step: 0.01 },
  { key: "holoStrength", label: "Holo rainbow strength", min: 0, max: 1, step: 0.01 },
  { key: "holoBandWidth", label: "Holo band width", min: 0.05, max: 1, step: 0.01 },
  { key: "holoPatternScale", label: "Holo pattern scale (higher = smaller shapes)", min: 0.3, max: 3, step: 0.01 },
  { key: "holoSparkleFreq", label: "Holo sparkle flicker speed", min: 0.1, max: 2, step: 0.01 },
  { key: "ior", label: "IOR", min: 1, max: 2, step: 0.01 },
  { key: "baseTiltX", label: "Base tilt X", min: -0.4, max: 0.4, step: 0.01 },
  { key: "baseTiltY", label: "Base tilt Y", min: -0.4, max: 0.4, step: 0.01 },
];

// Local-only tuning aid: drag these to find numbers that actually look right,
// then read them off and hand them back — they don't get saved anywhere or
// affect the real site on their own.
export default function LightingDebugPanel({ overrides, onChange }: LightingDebugPanelProps) {
  const set = (key: keyof Card3DOverrides, value: number) => {
    onChange({ ...overrides, [key]: value });
  };

  return (
    <div className="cfg-panel cfg-debug-panel">
      <h2 className="cfg-panel-title">Lighting debug</h2>
      <p className="cfg-debug-hint">
        Drag to tune live against the preview. Read off the numbers once it looks right and tell
        Claude what to bake in — nothing here saves automatically.
      </p>
      {FIELDS.map((f) => (
        <label className="cfg-debug-field" key={f.key}>
          <span>
            {f.label}: {(overrides[f.key] ?? 0).toFixed(2)}
          </span>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={overrides[f.key] ?? 0}
            onChange={(e) => set(f.key, Number(e.target.value))}
          />
        </label>
      ))}
    </div>
  );
}
