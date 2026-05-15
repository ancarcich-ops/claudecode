import { prisma } from "./db";

// Great-circle distance between two WGS84 coordinates, in yards. Uses the
// haversine formula -- plenty accurate at golf scale (sub-yard error over
// short distances). Returns 0 for identical points.
export function distanceYards(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const meters = R * c;
  return meters * 1.0936133;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Find-or-create a Course row by the free-text name used on Match.courseName.
// Idempotent. Caller usually has the matchId in hand and is about to write a
// CourseHole row -- we don't want to require an explicit "create course" step.
export async function findOrCreateCourseByName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Course name required");
  return prisma.course.upsert({
    where: { name: trimmed },
    create: { name: trimmed },
    update: {},
  });
}

// Return the per-hole geo for a course, indexed by hole number. Missing
// holes simply aren't present in the map.
export type HoleGeo = {
  hole: number;
  greenLat: number | null;
  greenLng: number | null;
  greenFrontLat: number | null;
  greenFrontLng: number | null;
  greenBackLat: number | null;
  greenBackLng: number | null;
  distanceYds: number | null;
};

export async function getCourseHolesByName(
  name: string,
): Promise<Record<number, HoleGeo>> {
  const trimmed = name.trim();
  if (!trimmed) return {};
  const course = await prisma.course.findUnique({
    where: { name: trimmed },
    include: { holes: true },
  });
  if (!course) return {};
  const out: Record<number, HoleGeo> = {};
  for (const h of course.holes) {
    out[h.hole] = {
      hole: h.hole,
      greenLat: h.greenLat,
      greenLng: h.greenLng,
      greenFrontLat: h.greenFrontLat,
      greenFrontLng: h.greenFrontLng,
      greenBackLat: h.greenBackLat,
      greenBackLng: h.greenBackLng,
      distanceYds: h.distanceYds,
    };
  }
  return out;
}

export type HazardKind = "WATER" | "SAND" | "OOB" | "OTHER";

export function isHazardKind(s: string): s is HazardKind {
  return s === "WATER" || s === "SAND" || s === "OOB" || s === "OTHER";
}

export type HazardGeo = {
  id: string;
  hole: number;
  kind: HazardKind;
  label: string | null;
  lat: number;
  lng: number;
};

// Return all hazards for a course, indexed by hole.
export async function getCourseHazardsByName(
  name: string,
): Promise<Record<number, HazardGeo[]>> {
  const trimmed = name.trim();
  if (!trimmed) return {};
  const course = await prisma.course.findUnique({
    where: { name: trimmed },
    include: { hazards: true },
  });
  if (!course) return {};
  const out: Record<number, HazardGeo[]> = {};
  for (const h of course.hazards) {
    if (!isHazardKind(h.kind)) continue;
    if (!out[h.hole]) out[h.hole] = [];
    out[h.hole].push({
      id: h.id,
      hole: h.hole,
      kind: h.kind,
      label: h.label,
      lat: h.lat,
      lng: h.lng,
    });
  }
  return out;
}

// Layup helper: given the player's current position, a target green center,
// and a hazard point that sits roughly between them, compute the distance
// the player needs to stop *before* the hazard. Strategy: project the
// hazard onto the player->green line and report player-to-projection minus
// a 5y buffer. If the projection is behind the player (negative t) or past
// the green (t > 1), the hazard isn't in play and we return null.
export function distanceToLayup(
  player: { lat: number; lng: number },
  green: { lat: number; lng: number },
  hazard: { lat: number; lng: number },
  bufferYards = 5,
): number | null {
  // Convert all three to a local meter-based frame centered on the player.
  // For sub-mile distances on a sphere, an equirectangular projection is
  // plenty accurate.
  const R = 6371000;
  const toRadLocal = (d: number) => (d * Math.PI) / 180;
  const cosLat = Math.cos(toRadLocal(player.lat));
  const toXY = (p: { lat: number; lng: number }) => ({
    x: toRadLocal(p.lng - player.lng) * R * cosLat,
    y: toRadLocal(p.lat - player.lat) * R,
  });
  const G = toXY(green);
  const H = toXY(hazard);
  const lenG2 = G.x * G.x + G.y * G.y;
  if (lenG2 < 1e-3) return null;
  const t = (H.x * G.x + H.y * G.y) / lenG2;
  if (t <= 0 || t >= 1) return null;
  const projX = G.x * t;
  const projY = G.y * t;
  const meters = Math.sqrt(projX * projX + projY * projY);
  const yards = meters * 1.0936133;
  return Math.max(0, yards - bufferYards);
}

// Compute the three working green distances. If front/back coords aren't
// user-set, we derive them from the center along the player->green axis
// (±8 yards each side) so the UI always shows three numbers once at least
// the center is mapped.
//
// Returns null entries when the corresponding coord can't be computed
// (no center, no player position, etc).
export function deriveGreenDistances(
  player: { lat: number; lng: number } | null,
  geo: HoleGeo | null | undefined,
): { front: number | null; center: number | null; back: number | null } {
  if (!geo || !player) return { front: null, center: null, back: null };
  const c =
    geo.greenLat != null && geo.greenLng != null
      ? { lat: geo.greenLat, lng: geo.greenLng }
      : null;
  if (!c) return { front: null, center: null, back: null };
  const center = distanceYards(player, c);
  // Front: prefer user-set; else center - 8y along the player->green line
  const front =
    geo.greenFrontLat != null && geo.greenFrontLng != null
      ? distanceYards(player, {
          lat: geo.greenFrontLat,
          lng: geo.greenFrontLng,
        })
      : Math.max(0, center - 8);
  // Back: prefer user-set; else center + 8y
  const back =
    geo.greenBackLat != null && geo.greenBackLng != null
      ? distanceYards(player, {
          lat: geo.greenBackLat,
          lng: geo.greenBackLng,
        })
      : center + 8;
  return { front, center, back };
}
