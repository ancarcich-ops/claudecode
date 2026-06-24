// V2 backfill: detect AND fix tees that are at the right distance but
// in the wrong direction (i.e., not near the fairway corridor).
//
// V1 (recompute-tee-from-fairway.ts) only moved tees where the
// measured tee->green distance disagreed with published by >30y. But
// some Golfbert tees land at coincidentally-right distances from the
// green in completely wrong directions (e.g., in the clubhouse parking
// lot at the published 187y range, instead of on the actual tee box).
// V1 leaves those alone -- distance check passes.
//
// V2 adds a direction check: is the stored tee within N yards of any
// point on the fairway polygon? If yes, plausible. If no, suspect.
// For suspect tees, re-derive using a better direction algorithm:
// project from the green AWAY from the fairway polygon's farthest
// vertex (which is the tee end of the fairway).
//
// Run:
//   npx tsx scripts/recompute-tee-v2.ts                 # dry-run
//   npx tsx scripts/recompute-tee-v2.ts --course="..."  # one course
//   npx tsx scripts/recompute-tee-v2.ts --apply         # write
//
// Flags:
//   --apply                  actually write changes
//   --course="X"             limit to courses containing X
//   --off-fairway=N          tee->nearest-fairway-edge > N suspect (default 60y)
//   --max-shift=N            don't move a tee more than N yards (default 1500y)

import "./_load-env";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

type LL = { lat: number; lng: number };

function parseArgs(argv: string[]) {
  const flags = { apply: false, course: "", offFairway: 60, maxShift: 1500 };
  for (const a of argv.slice(2)) {
    if (a === "--apply") flags.apply = true;
    else if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a.startsWith("--off-fairway=")) {
      const n = parseInt(a.slice("--off-fairway=".length), 10);
      if (Number.isFinite(n)) flags.offFairway = n;
    } else if (a.startsWith("--max-shift=")) {
      const n = parseInt(a.slice("--max-shift=".length), 10);
      if (Number.isFinite(n)) flags.maxShift = n;
    }
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

function farthestVertex(p: LL, poly: LL[]): LL | null {
  let best: LL | null = null;
  let bestD = -1;
  for (const q of poly) {
    const d = distanceYards(p, q);
    if (d > bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

// Project `distanceYds` from `green` along the (green -> farthestFairwayVertex)
// axis. That far vertex is the tee end of the fairway, so the direction
// from green to it points toward the tee. Magnitude comes from published
// distance. Result is the proposed tee position.
function projectTee(green: LL, far: LL, distanceYds: number): LL {
  const latToM = 111320;
  const lngToM = 111320 * Math.cos((green.lat * Math.PI) / 180);
  const xM = (far.lng - green.lng) * lngToM;
  const yM = (far.lat - green.lat) * latToM;
  const mag = Math.sqrt(xM * xM + yM * yM);
  if (mag < 1) return green;
  const distM = distanceYds * 0.9144;
  const dxM = (xM / mag) * distM;
  const dyM = (yM / mag) * distM;
  return {
    lat: green.lat + dyM / latToM,
    lng: green.lng + dxM / lngToM,
  };
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

  console.log(
    `${args.apply ? "APPLY" : "DRY-RUN"}: scanning ${courses.length} course${courses.length === 1 ? "" : "s"} (off-fairway>${args.offFairway}y, max-shift=${args.maxShift}y)\n`,
  );

  let totalSuspect = 0;
  let totalFixed = 0;
  let totalSkipped = 0;
  let totalApplied = 0;
  let coursesTouched = 0;

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
        id: true,
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
    });

    type Plan = {
      holeId: string;
      hole: number;
      offFairway: number;
      shift: number;
      newTee: LL;
      published: number;
      proposedToGreen: number;
      skipReason?: string;
    };
    const plans: Plan[] = [];

    for (const h of holes) {
      if (h.greenFrontLat != null || h.greenBackLat != null) continue;
      const tee = { lat: h.teeLat!, lng: h.teeLng! };
      const green = { lat: h.greenLat!, lng: h.greenLng! };
      const published = h.distanceYds!;
      const fairway = parsePoly(h.fairwayPolygonJson);
      if (!fairway || fairway.length < 3) continue;

      const offFairway = Math.round(distToNearestVertex(tee, fairway));
      if (offFairway <= args.offFairway) continue;
      totalSuspect++;

      const far = farthestVertex(green, fairway);
      if (!far) {
        totalSkipped++;
        continue;
      }
      const proposed = projectTee(green, far, published);
      const proposedToGreen = Math.round(distanceYards(proposed, green));
      const shift = Math.round(distanceYards(tee, proposed));

      // Sanity: projection should land within 30y of published (algorithm
      // makes it exact in theory)
      if (Math.abs(proposedToGreen - published) > 30) {
        plans.push({
          holeId: h.id,
          hole: h.hole,
          offFairway,
          shift,
          newTee: proposed,
          published,
          proposedToGreen,
          skipReason: `projection landed ${proposedToGreen}y vs ${published}y`,
        });
        totalSkipped++;
        continue;
      }
      if (shift > args.maxShift) {
        plans.push({
          holeId: h.id,
          hole: h.hole,
          offFairway,
          shift,
          newTee: proposed,
          published,
          proposedToGreen,
          skipReason: `would shift ${shift}y > --max-shift=${args.maxShift}y`,
        });
        totalSkipped++;
        continue;
      }
      // Sanity: don't move a tee that's already plausibly near the fairway
      // by *making it worse* -- new tee must be closer to fairway than old.
      const newOffFairway = distToNearestVertex(proposed, fairway);
      if (newOffFairway >= offFairway) {
        plans.push({
          holeId: h.id,
          hole: h.hole,
          offFairway,
          shift,
          newTee: proposed,
          published,
          proposedToGreen,
          skipReason: `new tee ${Math.round(newOffFairway)}y from fairway -- not an improvement`,
        });
        totalSkipped++;
        continue;
      }
      plans.push({
        holeId: h.id,
        hole: h.hole,
        offFairway,
        shift,
        newTee: proposed,
        published,
        proposedToGreen,
      });
      totalFixed++;
    }

    const willApply = plans.filter((p) => !p.skipReason);
    if (plans.length === 0) continue;
    coursesTouched++;
    if (args.course || willApply.length > 0) {
      console.log(
        `${course.name}  (${willApply.length} to fix, ${plans.length - willApply.length} skipped)`,
      );
      for (const p of plans) {
        const tag = p.skipReason ? `  SKIP: ${p.skipReason}` : "";
        console.log(
          `  hole ${p.hole.toString().padStart(2)}: offFairway=${p.offFairway}y published=${p.published}y proposed->green=${p.proposedToGreen}y shift=${p.shift}y${tag}`,
        );
      }
    }
    if (args.apply && willApply.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < willApply.length; i += chunkSize) {
        const chunk = willApply.slice(i, i + chunkSize);
        await prisma.$transaction(
          chunk.map((p) =>
            prisma.courseHole.update({
              where: { id: p.holeId },
              data: { teeLat: p.newTee.lat, teeLng: p.newTee.lng },
            }),
          ),
        );
        totalApplied += chunk.length;
      }
    }
  }

  console.log(
    `\nSummary: ${totalSuspect} tees were >${args.offFairway}y from fairway. ${totalFixed} can be fixed, ${totalSkipped} skipped (sanity / max-shift / not improvement). ${args.apply ? `Applied: ${totalApplied}.` : "Rerun with --apply to write."}`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
