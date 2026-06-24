// Backfill: recompute teeLat/teeLng for golfbert-imported holes where
// the stored tee disagrees with the published yardage. No API calls.
//
// Approach: trust the green (already correct per check-tee-anchor) and
// the published distanceYds (matches realistic par-3/4/5 distributions).
// Use the fairway polygon to recover the hole's *direction*: the
// centroid of the fairway tells us which way the hole runs. Walk
// distanceYds from the green along the green->fairway-centroid axis
// and that's the proposed tee.
//
// Skips holes that:
//   - source != "golfbert"
//   - no fairway polygon stored
//   - no green / no published distance
//   - already plausible (|tee->green - distanceYds| <= suspectThreshold)
//   - admin-curated tee (heuristic: if any of greenFront/greenBack is
//     set, an admin touched the geometry -- leave the tee alone too)
//
// Run:
//   npx tsx scripts/recompute-tee-from-fairway.ts                     # dry
//   npx tsx scripts/recompute-tee-from-fairway.ts --course="Adobe"    # one
//   npx tsx scripts/recompute-tee-from-fairway.ts --apply             # write
//
// Flags:
//   --apply                actually write changes
//   --course="X"           limit to courses with name containing X
//   --suspect-threshold=N  only fix holes off by >N yards (default 100)
//   --max-shift=N          safety: skip if proposed tee is >N yards
//                          from the current tee (default 1500 -- catches
//                          algorithm failures before they make things
//                          worse than they already are)

import "./_load-env";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

type LL = { lat: number; lng: number };

function parseArgs(argv: string[]) {
  const flags = {
    apply: false,
    course: "",
    suspectThreshold: 100,
    maxShift: 1500,
  };
  for (const a of argv.slice(2)) {
    if (a === "--apply") flags.apply = true;
    else if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a.startsWith("--suspect-threshold=")) {
      const n = parseInt(a.slice("--suspect-threshold=".length), 10);
      if (Number.isFinite(n)) flags.suspectThreshold = n;
    } else if (a.startsWith("--max-shift=")) {
      const n = parseInt(a.slice("--max-shift=".length), 10);
      if (Number.isFinite(n)) flags.maxShift = n;
    }
  }
  return flags;
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

// Walk `distanceYds` from `green` along the (green -> fairwayCentroid)
// axis. Returns the proposed tee, or null if direction can't be
// established (green and fairway centroid overlap, fairway too small).
function projectTee(green: LL, fairwayPoly: LL[], distanceYds: number): LL | null {
  if (fairwayPoly.length < 3) return null;
  const cen = polygonCentroid(fairwayPoly);
  if (!cen) return null;

  const latToM = 111320;
  const lngToM = 111320 * Math.cos((green.lat * Math.PI) / 180);

  const xM = (cen.lng - green.lng) * lngToM;
  const yM = (cen.lat - green.lat) * latToM;
  const mag = Math.sqrt(xM * xM + yM * yM);
  if (mag < 1) return null;

  const distM = distanceYds * 0.9144;
  const dxM = (xM / mag) * distM;
  const dyM = (yM / mag) * distM;

  return {
    lat: green.lat + dyM / latToM,
    lng: green.lng + dxM / lngToM,
  };
}

function parsePolygon(json: string | null): LL[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    const pts: LL[] = [];
    for (const p of arr) {
      if (typeof p?.lat === "number" && typeof p?.lng === "number") {
        pts.push({ lat: p.lat, lng: p.lng });
      }
    }
    return pts.length > 0 ? pts : null;
  } catch {
    return null;
  }
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
    `${args.apply ? "APPLY" : "DRY-RUN"}: scanning ${courses.length} course${courses.length === 1 ? "" : "s"} (suspect>${args.suspectThreshold}y, max-shift=${args.maxShift}y)\n`,
  );

  let totalSuspect = 0;
  let totalPlanned = 0;
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
      currentTeeToGreen: number;
      published: number;
      proposedTeeToGreen: number;
      shift: number;
      newTee: LL;
      skipReason?: string;
    };
    const plans: Plan[] = [];

    for (const h of holes) {
      // Admin touched the geometry -- leave alone.
      if (h.greenFrontLat != null || h.greenBackLat != null) continue;

      const tee = { lat: h.teeLat!, lng: h.teeLng! };
      const green = { lat: h.greenLat!, lng: h.greenLng! };
      const published = h.distanceYds!;
      const currentTeeToGreen = Math.round(distanceYards(tee, green));
      if (Math.abs(currentTeeToGreen - published) <= args.suspectThreshold) continue;

      totalSuspect++;
      const fairway = parsePolygon(h.fairwayPolygonJson);
      if (!fairway) {
        totalSkipped++;
        continue;
      }
      const proposed = projectTee(green, fairway, published);
      if (!proposed) {
        totalSkipped++;
        continue;
      }
      const proposedTeeToGreen = Math.round(distanceYards(proposed, green));
      const shift = Math.round(distanceYards(tee, proposed));

      // Sanity: projection should land within ~30y of published (the
      // algorithm makes this exact in theory; check in case of edge
      // cases like degenerate polygons).
      if (Math.abs(proposedTeeToGreen - published) > 30) {
        plans.push({
          holeId: h.id,
          hole: h.hole,
          currentTeeToGreen,
          published,
          proposedTeeToGreen,
          shift,
          newTee: proposed,
          skipReason: `projection landed ${proposedTeeToGreen}y from green, expected ${published}y`,
        });
        totalSkipped++;
        continue;
      }
      if (shift > args.maxShift) {
        plans.push({
          holeId: h.id,
          hole: h.hole,
          currentTeeToGreen,
          published,
          proposedTeeToGreen,
          shift,
          newTee: proposed,
          skipReason: `would move tee ${shift}y -- exceeds --max-shift=${args.maxShift}y`,
        });
        totalSkipped++;
        continue;
      }
      plans.push({
        holeId: h.id,
        hole: h.hole,
        currentTeeToGreen,
        published,
        proposedTeeToGreen,
        shift,
        newTee: proposed,
      });
      totalPlanned++;
    }

    if (plans.length === 0) continue;
    const willApply = plans.filter((p) => !p.skipReason);
    if (willApply.length === 0 && !args.course) continue;
    coursesTouched++;
    if (args.course || willApply.length > 0) {
      console.log(
        `${course.name}  (${willApply.length} to fix, ${plans.length - willApply.length} skipped)`,
      );
      for (const p of plans) {
        const tag = p.skipReason ? `  SKIP: ${p.skipReason}` : "";
        console.log(
          `  hole ${p.hole.toString().padStart(2)}: current tee->green=${p.currentTeeToGreen}y published=${p.published}y proposed=${p.proposedTeeToGreen}y shift=${p.shift}y${tag}`,
        );
      }
    }

    if (args.apply) {
      // Batch updates in a transaction to amortize network latency.
      // Sequential awaits land each at ~150ms over the public internet;
      // a single tx with 100 statements lands the whole batch in one
      // round-trip.
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
    `\nSummary: ${totalSuspect} suspect holes. ${totalPlanned} can be fixed, ${totalSkipped} skipped (no fairway / projection fail / max-shift trip). ${args.apply ? `Applied: ${totalApplied}.` : "Rerun with --apply to write."}`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
