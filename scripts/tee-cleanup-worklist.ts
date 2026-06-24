// Worklist for the residual tee-position issues that the
// recompute-tee-from-fairway backfill couldn't auto-correct.
//
// After two passes of the backfill, ~4% of holes still have visibly-off
// tee markers. These fall into two buckets:
//
//   (1) Tee distance to green matches published, but the tee was
//       placed in a wrong DIRECTION (e.g. in a clubhouse parking lot
//       at the right yardage). The audit doesn't catch these because
//       the distance is right.
//
//   (2) Inter-hole walk anomalies that survived the backfill -- usually
//       legitimate (front/back nine wraps around the clubhouse) but
//       sometimes a tee in the wrong spot.
//
// This script identifies bucket (1) by checking how far each stored tee
// sits from the nearest fairway-polygon vertex. Fairway polygons hug
// the play corridor; a tee well outside the fairway is suspect.
//
// Usage:
//
//   # Default: print a worklist grouped by course (the most-broken
//   # courses first). Threshold defaults to 100y off-fairway.
//   npx tsx scripts/tee-cleanup-worklist.ts
//
//   # Detail mode for one course (prints every hole's geometry +
//   # admin URL).
//   npx tsx scripts/tee-cleanup-worklist.ts --course="Pebble Beach"
//
//   # Markdown output (better for handing to another agent or
//   # pasting into a doc).
//   npx tsx scripts/tee-cleanup-worklist.ts --markdown > worklist.md
//
//   # Tweak the off-fairway threshold (smaller -> more holes flagged).
//   npx tsx scripts/tee-cleanup-worklist.ts --off-fairway=60
//
//   # Limit output to top N courses (default 50; use 0 for all).
//   npx tsx scripts/tee-cleanup-worklist.ts --top=20
//
// The admin URL for each course is `/admin/courses/<urlencoded-name>`.
// Open it, find the listed hole, hit "Move tee", click the actual tee
// box in satellite, save. The audit script (scripts/audit-tee-boxes.ts)
// is the source of truth for "is this hole still broken" after a fix.

import "./_load-env";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

type LL = { lat: number; lng: number };

function parseArgs(argv: string[]) {
  const flags = {
    course: "",
    offFairway: 100,
    top: 50,
    markdown: false,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a.startsWith("--off-fairway=")) {
      const n = parseInt(a.slice("--off-fairway=".length), 10);
      if (Number.isFinite(n)) flags.offFairway = n;
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

function distToNearestVertex(p: LL, poly: LL[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const q of poly) {
    const d = distanceYards(p, q);
    if (d < best) best = d;
  }
  return best;
}

function adminUrl(courseName: string): string {
  return `/admin/courses/${encodeURIComponent(courseName)}`;
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
      const offFairway = Math.round(distToNearestVertex(tee, fairway));
      if (offFairway <= args.offFairway) continue;
      const measured = Math.round(distanceYards(tee, green));
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
      });
    }
  }

  // Group by course.
  const byCourse = new Map<string, Row[]>();
  for (const r of all) {
    const list = byCourse.get(r.courseName) ?? [];
    list.push(r);
    byCourse.set(r.courseName, list);
  }
  const sorted = [...byCourse.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  if (args.course) {
    for (const [name, rows] of sorted) {
      print(name, rows, args.markdown);
    }
    summary(all, byCourse, args, true);
    await prisma.$disconnect();
    return;
  }

  if (args.markdown) {
    console.log(`# Tee-cleanup worklist`);
    console.log(``);
    console.log(
      `Holes where the stored tee sits more than ${args.offFairway}y from the nearest fairway-polygon vertex. These are likely placed in the wrong direction (correct distance from green, but off the play corridor -- typically in a parking lot or beside the clubhouse).`,
    );
    console.log(``);
    console.log(
      `For each row: open the admin URL, find the listed hole, hit **Move tee**, click the real tee box in satellite imagery, save.`,
    );
    console.log(``);
  } else {
    console.log(
      `Worklist: holes >${args.offFairway}y from nearest fairway vertex (likely wrong direction).\n`,
    );
  }

  const limit = args.top > 0 ? Math.min(args.top, sorted.length) : sorted.length;
  for (let i = 0; i < limit; i++) {
    const [name, rows] = sorted[i];
    print(name, rows, args.markdown);
  }

  summary(all, byCourse, args, false);
  await prisma.$disconnect();
}

function print(name: string, rows: { hole: number; teeLat: number; teeLng: number; greenLat: number; greenLng: number; published: number; measured: number; offFairway: number }[], markdown: boolean) {
  const url = adminUrl(name);
  if (markdown) {
    console.log(`## ${name}`);
    console.log(``);
    console.log(`Admin: [\`${url}\`](${url})`);
    console.log(``);
    console.log(`| hole | tee | green | pub | measured | offFairway |`);
    console.log(`|-----:|-----|-------|----:|---------:|-----------:|`);
    for (const r of rows.sort((a, b) => a.hole - b.hole)) {
      console.log(
        `| ${r.hole} | ${r.teeLat.toFixed(5)}, ${r.teeLng.toFixed(5)} | ${r.greenLat.toFixed(5)}, ${r.greenLng.toFixed(5)} | ${r.published}y | ${r.measured}y | ${r.offFairway}y |`,
      );
    }
    console.log(``);
  } else {
    console.log(`${name}  (${rows.length} hole${rows.length === 1 ? "" : "s"})`);
    console.log(`  ${url}`);
    for (const r of rows.sort((a, b) => a.hole - b.hole)) {
      console.log(
        `  hole ${r.hole.toString().padStart(2)}: tee=${r.teeLat.toFixed(5)},${r.teeLng.toFixed(5)}  green=${r.greenLat.toFixed(5)},${r.greenLng.toFixed(5)}  pub=${r.published}y measured=${r.measured}y offFairway=${r.offFairway}y`,
      );
    }
    console.log(``);
  }
}

function summary(
  all: { courseName: string }[],
  byCourse: Map<string, unknown>,
  args: { top: number; offFairway: number },
  detail: boolean,
) {
  if (detail) return;
  const shown = args.top > 0 ? Math.min(args.top, byCourse.size) : byCourse.size;
  console.log(
    `\nShowing top ${shown} of ${byCourse.size} courses (${all.length} flagged holes total, threshold ${args.offFairway}y).`,
  );
  if (args.top > 0 && byCourse.size > args.top) {
    console.log(
      `${byCourse.size - args.top} more courses have at least one flagged hole. Rerun with --top=0 to see them all, or --top=N for the next slice.`,
    );
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
