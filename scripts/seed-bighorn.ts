// Seeds Bighorn Golf Club - Canyons (Palm Desert, CA) into the Course
// table so any match created with this course name picks up the
// official pars. Idempotent: re-running just refreshes the data.
//
// Pars transcribed from the scorecard for the Canyons (Tom Fazio)
// course at Bighorn GC. 18 holes, par 72.
//
// Run against prod:
//   DATABASE_URL='postgres://...' npx tsx scripts/seed-bighorn.ts

import { PrismaClient } from "@prisma/client";

const COURSE_NAME = "Bighorn Golf Club - Canyons";

// Front 9: 4,4,5,3,4,5,3,4,4 = 36
// Back  9: 4,4,5,4,4,3,5,3,4 = 36
const PARS = [4, 4, 5, 3, 4, 5, 3, 4, 4, 4, 4, 5, 4, 4, 3, 5, 3, 4];

async function main() {
  if (PARS.length !== 18) throw new Error("PARS must have 18 entries");
  const total = PARS.reduce((a, b) => a + b, 0);
  if (total !== 72) throw new Error(`PARS sum ${total} != 72`);

  const prisma = new PrismaClient();
  try {
    const parData = JSON.stringify(PARS);
    const course = await prisma.course.upsert({
      where: { name: COURSE_NAME },
      update: { parData },
      create: { name: COURSE_NAME, parData },
    });
    console.log(`[seed] Course id=${course.id}  name="${course.name}"`);
    console.log(`[seed] Par data: ${PARS.join(", ")}  (total ${total})`);

    for (let i = 0; i < 18; i++) {
      const hole = i + 1;
      await prisma.courseHole.upsert({
        where: { courseId_hole: { courseId: course.id, hole } },
        update: {},
        create: { courseId: course.id, hole, source: "scorecard" },
      });
    }
    console.log(`[seed] 18 CourseHole rows ensured.`);
    console.log("[seed] Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
