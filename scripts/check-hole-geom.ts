// One-off inspector for a single hole's geometry. Run locally to see
// what's actually populated in Postgres for a (course, hole) pair --
// pars are easy to verify from courses.ts but polygon / tee / green
// markers + hazards live in the DB and are harder to eyeball.
//
// Usage:
//   npx tsx scripts/check-hole-geom.ts "PGA West (TPC Stadium course)" 3
//
// Prints:
//   - the Course row (name, center coords)
//   - the CourseHole row for the requested hole, with a green-polygon
//     summary (point count) instead of dumping the full JSON
//   - any CourseHazard rows on that hole

import "./_load-env";
import { prisma } from "../src/lib/db";

async function main() {
  const courseName = process.argv[2];
  const hole = parseInt(process.argv[3] ?? "", 10);
  if (!courseName || !Number.isFinite(hole)) {
    console.error(
      'Usage: npx tsx scripts/check-hole-geom.ts "<course name>" <hole>',
    );
    process.exit(1);
  }

  const course = await prisma.course.findFirst({
    where: { name: courseName },
    select: {
      id: true,
      name: true,
      centerLat: true,
      centerLng: true,
      osmFetchedAt: true,
    },
  });
  if (!course) {
    console.log(`No Course row for "${courseName}".`);
    process.exit(0);
  }
  console.log(`Course: ${course.name}  id=${course.id}`);
  console.log(
    `  center: ${course.centerLat}, ${course.centerLng}  ` +
      `osmFetchedAt=${course.osmFetchedAt?.toISOString() ?? "—"}`,
  );

  const h = await prisma.courseHole.findFirst({
    where: { courseId: course.id, hole },
    select: {
      teeLat: true,
      teeLng: true,
      greenLat: true,
      greenLng: true,
      greenFrontLat: true,
      greenFrontLng: true,
      greenBackLat: true,
      greenBackLng: true,
      greenPolygonJson: true,
      fairwayPolygonJson: true,
      distanceYds: true,
      source: true,
    },
  });
  if (!h) {
    console.log(`\nNo CourseHole row for hole ${hole}.`);
  } else {
    const greenPolyPts = (() => {
      if (!h.greenPolygonJson) return null;
      try {
        const arr = JSON.parse(h.greenPolygonJson);
        return Array.isArray(arr) ? arr.length : "(invalid)";
      } catch {
        return "(invalid)";
      }
    })();
    const fairwayPolyPts = (() => {
      if (!h.fairwayPolygonJson) return null;
      try {
        const arr = JSON.parse(h.fairwayPolygonJson);
        return Array.isArray(arr) ? arr.length : "(invalid)";
      } catch {
        return "(invalid)";
      }
    })();
    console.log(`\nHole ${hole}:`);
    console.log(`  tee:         ${fmt(h.teeLat, h.teeLng)}`);
    console.log(`  greenCenter: ${fmt(h.greenLat, h.greenLng)}`);
    console.log(`  greenFront:  ${fmt(h.greenFrontLat, h.greenFrontLng)}`);
    console.log(`  greenBack:   ${fmt(h.greenBackLat, h.greenBackLng)}`);
    console.log(
      `  greenPolygon:   ${greenPolyPts == null ? "—" : `${greenPolyPts} pts`}`,
    );
    console.log(
      `  fairwayPolygon: ${fairwayPolyPts == null ? "—" : `${fairwayPolyPts} pts`}`,
    );
    console.log(`  distanceYds: ${h.distanceYds ?? "—"}`);
    console.log(`  source:      ${h.source ?? "—"}`);
  }

  const hazards = await prisma.courseHazard.findMany({
    where: { courseId: course.id, hole },
    select: { kind: true, label: true, lat: true, lng: true },
  });
  console.log(`\nHazards on hole ${hole}: ${hazards.length}`);
  for (const hz of hazards) {
    console.log(
      `  ${hz.kind.padEnd(5)} ${hz.lat.toFixed(5)}, ${hz.lng.toFixed(5)}` +
        (hz.label ? `  ${hz.label}` : ""),
    );
  }
}

function fmt(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "—";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
