"use client";

import { useState } from "react";
import { CATEGORIES, type CategoryKey } from "@/lib/categories";

// Horizontal pill picker backing a hidden input named `name`. Used in the
// craving form.
export default function CategoryPicker({
  name = "category",
  defaultValue = "other",
}: {
  name?: string;
  defaultValue?: CategoryKey;
}) {
  const [sel, setSel] = useState<CategoryKey>(defaultValue);
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
      <input type="hidden" name={name} value={sel} />
      {CATEGORIES.map((c) => {
        const active = c.key === sel;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => setSel(c.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? "border-accent bg-accent/15 text-ink"
                : "border-border bg-panel2 text-mute"
            }`}
          >
            <span className="mr-1">{c.emoji}</span>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
