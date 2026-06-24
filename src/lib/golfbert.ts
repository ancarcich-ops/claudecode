// GolfBert API client. Signs every request with AWS SigV4
// (service: execute-api, region: us-east-1) and adds the X-Api-Key
// header. Server-only -- never bundle these credentials to the client.
//
// Spec sourced from the published Java client:
//   https://github.com/golfbert/gf-api-java-client
// Base URL: https://api.golfbert.com

import aws4 from "aws4";

const HOST = "api.golfbert.com";
const REGION = "us-east-1";
const SERVICE = "execute-api";

// Pulled from env at call-time so a missing var produces a clear error
// instead of a silent undefined.
function creds() {
  const apiKey = process.env.GOLFBERT_API_KEY;
  const accessKeyId = process.env.GOLFBERT_ACCESS_KEY;
  const secretAccessKey = process.env.GOLFBERT_SECRET_KEY;
  if (!apiKey || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "GolfBert credentials missing. Set GOLFBERT_API_KEY, GOLFBERT_ACCESS_KEY, GOLFBERT_SECRET_KEY in Vercel.",
    );
  }
  return { apiKey, accessKeyId, secretAccessKey };
}

// Lightweight call counter so bulk importers can pace themselves
// against Golfbert's daily quota (3,572/day on the All-Courses plan).
// The counter is process-local -- fine for the one-off scripts; the
// live Next.js app doesn't need to read it.
let gbCallCount = 0;
export function getGolfbertCallCount(): number {
  return gbCallCount;
}
export function resetGolfbertCallCount(): void {
  gbCallCount = 0;
}

async function gbFetch<T>(path: string): Promise<T> {
  const { apiKey, accessKeyId, secretAccessKey } = creds();
  const opts = {
    host: HOST,
    path,
    service: SERVICE,
    region: REGION,
    method: "GET",
    headers: { "x-api-key": apiKey },
  } as const;
  // aws4.sign mutates `opts` in place: adds Authorization +
  // X-Amz-Date based on the credentials.
  aws4.sign(opts as aws4.Request, { accessKeyId, secretAccessKey });
  const url = `https://${HOST}${path}`;
  gbCallCount++;
  const res = await fetch(url, {
    method: opts.method,
    headers: opts.headers as Record<string, string>,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GolfBert ${res.status} on ${path}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

// ---- API types (subset we actually use) ----------------------------

// JSON uses `long` (not `_long` -- that prefix is just the Java client
// dodging a reserved-word collision).
export type GBPoint = {
  lat: number;
  long: number;
  type?: string;
};

export type GBCourse = {
  id: number;
  name: string;
  coordinates?: GBPoint;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  phonenumber?: string;
};

export type GBHole = {
  id: number;
  courseid: number;
  number: number;
  rotation?: number;
  vectors?: GBPoint[];
  range?: { start?: GBPoint; end?: GBPoint };
  dimensions?: { length?: number; width?: number };
  flagcoords?: GBPoint;
};

export type GBHolePolygon = {
  holeid: number;
  // Observed values include "Green", "Fairway", "Bunker", "Water",
  // "Rough", "TeeBox". Treat as a free-form string and bucket in the
  // caller.
  surfacetype: string;
  polygon: GBPoint[];
};

export type GBHoleTeebox = {
  holeid: number;
  holenumber: number;
  teeboxtype?: string;
  color?: string;
  // Yardage from this teebox to the green center.
  length?: number;
  par?: number;
  handicap?: number;
  coordinates?: GBPoint;
};

export type GBListResponse<T> = {
  resources: T[];
  // GolfBert paginates with a `marker` cursor on listCourses; per-
  // course endpoints typically return everything in one go.
  marker?: string | null;
};

// ---- Endpoints ----------------------------------------------------

export function ping() {
  return gbFetch<{ status: string }>("/status");
}

export function getCourse(courseId: number) {
  return gbFetch<GBCourse>(`/v1/courses/${courseId}`);
}

export function listHolesForCourse(courseId: number) {
  return gbFetch<GBListResponse<GBHole>>(`/v1/courses/${courseId}/holes`);
}

export function listPolygonsForHole(holeId: number) {
  return gbFetch<GBListResponse<GBHolePolygon>>(
    `/v1/holes/${holeId}/polygons`,
  );
}

export function listTeeboxesForHole(holeId: number) {
  return gbFetch<GBListResponse<GBHoleTeebox>>(
    `/v1/holes/${holeId}/teeboxes`,
  );
}

export function searchCourses(query: {
  name?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  limit?: number;
  // GolfBert paginates this endpoint with a `marker` cursor. Pass
  // the value from the previous response's `marker` field to get
  // the next page; leave undefined for the first call.
  marker?: string;
}) {
  const sp = new URLSearchParams();
  if (query.name) sp.set("name", query.name);
  if (query.city) sp.set("city", query.city);
  if (query.state) sp.set("state", query.state);
  if (query.zipcode) sp.set("zipcode", query.zipcode);
  sp.set("limit", String(query.limit ?? 20));
  if (query.marker) sp.set("marker", query.marker);
  const path = `/v1/courses/?${sp.toString()}`;
  return gbFetch<GBListResponse<GBCourse>>(path);
}

// ---- Composite "import everything for a course" -------------------

export type ImportedHole = {
  number: number;
  par: number | null;
  yardage: number | null;
  greenLat: number | null;
  greenLng: number | null;
  greenPolygon: { lat: number; lng: number }[] | null;
  fairwayPolygon: { lat: number; lng: number }[] | null;
  teeLat: number | null;
  teeLng: number | null;
  // All teebox colours / positions Golfbert returned for this hole.
  // Stored as JSON on CourseHole.teeAlternativesJson so the admin can
  // swap to any of them later without a re-import.
  teeAlternatives: TeeAlternative[];
  hazards: {
    kind: "WATER" | "SAND" | "OOB" | "OTHER";
    lat: number;
    lng: number;
    label?: string;
  }[];
};

export type ImportedCourse = {
  golfbertId: number;
  name: string;
  centerLat: number | null;
  centerLng: number | null;
  holes: ImportedHole[];
};

// Picks the most representative teebox per hole. GolfBert returns
// multiple per hole (one per color). We prefer everyday "regular
// member" tees and only fall back to championship/forward boxes when
// nothing in the priority list matches. The old behaviour fell
// straight to boxes[0] when no color matched, which is often the
// Championship/Tips box (sits 20-40 yds back from the actual
// member tee) -- so the rendered tee marker visually landed off
// the obvious tee in satellite. Now we (a) cover a much wider set
// of common everyday color labels and (b) fall back to the
// MEDIAN-yardage box rather than the API's first-in-list one.
const TEE_PRIORITY = [
  "white",
  "member",
  "members",
  "regular",
  "men",
  "mens",
  "blue",
  "gold",
  "yellow",
  "silver",
  "green",
  "combo",
  "hybrid",
];
export function pickTeebox(boxes: GBHoleTeebox[]): GBHoleTeebox | null {
  if (boxes.length === 0) return null;
  for (const want of TEE_PRIORITY) {
    const m = boxes.find(
      (b) =>
        (b.color ?? "").toLowerCase() === want ||
        (b.teeboxtype ?? "").toLowerCase() === want,
    );
    if (m && m.coordinates?.lat != null) return m;
  }
  // Final fallback: pick the median-yardage box among those with
  // coordinates. This is much closer to the "everyday tee" than
  // boxes[0] (often the championship/tips tee). Boxes without a
  // length tag sink to the end of the sort.
  const withCoords = boxes.filter((b) => b.coordinates?.lat != null);
  if (withCoords.length === 0) return boxes[0];
  const sorted = [...withCoords].sort((a, b) => {
    const al = typeof a.length === "number" ? a.length : Number.POSITIVE_INFINITY;
    const bl = typeof b.length === "number" ? b.length : Number.POSITIVE_INFINITY;
    return al - bl;
  });
  return sorted[Math.floor(sorted.length / 2)];
}

// Compact serializable form of every teebox we got back for a hole.
// Stored on CourseHole.teeAlternativesJson so the admin can swap to
// any of them without re-fetching from Golfbert.
export type TeeAlternative = {
  color: string;
  teeboxtype: string | null;
  lat: number;
  lng: number;
  yds: number | null;
};
function teeAlternatives(boxes: GBHoleTeebox[]): TeeAlternative[] {
  return boxes
    .filter((b) => b.coordinates?.lat != null && b.coordinates?.long != null)
    .map((b) => ({
      color: b.color ?? "",
      teeboxtype: b.teeboxtype ?? null,
      lat: b.coordinates!.lat,
      lng: b.coordinates!.long,
      yds: typeof b.length === "number" ? b.length : null,
    }));
}

// Pick a canonical par for a hole. We've seen GolfBert teeboxes carry
// inconsistent par values (e.g. a 487y hole tagged par 3 on one tee
// and par 5 on another) -- take the mode across all teeboxes, then
// fall back to yardage-based heuristic if every box disagrees or the
// par looks nonsensical for the length.
export function pickPar(
  boxes: GBHoleTeebox[],
  yardage: number | null,
): number | null {
  const parsFromBoxes = boxes
    .map((b) => b.par)
    .filter((p): p is number => Number.isFinite(p));
  // Mode across teeboxes.
  let modePar: number | null = null;
  if (parsFromBoxes.length > 0) {
    const counts = new Map<number, number>();
    for (const p of parsFromBoxes) counts.set(p, (counts.get(p) ?? 0) + 1);
    let best = -1;
    for (const [p, c] of counts) {
      if (c > best) {
        best = c;
        modePar = p;
      }
    }
  }
  // Sanity check the mode against the hole length. Par 3 above ~290y
  // or par 5 below ~440y is almost certainly wrong; prefer a length-
  // based bucket in that case.
  const heuristic =
    yardage == null
      ? null
      : yardage < 260
        ? 3
        : yardage < 470
          ? 4
          : 5;
  if (modePar != null && yardage != null) {
    if (modePar === 3 && yardage > 290) return heuristic;
    if (modePar === 5 && yardage < 440) return heuristic;
  }
  return modePar ?? heuristic;
}

function classifySurface(
  surfacetype: string,
): "green" | "fairway" | "bunker" | "water" | "oob" | "other" {
  const s = surfacetype.toLowerCase();
  if (s.includes("green")) return "green";
  if (s.includes("fairway")) return "fairway";
  if (s.includes("bunker") || s.includes("sand")) return "bunker";
  if (s.includes("water")) return "water";
  if (s.includes("oob") || s.includes("out")) return "oob";
  return "other";
}

// Great-circle distance in yards. Inlined here so this client stays
// free of any DB / app-layer deps (src/lib/course.ts owns the same
// formula but pulls in prisma).
function haversineYards(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 1.0936133;
}

// Centroid of a polygon, ignoring degeneracies. We average vertices
// because golf-green polygons are roughly convex; this is good enough
// to drop a single representative hazard pin per polygon.
function centroid(pts: GBPoint[]): { lat: number; lng: number } | null {
  if (pts.length === 0) return null;
  const lat = pts.reduce((acc, p) => acc + p.lat, 0) / pts.length;
  const lng = pts.reduce((acc, p) => acc + p.long, 0) / pts.length;
  return { lat, lng };
}

export async function importCourseFromGolfBert(
  courseId: number,
): Promise<ImportedCourse> {
  const course = await getCourse(courseId);
  const holesResp = await listHolesForCourse(courseId);
  const holes = holesResp.resources ?? [];
  // Sort by `number` so hole 1 is first.
  holes.sort((a, b) => a.number - b.number);

  const imported: ImportedHole[] = [];
  for (const h of holes) {
    // Polygons + teeboxes are per-hole, fetched in parallel.
    const [polysResp, teesResp] = await Promise.all([
      listPolygonsForHole(h.id).catch(
        () => ({ resources: [] }) as GBListResponse<GBHolePolygon>,
      ),
      listTeeboxesForHole(h.id).catch(
        () => ({ resources: [] }) as GBListResponse<GBHoleTeebox>,
      ),
    ]);
    const polygons = polysResp.resources ?? [];
    const teeboxes = teesResp.resources ?? [];

    const greenPoly = polygons.find(
      (p) => classifySurface(p.surfacetype) === "green",
    );
    const fairwayPoly = polygons.find(
      (p) => classifySurface(p.surfacetype) === "fairway",
    );

    const tee = pickTeebox(teeboxes);
    // Green position: prefer the centroid of the green polygon when
    // we have it. h.flagcoords is unreliable on bulk-imported courses
    // -- empirically it lands at the course's clubhouse/center for
    // most holes (see scripts/audit-tee-boxes.ts: ~92% of courses fire
    // with computed tee->green ~2x the published yardage, which is
    // exactly the pattern you get when every hole's "green" is the
    // same course-wide anchor). Polygon centroid comes from a per-hole
    // API response, so it's correct per-hole.
    const greenFromPoly =
      greenPoly && greenPoly.polygon.length > 0
        ? centroid(greenPoly.polygon)
        : null;
    const greenLat = greenFromPoly?.lat ?? h.flagcoords?.lat ?? null;
    const greenLng = greenFromPoly?.lng ?? h.flagcoords?.long ?? null;

    const hazards: ImportedHole["hazards"] = [];
    for (const p of polygons) {
      const kind = classifySurface(p.surfacetype);
      if (kind === "bunker" || kind === "water" || kind === "oob") {
        const c = centroid(p.polygon);
        if (c) {
          hazards.push({
            kind:
              kind === "bunker"
                ? "SAND"
                : kind === "water"
                  ? "WATER"
                  : "OOB",
            lat: c.lat,
            lng: c.lng,
            label: p.surfacetype,
          });
        }
      }
    }

    // Tee position fallback chain. Some GolfBert courses (Riverbend
    // is one) ship teeboxes without `coordinates`. Without a labelled
    // tee, pick the candidate point FARTHEST from the green -- that's
    // the tee end of the hole regardless of which direction GolfBert
    // traces the geometry. range.start / range.end / vector vertices
    // are all candidates.
    const teeFromBox =
      tee?.coordinates?.lat != null && tee?.coordinates?.long != null
        ? { lat: tee.coordinates.lat, lng: tee.coordinates.long }
        : null;
    // Sanity-check teeFromBox against tee.length. Some Golfbert holes
    // ship a tee.coordinates that points to a different course (or a
    // default fallback location entirely) -- e.g. Falconhead holes 4/9
    // produced 29,000y walks because the tee was effectively on the
    // other side of the country. If the measured tee->green distance
    // disagrees with the box's own `length` by more than max(200y,
    // 3 * length), treat the tee.coordinates as bogus and fall through
    // to the vectors/range fallback below. The slack is intentionally
    // wide -- this catches catastrophic mismatches without firing on
    // the routine ~2x mismatches that the green-polygon fix above
    // already addresses.
    let resolvedTee: { lat: number; lng: number } | null = teeFromBox;
    if (
      teeFromBox != null &&
      greenLat != null &&
      greenLng != null &&
      tee?.length != null
    ) {
      const measured = haversineYards(teeFromBox, {
        lat: greenLat,
        lng: greenLng,
      });
      const allowed = Math.max(200, tee.length * 3);
      if (Math.abs(measured - tee.length) > allowed) resolvedTee = null;
    }
    if (!resolvedTee && greenLat != null && greenLng != null) {
      const candidates: { lat: number; lng: number }[] = [];
      if (h.range?.start?.lat != null && h.range?.start?.long != null)
        candidates.push({ lat: h.range.start.lat, lng: h.range.start.long });
      if (h.range?.end?.lat != null && h.range?.end?.long != null)
        candidates.push({ lat: h.range.end.lat, lng: h.range.end.long });
      if (h.vectors) {
        for (const v of h.vectors) {
          if (v.lat != null && v.long != null)
            candidates.push({ lat: v.lat, lng: v.long });
        }
      }
      // Distance squared in degrees -- monotonic with great-circle
      // distance over golf-hole scales, no sqrt needed.
      let best: { lat: number; lng: number } | null = null;
      let bestD = -1;
      for (const c of candidates) {
        const dLat = c.lat - greenLat;
        const dLng = c.lng - greenLng;
        const d = dLat * dLat + dLng * dLng;
        if (d > bestD) {
          bestD = d;
          best = c;
        }
      }
      // Sanity: the chosen point must be ~50y+ from the green to count
      // as a tee. Closer than that and it's almost certainly a green-
      // area trace (~50y ≈ 0.00045° at most latitudes).
      if (best && bestD > 0.00045 * 0.00045) resolvedTee = best;
    }

    const yardage = tee?.length ?? null;
    imported.push({
      number: h.number,
      par: pickPar(teeboxes, yardage),
      yardage,
      greenLat,
      greenLng,
      greenPolygon: greenPoly
        ? greenPoly.polygon.map((p) => ({ lat: p.lat, lng: p.long }))
        : null,
      fairwayPolygon: fairwayPoly
        ? fairwayPoly.polygon.map((p) => ({ lat: p.lat, lng: p.long }))
        : null,
      teeLat: resolvedTee?.lat ?? null,
      teeLng: resolvedTee?.lng ?? null,
      teeAlternatives: teeAlternatives(teeboxes),
      hazards,
    });
  }

  return {
    golfbertId: course.id,
    name: course.name,
    centerLat: course.coordinates?.lat ?? null,
    centerLng: course.coordinates?.long ?? null,
    holes: imported,
  };
}
