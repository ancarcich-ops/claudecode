"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deriveGreenDistances,
  distanceYards,
  type HazardGeo,
  type HoleGeo,
} from "@/lib/course";
import {
  logScoreAction,
  markGreenCenterAction,
  markTeeAction,
} from "@/lib/actions";
import HoleMiniMap, { type Landmark } from "./HoleMiniMap";
import { useMapEngine } from "./useMapEngine";
import ScoreSheet from "./ScoreSheet";

// "On the course" view. Replaces the match-detail UI when active.
// Tracks the user's GPS, computes distance to the current hole's
// green, lets them tap a yardage / drop an aim point, and log a
// score in one tap. Walk-based auto-advance flips the hole when the
// user crosses a tee-box threshold.
//
// Visual language (post visual pass): the satellite is the canvas.
// Hole picker + sub-header float on a top scrim. The Set Pin FAB +
// wind dial dock the right edge. A single accent CTA pill at the
// bottom opens the score-entry sheet.

type Player = { id: string; displayName: string };

type SheetSelection = {
  strokes: number;
  relative: number;
} | null;

export default function OnCourseMode({
  matchId,
  courseName,
  holes,
  matchStartingHole = 1,
  startingHole,
  pars,
  scoresByHole,
  holeGeoByHole,
  hazardsByHole,
  myMatchPlayerId,
  players,
  wind,
  startMatchAction,
  launcherLabel,
  launcherClassName = "btn btn-primary w-full sm:w-auto disabled:opacity-60",
}: {
  matchId: string;
  courseName: string;
  holes: number;
  matchStartingHole?: number;
  startingHole: number;
  pars: number[];
  // The signed-in player's logged scores keyed by absolute hole number.
  // Drives the hole picker chips ("-1", "+0", etc.). Optional -- the
  // picker degrades to no chips if missing.
  scoresByHole?: Record<number, number | null>;
  holeGeoByHole: Record<number, HoleGeo>;
  hazardsByHole: Record<number, HazardGeo[]>;
  myMatchPlayerId: string | null;
  // All match players plus their already-logged scores. Drives the
  // multi-player score-entry cycle: after the signed-in player logs
  // their score, the sheet cycles to teammates so one person can keep
  // score for the whole group. Optional + defaults to [] -- a missing
  // prop must not crash the on-course mount.
  players?: Array<{
    id: string;
    displayName: string;
    color: string;
    scoresByHole: Record<number, number>;
  }>;
  wind: { speedMph: number; fromDeg: number } | null;
  // When set (pre-round / UPCOMING), tapping the launcher marks the match
  // live before opening the GPS view, so "start the round" is one tap.
  startMatchAction?: (formData: FormData) => Promise<void>;
  // Inactive-state launcher label + className override. Lets the
  // scoring view render the spec's "Resume GPS →" pill in place of
  // the default verbose label.
  launcherLabel?: string;
  launcherClassName?: string;
}) {
  // Normalize the optional prop once so every downstream consumer can
  // treat it as a guaranteed array without re-checking.
  const playerList = players ?? [];
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
  const [aimPoint, setAimPoint] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSelection, setSheetSelection] = useState<SheetSelection>(null);
  // Cycle-through-group preference. "unset" = never been asked; show
  // the prompt after the first save. "enabled" = cycle through every
  // player after each save. "disabled" = log only the signed-in
  // player's score, advance to next hole. Persisted in localStorage.
  const [cyclePref, setCyclePref] = useState<
    "unset" | "enabled" | "disabled"
  >("unset");
  // True for one render after the user just saved their own score and
  // we need to ask the cycling question.
  const [showCyclePrompt, setShowCyclePrompt] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem("sticks-cycle-pref");
      if (v === "enabled" || v === "disabled") setCyclePref(v);
    } catch {
      // private mode / storage blocked -- fall through, behave as unset.
    }
  }, []);
  // Score-entry cycle: signed-in player first, then teammates in match
  // order. Index references positions in cycleOrder below.
  const [cyclePos, setCyclePos] = useState(0);

  // Build the cycle order on every render -- it depends on the player
  // list (stable) and myMatchPlayerId (stable). Signed-in player goes
  // first; everyone else follows in original match order. Empty list
  // returns an empty cycle so downstream `currentEntryPlayer` lookups
  // are safely undefined rather than a crash.
  const cycleOrder = (() => {
    const ordered: typeof playerList = [];
    if (myMatchPlayerId) {
      const me = playerList.find((p) => p.id === myMatchPlayerId);
      if (me) ordered.push(me);
    }
    for (const p of playerList) {
      if (p.id !== myMatchPlayerId) ordered.push(p);
    }
    return ordered;
  })();
  const currentEntryPlayer = cycleOrder[cyclePos];

  useEffect(() => {
    setAimPoint(null);
    setSheetSelection(null);
    setSheetOpen(false);
  }, [hole]);

  // Walk-based auto-advance. Compare player distance to current green
  // vs next hole's tee on every GPS tick; if they've drifted onto the
  // next tee, flip the active hole. autoAdvancedRef gates so a single
  // transition can't bounce.
  const autoAdvancedRef = useRef<number | null>(null);
  // Timestamp of the last manual hole pick. While within
  // MANUAL_OVERRIDE_MS, suppress the GPS-driven auto-advance so the
  // user can tap back to a prior hole (to fix a score) without being
  // immediately yanked forward by virtue of standing on hole+1's tee.
  const manualPickAtRef = useRef<number>(0);
  const MANUAL_OVERRIDE_MS = 120_000;
  const pickHole = (h: number) => {
    manualPickAtRef.current = Date.now();
    setHole(h);
  };
  useEffect(() => {
    autoAdvancedRef.current = null;
  }, [hole]);
  useEffect(() => {
    if (!pos) return;
    if (hole >= lastHole) return;
    if (Date.now() - manualPickAtRef.current < MANUAL_OVERRIDE_MS) return;
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
    const curGreen =
      curGeo && curGeo.greenLat != null && curGeo.greenLng != null
        ? { lat: curGeo.greenLat, lng: curGeo.greenLng }
        : null;
    const dToCurGreen = curGreen ? distanceYards(playerLatLng, curGreen) : null;
    const tightRing = dToNextTee < 40;
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

  // Reset the cycle to the signed-in player whenever the sheet opens
  // or the hole changes, so we never strand the user on a teammate's
  // badge from a previous hole. MUST live above the `if (!active)`
  // early return below -- React requires the same number of hooks on
  // every render, and the early-return path skips all code that
  // follows.
  useEffect(() => {
    if (!sheetOpen) return;
    if (cycleOrder.length === 0) {
      setCyclePos(0);
      return;
    }
    let pos = 0;
    for (let i = 0; i < cycleOrder.length; i++) {
      const p = cycleOrder[i];
      if (p?.scoresByHole?.[hole] == null) {
        pos = i;
        break;
      }
      if (i === cycleOrder.length - 1) pos = 0;
    }
    setCyclePos(pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen, hole]);

  // Map engine toggle via ?map=gl. Must live up here (above the
  // !active early return below) so the hook count is stable across
  // renders -- otherwise tapping "Start on-course GPS" trips React
  // error #310 ("Rendered more hooks than during the previous
  // render") because the hook only ran in the active branch.
  const mapEngine = useMapEngine();

  // Has the user ever opened GPS for THIS match? Persisted in
  // localStorage so the label on the launcher flips from "Start on-
  // course GPS →" to "Resume on-course GPS →" once they've come
  // back from the GPS view at least once. Must also live above the
  // !active early return for hook-count stability.
  const launchedKey = `sticks.gps.launched.${matchId}`;
  const [hasLaunched, setHasLaunched] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(launchedKey) === "1") setHasLaunched(true);
    } catch {}
  }, [launchedKey]);

  if (!active) {
    // Pick the label: explicit override beats the launched-state
    // default. Lets pre-match flows (or tests) force a specific copy.
    const computedLabel =
      launcherLabel ?? (hasLaunched ? "Resume on-course GPS →" : "Start on-course GPS →");
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          // Open GPS immediately for a snappy feel; if the match hasn't
          // started yet, flip it to live in the background.
          setActive(true);
          try {
            localStorage.setItem(launchedKey, "1");
          } catch {}
          setHasLaunched(true);
          if (startMatchAction) {
            const fd = new FormData();
            fd.set("matchId", matchId);
            startTransition(() => {
              startMatchAction(fd).catch(() => {});
            });
          }
        }}
        className={launcherClassName}
      >
        {computedLabel}
      </button>
    );
  }

  const par = pars[hole - firstHole] ?? 4;
  const geo = holeGeoByHole[hole];
  const greenSet = !!(geo && geo.greenLat != null && geo.greenLng != null);
  const teeSet = !!(geo && geo.teeLat != null && geo.teeLng != null);
  const yardage = geo?.distanceYds ?? null;
  const playerPos = pos
    ? { lat: pos.coords.latitude, lng: pos.coords.longitude }
    : null;
  const { front, center, back } = deriveGreenDistances(playerPos, geo ?? null);
  const greenCenterLatLng =
    geo?.greenLat != null && geo?.greenLng != null
      ? { lat: geo.greenLat, lng: geo.greenLng }
      : null;
  const greenFrontLatLng =
    geo?.greenFrontLat != null && geo?.greenFrontLng != null
      ? { lat: geo.greenFrontLat, lng: geo.greenFrontLng }
      : null;
  const toAimYds =
    playerPos && aimPoint ? distanceYards(playerPos, aimPoint) : null;
  const aimToGreenYds =
    aimPoint && greenCenterLatLng
      ? distanceYards(aimPoint, greenCenterLatLng)
      : null;
  const accuracyYd =
    pos != null ? Math.round(pos.coords.accuracy * 1.0936133) : null;
  const frontMarked = !!(geo?.greenFrontLat != null && geo?.greenFrontLng != null);
  const backMarked = !!(geo?.greenBackLat != null && geo?.greenBackLng != null);

  // Per-hole hazards decorated with distance + reasonable layup target.
  const holeHazards = (hazardsByHole[hole] ?? [])
    .map((h) => {
      const d = playerPos ? distanceYards(playerPos, { lat: h.lat, lng: h.lng }) : null;
      return { ...h, distance: d };
    })
    .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));

  // Carry distance to the nearest still-in-play hazard on the line of
  // play. "In play" = farther out than the ball but closer than the
  // pin. Drives the CARRY BNK pair on the bottom panel.
  const carryHazard = (() => {
    const pinD = center;
    if (pinD == null) return null;
    for (const h of holeHazards) {
      if (h.distance == null) continue;
      if (h.distance < 20) continue; // already past it
      if (h.distance > pinD - 10) continue; // beyond the green
      return h;
    }
    return null;
  })();

  // Landmarks (yardage pills) the map should overlay. The PIN bone
  // chip sits on the green center; the AIM forest pill rides the aim
  // point; up to 2 nearby hazards float as small bone/tan chips.
  const landmarks: Landmark[] = [];
  if (greenCenterLatLng && center != null) {
    landmarks.push({
      id: "pin",
      lat: greenCenterLatLng.lat,
      lng: greenCenterLatLng.lng,
      prefix: "PIN",
      yds: center,
      variant: "default",
      tone: "white",
      orientation: "below",
    });
  }
  for (const h of holeHazards.slice(0, 2)) {
    if (h.distance == null) continue;
    landmarks.push({
      id: `hz-${h.id}`,
      lat: h.lat,
      lng: h.lng,
      prefix: h.kind === "WATER" ? "H₂O" : "BNK",
      yds: h.distance,
      variant: "tiny",
      tone: h.kind === "WATER" ? "water" : "sand",
      orientation: "above",
    });
  }
  if (aimPoint && toAimYds != null) {
    landmarks.push({
      id: "aim",
      lat: aimPoint.lat,
      lng: aimPoint.lng,
      prefix: "AIM",
      yds: toAimYds,
      variant: "accent",
      orientation: "above",
    });
  }

  // Score helpers ---------------------------------------------------
  const isLastHole = hole >= lastHole;
  const nextHole = isLastHole ? null : hole + 1;

  // Find the next un-scored player in the cycle after a given index.
  // Skips players who already have a score on the current hole.
  const findNextCycleIdx = (fromIdx: number): number => {
    for (let i = fromIdx + 1; i < cycleOrder.length; i++) {
      const p = cycleOrder[i];
      if (p?.scoresByHole?.[hole] == null) return i;
    }
    return -1;
  };

  // Persist the user's cycling preference + advance accordingly. Called
  // by the "Yes / Just me" prompt buttons after the first save.
  const resolveCyclePref = (pref: "enabled" | "disabled") => {
    setCyclePref(pref);
    try {
      localStorage.setItem("sticks-cycle-pref", pref);
    } catch {}
    setShowCyclePrompt(false);
    if (pref === "enabled") {
      const next = findNextCycleIdx(cyclePos);
      if (next >= 0) {
        setCyclePos(next);
        setSheetSelection(null);
      } else {
        // Nobody left to score (rare -- single-player or everyone
        // already logged). Close + advance hole.
        setSheetOpen(false);
        setSheetSelection(null);
        setCyclePos(0);
        if (!isLastHole) setHole(hole + 1);
      }
    } else {
      // "Just me" -- close sheet and advance to the next hole.
      setSheetOpen(false);
      setSheetSelection(null);
      setCyclePos(0);
      if (!isLastHole) setHole(hole + 1);
    }
  };

  const commitScore = () => {
    if (!currentEntryPlayer || !sheetSelection) return;
    const targetId = currentEntryPlayer.id;
    const strokes = sheetSelection.strokes;
    const fd = new FormData();
    fd.set("matchId", matchId);
    fd.set("matchPlayerId", targetId);
    fd.set("hole", String(hole));
    fd.set("strokes", String(strokes));
    // Decide what happens AFTER the save based on the cycling
    // preference. "unset" + multi-player match triggers the
    // first-time prompt; otherwise advance the cycle or the hole per
    // pref.
    const nextIdx = findNextCycleIdx(cyclePos);
    const askPrompt =
      cyclePref === "unset" && nextIdx >= 0 && cyclePos === 0;
    startTransition(async () => {
      await logScoreAction(fd);
      try {
        window.dispatchEvent(new CustomEvent("sticks:sound:score"));
      } catch {}
      router.refresh();
      if (askPrompt) {
        // Hold the sheet open with the saved selection visible so the
        // user has context while they answer the prompt.
        setShowCyclePrompt(true);
        return;
      }
      const cycleOn = cyclePref === "enabled";
      if (cycleOn && nextIdx >= 0) {
        // More players to score this hole -- swap badge, clear the
        // chosen tile, keep the sheet open.
        setCyclePos(nextIdx);
        setSheetSelection(null);
      } else {
        // "Disabled" pref OR cycle exhausted -- close sheet, advance
        // hole.
        setSheetOpen(false);
        setSheetSelection(null);
        setCyclePos(0);
        if (!isLastHole) setHole(hole + 1);
      }
    });
  };

  // Skip handler: advance to the next un-scored player on this hole
  // WITHOUT logging a score for the current one (don't know it / not
  // entering it). Mirrors commitScore's post-save branch minus the
  // write. When nobody's left, close the sheet + advance the hole.
  const skipToNextPlayer = () => {
    const nextIdx = findNextCycleIdx(cyclePos);
    if (nextIdx >= 0) {
      setCyclePos(nextIdx);
      setSheetSelection(null);
    } else {
      setSheetOpen(false);
      setSheetSelection(null);
      setCyclePos(0);
      if (!isLastHole) setHole(hole + 1);
    }
  };

  // Back-arrow handler: jump to the previous cycle position so the
  // scorekeeper can re-edit an earlier player's hole. Pre-populates
  // the sheet selection with that player's existing score (if any) so
  // tapping Save again updates rather than re-enters from scratch.
  const goBackInCycle = () => {
    if (cyclePos <= 0) return;
    const prev = cycleOrder[cyclePos - 1];
    const prevScore = prev?.scoresByHole?.[hole];
    const par = pars[hole - firstHole] ?? 4;
    setCyclePos(cyclePos - 1);
    setSheetSelection(
      typeof prevScore === "number"
        ? { strokes: prevScore, relative: prevScore - par }
        : null,
    );
  };

  // Only surface the "next player" hint to ScoreSheet when the user
  // has opted into cycling. Otherwise mid-cycle ambiguity creeps into
  // the save button label.
  const nextPlayerInCycle =
    cyclePref === "enabled"
      ? (() => {
          const idx = findNextCycleIdx(cyclePos);
          return idx >= 0 ? cycleOrder[idx] : null;
        })()
      : null;
  const previousPlayerInCycle =
    cyclePref === "enabled" && cyclePos > 0
      ? cycleOrder[cyclePos - 1] ?? null
      : null;

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

  const markTeeHere = () => {
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

  // ----------------------------------------------------------------
  // Render: full-bleed dark surface, satellite in back, chrome on top.
  // ----------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col overflow-hidden overscroll-contain text-ink">
      {/* Map (full background) */}
      <div className="absolute inset-0 z-[10]">
        {playerPos ? (
          <HoleMiniMap
            engine={mapEngine}
            // Bottom panel (DistancePanel ~88px + 10px gap + ENTER
            // SCORE ~54px + 14px safe area) is ~170px tall, so the
            // chip row needs ~180 to clear cleanly. Same height
            // whether or not an aim is set — the panel shape no
            // longer depends on the aim.
            chipsBottomOffsetPx={180}
            // Hide the Tee/Mid/Green/Hole portal while the score sheet
            // is open -- the portal mounts on document.body at z-[60]
            // so it would otherwise float on top of the sheet (z-50).
            hidePresets={sheetOpen}
            player={playerPos}
            tee={
              geo?.teeLat != null && geo?.teeLng != null
                ? { lat: geo.teeLat, lng: geo.teeLng }
                : null
            }
            greenCenter={greenCenterLatLng}
            greenFront={greenFrontLatLng}
            greenBack={
              geo?.greenBackLat != null && geo?.greenBackLng != null
                ? { lat: geo.greenBackLat, lng: geo.greenBackLng }
                : null
            }
            greenPolygon={geo?.greenPolygon ?? null}
            hazards={[]}
            aim={aimPoint}
            onAim={(p) => setAimPoint(p)}
            landmarks={landmarks}
            emptyState={
              !greenSet
                ? {
                    show: true,
                    onMarkGreen: () => markGreen("center"),
                    onMarkTee: () => markTeeHere(),
                  }
                : undefined
            }
          />
        ) : (
          // GPS hasn't locked yet. Black background with a centered
          // status message; chrome above still renders.
          <div className="absolute inset-0 flex items-center justify-center text-mute text-sm">
            {gpsError ?? "Locking on…"}
          </div>
        )}
      </div>

      {/* Soft baked scrims per System B — top + bottom black washes
          at low opacity so dark-ink chrome reads against the bright
          satellite without dimming the grass. Below the chrome
          (z-[15]) but above the map (z-[10]). */}
      <div
        className="absolute inset-x-0 top-0 h-[150px] z-[15] pointer-events-none"
        style={{ background: "rgba(0,0,0,0.10)" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[200px] z-[15] pointer-events-none"
        style={{ background: "rgba(0,0,0,0.14)" }}
      />

      {/* ============================================================
          System B — top: slim hole rail + dedicated header band
          ============================================================ */}
      <div
        className="absolute inset-x-0 top-0 z-[30] pt-[max(env(safe-area-inset-top),12px)] px-3"
      >
        <HoleRail
          firstHole={firstHole}
          lastHole={lastHole}
          activeHole={hole}
          pars={pars}
          scoresByHole={scoresByHole ?? {}}
          onPick={pickHole}
          onExit={() => setActive(false)}
        />
        <div className="mt-2 flex justify-center">
          <HeaderBand
            hole={hole}
            par={par}
            yardage={yardage}
            unmapped={!greenSet}
          />
        </div>
      </div>

      {/* Right control stack — wind chip + (when green is set) MOVE PIN
          tile. Sits below the header band so the two never collide. */}
      <div className="absolute z-[24] right-3 top-[172px] flex flex-col gap-2.5 items-center">
        <WindTile
          speedMph={wind?.speedMph ?? 8}
          fromDeg={wind?.fromDeg ?? 220}
          breeze={aimPoint != null}
        />
        {greenSet && (
          <MovePinTile
            active={aimPoint != null}
            onClick={() => {
              if (aimPoint) setAimPoint(null);
            }}
          />
        )}
      </div>

      {/* Bottom — dominant distance + ENTER SCORE. The preset chip
          row (TEE/GREEN/HOLE/3D) is rendered through HoleMiniMap's
          body portal and floats just above this panel. */}
      <div
        className="absolute inset-x-0 bottom-0 z-[32] px-3 pt-3 pb-[max(env(safe-area-inset-bottom),14px)] flex flex-col gap-2.5"
      >
        <DistancePanel
          toPin={center}
          toAim={toAimYds}
          carryYds={carryHazard?.distance ?? null}
          carryLabel={carryHazard ? (carryHazard.kind === "WATER" ? "CARRY H₂O" : "CARRY BNK") : null}
          unmapped={!greenSet}
        />
        <EnterScoreButton
          disabled={!myMatchPlayerId || !greenSet}
          label={
            !myMatchPlayerId
              ? "Watching only"
              : !greenSet
                ? "Map the hole first"
                : "Enter Score"
          }
          onClick={() => setSheetOpen(true)}
          pacified={!greenSet}
        />
      </div>

      {/* Score-entry sheet */}
      <ScoreSheet
        open={sheetOpen && !!myMatchPlayerId && greenSet}
        hole={hole}
        par={par}
        yardage={yardage}
        nextHole={nextHole}
        isLastHole={isLastHole}
        selection={sheetSelection}
        onSelect={setSheetSelection}
        onSave={commitScore}
        onCancel={() => {
          setSheetOpen(false);
          setSheetSelection(null);
          setCyclePos(0);
        }}
        currentPlayer={
          currentEntryPlayer
            ? {
                displayName: currentEntryPlayer.displayName,
                color: currentEntryPlayer.color,
              }
            : undefined
        }
        nextPlayer={
          nextPlayerInCycle
            ? { displayName: nextPlayerInCycle.displayName }
            : null
        }
        previousPlayer={
          previousPlayerInCycle
            ? { displayName: previousPlayerInCycle.displayName }
            : null
        }
        onBack={previousPlayerInCycle ? goBackInCycle : undefined}
        // Skip → next player, only while cycling through the group.
        // Solo / disabled cycling has no "next player" so it's hidden.
        onSkip={
          cyclePref === "enabled" && nextPlayerInCycle
            ? skipToNextPlayer
            : undefined
        }
        playerIndex={cyclePref === "enabled" ? cyclePos + 1 : undefined}
        playerCount={cyclePref === "enabled" ? cycleOrder.length : undefined}
      />

      {/* First-time prompt: "log scores for the rest of your group?".
          Fires once after the user saves their own score. Choice is
          persisted to localStorage so we never ask again. */}
      {showCyclePrompt && (
        <div
          className="absolute inset-0 z-[50] flex items-end justify-center bg-black/70 backdrop-blur-sm px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-label="Keep score for the group?"
        >
          <div className="w-full max-w-sm rounded-3xl border border-border bg-bg p-5 space-y-3 shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.7)]">
            <h3 className="font-display text-lg font-semibold tracking-tight">
              Keep score for the group?
            </h3>
            <p className="text-[12px] text-mute leading-snug">
              After saving your own score, do you want to log the
              other players too? You can change this later in settings.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => resolveCyclePref("disabled")}
                className="rounded-full border border-border bg-transparent text-mute font-mono text-[11px] tracking-[0.1em] uppercase py-3"
              >
                Just me
              </button>
              <button
                type="button"
                onClick={() => resolveCyclePref("enabled")}
                className="rounded-full bg-accent text-ink-on-accent font-display font-bold text-[12px] tracking-[0.08em] uppercase py-3"
              >
                Keep going
              </button>
            </div>
          </div>
        </div>
      )}

      {/* When the sheet is open, dim the underlying chrome a notch
          (handled via the sheet's own scrim — nothing extra here). */}
      {/* Spinner while a transition (mark green / log score / etc.) is in flight. */}
      {pending && (
        <div className="absolute top-3 right-3 z-[28] h-2 w-2 rounded-full bg-accent animate-pulse pointer-events-none" />
      )}
    </div>
  );
}

// ===== Sub-components =================================================
//
// System B — bone-cream chips floating on a bright satellite map.
// All chrome here uses .map-chip + the --map-* tokens defined in
// globals.css; theme-driven --color-* tokens DON'T affect this view
// (the map's grass-green base never changes per theme, so neither
// should its overlay).
//
// Header / hierarchy: one dominant distance (TO PIN, ~52px serif),
// a secondary pair (TO AIM forest, CARRY BNK), then a single
// full-width ENTER SCORE button. The slim hole rail is navigation
// only — it no longer doubles as a status strip.

export function HoleRail({
  firstHole,
  lastHole,
  activeHole,
  pars,
  scoresByHole,
  onPick,
  onExit,
  activeLabel = "PLAY",
}: {
  firstHole: number;
  lastHole: number;
  activeHole: number;
  pars: number[];
  scoresByHole: Record<number, number | null>;
  onPick: (h: number) => void;
  onExit?: () => void;
  // What to print under the active hole number. "PLAY" on the GPS
  // view, "VIEW" on the course preview. Defaults to PLAY.
  activeLabel?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[data-active="1"]');
    if (active) {
      active.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [activeHole]);

  const holesArr = useMemo(() => {
    const a: number[] = [];
    for (let h = firstHole; h <= lastHole; h++) a.push(h);
    return a;
  }, [firstHole, lastHole]);

  return (
    <div className="flex items-center gap-1.5">
      {onExit && (
        <button
          type="button"
          onClick={onExit}
          className="map-chip shrink-0 inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[11px] font-sans font-semibold text-[12px] active:scale-95 transition-transform"
          aria-label="Exit on-course"
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <line x1="3" y1="3" x2="13" y2="13" />
            <line x1="13" y1="3" x2="3" y2="13" />
          </svg>
          Done
        </button>
      )}
      <div
        ref={scrollerRef}
        // Mask the edges of the rail so chips fade out instead of
        // hard-cutting at the screen border. Matches the spec's
        // -webkit-mask: linear-gradient(...) recipe.
        className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar snap-x snap-mandatory"
        style={{
          WebkitMask:
            "linear-gradient(90deg, transparent, #000 8%, #000 88%, transparent)",
          mask: "linear-gradient(90deg, transparent, #000 8%, #000 88%, transparent)",
        }}
      >
        {holesArr.map((h) => {
          const isActive = h === activeHole;
          const par = pars[h - firstHole] ?? 4;
          const score = scoresByHole[h] ?? null;
          const rel = score != null ? score - par : null;
          const relLabel =
            rel == null
              ? null
              : rel === 0
                ? "E"
                : rel > 0
                  ? `+${rel}`
                  : `${rel}`;
          const played = score != null;
          // Played holes show to-par. Unplayed (including upcoming)
          // show "PAR N". Active = forest chip with activeLabel.
          const sublabel = isActive ? activeLabel : played ? relLabel : `P${par}`;
          const subTone = isActive
            ? "text-[rgba(244,240,230,0.78)]"
            : played && rel != null && rel < 0
              ? "text-[var(--mint)]"
              : played && rel != null && rel > 0
                ? "text-[#B0473B]"
                : "text-[var(--map-mute)]";
          return (
            <button
              key={h}
              type="button"
              data-active={isActive ? 1 : undefined}
              onClick={() => onPick(h)}
              className={
                "snap-center shrink-0 flex flex-col items-center justify-center gap-px w-[38px] h-[38px] rounded-[11px] select-none transition-colors " +
                (isActive
                  ? "border border-transparent text-[var(--map-cream)] shadow-[0_6px_18px_-6px_rgba(46,87,64,0.55)]"
                  : "map-chip")
              }
              style={isActive ? { background: "var(--mint)" } : undefined}
            >
              <span
                className={
                  "leading-none font-display tabular-nums " +
                  (isActive
                    ? "text-[14px] font-semibold text-[var(--map-cream)]"
                    : "text-[14px] font-semibold text-[var(--map-ink)]")
                }
              >
                {h}
              </span>
              {sublabel && (
                <span
                  className={
                    "font-mono text-[8px] tracking-[0.04em] leading-none " +
                    subTone
                  }
                >
                  {sublabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HeaderBand({
  hole,
  par,
  yardage,
  unmapped,
  trailing,
}: {
  hole: number;
  par: number;
  yardage: number | null;
  unmapped: boolean;
  // Optional forest-tinted tag appended after a dot separator. The
  // preview view passes "FROM TEE" here; the on-course view leaves it
  // off.
  trailing?: string;
}) {
  // Header band rides BELOW the hole rail on its own line, so par /
  // yardage never gets sliced. Just hole · par · yardage — no GPS
  // accuracy tag (it lived in the old design and stole prominence
  // from the dominant distance below).
  return (
    <div className="map-chip inline-flex items-center gap-2 px-3.5 py-[7px] rounded-full">
      <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--map-ink)] font-semibold">
        HOLE {hole}
      </span>
      <span className="w-[3px] h-[3px] rounded-full bg-[var(--map-mute)]" />
      <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--map-ink)] font-semibold">
        PAR {par}
      </span>
      <span className="w-[3px] h-[3px] rounded-full bg-[var(--map-mute)]" />
      {unmapped ? (
        <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--map-sand-mute)] font-semibold">
          UNMAPPED
        </span>
      ) : yardage != null ? (
        <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--map-ink)] font-semibold">
          {yardage} YDS
        </span>
      ) : (
        <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--map-mute)] font-semibold">
          — YDS
        </span>
      )}
      {trailing && (
        <>
          <span className="w-[3px] h-[3px] rounded-full bg-[var(--map-mute)]" />
          <span
            className="font-mono text-[11px] tracking-[0.08em] uppercase font-semibold"
            style={{ color: "var(--mint)" }}
          >
            {trailing}
          </span>
        </>
      )}
    </div>
  );
}

export function WindTile({
  speedMph,
  fromDeg,
  breeze,
}: {
  speedMph: number;
  fromDeg: number;
  breeze: boolean;
}) {
  // Bone-cream tile, ~60px wide. Arrow rotates with fromDeg; serif
  // number, mono "MPH" label. "Breeze" pulses to mint when the user
  // has set an aim, hinting that wind matters for this shot.
  return (
    <div
      className="map-chip w-[60px] rounded-[15px] py-2 px-2 flex flex-col items-center gap-1"
      aria-label={`Wind ${speedMph} mph`}
    >
      <svg
        width="11"
        height="15"
        viewBox="0 0 11 15"
        style={{
          transform: `rotate(${fromDeg}deg)`,
          transformOrigin: "50% 50%",
        }}
      >
        <path
          d="M5.5 0.5 L10 13 L5.5 10 L1 13 Z"
          fill={breeze ? "var(--mint)" : "var(--map-ink)"}
          fillOpacity={breeze ? 0.95 : 0.92}
        />
      </svg>
      <div className="font-display font-bold text-[16px] leading-none text-[var(--map-ink)] tabular-nums">
        {Math.round(speedMph)}
      </div>
      <div className="font-mono text-[8px] tracking-[0.06em] uppercase text-[var(--map-mute)]">
        MPH
      </div>
    </div>
  );
}

function MovePinTile({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="map-chip w-[60px] rounded-[15px] py-2 px-2 flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
      aria-label={active ? "Clear aim" : "Move pin"}
    >
      <span
        className="w-[30px] h-[30px] rounded-[9px] grid place-items-center"
        style={{ background: "var(--mint)", color: "#cdebd9" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M6 21V4M6 4l11 3-11 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="font-mono text-[8.5px] tracking-[0.06em] uppercase text-[var(--map-ink)] font-semibold">
        {active ? "CLEAR" : "MOVE PIN"}
      </span>
    </button>
  );
}

function DistancePanel({
  toPin,
  toAim,
  carryYds,
  carryLabel,
  unmapped,
}: {
  toPin: number | null;
  toAim: number | null;
  carryYds: number | null;
  carryLabel: string | null;
  unmapped: boolean;
}) {
  // Dominant TO PIN · CENTER (52px serif), with TO AIM (forest) +
  // CARRY (default ink) stacked as a secondary pair on the right.
  // If unmapped, render a neutral state telling the user what to do.
  return (
    <div className="map-chip rounded-[18px] p-[14px_16px] flex items-stretch gap-3.5">
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--map-mute)] font-semibold">
          {unmapped ? "GREEN NEEDED" : "TO PIN · CENTER"}
        </div>
        <div className="font-display font-bold text-[var(--map-ink)] tabular-nums leading-none mt-1 flex items-baseline gap-0.5">
          {unmapped ? (
            <span className="text-[28px] leading-none">—</span>
          ) : toPin == null ? (
            <span className="text-[28px] leading-none text-[var(--map-mute)]">—</span>
          ) : (
            <>
              <span className="text-[52px] leading-[0.9]">{Math.round(toPin)}</span>
              <span className="text-[18px] text-[var(--map-mute)] ml-0.5">y</span>
            </>
          )}
        </div>
      </div>
      <div
        className="self-stretch w-px"
        style={{ background: "var(--chip-line)" }}
      />
      <div className="flex flex-col gap-2 min-w-[88px]">
        <SecondaryStat
          label="TO AIM"
          value={toAim != null ? Math.round(toAim) : null}
          accent
        />
        <SecondaryStat
          label={carryLabel ?? "CARRY"}
          value={carryYds != null ? Math.round(carryYds) : null}
        />
      </div>
    </div>
  );
}

function SecondaryStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-px">
      <div className="font-mono text-[8.5px] tracking-[0.08em] uppercase text-[var(--map-mute)] font-semibold">
        {label}
      </div>
      <div
        className="font-display font-bold tabular-nums leading-none flex items-baseline gap-px"
        style={{ color: accent ? "var(--mint)" : "var(--map-ink)" }}
      >
        {value == null ? (
          <span className="text-[18px] text-[var(--map-mute)]">—</span>
        ) : (
          <>
            <span className="text-[22px]">{value}</span>
            <span className="text-[11px] text-[var(--map-mute)]">y</span>
          </>
        )}
      </div>
    </div>
  );
}

function EnterScoreButton({
  label,
  onClick,
  disabled,
  pacified,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  pacified: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "w-full inline-flex items-center justify-center gap-2 py-[15px] rounded-[15px] font-display font-bold text-[15px] tracking-[0.02em] uppercase transition-colors active:scale-[0.99] " +
        (pacified || disabled
          ? "map-chip text-[var(--map-mute)] font-mono text-[12px] tracking-[0.12em] font-medium"
          : "text-[var(--map-cream)] shadow-[0_10px_24px_-10px_rgba(46,87,64,0.6)]")
      }
      style={
        pacified || disabled ? undefined : { background: "var(--mint)" }
      }
    >
      <span>{label}</span>
      {!pacified && !disabled && (
        <span className="font-mono text-[14px]">↑</span>
      )}
    </button>
  );
}
