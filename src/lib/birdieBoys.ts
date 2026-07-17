// Birdie Boys launch tournament -- the fixed, publicly-linkable event
// behind /birdie-boys. Details mirror the flyer. The tournament row is
// looked up by its slug; ensureBirdieBoysTournament() creates it on
// first use (seed script or first registrant) so the sign-up page never
// dead-ends on an unseeded DB.

import { prisma } from "./db";
import { generateInviteCode } from "./groups";

export const BIRDIE_BOYS = {
  slug: "birdie-boys",
  name: "Birdie Boys — 2nd Annual",
  scoringMode: "NET" as const,
  roundsPlanned: 1,
  format: "2-Man Best Ball",
  venue: "Goose Creek Golf Club",
  address: "11418 68th Street, Jurupa Valley, CA 91752",
  dateLabel: "August 23, 2026 · 10:00 AM",
  // Pacific Daylight Time (UTC-7) in late August.
  startsAtISO: "2026-08-23T10:00:00-07:00",
} as const;

/** The launch tournament + its roster, or null if not seeded yet. */
export async function getBirdieBoysTournament() {
  return prisma.tournament.findFirst({
    where: { slug: BIRDIE_BOYS.slug },
    orderBy: { createdAt: "asc" },
    include: { roster: { orderBy: { createdAt: "asc" } } },
  });
}

/**
 * Resolve who should OWN the tournament (the creator -- the only one who
 * can Finish/Delete it). Prefers the BIRDIE_BOYS_OWNER env var (a
 * username or email of the admin running the event) so a random early
 * registrant can never end up owning it. Falls back to `fallbackId`
 * (the current registrant) only when no owner is configured/resolvable,
 * which keeps local/dev testing working.
 */
async function resolveOwnerId(fallbackId: string): Promise<string> {
  const who = process.env.BIRDIE_BOYS_OWNER?.trim();
  if (who) {
    const owner = await prisma.user.findFirst({
      where: who.includes("@")
        ? { email: who.toLowerCase() }
        : { username: who },
      select: { id: true },
    });
    if (owner) return owner.id;
  }
  return fallbackId;
}

/**
 * Find-or-create the launch tournament. The creator (its only admin) is
 * resolved via resolveOwnerId -- NOT the current registrant unless no
 * BIRDIE_BOYS_OWNER is configured. Safe to call on every registration.
 */
export async function ensureBirdieBoysTournament(fallbackCreatorId: string) {
  const existing = await getBirdieBoysTournament();
  if (existing) return existing;

  const createdById = await resolveOwnerId(fallbackCreatorId);

  // Mint a share code too, so the standard /tournaments/join?code= path
  // works for this tournament as well. Retry on the (rare) collision.
  let inviteCode = generateInviteCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await prisma.tournament.findFirst({
      where: { inviteCode },
      select: { id: true },
    });
    if (!clash) break;
    inviteCode = generateInviteCode();
  }

  await prisma.tournament.create({
    data: {
      name: BIRDIE_BOYS.name,
      slug: BIRDIE_BOYS.slug,
      inviteCode,
      scoringMode: BIRDIE_BOYS.scoringMode,
      roundsPlanned: BIRDIE_BOYS.roundsPlanned,
      scheduledStartAt: new Date(BIRDIE_BOYS.startsAtISO),
      notes: `${BIRDIE_BOYS.format} · ${BIRDIE_BOYS.venue}`,
      createdById,
    },
  });
  // Re-read with the roster include for a consistent return shape.
  return (await getBirdieBoysTournament())!;
}
