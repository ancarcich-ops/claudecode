// Dump the stored geometry for one course's holes 4 and 5.
// Used to diagnose Trump National hole 4/5 visual errors.
//
// Run: npx tsx scripts/check-trump-4-5.ts

import "./_load-env";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

async function main() {
  const courseName = process.argv[2] ?? "Trump National";
  const course = await prisma.course.findFirst({
    where: { name: { contains: courseName, mode: "insensitive" as const } } as never,
    select: { id: true, name: true, centerLat: true, centerLng: true },
  });
  if (!course) {
    console.log(`No course matches "${courseName}".`);
    process.exit(1);
  }
  console.log(`${course.name}  center=${course.centerLat?.toFixed(5)},${course.centerLng?.toFixed(5)}`);

  const holes = await prisma.courseHole.findMany({
    where: { courseId: course.id },
    select: {
      hole: true,
      teeLat: true,
      teeLng: true,
      greenLat: true,
      greenLng: true,
      greenFrontLat: true,
      greenBackLat: true,
      distanceYds: true,
      source: true,
      greenPolygonJson: true,
      fairwayPolygonJson: true,
    },
    orderBy: { hole: "asc" },
  });

  for (const h of holes) {
    const tee = h.teeLat != null && h.teeLng != null ? { lat: h.teeLat, lng: h.teeLng } : null;
    const green = h.greenLat != null && h.greenLng != null ? { lat: h.greenLat, lng: h.greenLng } : null;
    const teeToGreen = tee && green ? Math.round(distanceYards(tee, green)) : null;
    const adminPinned = h.greenFrontLat != null || h.greenBackLat != null;
    const fairwayPts = h.fairwayPolygonJson ? (() => {
      try {
        const a = JSON.parse(h.fairwayPolygonJson!);
        return Array.isArray(a) ? a.length : 0;
      } catch { return 0; }
    })() : 0;

    console.log(
      `hole ${h.hole.toString().padStart(2)}: tee=${tee ? `${tee.lat.toFixed(5)},${tee.lng.toFixed(5)}` : "—"}  green=${green ? `${green.lat.toFixed(5)},${green.lng.toFixed(5)}` : "—"}  pub=${h.distanceYds ?? "—"}y  measured=${teeToGreen ?? "—"}y  fwayPts=${fairwayPts}  src=${h.source ?? "—"}${adminPinned ? "  ADMIN-PINNED" : ""}`,
    );
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
