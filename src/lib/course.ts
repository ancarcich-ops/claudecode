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
