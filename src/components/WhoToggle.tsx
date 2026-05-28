"use client";

import { useState, useTransition } from "react";
import { setWhoAction } from "@/lib/actions";
import type { Who } from "@/lib/identity";

// Two-tap "who's logging" switcher. No accounts — it just records who added
// each entry and is remembered per device via a cookie.
export default function WhoToggle({
  who,
  momName,
  partnerName,
}: {
  who: Who;
  momName: string;
  partnerName: string;
}) {
  const [current, setCurrent] = useState<Who>(who);
  const [, startTransition] = useTransition();

  function pick(next: Who) {
    if (next === current) return;
    setCurrent(next);
    startTransition(() => setWhoAction(next));
  }

  const opts: { key: Who; label: string }[] = [
    { key: "geena", label: momName },
    { key: "daddy", label: partnerName },
  ];

  return (
    <div className="flex items-center rounded-full border border-border bg-panel p-0.5 text-xs font-semibold">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => pick(o.key)}
          aria-pressed={current === o.key}
          className={
            current === o.key
              ? "rounded-full bg-accent px-3 py-1 text-ink-on-accent transition-colors"
              : "rounded-full px-3 py-1 text-mute transition-colors"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
