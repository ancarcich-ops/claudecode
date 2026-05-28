"use client";

import { useState, useTransition } from "react";
import { setStars } from "@/lib/actions";

// Star rating for the Wild Combos hall of fame. Click to set; persists via
// the setStars server action. Read-only mode just paints the score.
export default function StarRating({
  id,
  value,
  readOnly = false,
}: {
  id?: string;
  value: number;
  readOnly?: boolean;
}) {
  const [v, setV] = useState(value);
  const [pending, startTransition] = useTransition();

  function pick(n: number) {
    if (readOnly || pending) return;
    const next = n === v ? 0 : n;
    setV(next);
    if (id) startTransition(() => setStars(id, next));
  }

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={readOnly}
          onClick={() => pick(i)}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          className={`text-lg leading-none transition-transform ${
            readOnly ? "cursor-default" : "hover:scale-110"
          } ${i <= v ? "" : "opacity-25 grayscale"}`}
        >
          ⭐
        </button>
      ))}
    </div>
  );
}
