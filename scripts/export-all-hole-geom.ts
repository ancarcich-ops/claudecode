// Full per-hole geometry export. Dumps every golfbert-source hole on
// every course as CSV (default) or JSONL, with all the stored coords
// + computed signals (measured distance, off-fairway distance, etc).
//
// Built because the polygon-based heuristics in tee-cleanup-worklist.ts
// have false negatives (hole-2-on-a-dirt-patch case): no polygon math
// can reliably distinguish "tee on real tee box" from "tee 30y away
// on dirt next to the fairway." A downstream agent or human triaging
// in the admin UI needs the full data set, not just the heuristic
// subset.
//
// Output columns:
//   courseId, courseName, hole, teeLat, teeLng, greenLat, greenLng,
//   centerLat, centerLng, publishedYds, measuredYds, offFairwayY,
//   teeToCenterY, fairwayPts, greenPolyPts, hasAdminPin, source,
//   adminUrl
//
// "offFairwayY" is distance from the stored tee to the nearest
// fairway-polygon vertex (NaN if no fairway). "teeToCenterY" is
// distance from the stored tee to course.center. "hasAdminPin" is
// true if greenFront* or greenBack* is set -- admin curated this hole
// and the script-side backfill skipped it.
//
// Usage:
//   npx tsx scripts/export-all-hole-geom.ts > holes.csv
//   npx tsx scripts/export-all-hole-geom.ts --jsonl > holes.jsonl
//   npx tsx scripts/export-all-hole-geom.ts --course="Pebble" > pebble.csv

import "./_load-env";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

type LL = { lat: number; lng: number };

function parseArgs(argv: string[]) {
  const flags = { course: "", jsonl: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a === "--jsonl") flags.jsonl = true;
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

function distToNearestVertex(p: LL, poly: LL[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const q of poly) {
    const d = distanceYards(p, q);
    if (d < best) best = d;
  }
  return best;
}

const CSV_HEADER = [
  "courseId",
  "courseName",
  "hole",
  "teeLat",
  "teeLng",
  "greenLat",
  "greenLng",
  "centerLat",
  "centerLng",
  "publishedYds",
  "measuredYds",
  "offFairwayY",
  "teeToCenterY",
  "fairwayPts",
  "greenPolyPts",
  "hasAdminPin",
  "source",
  "adminUrl",
].join(",");

function csvField(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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

  if (!args.jsonl) console.log(CSV_HEADER);

  for (const course of courses) {
    const holes = await prisma.courseHole.findMany({
      where: { courseId: course.id, source: "golfbert" },
      select: {
        hole: true,
        teeLat: true,
        teeLng: true,
        greenLat: true,
        greenLng: true,
        greenFrontLat: true,
        greenFrontLng: true,
        greenBackLat: true,
        greenBackLng: true,
        distanceYds: true,
        fairwayPolygonJson: true,
        greenPolygonJson: true,
        source: true,
      },
      orderBy: { hole: "asc" },
    });

    for (const h of holes) {
      const tee = h.teeLat != null && h.teeLng != null
        ? { lat: h.teeLat, lng: h.teeLng } : null;
      const green = h.greenLat != null && h.greenLng != null
        ? { lat: h.greenLat, lng: h.greenLng } : null;
      const measured = tee && green
        ? Math.round(distanceYards(tee, green)) : null;
      const fairway = parsePoly(h.fairwayPolygonJson);
      const offFairway = tee && fairway
        ? Math.round(distToNearestVertex(tee, fairway)) : null;
      const teeToCenter = tee && course.centerLat != null && course.centerLng != null
        ? Math.round(distanceYards(tee, { lat: course.centerLat, lng: course.centerLng })) : null;
      const greenPoly = parsePoly(h.greenPolygonJson);
      const hasAdminPin =
        h.greenFrontLat != null || h.greenFrontLng != null ||
        h.greenBackLat != null || h.greenBackLng != null;
      const adminUrl = `/admin/courses/${encodeURIComponent(course.name)}`;

      const row = {
        courseId: course.id,
        courseName: course.name,
        hole: h.hole,
        teeLat: h.teeLat,
        teeLng: h.teeLng,
        greenLat: h.greenLat,
        greenLng: h.greenLng,
        centerLat: course.centerLat,
        centerLng: course.centerLng,
        publishedYds: h.distanceYds,
        measuredYds: measured,
        offFairwayY: offFairway,
        teeToCenterY: teeToCenter,
        fairwayPts: fairway?.length ?? 0,
        greenPolyPts: greenPoly?.length ?? 0,
        hasAdminPin,
        source: h.source,
        adminUrl,
      };

      if (args.jsonl) {
        console.log(JSON.stringify(row));
      } else {
        console.log([
          row.courseId, row.courseName, row.hole,
          row.teeLat, row.teeLng, row.greenLat, row.greenLng,
          row.centerLat, row.centerLng,
          row.publishedYds, row.measuredYds, row.offFairwayY, row.teeToCenterY,
          row.fairwayPts, row.greenPolyPts,
          row.hasAdminPin, row.source, row.adminUrl,
        ].map(csvField).join(","));
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
