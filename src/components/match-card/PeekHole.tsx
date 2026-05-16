// Small "Now teeing · 13" callout panel pinned to the bottom of a LIVE
// or UPCOMING card. Persistent (per design decision); the spec calls
// for a sketched hole shape but we degrade to a generic gentle curve
// until per-hole OSM geometry feeds in.

import type { NextHole } from "@/lib/matchCard";

export default function PeekHole({
  next,
  variant = "live",
}: {
  next: NextHole;
  // "live" = emerald label + gold pin; "upcoming" = sky label + gold pin.
  variant?: "live" | "upcoming";
}) {
  const labelColor = variant === "live" ? "text-accent" : "text-sky-400";
  const labelText = variant === "live" ? "Now teeing" : "Opens at";
  const path =
    next.shapePath ?? "M 6 14 Q 35 4 60 8 T 94 6";

  return (
    <div className="rounded-md border border-border bg-panel2 px-3 py-2">
      <div className="flex items-baseline gap-2 mb-1">
        <span
          className={
            "font-mono text-[9px] uppercase tracking-wider " + labelColor
          }
        >
          {labelText} · {next.number}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-mute">
          Par {next.par}
          {next.yardageYds != null ? ` · ${next.yardageYds}y` : ""}
        </span>
        {next.strokeIndex != null && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-faint ml-auto">
            SI {next.strokeIndex}
          </span>
        )}
      </div>
      <svg
        viewBox="0 0 100 18"
        width="100%"
        height="14"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={path}
          fill="none"
          stroke={
            variant === "live"
              ? "rgb(var(--color-accent) / 0.45)"
              : "rgb(96 165 250 / 0.45)"
          }
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        {/* tee */}
        <circle cx="6" cy="14" r="1.4" fill="rgb(var(--color-mute) / 0.9)" />
        {/* pin */}
        <circle cx="94" cy="6" r="1.6" fill="rgb(var(--color-gold))" />
      </svg>
    </div>
  );
}
