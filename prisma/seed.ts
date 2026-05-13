import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const usernames = ["bryson", "rory", "jt", "morikawa"];
  const users = await Promise.all(
    usernames.map((u) =>
      prisma.user.upsert({
        where: { username: u },
        update: {},
        create: { username: u },
      }),
    ),
  );

  // Upcoming match — pure model + a couple early wagers
  const upcoming = await prisma.match.create({
    data: {
      courseName: "Pebble Beach Golf Links",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      holes: 18,
      status: "UPCOMING",
      createdById: users[0].id,
      notes: "Front-9 skins, $5 closeouts (just talk).",
      players: {
        create: [
          { displayName: "Bryson", handicap: 4, seat: 0, userId: users[0].id },
          { displayName: "Rory", handicap: 6, seat: 1, userId: users[1].id },
          { displayName: "JT", handicap: 11, seat: 2, userId: users[2].id },
        ],
      },
    },
    include: { players: true },
  });

  await prisma.wager.create({
    data: {
      matchId: upcoming.id,
      userId: users[3].id,
      pickedPlayerId: upcoming.players[1].id,
    },
  });
  await prisma.wager.create({
    data: {
      matchId: upcoming.id,
      userId: users[2].id,
      pickedPlayerId: upcoming.players[0].id,
    },
  });

  // Live match — partially played
  const live = await prisma.match.create({
    data: {
      courseName: "Bethpage Black",
      scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      holes: 18,
      status: "IN_PROGRESS",
      createdById: users[1].id,
      players: {
        create: [
          { displayName: "Rory", handicap: 6, seat: 0, userId: users[1].id },
          { displayName: "Morikawa", handicap: 7, seat: 1, userId: users[3].id },
        ],
      },
    },
    include: { players: true },
  });

  // Fake first 6 holes — Rory leading
  const roryScores = [4, 5, 3, 4, 4, 5];
  const collinScores = [5, 4, 4, 5, 4, 6];
  for (let i = 0; i < 6; i++) {
    await prisma.scoreEntry.create({
      data: {
        matchPlayerId: live.players[0].id,
        hole: i + 1,
        strokes: roryScores[i],
      },
    });
    await prisma.scoreEntry.create({
      data: {
        matchPlayerId: live.players[1].id,
        hole: i + 1,
        strokes: collinScores[i],
      },
    });
  }

  // A few wagers on the live one
  for (const u of [users[0], users[2]]) {
    await prisma.wager.create({
      data: {
        matchId: live.id,
        userId: u.id,
        pickedPlayerId: live.players[0].id,
      },
    });
  }

  // Take some snapshots so the chart is populated.
  const liveSnapshots: { matchPlayerId: string; probability: number; t: number }[] =
    [
      { matchPlayerId: live.players[0].id, probability: 0.5, t: -90 },
      { matchPlayerId: live.players[1].id, probability: 0.5, t: -90 },
      { matchPlayerId: live.players[0].id, probability: 0.58, t: -75 },
      { matchPlayerId: live.players[1].id, probability: 0.42, t: -75 },
      { matchPlayerId: live.players[0].id, probability: 0.62, t: -55 },
      { matchPlayerId: live.players[1].id, probability: 0.38, t: -55 },
      { matchPlayerId: live.players[0].id, probability: 0.7, t: -30 },
      { matchPlayerId: live.players[1].id, probability: 0.3, t: -30 },
    ];
  for (const s of liveSnapshots) {
    await prisma.oddsSnapshot.create({
      data: {
        matchId: live.id,
        matchPlayerId: s.matchPlayerId,
        probability: s.probability,
        createdAt: new Date(Date.now() + s.t * 60 * 1000),
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
