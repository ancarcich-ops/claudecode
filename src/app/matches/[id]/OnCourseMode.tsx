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

  if (!active) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          // Open GPS immediately for a snappy feel; if the match hasn't
          // started yet, flip it to live in the background.
          setActive(true);
          if (startMatchAction) {
            const fd = new FormData();
            fd.set("matchId", matchId);
            startTransition(() => {
              startMatchAction(fd).catch(() => {});
            });
          }
        }}
        className="btn btn-primary w-full sm:w-auto disabled:opacity-60"
      >
        Start on-course GPS and scorecard →
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

  // Landmarks (yardage pills) the map should overlay. Kept lean: up to
  // 2 nearby hazards + the AIM pill when an aim is set. The pin itself
  // (green center) is drawn separately; the front/back distances live
  // in the F/C/B card below the map, so we don't re-label them here.
  const landmarks: Landmark[] = [];
  // 2 closest hazards as tiny pills.
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
            // Chip row offset: AimCard sits at bottom-120 (~70px
            // tall) when an aim is set, so chips need ~200 to sit
            // just above it. Without an aim, only the ENTER SCORE
            // button bar is at the bottom (~80px), so 100 keeps chips
            // close to the button instead of floating mid-screen.
            chipsBottomOffsetPx={aimPoint ? 200 : 100}
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
          /* below: pickHole, not setHole, so a manual tap suppresses
             the GPS auto-advance for a couple of minutes. */
          activeHole={hole}
          pars={pars}
          scoresByHole={scoresByHole ?? {}}
          onPick={pickHole}
        />
        <div className="mt-2 px-4 text-center font-mono tabular-nums text-[11.5px] tracking-[0.14em] uppercase text-white/78">
          PAR {par}
          <span className="text-white/35"> · </span>
          {yardage != null ? (
            <>
              {yardage}
              <span className="text-white/55">Y</span>
            </>
          ) : !greenSet ? (
            <span className="text-gold">UNMAPPED</span>
          ) : (
            <span className="text-white/55">— Y</span>
          )}
          <span className="text-white/35"> · </span>
          {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? (
            <span className="text-white/55">SCHEMATIC</span>
          ) : (
            <>
              <span className="text-white/55">±{accuracyYd ?? "?"}</span>
              <span className="text-white/55">Y GPS</span>
            </>
          )}
        </div>
      </div>

      {/* Exit (top-left, sits over the scrim) */}
      <button
        type="button"
        onClick={() => setActive(false)}
        className="absolute z-[31] top-[max(env(safe-area-inset-top),12px)] left-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-black/85 border border-white/15 text-white font-medium text-[12px] tracking-wide shadow-[0_4px_14px_-4px_rgba(0,0,0,0.6)] active:scale-95 transition-transform"
        aria-label="Exit on-course"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="3" y1="3" x2="13" y2="13" />
          <line x1="13" y1="3" x2="3" y2="13" />
        </svg>
        Done
      </button>

      {/* Wind dial + Set Pin FAB (top-right stack) */}
      <WindDial
        speedMph={wind?.speedMph ?? 8}
        fromDeg={wind?.fromDeg ?? 220}
        breeze={aimPoint != null}
      />
      <SetPinFab
        label={!greenSet ? "Aim" : aimPoint ? "Move Pin" : "Set Pin"}
        onClick={() => {
          // Tapping the FAB toggles "aim" mode hint. The actual click
          // happens on the satellite; this is mostly a visual affordance.
          if (aimPoint) {
            setAimPoint(null);
          }
        }}
      />

      {/* Aim card (3-up numerics, when an aim is set) */}
      {aimPoint && toAimYds != null && (
        <AimCard
          toAim={toAimYds}
          toPin={
            (aimToGreenYds ?? 0) +
            (toAimYds ?? 0)
          }
          carry={Math.round(toAimYds)}
        />
      )}

      {/* Bottom scrim + Enter Score CTA */}
      <div
        className="absolute inset-x-0 bottom-0 z-[32] pt-5 pb-[max(env(safe-area-inset-bottom),20px)] px-5 flex justify-center"
        style={{
          background:
            "linear-gradient(0deg, #000 0%, rgba(0,0,0,0.85) 50%, rgba(0,0,0,0) 100%)",
        }}
      >
        <EnterScoreCta
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

export function HolePicker({
  firstHole,
  lastHole,
  activeHole,
  pars,
  scoresByHole,
  onPick,
}: {
  firstHole: number;
  lastHole: number;
  activeHole: number;
  pars: number[];
  scoresByHole: Record<number, number | null>;
  onPick: (h: number) => void;
}) {
  // Render a horizontally scrollable row of circular hole pills.
  // The active hole is larger + white-filled; played holes show a
  // small accent score chip beneath the number.
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Auto-center the active pill on hole change.
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
    <div
      ref={scrollerRef}
      // Left padding (pl-[76px]) reserves room for the Done button
      // anchored at top-left; without it the first hole pill rides
      // under the exit and the two controls visually merge.
      className="pl-[76px] pr-4 flex items-center gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory"
    >
      {holesArr.map((h) => {
        const isActive = h === activeHole;
        const par = pars[h - firstHole] ?? 4;
        const score = scoresByHole[h] ?? null;
        const rel = score != null ? score - par : null;
        const relLabel =
          rel == null ? null : rel === 0 ? "E" : rel > 0 ? `+${rel}` : `${rel}`;
        const played = score != null;
        return (
          <button
            key={h}
            type="button"
            data-active={isActive ? 1 : undefined}
            onClick={() => onPick(h)}
            className={
              "snap-center shrink-0 flex flex-col items-center justify-center rounded-full font-display select-none transition-transform " +
              (isActive
                ? "w-11 h-11 bg-white text-bg shadow-[0_6px_20px_-4px_rgba(255,255,255,0.25)] font-semibold text-[16px]"
                : "w-[38px] h-[38px] bg-[rgba(20,28,24,0.7)] backdrop-blur-md border border-white/8 text-mute font-medium text-[14px] hover:text-ink")
            }
          >
            <span className="leading-none">{h}</span>
            {!isActive && played && relLabel && (
              <span
                className={
                  "font-mono text-[8.5px] mt-[1px] " +
                  (rel != null && rel < 0
                    ? "text-accent"
                    : rel === 0
                      ? "text-gold/80"
                      : "text-mute")
                }
              >
                {relLabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SetPinFab({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute z-[25] right-4 top-[174px] w-16 h-20 rounded-[14px] bg-bg/78 backdrop-blur-md border border-white/8 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.55)] flex flex-col items-center justify-center gap-1.5 pt-2 pb-1.5"
      aria-label={label}
    >
      <span className="w-[30px] h-[30px] rounded-lg bg-accent flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line
            x1="4"
            y1="2"
            x2="4"
            y2="15"
            stroke="rgb(var(--ink-on-accent))"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path d="M4 3 L13 5 L4 8 Z" fill="rgb(var(--ink-on-accent))" />
        </svg>
      </span>
      <span className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-white/92 font-semibold">
        {label}
      </span>
    </button>
  );
}

export function WindDial({
  speedMph,
  fromDeg,
  breeze,
}: {
  speedMph: number;
  fromDeg: number;
  breeze: boolean;
}) {
  return (
    <div
      className="absolute z-[24] right-[22px] top-[114px] w-[52px] h-[52px] rounded-[14px] bg-bg/55 backdrop-blur-[14px] border border-white/7 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.4)] flex flex-col items-center justify-center pt-1 pb-1.5"
      aria-label={`Wind ${speedMph} mph`}
    >
      <svg
        width="11"
        height="15"
        viewBox="0 0 11 15"
        style={{ transform: `rotate(${fromDeg}deg)`, transformOrigin: "50% 50%" }}
      >
        <path
          d="M5.5 0.5 L10 13 L5.5 10 L1 13 Z"
          fill={breeze ? "#34d399" : "#ffffff"}
          fillOpacity={breeze ? 0.9 : 0.92}
        />
      </svg>
      <div className="inline-flex items-baseline gap-[2px] mt-px">
        <span
          className={
            "font-mono font-semibold text-[12px] tabular-nums tracking-[-0.01em] " +
            (breeze ? "text-accent" : "text-white")
          }
        >
          {Math.round(speedMph)}
        </span>
        <span className="text-[7.5px] uppercase tracking-[0.08em] text-white/50">
          mph
        </span>
      </div>
    </div>
  );
}

function AimCard({
  toAim,
  toPin,
  carry,
}: {
  toAim: number;
  toPin: number;
  carry: number;
}) {
  return (
    <div
      className="absolute z-[31] left-[18px] right-[18px] bottom-[120px] rounded-2xl bg-bg/80 backdrop-blur-[18px] border border-white/8 p-[14px_16px] flex items-stretch gap-0"
    >
      <AimCol label="To aim" value={Math.round(toAim)} unit="yds" accent />
      <div className="w-px self-stretch bg-white/8 mx-3" />
      <AimCol label="To pin" value={Math.round(toPin)} unit="yds" />
      <div className="w-px self-stretch bg-white/8 mx-3" />
      <AimCol label="Carry" value={Math.round(carry)} unit="yds" />
    </div>
  );
}

function AimCol({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: number;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col items-start gap-[6px]">
      <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/55">
        {label}
      </span>
      <div className="flex items-baseline gap-[3px]">
        <span
          className={
            "font-mono font-semibold text-[26px] tabular-nums leading-none " +
            (accent ? "text-accent" : "text-white")
          }
        >
          {value}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">
          {unit}
        </span>
      </div>
    </div>
  );
}

function EnterScoreCta({
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
        "w-full max-w-[320px] inline-flex items-center justify-center gap-3 rounded-full uppercase " +
        (pacified || disabled
          ? "bg-bg/78 text-mute border border-white/10 font-mono text-[12px] tracking-[0.12em] font-medium py-[18px]"
          : "bg-accent text-ink-on-accent font-display font-bold text-[17px] tracking-[0.04em] py-[18px] shadow-[0_12px_30px_-8px_rgb(var(--color-accent)/0.45),_0_0_0_1px_rgb(var(--color-accent)/0.4)]")
      }
    >
      <span>{label}</span>
      {!pacified && !disabled && (
        <span className="font-mono text-[14px]">↑</span>
      )}
    </button>
  );
}
