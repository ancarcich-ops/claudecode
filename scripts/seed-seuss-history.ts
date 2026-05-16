// One-shot historical round seeder. CLI alternative to the in-app
// /settings → "Import demo rounds" button.
//
// Run against the production DB. The user clicking the in-app button is
// simpler -- this exists for non-interactive setup / CI / data backfills.
//
// Bash / macOS:
//   DATABASE_URL='postgres://...' SEED_USERNAME=seuss \
//     npx tsx scripts/seed-seuss-history.ts
//
// Windows PowerShell:
//   $env:DATABASE_URL = "postgres://..."
//   $env:SEED_USERNAME = "seuss"
//   npx tsx scripts/seed-seuss-history.ts
//
// SEED_USERNAME defaults to "seuss". (Windows reserves the bare USERNAME
// env var to the current Windows account, hence the prefix.)

import { PrismaClient } from "@prisma/client";
import { DEMO_ROUNDS, generateScores } from "../src/lib/demoRounds";

const prisma = new PrismaClient();

async function main() {
  const username = (process.env.SEED_USERNAME ?? "seuss").trim().toLowerCase();
  console.log(`[seed] Using username "${username}"`);

  const user = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      displayName: username.charAt(0).toUpperCase() + username.slice(1),
    },
  });
  console.log(`[seed] User id=${user.id} username=${user.username}`);

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < DEMO_ROUNDS.length; i++) {
    const round = DEMO_ROUNDS[i];
    const parTotal = round.pars.reduce((a, b) => a + b, 0);

    const existing = await prisma.match.findFirst({
      where: {
        createdById: user.id,
        courseName: round.courseName,
        scheduledAt: round.scheduledAt,
      },
    });
    if (existing) {
      console.log(
        `[seed] skip "${round.courseName}" ${round.scheduledAt
          .toISOString()
          .slice(0, 10)} (already exists)`,
      );
      skipped++;
      continue;
    }

    const startingHole = round.startingHole ?? 1;
    const seed = (round.scheduledAt.getTime() % 2147483647) + i;
    const scores = generateScores(round.pars, round.totalOverPar, seed);
    const grossActual = scores.reduce((a, b) => a + b, 0);
    const vsParActual = grossActual - parTotal;

    const match = await prisma.match.create({
      data: {
        courseName: round.courseName,
        scheduledAt: round.scheduledAt,
        completedAt: round.scheduledAt,
        startedAt: round.scheduledAt,
        holes: round.pars.length,
        startingHole,
        status: "COMPLETED",
        scoringMode: "NET",
        parData: JSON.stringify(round.pars),
        createdById: user.id,
        players: {
          create: [
            {
              displayName: user.displayName ?? user.username,
              handicap: 14,
              seat: 0,
              userId: user.id,
              scores: {
                create: scores.map((strokes, idx) => ({
                  hole: startingHole + idx,
                  strokes,
                })),
              },
            },
          ],
        },
      },
    });
    created++;
    console.log(
      `[seed] + ${round.courseName} ${round.scheduledAt
        .toISOString()
        .slice(0, 10)}  gross=${grossActual}  +${vsParActual}  holes=${round.pars.length}  matchId=${match.id}`,
    );
  }

  console.log(`[seed] done. created=${created} skipped=${skipped}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
