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
  wind,
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
  const [aimPoint, setAimPoint] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSelection, setSheetSelection] = useState<SheetSelection>(null);

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
  useEffect(() => {
    autoAdvancedRef.current = null;
  }, [hole]);
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

  // Landmarks (yardage pills) the map should overlay. Cap at ~4 so it
  // stays readable: front of green (if marked + not the same as center),
  // up to 2 nearby hazards, and the AIM pill when an aim is set.
  const landmarks: Landmark[] = [];
  if (greenFrontLatLng && front != null) {
    landmarks.push({
      id: "front",
      lat: greenFrontLatLng.lat,
      lng: greenFrontLatLng.lng,
      prefix: "F",
      yds: front,
      orientation: "below",
      dim: aimPoint != null,
    });
  }
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

  const commitScore = () => {
    if (!myMatchPlayerId || !sheetSelection) return;
    const fd = new FormData();
    fd.set("matchId", matchId);
    fd.set("matchPlayerId", myMatchPlayerId);
    fd.set("hole", String(hole));
    fd.set("strokes", String(sheetSelection.strokes));
    startTransition(async () => {
      await logScoreAction(fd);
      setSheetOpen(false);
      setSheetSelection(null);
      // Auto-advance unless on last hole.
      if (!isLastHole) {
        setHole(hole + 1);
      }
      router.refresh();
      try {
        window.dispatchEvent(new CustomEvent("sticks:sound:score"));
      } catch {}
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
            hazards={holeHazards.map((h) => ({
              id: h.id,
              kind: h.kind,
              lat: h.lat,
              lng: h.lng,
            }))}
            aim={aimPoint}
            onAim={(p) => setAimPoint(p)}
            landmarks={landmarks}
            calibration={
              greenSet
                ? {
                    showFront: !frontMarked,
                    showBack: !backMarked,
                    showTee: !teeSet,
                    onMarkFront: () => markGreen("front"),
                    onMarkBack: () => markGreen("back"),
                    onMarkTee: () => markTeeHere(),
                  }
                : undefined
            }
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
          activeHole={hole}
          pars={pars}
          scoresByHole={scoresByHole ?? {}}
          onPick={setHole}
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
        className="absolute z-[31] top-[max(env(safe-area-inset-top),12px)] left-3 inline-flex items-center justify-center h-9 w-9 rounded-full bg-bg/70 backdrop-blur-md border border-white/8 text-mute hover:text-ink"
        aria-label="Exit on-course"
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
        }}
      />

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
      className="px-4 flex items-center gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory"
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

function WindDial({
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
