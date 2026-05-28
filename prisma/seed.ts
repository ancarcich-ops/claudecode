// Demo data for local development only. Run with `npm run db:seed`.
// Do NOT run this against the production database — it's just so the app
// looks alive while building/previewing.
import { PrismaClient } from "@prisma/client";
import { pregnancyProgress } from "../src/lib/pregnancy";
import { DEFAULT_DUE_DATE } from "../src/lib/settings";

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  const dueDate = DEFAULT_DUE_DATE;

  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: { dueDate, momName: "Geena", partnerName: "Daddy", babyName: "Baby girl" },
    create: {
      id: "singleton",
      dueDate,
      momName: "Geena",
      partnerName: "Daddy",
      babyName: "Baby girl",
    },
  });

  await prisma.craving.deleteMany();
  await prisma.aversion.deleteMany();

  const seed = [
    { food: "Dill pickles", category: "sour", intensity: 5, loggedBy: "geena", satisfied: true, satisfiedBy: "daddy", days: 0 },
    { food: "Mango with chili & lime", category: "fruit", intensity: 4, loggedBy: "geena", isWild: true, stars: 4, days: 1 },
    { food: "Mac & cheese", category: "carbs", intensity: 4, loggedBy: "daddy", satisfied: true, satisfiedBy: "takeout", days: 2 },
    { food: "Pickles dipped in peanut butter", category: "other", intensity: 5, loggedBy: "geena", isWild: true, stars: 5, days: 3 },
    { food: "Ice-cold watermelon", category: "fruit", intensity: 3, loggedBy: "geena", satisfied: true, satisfiedBy: "daddy", days: 4 },
    { food: "Spicy ramen at 1am", category: "spicy", intensity: 5, loggedBy: "daddy", isWild: true, stars: 3, days: 5 },
    { food: "Lemon bars", category: "sweet", intensity: 4, loggedBy: "geena", days: 6 },
    { food: "Salt & vinegar chips", category: "salty", intensity: 4, loggedBy: "geena", satisfied: true, satisfiedBy: "daddy", days: 8 },
    { food: "Chocolate milkshake", category: "dairy", intensity: 3, loggedBy: "daddy", days: 11 },
  ];

  for (const s of seed) {
    const cravedAt = daysAgo(s.days);
    const prog = pregnancyProgress(dueDate, cravedAt);
    await prisma.craving.create({
      data: {
        food: s.food,
        category: s.category,
        intensity: s.intensity,
        loggedBy: s.loggedBy,
        satisfied: s.satisfied ?? false,
        satisfiedBy: s.satisfiedBy ?? null,
        isWild: s.isWild ?? false,
        stars: s.stars ?? 0,
        week: prog.week,
        trimester: prog.trimester,
        cravedAt,
      },
    });
  }

  for (const a of [
    { food: "Coffee", severity: 5, loggedBy: "geena" },
    { food: "Scrambled eggs", severity: 4, loggedBy: "geena" },
    { food: "The smell of raw chicken", severity: 5, loggedBy: "daddy" },
  ]) {
    const prog = pregnancyProgress(dueDate, new Date());
    await prisma.aversion.create({
      data: { ...a, week: prog.week, trimester: prog.trimester },
    });
  }

  console.log("Seeded Bloom demo data 🌸");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
