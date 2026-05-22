"use client";

import { useState } from "react";
import Link from "next/link";
import HoleMiniMap from "@/app/matches/[id]/HoleMiniMap";
import type { HazardGeo, HoleGeo } from "@/lib/course";

// Read-only, GPS-free per-hole satellite preview. Pick a hole, see
// the green polygon, tee, and hazards drawn over Mapbox satellite.

export default function CoursePreview({
  courseName,
  totalHoles,
  holeGeoByHole,
  hazardsByHole,
}: {
  courseName: string;
  totalHoles: number;
  holeGeoByHole: Record<number, HoleGeo>;
  hazardsByHole: Record<number, HazardGeo[]>;
}) {
  const [hole, setHole] = useState(1);
  const geo = holeGeoByHole[hole];
  const hazards = hazardsByHole[hole] ?? [];

  const greenCenter =
    geo?.greenLat != null && geo?.greenLng != null
      ? { lat: geo.greenLat, lng: geo.greenLng }
      : null;
  const tee =
    geo?.teeLat != null && geo?.teeLng != null
      ? { lat: geo.teeLat, lng: geo.teeLng }
      : null;
  const greenPolygon = geo?.greenPolygon ?? null;
  const hazardPts = hazards.map((h) => ({
    id: h.id,
    lat: h.lat,
    lng: h.lng,
    kind: h.kind,
  }));

  const summaryItems = [
    { label: "Green center", ok: !!greenCenter },
    { label: "Tee", ok: !!tee },
    { label: "Green polygon", ok: !!greenPolygon, extra: greenPolygon ? `${greenPolygon.length} pts` : null },
    { label: "Hazards", ok: hazards.length > 0, extra: hazards.length > 0 ? `${hazards.length}` : null },
    { label: "Yardage", ok: geo?.distanceYds != null, extra: geo?.distanceYds != null ? `${geo.distanceYds}y` : null },
  ];

  return (
    <div className="p-4 space-y-3 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            href={`/admin/courses/${encodeURIComponent(courseName)}`}
            className="text-xs text-mute hover:text-fg underline"
          >
            ← back to editor
          </Link>
          <h1 className="text-lg font-semibold mt-1">
            {courseName} <span className="text-mute text-sm">preview</span>
          </h1>
        </div>
        <div className="text-[11px] text-mute">
          Hole {hole} of {totalHoles}
        </div>
      </div>

      <div
        className="flex gap-1 overflow-x-auto pb-1 sticky top-0 z-10 bg-bg/95 backdrop-blur -mx-4 px-4 py-1 border-b border-border/60"
        role="tablist"
        aria-label="Hole picker"
      >
        {Array.from({ length: totalHoles }, (_, i) => i + 1).map((n) => {
          const has =
            (holeGeoByHole[n]?.greenLat != null) ||
            (holeGeoByHole[n]?.greenPolygon != null);
          const isActive = n === hole;
          return (
            <button
              key={n}
              role="tab"
              aria-selected={isActive}
              onClick={() => setHole(n)}
              className={
                "shrink-0 h-8 min-w-8 px-2 rounded text-xs font-mono " +
                (isActive
                  ? "bg-accent text-bg"
                  : has
                    ? "bg-panel2 hover:bg-panel"
                    : "bg-panel2/40 text-mute hover:bg-panel")
              }
              title={has ? `Hole ${n}` : `Hole ${n} (no geometry)`}
            >
              {n}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-3">
        <div className="aspect-square md:aspect-auto md:min-h-[420px] border border-border rounded-md overflow-hidden bg-panel2/40">
          <HoleMiniMap
            player={null}
            tee={tee}
            greenCenter={greenCenter}
            greenFront={null}
            greenBack={null}
            greenPolygon={greenPolygon}
            hazards={hazardPts}
            landmarks={[]}
          />
        </div>
        <div className="space-y-2">
          <div className="border border-border rounded-md p-3 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-mute">
              Hole {hole}
            </div>
            {summaryItems.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className={
                    "inline-block w-1.5 h-1.5 rounded-full " +
                    (s.ok ? "bg-accent" : "bg-mute/40")
                  }
                />
                <span className={s.ok ? "" : "text-mute"}>{s.label}</span>
                {s.extra && (
                  <span className="ml-auto font-mono text-[11px] text-mute">
                    {s.extra}
                  </span>
                )}
              </div>
            ))}
            {geo?.source && (
              <div className="text-[10px] text-mute pt-1 border-t border-border/50">
                source: <span className="font-mono">{geo.source}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
