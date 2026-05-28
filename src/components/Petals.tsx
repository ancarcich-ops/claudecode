"use client";

import { useMemo } from "react";

// Decorative drifting petals for the hero. Positions/timings are randomized
// once on mount. Respects prefers-reduced-motion via the .petal CSS (which
// is disabled under that media query).
export default function Petals({ count = 8 }: { count?: number }) {
  const petals = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 8,
        duration: 7 + Math.random() * 7,
        scale: 0.6 + Math.random() * 0.7,
        emoji: ["🌸", "🌷", "💮", "🌺"][i % 4],
      })),
    [count],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {petals.map((p) => (
        <span
          key={p.id}
          className="petal absolute top-0 text-sm"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `scale(${p.scale})`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
