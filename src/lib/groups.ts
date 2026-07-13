import { cookies } from "next/headers";
import { prisma } from "./db";

const GROUP_COOKIE = "fm_group";

// Empty string = "All my groups + public" (default).
// "public"     = "Public matches only" (matches with no groupId).
// <groupId>    = "Only this group's matches".
export type GroupFilter = "" | "public" | string;

export function getActiveGroupId(): GroupFilter {
  return cookies().get(GROUP_COOKIE)?.value ?? "";
}

export function setActiveGroupCookie(value: GroupFilter) {
  if (!value) {
    cookies().delete(GROUP_COOKIE);
    return;
  }
  cookies().set(GROUP_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function listUserGroups(userId: string) {
  try {
    return await prisma.group.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { members: true, matches: true } },
        // First few members for the group card's avatar stack --
        // initials chips only, so display names are all we need.
        members: {
          orderBy: { joinedAt: "asc" },
          take: 4,
          select: {
            user: { select: { displayName: true, username: true } },
          },
        },
      },
    });
  } catch {
    // If the Group table isn't there yet (mid-deploy or unmigrated DB),
    // degrade gracefully rather than 500ing every page.
    return [];
  }
}

// Code is 6 chars, uppercase alphanumeric without easily-confused glyphs
// (no 0/O/1/I). Six chars over 32-char alphabet is ~1B combinations.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// URL-safe slug from a group's display name. Lowercase, dashes for spaces,
// strip everything else. Capped at 32 chars. Empty result falls back to "g".
export function slugifyGroupName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return base || "g";
}

// Find the lowest unused slug starting from `base`. Tries `base`, then
// `base-2`, `base-3`, etc. Caller wraps the eventual insert in a try/catch
// in case of a race; the unique constraint is the source of truth.
export async function uniqueGroupSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  // Bounded loop: practically returns on the first or second try.
  while (n < 1000) {
    const existing = await prisma.group.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${n++}`;
  }
  // Fallback if a name is somehow catastrophically common: append a
  // chunk of the invite-code alphabet for entropy.
  return `${base}-${generateInviteCode().toLowerCase()}`;
}

// Look up a group by either its cuid or its slug. Backfills the slug
// lazily so groups created before slugs existed don't stay null forever.
export async function findGroupByIdOrSlug(identifier: string) {
  if (!identifier) return null;
  const group = await prisma.group.findFirst({
    where: { OR: [{ id: identifier }, { slug: identifier }] },
  });
  if (!group) return null;
  if (group.slug) return group;
  // Backfill on read. Race-safe: another concurrent request may win the
  // update; we re-read and use whichever slug landed.
  const slug = await uniqueGroupSlug(slugifyGroupName(group.name));
  try {
    return await prisma.group.update({
      where: { id: group.id },
      data: { slug },
    });
  } catch {
    const fresh = await prisma.group.findUnique({ where: { id: group.id } });
    return fresh ?? group;
  }
}

// Returns a Prisma `where` clause restricting Match results to what the user
// should see given their active group filter.
//
// - "" (default): public matches + any match in / linked-into one of the
//                 user's groups
// - "public":     only matches with groupId == null
// - <groupId>:    matches posted to that group OR any match with a player
//                 who's a member of that group ("cross-group visibility").
//                 Requires user to be a member of <groupId>.
//
// Cross-group visibility: a match posted to Big Dogs with T-Bone (a Birdie
// Boy) as a player appears in the Birdie Boys feed too. Privacy implication
// accepted: matches leak across groups via shared players.
//
// Note: SQL `IN (NULL, ...)` does NOT match NULL rows because NULL is never
// equal to anything in three-valued logic, so we use `OR` to combine null
// matches with group-id matches.
// Loosely typed since the Prisma where types are large; the runtime shapes
// we build below are valid against `Prisma.MatchWhereInput`.
type MatchWhere = Record<string, unknown>;

// Default feed scope: public + all groups the user is in + cross-group
// matches that include any player who's a member of one of those groups.
async function defaultVisibleWhere(userId: string): Promise<MatchWhere> {
  let groupIds: string[] = [];
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    groupIds = memberships.map((m) => m.groupId);
  } catch {
    return { groupId: null };
  }
  if (groupIds.length === 0) return { groupId: null };
  return {
    OR: [
      { groupId: null },
      { groupId: { in: groupIds } },
      {
        players: {
          some: {
            user: {
              groupMemberships: {
                some: { groupId: { in: groupIds } },
              },
            },
          },
        },
      },
    ],
  };
}

export async function visibleMatchWhere(
  userId: string | null,
  filter: GroupFilter,
): Promise<MatchWhere> {
  if (filter === "public") {
    return { groupId: null };
  }

  if (filter && filter !== "public") {
    if (!userId) return { groupId: null };
    try {
      const isMember = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: filter, userId } },
      });
      // Stale / invalid group selection (a group the user left, that was
      // deleted, or a cookie left over from another account on this
      // browser) must NOT collapse the feed to public-only -- that hides
      // every grouped round the user actually has. Fall back to their
      // normal feed instead.
      if (!isMember) return defaultVisibleWhere(userId);
      // Cross-group visibility: any match posted to <filter>, OR any match
      // with at least one player linked to a user who's a member of <filter>.
      return {
        OR: [
          { groupId: filter },
          {
            players: {
              some: {
                user: {
                  groupMemberships: { some: { groupId: filter } },
                },
              },
            },
          },
        ],
      };
    } catch {
      return defaultVisibleWhere(userId);
    }
  }

  // Default: public + all groups the user is in + cross-group matches.
  if (!userId) return { groupId: null };
  return defaultVisibleWhere(userId);
}

// Match-detail access gate. Returns true if the signed-in user is allowed
// to view a match -- mirrors the cross-group visibility rules so anyone
// who can see the match in their feed can also open the detail page.
export async function canViewMatch(
  userId: string | null,
  match: {
    groupId: string | null;
    players: { userId: string | null }[];
  },
): Promise<boolean> {
  // Public matches are open to anyone signed in.
  if (!match.groupId) return true;
  if (!userId) return false;

  // Direct membership of the match's posted-to group.
  const direct = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: match.groupId, userId } },
  });
  if (direct) return true;

  // Cross-group: any group the viewer shares with a player in the match.
  const playerUserIds = match.players
    .map((p) => p.userId)
    .filter((id): id is string => !!id);
  if (playerUserIds.length === 0) return false;

  // Find a shared group: any group the viewer is in that has at least one
  // member who's a player in this match.
  const sharedMembership = await prisma.groupMember.findFirst({
    where: {
      userId,
      group: {
        members: { some: { userId: { in: playerUserIds } } },
      },
    },
    select: { groupId: true },
  });
  return !!sharedMembership;
}
