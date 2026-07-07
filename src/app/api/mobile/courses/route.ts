// GET /api/mobile/courses?q=...&lat=...&lng=...
// Auth: Bearer token. Course picker for the iOS start-a-round flow.
// Searches the pre-mapped catalog (COURSE_PRESETS -- the same list the
// web new-match form requires); free-text course names are not
// accepted at create time. With lat/lng and no q, returns the nearest
// courses ("near me"). Max 20.
// 200: { "courses": [{ "id", "name", "city", "holes", "access",
//        "distanceMi" (only when lat/lng given) }] }

import { NextResponse, type NextRequest } from "next/server";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { COURSE_PRESETS, COURSE_PRESET_COORDS } from "@/lib/courses";

export const dynamic = "force-dynamic";

function milesBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(s));
}

export async function GET(req: NextRequest) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const hasCoord = Number.isFinite(lat) && Number.isFinite(lng);

  let list = COURSE_PRESETS.map((p) => {
    const coord = COURSE_PRESET_COORDS[p.id];
    const distanceMi =
      hasCoord && coord
        ? Math.round(milesBetween(lat, lng, coord.lat, coord.lng) * 10) / 10
        : null;
    return {
      id: p.id,
      name: p.name,
      city: p.city,
      holes: p.holes,
      access: p.access,
      distanceMi,
    };
  });

  if (q) {
    // Rank: name starts-with, then name contains, then city contains.
    const scored = list
      .map((c) => {
        const name = c.name.toLowerCase();
        const city = c.city.toLowerCase();
        const s = name.startsWith(q)
          ? 0
          : name.includes(q)
            ? 1
            : city.includes(q)
              ? 2
              : -1;
        return { c, s };
      })
      .filter((x) => x.s >= 0)
      .sort((a, b) => {
        if (a.s !== b.s) return a.s - b.s;
        // Nearer first within a tier when we know where the user is.
        const da = a.c.distanceMi ?? Infinity;
        const db = b.c.distanceMi ?? Infinity;
        if (da !== db) return da - db;
        return a.c.name.localeCompare(b.c.name);
      });
    list = scored.map((x) => x.c);
  } else if (hasCoord) {
    list = list
      .filter((c) => c.distanceMi != null)
      .sort((a, b) => (a.distanceMi ?? 0) - (b.distanceMi ?? 0));
  } else {
    return NextResponse.json({ courses: [] });
  }

  return NextResponse.json({ courses: list.slice(0, 20) });
}
