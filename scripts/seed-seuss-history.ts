// One-shot historical round seeder for a given user.
//
// Inserts 6 completed solo rounds (taken from the reference screenshots) so
// the personal-stats page has real data to render. Idempotent on a per-match
// basis: matches are keyed by (createdById, scheduledAt, courseName), so
// rerunning won't duplicate.
//
// Run against the production DB:
//   # PowerShell (Windows):
//   $env:SEED_USERNAME = "seuss.md"
//   npx tsx scripts/seed-seuss-history.ts
//
//   # bash (Linux/Mac):
//   SEED_USERNAME=seuss.md npx tsx scripts/seed-seuss-history.ts
//
// SEED_USERNAME is the app account whose history we're seeding -- NOT the
// OS user. We require the account to already exist; the script errors out
// instead of silently creating a duplicate when a typo is passed.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Round = {
  scheduledAt: Date;
  courseName: string;
  pars: number[];
  totalOverPar: number;
  // 1 for front-9 / full rounds, 10 for back-9 rounds.
  startingHole?: number;
};

const PAR_18_72 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const ALONDRA_18 = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 4, 3, 5, 4, 4, 5];
const ALONDRA_FRONT_9 = ALONDRA_18.slice(0, 9); // par 36

const ROUNDS: Round[] = [
  {
    scheduledAt: new Date("2026-05-15T15:00:00-07:00"),
    courseName: "Alondra Park GC - North",
    pars: ALONDRA_FRONT_9,
    totalOverPar: 5, // 41 strokes on par 36
  },
  {
    scheduledAt: new Date("2026-05-01T15:00:00-07:00"),
    courseName: "Escena GC",
    pars: PAR_18_72,
    totalOverPar: 13, // 85 on par 72
  },
  {
    scheduledAt: new Date("2026-04-18T15:00:00-07:00"),
    courseName: "Recreation Park - South 9",
    // Executive layout, par 31 (5 par-3s, 4 par-4s).
    pars: [3, 4, 3, 4, 3, 3, 3, 4, 4],
    totalOverPar: 11, // 42 on par 31
  },
  {
    scheduledAt: new Date("2026-04-12T15:00:00-07:00"),
    courseName: "Torrey Pines GC - North",
    pars: [4, 5, 4, 3, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5, 5, 3, 4, 4], // par 72
    totalOverPar: 16,
  },
  {
    scheduledAt: new Date("2026-04-03T15:00:00-07:00"),
    courseName: "Alondra Park GC - North",
    pars: ALONDRA_18,
    totalOverPar: 16, // 88 on par 72
  },
  {
    scheduledAt: new Date("2026-03-19T15:00:00-07:00"),
    courseName: "Wolf Creek Golf Club",
    // 17 holes played, par 68 layout: 3 par-3s, 12 par-4s, 2 par-5s = 67.
    // Bump one 4 to 5 -> 68.
    pars: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 4, 4, 4, 5, 4],
    totalOverPar: 17, // 85 on par 68
  },
];

// Deterministic LCG so rerunning produces the same per-hole scores.
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Spread a target "over par" across holes as a mix of birdies, pars,
// bogeys, doubles. Deterministic per round via the seed.
function generateScores(pars: number[], totalOverPar: number, seed: number): number[] {
  const diffs = pars.map(() => 0);
  let target = totalOverPar;
  const rand = rng(seed);

  // Sprinkle one or two birdies for texture (1 per 9 holes, capped at 2).
  const birdiesToAdd = Math.min(2, Math.floor(pars.length / 9));
  for (let i = 0; i < birdiesToAdd; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const idx = Math.floor(rand() * pars.length);
      if (diffs[idx] === 0) {
        diffs[idx] = -1;
        target += 1;
        break;
      }
    }
  }

  // Distribute remaining over-par as bogeys (preferred) and doubles
  // (when bogeys are exhausted or randomly).
  let safety = pars.length * 6;
  while (target > 0 && safety-- > 0) {
    const idx = Math.floor(rand() * pars.length);
    if (diffs[idx] === 0) {
      // ~70% bogey, 30% jump straight to double (rare but realistic).
      diffs[idx] = rand() < 0.7 ? 1 : 2;
      target -= diffs[idx];
    } else if (diffs[idx] === 1 && target > 0) {
      diffs[idx] = 2;
      target -= 1;
    } else if (diffs[idx] === 2 && target > 0) {
      diffs[idx] = 3;
      target -= 1;
    }
  }

  // If we overshot (e.g. picked double when target=1), back off by trimming
  // one double back to a bogey.
  while (target < 0) {
    const overshootIdx = diffs.findIndex((d) => d >= 2);
    if (overshootIdx === -1) break;
    diffs[overshootIdx] -= 1;
    target += 1;
  }

  return diffs.map((d, i) => Math.max(1, pars[i] + d));
}

async function main() {
  // SEED_USERNAME is the explicit app-account override; USERNAME is a
  // fallback for compatibility with the old script, but on Windows
  // process.env.USERNAME is the OS account, so we strongly prefer the
  // SEED_ prefix.
  const usernameRaw = (process.env.SEED_USERNAME ?? process.env.USERNAME ?? "").trim();
  const username = usernameRaw.toLowerCase();
  if (!username) {
    console.error(
      "[seed] Set SEED_USERNAME to the app username you're seeding history for.",
    );
    process.exit(1);
  }
  console.log(`[seed] Using username "${username}"`);

  // Require the user already exists -- don't silently create a duplicate
  // from a typo'd env var on a production DB.
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(
      `[seed] No user with username "${username}". Check spelling (case-insensitive). Refusing to auto-create on prod.`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`[seed] Found user id=${user.id} username=${user.username}`);

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < ROUNDS.length; i++) {
    const round = ROUNDS[i];
    const parTotal = round.pars.reduce((a, b) => a + b, 0);
    const grossExpected = parTotal + round.totalOverPar;

    // De-dupe: if a match for this user + course + date already exists, skip.
    const existing = await prisma.match.findFirst({
      where: {
        createdById: user.id,
        courseName: round.courseName,
        scheduledAt: round.scheduledAt,
      },
    });
    if (existing) {
      console.log(
        `[seed] skip "${round.courseName}" ${round.scheduledAt.toISOString().slice(0, 10)} (already exists)`,
      );
      skipped++;
      continue;
    }

    const startingHole = round.startingHole ?? 1;
    const seed = (round.scheduledAt.getTime() % 2147483647) + i;
    const scores = generateScores(round.pars, round.totalOverPar, seed);
    const grossActual = scores.reduce((a, b) => a + b, 0);
    const vsParActual = grossActual - parTotal;

    if (vsParActual !== round.totalOverPar) {
      console.warn(
        `[seed] WARN ${round.courseName}: generated +${vsParActual}, wanted +${round.totalOverPar}. Gross ${grossActual} vs expected ${grossExpected}.`,
      );
    }

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
      `[seed] + ${round.courseName} ${round.scheduledAt.toISOString().slice(0, 10)}  gross=${grossActual}  +${vsParActual}  holes=${round.pars.length}  matchId=${match.id}`,
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
