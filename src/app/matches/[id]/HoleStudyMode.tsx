"use client";

import { useMemo, useState } from "react";
import {
  deriveGreenDistances,
  distanceYards,
  type HazardGeo,
  type HoleGeo,
} from "@/lib/course";
import HoleMiniMap, { type Landmark } from "./HoleMiniMap";
import { HolePicker, WindDial } from "./OnCourseMode";

// "Study mode": read-only hole preview before / between rounds. Mirrors
// the on-course view almost verbatim, but anchors the player marker at
// the tee instead of using GPS. Same satellite, same hole picker, same
// hazard distance pills, same wind dial. No score sheet, no aim, no
// FAB -- this is a planning surface, not a scoring one.

export default function HoleStudyMode({
  holes,
  matchStartingHole = 1,
  startingHole,
  pars,
  scoresByHole,
  holeGeoByHole,
  hazardsByHole,
  wind,
}: {
  holes: number;
  matchStartingHole?: number;
  startingHole?: number;
  pars: number[];
  scoresByHole?: Record<number, number | null>;
  holeGeoByHole: Record<number, HoleGeo>;
  hazardsByHole: Record<number, HazardGeo[]>;
  wind?: { speedMph: number; fromDeg: number } | null;
}) {
  const [active, setActive] = useState(false);
  const firstHole = matchStartingHole;
  const lastHole = matchStartingHole + holes - 1;
  const [hole, setHole] = useState<number>(
    Math.max(firstHole, Math.min(lastHole, startingHole ?? firstHole)),
  );

  const par = pars[hole - firstHole] ?? 4;
  const geo = holeGeoByHole[hole];
  const greenSet = !!(geo && geo.greenLat != null && geo.greenLng != null);
  const teeSet = !!(geo && geo.teeLat != null && geo.teeLng != null);

  const tee = useMemo(
    () =>
      geo?.teeLat != null && geo?.teeLng != null
        ? { lat: geo.teeLat, lng: geo.teeLng }
        : null,
    [geo?.teeLat, geo?.teeLng],
  );
  const greenCenter = useMemo(
    () =>
      geo?.greenLat != null && geo?.greenLng != null
        ? { lat: geo.greenLat, lng: geo.greenLng }
        : null,
    [geo?.greenLat, geo?.greenLng],
  );
  const greenFront = useMemo(
    () =>
      geo?.greenFrontLat != null && geo?.greenFrontLng != null
        ? { lat: geo.greenFrontLat, lng: geo.greenFrontLng }
        : null,
    [geo?.greenFrontLat, geo?.greenFrontLng],
  );
  const greenBack = useMemo(
    () =>
      geo?.greenBackLat != null && geo?.greenBackLng != null
        ? { lat: geo.greenBackLat, lng: geo.greenBackLng }
        : null,
    [geo?.greenBackLat, geo?.greenBackLng],
  );

  // Anchor: prefer tee; fall back to green so the canvas still has
  // something to project against on courses that only have green pins.
  const anchor = tee ?? greenCenter;

  // Distances FROM the anchor, mirroring OnCourseMode's derivation.
  const { front, center, back } = deriveGreenDistances(anchor, geo ?? null);
  const headlineYds = geo?.distanceYds ?? center ?? null;

  // Hazards decorated with carry distance from the anchor. Sorted near->far.
  const holeHazards = (hazardsByHole[hole] ?? [])
    .map((h) => ({
      ...h,
      distance: anchor
        ? Math.round(distanceYards(anchor, { lat: h.lat, lng: h.lng }))
        : null,
    }))
    .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));

  // Landmarks: green-center "PIN" (headline), front-of-green "F" if
  // available + distinct, plus EVERY hazard as a small kind+carry pill.
  // Preview suppresses the colored hazard circles (passed empty below)
  // so the satellite stays clean -- labels alone carry the meaning.
  const landmarks: Landmark[] = [];
  if (greenCenter && center != null) {
    landmarks.push({
      id: "pin",
      lat: greenCenter.lat,
      lng: greenCenter.lng,
      prefix: "PIN",
      yds: center,
      orientation: "below",
      variant: "accent",
    });
  }
  if (greenFront && front != null) {
    landmarks.push({
      id: "front",
      lat: greenFront.lat,
      lng: greenFront.lng,
      prefix: "F",
      yds: front,
      orientation: "below",
    });
  }
  for (const h of holeHazards) {
    if (h.distance == null) continue;
    landmarks.push({
      id: `hz-${h.id}`,
      lat: h.lat,
      lng: h.lng,
      prefix:
        h.kind === "WATER"
          ? "H₂O"
          : h.kind === "SAND"
            ? "BNK"
            : h.kind === "OOB"
              ? "OB"
              : "HAZ",
      yds: h.distance,
      variant: "tiny",
      tone: h.kind === "WATER" ? "water" : h.kind === "SAND" ? "sand" : "white",
      orientation: "above",
    });
  }

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

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col overflow-hidden overscroll-contain text-ink">
      {/* Map (full background). Player marker anchored at the tee --
          so the GPS dot sits on the tee box and every distance reads
          tee-to-target. */}
      <div className="absolute inset-0 z-[10]">
        {anchor ? (
          <HoleMiniMap
            player={anchor}
            tee={tee}
            greenCenter={greenCenter}
            greenFront={greenFront}
            greenBack={greenBack}
            greenPolygon={geo?.greenPolygon ?? null}
            hazards={[]}
            landmarks={landmarks}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-mute text-sm px-6 text-center">
            Hole {hole} hasn&rsquo;t been mapped yet.
          </div>
        )}
      </div>

      {/* Top scrim + hole picker + sub-header */}
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
          {headlineYds != null ? (
            <>
              {Math.round(headlineYds)}
              <span className="text-white/55">Y</span>
            </>
          ) : !greenSet ? (
            <span className="text-gold">UNMAPPED</span>
          ) : (
            <span className="text-white/55">— Y</span>
          )}
          <span className="text-white/35"> · </span>
          <span className="text-accent/85">
            {teeSet ? "FROM TEE" : "PREVIEW"}
          </span>
        </div>
      </div>

      {/* Exit (top-left) */}
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

      {/* Wind dial (top-right) -- same as OnCourseMode. Useful pre-
          round even though it's a forecast snapshot. */}
      <WindDial
        speedMph={wind?.speedMph ?? 8}
        fromDeg={wind?.fromDeg ?? 220}
        breeze={false}
      />

      {/* Bottom hazard summary card. Shows tee-to-{front/center/back}
          + each hazard with carry. Compact and read-only. */}
      <div
        className="absolute inset-x-0 bottom-0 z-[30] pt-5 pb-[max(env(safe-area-inset-bottom),18px)] px-4"
        style={{
          background:
            "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 100%)",
        }}
      >
        <div className="max-w-md mx-auto rounded-xl bg-bg/75 backdrop-blur-md border border-white/8 p-3">
          <div className="grid grid-cols-3 gap-2 text-center mb-2">
            <DistStat label="Front" yds={front} />
            <DistStat label="Center" yds={center} accent />
            <DistStat label="Back" yds={back} />
          </div>
          {holeHazards.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/8">
              {holeHazards.map((h) => (
                <div
                  key={h.id}
                  className={
                    "px-2 py-[3px] rounded-full text-[10.5px] font-mono tabular-nums " +
                    (h.kind === "WATER"
                      ? "bg-[#1e3a5f]/85 text-[#bcd6f0]"
                      : h.kind === "SAND"
                        ? "bg-[#3a2d10]/85 text-[#e8d59d]"
                        : "bg-white/10 text-white/85")
                  }
                  title={h.label ?? h.kind}
                >
                  <span className="opacity-65 mr-1">
                    {h.kind === "WATER"
                      ? "WATER"
                      : h.kind === "SAND"
                        ? "SAND"
                        : h.kind === "OOB"
                          ? "OB"
                          : "HAZ"}
                  </span>
                  {h.distance != null ? `${h.distance}y` : "—"}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-[10px] uppercase tracking-wider text-mute pt-2 border-t border-white/8">
              No hazards mapped on this hole
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DistStat({
  label,
  yds,
  accent,
}: {
  label: string;
  yds: number | null;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-white/55">
        {label}
      </div>
      <div
        className={
          "font-mono tabular-nums leading-none mt-0.5 " +
          (accent ? "text-accent text-[26px]" : "text-white/90 text-[20px]")
        }
      >
        {yds != null ? Math.round(yds) : "—"}
        <span className="text-white/45 text-[12px] ml-0.5">y</span>
      </div>
    </div>
  );
}
