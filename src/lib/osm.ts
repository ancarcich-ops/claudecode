// OpenStreetMap integration. Two services:
//
//  - Nominatim: geocode a course name -> lat/lng. Free, rate-limited
//    (1 req/sec, no key required, must send a real User-Agent).
//  - Overpass API: pull golf features (greens, tees, bunkers, water,
//    fairways) within a bounding circle. Also free, no key. Heavier
//    requests; we cache the result on the Course row forever.
//
// Coverage caveat: a given course may have ANY of [richly mapped, partly
// mapped, untagged]. We do best-effort here and fall back to user marks
// for gaps.

const USER_AGENT = "sticks-golf/0.1 (https://sticks-golf.vercel.app)";

type LatLng = { lat: number; lng: number };

// Coords parsed from Nominatim. Includes a bounding box we can use as the
// radius for Overpass.
export type GeocodeResult = {
  lat: number;
  lng: number;
  boundingBox: [number, number, number, number] | null; // [minLat,maxLat,minLng,maxLng]
};

export async function geocodeCourse(name: string): Promise<GeocodeResult | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${trimmed} golf course`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");
  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      boundingbox?: string[];
    }>;
    if (data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    let bb: GeocodeResult["boundingBox"] = null;
    if (data[0].boundingbox && data[0].boundingbox.length === 4) {
      const [s, n, w, e] = data[0].boundingbox.map(parseFloat);
      if ([s, n, w, e].every(Number.isFinite)) bb = [s, n, w, e];
    }
    return { lat, lng, boundingBox: bb };
  } catch {
    return null;
  }
}

// Raw OSM feature: a centroid + optional polygon + tag bag. Hole assignment
// is done downstream -- OSM `ref` tag carries it when mappers set it.
export type OsmFeature = {
  kind: "green" | "tee" | "fairway" | "bunker" | "water";
  ref: number | null; // 1..18 if a ref tag was present
  centroid: LatLng;
  polygon: LatLng[] | null;
};

// Build an Overpass QL query that returns golf features near a point.
function overpassQuery(lat: number, lng: number, radiusM: number): string {
  // `around:<r>,<lat>,<lng>` is built-in. We pull each interesting feature
  // class with one statement to keep the response small.
  return `
[out:json][timeout:30];
(
  way["golf"="green"](around:${radiusM},${lat},${lng});
  way["golf"="tee"](around:${radiusM},${lat},${lng});
  way["golf"="fairway"](around:${radiusM},${lat},${lng});
  way["golf"="bunker"](around:${radiusM},${lat},${lng});
  way["golf"="water_hazard"](around:${radiusM},${lat},${lng});
  way["golf"="lateral_water_hazard"](around:${radiusM},${lat},${lng});
  way["natural"="water"](around:${radiusM},${lat},${lng});
);
out tags;
>;
out skel qt;
`;
}

type OverpassNode = { type: "node"; id: number; lat: number; lon: number };
type OverpassWay = {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
};
type OverpassEl = OverpassNode | OverpassWay;

function parseRef(tag: string | undefined): number | null {
  if (!tag) return null;
  const n = parseInt(tag, 10);
  return Number.isFinite(n) && n >= 1 && n <= 36 ? n : null;
}

function centroidOf(points: LatLng[]): LatLng {
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

export async function fetchOsmGolfFeatures(
  lat: number,
  lng: number,
  radiusM = 700,
): Promise<OsmFeature[]> {
  const query = overpassQuery(lat, lng, radiusM);
  // Overpass is a free, frequently-overloaded public API. Without a
  // timeout a slow/unreachable instance leaves this fetch hanging until
  // the OS socket gives up (~110s, surfacing as ETIMEDOUT) -- long enough
  // to tie up the whole request. Abort after 8s and degrade to no
  // features (the caller already treats an empty list as "no OSM data").
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: "data=" + encodeURIComponent(query),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { elements?: OverpassEl[] };
    const els = data.elements ?? [];
    const nodes = new Map<number, OverpassNode>();
    const ways: OverpassWay[] = [];
    for (const el of els) {
      if (el.type === "node") nodes.set(el.id, el);
      else if (el.type === "way") ways.push(el);
    }
    const out: OsmFeature[] = [];
    for (const w of ways) {
      const tags = w.tags ?? {};
      const golf = tags["golf"];
      const isWater =
        golf === "water_hazard" ||
        golf === "lateral_water_hazard" ||
        tags["natural"] === "water";
      const kind: OsmFeature["kind"] | null =
        golf === "green"
          ? "green"
          : golf === "tee"
            ? "tee"
            : golf === "fairway"
              ? "fairway"
              : golf === "bunker"
                ? "bunker"
                : isWater
                  ? "water"
                  : null;
      if (!kind) continue;
      const polygon: LatLng[] = [];
      for (const nid of w.nodes) {
        const n = nodes.get(nid);
        if (n) polygon.push({ lat: n.lat, lng: n.lon });
      }
      if (polygon.length === 0) continue;
      out.push({
        kind,
        ref: parseRef(tags["ref"]),
        centroid: centroidOf(polygon),
        polygon,
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// Heuristic hole assignment: when OSM features lack a `ref` tag, pair each
// green with its closest tee (by centroid distance) and number them in tee
// order from a stable starting point (any tagged ref wins, else the
// southwesternmost tee = hole 1).
//
// This isn't perfect -- e.g. greens with no nearby tee fall through -- but
// it gets us a usable starting set when OSM has data without per-hole refs.
export type AssignedHole = {
  hole: number;
  tee: LatLng | null;
  green: LatLng | null;
  greenPolygon: LatLng[] | null;
};

function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function assignHoles(
  features: OsmFeature[],
  totalHoles: number,
): AssignedHole[] {
  const greens = features.filter((f) => f.kind === "green");
  const tees = features.filter((f) => f.kind === "tee");
  if (greens.length === 0) return [];

  // 1. Honor explicit refs first. Build a map[hole] = { tee, green }.
  const byHole = new Map<number, AssignedHole>();
  for (const g of greens) {
    if (g.ref != null) {
      byHole.set(g.ref, {
        hole: g.ref,
        tee: null,
        green: g.centroid,
        greenPolygon: g.polygon,
      });
    }
  }
  for (const t of tees) {
    if (t.ref != null) {
      const cur = byHole.get(t.ref);
      if (cur) {
        cur.tee = t.centroid;
      } else {
        byHole.set(t.ref, {
          hole: t.ref,
          tee: t.centroid,
          green: null,
          greenPolygon: null,
        });
      }
    }
  }

  // 2. For greens without a ref, pair with the nearest unassigned tee
  //    and slot into the next available hole number.
  const usedTees = new Set<OsmFeature>();
  for (const cur of byHole.values()) {
    if (cur.tee) {
      const match = tees.find(
        (t) =>
          t.centroid.lat === cur.tee?.lat && t.centroid.lng === cur.tee?.lng,
      );
      if (match) usedTees.add(match);
    }
  }
  const unrefGreens = greens.filter((g) => g.ref == null);
  let nextHole = 1;
  for (const g of unrefGreens) {
    while (byHole.has(nextHole)) nextHole++;
    if (nextHole > totalHoles) break;
    // Closest unused tee.
    let bestTee: OsmFeature | null = null;
    let bestDist = Infinity;
    for (const t of tees) {
      if (usedTees.has(t)) continue;
      const d = distanceMeters(g.centroid, t.centroid);
      if (d < bestDist && d < 600) {
        bestDist = d;
        bestTee = t;
      }
    }
    if (bestTee) usedTees.add(bestTee);
    byHole.set(nextHole, {
      hole: nextHole,
      tee: bestTee?.centroid ?? null,
      green: g.centroid,
      greenPolygon: g.polygon,
    });
    nextHole++;
  }

  return Array.from(byHole.values()).sort((a, b) => a.hole - b.hole);
}
