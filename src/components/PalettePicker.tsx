"use client";

import { useState } from "react";
import { PALETTES, type PaletteKey } from "@/lib/palettes";

// Swatch picker backing a hidden input named "palette". Selecting a swatch
// updates <html data-palette> immediately so the whole app previews the color
// live; the choice persists when the Settings form is saved.
export default function PalettePicker({
  name = "palette",
  defaultValue = "blush",
}: {
  name?: string;
  defaultValue?: PaletteKey;
}) {
  const [sel, setSel] = useState<PaletteKey>(defaultValue);

  function pick(key: PaletteKey) {
    setSel(key);
    document.documentElement.dataset.palette = key;
  }

  return (
    <div>
      <input type="hidden" name={name} value={sel} />
      <div className="flex flex-wrap gap-3">
        {PALETTES.map((p) => {
          const active = p.key === sel;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => pick(p.key)}
              aria-pressed={active}
              aria-label={p.label}
              className="flex flex-col items-center gap-1"
            >
              <span
                className={`h-10 w-10 rounded-full border-2 transition-transform ${
                  active ? "scale-110 border-ink" : "border-transparent"
                }`}
                style={{ background: p.accent }}
              />
              <span className={`text-xs ${active ? "font-bold text-ink" : "text-mute"}`}>
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
