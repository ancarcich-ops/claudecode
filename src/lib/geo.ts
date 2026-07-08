// Pure client-safe golf geometry helpers. Kept in their OWN module (no
// Prisma / DB imports) so client components can import them without
// dragging the database client into the browser bundle.

// Type-only import -- erased at compile time, so it does NOT pull
// course.ts (and its Prisma import) into this module's runtime graph.
import type { HoleGeo } from "./course";

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

// Front / center / back distances (yards) from the player to a hole's
// green. Priority: admin-marked front/back points, else nearest/
// farthest green-polygon vertex (real depth from where you stand),
// else center -/+ 8y as a last resort. Pure -- no DB.
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

  const explicitFront =
    geo.greenFrontLat != null && geo.greenFrontLng != null
      ? distanceYards(player, { lat: geo.greenFrontLat, lng: geo.greenFrontLng })
      : null;
  const explicitBack =
    geo.greenBackLat != null && geo.greenBackLng != null
      ? distanceYards(player, { lat: geo.greenBackLat, lng: geo.greenBackLng })
      : null;

  let polyFront: number | null = null;
  let polyBack: number | null = null;
  if (
    (explicitFront == null || explicitBack == null) &&
    geo.greenPolygon &&
    geo.greenPolygon.length >= 3
  ) {
    let min = Infinity;
    let max = -Infinity;
    for (const v of geo.greenPolygon) {
      const d = distanceYards(player, v);
      if (d < min) min = d;
      if (d > max) max = d;
    }
    if (Number.isFinite(min)) polyFront = min;
    if (Number.isFinite(max)) polyBack = max;
  }

  const front = explicitFront ?? polyFront ?? Math.max(0, center - 8);
  const back = explicitBack ?? polyBack ?? center + 8;
  return { front, center, back };
}
