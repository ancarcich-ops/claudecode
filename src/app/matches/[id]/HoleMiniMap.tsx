"use client";

import { useEffect, useRef, useState } from "react";

// Top-down hole map. When NEXT_PUBLIC_MAPBOX_TOKEN is set, the base
// layer is a Mapbox satellite image of the bounding box of all known
// features. Without a token we fall back to the dark schematic.
//
// The component measures its own rendered size with a ResizeObserver
// and requests a Mapbox image of the matching aspect ratio (and a
// viewBox of the matching aspect ratio), so the satellite fills the
// whole container with no letterboxing. The bbox is expanded on
// whichever axis needs more room to match the container aspect, so
// nothing gets cropped.
//
// Projection: linear in lng, Web Mercator in lat -- exactly how
// Mapbox renders its static-bbox image, so overlays align to within
// a fraction of a yard at golf-course scale.

type Pt = { lat: number; lng: number };
type Hazard = Pt & {
  id: string;
  kind: "WATER" | "SAND" | "OOB" | "OTHER";
};

const HAZARD_FILL = {
  WATER: "#60a5fa",
  SAND: "#fbbf24",
  OOB: "#f87171",
  OTHER: "#8aa094",
};

// Web Mercator y for lat in degrees.
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
}) {
  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Measure the rendered size so we can match the satellite image +
  // viewBox to the container aspect.
  const wrapRef = useRef<HTMLDivElement>(null);
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

  // Everything we'll consider for the bbox. We include the player +
  // aim too -- a player who walks far off-line shouldn't slide off
  // the map.
  const all: Pt[] = [];
  if (player) all.push(player);
  if (tee) all.push(tee);
  if (greenCenter) all.push(greenCenter);
  if (greenFront) all.push(greenFront);
  if (greenBack) all.push(greenBack);
  if (greenPolygon) all.push(...greenPolygon);
  for (const h of hazards) all.push(h);
  if (aim) all.push(aim);
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

  // Single-point bbox: blow it out to a ~160m square so satellite
  // imagery has useful context.
  if (all.length === 1) {
    const r = 0.00072; // ~80m at typical mid-latitudes
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

  // Expand the bbox on whichever axis is too short so it matches the
  // container's aspect ratio. Compare in METERS (lng has to be scaled
  // by cos(lat)). containerAspect = w/h, bboxAspect = lngMeters/latMeters.
  const midLat = (minLat + maxLat) / 2;
  const cosMid = Math.cos((midLat * Math.PI) / 180);
  const lngMeters = (maxLng - minLng) * cosMid;
  const latMeters = maxLat - minLat;
  const containerAspect = size.w / size.h;
  const bboxAspect = lngMeters / latMeters;
  if (bboxAspect > containerAspect) {
    // Bbox is wider than container -> need more latitude span.
    const targetLatMeters = lngMeters / containerAspect;
    const extra = (targetLatMeters - latMeters) / 2;
    minLat -= extra;
    maxLat += extra;
  } else if (bboxAspect < containerAspect) {
    // Bbox is taller than container -> need more longitude span.
    const targetLngMeters = latMeters * containerAspect;
    const extra = (targetLngMeters - lngMeters) / 2 / cosMid;
    minLng -= extra;
    maxLng += extra;
  }

  // ViewBox dimensions match the container. We use the rendered size
  // directly so overlay font sizes / radii scale naturally.
  const Vw = size.w;
  const Vh = size.h;

  // Projection: lng linear, lat Mercator -- both into [0, Vw] / [0, Vh].
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

  // Mapbox static image at the (expanded, aspect-matched) bbox. Size
  // clamped to 1280 in either axis (Mapbox limit). @2x for retina.
  const reqW = Math.min(1280, Math.max(64, Math.round(size.w)));
  const reqH = Math.min(1280, Math.max(64, Math.round(size.h)));
  const tileUrl = MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${minLng.toFixed(6)},${minLat.toFixed(6)},${maxLng.toFixed(6)},${maxLat.toFixed(6)}]/${reqW}x${reqH}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`
    : null;

  // Schematic fairway corridor only when there's no satellite.
  // Width scales with hole length.
  let fairwayWidth = 14;
  if (pTee && pGC) {
    const dx = pTee.cx - pGC.cx;
    const dy = pTee.cy - pGC.cy;
    const lenPx = Math.sqrt(dx * dx + dy * dy);
    fairwayWidth = Math.max(8, Math.min(28, lenPx * 0.08));
  }

  // Visual sizes scale gently with container so overlays don't look
  // tiny on a big screen or huge on a phone.
  const scaleRef = Math.min(Vw, Vh);
  const teeW = Math.max(8, scaleRef * 0.035);
  const teeH = Math.max(5, scaleRef * 0.022);
  const hazardR = Math.max(4, scaleRef * 0.018);
  const playerOuterR = Math.max(6, scaleRef * 0.024);
  const playerInnerR = Math.max(3, scaleRef * 0.012);
  const aimOuterR = Math.max(7, scaleRef * 0.03);
  const aimInnerR = Math.max(2.5, scaleRef * 0.012);
  const greenStroke = Math.max(1.5, scaleRef * 0.007);

  return (
    <div ref={wrapRef} className="w-full h-full">
      <svg
        viewBox={`0 0 ${Vw} ${Vh}`}
        className={"w-full h-full block " + (onAim ? "cursor-crosshair" : "")}
        role="img"
        aria-label="Hole map"
        onClick={onAim ? handleSvgClick : undefined}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="fairway-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {tileUrl && (
          <image
            href={tileUrl}
            xlinkHref={tileUrl}
            x="0"
            y="0"
            width={Vw}
            height={Vh}
            preserveAspectRatio="none"
          />
        )}

        {!tileUrl && pTee && pGC && (
          <line
            x1={pTee.cx}
            y1={pTee.cy}
            x2={pGC.cx}
            y2={pGC.cy}
            stroke="url(#fairway-grad)"
            strokeWidth={fairwayWidth}
            strokeLinecap="round"
          />
        )}

        {pPlayer && pAim && (
          <line
            x1={pPlayer.cx}
            y1={pPlayer.cy}
            x2={pAim.cx}
            y2={pAim.cy}
            stroke="#34d399"
            strokeOpacity="0.95"
            strokeWidth={greenStroke * 1.5}
          />
        )}
        {pAim && pGC && (
          <line
            x1={pAim.cx}
            y1={pAim.cy}
            x2={pGC.cx}
            y2={pGC.cy}
            stroke="#34d399"
            strokeOpacity="0.7"
            strokeWidth={greenStroke}
            strokeDasharray={`${greenStroke * 2} ${greenStroke * 2}`}
          />
        )}
        {pPlayer && pGC && !pAim && (
          <line
            x1={pPlayer.cx}
            y1={pPlayer.cy}
            x2={pGC.cx}
            y2={pGC.cy}
            stroke="#34d399"
            strokeOpacity="0.7"
            strokeWidth={greenStroke}
            strokeDasharray={`${greenStroke * 2} ${greenStroke * 2}`}
          />
        )}

        {greenPolygon && greenPolygon.length > 2 ? (
          <polygon
            points={greenPolygon
              .map((p) => {
                const pos = project(p);
                return `${pos.cx},${pos.cy}`;
              })
              .join(" ")}
            fill={tileUrl ? "none" : "#34d399"}
            fillOpacity={tileUrl ? 0 : 0.22}
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
            fillOpacity={tileUrl ? 0 : 0.22}
            stroke="#34d399"
            strokeWidth={greenStroke * 1.3}
          />
        ) : null}
        {pGF && (
          <circle cx={pGF.cx} cy={pGF.cy} r={hazardR * 0.5} fill="#34d399" />
        )}
        {pGB && (
          <circle cx={pGB.cx} cy={pGB.cy} r={hazardR * 0.5} fill="#34d399" />
        )}

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

        {pPlayer && (
          <>
            <circle
              cx={pPlayer.cx}
              cy={pPlayer.cy}
              r={playerOuterR}
              fill="#34d399"
              fillOpacity="0.3"
            />
            <circle
              cx={pPlayer.cx}
              cy={pPlayer.cy}
              r={playerInnerR}
              fill="#34d399"
              stroke="#0b0f0c"
              strokeWidth={greenStroke * 0.6}
            />
          </>
        )}

        {pAim && (
          <g style={{ pointerEvents: "none" }}>
            <circle
              cx={pAim.cx}
              cy={pAim.cy}
              r={aimOuterR}
              fill="none"
              stroke="#e8f0ea"
              strokeWidth={greenStroke}
            />
            <circle
              cx={pAim.cx}
              cy={pAim.cy}
              r={aimInnerR}
              fill="#e8f0ea"
              stroke="#0b0f0c"
              strokeWidth={greenStroke * 0.5}
            />
            <line
              x1={pAim.cx - aimOuterR * 1.4}
              y1={pAim.cy}
              x2={pAim.cx - aimOuterR * 0.6}
              y2={pAim.cy}
              stroke="#e8f0ea"
              strokeWidth={greenStroke * 0.5}
            />
            <line
              x1={pAim.cx + aimOuterR * 0.6}
              y1={pAim.cy}
              x2={pAim.cx + aimOuterR * 1.4}
              y2={pAim.cy}
              stroke="#e8f0ea"
              strokeWidth={greenStroke * 0.5}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
