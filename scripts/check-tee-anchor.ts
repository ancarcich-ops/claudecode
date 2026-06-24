// Per-hole diagnostic: which stored tees look like the clubhouse
// fallback rather than the actual teeing ground?
//
// Reads only from the DB, no Golfbert calls.
//
// For every imported hole, computes:
//   tee->green     measured distance between stored teeLat/teeLng and
//                  the stored green
//   published      stored distanceYds (from Golfbert tee.length)
//   tee->center    distance from stored tee to course.centerLat/Lng
//
// A tee is "suspect" if measured tee->green disagrees with published
// by more than 100y. A suspect tee is "anchored" if tee->center is
// less than 75y (i.e., it's effectively at the clubhouse). The user
// reports the bug typically affects the first few holes per course,
// so the script also prints how many suspect tees fall on holes 1-3
// vs later holes.
//
// Run:
//   npx tsx scripts/check-tee-anchor.ts                          # summary
//   npx tsx scripts/check-tee-anchor.ts --course="Adobe Creek"   # detail
//   npx tsx scripts/check-tee-anchor.ts --suspect-threshold=200  # tweak

import "./_load-env";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

function parseArgs(argv: string[]) {
  const flags = {
    course: "",
    suspectThreshold: 100,
    anchorThreshold: 75,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a.startsWith("--suspect-threshold=")) {
      const n = parseInt(a.slice("--suspect-threshold=".length), 10);
      if (Number.isFinite(n)) flags.suspectThreshold = n;
    } else if (a.startsWith("--anchor-threshold=")) {
      const n = parseInt(a.slice("--anchor-threshold=".length), 10);
      if (Number.isFinite(n)) flags.anchorThreshold = n;
    }
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
        select: {
          hole: true,
          teeLat: true,
          teeLng: true,
          greenLat: true,
          greenLng: true,
          distanceYds: true,
        },
        orderBy: { hole: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  let totalSuspect = 0;
  let totalAnchored = 0;
  let coursesWithSuspect = 0;
  const suspectByHole = new Map<number, number>();
  const anchoredByHole = new Map<number, number>();

  for (const course of courses) {
    if (course.centerLat == null || course.centerLng == null) continue;
    const center = { lat: course.centerLat, lng: course.centerLng };

    type Row = {
      hole: number;
      teeToGreen: number | null;
      published: number | null;
      teeToCenter: number;
      suspect: boolean;
      anchored: boolean;
    };
    const rows: Row[] = [];

    for (const h of course.holes) {
      if (h.teeLat == null || h.teeLng == null) continue;
      const tee = { lat: h.teeLat, lng: h.teeLng };
      const teeToGreen =
        h.greenLat != null && h.greenLng != null
          ? Math.round(distanceYards(tee, { lat: h.greenLat, lng: h.greenLng }))
          : null;
      const teeToCenter = Math.round(distanceYards(tee, center));
      const suspect =
        teeToGreen != null &&
        h.distanceYds != null &&
        Math.abs(teeToGreen - h.distanceYds) > args.suspectThreshold;
      const anchored = suspect && teeToCenter < args.anchorThreshold;
      rows.push({
        hole: h.hole,
        teeToGreen,
        published: h.distanceYds,
        teeToCenter,
        suspect,
        anchored,
      });
    }

    const sus = rows.filter((r) => r.suspect);
    if (sus.length === 0) continue;
    coursesWithSuspect++;
    totalSuspect += sus.length;
    for (const r of sus) {
      suspectByHole.set(r.hole, (suspectByHole.get(r.hole) ?? 0) + 1);
      if (r.anchored) {
        totalAnchored++;
        anchoredByHole.set(r.hole, (anchoredByHole.get(r.hole) ?? 0) + 1);
      }
    }

    if (args.course) {
      console.log(`\n${course.name}  (center ${center.lat.toFixed(5)},${center.lng.toFixed(5)})`);
      for (const r of rows) {
        const tag = r.anchored ? " ANCHORED" : r.suspect ? " SUSPECT" : "";
        console.log(
          `  hole ${r.hole.toString().padStart(2)}: tee->green=${r.teeToGreen ?? "—"}y  published=${r.published ?? "—"}y  tee->center=${r.teeToCenter}y${tag}`,
        );
      }
    }
  }

  console.log(`\nScanned ${courses.length} courses.`);
  console.log(
    `  ${coursesWithSuspect} courses have at least one suspect hole.`,
  );
  console.log(
    `  ${totalSuspect} suspect holes total (tee->green diverges from published by >${args.suspectThreshold}y).`,
  );
  console.log(
    `  ${totalAnchored} of those (${totalSuspect > 0 ? Math.round((100 * totalAnchored) / totalSuspect) : 0}%) have the tee within ${args.anchorThreshold}y of course.center -- clubhouse anchor signature.`,
  );

  console.log(`\nDistribution by hole number:`);
  console.log(`  hole | suspect | anchored`);
  for (let n = 1; n <= 18; n++) {
    const s = suspectByHole.get(n) ?? 0;
    const a = anchoredByHole.get(n) ?? 0;
    if (s === 0) continue;
    console.log(`  ${n.toString().padStart(4)} | ${s.toString().padStart(7)} | ${a.toString().padStart(8)}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
