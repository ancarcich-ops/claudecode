"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PinchZoom, {
  useZoom,
  type PinchZoomHandle,
} from "@/components/PinchZoom";

// Top-down hole map. When NEXT_PUBLIC_MAPBOX_TOKEN is set, the base
// layer is a Mapbox satellite image of the bounding box of all known
// features. Without a token we fall back to a flat schematic.
//
// Sticks's on-course screen treats this component as the canvas: the
// satellite is the background, the SVG draws geometry overlays on
// top, and HTML "pills" + "chips" (positioned via the same lat/lng ->
// pixel projection) hang above the SVG to label distances and invite
// missing-feature placements. Chrome that doesn't live on the map
// itself (hole picker, FAB, CTA, sheet) sits in the parent component.

type Pt = { lat: number; lng: number };
type Hazard = Pt & {
  id: string;
  kind: "WATER" | "SAND" | "OOB" | "OTHER";
};

// Yardage-pill descriptor. The pill body reads `<prefix> · <yds>y`;
// the tail tip is anchored at (lat, lng). `orientation: "below"`
// flips the pill so the tail points up at the target and the body
// hangs below -- useful for pills near the top scrim so the body
// doesn't crash into the picker. `variant: "tiny"` is for hazards;
// `variant: "accent"` is for the AIM pill.
export type Landmark = {
  id: string;
  lat: number;
  lng: number;
  prefix?: string;
  yds: number;
  orientation?: "above" | "below";
  variant?: "default" | "tiny" | "accent";
  tone?: "white" | "sand" | "water";
  dim?: boolean;
};

const HAZARD_FILL = {
  WATER: "#60a5fa",
  SAND: "#fbbf24",
  OOB: "#f87171",
  OTHER: "#8aa094",
};

// Mapbox uses Web Mercator. We project lat through this so overlays
// align with the satellite image to sub-yard precision.
function mercY(latDeg: number): number {
  const lat = (latDeg * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}

export default function HoleMiniMap({
  player,
  tee,
  greenCenter,
  greenFront,
  greenBack,
  greenPolygon,
  hazards,
  aim,
  onAim,
  landmarks,
  calibration,
  emptyState,
}: {
  player: Pt | null;
  tee: Pt | null;
  greenCenter: Pt | null;
  greenFront: Pt | null;
  greenBack: Pt | null;
  greenPolygon: Pt[] | null;
  hazards: Hazard[];
  aim?: Pt | null;
  onAim?: (latLng: Pt | null) => void;

  // Yardage pills rendered as HTML siblings of the SVG, positioned by
  // projecting their lat/lng through the same bbox. Caller decides
  // which landmarks to surface (front of green, closest bunker carry,
  // an aim point, etc.).
  landmarks?: Landmark[];

  // "Mark front / back of green / tee here" chips. Each one becomes a
  // small gold pill on the map; tapping fires the callback.
  calibration?: {
    showFront?: boolean;
    showBack?: boolean;
    showTee?: boolean;
    onMarkFront?: () => void;
    onMarkBack?: () => void;
    onMarkTee?: () => void;
  };

  // Unmapped-hole prompts. Two larger floating chips (one accent,
  // one gold) that invite the player to drop a pin where they're
  // standing.
  emptyState?: {
    show: boolean;
    onMarkGreen: () => void;
    onMarkTee: () => void;
  };
}) {
  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Measure the rendered size so we can match the satellite image +
  // viewBox to the container aspect.
  const wrapRef = useRef<HTMLDivElement>(null);
  // Imperative handle to PinchZoom -- lets the "Tee / Mid / Green"
  // preset chips drive pan+zoom to those features without HoleMiniMap
  // owning the zoom state.
  const pinchRef = useRef<PinchZoomHandle>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 400,
    h: 400,
  });
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const obs = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      setSize((cur) => (cur.w === w && cur.h === h ? cur : { w, h }));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Collect every point that influences the bbox. Player + aim
  // included so the player doesn't slide off when they walk far.
  const all: Pt[] = useMemo(() => {
    const out: Pt[] = [];
    if (player) out.push(player);
    if (tee) out.push(tee);
    if (greenCenter) out.push(greenCenter);
    if (greenFront) out.push(greenFront);
    if (greenBack) out.push(greenBack);
    if (greenPolygon) out.push(...greenPolygon);
    for (const h of hazards) out.push(h);
    if (aim) out.push(aim);
    if (landmarks) for (const l of landmarks) out.push({ lat: l.lat, lng: l.lng });
    return out;
  }, [player, tee, greenCenter, greenFront, greenBack, greenPolygon, hazards, aim, landmarks]);

  if (all.length < 1) {
    return <div ref={wrapRef} className="w-full h-full" />;
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of all) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  // Single-point bbox (just the player on an unmapped hole): synthesize
  // a ~160m square so the satellite still has useful context.
  if (all.length === 1) {
    const r = 0.00072;
    minLng -= r;
    maxLng += r;
    minLat -= r;
    maxLat += r;
  }

  // Pad ~12% on each side so points don't ride the edge.
  const padFrac = 0.12;
  const dLng = Math.max(maxLng - minLng, 1e-6);
  const dLat = Math.max(maxLat - minLat, 1e-6);
  minLng -= dLng * padFrac;
  maxLng += dLng * padFrac;
  minLat -= dLat * padFrac;
  maxLat += dLat * padFrac;

  // Square the bbox in meters to match the container aspect.
  const midLat = (minLat + maxLat) / 2;
  const cosMid = Math.cos((midLat * Math.PI) / 180);
  const lngMeters = (maxLng - minLng) * cosMid;
  const latMeters = maxLat - minLat;
  const containerAspect = size.w / size.h;
  const bboxAspect = lngMeters / latMeters;
  if (bboxAspect > containerAspect) {
    const targetLatMeters = lngMeters / containerAspect;
    const extra = (targetLatMeters - latMeters) / 2;
    minLat -= extra;
    maxLat += extra;
  } else if (bboxAspect < containerAspect) {
    const targetLngMeters = latMeters * containerAspect;
    const extra = (targetLngMeters - lngMeters) / 2 / cosMid;
    minLng -= extra;
    maxLng += extra;
  }

  const Vw = size.w;
  const Vh = size.h;

  // Linear-in-lng, Mercator-in-lat projection into [0, Vw] / [0, Vh].
  // y inverted so north = up.
  const minMercY = mercY(minLat);
  const maxMercY = mercY(maxLat);
  const project = (p: Pt) => ({
    cx: ((p.lng - minLng) / (maxLng - minLng)) * Vw,
    cy: Vh - ((mercY(p.lat) - minMercY) / (maxMercY - minMercY)) * Vh,
  });
  const unproject = (cx: number, cy: number): Pt => {
    const lng = minLng + (cx / Vw) * (maxLng - minLng);
    const my = minMercY + ((Vh - cy) / Vh) * (maxMercY - minMercY);
    const latRad = 2 * (Math.atan(Math.exp(my)) - Math.PI / 4);
    const lat = (latRad * 180) / Math.PI;
    return { lat, lng };
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onAim) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * Vw;
    const cy = ((e.clientY - rect.top) / rect.height) * Vh;
    onAim(unproject(cx, cy));
  };

  const pPlayer = player ? project(player) : null;
  const pTee = tee ? project(tee) : null;
  const pGC = greenCenter ? project(greenCenter) : null;
  const pGF = greenFront ? project(greenFront) : null;
  const pGB = greenBack ? project(greenBack) : null;
  const pAim = aim ? project(aim) : null;

  const reqW = Math.min(1280, Math.max(64, Math.round(size.w)));
  const reqH = Math.min(1280, Math.max(64, Math.round(size.h)));
  const tileUrl = MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${minLng.toFixed(6)},${minLat.toFixed(6)},${maxLng.toFixed(6)},${maxLat.toFixed(6)}]/${reqW}x${reqH}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`
    : null;

  // Scale visual overlays gently with container so they don't look
  // tiny on a phone or huge on a tablet.
  const scaleRef = Math.min(Vw, Vh);
  const teeW = Math.max(8, scaleRef * 0.035);
  const teeH = Math.max(5, scaleRef * 0.022);
  const hazardR = Math.max(4, scaleRef * 0.018);
  const greenStroke = Math.max(1.5, scaleRef * 0.007);

  // Aim play line: solid GPS->aim, dashed aim->pin, two range rings.
  const aimSolidStroke = Math.max(2, scaleRef * 0.009);
  const aimDashedStroke = Math.max(1.5, scaleRef * 0.006);

  return (
    <div ref={wrapRef} className="absolute inset-0 w-full h-full">
      {/* PinchZoom wraps the SVG + HTML overlays so they scale and pan
          together. Outer measurement container above stays unscaled
          (it's what feeds Vw/Vh for the SVG viewBox). */}
      <PinchZoom ref={pinchRef}>
      <svg
        viewBox={`0 0 ${Vw} ${Vh}`}
        className={"absolute inset-0 w-full h-full block " + (onAim ? "cursor-crosshair" : "")}
        role="img"
        aria-label="Hole map"
        onClick={onAim ? handleSvgClick : undefined}
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id="schematic-dots"
            x="0"
            y="0"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="8" cy="8" r="0.8" fill="#1f2a25" />
          </pattern>
          <linearGradient id="fairway-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {tileUrl ? (
          <image
            href={tileUrl}
            xlinkHref={tileUrl}
            x="0"
            y="0"
            width={Vw}
            height={Vh}
            preserveAspectRatio="none"
          />
        ) : (
          // Schematic fallback: dark bg + dotted grid + dashed
          // fairway corridor in accent-dim. Same chrome as the
          // satellite variant; just stripped of imagery.
          <>
            <rect x="0" y="0" width={Vw} height={Vh} fill="#0b0f0c" />
            <rect
              x="0"
              y="0"
              width={Vw}
              height={Vh}
              fill="url(#schematic-dots)"
            />
            {pTee && pGC && (
              <line
                x1={pTee.cx}
                y1={pTee.cy}
                x2={pGC.cx}
                y2={pGC.cy}
                stroke="#1f8f6a"
                strokeWidth={greenStroke * 1.2}
                strokeDasharray={`${greenStroke * 3} ${greenStroke * 4}`}
                strokeOpacity="0.5"
              />
            )}
          </>
        )}

        {/* Aim play line. Solid player->aim + dashed aim->pin + 2 rings. */}
        {pPlayer && pAim && (
          <line
            x1={pPlayer.cx}
            y1={pPlayer.cy}
            x2={pAim.cx}
            y2={pAim.cy}
            stroke="#34d399"
            strokeOpacity="0.95"
            strokeWidth={aimSolidStroke}
          />
        )}
        {pAim && pGC && (
          <line
            x1={pAim.cx}
            y1={pAim.cy}
            x2={pGC.cx}
            y2={pGC.cy}
            stroke="#34d399"
            strokeOpacity="0.55"
            strokeWidth={aimDashedStroke}
            strokeDasharray={`${aimDashedStroke * 2.5} ${aimDashedStroke * 4}`}
          />
        )}
        {pAim && (
          <>
            <circle
              cx={pAim.cx}
              cy={pAim.cy}
              r={Math.max(18, scaleRef * 0.075)}
              fill="none"
              stroke="#34d399"
              strokeOpacity="0.6"
              strokeWidth={aimDashedStroke}
            />
            <circle
              cx={pAim.cx}
              cy={pAim.cy}
              r={Math.max(26, scaleRef * 0.1)}
              fill="none"
              stroke="#34d399"
              strokeOpacity="0.3"
              strokeWidth={aimDashedStroke * 0.8}
              strokeDasharray={`${aimDashedStroke * 2.5} ${aimDashedStroke * 3.5}`}
            />
          </>
        )}
        {pPlayer && pGC && !pAim && (
          // No aim yet: a quiet dashed reference line player -> pin.
          <line
            x1={pPlayer.cx}
            y1={pPlayer.cy}
            x2={pGC.cx}
            y2={pGC.cy}
            stroke="#34d399"
            strokeOpacity="0.45"
            strokeWidth={aimDashedStroke}
            strokeDasharray={`${aimDashedStroke * 2.5} ${aimDashedStroke * 3.5}`}
          />
        )}

        {/* Green: polygon if we have one, else an oval. Over satellite
            we leave the fill empty so the real green shows through. */}
        {greenPolygon && greenPolygon.length > 2 ? (
          <polygon
            points={greenPolygon
              .map((p) => {
                const pos = project(p);
                return `${pos.cx},${pos.cy}`;
              })
              .join(" ")}
            fill={tileUrl ? "none" : "#34d399"}
            fillOpacity={tileUrl ? 0 : 0.18}
            stroke="#34d399"
            strokeWidth={greenStroke * 1.3}
          />
        ) : pGC ? (
          <ellipse
            cx={pGC.cx}
            cy={pGC.cy}
            rx={(pGF || pGB ? 12 : 9) * (scaleRef / 200)}
            ry={(pGF || pGB ? 8 : 6) * (scaleRef / 200)}
            fill={tileUrl ? "none" : "#34d399"}
            fillOpacity={tileUrl ? 0 : 0.18}
            stroke="#34d399"
            strokeWidth={greenStroke * 1.3}
            strokeDasharray={tileUrl ? undefined : `${greenStroke * 2} ${greenStroke * 3}`}
          />
        ) : null}
        {pGF && (
          <circle cx={pGF.cx} cy={pGF.cy} r={hazardR * 0.45} fill="#34d399" />
        )}
        {pGB && (
          <circle cx={pGB.cx} cy={pGB.cy} r={hazardR * 0.45} fill="#34d399" />
        )}

        {/* Pin flag, rooted at green center. Reads from a glance even
            against busy satellite imagery. */}
        {pGC && (
          <g transform={`translate(${pGC.cx}, ${pGC.cy})`}>
            <line
              x1="0"
              y1="0"
              x2="0"
              y2={-Math.max(10, scaleRef * 0.04)}
              stroke="#e8efe9"
              strokeWidth={greenStroke * 0.6}
              strokeLinecap="round"
            />
            <path
              d={`M 0 ${-Math.max(10, scaleRef * 0.04)} L ${Math.max(7, scaleRef * 0.03)} ${-Math.max(7, scaleRef * 0.028)} L 0 ${-Math.max(5, scaleRef * 0.018)} Z`}
              fill="#34d399"
            />
          </g>
        )}

        {/* Tee box */}
        {pTee && (
          <g>
            <rect
              x={pTee.cx - teeW / 2}
              y={pTee.cy - teeH / 2}
              width={teeW}
              height={teeH}
              rx="1"
              fill="#161f1b"
              stroke="#8aa094"
              strokeWidth={greenStroke * 0.6}
            />
            <text
              x={pTee.cx}
              y={pTee.cy + teeH * 0.3}
              textAnchor="middle"
              fontSize={teeH * 0.85}
              fill="#8aa094"
              style={{ fontFamily: "monospace" }}
            >
              TEE
            </text>
          </g>
        )}

        {/* Hazards */}
        {hazards.map((h) => {
          const p = project(h);
          return (
            <circle
              key={h.id}
              cx={p.cx}
              cy={p.cy}
              r={hazardR}
              fill={HAZARD_FILL[h.kind]}
              fillOpacity="0.55"
              stroke={HAZARD_FILL[h.kind]}
              strokeWidth={greenStroke * 0.6}
            />
          );
        })}
      </svg>

      {/* GPS dot (HTML, so we can use CSS keyframe pulse-strong). */}
      {pPlayer && (
        <div
          className="absolute z-[16] pointer-events-none"
          style={{
            left: `${(pPlayer.cx / Vw) * 100}%`,
            top: `${(pPlayer.cy / Vh) * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
          aria-label="Your position"
        >
          <div className="relative">
            {/* Halo */}
            <div
              className="absolute -inset-2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(52,211,153,0.28) 0%, rgba(52,211,153,0) 70%)",
              }}
            />
            {/* Core */}
            <div
              className="relative w-3.5 h-3.5 rounded-full bg-accent pulse-strong"
              style={{
                border: "2px solid rgb(var(--ink-on-accent))",
              }}
            />
          </div>
        </div>
      )}

      {/* Aim marker -- bigger, more refined than the SVG circle alone. */}
      {pAim && (
        <div
          className="absolute z-[18] pointer-events-none"
          style={{
            left: `${(pAim.cx / Vw) * 100}%`,
            top: `${(pAim.cy / Vh) * 100}%`,
            transform: "translate(-50%, -100%)",
            filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.6))",
          }}
          aria-label="Aim point"
        >
          <svg width="28" height="34" viewBox="0 0 28 34">
            <circle
              cx="14"
              cy="14"
              r="11"
              fill="rgba(52,211,153,0.18)"
              stroke="#34d399"
              strokeWidth="1.5"
            />
            <circle cx="14" cy="14" r="3" fill="#34d399" />
            <line
              x1="14"
              y1="14"
              x2="14"
              y2="32"
              stroke="#34d399"
              strokeWidth="1.4"
              strokeDasharray="2 3"
            />
          </svg>
        </div>
      )}

      {/* Yardage pills. Rendered through LandmarkLayer so pills can
          (a) consume the surrounding PinchZoom's ZoomContext and stay
          constant on-screen size at every zoom level, and (b) collapse
          overlapping hazard pills into a single chip with a "+N"
          count, so a green surrounded by bunkers doesn't pile up
          into an illegible stack. */}
      {landmarks && landmarks.length > 0 && (
        <LandmarkLayer
          items={landmarks.map((l) => {
            const pos = project({ lat: l.lat, lng: l.lng });
            return {
              landmark: l,
              // Container-relative pixels at scale=1. Used by the
              // cluster pass to measure on-screen overlap.
              px: (pos.cx / Vw) * size.w,
              py: (pos.cy / Vh) * size.h,
              // Percent form for left/top so positioning survives
              // container resizes.
              leftPct: (pos.cx / Vw) * 100,
              topPct: (pos.cy / Vh) * 100,
            };
          })}
        />
      )}

      {/* Calibration chips (+F / +B / +Tee). Positioned near the
          relevant feature so the player can tap to refine. */}
      {calibration?.showFront && pGC && calibration.onMarkFront && (
        <MapChip
          tone="gold"
          label="+ Mark front"
          x={pGC.cx + scaleRef * 0.04}
          y={pGC.cy + scaleRef * 0.05}
          Vw={Vw}
          Vh={Vh}
          onClick={calibration.onMarkFront}
        />
      )}
      {calibration?.showBack && pGC && calibration.onMarkBack && (
        <MapChip
          tone="gold"
          label="+ Mark back"
          x={pGC.cx + scaleRef * 0.04}
          y={pGC.cy - scaleRef * 0.05}
          Vw={Vw}
          Vh={Vh}
          onClick={calibration.onMarkBack}
        />
      )}
      {calibration?.showTee && pPlayer && calibration.onMarkTee && (
        <MapChip
          tone="gold"
          label="+ Mark tee here"
          x={pPlayer.cx}
          y={pPlayer.cy + scaleRef * 0.08}
          Vw={Vw}
          Vh={Vh}
          onClick={calibration.onMarkTee}
        />
      )}

      {/* Empty-state chips (unmapped hole). */}
      {emptyState?.show && (
        <>
          <MapChip
            tone="accent"
            label="Tap to mark green here"
            x={Vw * 0.5}
            y={Vh * 0.32}
            Vw={Vw}
            Vh={Vh}
            onClick={emptyState.onMarkGreen}
            big
          />
          <MapChip
            tone="gold"
            label="Tap to mark tee here"
            x={Vw * 0.5}
            y={Vh * 0.7}
            Vw={Vw}
            Vh={Vh}
            onClick={emptyState.onMarkTee}
            big
          />
        </>
      )}
      </PinchZoom>

      {/* Pan-zoom preset chips. One tap pans + zooms to the named
          feature so the user can flip between the three "views" you
          actually want on-course (off the tee, fairway approach, on
          the green) without pinching. Sits outside PinchZoom in DOM
          order so the chrome doesn't get scaled. */}
      {(pTee || pGC) && (
        <PresetChips
          pinchRef={pinchRef}
          tee={pTee ? { fx: pTee.cx / Vw, fy: pTee.cy / Vh } : null}
          green={pGC ? { fx: pGC.cx / Vw, fy: pGC.cy / Vh } : null}
        />
      )}
    </div>
  );
}

// Floating pill used for both calibration chips (small, anchored at a
// feature) and empty-state prompts (larger, centered). Tone selects
// the border + dot colour; the verb in the label is highlighted in
// the same colour.
function MapChip({
  tone,
  label,
  x,
  y,
  Vw,
  Vh,
  onClick,
  big = false,
}: {
  tone: "accent" | "gold";
  label: string;
  x: number;
  y: number;
  Vw: number;
  Vh: number;
  onClick: () => void;
  big?: boolean;
}) {
  const dotColor = tone === "accent" ? "bg-accent" : "bg-gold";
  const verbColor = tone === "accent" ? "text-accent" : "text-gold";
  const borderColor =
    tone === "accent"
      ? "border-accent/35"
      : "border-gold/40";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={
        "absolute z-[22] inline-flex items-center gap-2 rounded-full bg-bg/85 backdrop-blur-md border shadow-[0_6px_20px_-6px_rgba(0,0,0,0.6)] pointer-events-auto " +
        borderColor +
        " " +
        (big ? "px-4 py-2.5" : "px-3 py-2")
      }
      style={{
        left: `${(x / Vw) * 100}%`,
        top: `${(y / Vh) * 100}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <span
        className={
          "inline-block rounded-full pulse-dot " +
          dotColor +
          " " +
          (big ? "w-2 h-2" : "w-1.5 h-1.5")
        }
      />
      <span
        className={
          "font-mono tracking-[0.1em] uppercase text-ink " +
          (big ? "text-[11.5px]" : "text-[10.5px]")
        }
      >
        {label.split(" ").map((word, i, arr) => {
          // First word ("Tap" / "+") and the highlighted verb get the
          // tone colour. Simple heuristic: words "green" / "tee" /
          // "front" / "back" / "mark" get coloured.
          const lower = word.toLowerCase().replace(/[^a-z]/g, "");
          const highlight = ["green", "tee", "front", "back", "mark", "+"].includes(
            lower,
          );
          return (
            <span key={i} className={highlight ? verbColor : ""}>
              {word}
              {i < arr.length - 1 ? " " : ""}
            </span>
          );
        })}
      </span>
    </button>
  );
}

// =====================================================================
// LANDMARK LAYER
// =====================================================================
//
// Renders yardage pills as constant-size overlays (so they don't grow
// with the satellite when the user zooms in) and groups nearby
// hazard-style pills into a single cluster chip so a green surrounded
// by bunkers stays readable.

type LandmarkItem = {
  landmark: Landmark;
  px: number;
  py: number;
  leftPct: number;
  topPct: number;
};

function LandmarkLayer({ items }: { items: LandmarkItem[] }) {
  // Live zoom from the surrounding PinchZoom. Both the inverse-scale
  // and the clustering threshold are driven from this -- as the user
  // zooms in, pills stay the same size and the unscaled distance
  // that counts as "overlapping" shrinks (so fewer cluster).
  const zoom = useZoom();

  // Hazard ids are namespaced with "hz-" by HoleStudyMode /
  // OnCourseMode. Pin / AIM / Front / Back are navigational and
  // always render solo so they can never get hidden inside a cluster.
  const isHazard = (l: Landmark) =>
    l.id.startsWith("hz-") || l.variant === "tiny";

  // One pill is ~80px wide at constant size. If two centers land
  // within ~85 visual pixels of each other, they collide. Convert
  // to the unscaled-px space the items[] coords live in by dividing
  // by zoom: at zoom=2 the visual budget covers half as many
  // unscaled px, so the cluster shrinks.
  const VISUAL_OVERLAP_PX = 85;
  const threshold = VISUAL_OVERLAP_PX / Math.max(0.25, zoom);

  // Greedy clustering of hazard items only. O(n^2) but n is small
  // (typically <20 per hole).
  type Cluster = { members: LandmarkItem[]; centerX: number; centerY: number };
  const clusters: Cluster[] = [];
  const assigned = new Set<number>();
  const hazardItems = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => isHazard(it.landmark));
  for (const { it, i } of hazardItems) {
    if (assigned.has(i)) continue;
    const members = [it];
    assigned.add(i);
    for (const { it: other, i: j } of hazardItems) {
      if (assigned.has(j)) continue;
      const d = Math.hypot(it.px - other.px, it.py - other.py);
      if (d < threshold) {
        members.push(other);
        assigned.add(j);
      }
    }
    const cx = members.reduce((s, m) => s + m.leftPct, 0) / members.length;
    const cy = members.reduce((s, m) => s + m.topPct, 0) / members.length;
    clusters.push({ members, centerX: cx, centerY: cy });
  }

  const navLandmarks = items.filter((it) => !isHazard(it.landmark));

  return (
    <>
      {navLandmarks.map((it) => (
        <LandmarkPill
          key={it.landmark.id}
          landmark={it.landmark}
          leftPct={it.leftPct}
          topPct={it.topPct}
          zoom={zoom}
        />
      ))}
      {clusters.map((c) => {
        if (c.members.length === 1) {
          const it = c.members[0];
          return (
            <LandmarkPill
              key={it.landmark.id}
              landmark={it.landmark}
              leftPct={it.leftPct}
              topPct={it.topPct}
              zoom={zoom}
            />
          );
        }
        // Multi-member: collapse to a single chip showing the
        // closest distance + a "+N" badge. Closest is most relevant
        // for shot planning.
        const sorted = [...c.members].sort(
          (a, b) => a.landmark.yds - b.landmark.yds,
        );
        const nearest = sorted[0].landmark;
        const counts = new Map<string, number>();
        for (const m of c.members) {
          const p = m.landmark.prefix ?? "";
          counts.set(p, (counts.get(p) ?? 0) + 1);
        }
        let dominantPrefix = nearest.prefix ?? "";
        let dominantCount = 0;
        for (const [p, n] of counts.entries()) {
          if (n > dominantCount) {
            dominantPrefix = p;
            dominantCount = n;
          }
        }
        return (
          <ClusterPill
            key={`cluster-${c.members.map((m) => m.landmark.id).join(":")}`}
            leftPct={c.centerX}
            topPct={c.centerY}
            prefix={dominantPrefix}
            yds={nearest.yds}
            extra={c.members.length - 1}
            tone={nearest.tone ?? "white"}
            dim={c.members.every((m) => m.landmark.dim)}
            zoom={zoom}
          />
        );
      })}
    </>
  );
}

function LandmarkPill({
  landmark: l,
  leftPct,
  topPct,
  zoom,
}: {
  landmark: Landmark;
  leftPct: number;
  topPct: number;
  zoom: number;
}) {
  const orient = l.orientation ?? "above";
  const variant = l.variant ?? "default";
  const tone = l.tone ?? "white";
  const isAccent = variant === "accent";
  const isTiny = variant === "tiny";
  const bodyBg = isAccent
    ? "bg-accent text-ink-on-accent"
    : tone === "sand"
      ? "bg-white/95 text-[#3a2d10]"
      : tone === "water"
        ? "bg-white/95 text-[#0d2b48]"
        : "bg-white text-[#0b0f0c]";
  const prefixCls = isAccent
    ? "text-ink-on-accent/55"
    : tone === "sand"
      ? "text-[#8a7a4f]"
      : tone === "water"
        ? "text-[#5d80a8]"
        : "text-[#6b7c75]";
  const dimCls = l.dim ? "opacity-50" : "";
  const bodySizing = isTiny
    ? "px-1.5 py-[3px] text-[11px] rounded-[7px]"
    : "px-2.5 py-[4px] text-[15px] rounded-[10px]";
  const prefixSize = isTiny ? "text-[7.5px]" : "text-[8.5px]";
  const tailColor = isAccent ? "#34d399" : "#ffffff";
  const tailSize = isTiny ? 4 : 5;
  const tailH = isTiny ? 5 : 6;

  // Counter-scale by 1/zoom so the pill keeps its on-screen size as
  // the satellite image grows underneath. transform-origin pins the
  // tail tip to the projected pixel: bottom-center for "above" (tail
  // points down at the feature), top-center for "below" (points up).
  const scaleFactor = 1 / Math.max(0.25, zoom);
  const transform =
    orient === "above"
      ? `translate(-50%, -100%) scale(${scaleFactor})`
      : `translate(-50%, 0) scale(${scaleFactor})`;
  const origin = orient === "above" ? "50% 100%" : "50% 0%";

  return (
    <div
      className={"absolute z-[20] pointer-events-none " + dimCls}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform,
        transformOrigin: origin,
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))",
      }}
    >
      {orient === "below" && (
        <div
          className="mx-auto"
          style={{
            width: 0,
            height: 0,
            borderLeft: `${tailSize}px solid transparent`,
            borderRight: `${tailSize}px solid transparent`,
            borderBottom: `${tailH}px solid ${tailColor}`,
            marginBottom: -1,
          }}
        />
      )}
      <div
        className={
          "font-mono tabular-nums font-semibold inline-flex items-baseline gap-[3px] " +
          bodySizing +
          " " +
          bodyBg
        }
      >
        {l.prefix && (
          <span
            className={
              "uppercase font-medium tracking-[0.14em] mr-[2px] " +
              prefixSize +
              " " +
              prefixCls
            }
          >
            {l.prefix}
          </span>
        )}
        {Math.round(l.yds)}
        <span className={"font-medium text-[9px] " + prefixCls}>y</span>
      </div>
      {orient === "above" && (
        <div
          className="mx-auto"
          style={{
            width: 0,
            height: 0,
            borderLeft: `${tailSize}px solid transparent`,
            borderRight: `${tailSize}px solid transparent`,
            borderTop: `${tailH}px solid ${tailColor}`,
            marginTop: -1,
          }}
        />
      )}
    </div>
  );
}

function ClusterPill({
  leftPct,
  topPct,
  prefix,
  yds,
  extra,
  tone,
  dim,
  zoom,
}: {
  leftPct: number;
  topPct: number;
  prefix: string;
  yds: number;
  extra: number;
  tone: Landmark["tone"];
  dim: boolean;
  zoom: number;
}) {
  const bodyBg =
    tone === "sand"
      ? "bg-white/95 text-[#3a2d10]"
      : tone === "water"
        ? "bg-white/95 text-[#0d2b48]"
        : "bg-white text-[#0b0f0c]";
  const prefixCls =
    tone === "sand"
      ? "text-[#8a7a4f]"
      : tone === "water"
        ? "text-[#5d80a8]"
        : "text-[#6b7c75]";
  const scaleFactor = 1 / Math.max(0.25, zoom);
  return (
    <div
      className={
        "absolute z-[21] pointer-events-none " + (dim ? "opacity-50" : "")
      }
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(-50%, -100%) scale(${scaleFactor})`,
        transformOrigin: "50% 100%",
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))",
      }}
    >
      <div
        className={
          "font-mono tabular-nums font-semibold inline-flex items-center gap-[4px] " +
          "px-2 py-[3px] text-[12px] rounded-[8px] " +
          bodyBg
        }
      >
        {prefix && (
          <span
            className={
              "uppercase font-medium tracking-[0.14em] text-[8px] " +
              prefixCls
            }
          >
            {prefix}
          </span>
        )}
        <span>{Math.round(yds)}</span>
        <span className={"font-medium text-[9px] " + prefixCls}>y</span>
        <span
          className={
            "ml-[2px] inline-flex items-center justify-center " +
            "rounded-full bg-black/85 text-white text-[9px] font-semibold " +
            "px-1.5 py-[1px] min-w-[18px]"
          }
        >
          +{extra}
        </span>
      </div>
      <div
        className="mx-auto"
        style={{
          width: 0,
          height: 0,
          borderLeft: "4px solid transparent",
          borderRight: "4px solid transparent",
          borderTop: "5px solid #ffffff",
          marginTop: -1,
        }}
      />
    </div>
  );
}

// =====================================================================
// PRESET CHIPS
// =====================================================================
//
// Three-button pill row that drives the surrounding PinchZoom via its
// imperative handle. Lives bottom-center where it won't clash with
// the +/- buttons (top-right) or chrome the parent overlays on the
// map. "Hole" resets to the full-hole view; the others pan + zoom
// to the named feature.
function PresetChips({
  pinchRef,
  tee,
  green,
}: {
  pinchRef: React.RefObject<PinchZoomHandle>;
  tee: { fx: number; fy: number } | null;
  green: { fx: number; fy: number } | null;
}) {
  // Mid = geometric midpoint of tee->green. Hidden if either
  // endpoint is missing rather than guessed.
  const mid =
    tee && green
      ? { fx: (tee.fx + green.fx) / 2, fy: (tee.fy + green.fy) / 2 }
      : null;

  // Tracks which preset is active so the user can see at a glance
  // where they were sent. v1 doesn't observe ad-hoc pinches, so the
  // chip stays highlighted until another preset is tapped or the
  // user hits Hole; acceptable tradeoff vs. wiring an onZoomChange
  // callback through PinchZoom.
  const [active, setActive] = useState<"tee" | "mid" | "green" | "hole">(
    "hole",
  );

  const onTap = (
    label: "tee" | "mid" | "green",
    target: { fx: number; fy: number } | null,
  ) => {
    if (!target || !pinchRef.current) return;
    if (active === label) {
      // Tapping the active preset again restores the full hole
      // view -- a nice "toggle" so you don't have to hunt for Hole.
      pinchRef.current.reset();
      setActive("hole");
      return;
    }
    pinchRef.current.zoomToFraction(target.fx, target.fy, 2.5);
    setActive(label);
  };

  const onHole = () => {
    pinchRef.current?.reset();
    setActive("hole");
  };

  const chipCls = (on: boolean, disabled: boolean) =>
    "px-3 py-1.5 text-[11px] font-mono font-medium tracking-[0.04em] uppercase " +
    "rounded-full backdrop-blur-sm transition-colors " +
    (disabled
      ? "bg-black/40 text-white/40 cursor-not-allowed"
      : on
        ? "bg-accent text-bg shadow-[0_0_0_1px_rgb(var(--color-accent)/0.5)]"
        : "bg-black/70 text-white active:bg-black/85");

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-30 flex gap-1.5"
      style={{
        bottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <button
        type="button"
        onClick={() => onTap("tee", tee)}
        disabled={!tee}
        className={chipCls(active === "tee", !tee)}
        aria-pressed={active === "tee"}
      >
        Tee
      </button>
      <button
        type="button"
        onClick={() => onTap("mid", mid)}
        disabled={!mid}
        className={chipCls(active === "mid", !mid)}
        aria-pressed={active === "mid"}
      >
        Mid
      </button>
      <button
        type="button"
        onClick={() => onTap("green", green)}
        disabled={!green}
        className={chipCls(active === "green", !green)}
        aria-pressed={active === "green"}
      >
        Green
      </button>
      <button
        type="button"
        onClick={onHole}
        className={chipCls(active === "hole", false)}
        aria-pressed={active === "hole"}
      >
        Hole
      </button>
    </div>
  );
}
