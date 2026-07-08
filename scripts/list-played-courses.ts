// Lists the courses your group has actually logged rounds on, most-
// played first -- the ONLY courses where a hand-gathered Course
// Rating / Slope changes a handicap today. Everything else falls back
// to the yardage estimate, so there's no reason to gather real values
// for courses with zero rounds.
//
// Also flags which of those courses still lack a real (non-estimated)
// rating, so you can see exactly what's left to gather.
//
// Usage:
//   DATABASE_URL=postgres://... npx tsx scripts/list-played-courses.ts

import { prisma } from "../src/lib/db";

async function main() {
  // Round counts per course name, across all completed/in-progress
  // matches (a round counts once even if several players logged it).
  const matches = await prisma.match.findMany({
    where: { status: { in: ["COMPLETED", "IN_PROGRESS"] } },
    select: { courseName: true, holes: true },
  });

  const counts = new Map<string, { rounds: number; holes: Set<number> }>();
  for (const m of matches) {
    const e = counts.get(m.courseName) ?? { rounds: 0, holes: new Set() };
    e.rounds++;
    e.holes.add(m.holes);
    counts.set(m.courseName, e);
  }

  const names = [...counts.keys()];
  const courses = await prisma.course.findMany({
    where: { name: { in: names } },
    select: { name: true, rating: true, ratingEstimated: true },
  });
  const ratingByName = new Map(courses.map((c) => [c.name, c]));

  const rows = [...counts.entries()]
    .map(([name, e]) => {
      const c = ratingByName.get(name);
      const hasReal = c?.rating != null && c.ratingEstimated === false;
      return {
        name,
        rounds: e.rounds,
        holes: [...e.holes].sort().join("/"),
        status: hasReal ? "REAL" : c?.rating != null ? "estimate" : "none",
      };
    })
    .sort((a, b) => b.rounds - a.rounds);

  console.log(`${rows.length} courses have logged rounds:\n`);
  for (const r of rows) {
    const need = r.status === "REAL" ? "" : "   <- gather rating/slope";
    console.log(
      `${String(r.rounds).padStart(3)} rounds  ${r.holes.padEnd(5)} [${r.status.padEnd(8)}] ${r.name}${need}`,
    );
  }
  const need = rows.filter((r) => r.status !== "REAL").length;
  console.log(`\n${need} of ${rows.length} still need a real rating.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
