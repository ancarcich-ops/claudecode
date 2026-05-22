"use client";

import { useState } from "react";
import {
  distanceYards,
  type HazardGeo,
  type HoleGeo,
} from "@/lib/course";
import HoleMiniMap, { type Landmark } from "./HoleMiniMap";
import { HolePicker } from "./OnCourseMode";

// "Study mode": read-only hole preview before a round. Shows the same
// satellite canvas as OnCourseMode but anchored at the tee (not GPS) so
// the player can mentally rehearse without being at the course.
//
// Distances rendered: tee -> green center, tee -> each hazard. The aim
// crosshair, score-entry sheet, and Set Pin FAB are all off -- this is
// a planning surface, not a scoring one.

const HAZARD_LABEL: Record<HazardGeo["kind"], string> = {
  WATER: "WATER",
  SAND: "SAND",
  OOB: "OB",
  OTHER: "HAZ",
};

const HAZARD_TONE: Record<HazardGeo["kind"], "white" | "sand" | "water"> = {
  WATER: "water",
  SAND: "sand",
  OOB: "white",
  OTHER: "white",
};

export default function HoleStudyMode({
  holes,
  matchStartingHole = 1,
  startingHole,
  pars,
  scoresByHole,
  holeGeoByHole,
  hazardsByHole,
}: {
  holes: number;
  matchStartingHole?: number;
  startingHole?: number;
  pars: number[];
  scoresByHole?: Record<number, number | null>;
  holeGeoByHole: Record<number, HoleGeo>;
  hazardsByHole: Record<number, HazardGeo[]>;
}) {
  const [active, setActive] = useState(false);
  const firstHole = matchStartingHole;
  const lastHole = matchStartingHole + holes - 1;
  const [hole, setHole] = useState<number>(
    Math.max(firstHole, Math.min(lastHole, startingHole ?? firstHole)),
  );

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="btn btn-ghost w-full sm:w-auto"
      >
        Preview holes →
      </button>
    );
  }

  const par = pars[hole - firstHole] ?? 4;
  const geo = holeGeoByHole[hole];
  const holeHazards = hazardsByHole[hole] ?? [];

  const tee =
    geo?.teeLat != null && geo?.teeLng != null
      ? { lat: geo.teeLat, lng: geo.teeLng }
      : null;
  const greenCenter =
    geo?.greenLat != null && geo?.greenLng != null
      ? { lat: geo.greenLat, lng: geo.greenLng }
      : null;
  const greenFront =
    geo?.greenFrontLat != null && geo?.greenFrontLng != null
      ? { lat: geo.greenFrontLat, lng: geo.greenFrontLng }
      : null;
  const greenBack =
    geo?.greenBackLat != null && geo?.greenBackLng != null
      ? { lat: geo.greenBackLat, lng: geo.greenBackLng }
      : null;
  const teeToGreen =
    tee && greenCenter ? Math.round(distanceYards(tee, greenCenter)) : null;

  // Distance pills from the tee. Prefer the stored yardage on geo when
  // it's there (matches the scorecard), else fall back to the great-
  // circle calc -- both are roughly equivalent.
  const displayYards = geo?.distanceYds ?? teeToGreen;

  // Build landmark pills: green center (anchor) + every hazard with
  // its tee-to-hazard yardage. Carries are easier to imagine when the
  // pill sits over the hazard itself.
  const landmarks: Landmark[] = [];
  if (greenCenter && teeToGreen != null) {
    landmarks.push({
      id: "green-center",
      lat: greenCenter.lat,
      lng: greenCenter.lng,
      prefix: "PIN",
      yds: teeToGreen,
      orientation: "below",
      variant: "accent",
      tone: "white",
    });
  }
  for (const h of holeHazards) {
    if (!tee) break;
    landmarks.push({
      id: `hz-${h.id}`,
      lat: h.lat,
      lng: h.lng,
      prefix: HAZARD_LABEL[h.kind],
      yds: Math.round(distanceYards(tee, h)),
      variant: "tiny",
      tone: HAZARD_TONE[h.kind],
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col overflow-hidden overscroll-contain text-ink">
      {/* Map (full background). Anchor "player" at the tee so the
          bbox + projection behave the same as the live on-course view,
          but no real GPS is used. */}
      <div className="absolute inset-0 z-[10]">
        {tee || greenCenter ? (
          <HoleMiniMap
            player={null}
            tee={tee}
            greenCenter={greenCenter}
            greenFront={greenFront}
            greenBack={greenBack}
            greenPolygon={geo?.greenPolygon ?? null}
            hazards={holeHazards.map((h) => ({
              id: h.id,
              kind: h.kind,
              lat: h.lat,
              lng: h.lng,
            }))}
            landmarks={landmarks}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-mute text-sm px-6 text-center">
            Hole {hole} hasn&rsquo;t been mapped yet.
          </div>
        )}
      </div>

      {/* Top scrim + hole picker + sub-header (par / yardage). */}
      <div
        className="absolute inset-x-0 top-0 z-[30] pt-[max(env(safe-area-inset-top),12px)] pb-2"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 100%)",
        }}
      >
        <HolePicker
          firstHole={firstHole}
          lastHole={lastHole}
          activeHole={hole}
          pars={pars}
          scoresByHole={scoresByHole ?? {}}
          onPick={setHole}
        />
        <div className="mt-2 px-4 text-center font-mono tabular-nums text-[11.5px] tracking-[0.14em] uppercase text-white/78">
          PAR {par}
          <span className="text-white/35"> · </span>
          {displayYards != null ? (
            <>
              {displayYards}
              <span className="text-white/55">Y</span>
            </>
          ) : (
            <span className="text-gold">UNMAPPED</span>
          )}
          <span className="text-white/35"> · </span>
          <span className="text-white/55">PREVIEW</span>
        </div>
      </div>

      {/* Exit (top-left, sits over the scrim) */}
      <button
        type="button"
        onClick={() => setActive(false)}
        className="absolute z-[31] top-[max(env(safe-area-inset-top),12px)] left-3 inline-flex items-center justify-center h-9 w-9 rounded-full bg-bg/70 backdrop-blur-md border border-white/8 text-mute hover:text-ink"
        aria-label="Exit preview"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <line x1="3" y1="3" x2="13" y2="13" />
          <line x1="13" y1="3" x2="3" y2="13" />
        </svg>
      </button>
    </div>
  );
}
