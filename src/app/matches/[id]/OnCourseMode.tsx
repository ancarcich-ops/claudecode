"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { distanceYards, type HoleGeo } from "@/lib/course";
import { logScoreAction, markGreenCenterAction } from "@/lib/actions";

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

export default function OnCourseMode({
  matchId,
  courseName,
  holes,
  startingHole,
  pars,
  players,
  holeGeoByHole,
  myMatchPlayerId,
}: {
  matchId: string;
  courseName: string;
  holes: number;
  startingHole: number;
  pars: number[];
  players: Player[];
  holeGeoByHole: Record<number, HoleGeo>;
  // When the signed-in user is also a linked player in this match,
  // this is their seat id so we can log their own score in one tap.
  myMatchPlayerId: string | null;
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
  const distance =
    greenSet && pos
      ? Math.round(
          distanceYards(
            { lat: pos.coords.latitude, lng: pos.coords.longitude },
            { lat: geo.greenLat as number, lng: geo.greenLng as number },
          ),
        )
      : null;
  const accuracyYd =
    pos != null ? Math.round(pos.coords.accuracy * 1.0936133) : null;

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

  const markGreen = () => {
    if (!pos) return;
    const fd = new FormData();
    fd.set("courseName", courseName);
    fd.set("hole", String(hole));
    fd.set("lat", String(pos.coords.latitude));
    fd.set("lng", String(pos.coords.longitude));
    startTransition(async () => {
      await markGreenCenterAction(fd);
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-40 bg-bg flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-mute">
            On course
          </div>
          <div className="font-medium truncate">{courseName}</div>
        </div>
        <button
          type="button"
          onClick={() => setActive(false)}
          className="btn btn-ghost text-xs"
        >
          Exit
        </button>
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
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
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
                onClick={markGreen}
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
              key={`d-${distance}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="space-y-2"
            >
              <div className="text-[10px] uppercase tracking-wider text-mute">
                To green center
              </div>
              <div className="font-display text-7xl sm:text-8xl font-bold tracking-tight tabular-nums text-accent">
                {distance}
                <span className="text-3xl text-mute font-normal ml-1">y</span>
              </div>
              {accuracyYd != null && (
                <div className="text-[10px] text-mute">
                  GPS accuracy ± {accuracyYd}y
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
