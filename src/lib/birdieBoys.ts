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
 * Look up the admin configured via the BIRDIE_BOYS_OWNER env var (a
 * username or email). Returns null when the var is unset or points at an
 * account that doesn't exist yet.
 */
async function findConfiguredOwnerId(): Promise<string | null> {
  const who = process.env.BIRDIE_BOYS_OWNER?.trim();
  if (!who) return null;
  const owner = await prisma.user.findFirst({
    where: who.includes("@")
      ? { email: who.toLowerCase() }
      : { username: who },
    select: { id: true },
  });
  return owner?.id ?? null;
}

/**
 * Resolve who should OWN the tournament (the creator -- the only one who
 * can Finish/Delete/remove players). Prefers the BIRDIE_BOYS_OWNER env
 * var (a username or email of the admin running the event) so a random
 * early registrant can never end up owning it. Falls back to
 * `fallbackId` (the current registrant) only when no owner is
 * configured/resolvable, which keeps local/dev testing working.
 */
async function resolveOwnerId(fallbackId: string): Promise<string> {
  return (await findConfiguredOwnerId()) ?? fallbackId;
}

/**
 * Transfer ownership of the EXISTING tournament to the configured
 * BIRDIE_BOYS_OWNER when it differs. Ownership is normally only stamped
 * at creation, so this lets the admin be set (or corrected) after the
 * fact: point the env var at your account, and the next page load /
 * registration re-homes the tournament to you. No-op when the var is
 * unset, unresolvable, or already correct -- so it's safe to call on
 * every render.
 */
export async function reconcileBirdieBoysOwner(): Promise<void> {
  const ownerId = await findConfiguredOwnerId();
  if (!ownerId) return;
  const t = await prisma.tournament.findFirst({
    where: { slug: BIRDIE_BOYS.slug },
    select: { id: true, createdById: true },
  });
  if (!t || t.createdById === ownerId) return;
  await prisma.tournament.update({
    where: { id: t.id },
    data: { createdById: ownerId },
  });
}

/**
 * Find-or-create the launch tournament. The creator (its only admin) is
 * resolved via resolveOwnerId -- NOT the current registrant unless no
 * BIRDIE_BOYS_OWNER is configured. Safe to call on every registration.
 */
export async function ensureBirdieBoysTournament(fallbackCreatorId: string) {
  const existing = await getBirdieBoysTournament();
  if (existing) {
    // Keep ownership pinned to the configured admin even if the row was
    // created by an early registrant before BIRDIE_BOYS_OWNER was set.
    await reconcileBirdieBoysOwner();
    // Backfill the pinned course on a tournament created before the
    // courseName column existed, so round-start preloads Goose Creek.
    if (!existing.courseName) {
      await prisma.tournament.update({
        where: { id: existing.id },
        data: { courseName: BIRDIE_BOYS.venue },
      });
      existing.courseName = BIRDIE_BOYS.venue;
    }
    return existing;
  }

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
      // Pin the venue so every tournament round opens on Goose Creek
      // without the player having to pick a course. Must match the
      // course-preset name exactly (see src/lib/courses.ts).
      courseName: BIRDIE_BOYS.venue,
      scheduledStartAt: new Date(BIRDIE_BOYS.startsAtISO),
      notes: `${BIRDIE_BOYS.format} · ${BIRDIE_BOYS.venue}`,
      createdById,
    },
  });
  // Re-read with the roster include for a consistent return shape.
  return (await getBirdieBoysTournament())!;
}
