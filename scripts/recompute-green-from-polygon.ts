// One-shot backfill: recompute every imported hole's greenLat/greenLng
// from its stored greenPolygonJson. Zero Golfbert API calls.
//
// Why: the import previously used h.flagcoords as the green center,
// which on bulk-imported courses lands at the course clubhouse/center
// instead of the actual flag (see scripts/audit-tee-boxes.ts -- ~92%
// of courses flagged with computed tee->green ~2x the published
// yardage). The green POLYGON, however, was always fetched per-hole
// and is correct. This script reads the polygon JSON we already have
// and sets greenLat/greenLng to its centroid.
//
// Skips holes that:
//   - have no greenPolygonJson (no polygon to derive from)
//   - have source != "golfbert" (admin-curated, leave alone)
//   - were touched by admin (heuristic: if greenFrontLat/Lng or
//     greenBackLat/Lng is set, an admin pinned the green explicitly --
//     leave the center alone)
//
// Run (Windows, with prod DATABASE_URL loaded):
//   npx tsx scripts/recompute-green-from-polygon.ts            # dry run
//   npx tsx scripts/recompute-green-from-polygon.ts --apply    # write
//
// Flags:
//   --apply              actually write changes (otherwise dry-run)
//   --course="Pebble"    limit to courses whose name contains this
//   --min-shift=20       only flag holes where centroid is >= Ny from
//                        the current greenLat/greenLng (default 20y;
//                        skips trivially-equal cases)

import "./_load-env";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

function parseArgs(argv: string[]) {
  const flags = { apply: false, course: "", minShift: 20 };
  for (const a of argv.slice(2)) {
    if (a === "--apply") flags.apply = true;
    else if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a.startsWith("--min-shift=")) {
      const n = parseInt(a.slice("--min-shift=".length), 10);
      if (Number.isFinite(n)) flags.minShift = n;
    }
  }
  return flags;
}

function polygonCentroid(json: string): { lat: number; lng: number } | null {
  let pts: { lat: number; lng: number }[];
  try {
    pts = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(pts) || pts.length === 0) return null;
  let sLat = 0;
  let sLng = 0;
  let n = 0;
  for (const p of pts) {
    if (typeof p?.lat !== "number" || typeof p?.lng !== "number") continue;
    sLat += p.lat;
    sLng += p.lng;
    n++;
  }
  if (n === 0) return null;
  return { lat: sLat / n, lng: sLng / n };
}

async function main() {
  const args = parseArgs(process.argv);
  const courseWhere = args.course
    ? { name: { contains: args.course, mode: "insensitive" as const } }
    : {};
  const courses = await prisma.course.findMany({
    where: courseWhere as never,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log(
    `${args.apply ? "APPLY" : "DRY-RUN"}: scanning ${courses.length} course${courses.length === 1 ? "" : "s"} (min-shift=${args.minShift}y)\n`,
  );

  let totalCandidates = 0;
  let totalWouldUpdate = 0;
  let totalUpdated = 0;
  let coursesTouched = 0;

  for (const course of courses) {
    const holes = await prisma.courseHole.findMany({
      where: {
        courseId: course.id,
        source: "golfbert",
        greenPolygonJson: { not: null },
      },
      select: {
        id: true,
        hole: true,
        greenLat: true,
        greenLng: true,
        greenFrontLat: true,
        greenFrontLng: true,
        greenBackLat: true,
        greenBackLng: true,
        greenPolygonJson: true,
      },
    });

    type Plan = { holeId: string; hole: number; from: string; to: string; shiftY: number };
    const plan: Plan[] = [];

    for (const h of holes) {
      // Admin pinned the green explicitly -- don't touch.
      if (
        h.greenFrontLat != null ||
        h.greenFrontLng != null ||
        h.greenBackLat != null ||
        h.greenBackLng != null
      ) {
        continue;
      }
      totalCandidates++;
      const cen = polygonCentroid(h.greenPolygonJson!);
      if (!cen) continue;
      const currentSet = h.greenLat != null && h.greenLng != null;
      const shift = currentSet
        ? Math.round(
            distanceYards(
              { lat: h.greenLat!, lng: h.greenLng! },
              cen,
            ),
          )
        : Number.POSITIVE_INFINITY;
      if (shift < args.minShift) continue;
      plan.push({
        holeId: h.id,
        hole: h.hole,
        from: currentSet
          ? `${h.greenLat!.toFixed(5)},${h.greenLng!.toFixed(5)}`
          : "—",
        to: `${cen.lat.toFixed(5)},${cen.lng.toFixed(5)}`,
        shiftY: Number.isFinite(shift) ? shift : -1,
      });
    }

    if (plan.length === 0) continue;
    coursesTouched++;
    totalWouldUpdate += plan.length;
    console.log(
      `${course.name}  (${plan.length} hole${plan.length === 1 ? "" : "s"} to update)`,
    );
    for (const p of plan) {
      console.log(
        `  hole ${p.hole.toString().padStart(2)}: ${p.from} -> ${p.to}  (shift ${p.shiftY < 0 ? "new" : `${p.shiftY}y`})`,
      );
    }

    if (args.apply) {
      for (const p of plan) {
        const cen = polygonCentroid(
          (await prisma.courseHole.findUnique({
            where: { id: p.holeId },
            select: { greenPolygonJson: true },
          }))!.greenPolygonJson!,
        )!;
        await prisma.courseHole.update({
          where: { id: p.holeId },
          data: { greenLat: cen.lat, greenLng: cen.lng },
        });
        totalUpdated++;
      }
    }
  }

  console.log(
    `\nDone. Candidates scanned: ${totalCandidates}. Would update: ${totalWouldUpdate} (${coursesTouched} courses). ${args.apply ? `Actually updated: ${totalUpdated}.` : "Rerun with --apply to write."}`,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
