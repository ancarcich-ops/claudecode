"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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

export default function OnCourseMode({
  matchId,
  courseName,
  holes,
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
  const [hole, setHole] = useState<number>(
    Math.max(1, Math.min(holes, startingHole)),
  );
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

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

  const par = pars[hole - 1] ?? 4;
  const geo = holeGeoByHole[hole];
  const greenSet = geo && geo.greenLat != null && geo.greenLng != null;
  const playerPos = pos
    ? { lat: pos.coords.latitude, lng: pos.coords.longitude }
    : null;
  const { front, center, back } = deriveGreenDistances(playerPos, geo ?? null);
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
      if (hole < holes) setHole(hole + 1);
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

  return (
    <div className="fixed inset-0 z-40 bg-bg flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-mute">
            On course
          </div>
          <div className="font-medium truncate">{courseName}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {wind && (
            <WindArrow fromDeg={wind.fromDeg} speedMph={wind.speedMph} />
          )}
          <button
            type="button"
            onClick={() => setActive(false)}
            className="btn btn-ghost text-xs"
          >
            Exit
          </button>
        </div>
      </div>

      {/* Hole header + nav */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <button
          type="button"
          onClick={() => setHole(Math.max(1, hole - 1))}
          disabled={hole === 1 || pending}
          className="btn btn-ghost h-9 w-9 px-0 disabled:opacity-30"
          aria-label="Previous hole"
        >
          ←
        </button>
        <div className="text-center">
          <div className="font-display text-2xl font-semibold tracking-tight">
            Hole {hole}
          </div>
          <div className="text-[11px] text-mute">Par {par}</div>
        </div>
        <button
          type="button"
          onClick={() => setHole(Math.min(holes, hole + 1))}
          disabled={hole === holes || pending}
          className="btn btn-ghost h-9 w-9 px-0 disabled:opacity-30"
          aria-label="Next hole"
        >
          →
        </button>
      </div>

      {/* Distance hero */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center relative">
        {/* Mini-map -- shows whatever points are known. Hidden when too
            sparse (fewer than 2 points) to render meaningfully. */}
        {playerPos && greenSet && (
          <div className="absolute top-3 right-3 w-24 h-24 sm:w-32 sm:h-32 rounded-md border border-border bg-panel2/60 overflow-hidden">
            <HoleMiniMap
              player={playerPos}
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
              hazards={holeHazards.map((h) => ({
                id: h.id,
                kind: h.kind,
                lat: h.lat,
                lng: h.lng,
              }))}
            />
          </div>
        )}
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
          ) : !pos ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-mute text-sm"
            >
              Locking on…
            </motion.div>
          ) : !greenSet ? (
            <motion.div
              key="unmapped"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="text-mute text-sm max-w-xs">
                This hole isn&apos;t mapped yet. When you&apos;re standing on
                the green, tap below to drop the pin for everyone after you.
              </div>
              <button
                type="button"
                onClick={() => markGreen("center")}
                disabled={pending}
                className="btn btn-primary"
              >
                Mark green here
              </button>
              {accuracyYd != null && (
                <div className="text-[10px] text-mute">
                  GPS accuracy ± {accuracyYd}y
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={`d-${center}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="space-y-3"
            >
              <div className="text-[10px] uppercase tracking-wider text-mute">
                To green
              </div>
              <div className="flex items-baseline justify-center gap-4 sm:gap-6">
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wider text-mute">
                    Front
                  </div>
                  <div className="font-display text-3xl sm:text-4xl font-semibold tabular-nums text-ink">
                    {front != null ? Math.round(front) : "—"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wider text-accent">
                    Center
                  </div>
                  <div className="font-display text-6xl sm:text-7xl font-bold tabular-nums text-accent">
                    {center != null ? Math.round(center) : "—"}
                    <span className="text-2xl text-mute font-normal ml-1">y</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wider text-mute">
                    Back
                  </div>
                  <div className="font-display text-3xl sm:text-4xl font-semibold tabular-nums text-ink">
                    {back != null ? Math.round(back) : "—"}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-[10px] text-mute">
                {(!frontMarked || !backMarked) && (
                  <>
                    <span>
                      {!frontMarked && !backMarked
                        ? "Front / back estimated"
                        : !frontMarked
                          ? "Front estimated"
                          : "Back estimated"}
                    </span>
                    <span aria-hidden>·</span>
                  </>
                )}
                {accuracyYd != null && <span>± {accuracyYd}y GPS</span>}
              </div>
              {(!frontMarked || !backMarked) && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  {!frontMarked && (
                    <button
                      type="button"
                      onClick={() => markGreen("front")}
                      disabled={pending}
                      className="btn btn-ghost text-[11px]"
                    >
                      Mark front here
                    </button>
                  )}
                  {!backMarked && (
                    <button
                      type="button"
                      onClick={() => markGreen("back")}
                      disabled={pending}
                      className="btn btn-ghost text-[11px]"
                    >
                      Mark back here
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hazards on this hole */}
      {pos && (holeHazards.length > 0 || greenSet) && (
        <div className="border-t border-border px-4 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-wider text-mute">
              Hazards
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
          {holeHazards.length === 0 ? (
            <div className="text-[11px] text-mute">
              None marked. Drop a pin if you spot one for the next round.
            </div>
          ) : (
            <ul className="space-y-1">
              {holeHazards.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <HazardChip kind={h.kind} />
                    <span className="text-mute text-xs truncate">
                      {h.label ?? labelForKind(h.kind)}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-xs shrink-0">
                    <span className="text-ink">
                      {h.distance != null ? Math.round(h.distance) : "—"}y
                    </span>
                    {h.layup != null && (
                      <span className="text-mute">
                        {" · lay "}
                        <span className="text-accent">{Math.round(h.layup)}y</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeHazard(h.id)}
                      disabled={pending}
                      aria-label="Remove hazard"
                      className="ml-2 text-mute hover:text-danger"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Score entry (only if user is linked to a seat) */}
      {myMatchPlayerId && (
        <div className="border-t border-border p-3">
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
