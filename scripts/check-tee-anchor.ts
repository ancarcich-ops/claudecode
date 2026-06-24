// Diagnostic: are imported tees actually pinned to a single course-wide
// anchor (clubhouse / center) instead of the per-hole teeing ground?
// Reads only from the DB, no Golfbert calls.
//
// For each course, computes the spread of stored teeLat/teeLng:
//   - max distance between any two tees
//   - mean distance from each tee to the centroid of all tees
//   - whether the tee-centroid sits near the course's centerLat/centerLng
//
// A real golf course has tees spread across hundreds of yards (often
// 1000y+ end to end). If max-spread is < ~100y and tee-centroid is
// within ~50y of course.center, every hole's tee is effectively the
// same point -- the clubhouse fallback theory is confirmed.
//
// Run:
//   npx tsx scripts/check-tee-anchor.ts                    # summary, all courses
//   npx tsx scripts/check-tee-anchor.ts --course="Adobe"   # detail for one
//   npx tsx scripts/check-tee-anchor.ts --max-spread=200   # filter threshold

import "./_load-env";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

function parseArgs(argv: string[]) {
  const flags = { course: "", maxSpread: 200, verbose: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a.startsWith("--max-spread=")) {
      const n = parseInt(a.slice("--max-spread=".length), 10);
      if (Number.isFinite(n)) flags.maxSpread = n;
    } else if (a === "--verbose" || a === "-v") flags.verbose = true;
  }
  return flags;
}

async function main() {
  const args = parseArgs(process.argv);
  const where = args.course
    ? { name: { contains: args.course, mode: "insensitive" as const } }
    : {};
  const courses = await prisma.course.findMany({
    where: where as never,
    include: {
      holes: {
        where: { source: "golfbert", teeLat: { not: null }, teeLng: { not: null } },
        select: { hole: true, teeLat: true, teeLng: true, greenLat: true, greenLng: true, distanceYds: true },
        orderBy: { hole: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  let pinned = 0;
  let normal = 0;
  let totalEval = 0;

  for (const course of courses) {
    const tees = course.holes
      .filter((h) => h.teeLat != null && h.teeLng != null)
      .map((h) => ({ hole: h.hole, lat: h.teeLat!, lng: h.teeLng!, h }));
    if (tees.length < 2) continue;
    totalEval++;

    let maxPair = 0;
    for (let i = 0; i < tees.length; i++) {
      for (let j = i + 1; j < tees.length; j++) {
        const d = distanceYards(tees[i], tees[j]);
        if (d > maxPair) maxPair = d;
      }
    }

    const centroid = {
      lat: tees.reduce((a, t) => a + t.lat, 0) / tees.length,
      lng: tees.reduce((a, t) => a + t.lng, 0) / tees.length,
    };
    const meanFromCen =
      tees.reduce((a, t) => a + distanceYards(t, centroid), 0) / tees.length;

    const distToCourseCenter =
      course.centerLat != null && course.centerLng != null
        ? distanceYards(centroid, { lat: course.centerLat, lng: course.centerLng })
        : null;

    const isPinned = maxPair < args.maxSpread;
    if (isPinned) pinned++;
    else normal++;

    if (args.course || args.verbose || isPinned) {
      console.log(
        `${course.name}  n=${tees.length} maxSpread=${Math.round(maxPair)}y meanFromCen=${Math.round(meanFromCen)}y` +
          (distToCourseCenter != null ? ` centroidToCourseCenter=${Math.round(distToCourseCenter)}y` : "") +
          (isPinned ? "  <-- TEES PINNED" : ""),
      );
    }

    if (args.course) {
      for (const t of tees) {
        const d = distanceYards(t, centroid);
        const teeToGreen =
          t.h.greenLat != null && t.h.greenLng != null
            ? Math.round(distanceYards(t, { lat: t.h.greenLat, lng: t.h.greenLng }))
            : null;
        console.log(
          `  hole ${t.hole.toString().padStart(2)}: ${t.lat.toFixed(5)},${t.lng.toFixed(5)}` +
            `  toCentroid=${Math.round(d)}y  toGreen=${teeToGreen ?? "—"}y  published=${t.h.distanceYds ?? "—"}y`,
        );
      }
    }
  }

  console.log(
    `\nSummary: ${pinned}/${totalEval} courses have all tees within ${args.maxSpread}y of each other (pinned to a single anchor). ${normal} look normal.`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
