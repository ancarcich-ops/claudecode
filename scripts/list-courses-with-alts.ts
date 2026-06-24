// List courses whose imported holes have teeAlternativesJson populated
// (i.e., re-imported or imported after PR #364 added the column). Used
// to find a course we can run dump-tee-alternatives.ts against.

import "./_load-env";
import { prisma } from "../src/lib/db";

async function main() {
  const rows = await prisma.course.findMany({
    where: { holes: { some: { teeAlternativesJson: { not: null } } } },
    select: { name: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  console.log(`Found ${rows.length} courses with teeAlternativesJson populated (showing up to 20):`);
  for (const r of rows) console.log(`  ${r.name}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
