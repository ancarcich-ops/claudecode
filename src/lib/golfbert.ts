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

    imported.push({
      number: h.number,
      par: tee?.par ?? null,
      yardage: tee?.length ?? null,
      greenLat,
      greenLng,
      greenPolygon: greenPoly
        ? greenPoly.polygon.map((p) => ({ lat: p.lat, lng: p.long }))
        : null,
      fairwayPolygon: fairwayPoly
        ? fairwayPoly.polygon.map((p) => ({ lat: p.lat, lng: p.long }))
        : null,
      teeLat: tee?.coordinates?.lat ?? null,
      teeLng: tee?.coordinates?.long ?? null,
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
