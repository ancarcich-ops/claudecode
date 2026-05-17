"use client";

// Top-down hole map. When NEXT_PUBLIC_MAPBOX_TOKEN is set, the base
// layer is a Mapbox satellite image of the bounding box of all known
// features. Without a token we fall back to the dark schematic.
//
// Either way, the SVG overlay draws:
//   - Player position (live GPS)
//   - Tee (lat/lng)
//   - Green: prefer a full polygon, fall back to a sized oval from F/C/B
//   - Hazards (water/sand/oob points)
//   - Optional aim point + play line
//
// Projection: linear in lng, Web Mercator in lat -- exactly how Mapbox
// renders its static-bbox image, so the overlays line up to within a
// fraction of a yard at golf-course scale.

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

  // Everything we'll consider for the bbox. We deliberately include
  // the player + aim too -- a player who walks far off-line shouldn't
  // slide off the map.
  const all: Pt[] = [];
  if (player) all.push(player);
  if (tee) all.push(tee);
  if (greenCenter) all.push(greenCenter);
  if (greenFront) all.push(greenFront);
  if (greenBack) all.push(greenBack);
  if (greenPolygon) all.push(...greenPolygon);
  for (const h of hazards) all.push(h);
  if (aim) all.push(aim);
  if (all.length < 2) return null;

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

  // Pad ~12% so points don't sit on the very edge.
  const padFrac = 0.12;
  const dLng = Math.max(maxLng - minLng, 1e-6);
  const dLat = Math.max(maxLat - minLat, 1e-6);
  minLng -= dLng * padFrac;
  maxLng += dLng * padFrac;
  minLat -= dLat * padFrac;
  maxLat += dLat * padFrac;

  // Square the bbox in meters so a square image isn't squashed
  // (lng spans more meters near the equator, less near the poles).
  const midLat = (minLat + maxLat) / 2;
  const cosMid = Math.cos((midLat * Math.PI) / 180);
  const lngMeters = (maxLng - minLng) * cosMid;
  const latMeters = maxLat - minLat;
  if (lngMeters > latMeters) {
    const extra = (lngMeters - latMeters) / 2;
    minLat -= extra;
    maxLat += extra;
  } else {
    const extraLng = (latMeters - lngMeters) / 2 / cosMid;
    minLng -= extraLng;
    maxLng += extraLng;
  }

  const V = 200;

  // Linear-in-lng, Mercator-in-lat projection into [0, V] on both
  // axes. y inverted so north = up.
  const minMercY = mercY(minLat);
  const maxMercY = mercY(maxLat);
  const project = (p: Pt) => ({
    cx: ((p.lng - minLng) / (maxLng - minLng)) * V,
    cy: V - ((mercY(p.lat) - minMercY) / (maxMercY - minMercY)) * V,
  });

  const unproject = (cx: number, cy: number): Pt => {
    const lng = minLng + (cx / V) * (maxLng - minLng);
    const my = minMercY + ((V - cy) / V) * (maxMercY - minMercY);
    const latRad = 2 * (Math.atan(Math.exp(my)) - Math.PI / 4);
    const lat = (latRad * 180) / Math.PI;
    return { lat, lng };
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onAim) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * V;
    const cy = ((e.clientY - rect.top) / rect.height) * V;
    onAim(unproject(cx, cy));
  };

  const pPlayer = player ? project(player) : null;
  const pTee = tee ? project(tee) : null;
  const pGC = greenCenter ? project(greenCenter) : null;
  const pGF = greenFront ? project(greenFront) : null;
  const pGB = greenBack ? project(greenBack) : null;
  const pAim = aim ? project(aim) : null;

  // Mapbox satellite static image at this bbox. Pulled with @2x for
  // retina; rendered to fill the viewbox. The URL is stable per-bbox
  // so the browser cache covers re-renders within the same hole. We
  // strip attribution / logo so the map stays clean -- attribution
  // appears once on the page in the corner.
  const tileUrl = MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${minLng.toFixed(6)},${minLat.toFixed(6)},${maxLng.toFixed(6)},${maxLat.toFixed(6)}]/512x512@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`
    : null;

  // Schematic fairway corridor: a thick translucent line from tee to
  // green. Only shown when there's no satellite -- over a real photo
  // the corridor reads as noise.
  let fairwayWidth = 14;
  if (pTee && pGC) {
    const px = pTee.cx - pGC.cx;
    const py = pTee.cy - pGC.cy;
    const lenPx = Math.sqrt(px * px + py * py);
    fairwayWidth = Math.max(8, Math.min(22, lenPx * 0.12));
  }

  return (
    <svg
      viewBox={`0 0 ${V} ${V}`}
      className={"w-full h-full " + (onAim ? "cursor-crosshair" : "")}
      role="img"
      aria-label="Hole map"
      onClick={onAim ? handleSvgClick : undefined}
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
          width={V}
          height={V}
          preserveAspectRatio="xMidYMid slice"
        />
      )}

      {/* Tiny diagnostic badge so we can see, at a glance, whether the
          NEXT_PUBLIC_MAPBOX_TOKEN reached the client bundle. "SAT" =
          token present, image request is firing. "NO SAT" = token
          missing -- env var didn't make it into the build. */}
      <text
        x={V - 2}
        y="6"
        textAnchor="end"
        fontSize="4"
        fill={tileUrl ? "#34d399" : "#f87171"}
        fillOpacity="0.75"
        style={{ fontFamily: "monospace" }}
      >
        {tileUrl ? "SAT" : "NO SAT"}
      </text>

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
          strokeWidth="1.75"
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
          strokeWidth="1.5"
          strokeDasharray="3 3"
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
          strokeWidth="1.5"
          strokeDasharray="3 3"
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
          strokeWidth="1.75"
        />
      ) : pGC ? (
        <ellipse
          cx={pGC.cx}
          cy={pGC.cy}
          rx={pGF || pGB ? 10 : 7}
          ry={pGF || pGB ? 6 : 5}
          fill={tileUrl ? "none" : "#34d399"}
          fillOpacity={tileUrl ? 0 : 0.22}
          stroke="#34d399"
          strokeWidth="1.75"
        />
      ) : null}
      {pGF && <circle cx={pGF.cx} cy={pGF.cy} r="2" fill="#34d399" />}
      {pGB && <circle cx={pGB.cx} cy={pGB.cy} r="2" fill="#34d399" />}

      {pTee && (
        <g>
          <rect
            x={pTee.cx - 5}
            y={pTee.cy - 3}
            width="10"
            height="6"
            rx="1"
            fill="#161f1b"
            stroke="#8aa094"
            strokeWidth="1"
          />
          <text
            x={pTee.cx}
            y={pTee.cy + 1.5}
            textAnchor="middle"
            fontSize="4"
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
            r="4"
            fill={HAZARD_FILL[h.kind]}
            fillOpacity="0.55"
            stroke={HAZARD_FILL[h.kind]}
            strokeWidth="1"
          />
        );
      })}

      {pPlayer && (
        <>
          <circle
            cx={pPlayer.cx}
            cy={pPlayer.cy}
            r="5"
            fill="#34d399"
            fillOpacity="0.3"
          />
          <circle
            cx={pPlayer.cx}
            cy={pPlayer.cy}
            r="2.5"
            fill="#34d399"
            stroke="#0b0f0c"
            strokeWidth="1"
          />
        </>
      )}

      {pAim && (
        <g style={{ pointerEvents: "none" }}>
          <circle
            cx={pAim.cx}
            cy={pAim.cy}
            r="6"
            fill="none"
            stroke="#e8f0ea"
            strokeWidth="1.25"
          />
          <circle
            cx={pAim.cx}
            cy={pAim.cy}
            r="2.4"
            fill="#e8f0ea"
            stroke="#0b0f0c"
            strokeWidth="0.8"
          />
          <line
            x1={pAim.cx - 8}
            y1={pAim.cy}
            x2={pAim.cx - 4}
            y2={pAim.cy}
            stroke="#e8f0ea"
            strokeWidth="0.8"
          />
          <line
            x1={pAim.cx + 4}
            y1={pAim.cy}
            x2={pAim.cx + 8}
            y2={pAim.cy}
            stroke="#e8f0ea"
            strokeWidth="0.8"
          />
        </g>
      )}
    </svg>
  );
}
