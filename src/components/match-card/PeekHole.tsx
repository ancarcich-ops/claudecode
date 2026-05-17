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
  const path = next.shapePath ?? fallbackHolePath(next.number, next.par);
  // Place tee + pin at the start / end of the path so they line up with
  // whatever curve we drew. Approximate from the path; for the generic
  // fallback we hard-code; for real paths we just read first/last command.
  const endpoints = endpointsFromPath(path);

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
        {/* tee + pin pinned to the path endpoints we drew above. */}
        <circle
          cx={endpoints.start.x}
          cy={endpoints.start.y}
          r="1.4"
          fill="rgb(var(--color-mute) / 0.9)"
        />
        <circle
          cx={endpoints.end.x}
          cy={endpoints.end.y}
          r="1.6"
          fill="rgb(var(--color-gold))"
        />
      </svg>
    </div>
  );
}

// Parses the first `M x y` and the trailing `... x y` pair out of the
// path string so we can drop the tee dot and the pin exactly on the
// curve we drew. Cheap and good enough for the M / L / Q paths we emit
// from buildHoleShapePath. Falls back to the generic placeholder
// coords when parsing fails.
function endpointsFromPath(path: string): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const nums = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 4) {
    return { start: { x: 6, y: 14 }, end: { x: 94, y: 6 } };
  }
  return {
    start: { x: nums[0], y: nums[1] },
    end: { x: nums[nums.length - 2], y: nums[nums.length - 1] },
  };
}

// Deterministic per-hole fallback curve. Picks one of a few canned
// shapes from a small hash of (hole, par) so the same hole always
// renders the same shape and consecutive holes look different.
// Replaced as soon as the real OSM-derived path is available.
function fallbackHolePath(hole: number, par: number): string {
  const shapes = [
    "M 6 9 Q 50 9 94 9",            // straight
    "M 6 12 Q 40 4 94 8",           // gentle dogleg right
    "M 6 6 Q 40 14 94 10",          // gentle dogleg left
    "M 6 14 Q 30 14 60 4 T 94 6",   // sharp dogleg right
    "M 6 4 Q 30 4 60 14 T 94 12",   // sharp dogleg left
    "M 6 9 Q 30 3 50 9 T 94 10",    // S-shape
    "M 6 9 Q 28 14 56 9 T 94 7",    // mild S
    "M 6 8 Q 50 2 94 10",           // wide arc up
  ];
  return shapes[((hole * 31 + par * 7) % shapes.length + shapes.length) % shapes.length];
}
