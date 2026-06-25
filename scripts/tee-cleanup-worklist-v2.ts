// Worklist v2: direction-aware detector for suspect tees.
//
// V1 (tee-cleanup-worklist.ts) flagged holes where the stored tee was
// >100y from the nearest fairway-polygon vertex. That has a known
// false-negative: hole-on-a-dirt-patch-next-to-fairway. A vertex
// happens to be within 100y of the dirt patch, so v1 misses it.
//
// V2 adds a stronger heuristic: compute where the tee SHOULD be by
// projecting from the green along the (green -> fairway-centroid)
// axis at the published distance, then compare to the stored tee. If
// the disagreement is more than --tolerance (default 75y), flag it.
//
// V2 catches:
// - everything v1 catches (off-fairway tees)
// - hole-2-style false negatives (right distance, wrong direction)
// - directional drift that the audit can't see
//
// V2 trade-off: doglegs trip the check because the projection direction
// (green -> fairway centroid) doesn't line up with the actual tee. The
// downstream user / agent has to spot-check each flag against satellite.
// That's the correct behavior -- we want false positives, not false
// negatives, when triaging visually.
//
// Usage:
//   npx tsx scripts/tee-cleanup-worklist-v2.ts                    # default
//   npx tsx scripts/tee-cleanup-worklist-v2.ts --tolerance=50     # tighter
//   npx tsx scripts/tee-cleanup-worklist-v2.ts --markdown --top=0 # full md
//   npx tsx scripts/tee-cleanup-worklist-v2.ts --course="Pebble"  # one

import "./_load-env";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

type LL = { lat: number; lng: number };

function parseArgs(argv: string[]) {
  const flags = { course: "", tolerance: 75, top: 50, markdown: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a.startsWith("--tolerance=")) {
      const n = parseInt(a.slice("--tolerance=".length), 10);
      if (Number.isFinite(n)) flags.tolerance = n;
    } else if (a.startsWith("--top=")) {
      const n = parseInt(a.slice("--top=".length), 10);
      if (Number.isFinite(n)) flags.top = n;
    } else if (a === "--markdown" || a === "-m") flags.markdown = true;
  }
  return flags;
}

function parsePoly(json: string | null): LL[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    const pts: LL[] = [];
    for (const p of arr) {
      if (typeof p?.lat === "number" && typeof p?.lng === "number")
        pts.push({ lat: p.lat, lng: p.lng });
    }
    return pts.length > 0 ? pts : null;
  } catch {
    return null;
  }
}

function polygonCentroid(pts: LL[]): LL | null {
  if (pts.length === 0) return null;
  let sLat = 0;
  let sLng = 0;
  for (const p of pts) {
    sLat += p.lat;
    sLng += p.lng;
  }
  return { lat: sLat / pts.length, lng: sLng / pts.length };
}

function projectTee(green: LL, fairwayPoly: LL[], distanceYds: number): LL | null {
  const cen = polygonCentroid(fairwayPoly);
  if (!cen) return null;
  const latToM = 111320;
  const lngToM = 111320 * Math.cos((green.lat * Math.PI) / 180);
  const xM = (cen.lng - green.lng) * lngToM;
  const yM = (cen.lat - green.lat) * latToM;
  const mag = Math.sqrt(xM * xM + yM * yM);
  if (mag < 1) return null;
  const distM = distanceYds * 0.9144;
  return {
    lat: green.lat + (yM / mag) * distM / latToM,
    lng: green.lng + (xM / mag) * distM / lngToM,
  };
}

function distToNearestVertex(p: LL, poly: LL[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const q of poly) {
    const d = distanceYards(p, q);
    if (d < best) best = d;
  }
  return best;
}

async function main() {
  const args = parseArgs(process.argv);
  const where = args.course
    ? { name: { contains: args.course, mode: "insensitive" as const } }
    : {};
  const courses = await prisma.course.findMany({
    where: where as never,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  type Row = {
    courseName: string;
    hole: number;
    teeLat: number;
    teeLng: number;
    greenLat: number;
    greenLng: number;
    published: number;
    measured: number;
    offFairway: number;
    projectionDelta: number;
  };
  const all: Row[] = [];

  for (const course of courses) {
    const holes = await prisma.courseHole.findMany({
      where: {
        courseId: course.id,
        source: "golfbert",
        teeLat: { not: null },
        teeLng: { not: null },
        greenLat: { not: null },
        greenLng: { not: null },
        distanceYds: { not: null },
        fairwayPolygonJson: { not: null },
      },
      select: {
        hole: true,
        teeLat: true,
        teeLng: true,
        greenLat: true,
        greenLng: true,
        greenFrontLat: true,
        greenBackLat: true,
        distanceYds: true,
        fairwayPolygonJson: true,
      },
      orderBy: { hole: "asc" },
    });

    for (const h of holes) {
      if (h.greenFrontLat != null || h.greenBackLat != null) continue;
      const tee = { lat: h.teeLat!, lng: h.teeLng! };
      const green = { lat: h.greenLat!, lng: h.greenLng! };
      const fairway = parsePoly(h.fairwayPolygonJson);
      if (!fairway || fairway.length < 3) continue;
      const projected = projectTee(green, fairway, h.distanceYds!);
      if (!projected) continue;
      const projectionDelta = Math.round(distanceYards(tee, projected));
      if (projectionDelta <= args.tolerance) continue;
      const measured = Math.round(distanceYards(tee, green));
      const offFairway = Math.round(distToNearestVertex(tee, fairway));
      all.push({
        courseName: course.name,
        hole: h.hole,
        teeLat: tee.lat,
        teeLng: tee.lng,
        greenLat: green.lat,
        greenLng: green.lng,
        published: h.distanceYds!,
        measured,
        offFairway,
        projectionDelta,
      });
    }
  }

  const byCourse = new Map<string, Row[]>();
  for (const r of all) {
    const list = byCourse.get(r.courseName) ?? [];
    list.push(r);
    byCourse.set(r.courseName, list);
  }
  const sorted = [...byCourse.entries()].sort((a, b) => b[1].length - a[1].length);

  if (args.markdown && !args.course) {
    console.log(`# Tee-cleanup worklist (v2 — direction-aware)`);
    console.log(``);
    console.log(
      `Holes where the stored tee is more than ${args.tolerance}y from the algorithmically-projected position (green -> fairway-centroid axis at the published distance). Catches the false negatives of v1 (e.g. tee on dirt patch next to fairway) but also flags doglegs as false positives. Use satellite imagery to confirm before fixing.`,
    );
    console.log(``);
    console.log(`Each row shows the hole's stored coords, published vs measured yardage, distance from nearest fairway vertex, and how far the projection wants to move it.`);
    console.log(``);
  } else if (!args.markdown && !args.course) {
    console.log(`v2 worklist: holes >${args.tolerance}y from projected position.\n`);
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
      console.log(`| hole | tee | green | pub | measured | offFairway | projectionDelta |`);
      console.log(`|-----:|-----|-------|----:|---------:|-----------:|----------------:|`);
      for (const r of rows.sort((a, b) => a.hole - b.hole)) {
        console.log(
          `| ${r.hole} | ${r.teeLat.toFixed(5)}, ${r.teeLng.toFixed(5)} | ${r.greenLat.toFixed(5)}, ${r.greenLng.toFixed(5)} | ${r.published}y | ${r.measured}y | ${r.offFairway}y | ${r.projectionDelta}y |`,
        );
      }
      console.log(``);
    } else {
      console.log(`${name}  (${rows.length} hole${rows.length === 1 ? "" : "s"})`);
      console.log(`  ${url}`);
      for (const r of rows.sort((a, b) => a.hole - b.hole)) {
        console.log(
          `  hole ${r.hole.toString().padStart(2)}: tee=${r.teeLat.toFixed(5)},${r.teeLng.toFixed(5)} green=${r.greenLat.toFixed(5)},${r.greenLng.toFixed(5)} pub=${r.published}y measured=${r.measured}y offFairway=${r.offFairway}y projDelta=${r.projectionDelta}y`,
        );
      }
      console.log(``);
    }
  }

  if (!args.course) {
    const shown = args.top > 0 ? Math.min(args.top, byCourse.size) : byCourse.size;
    console.log(
      `\nShowing top ${shown} of ${byCourse.size} courses (${all.length} flagged holes total, tolerance ${args.tolerance}y).`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
