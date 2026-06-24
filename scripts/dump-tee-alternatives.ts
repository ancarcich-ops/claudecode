// Dump the stored teeAlternativesJson for one course's suspect holes.
// Each row is one teebox Golfbert returned at import time: its color,
// stored lat/lng, and length. We compute tee->green (using the same
// stored green coords) for every alternative so we can spot whether
// (a) the picked tee's length+position are self-consistent (tee.length
// matches the distance from THAT tee.coordinates to the green) or
// (b) some other alternative would have been a better pick.
//
// Run:
//   npx tsx scripts/dump-tee-alternatives.ts "Adobe Creek" 8

import "./_load-env";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

type Alt = {
  color?: string;
  teeboxtype?: string | null;
  lat: number;
  lng: number;
  yds: number | null;
};

async function main() {
  const courseName = process.argv[2];
  const holeArg = process.argv[3];
  const holeNum = holeArg ? parseInt(holeArg, 10) : null;
  if (!courseName) {
    console.error(
      'Usage: npx tsx scripts/dump-tee-alternatives.ts "<course name>" [hole]',
    );
    process.exit(1);
  }

  const course = await prisma.course.findFirst({
    where: { name: { contains: courseName, mode: "insensitive" } },
    select: { id: true, name: true, centerLat: true, centerLng: true },
  });
  if (!course) {
    console.error(`No course matches "${courseName}".`);
    process.exit(1);
  }
  console.log(`${course.name}  (center ${course.centerLat?.toFixed(5)},${course.centerLng?.toFixed(5)})`);

  const holes = await prisma.courseHole.findMany({
    where: {
      courseId: course.id,
      ...(holeNum != null ? { hole: holeNum } : {}),
      teeAlternativesJson: { not: null },
    },
    select: {
      hole: true,
      teeLat: true,
      teeLng: true,
      greenLat: true,
      greenLng: true,
      distanceYds: true,
      teeAlternativesJson: true,
    },
    orderBy: { hole: "asc" },
  });

  for (const h of holes) {
    console.log(
      `\nHole ${h.hole}  published=${h.distanceYds}y  storedTee=${h.teeLat?.toFixed(5)},${h.teeLng?.toFixed(5)}  green=${h.greenLat?.toFixed(5)},${h.greenLng?.toFixed(5)}`,
    );
    if (h.greenLat == null || h.greenLng == null) {
      console.log("  (no green coords — skipping distance math)");
      continue;
    }
    const green = { lat: h.greenLat, lng: h.greenLng };
    const storedTee = h.teeLat != null && h.teeLng != null
      ? { lat: h.teeLat, lng: h.teeLng }
      : null;

    let alts: Alt[];
    try {
      alts = JSON.parse(h.teeAlternativesJson!);
    } catch {
      console.log("  (invalid teeAlternativesJson)");
      continue;
    }

    console.log(
      "    color           teeboxtype       lat,lng                       yds    measuredToGreen   isStored",
    );
    for (const a of alts) {
      const aPt = { lat: a.lat, lng: a.lng };
      const measured = Math.round(distanceYards(aPt, green));
      const isStored = storedTee
        ? distanceYards(aPt, storedTee) < 5
        : false;
      console.log(
        `    ${(a.color ?? "").padEnd(15)} ${(a.teeboxtype ?? "").padEnd(15)} ${a.lat.toFixed(5)},${a.lng.toFixed(5)}    ${(a.yds ?? "—").toString().padStart(4)}y ${measured.toString().padStart(7)}y       ${isStored ? "<--" : ""}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
