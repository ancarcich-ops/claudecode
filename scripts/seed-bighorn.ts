// Seeds both Bighorn Golf Club courses (Canyons + Mountains, Palm
// Desert, CA) into the Course table so any match created with one of
// these course names picks up the official pars. Idempotent: re-
// running just refreshes the data.
//
// Pars transcribed from the scorecards. Both courses are par 72.
//
// Run against prod:
//   DATABASE_URL='postgres://...' npx tsx scripts/seed-bighorn.ts

import { PrismaClient } from "@prisma/client";

const COURSES = [
  {
    name: "Bighorn Golf Club - Canyons",
    // Front 4,4,5,3,4,5,3,4,4 = 36 / Back 4,4,5,4,4,3,5,3,4 = 36
    pars: [4, 4, 5, 3, 4, 5, 3, 4, 4, 4, 4, 5, 4, 4, 3, 5, 3, 4],
  },
  {
    name: "Bighorn Golf Club - Mountains",
    // Front 5,4,5,3,4,4,4,3,4 = 36 / Back 4,3,5,4,4,5,4,3,4 = 36
    pars: [5, 4, 5, 3, 4, 4, 4, 3, 4, 4, 3, 5, 4, 4, 5, 4, 3, 4],
  },
];

async function main() {
  for (const c of COURSES) {
    if (c.pars.length !== 18) throw new Error(`${c.name}: needs 18 pars`);
    const total = c.pars.reduce((a, b) => a + b, 0);
    if (total !== 72) throw new Error(`${c.name}: pars sum ${total} != 72`);
  }

  const prisma = new PrismaClient();
  try {
    for (const c of COURSES) {
      const parData = JSON.stringify(c.pars);
      const course = await prisma.course.upsert({
        where: { name: c.name },
        update: { parData },
        create: { name: c.name, parData },
      });
      console.log(`[seed] "${course.name}"  id=${course.id}`);
      console.log(`[seed]   pars: ${c.pars.join(", ")}`);

      for (let i = 0; i < 18; i++) {
        const hole = i + 1;
        await prisma.courseHole.upsert({
          where: { courseId_hole: { courseId: course.id, hole } },
          update: {},
          create: { courseId: course.id, hole, source: "scorecard" },
        });
      }
    }
    console.log("[seed] Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
