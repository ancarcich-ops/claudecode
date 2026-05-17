"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  deriveGreenDistances,
  distanceToLayup,
  distanceYards,
  type HazardGeo,
  type HoleGeo,
} from "@/lib/course";
import {
  deleteHazardAction,
  logScoreAction,
  markGreenCenterAction,
  markHazardAction,
  markTeeAction,
} from "@/lib/actions";
import HoleMiniMap from "./HoleMiniMap";
import WindArrow from "./WindArrow";

// Mobile-first "on the course" view. Replaces the full match-detail UI
// when active. Tracks the user's GPS, computes distance to the current
// hole's green center, lets them log a score in one tap and advance to
// the next hole. Falls back to a "mark this green" flow when the hole
// hasn't been mapped yet -- the first user at a course builds the
// dataset for the next one.
//
// Activation: tap "Start on-course" on the match detail page. Stays
// active until "Exit" is tapped or the page navigates away.
//
// GPS lifecycle:
//   - watchPosition fires continuously while active
//   - paused when the tab is backgrounded (we re-prime on visibility)
//   - errors render as a friendly "GPS not available" hint, not a crash

type Player = { id: string; displayName: string };

function labelForKind(kind: "WATER" | "SAND" | "OOB" | "OTHER"): string {
  switch (kind) {
    case "WATER":
      return "Water";
    case "SAND":
      return "Bunker";
    case "OOB":
      return "OB";
    default:
      return "Hazard";
  }
}

function HazardChip({
  kind,
}: {
  kind: "WATER" | "SAND" | "OOB" | "OTHER";
}) {
  const tone = {
    WATER: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    SAND: "bg-gold/10 text-gold border-gold/30",
    OOB: "bg-danger/10 text-danger border-danger/30",
    OTHER: "bg-panel2 text-mute border-border",
  }[kind];
  return (
    <span
      className={
        "inline-block w-2 h-2 rounded-full border " + tone
      }
      aria-label={labelForKind(kind)}
    />
  );
}

function HazardMarkButton({
  kind,
  onClick,
  disabled,
}: {
  kind: "WATER" | "SAND" | "OOB";
  onClick: () => void;
  disabled: boolean;
}) {
  const label = {
    WATER: "+W",
    SAND: "+B",
    OOB: "+OB",
  }[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`Mark ${labelForKind(kind).toLowerCase()} here`}
      className="btn btn-ghost text-[10px] h-6 px-1.5 py-0 disabled:opacity-30"
    >
      {label}
    </button>
  );
}

type DistanceKind =
  | "GREEN_BACK"
  | "GREEN_CENTER"
  | "GREEN_FRONT"
  | "WATER"
  | "SAND"
  | "OOB"
  | "OTHER";

// One row in the distance rail. Big yardage on the left (mono, dense
// like a real GPS readout), label + optional layup yardage on the
// right, color band keyed to feature kind. Removable hazards get the
// existing X affordance.
function DistanceRow({
  row,
}: {
  row: {
    key: string;
    label: string;
    distance: number;
    kind: DistanceKind;
    layup?: number | null;
    onRemove?: () => void;
  };
}) {
  const band = (() => {
    switch (row.kind) {
      case "GREEN_CENTER":
        return "bg-accent";
      case "GREEN_BACK":
      case "GREEN_FRONT":
        return "bg-accent/60";
      case "WATER":
        return "bg-blue-400";
      case "SAND":
        return "bg-gold";
      case "OOB":
        return "bg-danger";
      default:
        return "bg-mute";
    }
  })();
  return (
    <li className="flex items-stretch gap-2.5 py-1.5">
      <span className={"w-0.5 rounded-full shrink-0 " + band} aria-hidden />
      <span className="font-mono tabular-nums text-base text-ink w-12 shrink-0 text-right">
        {Math.round(row.distance)}
        <span className="text-mute text-[10px] ml-0.5">y</span>
      </span>
      <span className="text-sm text-ink truncate flex-1 self-center">
        {row.label}
      </span>
      {row.layup != null && (
        <span className="text-[10px] font-mono text-mute self-center shrink-0">
          lay <span className="text-accent">{Math.round(row.layup)}y</span>
        </span>
      )}
      {row.onRemove && (
        <button
          type="button"
          onClick={row.onRemove}
          aria-label={`Remove ${row.label}`}
          title="Remove"
          className="self-center text-mute hover:text-danger text-sm shrink-0 px-1"
        >
          ×
        </button>
      )}
    </li>
  );
}

export default function OnCourseMode({
  matchId,
  courseName,
  holes,
  matchStartingHole = 1,
  startingHole,
  pars,
  players,
  holeGeoByHole,
  hazardsByHole,
  myMatchPlayerId,
  wind,
}: {
  matchId: string;
  courseName: string;
  holes: number;
  // First hole of the match (1 for full/front-9, 10 for back-9).
  matchStartingHole?: number;
  // Hole to land on when entering on-course mode (next un-logged hole).
  startingHole: number;
  pars: number[];
  players: Player[];
  holeGeoByHole: Record<number, HoleGeo>;
  hazardsByHole: Record<number, HazardGeo[]>;
  // When the signed-in user is also a linked player in this match,
  // this is their seat id so we can log their own score in one tap.
  myMatchPlayerId: string | null;
  // Latest wind reading for the course (or null if not yet known / API
  // unreachable). Fetched server-side from Open-Meteo.
  wind: { speedMph: number; fromDeg: number } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState(false);
  const firstHole = matchStartingHole;
  const lastHole = matchStartingHole + holes - 1;
  const [hole, setHole] = useState<number>(
    Math.max(firstHole, Math.min(lastHole, startingHole)),
  );
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  // Tap-to-aim point per active hole. Reset whenever the user nav's
  // between holes so the aim doesn't carry over.
  const [aimPoint, setAimPoint] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  useEffect(() => {
    setAimPoint(null);
  }, [hole]);

  // Auto-advance: if the player walks toward the next hole's tee
  // (significantly closer than the current hole's green AND inside a
  // ~70 yard ring of that tee), assume they finished + walked to the
  // next box and flip the active hole. The user gets a toast with an
  // Undo so a bad GPS read doesn't strand them mid-hole.
  //
  // Throttled to fire at most once per hole transition by gating on
  // the autoAdvancedRef snapshot.
  const autoAdvancedRef = useRef<number | null>(null);
  useEffect(() => {
    autoAdvancedRef.current = null;
  }, [hole]);

  // Watcher: every GPS tick, compare the player's distance to the
  // current hole's green vs the next hole's tee. If they've drifted
  // well inside the next tee box (and notably further from this
  // green), assume they've walked off to the next hole and flip the
  // active hole. Gated by autoAdvancedRef so we don't bounce.
  useEffect(() => {
    if (!pos) return;
    if (hole >= lastHole) return;
    const nextHole = hole + 1;
    if (autoAdvancedRef.current === nextHole) return;
    const curGeo = holeGeoByHole[hole];
    const nextGeo = holeGeoByHole[nextHole];
    if (!nextGeo || nextGeo.teeLat == null || nextGeo.teeLng == null) return;
    const playerLatLng = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };
    const nextTee = { lat: nextGeo.teeLat, lng: nextGeo.teeLng };
    const dToNextTee = distanceYards(playerLatLng, nextTee);
    // If we don't know the current green, allow advance solely on
    // being inside the next tee ring. If we do know the green,
    // require the next tee be meaningfully closer than the green.
    const curGreen =
      curGeo && curGeo.greenLat != null && curGeo.greenLng != null
        ? { lat: curGeo.greenLat, lng: curGeo.greenLng }
        : null;
    const dToCurGreen = curGreen ? distanceYards(playerLatLng, curGreen) : null;
    const tightRing = dToNextTee < 40; // basically on the next tee
    const wideRing =
      dToNextTee < 100 &&
      dToCurGreen != null &&
      dToNextTee < dToCurGreen * 0.6;
    if (!tightRing && !wideRing) return;
    autoAdvancedRef.current = nextHole;
    const prevHole = hole;
    setHole(nextHole);
    toast.success(`Moved to hole ${nextHole}`, {
      action: {
        label: "Undo",
        onClick: () => setHole(prevHole),
      },
    });
  }, [pos, hole, lastHole, holeGeoByHole]);

  // Start / stop the GPS watcher.
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("GPS not available on this device");
      return;
    }
    setGpsError(null);
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos(p);
        setGpsError(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError("Allow location to see distances");
        } else {
          setGpsError("Trouble reading GPS — moving?");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1500,
        timeout: 10000,
      },
    );
    watchId.current = id;
    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [active]);

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="btn btn-primary w-full sm:w-auto"
      >
        Start on-course →
      </button>
    );
  }

  const par = pars[hole - firstHole] ?? 4;
  const geo = holeGeoByHole[hole];
  const greenSet = geo && geo.greenLat != null && geo.greenLng != null;
  const teeSet = !!(geo && geo.teeLat != null && geo.teeLng != null);
  const playerPos = pos
    ? { lat: pos.coords.latitude, lng: pos.coords.longitude }
    : null;
  const { front, center, back } = deriveGreenDistances(playerPos, geo ?? null);
  // Aim-point distances: player -> aim and aim -> green center. Both
  // hidden until the user has dropped an aim AND we know where the
  // green is.
  const greenCenterLatLng =
    geo?.greenLat != null && geo?.greenLng != null
      ? { lat: geo.greenLat, lng: geo.greenLng }
      : null;
  const toAimYds =
    playerPos && aimPoint ? distanceYards(playerPos, aimPoint) : null;
  const aimToGreenYds =
    aimPoint && greenCenterLatLng
      ? distanceYards(aimPoint, greenCenterLatLng)
      : null;
  const accuracyYd =
    pos != null ? Math.round(pos.coords.accuracy * 1.0936133) : null;
  // Whether the user has actually marked front/back vs them being
  // derived from center ± 8y.
  const frontMarked = !!(geo?.greenFrontLat != null && geo?.greenFrontLng != null);
  const backMarked = !!(geo?.greenBackLat != null && geo?.greenBackLng != null);

  const submitScore = (strokes: number) => {
    if (!myMatchPlayerId) return;
    const fd = new FormData();
    fd.set("matchId", matchId);
    fd.set("matchPlayerId", myMatchPlayerId);
    fd.set("hole", String(hole));
    fd.set("strokes", String(strokes));
    startTransition(async () => {
      await logScoreAction(fd);
      // Auto-advance to next hole if not on the last one.
      if (hole < lastHole) setHole(hole + 1);
      router.refresh();
      try {
        window.dispatchEvent(new CustomEvent("sticks:sound:score"));
      } catch {}
    });
  };

  // Per-hole hazards, decorated with distance from current player position.
  // Sorted by distance asc so the closest threat is on top.
  const holeHazards = (hazardsByHole[hole] ?? [])
    .map((h) => {
      const d = playerPos
        ? distanceYards(playerPos, { lat: h.lat, lng: h.lng })
        : null;
      // Layup distance only meaningful if we know where the green is too.
      const layup =
        playerPos && geo?.greenLat != null && geo?.greenLng != null
          ? distanceToLayup(
              playerPos,
              { lat: geo.greenLat, lng: geo.greenLng },
              { lat: h.lat, lng: h.lng },
            )
          : null;
      return { ...h, distance: d, layup };
    })
    .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));

  const markHazard = (kind: "WATER" | "SAND" | "OOB" | "OTHER") => {
    if (!pos) return;
    const fd = new FormData();
    fd.set("courseName", courseName);
    fd.set("hole", String(hole));
    fd.set("lat", String(pos.coords.latitude));
    fd.set("lng", String(pos.coords.longitude));
    fd.set("kind", kind);
    startTransition(async () => {
      await markHazardAction(fd);
      router.refresh();
    });
  };

  const removeHazard = (id: string) => {
    const fd = new FormData();
    fd.set("hazardId", id);
    startTransition(async () => {
      await deleteHazardAction(fd);
      router.refresh();
    });
  };

  const markGreen = (position: "center" | "front" | "back" = "center") => {
    if (!pos) return;
    const fd = new FormData();
    fd.set("courseName", courseName);
    fd.set("hole", String(hole));
    fd.set("lat", String(pos.coords.latitude));
    fd.set("lng", String(pos.coords.longitude));
    fd.set("position", position);
    startTransition(async () => {
      await markGreenCenterAction(fd);
      router.refresh();
    });
  };

  const markTee = () => {
    if (!pos) return;
    const fd = new FormData();
    fd.set("courseName", courseName);
    fd.set("hole", String(hole));
    fd.set("lat", String(pos.coords.latitude));
    fd.set("lng", String(pos.coords.longitude));
    startTransition(async () => {
      await markTeeAction(fd);
      router.refresh();
    });
  };

  return (
    // overflow-hidden because the new layout fits in the viewport
    // without scrolling -- map flexes to take all remaining space.
    <div className="fixed inset-0 z-50 bg-bg flex flex-col overflow-hidden overscroll-contain">
      {/* Top bar (compact) */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-mute leading-tight">
            On course
          </div>
          <div className="font-medium truncate text-sm leading-tight">
            {courseName}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {wind && (
            <WindArrow fromDeg={wind.fromDeg} speedMph={wind.speedMph} />
          )}
          <button
            type="button"
            onClick={() => setActive(false)}
            className="btn btn-ghost text-xs h-8"
          >
            Exit
          </button>
        </div>
      </div>

      {/* Hole nav (compact, single row) */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border">
        <button
          type="button"
          onClick={() => setHole(Math.max(firstHole, hole - 1))}
          disabled={hole === firstHole || pending}
          className="btn btn-ghost h-8 w-8 px-0 disabled:opacity-30"
          aria-label="Previous hole"
        >
          ←
        </button>
        <div className="font-display text-base font-semibold tracking-tight">
          Hole {hole}{" "}
          <span className="text-mute font-normal text-sm">· Par {par}</span>
        </div>
        <button
          type="button"
          onClick={() => setHole(Math.min(lastHole, hole + 1))}
          disabled={hole === lastHole || pending}
          className="btn btn-ghost h-8 w-8 px-0 disabled:opacity-30"
          aria-label="Next hole"
        >
          →
        </button>
      </div>

      {/* Map hero -- fills all remaining vertical space above the
          distance rail + score buttons. The map itself is the
          rangefinder; yardages, aim controls, and mark-this-here
          actions live as overlays. We render the map whenever we
          have a GPS lock (even on unmapped holes) so the user gets
          satellite context for "where am I right now". */}
      <div className="flex-1 relative bg-panel2/40 min-h-0">
        {playerPos ? (
          <>
            <HoleMiniMap
              player={playerPos}
              tee={
                geo?.teeLat != null && geo?.teeLng != null
                  ? { lat: geo.teeLat, lng: geo.teeLng }
                  : null
              }
              greenCenter={
                geo?.greenLat != null && geo?.greenLng != null
                  ? { lat: geo.greenLat, lng: geo.greenLng }
                  : null
              }
              greenFront={
                geo?.greenFrontLat != null && geo?.greenFrontLng != null
                  ? { lat: geo.greenFrontLat, lng: geo.greenFrontLng }
                  : null
              }
              greenBack={
                geo?.greenBackLat != null && geo?.greenBackLng != null
                  ? { lat: geo.greenBackLat, lng: geo.greenBackLng }
                  : null
              }
              greenPolygon={geo?.greenPolygon ?? null}
              hazards={holeHazards.map((h) => ({
                id: h.id,
                kind: h.kind,
                lat: h.lat,
                lng: h.lng,
              }))}
              aim={aimPoint}
              onAim={(p) => setAimPoint(p)}
            />

            {/* Top-right yardage card. Big center number, with front
                / back sub-numbers underneath. Subtle scrim so the
                numbers stay legible on bright fairway photos. */}
            {greenSet && (
              <div className="absolute top-2 right-2 rounded-lg bg-bg/70 backdrop-blur-md border border-border px-3 py-2 text-right shadow-lg pointer-events-none">
                <div className="text-[9px] uppercase tracking-wider text-mute leading-none">
                  To green
                </div>
                <div className="font-display text-4xl font-bold tabular-nums text-accent leading-none mt-1">
                  {center != null ? Math.round(center) : "—"}
                  <span className="text-base text-mute font-normal ml-0.5">
                    y
                  </span>
                </div>
                <div className="flex items-baseline justify-end gap-2 font-mono tabular-nums text-[10px] text-mute mt-1.5">
                  <span>
                    F{" "}
                    <span className="text-ink">
                      {front != null ? Math.round(front) : "—"}
                    </span>
                  </span>
                  <span>
                    B{" "}
                    <span className="text-ink">
                      {back != null ? Math.round(back) : "—"}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Top-left aim card (only when an aim point is set). */}
            {aimPoint && (toAimYds != null || aimToGreenYds != null) && (
              <div className="absolute top-2 left-2 rounded-lg bg-bg/70 backdrop-blur-md border border-border px-3 py-2 shadow-lg pointer-events-none max-w-[55%]">
                <div className="text-[9px] uppercase tracking-wider text-mute leading-none">
                  To aim
                </div>
                <div className="font-display text-2xl font-bold tabular-nums text-ink leading-none mt-1">
                  {toAimYds != null ? Math.round(toAimYds) : "—"}
                  <span className="text-xs text-mute font-normal ml-0.5">
                    y
                  </span>
                </div>
                {aimToGreenYds != null && (
                  <div className="text-[10px] text-mute font-mono mt-1">
                    +{" "}
                    <span className="text-accent">
                      {Math.round(aimToGreenYds)}y
                    </span>{" "}
                    to green
                  </div>
                )}
              </div>
            )}

            {/* Clear-aim chip (bottom-right) when an aim is set. */}
            {aimPoint && (
              <button
                type="button"
                onClick={() => setAimPoint(null)}
                aria-label="Clear aim point"
                className="absolute bottom-2 right-2 text-[10px] uppercase tracking-wider text-ink bg-bg/70 backdrop-blur-md border border-border rounded-md px-2 py-1 shadow-lg"
              >
                Clear aim
              </button>
            )}

            {/* Bottom-left: mark-more affordances + GPS chip. Stays
                compact; only shows the buttons that are still
                actionable for this hole. */}
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 pointer-events-none">
              <div className="rounded-md bg-bg/70 backdrop-blur-md border border-border px-2 py-1 text-[10px] text-mute font-mono pointer-events-none">
                ± {accuracyYd ?? "?"}y
              </div>
              {(!frontMarked || !backMarked || !teeSet) && (
                <div className="flex items-center gap-1 pointer-events-auto">
                  {!frontMarked && greenSet && (
                    <button
                      type="button"
                      onClick={() => markGreen("front")}
                      disabled={pending}
                      className="btn btn-ghost text-[10px] h-7 px-2 bg-bg/70 backdrop-blur-md border border-border"
                      title="Mark front of green here"
                    >
                      + F
                    </button>
                  )}
                  {!backMarked && greenSet && (
                    <button
                      type="button"
                      onClick={() => markGreen("back")}
                      disabled={pending}
                      className="btn btn-ghost text-[10px] h-7 px-2 bg-bg/70 backdrop-blur-md border border-border"
                      title="Mark back of green here"
                    >
                      + B
                    </button>
                  )}
                  {!teeSet && (
                    <button
                      type="button"
                      onClick={markTee}
                      disabled={pending}
                      className="btn btn-ghost text-[10px] h-7 px-2 bg-bg/70 backdrop-blur-md border border-border"
                      title="Mark tee here"
                    >
                      + Tee
                    </button>
                  )}
                </div>
              )}
            </div>


            {/* Unmapped-hole prompt as an overlay on top of the
                satellite, so the user gets both the "where am I"
                imagery and the call to action. */}
            {!greenSet && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
                <motion.div
                  key="unmapped"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-xl bg-bg/80 backdrop-blur-md border border-border px-4 py-3 text-center space-y-3 shadow-xl pointer-events-auto max-w-xs"
                >
                  <div className="text-ink text-sm">
                    This hole isn&apos;t mapped yet. Drop a pin from the
                    tee or green and it&apos;ll be saved for everyone
                    after you.
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => markGreen("center")}
                      disabled={pending}
                      className="btn btn-primary"
                    >
                      Mark green here
                    </button>
                    {!teeSet && (
                      <button
                        type="button"
                        onClick={markTee}
                        disabled={pending}
                        className="btn btn-ghost"
                      >
                        Mark tee here
                      </button>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </>
        ) : (
          // No GPS lock yet. Centered prompt over the empty hero.
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <AnimatePresence mode="popLayout">
              {gpsError ? (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="text-mute text-sm max-w-xs"
                >
                  {gpsError}
                </motion.div>
              ) : (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-mute text-sm"
                >
                  Locking on…
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Distance rail -- Garmin-style scrollable list of every notable
          feature on this hole, sorted by descending yardage so the
          back-of-green sits at the top and the closest hazard at the
          bottom. Color-coded by type; tap a green chip to mark, tap
          the X on a hazard to remove. */}
      {pos && (holeHazards.length > 0 || greenSet) && (
        <div className="border-t border-border px-4 py-2 max-h-44 flex flex-col">
          <div className="flex items-center justify-between mb-1.5 shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-mute">
              Distances
            </div>
            <div className="flex items-center gap-1">
              <HazardMarkButton
                kind="WATER"
                onClick={() => markHazard("WATER")}
                disabled={pending}
              />
              <HazardMarkButton
                kind="SAND"
                onClick={() => markHazard("SAND")}
                disabled={pending}
              />
              <HazardMarkButton
                kind="OOB"
                onClick={() => markHazard("OOB")}
                disabled={pending}
              />
            </div>
          </div>
          <ul className="space-y-0.5 overflow-y-auto overscroll-contain">
            {(() => {
              type Row = {
                key: string;
                label: string;
                distance: number;
                kind: "GREEN_BACK" | "GREEN_CENTER" | "GREEN_FRONT" | "WATER" | "SAND" | "OOB" | "OTHER";
                layup?: number | null;
                onRemove?: () => void;
              };
              const rows: Row[] = [];
              if (back != null)
                rows.push({
                  key: "g-back",
                  label: "Back edge",
                  distance: back,
                  kind: "GREEN_BACK",
                });
              if (center != null)
                rows.push({
                  key: "g-center",
                  label: "Green center",
                  distance: center,
                  kind: "GREEN_CENTER",
                });
              if (front != null)
                rows.push({
                  key: "g-front",
                  label: "Front edge",
                  distance: front,
                  kind: "GREEN_FRONT",
                });
              for (const h of holeHazards) {
                if (h.distance == null) continue;
                rows.push({
                  key: `hz-${h.id}`,
                  label: h.label ?? labelForKind(h.kind),
                  distance: h.distance,
                  kind: h.kind,
                  layup: h.layup,
                  onRemove: () => removeHazard(h.id),
                });
              }
              rows.sort((a, b) => b.distance - a.distance);
              if (rows.length === 0) {
                return (
                  <li className="text-[11px] text-mute py-1">
                    Mark the green and drop hazard pins to fill this in.
                  </li>
                );
              }
              return rows.map((r) => <DistanceRow key={r.key} row={r} />);
            })()}
          </ul>
        </div>
      )}

      {/* Score entry (only if user is linked to a seat) */}
      {myMatchPlayerId && (
        // pb-[env(safe-area-inset-bottom)] keeps the buttons clear of the
        // iOS home indicator. mt-auto pushes the panel to the bottom of
        // the scroll container when content above is shorter than the
        // viewport.
        <div className="border-t border-border p-3 mt-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="text-[10px] uppercase tracking-wider text-mute text-center mb-2">
            Log your score
          </div>
          <div className="grid grid-cols-9 gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
              const accent = n === par;
              const under = n < par;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={pending}
                  onClick={() => submitScore(n)}
                  className={
                    "py-3 rounded-md font-mono tabular-nums text-base transition-colors " +
                    (accent
                      ? "bg-gold/10 text-gold border border-gold/30"
                      : under
                        ? "bg-accent/10 text-accent border border-accent/30"
                        : "bg-panel2 text-ink border border-border")
                  }
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
