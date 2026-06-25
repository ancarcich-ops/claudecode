// Detector: which stored tees fall OUTSIDE the OSM golf-course boundary?
//
// This catches the failure mode our distance-based audit can't see:
// hole-2-style errors where the tee was placed at the right yardage
// from the green but sitting on a clubhouse road, parking lot, or
// adjacent property -- physically off the playing course.
//
// Approach:
//
//   1. For each course in the DB, fetch the OpenStreetMap polygon(s)
//      tagged `leisure=golf_course` via the Overpass API. We use the
//      course's centerLat/centerLng as the anchor and pull anything
//      within a 1.2km radius (large courses span ~1km end-to-end).
//   2. Cache the polygons to scripts/osm-boundary-cache.json so reruns
//      don't hammer Overpass.
//   3. For every CourseHole with stored tee coords, test if the tee
//      sits inside any of the course's polygons using a ray-casting
//      point-in-polygon test.
//   4. Print a worklist of out-of-bounds tees grouped by course.
//
// Notes:
//   - Overpass is free but slow. Initial run is ~5s per course; 1239
//     courses ≈ 100 minutes. Cached subsequent runs finish in seconds.
//   - Some courses have no `leisure=golf_course` polygon mapped in OSM
//     (smaller / rural / private). Those skip with a "no boundary"
//     note. About 5-15% of courses fall into this bucket in practice.
//   - Multi-polygon courses (separate front/back nines, "courses" that
//     are actually 36-hole facilities) get all their polygons unioned
//     for the in-bounds test -- a tee is in-bounds if it's inside ANY
//     of them.
//
// Usage:
//   npx tsx scripts/check-tees-vs-osm-boundary.ts                    # all
//   npx tsx scripts/check-tees-vs-osm-boundary.ts --course="Trump"   # one
//   npx tsx scripts/check-tees-vs-osm-boundary.ts --refresh-cache    # rebuild
//   npx tsx scripts/check-tees-vs-osm-boundary.ts --markdown > out.md
//   npx tsx scripts/check-tees-vs-osm-boundary.ts --top=20

import "./_load-env";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { prisma } from "../src/lib/db";

type LL = { lat: number; lng: number };

const CACHE_PATH = "scripts/osm-boundary-cache.json";
const USER_AGENT = "sticks-golf/0.1 (https://sticks-golf.vercel.app)";
const RADIUS_M = 1200;

type Cached = {
  fetchedAt: string;
  polygons: LL[][]; // each entry is one polygon's ring (lat/lng vertices)
};

function parseArgs(argv: string[]) {
  const flags = {
    course: "",
    refreshCache: false,
    markdown: false,
    top: 50,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a === "--refresh-cache") flags.refreshCache = true;
    else if (a === "--markdown" || a === "-m") flags.markdown = true;
    else if (a.startsWith("--top=")) {
      const n = parseInt(a.slice("--top=".length), 10);
      if (Number.isFinite(n)) flags.top = n;
    }
  }
  return flags;
}

function loadCache(): Record<string, Cached> {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, Cached>) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

type OverpassNode = { type: "node"; id: number; lat: number; lon: number };
type OverpassWay = { type: "way"; id: number; nodes: number[]; tags?: Record<string, string> };
type OverpassRelation = { type: "relation"; id: number; members: { type: string; ref: number; role: string }[]; tags?: Record<string, string> };
type OverpassEl = OverpassNode | OverpassWay | OverpassRelation;

async function fetchBoundaryPolygons(lat: number, lng: number): Promise<LL[][]> {
  const query = `
[out:json][timeout:30];
(
  way["leisure"="golf_course"](around:${RADIUS_M},${lat},${lng});
  relation["leisure"="golf_course"](around:${RADIUS_M},${lat},${lng});
);
out tags;
>;
out skel qt;
`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = (await res.json()) as { elements?: OverpassEl[] };
  const els = data.elements ?? [];
  const nodes = new Map<number, OverpassNode>();
  const ways = new Map<number, OverpassWay>();
  const rels: OverpassRelation[] = [];
  for (const el of els) {
    if (el.type === "node") nodes.set(el.id, el);
    else if (el.type === "way") ways.set(el.id, el);
    else if (el.type === "relation") rels.push(el);
  }
  const polygons: LL[][] = [];
  for (const w of ways.values()) {
    if (!w.tags || w.tags["leisure"] !== "golf_course") continue;
    const ring = w.nodes
      .map((id) => nodes.get(id))
      .filter((n): n is OverpassNode => !!n)
      .map((n) => ({ lat: n.lat, lng: n.lon }));
    if (ring.length >= 3) polygons.push(ring);
  }
  for (const r of rels) {
    for (const m of r.members) {
      if (m.type !== "way") continue;
      // Multipolygon relations: include "outer" rings only. (Inner rings
      // would carve holes -- e.g. a parking lot inside the course --
      // which is exactly what we want to mark as out-of-bounds. But for
      // a first pass, treating the whole outer ring as in-bounds is
      // already a huge improvement; the inner-hole edge case can wait.)
      if (m.role !== "outer" && m.role !== "") continue;
      const w = ways.get(m.ref);
      if (!w) continue;
      const ring = w.nodes
        .map((id) => nodes.get(id))
        .filter((n): n is OverpassNode => !!n)
        .map((n) => ({ lat: n.lat, lng: n.lon }));
      if (ring.length >= 3) polygons.push(ring);
    }
  }
  return polygons;
}

// Ray-casting point-in-polygon. Returns true if point is strictly inside.
// Works in lat/lng directly -- at golf scale the geodetic curvature is
// irrelevant and the polygon vertices are in the same units as the point.
function pointInRing(p: LL, ring: LL[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat, xi = ring[i].lng;
    const yj = ring[j].lat, xj = ring[j].lng;
    const intersect =
      yi > p.lat !== yj > p.lat &&
      p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInAny(p: LL, rings: LL[][]): boolean {
  for (const ring of rings) {
    if (pointInRing(p, ring)) return true;
  }
  return false;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv);
  const where = args.course
    ? { name: { contains: args.course, mode: "insensitive" as const } }
    : {};
  const courses = await prisma.course.findMany({
    where: where as never,
    select: { id: true, name: true, centerLat: true, centerLng: true },
    orderBy: { name: "asc" },
  });

  const cache = args.refreshCache ? {} : loadCache();
  let fetchedThisRun = 0;
  let noBoundaryThisRun = 0;

  type Hit = { courseName: string; hole: number; teeLat: number; teeLng: number; published: number | null };
  const hits: Hit[] = [];
  const skippedCourses: { name: string; reason: string }[] = [];

  for (const course of courses) {
    if (course.centerLat == null || course.centerLng == null) {
      skippedCourses.push({ name: course.name, reason: "no centerLat/Lng" });
      continue;
    }
    let entry = cache[course.id];
    if (!entry) {
      try {
        const polygons = await fetchBoundaryPolygons(course.centerLat, course.centerLng);
        entry = { fetchedAt: new Date().toISOString(), polygons };
        cache[course.id] = entry;
        fetchedThisRun++;
        // Save cache periodically so we don't lose progress on a long run.
        if (fetchedThisRun % 25 === 0) saveCache(cache);
        // Be polite to Overpass: 1 req/sec.
        await sleep(1100);
      } catch (e) {
        skippedCourses.push({
          name: course.name,
          reason: `overpass error: ${e instanceof Error ? e.message : String(e)}`,
        });
        continue;
      }
    }
    if (entry.polygons.length === 0) {
      noBoundaryThisRun++;
      skippedCourses.push({ name: course.name, reason: "no leisure=golf_course in OSM" });
      continue;
    }

    const holes = await prisma.courseHole.findMany({
      where: {
        courseId: course.id,
        source: "golfbert",
        teeLat: { not: null },
        teeLng: { not: null },
      },
      select: { hole: true, teeLat: true, teeLng: true, distanceYds: true },
      orderBy: { hole: "asc" },
    });
    for (const h of holes) {
      const tee = { lat: h.teeLat!, lng: h.teeLng! };
      if (pointInAny(tee, entry.polygons)) continue;
      hits.push({
        courseName: course.name,
        hole: h.hole,
        teeLat: tee.lat,
        teeLng: tee.lng,
        published: h.distanceYds,
      });
    }
  }
  saveCache(cache);

  // Group hits by course.
  const byCourse = new Map<string, Hit[]>();
  for (const h of hits) {
    const list = byCourse.get(h.courseName) ?? [];
    list.push(h);
    byCourse.set(h.courseName, list);
  }
  const sorted = [...byCourse.entries()].sort((a, b) => b[1].length - a[1].length);

  if (args.markdown) {
    console.log(`# Out-of-bounds tee worklist (OSM boundary check)`);
    console.log(``);
    console.log(
      `Holes whose stored tee coordinate falls outside the OSM \`leisure=golf_course\` polygon for the course. This catches the failure mode the distance audit misses -- tees sitting on clubhouse roads, parking lots, or adjacent properties at the right yardage but the wrong place. Spot-check each in satellite before fixing; OSM boundaries can be coarse for some courses.`,
    );
    console.log(``);
  }
  const limit = args.course ? sorted.length : (args.top > 0 ? Math.min(args.top, sorted.length) : sorted.length);
  for (let i = 0; i < limit; i++) {
    const [name, rows] = sorted[i];
    const url = `/admin/courses/${encodeURIComponent(name)}`;
    if (args.markdown) {
      console.log(`## ${name}`);
      console.log(``);
      console.log(`Admin: [\`${url}\`](${url})`);
      console.log(``);
      console.log(`| hole | tee | published |`);
      console.log(`|-----:|-----|----------:|`);
      for (const r of rows.sort((a, b) => a.hole - b.hole)) {
        console.log(`| ${r.hole} | ${r.teeLat.toFixed(5)}, ${r.teeLng.toFixed(5)} | ${r.published ?? "—"}y |`);
      }
      console.log(``);
    } else {
      console.log(`${name}  (${rows.length} out-of-bounds)`);
      console.log(`  ${url}`);
      for (const r of rows.sort((a, b) => a.hole - b.hole)) {
        console.log(`  hole ${r.hole.toString().padStart(2)}: tee=${r.teeLat.toFixed(5)},${r.teeLng.toFixed(5)}  published=${r.published ?? "—"}y`);
      }
      console.log(``);
    }
  }

  console.log(
    `\nScanned ${courses.length} courses. Fetched ${fetchedThisRun} new boundaries (cached: ${courses.length - fetchedThisRun - skippedCourses.filter((s) => s.reason !== "no leisure=golf_course in OSM").length}). ${noBoundaryThisRun} courses had no OSM boundary. Flagged ${hits.length} out-of-bounds tees across ${byCourse.size} courses.`,
  );
  if (skippedCourses.length > 0) {
    console.log(`Skipped ${skippedCourses.length} courses (no boundary / fetch error). Sample:`);
    for (const s of skippedCourses.slice(0, 5)) console.log(`  - ${s.name}: ${s.reason}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
