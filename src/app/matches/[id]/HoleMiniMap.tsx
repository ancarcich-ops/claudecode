"use client";

// Minimal top-down hole map. Renders whatever we have:
//   - Player dot if GPS is on
//   - Green (with F/B markers if known)
//   - Hazards (water/sand/oob dots)
//
// No tiles, no satellite imagery -- just the points we've collected,
// projected onto a local meter frame and auto-fit into the viewbox.
// The hole shape "comes in" as more points get marked.

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
  greenCenter,
  greenFront,
  greenBack,
  hazards,
}: {
  player: Pt | null;
  greenCenter: Pt | null;
  greenFront: Pt | null;
  greenBack: Pt | null;
  hazards: Hazard[];
}) {
  const points: { pt: Pt; tag: string }[] = [];
  if (player) points.push({ pt: player, tag: "player" });
  if (greenCenter) points.push({ pt: greenCenter, tag: "greenC" });
  if (greenFront) points.push({ pt: greenFront, tag: "greenF" });
  if (greenBack) points.push({ pt: greenBack, tag: "greenB" });
  for (const h of hazards) points.push({ pt: h, tag: `hz-${h.id}` });
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

  const xs = xy.map((p) => p.x);
  const ys = xy.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  // Viewbox: 200x200, ~14 unit padding for hits.
  const V = 200;
  const PAD = 14;
  const scale = Math.min(
    (V - PAD * 2) / w,
    (V - PAD * 2) / h,
  );
  const project = (p: { x: number; y: number }) => ({
    cx: PAD + (p.x - minX) * scale,
    cy: PAD + (p.y - minY) * scale,
  });
  const at = (tag: string) => {
    const m = xy.find((p) => p.tag === tag);
    return m ? project(m) : null;
  };

  const pPlayer = at("player");
  const pGC = at("greenC");
  const pGF = at("greenF");
  const pGB = at("greenB");

  return (
    <svg
      viewBox={`0 0 ${V} ${V}`}
      className="w-full h-full"
      role="img"
      aria-label="Hole map"
    >
      {/* Player -> green line */}
      {pPlayer && pGC && (
        <line
          x1={pPlayer.cx}
          y1={pPlayer.cy}
          x2={pGC.cx}
          y2={pGC.cy}
          stroke="#34d399"
          strokeOpacity="0.5"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      )}
      {/* Green: front/center/back as an oval */}
      {pGC && (
        <ellipse
          cx={pGC.cx}
          cy={pGC.cy}
          rx={pGF || pGB ? 9 : 6}
          ry={pGF || pGB ? 5 : 4}
          fill="#34d399"
          fillOpacity="0.18"
          stroke="#34d399"
          strokeWidth="1.5"
        />
      )}
      {/* Front / back as small dots if user-marked */}
      {pGF && <circle cx={pGF.cx} cy={pGF.cy} r="2" fill="#34d399" />}
      {pGB && <circle cx={pGB.cx} cy={pGB.cy} r="2" fill="#34d399" />}
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
            fillOpacity="0.5"
            stroke={HAZARD_FILL[h.kind]}
            strokeWidth="1"
          />
        );
      })}
      {/* Player dot last so it sits on top */}
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
