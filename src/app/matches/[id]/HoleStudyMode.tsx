"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deriveGreenDistances,
  distanceYards,
  type HazardGeo,
  type HoleGeo,
} from "@/lib/course";
import HoleMiniMap, { type Landmark } from "./HoleMiniMap";
import HolePreview3D from "@/components/HolePreview3D";
import { useMapEngine } from "./useMapEngine";
import { HoleRail, HeaderBand, WindTile } from "./OnCourseMode";

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
  launcherLabel = "Preview holes →",
  launcherClassName = "btn btn-ghost w-full sm:w-auto",
}: {
  holes: number;
  matchStartingHole?: number;
  startingHole?: number;
  pars: number[];
  scoresByHole?: Record<number, number | null>;
  holeGeoByHole: Record<number, HoleGeo>;
  hazardsByHole: Record<number, HazardGeo[]>;
  wind?: { speedMph: number; fromDeg: number } | null;
  // Inactive-state launcher overrides. Lets the scoring view's
  // pre-round CTA take over the styling + label.
  launcherLabel?: string;
  launcherClassName?: string;
}) {
  const [active, setActive] = useState(false);
  // 2D (existing satellite mini-map) vs 3D (Google photorealistic mesh
  // + cinematic camera). Defaults to 2D so existing users see no
  // change; opt-in via the pill in the bottom-right HUD. Reset when
  // the user switches holes so each tap re-plays the 3D intro.
  const [mode3d, setMode3d] = useState(false);
  const firstHole = matchStartingHole;
  const lastHole = matchStartingHole + holes - 1;
  const [hole, setHole] = useState<number>(
    Math.max(firstHole, Math.min(lastHole, startingHole ?? firstHole)),
  );
  // Aim point: a single lat/lng the player has dropped on the map to
  // plan a layup / target line. Cleared automatically when the active
  // hole changes -- aim is per-hole, not global.
  const [aimPoint, setAimPoint] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  // Aim is per-hole. Clear it when the user switches holes so a layup
  // pin from hole 6 doesn't carry over to hole 7's satellite.
  useEffect(() => {
    setAimPoint(null);
  }, [hole]);

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

  // Map engine toggle. URL `?map=gl` activates the Mapbox GL JS
  // path; persists via localStorage. Default stays on the static
  // tile path until GL has feature parity (aim, calibration, etc.).
  const mapEngine = useMapEngine();

  // Distances FROM the anchor, mirroring OnCourseMode's derivation.
  const { front, center, back } = deriveGreenDistances(anchor, geo ?? null);
  const headlineYds = geo?.distanceYds ?? center ?? null;

  // Aim distances. Anchored at the same point the player marker sits.
  const toAimYds =
    anchor && aimPoint ? distanceYards(anchor, aimPoint) : null;
  const aimToPinYds =
    aimPoint && greenCenter ? distanceYards(aimPoint, greenCenter) : null;

  // Hazards decorated with carry distance from the anchor. Sorted near->far.
  const holeHazards = (hazardsByHole[hole] ?? [])
    .map((h) => ({
      ...h,
      distance: anchor
        ? Math.round(distanceYards(anchor, { lat: h.lat, lng: h.lng }))
        : null,
    }))
    .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));

  // Landmarks: bone-cream PIN chip on the green, tan/cool hazard chips
  // on bunkers/water with their CARRY distance, and a forest AIM pill
  // when the player has dropped one. FRONT/BACK live in the bottom
  // panel under System B -- not on the map -- so the satellite reads
  // clean.
  const landmarks: Landmark[] = [];
  if (greenCenter && center != null) {
    landmarks.push({
      id: "pin",
      lat: greenCenter.lat,
      lng: greenCenter.lng,
      prefix: "PIN",
      yds: center,
      orientation: "below",
      variant: "default",
      tone: "white",
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
      dim: aimPoint != null,
    });
  }
  if (aimPoint && toAimYds != null) {
    landmarks.push({
      id: "aim",
      lat: aimPoint.lat,
      lng: aimPoint.lng,
      prefix: "AIM",
      yds: Math.round(toAimYds),
      variant: "accent",
      orientation: "above",
    });
  }

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className={launcherClassName}
      >
        {launcherLabel}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col overflow-hidden overscroll-contain text-ink">
      {/* Map (full background). 2D = the satellite mini-map with hazard
          pills + tap-to-aim. 3D = Google's photorealistic mesh with a
          cinematic intro flyover (terrain, tree height, slope). The
          3D view needs both tee + green coords to compute the camera
          path, so it's only offered when the hole is fully mapped. */}
      <div className="absolute inset-0 z-[10]">
        {mode3d && tee && greenCenter ? (
          <HolePreview3D
            hole={{
              teeLat: tee.lat,
              teeLng: tee.lng,
              greenLat: greenCenter.lat,
              greenLng: greenCenter.lng,
              number: hole,
              par,
              yards: headlineYds != null ? Math.round(headlineYds) : undefined,
            }}
            height="100%"
            onRequest2D={() => setMode3d(false)}
          />
        ) : anchor ? (
          <HoleMiniMap
            engine={mapEngine}
            player={anchor}
            tee={tee}
            greenCenter={greenCenter}
            greenFront={greenFront}
            greenBack={greenBack}
            greenPolygon={geo?.greenPolygon ?? null}
            hazards={[]}
            aim={aimPoint}
            onAim={(p) => setAimPoint(p)}
            landmarks={landmarks}
            // Preview bottom panel (distance card + hint line) is
            // ~130px tall, so the seg control floats at 140 to clear
            // it cleanly. Smaller than on-course because there's no
            // ENTER SCORE button.
            chipsBottomOffsetPx={140}
            // 3D mode switcher lives in the preset-chip row. Only
            // supplied when the same guards used by the old
            // standalone pill hold (tee + green coords + API key);
            // when absent the row renders 3 chips instead of 4.
            onToggle3D={
              tee &&
              greenCenter &&
              process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                ? () => setMode3d(true)
                : undefined
            }
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-mute text-sm px-6 text-center">
            Hole {hole} hasn&rsquo;t been mapped yet.
          </div>
        )}
      </div>

      {/* Soft baked scrims (System B) -- low-opacity top + bottom
          washes so dark-ink chrome reads against the bright satellite.
          Hidden in 3D mode (HolePreview3D paints its own HUD). */}
      {!mode3d && (
        <>
          <div
            className="absolute inset-x-0 top-0 h-[150px] z-[15] pointer-events-none"
            style={{ background: "rgba(0,0,0,0.10)" }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-[200px] z-[15] pointer-events-none"
            style={{ background: "rgba(0,0,0,0.14)" }}
          />
        </>
      )}

      {/* System B chrome -- hidden in 3D mode so HolePreview3D's free
          orbit + own HUD aren't obscured. */}
      {!mode3d && (
        <>
          {/* Top: slim hole rail (active = forest "VIEW") + dedicated
              header band with the forest "FROM TEE" tag. */}
          <div className="absolute inset-x-0 top-0 z-[30] pt-[max(env(safe-area-inset-top),12px)] px-3">
            <HoleRail
              firstHole={firstHole}
              lastHole={lastHole}
              activeHole={hole}
              pars={pars}
              scoresByHole={scoresByHole ?? {}}
              onPick={setHole}
              onExit={() => setActive(false)}
              activeLabel="VIEW"
            />
            <div className="mt-2 flex justify-center">
              <HeaderBand
                hole={hole}
                par={par}
                yardage={headlineYds != null ? Math.round(headlineYds) : null}
                unmapped={!greenSet}
                trailing={teeSet ? "FROM TEE" : "PREVIEW"}
              />
            </div>
          </div>

          {/* Right control stack -- wind only on the preview (no MOVE
              PIN; tap-to-aim still works on the satellite directly). */}
          <div className="absolute z-[24] right-3 top-[172px] flex flex-col gap-2.5 items-center">
            <WindTile
              speedMph={wind?.speedMph ?? 8}
              fromDeg={wind?.fromDeg ?? 220}
              breeze={aimPoint != null}
            />
          </div>

          {/* Bottom panel -- TO GREEN · CENTER dominant + FRONT/BACK
              secondary, OR aim-mode TO AIM/TO PIN. Tap-for-custom-aim
              hint sits as a quiet mono line below the panel. */}
          <div className="absolute inset-x-0 bottom-0 z-[32] px-3 pt-3 pb-[max(env(safe-area-inset-bottom),14px)] flex flex-col gap-2">
            {aimPoint && toAimYds != null ? (
              <PreviewAimPanel
                toAim={toAimYds}
                toPin={aimToPinYds}
                onClear={() => setAimPoint(null)}
              />
            ) : (
              <PreviewDistancePanel
                center={center}
                front={front}
                back={back}
                unmapped={!greenSet}
              />
            )}
            <div className="text-center font-mono text-[9.5px] tracking-[0.1em] uppercase font-semibold pt-0.5"
                 style={{ color: "var(--map-mute)" }}>
              Tap the course for custom aim distances
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Bone-cream distance panel for the preview view. Dominant TO GREEN ·
// CENTER serif number, with FRONT / BACK stacked as a secondary pair
// on the right. Unmapped state shows neutral em-dashes.
function PreviewDistancePanel({
  center,
  front,
  back,
  unmapped,
}: {
  center: number | null;
  front: number | null;
  back: number | null;
  unmapped: boolean;
}) {
  return (
    <div className="map-chip rounded-[18px] p-[14px_16px] flex items-stretch gap-3.5">
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] tracking-[0.1em] uppercase font-semibold"
             style={{ color: "var(--map-mute)" }}>
          {unmapped ? "GREEN NEEDED" : "TO GREEN · CENTER"}
        </div>
        <div className="font-display font-bold tabular-nums leading-none mt-1 flex items-baseline gap-0.5"
             style={{ color: "var(--map-ink)" }}>
          {unmapped || center == null ? (
            <span className="text-[28px] leading-none" style={{ color: "var(--map-mute)" }}>—</span>
          ) : (
            <>
              <span className="text-[52px] leading-[0.9]">{Math.round(center)}</span>
              <span className="text-[18px] ml-0.5" style={{ color: "var(--map-mute)" }}>y</span>
            </>
          )}
        </div>
      </div>
      <div className="self-stretch w-px" style={{ background: "var(--chip-line)" }} />
      <div className="flex flex-col gap-2 min-w-[78px]">
        <PreviewSecondary label="FRONT" value={front != null ? Math.round(front) : null} />
        <PreviewSecondary label="BACK" value={back != null ? Math.round(back) : null} />
      </div>
    </div>
  );
}

function PreviewAimPanel({
  toAim,
  toPin,
  onClear,
}: {
  toAim: number;
  toPin: number | null;
  onClear: () => void;
}) {
  return (
    <div className="map-chip rounded-[18px] p-[14px_16px] flex items-stretch gap-3.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="font-mono text-[10px] tracking-[0.1em] uppercase font-semibold"
               style={{ color: "var(--mint)" }}>
            TO AIM
          </div>
          <button
            type="button"
            onClick={onClear}
            className="font-mono text-[9px] tracking-[0.12em] uppercase font-semibold active:opacity-70"
            style={{ color: "var(--map-mute)" }}
          >
            CLEAR
          </button>
        </div>
        <div className="font-display font-bold tabular-nums leading-none mt-1 flex items-baseline gap-0.5"
             style={{ color: "var(--mint)" }}>
          <span className="text-[52px] leading-[0.9]">{Math.round(toAim)}</span>
          <span className="text-[18px] ml-0.5" style={{ color: "var(--map-mute)" }}>y</span>
        </div>
      </div>
      <div className="self-stretch w-px" style={{ background: "var(--chip-line)" }} />
      <div className="flex flex-col justify-center min-w-[78px]">
        <PreviewSecondary
          label="TO PIN"
          value={toPin != null ? Math.round(toPin) : null}
        />
      </div>
    </div>
  );
}

function PreviewSecondary({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-px">
      <div className="font-mono text-[8.5px] tracking-[0.08em] uppercase font-semibold"
           style={{ color: "var(--map-mute)" }}>
        {label}
      </div>
      <div className="font-display font-bold tabular-nums leading-none flex items-baseline gap-px"
           style={{ color: "var(--map-ink)" }}>
        {value == null ? (
          <span className="text-[18px]" style={{ color: "var(--map-mute)" }}>—</span>
        ) : (
          <>
            <span className="text-[22px]">{value}</span>
            <span className="text-[11px]" style={{ color: "var(--map-mute)" }}>y</span>
          </>
        )}
      </div>
    </div>
  );
}
