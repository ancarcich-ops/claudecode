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
}) {
  const sp = new URLSearchParams();
  if (query.name) sp.set("name", query.name);
  if (query.city) sp.set("city", query.city);
  if (query.state) sp.set("state", query.state);
  if (query.zipcode) sp.set("zipcode", query.zipcode);
  sp.set("limit", String(query.limit ?? 20));
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
// multiple per hole (one per color). We prefer "White" / "Member" /
// "Regular"-ish tees, falling back to the first one we get.
function pickTeebox(boxes: GBHoleTeebox[]): GBHoleTeebox | null {
  if (boxes.length === 0) return null;
  const PRIORITY = ["white", "member", "regular", "men", "blue", "gold"];
  for (const want of PRIORITY) {
    const m = boxes.find(
      (b) =>
        (b.color ?? "").toLowerCase() === want ||
        (b.teeboxtype ?? "").toLowerCase() === want,
    );
    if (m) return m;
  }
  return boxes[0];
}

// Pick a canonical par for a hole. We've seen GolfBert teeboxes carry
// inconsistent par values (e.g. a 487y hole tagged par 3 on one tee
// and par 5 on another) -- take the mode across all teeboxes, then
// fall back to yardage-based heuristic if every box disagrees or the
// par looks nonsensical for the length.
function pickPar(
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
    const greenLat = h.flagcoords?.lat ?? null;
    const greenLng = h.flagcoords?.long ?? null;

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
    let resolvedTee: { lat: number; lng: number } | null = teeFromBox;
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
