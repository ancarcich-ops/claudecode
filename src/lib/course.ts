import { prisma } from "./db";
// distanceYards + deriveGreenDistances live in the Prisma-free ./geo
// module so client components can import them without pulling the DB
// client into the browser bundle. Re-exported here for server callers.
import { distanceYards } from "./geo";
export { distanceYards, deriveGreenDistances } from "./geo";

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
  teeLat: number | null;
  teeLng: number | null;
  // Parsed polygon (array of {lat,lng}) if we have one, else null.
  greenPolygon: { lat: number; lng: number }[] | null;
  fairwayPolygon: { lat: number; lng: number }[] | null;
  distanceYds: number | null;
  source: string | null;
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
      teeLat: h.teeLat,
      teeLng: h.teeLng,
      greenPolygon: parsePolygon(h.greenPolygonJson),
      fairwayPolygon: parsePolygon(h.fairwayPolygonJson),
      distanceYds: h.distanceYds,
      source: h.source,
    };
  }
  return out;
}

function parsePolygon(
  json: string | null,
): { lat: number; lng: number }[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    const out: { lat: number; lng: number }[] = [];
    for (const p of arr) {
      // Two shapes in the wild: legacy [[lat,lng],...] tuples and the
      // GolfBert importer's [{lat,lng},...] objects. Accept both.
      if (Array.isArray(p) && p.length >= 2) {
        const lat = Number(p[0]);
        const lng = Number(p[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng))
          out.push({ lat, lng });
      } else if (p && typeof p === "object" && "lat" in p && "lng" in p) {
        const lat = Number((p as { lat: unknown }).lat);
        const lng = Number((p as { lng: unknown }).lng);
        if (Number.isFinite(lat) && Number.isFinite(lng))
          out.push({ lat, lng });
      }
    }
    return out.length > 2 ? out : null;
  } catch {
    return null;
  }
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
