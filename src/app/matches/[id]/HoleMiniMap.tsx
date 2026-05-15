"use client";

// Top-down hole map. Renders the best of what's available:
//   - Player position (live GPS)
//   - Tee (lat/lng)
//   - Green: prefer a full polygon, fall back to a sized oval from F/C/B,
//     fall back to a single dot from the center
//   - Hazards (water/sand/oob points)
//   - A faint fairway corridor between tee and green when both are known
//
// No tiles, no satellite imagery -- just the points we've collected,
// projected onto a local meter frame and auto-fit into the viewbox.

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

export default function HoleMiniMap({
  player,
  tee,
  greenCenter,
  greenFront,
  greenBack,
  greenPolygon,
  hazards,
}: {
  player: Pt | null;
  tee: Pt | null;
  greenCenter: Pt | null;
  greenFront: Pt | null;
  greenBack: Pt | null;
  greenPolygon: Pt[] | null;
  hazards: Hazard[];
}) {
  // Collect every point we have so we can auto-fit the viewbox.
  const points: { pt: Pt; tag: string }[] = [];
  if (player) points.push({ pt: player, tag: "player" });
  if (tee) points.push({ pt: tee, tag: "tee" });
  if (greenCenter) points.push({ pt: greenCenter, tag: "greenC" });
  if (greenFront) points.push({ pt: greenFront, tag: "greenF" });
  if (greenBack) points.push({ pt: greenBack, tag: "greenB" });
  for (const h of hazards) points.push({ pt: h, tag: `hz-${h.id}` });
  if (greenPolygon) {
    greenPolygon.forEach((p, i) => points.push({ pt: p, tag: `gp-${i}` }));
  }
  if (points.length < 2) return null;

  // Equirectangular projection centered on the first point. Meters out.
  const ref = points[0].pt;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const cosLat = Math.cos(toRad(ref.lat));
  const xy = points.map(({ pt, tag }) => ({
    tag,
    x: toRad(pt.lng - ref.lng) * R * cosLat,
    y: -toRad(pt.lat - ref.lat) * R, // invert y so north = up
  }));

  // Rotate so tee->green points UP (negative y). Better than always
  // north-up: golfers want to see the line of play vertical. Skip if no
  // tee or green.
  const teeXY = xy.find((p) => p.tag === "tee");
  const greenCXY = xy.find((p) => p.tag === "greenC");
  let rot = 0;
  if (teeXY && greenCXY) {
    const dx = greenCXY.x - teeXY.x;
    const dy = greenCXY.y - teeXY.y;
    // Angle of tee->green from positive y-axis (up).
    // We want tee->green to point in -y direction (up on screen).
    rot = Math.atan2(dx, -dy);
  }
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const rotated = xy.map((p) => ({
    tag: p.tag,
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }));

  const xs = rotated.map((p) => p.x);
  const ys = rotated.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  const V = 200;
  const PAD = 12;
  const scale = Math.min((V - PAD * 2) / w, (V - PAD * 2) / h);
  const project = (p: { x: number; y: number }) => ({
    cx: PAD + (p.x - minX) * scale,
    cy: PAD + (p.y - minY) * scale,
  });
  const at = (tag: string) => {
    const m = rotated.find((p) => p.tag === tag);
    return m ? project(m) : null;
  };

  const pPlayer = at("player");
  const pTee = at("tee");
  const pGC = at("greenC");
  const pGF = at("greenF");
  const pGB = at("greenB");

  // Fairway corridor: a thick translucent line from tee to green.
  // Width scales with hole length so 600y par-5s and 130y par-3s read
  // proportionally.
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
      className="w-full h-full"
      role="img"
      aria-label="Hole map"
    >
      <defs>
        <linearGradient id="fairway-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {/* Fairway corridor */}
      {pTee && pGC && (
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

      {/* Player -> green dashed line */}
      {pPlayer && pGC && (
        <line
          x1={pPlayer.cx}
          y1={pPlayer.cy}
          x2={pGC.cx}
          y2={pGC.cy}
          stroke="#34d399"
          strokeOpacity="0.5"
          strokeWidth="1.25"
          strokeDasharray="3 3"
        />
      )}

      {/* Green: polygon if we have one, else an oval */}
      {greenPolygon && greenPolygon.length > 2 ? (
        <polygon
          points={greenPolygon
            .map((p, i) => {
              const pos = at(`gp-${i}`);
              return pos ? `${pos.cx},${pos.cy}` : "";
            })
            .filter(Boolean)
            .join(" ")}
          fill="#34d399"
          fillOpacity="0.22"
          stroke="#34d399"
          strokeWidth="1.5"
        />
      ) : pGC ? (
        <ellipse
          cx={pGC.cx}
          cy={pGC.cy}
          rx={pGF || pGB ? 10 : 7}
          ry={pGF || pGB ? 6 : 5}
          fill="#34d399"
          fillOpacity="0.22"
          stroke="#34d399"
          strokeWidth="1.5"
        />
      ) : null}
      {pGF && <circle cx={pGF.cx} cy={pGF.cy} r="2" fill="#34d399" />}
      {pGB && <circle cx={pGB.cx} cy={pGB.cy} r="2" fill="#34d399" />}

      {/* Tee box */}
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

      {/* Hazards */}
      {hazards.map((h) => {
        const p = at(`hz-${h.id}`);
        if (!p) return null;
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

      {/* Player dot on top */}
      {pPlayer && (
        <>
          <circle
            cx={pPlayer.cx}
            cy={pPlayer.cy}
            r="5"
            fill="#34d399"
            fillOpacity="0.25"
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
    </svg>
  );
}
