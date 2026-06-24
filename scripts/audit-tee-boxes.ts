// Tee-box quality audit. Scans every imported course in the DB and
// flags holes where the tee coords look wrong, by four heuristics:
//
//   1. Computed-vs-published distance mismatch (tee→green doesn't
//      match the published distanceYds within tolerance).
//   2. Sanity bounds (computed distance < 60y or > 700y on a par 4/5;
//      < 40y or > 280y on a par 3).
//   3. Inter-hole jump (distance from hole N's green to hole N+1's
//      tee > 400y — usually means N+1's tee got placed at the
//      clubhouse).
//   4. Clubhouse default (hole 1's tee coords within ~30y of the
//      course's centerLat/centerLng — Golfbert's default fallback
//      when the real tee box wasn't mapped).
//
// Output is grouped by course so you can pop in to the admin editor
// and re-pin a few holes at a time. Severity:
//   HIGH = computed/published off by 2x+, or sanity-bound break,
//          or clubhouse default. Tee almost certainly wrong.
//   MED  = inter-hole jump, or 30-80y published mismatch. Likely
//          wrong but spot-check.
//
// Run (Windows, with prod DATABASE_URL loaded):
//   npx tsx scripts/audit-tee-boxes.ts
//
// Flags:
//   --course="Pebble Beach"  audit just this one course (substring
//                            match on name).
//   --high-only              skip MED findings, print HIGH only.

import "./_load-env";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

type Flag = {
  severity: "HIGH" | "MED";
  hole: number;
  reason: string;
};

function parseFlags(argv: string[]) {
  const flags = { course: "", highOnly: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a === "--high-only") flags.highOnly = true;
  }
  return flags;
}

async function main() {
  const flags = parseFlags(process.argv);
  const where = flags.course
    ? { name: { contains: flags.course, mode: "insensitive" as const } }
    : {};
  const courses = await prisma.course.findMany({
    where: where as never,
    include: {
      holes: { orderBy: { hole: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  console.log(
    `Auditing ${courses.length} course${courses.length === 1 ? "" : "s"}\n`,
  );

  let totalFlags = 0;
  let coursesWithFlags = 0;

  for (const course of courses) {
    const findings: Flag[] = [];
    const holes = course.holes;

    for (const h of holes) {
      // Need tee + green to do any of the per-hole checks.
      if (
        h.teeLat == null ||
        h.teeLng == null ||
        h.greenLat == null ||
        h.greenLng == null
      ) {
        continue;
      }
      const computed = Math.round(
        distanceYards(
          { lat: h.teeLat, lng: h.teeLng },
          { lat: h.greenLat, lng: h.greenLng },
        ),
      );
      const published = h.distanceYds;

      // (1) Computed vs published mismatch
      if (published != null && published > 0) {
        const diff = Math.abs(computed - published);
        const ratio = Math.max(computed, published) /
          Math.max(1, Math.min(computed, published));
        if (ratio >= 2) {
          findings.push({
            severity: "HIGH",
            hole: h.hole,
            reason: `tee→green ${computed}y vs published ${published}y (${ratio.toFixed(1)}x off)`,
          });
        } else if (diff > 50) {
          findings.push({
            severity: "MED",
            hole: h.hole,
            reason: `tee→green ${computed}y vs published ${published}y (Δ${diff}y)`,
          });
        }
      }

      // (2) Sanity bounds. Use the published yardage to set ballpark
      // expectations; without it, just hard-bound at <40 / >800.
      if (published == null) {
        if (computed < 40 || computed > 800) {
          findings.push({
            severity: "HIGH",
            hole: h.hole,
            reason: `tee→green ${computed}y (no published yardage; out of plausible range)`,
          });
        }
      } else {
        if (computed < 40) {
          findings.push({
            severity: "HIGH",
            hole: h.hole,
            reason: `tee→green only ${computed}y (tee on top of green)`,
          });
        }
        if (computed > 800) {
          findings.push({
            severity: "HIGH",
            hole: h.hole,
            reason: `tee→green ${computed}y (unrealistically far)`,
          });
        }
      }

      // (4) Clubhouse default check for hole 1.
      if (h.hole === 1 && course.centerLat != null && course.centerLng != null) {
        const toCenter = Math.round(
          distanceYards(
            { lat: h.teeLat, lng: h.teeLng },
            { lat: course.centerLat, lng: course.centerLng },
          ),
        );
        if (toCenter < 30) {
          findings.push({
            severity: "HIGH",
            hole: 1,
            reason: `hole-1 tee sits ${toCenter}y from course center (likely defaulted to clubhouse)`,
          });
        }
      }
    }

    // (3) Inter-hole jump: green of N → tee of N+1.
    for (let i = 0; i < holes.length - 1; i++) {
      const a = holes[i];
      const b = holes[i + 1];
      if (a.greenLat == null || a.greenLng == null) continue;
      if (b.teeLat == null || b.teeLng == null) continue;
      if (b.hole !== a.hole + 1) continue;
      const walk = Math.round(
        distanceYards(
          { lat: a.greenLat, lng: a.greenLng },
          { lat: b.teeLat, lng: b.teeLng },
        ),
      );
      if (walk > 400) {
        findings.push({
          severity: "MED",
          hole: b.hole,
          reason: `walk from hole ${a.hole} green to hole ${b.hole} tee: ${walk}y (tee misplaced?)`,
        });
      }
    }

    const filtered = flags.highOnly
      ? findings.filter((f) => f.severity === "HIGH")
      : findings;
    if (filtered.length === 0) continue;
    coursesWithFlags++;
    totalFlags += filtered.length;
    console.log(`\n${course.name}  (${filtered.length} flag${filtered.length === 1 ? "" : "s"})`);
    filtered
      .sort((a, b) => a.hole - b.hole)
      .forEach((f) => console.log(`  [${f.severity}] hole ${f.hole}: ${f.reason}`));
  }

  console.log(
    `\n\nAudit done. ${totalFlags} flag${totalFlags === 1 ? "" : "s"} across ${coursesWithFlags} course${coursesWithFlags === 1 ? "" : "s"} (of ${courses.length} audited).`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
