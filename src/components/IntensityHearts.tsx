"use client";

import { useState } from "react";

// Interactive 1-5 heart picker. Used in forms (interactive) and renders a
// static row when `readOnly`. Backs a hidden input named `name` for plain
// <form> submission.
export default function IntensityHearts({
  name = "intensity",
  defaultValue = 3,
  value,
  readOnly = false,
  size = "md",
}: {
  name?: string;
  defaultValue?: number;
  value?: number;
  readOnly?: boolean;
  size?: "sm" | "md";
}) {
  const [v, setV] = useState(value ?? defaultValue);
  const current = value ?? v;
  const dim = size === "sm" ? "text-base" : "text-2xl";

  if (readOnly) {
    return (
      <span className={`inline-flex gap-0.5 ${dim}`} aria-label={`${current} of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={i <= current ? "" : "opacity-25 grayscale"}>
            {i <= current ? "❤️" : "🤍"}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={current} />
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => setV(i)}
          aria-label={`Set intensity ${i}`}
          className={`text-3xl leading-none transition-transform ${
            i <= current ? "pop" : "opacity-30 grayscale hover:opacity-60"
          }`}
        >
          ❤️
        </button>
      ))}
    </div>
  );
}
